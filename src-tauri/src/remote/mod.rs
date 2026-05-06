pub mod api;
pub mod auth;
pub mod discovery;
pub mod mopidy;
pub mod state;
pub mod ws;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use state::RemoteState;

const REMOTE_SERVER_PORT: u16 = 9632;
const SERVER_STOP_GRACE_DELAY_MS: u64 = 100;

pub fn build_router(state: Arc<RemoteState>, client_dir: Option<std::path::PathBuf>) -> Router {
    let api_routes = Router::new()
        .route("/pair", post(api::pair_request))
        .route("/pair/verify", post(api::pair_verify))
        .route("/playback/state", get(api::playback_state))
        .route("/playback/play", post(api::playback_play))
        .route("/playback/pause", post(api::playback_pause))
        .route("/playback/next", post(api::playback_next))
        .route("/playback/previous", post(api::playback_previous))
        .route("/playback/seek", post(api::playback_seek))
        .route("/queue", get(api::queue_get))
        .route("/queue/add", post(api::queue_add))
        .route("/queue/clear", post(api::queue_clear))
        .route("/queue/play-album", post(api::queue_play_album))
        .route("/tidal/search", get(api::tidal_search))
        .route("/tidal/artist/{id}", get(api::tidal_artist))
        .route("/tidal/artist/{id}/albums", get(api::tidal_artist_albums))
        .route("/tidal/album/{id}", get(api::tidal_album))
        .route("/tidal/album/{id}/tracks", get(api::tidal_album_tracks))
        .route("/devices", get(api::devices_list))
        .route("/devices/select", post(api::devices_select));

    let mut app = Router::new()
        .nest("/api", api_routes)
        .route("/ws", get(ws::ws_handler))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ))
        .layer(CorsLayer::permissive())
        .with_state(state);

    if let Some(dir) = client_dir {
        use tower_http::services::ServeDir;
        app = app.fallback_service(ServeDir::new(dir));
    }

    app
}

pub async fn start_server(
    state: Arc<RemoteState>,
    client_dir: Option<std::path::PathBuf>,
) -> Result<(String, u16, String), String> {
    stop_server(&state).await;

    let host_ip = crate::get_host_ip().unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = REMOTE_SERVER_PORT;

    {
        let mut ip = state.host_ip.lock().await;
        *ip = Some(host_ip.clone());
    }

    let pairing_code = state.generate_pairing_code().await;

    let app = build_router(state.clone(), client_dir);

    let addr = format!("0.0.0.0:{}", port);

    let socket =
        tokio::net::TcpSocket::new_v4().map_err(|e| format!("Failed to create socket: {}", e))?;
    socket
        .set_reuseaddr(true)
        .map_err(|e| format!("Failed to set SO_REUSEADDR: {}", e))?;
    socket
        .bind(
            addr.parse()
                .map_err(|e| format!("Invalid address: {}", e))?,
        )
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
    let listener = socket
        .listen(1024)
        .map_err(|e| format!("Failed to listen on {}: {}", addr, e))?;

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut tx = state.shutdown_tx.lock().await;
        *tx = Some(shutdown_tx);
    }

    {
        let mut running = state.server_running.lock().await;
        *running = true;
    }

    let state_clone = state.clone();
    tokio::spawn(async move {
        let server = axum::serve(listener, app).with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });

        if let Err(e) = server.await {
            eprintln!("Remote server error: {}", e);
        }

        let mut running = state_clone.server_running.lock().await;
        *running = false;
    });

    let discovery_tx = discovery::start_broadcast(state.clone()).await;
    {
        let mut dtx = state.discovery_shutdown_tx.lock().await;
        *dtx = Some(discovery_tx);
    }

    Ok((host_ip, port, pairing_code))
}

pub async fn stop_server(state: &RemoteState) {
    let dtx = state.discovery_shutdown_tx.lock().await.take();
    if let Some(dtx) = dtx {
        let _ = dtx.send(());
    }

    let tx = state.shutdown_tx.lock().await.take();
    if let Some(tx) = tx {
        let _ = tx.send(());
    }

    let mut running = state.server_running.lock().await;
    *running = false;

    tokio::time::sleep(std::time::Duration::from_millis(SERVER_STOP_GRACE_DELAY_MS)).await;
}
