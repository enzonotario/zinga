use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::command::RemoteCommand;
use super::state::RemoteState;

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

type CommandResponse = Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)>;

async fn forward(state: &RemoteState, command: RemoteCommand) -> CommandResponse {
    state
        .send_command(command)
        .await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e))?;
    Ok((StatusCode::ACCEPTED, Json(serde_json::json!({ "ok": true }))))
}

pub async fn playback_state(State(state): State<Arc<RemoteState>>) -> Json<serde_json::Value> {
    Json(state.playback_snapshot.lock().await.clone())
}

pub async fn playback_play(State(state): State<Arc<RemoteState>>) -> CommandResponse {
    forward(&state, RemoteCommand::Play).await
}

pub async fn playback_pause(State(state): State<Arc<RemoteState>>) -> CommandResponse {
    forward(&state, RemoteCommand::Pause).await
}

pub async fn playback_next(State(state): State<Arc<RemoteState>>) -> CommandResponse {
    forward(&state, RemoteCommand::Next).await
}

pub async fn playback_previous(State(state): State<Arc<RemoteState>>) -> CommandResponse {
    forward(&state, RemoteCommand::Previous).await
}

#[derive(Deserialize)]
pub struct SeekRequest {
    #[serde(alias = "time_position")]
    pub position: u64,
}

pub async fn playback_seek(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<SeekRequest>,
) -> CommandResponse {
    forward(
        &state,
        RemoteCommand::Seek {
            position: body.position,
        },
    )
    .await
}

pub async fn queue_get(State(state): State<Arc<RemoteState>>) -> Json<serde_json::Value> {
    Json(state.queue_snapshot.lock().await.clone())
}

const MAX_QUEUE_ADD_URIS: usize = 500;

#[derive(Deserialize)]
pub struct QueueAddRequest {
    pub uris: Vec<String>,
}

pub async fn queue_add(
    State(state): State<Arc<RemoteState>>,
    Json(mut body): Json<QueueAddRequest>,
) -> CommandResponse {
    body.uris.truncate(MAX_QUEUE_ADD_URIS);
    forward(&state, RemoteCommand::QueueAdd { uris: body.uris }).await
}

pub async fn queue_clear(State(state): State<Arc<RemoteState>>) -> CommandResponse {
    forward(&state, RemoteCommand::QueueClear).await
}

#[derive(Deserialize)]
pub struct PlayAlbumRequest {
    pub album_id: String,
}

pub async fn queue_play_album(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<PlayAlbumRequest>,
) -> CommandResponse {
    forward(
        &state,
        RemoteCommand::QueuePlayAlbum {
            album_id: body.album_id,
        },
    )
    .await
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

pub async fn devices_list(State(_state): State<Arc<RemoteState>>) -> Json<serde_json::Value> {
    let volume = crate::local_player::local_get_volume().await.ok();
    Json(serde_json::json!({ "volume": volume }))
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
