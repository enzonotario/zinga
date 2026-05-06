use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::mopidy::call_mopidy_rpc;
use super::state::RemoteState;

const MOPIDY_RPC_HOST: &str = "127.0.0.1";

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct PairRequest {
    pub device_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    pub message: String,
}

pub async fn pair_request(State(_state): State<Arc<RemoteState>>) -> Json<PairResponse> {
    Json(PairResponse {
        message: "Enter the 6-digit pairing code shown on Zinga".to_string(),
    })
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub code: String,
    pub device_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    pub token: String,
    pub device_id: String,
}

pub async fn pair_verify(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, StatusCode> {
    let device_name = body
        .device_name
        .unwrap_or_else(|| "Remote Device".to_string());
    let device = state
        .verify_pairing_code(&body.code, &device_name)
        .await
        .ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(VerifyResponse {
        token: device.token,
        device_id: device.id,
    }))
}

async fn mopidy_rpc_async(
    host_ip: String,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || call_mopidy_rpc(&host_ip, &method, &params))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

pub async fn playback_state(
    State(_state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();

    let (state_res, position_res, track_res) = tokio::join!(
        mopidy_rpc_async(
            ip.clone(),
            "core.playback.get_state".to_string(),
            serde_json::json!({})
        ),
        mopidy_rpc_async(
            ip.clone(),
            "core.playback.get_time_position".to_string(),
            serde_json::json!({})
        ),
        mopidy_rpc_async(
            ip,
            "core.playback.get_current_tl_track".to_string(),
            serde_json::json!({})
        ),
    );

    Ok(Json(serde_json::json!({
        "state": state_res.unwrap_or(serde_json::Value::Null),
        "position": position_res.unwrap_or(serde_json::Value::Null),
        "track": track_res.unwrap_or(serde_json::Value::Null),
    })))
}

pub async fn playback_play(
    State(state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(ip, "core.playback.play".to_string(), serde_json::json!({}))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_playback_state(&state).await;
    Ok(Json(result))
}

pub async fn playback_pause(
    State(state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(ip, "core.playback.pause".to_string(), serde_json::json!({}))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_playback_state(&state).await;
    Ok(Json(result))
}

pub async fn playback_next(
    State(state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(ip, "core.playback.next".to_string(), serde_json::json!({}))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_playback_state(&state).await;
    Ok(Json(result))
}

pub async fn playback_previous(
    State(state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.playback.previous".to_string(),
        serde_json::json!({}),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_playback_state(&state).await;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct SeekRequest {
    pub position: u64,
}

pub async fn playback_seek(
    State(_state): State<Arc<RemoteState>>,
    Json(body): Json<SeekRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.playback.seek".to_string(),
        serde_json::json!({ "time_position": body.position }),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(result))
}

pub async fn queue_get(
    State(_state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.tracklist.get_tl_tracks".to_string(),
        serde_json::json!({}),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct QueueAddRequest {
    pub uris: Vec<String>,
}

pub async fn queue_add(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<QueueAddRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.tracklist.add".to_string(),
        serde_json::json!({ "uris": body.uris }),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_queue_updated(&state).await;
    Ok(Json(result))
}

pub async fn queue_clear(
    State(state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.tracklist.clear".to_string(),
        serde_json::json!({}),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    broadcast_queue_updated(&state).await;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct PlayAlbumRequest {
    pub album_id: String,
}

pub async fn queue_play_album(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<PlayAlbumRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let uri = format!("tidal:album:{}", body.album_id);

    let tracks = mopidy_rpc_async(
        ip.clone(),
        "core.library.lookup".to_string(),
        serde_json::json!({ "uris": [uri] }),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let track_uris: Vec<String> = tracks
        .as_object()
        .and_then(|obj| obj.values().next())
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.get("uri").and_then(|u| u.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if track_uris.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            "No tracks found for album".to_string(),
        ));
    }

    mopidy_rpc_async(
        ip.clone(),
        "core.tracklist.clear".to_string(),
        serde_json::json!({}),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    mopidy_rpc_async(
        ip.clone(),
        "core.tracklist.add".to_string(),
        serde_json::json!({ "uris": track_uris }),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    mopidy_rpc_async(ip, "core.playback.play".to_string(), serde_json::json!({}))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    broadcast_playback_state(&state).await;
    broadcast_queue_updated(&state).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn tidal_search(
    State(state): State<Arc<RemoteState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let token = state.tidal_token.lock().await.clone().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "No Tidal token available".to_string(),
    ))?;

    let url = format!(
        "https://openapi.tidal.com/v2/searchResults/{}?countryCode=US&include=artists,albums,tracks",
        urlencoding::encode(&query.q)
    );

    let result = tokio::task::spawn_blocking(move || {
        let mut resp = ureq::get(&url)
            .header("Authorization", &format!("Bearer {}", token))
            .header("Content-Type", "application/vnd.api+json")
            .call()
            .map_err(|e| format!("Tidal API error: {}", e))?;
        let body = resp
            .body_mut()
            .read_to_string()
            .map_err(|e| format!("Error reading response: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&body)
            .map_err(|e| format!("Error parsing JSON: {}", e))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(result))
}

pub async fn tidal_artist(
    State(state): State<Arc<RemoteState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tidal_proxy(
        &state,
        &format!(
            "/v2/artists/{}?countryCode=US&include=biography,profileArt",
            id
        ),
    )
    .await
}

pub async fn tidal_artist_albums(
    State(state): State<Arc<RemoteState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tidal_proxy(
        &state,
        &format!("/v2/artists/{}/relationships/albums?countryCode=US", id),
    )
    .await
}

pub async fn tidal_album(
    State(state): State<Arc<RemoteState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tidal_proxy(
        &state,
        &format!(
            "/v2/albums/{}?countryCode=US&include=artists,coverArt,items",
            id
        ),
    )
    .await
}

pub async fn tidal_album_tracks(
    State(state): State<Arc<RemoteState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tidal_proxy(
        &state,
        &format!("/v2/albums/{}/relationships/items?countryCode=US", id),
    )
    .await
}

async fn tidal_proxy(
    state: &RemoteState,
    path: &str,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let token = state.tidal_token.lock().await.clone().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "No Tidal token available".to_string(),
    ))?;

    let url = format!("https://openapi.tidal.com{}", path);

    let result = tokio::task::spawn_blocking(move || {
        let mut resp = ureq::get(&url)
            .header("Authorization", &format!("Bearer {}", token))
            .header("Content-Type", "application/vnd.api+json")
            .call()
            .map_err(|e| format!("Tidal API error: {}", e))?;
        let body = resp
            .body_mut()
            .read_to_string()
            .map_err(|e| format!("Error reading response: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&body)
            .map_err(|e| format!("Error parsing JSON: {}", e))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(result))
}

pub async fn devices_list(
    State(_state): State<Arc<RemoteState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ip = MOPIDY_RPC_HOST.to_string();
    let result = mopidy_rpc_async(
        ip,
        "core.mixer.get_volume".to_string(),
        serde_json::json!({}),
    )
    .await
    .unwrap_or(serde_json::Value::Null);
    Ok(Json(serde_json::json!({ "volume": result })))
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct SelectDeviceRequest {
    pub device_id: String,
}

pub async fn devices_select(
    State(_state): State<Arc<RemoteState>>,
    Json(_body): Json<SelectDeviceRequest>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn broadcast_playback_state(state: &RemoteState) {
    let ip = MOPIDY_RPC_HOST.to_string();
    let playback_state = mopidy_rpc_async(
        ip.clone(),
        "core.playback.get_state".to_string(),
        serde_json::json!({}),
    )
    .await
    .unwrap_or(serde_json::Value::Null);
    let position = mopidy_rpc_async(
        ip.clone(),
        "core.playback.get_time_position".to_string(),
        serde_json::json!({}),
    )
    .await
    .unwrap_or(serde_json::Value::Null);
    let track = mopidy_rpc_async(
        ip,
        "core.playback.get_current_tl_track".to_string(),
        serde_json::json!({}),
    )
    .await
    .unwrap_or(serde_json::Value::Null);

    let msg = serde_json::json!({
        "type": "playback_state",
        "data": {
            "state": playback_state,
            "position": position,
            "track": track,
        }
    });
    let _ = state.broadcast_tx.send(msg.to_string());
}

async fn broadcast_queue_updated(state: &RemoteState) {
    let ip = MOPIDY_RPC_HOST.to_string();
    let tracks = mopidy_rpc_async(
        ip,
        "core.tracklist.get_tl_tracks".to_string(),
        serde_json::json!({}),
    )
    .await
    .unwrap_or(serde_json::Value::Null);

    let msg = serde_json::json!({
        "type": "queue_updated",
        "data": { "tracks": tracks }
    });
    let _ = state.broadcast_tx.send(msg.to_string());
}
