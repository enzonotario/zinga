use std::fs;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use super::REMOTE_SERVER_PORT;

pub fn looks_like_zinga(comm: &str, exe_name: Option<&str>) -> bool {
    let comm = comm.trim().to_ascii_lowercase();
    if comm.starts_with("zinga") {
        return true;
    }
    exe_name
        .map(|name| name.to_ascii_lowercase().starts_with("zinga"))
        .unwrap_or(false)
}

pub fn close_other_instances() -> Result<u32, String> {
    let self_pid = std::process::id();
    let pids = other_zinga_pids(self_pid);
    if pids.is_empty() {
        return Ok(0);
    }
    for pid in &pids {
        signal(*pid, "-TERM");
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        let alive = pids
            .iter()
            .any(|pid| Path::new(&format!("/proc/{pid}")).exists());
        if !alive && !port_in_use(REMOTE_SERVER_PORT) {
            return Ok(pids.len() as u32);
        }
        thread::sleep(Duration::from_millis(100));
    }
    for pid in &pids {
        if Path::new(&format!("/proc/{pid}")).exists() {
            signal(*pid, "-KILL");
        }
    }
    thread::sleep(Duration::from_millis(200));
    Ok(pids.len() as u32)
}

fn other_zinga_pids(self_pid: u32) -> Vec<u32> {
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    let mut pids = Vec::new();
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        else {
            continue;
        };
        if pid == self_pid || shares_process_tree(pid, self_pid) || !process_is_zinga(pid) {
            continue;
        }
        pids.push(pid);
    }
    pids
}

fn process_is_zinga(pid: u32) -> bool {
    let comm = fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default();
    let exe_name = fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .and_then(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().into_owned())
        });
    looks_like_zinga(&comm, exe_name.as_deref())
}

fn shares_process_tree(pid: u32, self_pid: u32) -> bool {
    if pid == self_pid {
        return true;
    }
    let mut current = pid;
    for _ in 0..64 {
        let Some(parent) = parent_pid(current) else {
            break;
        };
        if parent == self_pid {
            return true;
        }
        if parent <= 1 {
            break;
        }
        current = parent;
    }
    let mut current = self_pid;
    for _ in 0..64 {
        let Some(parent) = parent_pid(current) else {
            return false;
        };
        if parent == pid {
            return true;
        }
        if parent <= 1 {
            return false;
        }
        current = parent;
    }
    false
}

fn parent_pid(pid: u32) -> Option<u32> {
    let status = fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("PPid:") {
            return rest.trim().parse().ok();
        }
    }
    None
}

fn signal(pid: u32, signal: &str) {
    let _ = Command::new("kill")
        .args([signal, &pid.to_string()])
        .status();
}

fn port_in_use(port: u16) -> bool {
    match std::net::TcpListener::bind(("0.0.0.0", port)) {
        Ok(listener) => {
            drop(listener);
            false
        }
        Err(error) => error.kind() == std::io::ErrorKind::AddrInUse,
    }
}

#[cfg(test)]
mod tests {
    use super::looks_like_zinga;

    #[test]
    fn matches_zinga_process_names() {
        assert!(looks_like_zinga("zinga", None));
        assert!(looks_like_zinga("Zinga_0.0.1_amd", None));
        assert!(looks_like_zinga("AppRun", Some("zinga")));
        assert!(!looks_like_zinga("ffmpeg", None));
        assert!(!looks_like_zinga(
            "WebKitWebProces",
            Some("WebKitWebProcess")
        ));
    }
}
