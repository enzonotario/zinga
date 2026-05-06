use serde::Serialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::oneshot;

use super::state::RemoteState;

const DISCOVERY_PORT: u16 = 9633;
const SERVER_PORT: u16 = 9632;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredServer {
    pub ip: String,
    pub port: u16,
    pub name: String,
}

pub async fn start_broadcast(state: Arc<RemoteState>) -> oneshot::Sender<()> {
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    tokio::spawn(async move {
        let socket = match UdpSocket::bind("0.0.0.0:0").await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Discovery broadcast: failed to bind socket: {}", e);
                return;
            }
        };

        if let Err(e) = socket.set_broadcast(true) {
            eprintln!("Discovery broadcast: failed to set broadcast: {}", e);
            return;
        }

        let dest: SocketAddr = ([255, 255, 255, 255], DISCOVERY_PORT).into();

        loop {
            let host_ip = state.host_ip.lock().await.clone().unwrap_or_default();
            let hostname = hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "Zinga".to_string());

            let message = serde_json::json!({
                "service": "zinga",
                "ip": host_ip,
                "port": SERVER_PORT,
                "name": hostname,
            });

            let _ = socket.send_to(message.to_string().as_bytes(), dest).await;

            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {}
                _ = &mut shutdown_rx => break,
            }
        }
    });

    shutdown_tx
}

pub async fn discover_servers(timeout_ms: u64) -> Vec<DiscoveredServer> {
    let socket = match create_discovery_socket().await {
        Some(s) => s,
        None => return vec![],
    };

    let mut servers: HashMap<String, DiscoveredServer> = HashMap::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let mut buf = [0u8; 1024];

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await {
            Ok(Ok((len, _addr))) => {
                if let Ok(text) = std::str::from_utf8(&buf[..len]) {
                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) {
                        if msg.get("service").and_then(|v| v.as_str()) == Some("zinga") {
                            let ip = msg["ip"].as_str().unwrap_or_default().to_string();
                            let port = msg["port"].as_u64().unwrap_or(SERVER_PORT as u64) as u16;
                            let name = msg["name"].as_str().unwrap_or("Zinga").to_string();

                            if !ip.is_empty() {
                                servers.entry(ip.clone()).or_insert(DiscoveredServer {
                                    ip,
                                    port,
                                    name,
                                });
                            }
                        }
                    }
                }
            }
            _ => break,
        }
    }

    servers.into_values().collect()
}

async fn create_discovery_socket() -> Option<UdpSocket> {
    let std_socket = match std::net::UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
        Ok(s) => s,
        Err(_) => match std::net::UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Discovery scan: failed to bind socket: {}", e);
                return None;
            }
        },
    };

    std_socket.set_nonblocking(true).ok()?;
    UdpSocket::from_std(std_socket).ok()
}
