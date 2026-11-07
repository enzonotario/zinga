use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

#[cfg(target_os = "linux")]
const CHECK_INTERVAL: Duration = Duration::from_secs(10);
const UNRESPONSIVE_LIMIT: u32 = 3;
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);
const LOAD_GRACE: Duration = Duration::from_secs(90);
const RELOAD_INTERVAL: Duration = Duration::from_secs(60);
pub const MAIN_WEBVIEW: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReloadReason {
    WebProcessGone,
    HeartbeatStale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
    Idle,
    TerminateWebProcess,
    Reload(ReloadReason),
}

#[derive(Debug)]
struct Monitor {
    unresponsive_checks: u32,
    last_heartbeat: Option<Instant>,
    loaded_at: Instant,
    last_reload: Option<Instant>,
    reload_pending: bool,
}

impl Monitor {
    fn new(now: Instant) -> Self {
        Self {
            unresponsive_checks: 0,
            last_heartbeat: None,
            loaded_at: now,
            last_reload: None,
            reload_pending: false,
        }
    }

    fn heartbeat(&mut self, now: Instant) {
        self.last_heartbeat = Some(now);
    }

    // The heartbeat check stays disarmed until the new page reports in, so a page that never sends
    // heartbeats (remote-client mode) is not reloaded in a loop.
    fn page_load_started(&mut self, now: Instant) {
        self.loaded_at = now;
        self.last_heartbeat = None;
        self.unresponsive_checks = 0;
    }

    fn can_reload(&self, now: Instant) -> bool {
        self.last_reload
            .is_none_or(|at| now.saturating_duration_since(at) >= RELOAD_INTERVAL)
    }

    fn heartbeat_stale(&self, now: Instant) -> bool {
        let Some(last) = self.last_heartbeat else {
            return false;
        };
        now.saturating_duration_since(self.loaded_at) >= LOAD_GRACE
            && now.saturating_duration_since(last) > HEARTBEAT_TIMEOUT
    }

    fn take_reload(&mut self, now: Instant) -> bool {
        if !self.can_reload(now) {
            return false;
        }
        self.last_reload = Some(now);
        self.reload_pending = false;
        self.unresponsive_checks = 0;
        self.loaded_at = now;
        true
    }

    fn web_process_terminated(&mut self, now: Instant) -> bool {
        self.reload_pending = true;
        self.take_reload(now)
    }

    fn check(&mut self, now: Instant, responsive: bool) -> Action {
        self.unresponsive_checks = if responsive {
            0
        } else {
            self.unresponsive_checks + 1
        };
        if self.reload_pending && self.take_reload(now) {
            return Action::Reload(ReloadReason::WebProcessGone);
        }
        if self.unresponsive_checks >= UNRESPONSIVE_LIMIT && self.can_reload(now) {
            self.unresponsive_checks = 0;
            return Action::TerminateWebProcess;
        }
        if self.heartbeat_stale(now) && self.take_reload(now) {
            return Action::Reload(ReloadReason::HeartbeatStale);
        }
        Action::Idle
    }
}

pub struct Watchdog(Arc<Mutex<Monitor>>);

impl Default for Watchdog {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(Monitor::new(Instant::now()))))
    }
}

fn lock(monitor: &Mutex<Monitor>) -> MutexGuard<'_, Monitor> {
    monitor
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[tauri::command]
pub fn frontend_heartbeat(watchdog: tauri::State<'_, Watchdog>) {
    lock(&watchdog.0).heartbeat(Instant::now());
}

pub fn page_load_started(watchdog: &Watchdog) {
    lock(&watchdog.0).page_load_started(Instant::now());
}

#[cfg(target_os = "linux")]
pub fn start(app: &tauri::AppHandle) {
    use tauri::Manager;
    use webkit2gtk::WebViewExt;

    let Some(window) = app.get_webview_window(MAIN_WEBVIEW) else {
        eprintln!("[Watchdog] main webview not found, watchdog disabled");
        return;
    };
    let monitor = Arc::clone(&app.state::<Watchdog>().0);

    let on_terminated = Arc::clone(&monitor);
    let connected = window.with_webview(move |webview| {
        webview
            .inner()
            .connect_web_process_terminated(move |view, reason| {
                eprintln!("[Watchdog] web process terminated: {reason:?}");
                let reload = lock(&on_terminated).web_process_terminated(Instant::now());
                if reload {
                    view.reload();
                } else {
                    eprintln!("[Watchdog] reload deferred by rate limit");
                }
            });
    });
    if let Err(err) = connected {
        eprintln!("[Watchdog] failed to watch the web process: {err}");
    }

    let spawned = std::thread::Builder::new()
        .name("zinga-watchdog".to_string())
        .spawn(move || loop {
            std::thread::sleep(CHECK_INTERVAL);
            let monitor = Arc::clone(&monitor);
            let checked = window.with_webview(move |webview| {
                let view = webview.inner();
                let action = lock(&monitor).check(Instant::now(), view.is_web_process_responsive());
                match action {
                    Action::Idle => {}
                    Action::TerminateWebProcess => {
                        eprintln!(
                            "[Watchdog] web process unresponsive for {UNRESPONSIVE_LIMIT} checks, terminating it"
                        );
                        view.terminate_web_process();
                    }
                    Action::Reload(ReloadReason::WebProcessGone) => {
                        eprintln!("[Watchdog] reloading after web process termination");
                        view.reload();
                    }
                    Action::Reload(ReloadReason::HeartbeatStale) => {
                        eprintln!(
                            "[Watchdog] no frontend heartbeat for {}s, reloading",
                            HEARTBEAT_TIMEOUT.as_secs()
                        );
                        view.reload();
                    }
                }
            });
            if let Err(err) = checked {
                eprintln!("[Watchdog] webview check failed: {err}");
            }
        });
    if let Err(err) = spawned {
        eprintln!("[Watchdog] failed to start watchdog thread: {err}");
    }
}

#[cfg(not(target_os = "linux"))]
pub fn start(_app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn terminates_after_three_consecutive_unresponsive_checks() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        assert_eq!(monitor.check(t0 + secs(10), false), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(20), false), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(30), false),
            Action::TerminateWebProcess
        );
        assert_eq!(monitor.check(t0 + secs(40), false), Action::Idle);
    }

    #[test]
    fn a_responsive_check_resets_the_unresponsive_counter() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        monitor.check(t0 + secs(10), false);
        monitor.check(t0 + secs(20), false);
        assert_eq!(monitor.check(t0 + secs(30), true), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(40), false), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(50), false), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(60), false),
            Action::TerminateWebProcess
        );
    }

    #[test]
    fn termination_reloads_immediately_when_allowed() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        assert!(monitor.web_process_terminated(t0 + secs(5)));
        assert!(!monitor.reload_pending);
    }

    #[test]
    fn reloads_are_rate_limited_and_deferred_reloads_run_later() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        assert!(monitor.web_process_terminated(t0));
        assert!(!monitor.web_process_terminated(t0 + secs(30)));
        assert_eq!(monitor.check(t0 + secs(50), true), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(60), true),
            Action::Reload(ReloadReason::WebProcessGone)
        );
        assert_eq!(monitor.check(t0 + secs(70), true), Action::Idle);
    }

    #[test]
    fn does_not_terminate_while_a_reload_would_be_rate_limited() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        assert!(monitor.web_process_terminated(t0));
        monitor.page_load_started(t0);
        assert_eq!(monitor.check(t0 + secs(10), false), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(20), false), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(30), false), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(60), false),
            Action::TerminateWebProcess
        );
    }

    #[test]
    fn heartbeat_check_is_disarmed_until_the_page_reports_in() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        assert_eq!(monitor.check(t0 + secs(600), true), Action::Idle);
    }

    #[test]
    fn stale_heartbeat_reloads_after_the_grace_period() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        monitor.heartbeat(t0 + secs(5));
        assert_eq!(monitor.check(t0 + secs(60), true), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(66), true), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(90), true),
            Action::Reload(ReloadReason::HeartbeatStale)
        );
    }

    #[test]
    fn fresh_heartbeats_keep_the_page_alive() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        for n in 1..40 {
            monitor.heartbeat(t0 + secs(n * 15));
            assert_eq!(monitor.check(t0 + secs(n * 15 + 10), true), Action::Idle);
        }
    }

    #[test]
    fn page_load_restarts_the_grace_period_and_disarms_until_the_next_heartbeat() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        monitor.heartbeat(t0 + secs(100));
        monitor.page_load_started(t0 + secs(200));
        assert_eq!(monitor.check(t0 + secs(260), true), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(295), true), Action::Idle);

        monitor.heartbeat(t0 + secs(300));
        assert_eq!(monitor.check(t0 + secs(330), true), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(361), true),
            Action::Reload(ReloadReason::HeartbeatStale)
        );
    }

    #[test]
    fn stale_heartbeat_retries_at_most_once_per_interval_while_the_page_stays_silent() {
        let t0 = Instant::now();
        let mut monitor = Monitor::new(t0);
        monitor.heartbeat(t0);
        assert_eq!(
            monitor.check(t0 + secs(100), true),
            Action::Reload(ReloadReason::HeartbeatStale)
        );
        assert_eq!(monitor.check(t0 + secs(150), true), Action::Idle);
        assert_eq!(monitor.check(t0 + secs(180), true), Action::Idle);
        assert_eq!(
            monitor.check(t0 + secs(190), true),
            Action::Reload(ReloadReason::HeartbeatStale)
        );
    }
}
