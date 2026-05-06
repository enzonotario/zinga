use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

use super::state::RemoteState;

const MOPIDY_RPC_HOST: &str = "127.0.0.1";

#[derive(serde::Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
}

fn command_to_mopidy_method(action: &str) -> Option<&'static str> {
    match action {
        "play" => Some("core.playback.play"),
        "pause" => Some("core.playback.pause"),
        "next" => Some("core.playback.next"),
        "prev" | "previous" => Some("core.playback.previous"),
        "seek" => Some("core.playback.seek"),
        _ => None,
    }
}

async fn fetch_playback_state_snapshot(ip: String) -> serde_json::Value {
    let ip2 = ip.clone();
    let ip3 = ip.clone();
    let (state, position, track) = tokio::join!(
        async {
            tokio::task::spawn_blocking(move || {
                super::mopidy::call_mopidy_rpc(
                    &ip,
                    "core.playback.get_state",
                    &serde_json::json!({}),
                )
            })
            .await
            .ok()
            .and_then(|r| r.ok())
        },
        async {
            tokio::task::spawn_blocking(move || {
                super::mopidy::call_mopidy_rpc(
                    &ip2,
                    "core.playback.get_time_position",
                    &serde_json::json!({}),
                )
            })
            .await
            .ok()
            .and_then(|r| r.ok())
        },
        async {
            tokio::task::spawn_blocking(move || {
                super::mopidy::call_mopidy_rpc(
                    &ip3,
                    "core.playback.get_current_tl_track",
                    &serde_json::json!({}),
                )
            })
            .await
            .ok()
            .and_then(|r| r.ok())
        }
    );

    serde_json::json!({
        "type": "playback_state",
        "data": {
            "state": state.unwrap_or(serde_json::Value::Null),
            "position": position.unwrap_or(serde_json::Value::Null),
            "track": track.unwrap_or(serde_json::Value::Null),
        }
    })
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RemoteState>>,
    Query(query): Query<WsQuery>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, query.token))
}

async fn handle_socket(socket: WebSocket, state: Arc<RemoteState>, token: Option<String>) {
    let (mut sender, mut receiver) = socket.split();
    let mut authenticated = false;

    if let Some(ref t) = token {
        authenticated = state.is_valid_token(t).await;
    }

    if !authenticated {
        if let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    if parsed.get("type").and_then(|t| t.as_str()) == Some("auth") {
                        if let Some(t) = parsed.get("token").and_then(|t| t.as_str()) {
                            authenticated = state.is_valid_token(t).await;
                        }
                    }
                }
            }
        }
    }

    if !authenticated {
        let _ = sender
            .send(Message::Text(
                serde_json::json!({ "type": "error", "data": "unauthorized" })
                    .to_string()
                    .into(),
            ))
            .await;
        return;
    }

    let _ = sender
        .send(Message::Text(
            serde_json::json!({ "type": "connected" })
                .to_string()
                .into(),
        ))
        .await;

    let mut broadcast_rx = state.broadcast_tx.subscribe();

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                handle_ws_message(&state_clone, &text).await;
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}

async fn handle_ws_message(state: &RemoteState, text: &str) {
    let parsed: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    let msg_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if msg_type != "command" {
        return;
    }

    let action = parsed.get("action").and_then(|a| a.as_str()).unwrap_or("");

    let ip = MOPIDY_RPC_HOST.to_string();

    let method = command_to_mopidy_method(action);

    if let Some(method) = method {
        let params = if action == "seek" {
            parsed.get("data").cloned().unwrap_or(serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        let ip_clone = ip.clone();
        let method_str = method.to_string();
        let _ = tokio::task::spawn_blocking(move || {
            super::mopidy::call_mopidy_rpc(&ip_clone, &method_str, &params)
        })
        .await;

        let msg = fetch_playback_state_snapshot(ip).await;
        let _ = state.broadcast_tx.send(msg.to_string());
    }
}
