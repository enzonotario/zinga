use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, ChildStdout};

pub const DIRECT_STREAM_PORT: u16 = 9633;
const MANIFEST_TTL: Duration = Duration::from_secs(30 * 60);
const MANIFEST_FETCH_TIMEOUT_SECS: u64 = 20;
const STREAM_CHUNK_SIZE: usize = 64 * 1024;
const FFMPEG_EXIT_WAIT: Duration = Duration::from_secs(1);
const DLNA_CONTENT_FEATURES: &str =
    "DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000";

struct CachedSource {
    input: String,
    fetched_at: Instant,
}

#[derive(Deserialize)]
struct ManifestOutput {
    kind: String,
    data: String,
}

#[derive(Deserialize)]
struct StreamQuery {
    start: Option<f64>,
}

static SCRIPT_PATH: OnceLock<PathBuf> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, CachedSource>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedSource>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// Serializes fetches so a GET arriving while tidal_prepare_stream is still running
// waits for that result instead of spawning a second python process.
fn fetch_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn is_valid_track_id(track_id: &str) -> bool {
    !track_id.is_empty() && track_id.bytes().all(|b| b.is_ascii_digit())
}

fn mpd_path(track_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("zinga-mpd")
        .join(format!("{track_id}.mpd"))
}

fn script_path() -> Result<&'static Path, String> {
    SCRIPT_PATH
        .get()
        .map(PathBuf::as_path)
        .ok_or_else(|| "Direct stream server not started".to_string())
}

fn cached_source(track_id: &str) -> Option<String> {
    let cache = cache().lock().ok()?;
    let entry = cache.get(track_id)?;
    if entry.fetched_at.elapsed() >= MANIFEST_TTL {
        return None;
    }
    if !entry.input.starts_with("http") && !Path::new(&entry.input).exists() {
        return None;
    }
    Some(entry.input.clone())
}

fn fetch_source(script: &Path, track_id: &str) -> Result<String, String> {
    if !is_valid_track_id(track_id) {
        return Err(format!("Invalid track id: {track_id}"));
    }
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    let python = PathBuf::from(home).join("mopidy-env/bin/python");

    let mut cmd = Command::new("timeout");
    cmd.arg(MANIFEST_FETCH_TIMEOUT_SECS.to_string())
        .arg(&python)
        .arg("-I")
        .arg(script)
        .arg(track_id)
        .stdin(Stdio::null());
    crate::setup::sanitize_external_env(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run {}: {e}", python.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("tidal_manifest.py exited with {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .ok_or("tidal_manifest.py produced no output")?;
    let manifest: ManifestOutput =
        serde_json::from_str(line).map_err(|e| format!("Invalid manifest output: {e}"))?;

    let input = match manifest.kind.as_str() {
        "mpd" => {
            let path = mpd_path(track_id);
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            // Write-then-rename so a running ffmpeg never reads a half-written manifest.
            let tmp = path.with_extension("mpd.tmp");
            std::fs::write(&tmp, manifest.data.as_bytes()).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            path.display().to_string()
        }
        "url" => manifest.data,
        other => return Err(format!("Unknown manifest kind: {other}")),
    };

    if let Ok(mut cache) = cache().lock() {
        cache.insert(
            track_id.to_string(),
            CachedSource {
                input: input.clone(),
                fetched_at: Instant::now(),
            },
        );
    }
    Ok(input)
}

pub fn ensure_source(script: &Path, track_id: &str) -> Result<String, String> {
    if let Some(input) = cached_source(track_id) {
        return Ok(input);
    }
    let _guard = fetch_lock().lock().map_err(|_| "fetch lock poisoned")?;
    if let Some(input) = cached_source(track_id) {
        return Ok(input);
    }
    fetch_source(script, track_id)
}

fn stream_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("audio/flac"));
    headers.insert(
        HeaderName::from_static("transfermode.dlna.org"),
        HeaderValue::from_static("Streaming"),
    );
    headers.insert(
        HeaderName::from_static("contentfeatures.dlna.org"),
        HeaderValue::from_static(DLNA_CONTENT_FEATURES),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    headers
}

fn spawn_ffmpeg(input: &str, start: f64, track_id: &str) -> Result<(ChildStdout, Child), String> {
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,https,tls,tcp,http,crypto",
        "-ss",
        &format!("{start:.3}"),
        "-i",
        input,
        "-map",
        "0:a:0",
        "-c:a",
        "flac",
        "-f",
        "flac",
        "pipe:1",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true);
    crate::setup::sanitize_external_env(cmd.as_std_mut());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;
    let stdout = child.stdout.take().ok_or("ffmpeg stdout unavailable")?;
    if let Some(mut stderr) = child.stderr.take() {
        let track_id = track_id.to_string();
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            let msg = String::from_utf8_lossy(&buf);
            let msg = msg.trim();
            if !msg.is_empty() {
                eprintln!("[DirectStream] ffmpeg track {track_id}: {msg}");
            }
        });
    }
    Ok((stdout, child))
}

async fn log_ffmpeg_exit(child: &mut Child, track_id: &str) {
    match tokio::time::timeout(FFMPEG_EXIT_WAIT, child.wait()).await {
        Ok(Ok(status)) if !status.success() => {
            eprintln!("[DirectStream] ffmpeg track {track_id} exited with {status}");
        }
        Ok(Err(e)) => eprintln!("[DirectStream] ffmpeg track {track_id} wait failed: {e}"),
        _ => {}
    }
}

fn ffmpeg_body(stdout: ChildStdout, child: Child, track_id: String) -> Body {
    // The Child lives in the stream state: when the client disconnects, the body is
    // dropped, which drops the Child and kill_on_drop terminates ffmpeg.
    let stream = futures_util::stream::unfold(
        (stdout, child, track_id),
        |(mut stdout, mut child, track_id)| async move {
            let mut buf = vec![0u8; STREAM_CHUNK_SIZE];
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => {
                    log_ffmpeg_exit(&mut child, &track_id).await;
                    None
                }
                Ok(n) => {
                    buf.truncate(n);
                    Some((
                        Ok::<Bytes, std::io::Error>(Bytes::from(buf)),
                        (stdout, child, track_id),
                    ))
                }
            }
        },
    );
    Body::from_stream(stream)
}

fn is_allowed_peer(app: &AppHandle, peer: IpAddr) -> bool {
    let peer = peer.to_canonical();
    peer.is_loopback()
        || app
            .try_state::<crate::upnp::AppState>()
            .is_some_and(|state| state.renderer_hosts().contains(&peer))
}

async fn stream_handler(
    method: Method,
    State(app): State<AppHandle>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    AxumPath((_tlid, file)): AxumPath<(String, String)>,
    Query(query): Query<StreamQuery>,
) -> Response {
    if !is_allowed_peer(&app, peer.ip()) {
        eprintln!("[DirectStream] Rejected request from non-renderer {}", peer.ip());
        return StatusCode::FORBIDDEN.into_response();
    }

    let Some(track_id) = file.strip_suffix(".flac").filter(|id| is_valid_track_id(id)) else {
        return (StatusCode::BAD_REQUEST, "Invalid track file").into_response();
    };

    if method == Method::HEAD {
        return (StatusCode::OK, stream_headers()).into_response();
    }

    let script = match script_path() {
        Ok(path) => path,
        Err(e) => return (StatusCode::BAD_GATEWAY, e).into_response(),
    };
    let start = query.start.filter(|s| s.is_finite()).unwrap_or(0.0).max(0.0);
    let id = track_id.to_string();

    let input = match tokio::task::spawn_blocking(move || ensure_source(script, &id)).await {
        Ok(Ok(input)) => input,
        Ok(Err(e)) => {
            eprintln!("[DirectStream] Source for track {track_id} failed: {e}");
            return (StatusCode::BAD_GATEWAY, e).into_response();
        }
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };

    match spawn_ffmpeg(&input, start, track_id) {
        Ok((stdout, child)) => (
            StatusCode::OK,
            stream_headers(),
            ffmpeg_body(stdout, child, track_id.to_string()),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[DirectStream] {e}");
            (StatusCode::BAD_GATEWAY, e).into_response()
        }
    }
}

pub fn start(app_handle: AppHandle) {
    match crate::setup::find_script(&app_handle, "tidal_manifest.py") {
        Ok(path) => {
            let _ = SCRIPT_PATH.set(path);
        }
        Err(e) => eprintln!("[DirectStream] {e}"),
    }

    tauri::async_runtime::spawn(async move {
        let listener =
            match tokio::net::TcpListener::bind(("0.0.0.0", DIRECT_STREAM_PORT)).await {
                Ok(listener) => listener,
                Err(e) => {
                    eprintln!("[DirectStream] Failed to bind port {DIRECT_STREAM_PORT}: {e}");
                    return;
                }
            };
        let router = Router::new()
            .route(
                "/stream/{tlid}/{file}",
                get(stream_handler).head(stream_handler),
            )
            .with_state(app_handle);
        let service = router.into_make_service_with_connect_info::<SocketAddr>();
        if let Err(e) = axum::serve(listener, service).await {
            eprintln!("[DirectStream] Server error: {e}");
        }
    });
}

#[tauri::command]
pub async fn tidal_prepare_stream(track_id: String) -> Result<(), String> {
    let script = script_path()?;
    tauri::async_runtime::spawn_blocking(move || ensure_source(script, &track_id))
        .await
        .map_err(|e| e.to_string())?
        .map(|_| ())
}

#[tauri::command]
pub fn direct_stream_base_url() -> Result<String, String> {
    let host_ip = crate::resolve_host_ip()?;
    Ok(format!("http://{host_ip}:{DIRECT_STREAM_PORT}"))
}
