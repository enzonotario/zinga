use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{broadcast, Mutex};

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

pub struct RemoteState {
    pub paired_devices: Mutex<HashMap<String, PairedDevice>>,
    pub pairing_code: Mutex<Option<PairingCode>>,
    pub tidal_token: Mutex<Option<String>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub host_ip: Mutex<Option<String>>,
    pub server_running: Mutex<bool>,
    pub shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub discovery_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub app_handle: Mutex<Option<tauri::AppHandle>>,
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
            shutdown_tx: Mutex::new(None),
            discovery_shutdown_tx: Mutex::new(None),
            app_handle: Mutex::new(None),
        })
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

        let mut devices = self.paired_devices.lock().await;
        devices.insert(device.id.clone(), device.clone());

        self.emit_event("remote:device_paired", &device).await;

        Some(device)
    }
}
