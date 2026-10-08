use gst::prelude::*;
use gstreamer as gst;
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};

static PLAYER: Mutex<Option<LocalPlayer>> = Mutex::new(None);

struct LocalPlayer {
    playbin: gst::Element,
    next_uri: Arc<Mutex<Option<String>>>,
    track_uri: String,
    volume: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStatus {
    state: String,
    track_uri: String,
    position_sec: f64,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn make_element(factory: &str) -> Result<gst::Element, String> {
    gst::ElementFactory::make(factory)
        .build()
        .map_err(|e| format!("Failed to create {factory}: {e}"))
}

impl LocalPlayer {
    fn new() -> Result<Self, String> {
        gst::init().map_err(|e| format!("Failed to initialize GStreamer: {e}"))?;
        let playbin = make_element("playbin")?;
        playbin.set_property("audio-sink", make_element("autoaudiosink")?);
        playbin.set_property("video-sink", make_element("fakesink")?);

        let next_uri = Arc::new(Mutex::new(None::<String>));
        let queued = Arc::clone(&next_uri);
        // Runs on a streaming thread: it must never touch PLAYER, only the shared next_uri slot
        playbin.connect("about-to-finish", false, move |args| {
            let Some(uri) = lock(&queued).take() else {
                return None;
            };
            if let Some(Ok(playbin)) = args.first().map(|value| value.get::<gst::Element>()) {
                playbin.set_property("uri", uri.as_str());
            }
            None
        });

        Ok(Self {
            playbin,
            next_uri,
            track_uri: String::new(),
            volume: 100,
        })
    }

    fn set_state(&self, state: gst::State) -> Result<(), String> {
        self.playbin
            .set_state(state)
            .map(|_| ())
            .map_err(|e| format!("Failed to set local player to {state:?}: {e}"))
    }

    fn transition(&self, state: gst::State) -> Result<(), String> {
        let (_, current, pending) = self.playbin.state(gst::ClockTime::ZERO);
        if current == gst::State::Null && pending == gst::State::VoidPending {
            return Ok(());
        }
        self.set_state(state)
    }

    fn set_next(&self, uri: Option<String>) {
        *lock(&self.next_uri) = uri;
    }

    fn halt(&mut self) {
        let _ = self.playbin.set_state(gst::State::Null);
        self.set_next(None);
    }

    fn play(&mut self, uri: &str) -> Result<(), String> {
        self.set_state(gst::State::Null)?;
        self.set_next(None);
        self.track_uri.clear();
        self.playbin.set_property("uri", uri);
        self.set_state(gst::State::Playing)
    }

    fn stop(&mut self) {
        self.halt();
        self.track_uri.clear();
    }

    fn set_volume(&mut self, level: u32) {
        self.volume = level.min(100);
        let linear = (self.volume as f64 / 100.0).powi(3);
        self.playbin.set_property("volume", linear);
    }

    fn drain_bus(&mut self) {
        let Some(bus) = self.playbin.bus() else {
            return;
        };
        let types = [
            gst::MessageType::Eos,
            gst::MessageType::Error,
            gst::MessageType::StreamStart,
        ];
        while let Some(message) = bus.pop_filtered(&types) {
            match message.view() {
                // current-uri switches before the previous track's tail is rendered; stream-start marks the audible switch
                gst::MessageView::StreamStart(_) => {
                    self.track_uri = self
                        .playbin
                        .property::<Option<String>>("current-uri")
                        .unwrap_or_default();
                }
                gst::MessageView::Error(err) => {
                    eprintln!(
                        "[local_player] {} ({})",
                        err.error(),
                        err.debug().map(|d| d.to_string()).unwrap_or_default()
                    );
                    self.halt();
                }
                _ => self.halt(),
            }
        }
    }

    fn status(&mut self) -> LocalStatus {
        self.drain_bus();
        let (_, current, pending) = self.playbin.state(gst::ClockTime::ZERO);
        let state = renderer_state(current, pending);
        let position_sec = self
            .playbin
            .query_position::<gst::ClockTime>()
            .map(|position| position.mseconds() as f64 / 1000.0)
            .unwrap_or(0.0);
        LocalStatus {
            state: state.to_string(),
            track_uri: self.track_uri.clone(),
            position_sec,
        }
    }
}

fn renderer_state(current: gst::State, pending: gst::State) -> &'static str {
    if pending == gst::State::Playing {
        return "TRANSITIONING";
    }
    match current {
        gst::State::Playing => "PLAYING",
        gst::State::Paused => "PAUSED_PLAYBACK",
        _ => "STOPPED",
    }
}

fn with_player<T>(action: impl FnOnce(&mut LocalPlayer) -> Result<T, String>) -> Result<T, String> {
    let mut guard = lock(&PLAYER);
    if guard.is_none() {
        *guard = Some(LocalPlayer::new()?);
    }
    match guard.as_mut() {
        Some(player) => action(player),
        None => Err("Local player unavailable".to_string()),
    }
}

async fn run<T: Send + 'static>(
    action: impl FnOnce(&mut LocalPlayer) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || with_player(action))
        .await
        .map_err(|e| format!("Local player task failed: {e}"))?
}

#[tauri::command]
pub async fn local_play(uri: String) -> Result<(), String> {
    run(move |player| player.play(&uri)).await
}

#[tauri::command]
pub async fn local_set_next(uri: Option<String>) -> Result<(), String> {
    run(move |player| {
        player.set_next(uri);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_pause() -> Result<(), String> {
    run(|player| player.transition(gst::State::Paused)).await
}

#[tauri::command]
pub async fn local_resume() -> Result<(), String> {
    run(|player| player.transition(gst::State::Playing)).await
}

#[tauri::command]
pub async fn local_stop() -> Result<(), String> {
    run(|player| {
        player.stop();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_get_status() -> Result<LocalStatus, String> {
    run(|player| Ok(player.status())).await
}

#[tauri::command]
pub async fn local_set_volume(level: u32) -> Result<(), String> {
    run(move |player| {
        player.set_volume(level);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_get_volume() -> Result<u32, String> {
    run(|player| Ok(player.volume)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renderer_state_matches_upnp_transport_states() {
        use gst::State::*;
        assert_eq!(renderer_state(Paused, Playing), "TRANSITIONING");
        assert_eq!(renderer_state(Ready, Playing), "TRANSITIONING");
        assert_eq!(renderer_state(Playing, VoidPending), "PLAYING");
        assert_eq!(renderer_state(Paused, VoidPending), "PAUSED_PLAYBACK");
        assert_eq!(renderer_state(Ready, VoidPending), "STOPPED");
        assert_eq!(renderer_state(Null, VoidPending), "STOPPED");
    }
}
