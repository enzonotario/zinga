use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{broadcast, Mutex};

use super::command::RemoteCommand;

const REMOTE_COMMAND_EVENT: &str = "remote-command";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub token: String,
    pub paired_at: u64,
}

#[derive(Debug, Clone)]
pub struct PairingCode {
    pub code: String,
    pub created_at: std::time::Instant,
    pub used: bool,
}

impl PairingCode {
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > std::time::Duration::from_secs(300)
    }

    pub fn is_valid(&self) -> bool {
        !self.used && !self.is_expired()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum BroadcastMessage {
    PlaybackState(serde_json::Value),
    QueueUpdated(serde_json::Value),
    DeviceChanged(serde_json::Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerStatus {
    pub running: bool,
    pub ip: String,
    pub port: u16,
    pub pairing_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RemotePersistFile {
    enabled: bool,
    devices: Vec<PairedDevice>,
}

pub struct RemoteState {
    pub paired_devices: Mutex<HashMap<String, PairedDevice>>,
    pub pairing_code: Mutex<Option<PairingCode>>,
    pub tidal_token: Mutex<Option<String>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub host_ip: Mutex<Option<String>>,
    pub server_running: Mutex<bool>,
    pub enabled: Mutex<bool>,
    pub persist_path: Mutex<Option<PathBuf>>,
    pub shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub discovery_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub app_handle: Mutex<Option<tauri::AppHandle>>,
    pub playback_snapshot: Mutex<serde_json::Value>,
    pub queue_snapshot: Mutex<serde_json::Value>,
    pub devices_snapshot: Mutex<serde_json::Value>,
}

pub fn initial_playback_snapshot() -> serde_json::Value {
    serde_json::json!({ "state": "stopped", "position": 0, "track": null })
}

pub fn playback_message(playback: &serde_json::Value) -> String {
    serde_json::to_string(&BroadcastMessage::PlaybackState(playback.clone())).unwrap_or_default()
}

pub fn queue_message(queue: &serde_json::Value) -> String {
    serde_json::to_string(&BroadcastMessage::QueueUpdated(
        serde_json::json!({ "tracks": queue }),
    ))
    .unwrap_or_default()
}

pub fn initial_devices_snapshot() -> serde_json::Value {
    serde_json::json!({ "devices": [], "selectedDeviceId": null, "volume": null })
}

pub fn devices_message(devices: &serde_json::Value) -> String {
    serde_json::to_string(&BroadcastMessage::DeviceChanged(devices.clone())).unwrap_or_default()
}

impl RemoteState {
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(128);
        Arc::new(Self {
            paired_devices: Mutex::new(HashMap::new()),
            pairing_code: Mutex::new(None),
            tidal_token: Mutex::new(None),
            broadcast_tx: tx,
            host_ip: Mutex::new(None),
            server_running: Mutex::new(false),
            enabled: Mutex::new(false),
            persist_path: Mutex::new(None),
            shutdown_tx: Mutex::new(None),
            discovery_shutdown_tx: Mutex::new(None),
            app_handle: Mutex::new(None),
            playback_snapshot: Mutex::new(initial_playback_snapshot()),
            queue_snapshot: Mutex::new(serde_json::json!([])),
            devices_snapshot: Mutex::new(initial_devices_snapshot()),
        })
    }

    pub async fn update_snapshots(
        &self,
        playback: Option<serde_json::Value>,
        queue: Option<serde_json::Value>,
        devices: Option<serde_json::Value>,
    ) {
        if let Some(queue) = queue {
            let mut current = self.queue_snapshot.lock().await;
            if *current != queue {
                let _ = self.broadcast_tx.send(queue_message(&queue));
                *current = queue;
            }
        }
        if let Some(playback) = playback {
            let _ = self.broadcast_tx.send(playback_message(&playback));
            *self.playback_snapshot.lock().await = playback;
        }
        if let Some(devices) = devices {
            let mut current = self.devices_snapshot.lock().await;
            if *current != devices {
                let _ = self.broadcast_tx.send(devices_message(&devices));
                *current = devices;
            }
        }
    }

    pub async fn snapshot_messages(&self) -> Vec<String> {
        vec![
            playback_message(&*self.playback_snapshot.lock().await),
            queue_message(&*self.queue_snapshot.lock().await),
            devices_message(&*self.devices_snapshot.lock().await),
        ]
    }

    pub async fn send_command(&self, command: RemoteCommand) -> Result<(), String> {
        let handle = self
            .app_handle
            .lock()
            .await
            .clone()
            .ok_or_else(|| "Zinga host is not available".to_string())?;
        handle
            .emit_to(MAIN_WINDOW_LABEL, REMOTE_COMMAND_EVENT, command)
            .map_err(|e| format!("Failed to forward remote command: {}", e))
    }

    pub async fn emit_event(&self, event: &str, payload: impl Serialize + Clone) {
        if let Some(handle) = self.app_handle.lock().await.as_ref() {
            let _ = handle.emit(event, payload);
        }
    }

    pub async fn is_valid_token(&self, token: &str) -> bool {
        let devices = self.paired_devices.lock().await;
        devices.values().any(|d| d.token == token)
    }

    pub async fn generate_pairing_code(&self) -> String {
        use rand::Rng;
        let code: String = rand::thread_rng().gen_range(100_000..999_999).to_string();

        let mut pairing = self.pairing_code.lock().await;
        *pairing = Some(PairingCode {
            code: code.clone(),
            created_at: std::time::Instant::now(),
            used: false,
        });
        code
    }

    pub async fn verify_pairing_code(&self, code: &str, device_name: &str) -> Option<PairedDevice> {
        let mut pairing = self.pairing_code.lock().await;
        let pairing_code = pairing.as_mut()?;

        if pairing_code.code != code || !pairing_code.is_valid() {
            return None;
        }

        pairing_code.used = true;

        let device = PairedDevice {
            id: uuid::Uuid::new_v4().to_string(),
            name: device_name.to_string(),
            token: uuid::Uuid::new_v4().to_string(),
            paired_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };

        {
            let mut devices = self.paired_devices.lock().await;
            devices.insert(device.id.clone(), device.clone());
        }

        self.emit_event("remote:device_paired", &device).await;
        self.save_persist().await;

        Some(device)
    }

    pub async fn is_enabled(&self) -> bool {
        *self.enabled.lock().await
    }

    pub async fn set_enabled(&self, enabled: bool) {
        *self.enabled.lock().await = enabled;
        self.save_persist().await;
    }

    pub async fn status(&self, port: u16) -> RemoteServerStatus {
        let running = *self.server_running.lock().await;
        let ip = self.host_ip.lock().await.clone().unwrap_or_default();
        let pairing_code = self
            .pairing_code
            .lock()
            .await
            .as_ref()
            .map(|code| code.code.clone())
            .unwrap_or_default();
        RemoteServerStatus {
            running,
            ip,
            port,
            pairing_code,
        }
    }

    pub async fn load_persist(&self, path: &Path) {
        *self.persist_path.lock().await = Some(path.to_path_buf());
        let Ok(data) = std::fs::read(path) else {
            return;
        };
        let Ok(file) = serde_json::from_slice::<RemotePersistFile>(&data) else {
            return;
        };
        *self.enabled.lock().await = file.enabled;
        let mut devices = self.paired_devices.lock().await;
        devices.clear();
        for device in file.devices {
            devices.insert(device.id.clone(), device);
        }
    }

    pub async fn save_persist(&self) {
        let Some(path) = self.persist_path.lock().await.clone() else {
            return;
        };
        let file = RemotePersistFile {
            enabled: *self.enabled.lock().await,
            devices: self.paired_devices.lock().await.values().cloned().collect(),
        };
        let Ok(data) = serde_json::to_vec_pretty(&file) else {
            return;
        };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let tmp = path.with_extension("tmp");
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let Ok(mut file) = options.open(&tmp) else {
            return;
        };
        use std::io::Write;
        if file.write_all(&data).is_err() {
            return;
        }
        drop(file);
        let _ = std::fs::rename(&tmp, &path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn playback_message_wraps_snapshot() {
        let snapshot = json!({
            "state": "playing",
            "position": 1200,
            "track": { "tlid": 3, "track": { "uri": "tidal:track:1", "name": "Song" } }
        });
        let parsed: serde_json::Value = serde_json::from_str(&playback_message(&snapshot)).unwrap();
        assert_eq!(
            parsed,
            json!({ "type": "playback_state", "data": snapshot })
        );
    }

    #[test]
    fn queue_message_wraps_tracks() {
        let queue = json!([{ "tlid": 1, "track": { "uri": "tidal:track:1", "name": "Song" } }]);
        let parsed: serde_json::Value = serde_json::from_str(&queue_message(&queue)).unwrap();
        assert_eq!(
            parsed,
            json!({ "type": "queue_updated", "data": { "tracks": queue } })
        );
    }

    #[tokio::test]
    async fn update_snapshots_broadcasts_queue_only_when_changed() {
        let state = RemoteState::new();
        let mut rx = state.broadcast_tx.subscribe();
        let queue = json!([{ "tlid": 1, "track": { "uri": "a", "name": "A" } }]);

        state
            .update_snapshots(None, Some(queue.clone()), None)
            .await;
        state
            .update_snapshots(None, Some(queue.clone()), None)
            .await;
        state
            .update_snapshots(Some(initial_playback_snapshot()), None, None)
            .await;

        assert_eq!(rx.recv().await.unwrap(), queue_message(&queue));
        assert_eq!(
            rx.recv().await.unwrap(),
            playback_message(&initial_playback_snapshot())
        );
        assert!(rx.try_recv().is_err());
        assert_eq!(*state.queue_snapshot.lock().await, queue);
    }

    #[tokio::test]
    async fn update_snapshots_broadcasts_devices_only_when_changed() {
        let state = RemoteState::new();
        let mut rx = state.broadcast_tx.subscribe();
        let devices = json!({
            "devices": [{ "id": "solo", "name": "Solo Uno" }],
            "selectedDeviceId": "solo",
            "volume": 16
        });

        state
            .update_snapshots(None, None, Some(devices.clone()))
            .await;
        state
            .update_snapshots(None, None, Some(devices.clone()))
            .await;

        assert_eq!(rx.recv().await.unwrap(), devices_message(&devices));
        assert!(rx.try_recv().is_err());
        assert_eq!(*state.devices_snapshot.lock().await, devices);
    }

    #[tokio::test]
    async fn persist_roundtrip_keeps_enabled_devices() {
        let path = std::env::temp_dir().join(format!("zinga-remote-{}.json", uuid::Uuid::new_v4()));
        let state = RemoteState::new();
        state.load_persist(&path).await;
        state.set_enabled(true).await;
        {
            let mut devices = state.paired_devices.lock().await;
            devices.insert(
                "device".into(),
                PairedDevice {
                    id: "device".into(),
                    name: "Remote".into(),
                    token: "token".into(),
                    paired_at: 1,
                },
            );
        }
        state.save_persist().await;

        let loaded = RemoteState::new();
        loaded.load_persist(&path).await;
        assert!(loaded.is_enabled().await);
        assert_eq!(
            loaded
                .paired_devices
                .lock()
                .await
                .get("device")
                .unwrap()
                .token,
            "token"
        );
        let _ = std::fs::remove_file(&path);
    }
}
