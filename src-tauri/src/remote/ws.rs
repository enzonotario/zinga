use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;

use super::command::RemoteCommand;
use super::state::RemoteState;

#[derive(serde::Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
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

    for msg in state.snapshot_messages().await {
        if sender.send(Message::Text(msg.into())).await.is_err() {
            return;
        }
    }

    let send_task = tokio::spawn(async move {
        loop {
            let msg = match broadcast_rx.recv().await {
                Ok(msg) => msg,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            };
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
    let Some(command) = RemoteCommand::from_ws(action, parsed.get("data")) else {
        return;
    };
    if let Err(e) = state.send_command(command).await {
        eprintln!("Remote command error: {}", e);
    }
}
