use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, Path as AxumPath, Query, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::tidal_session::{self, PlaybackSource};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, ChildStdout};

pub const DIRECT_STREAM_PORT: u16 = 9633;
const MANIFEST_TTL: Duration = Duration::from_secs(30 * 60);
const STREAM_CHUNK_SIZE: usize = 64 * 1024;
const FFMPEG_EXIT_WAIT: Duration = Duration::from_secs(1);
const DLNA_CONTENT_FEATURES: &str =
    "DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000";
const TIDAL_PROTOCOLS: &str = "file,https,tls,tcp,http,crypto";
const FILE_PROTOCOLS: &str = "file";
const FILE_TOKEN_BYTES: usize = 16;

static MPD_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputFormat {
    Flac,
    Mp3,
}

impl OutputFormat {
    fn content_type(self) -> &'static str {
        match self {
            OutputFormat::Flac => "audio/flac",
            OutputFormat::Mp3 => "audio/mpeg",
        }
    }

    fn codec_args(self) -> &'static [&'static str] {
        match self {
            OutputFormat::Flac => &["-c:a", "flac", "-f", "flac"],
            OutputFormat::Mp3 => &["-c:a", "libmp3lame", "-b:a", "320k", "-f", "mp3"],
        }
    }
}

fn parse_output_file(file: &str) -> Option<(&str, OutputFormat)> {
    let (stem, ext) = file.rsplit_once('.')?;
    let format = match ext {
        "flac" => OutputFormat::Flac,
        "mp3" => OutputFormat::Mp3,
        _ => return None,
    };
    Some((stem, format))
}

struct CachedSource {
    input: String,
    fetched_at: Instant,
}

#[derive(Deserialize)]
struct StreamQuery {
    start: Option<f64>,
}

fn cache() -> &'static Mutex<HashMap<String, CachedSource>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedSource>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// Serializes fetches so a GET arriving while tidal_prepare_stream is still running
// waits for that result instead of issuing a second TIDAL playback request.
fn fetch_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

// Only registered paths can be served, so LAN renderers cannot request arbitrary files.
fn file_registry() -> &'static Mutex<HashMap<String, PathBuf>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_token(path: &Path) -> String {
    let digest = Sha256::digest(path.as_os_str().as_encoded_bytes());
    digest[..FILE_TOKEN_BYTES]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn register_file(path: &str) -> Result<String, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|e| format!("Cannot resolve {path}: {e}"))?;
    if !canonical.is_file() {
        return Err(format!("Not a regular file: {path}"));
    }
    let token = file_token(&canonical);
    file_registry()
        .lock()
        .map_err(|_| "file registry poisoned")?
        .insert(token.clone(), canonical);
    Ok(token)
}

fn registered_file(token: &str) -> Option<PathBuf> {
    file_registry().lock().ok()?.get(token).cloned()
}

fn is_valid_track_id(track_id: &str) -> bool {
    !track_id.is_empty() && track_id.bytes().all(|b| b.is_ascii_digit())
}

fn mpd_dir() -> &'static Path {
    MPD_DIR.get_or_init(|| std::env::temp_dir().join("zinga-mpd"))
}

fn init_mpd_dir(app: &AppHandle) {
    let dir = match app.path().app_cache_dir() {
        Ok(cache_dir) => cache_dir.join("zinga-mpd"),
        Err(e) => {
            eprintln!("[DirectStream] App cache dir unavailable, using temp dir: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[DirectStream] Failed to create {}: {e}", dir.display());
    }
    let _ = MPD_DIR.set(dir);
}

fn mpd_path(track_id: &str) -> PathBuf {
    mpd_dir().join(format!("{track_id}.mpd"))
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

fn fetch_source(track_id: &str) -> Result<String, String> {
    if !is_valid_track_id(track_id) {
        return Err(format!("Invalid track id: {track_id}"));
    }

    let input = match tidal_session::fetch_source(track_id)? {
        PlaybackSource::Mpd(manifest) => {
            let path = mpd_path(track_id);
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            // Write-then-rename so a running ffmpeg never reads a half-written manifest.
            let tmp = path.with_extension("mpd.tmp");
            std::fs::write(&tmp, manifest.as_bytes()).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            path.display().to_string()
        }
        PlaybackSource::Url(url) => url,
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

pub fn ensure_source(track_id: &str) -> Result<String, String> {
    if let Some(input) = cached_source(track_id) {
        return Ok(input);
    }
    let _guard = fetch_lock().lock().map_err(|_| "fetch lock poisoned")?;
    if let Some(input) = cached_source(track_id) {
        return Ok(input);
    }
    fetch_source(track_id)
}

fn stream_headers(format: OutputFormat) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(format.content_type()),
    );
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

fn spawn_ffmpeg(
    input: &str,
    protocols: &str,
    start: f64,
    format: OutputFormat,
    track_id: &str,
) -> Result<(ChildStdout, Child), String> {
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        protocols,
        "-ss",
        &format!("{start:.3}"),
        "-i",
        input,
        "-map",
        "0:a:0",
    ])
    .args(format.codec_args())
    .arg("pipe:1")
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

fn reject_peer(app: &AppHandle, peer: IpAddr) -> Option<Response> {
    if is_allowed_peer(app, peer) {
        return None;
    }
    eprintln!("[DirectStream] Rejected request from non-renderer {peer}");
    Some(StatusCode::FORBIDDEN.into_response())
}

fn start_offset(query: &StreamQuery) -> f64 {
    query
        .start
        .filter(|s| s.is_finite())
        .unwrap_or(0.0)
        .max(0.0)
}

fn ffmpeg_response(
    input: &str,
    protocols: &str,
    start: f64,
    format: OutputFormat,
    label: &str,
) -> Response {
    match spawn_ffmpeg(input, protocols, start, format, label) {
        Ok((stdout, child)) => (
            StatusCode::OK,
            stream_headers(format),
            ffmpeg_body(stdout, child, label.to_string()),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[DirectStream] {e}");
            (StatusCode::BAD_GATEWAY, e).into_response()
        }
    }
}

async fn stream_handler(
    method: Method,
    State(app): State<AppHandle>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    AxumPath((_tlid, file)): AxumPath<(String, String)>,
    Query(query): Query<StreamQuery>,
) -> Response {
    if let Some(rejection) = reject_peer(&app, peer.ip()) {
        return rejection;
    }

    let Some((track_id, format)) = parse_output_file(&file).filter(|(id, _)| is_valid_track_id(id))
    else {
        return (StatusCode::BAD_REQUEST, "Invalid track file").into_response();
    };

    if method == Method::HEAD {
        return (StatusCode::OK, stream_headers(format)).into_response();
    }

    let id = track_id.to_string();
    let input = match tokio::task::spawn_blocking(move || ensure_source(&id)).await {
        Ok(Ok(input)) => input,
        Ok(Err(e)) => {
            eprintln!("[DirectStream] Source for track {track_id} failed: {e}");
            return (StatusCode::BAD_GATEWAY, e).into_response();
        }
        Err(e) => return (StatusCode::BAD_GATEWAY, e.to_string()).into_response(),
    };

    ffmpeg_response(
        &input,
        TIDAL_PROTOCOLS,
        start_offset(&query),
        format,
        track_id,
    )
}

async fn file_handler(
    method: Method,
    State(app): State<AppHandle>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    AxumPath((_tlid, file)): AxumPath<(String, String)>,
    Query(query): Query<StreamQuery>,
) -> Response {
    if let Some(rejection) = reject_peer(&app, peer.ip()) {
        return rejection;
    }

    let Some((token, format)) = parse_output_file(&file) else {
        return (StatusCode::BAD_REQUEST, "Invalid file").into_response();
    };
    let Some(path) = registered_file(token) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(input) = path.to_str() else {
        return (StatusCode::BAD_REQUEST, "Unsupported file path").into_response();
    };

    if method == Method::HEAD {
        return (StatusCode::OK, stream_headers(format)).into_response();
    }

    ffmpeg_response(input, FILE_PROTOCOLS, start_offset(&query), format, token)
}

pub fn start(app_handle: AppHandle) {
    init_mpd_dir(&app_handle);
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(("0.0.0.0", DIRECT_STREAM_PORT)).await {
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
            .route("/file/{tlid}/{file}", get(file_handler).head(file_handler))
            .with_state(app_handle);
        let service = router.into_make_service_with_connect_info::<SocketAddr>();
        if let Err(e) = axum::serve(listener, service).await {
            eprintln!("[DirectStream] Server error: {e}");
        }
    });
}

#[tauri::command]
pub async fn tidal_prepare_stream(track_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ensure_source(&track_id))
        .await
        .map_err(|e| e.to_string())?
        .map(|_| ())
}

#[tauri::command]
pub fn direct_register_file(path: String) -> Result<String, String> {
    register_file(&path)
}

#[tauri::command]
pub fn direct_stream_base_url() -> Result<String, String> {
    let host_ip = crate::resolve_host_ip()?;
    Ok(format!("http://{host_ip}:{DIRECT_STREAM_PORT}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_output_file_selects_format_by_extension() {
        assert_eq!(
            parse_output_file("55163274.flac"),
            Some(("55163274", OutputFormat::Flac))
        );
        assert_eq!(
            parse_output_file("00ff.mp3"),
            Some(("00ff", OutputFormat::Mp3))
        );
        assert_eq!(parse_output_file("55163274.wav"), None);
        assert_eq!(parse_output_file("55163274"), None);
    }

    #[test]
    fn output_format_maps_to_codec_and_content_type() {
        assert_eq!(OutputFormat::Flac.content_type(), "audio/flac");
        assert_eq!(OutputFormat::Mp3.content_type(), "audio/mpeg");
        assert!(OutputFormat::Flac.codec_args().contains(&"flac"));
        let mp3 = OutputFormat::Mp3.codec_args();
        assert!(mp3.contains(&"libmp3lame") && mp3.contains(&"320k") && mp3.contains(&"mp3"));
    }

    #[test]
    fn file_token_is_stable_and_hex() {
        let a = file_token(Path::new("/music/a b.flac"));
        assert_eq!(a, file_token(Path::new("/music/a b.flac")));
        assert_ne!(a, file_token(Path::new("/music/c.flac")));
        assert_eq!(a.len(), FILE_TOKEN_BYTES * 2);
        assert!(a.bytes().all(|b| b.is_ascii_hexdigit()));
    }

    #[test]
    fn register_file_only_accepts_existing_regular_files() {
        let dir = std::env::temp_dir().join(format!("zinga-register-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("track.flac");
        std::fs::write(&file, b"x").unwrap();

        let token = register_file(file.to_str().unwrap()).unwrap();
        let canonical = std::fs::canonicalize(&file).unwrap();
        assert_eq!(token, file_token(&canonical));
        assert_eq!(registered_file(&token), Some(canonical));
        assert!(register_file(dir.to_str().unwrap()).is_err());
        assert!(register_file(dir.join("missing.flac").to_str().unwrap()).is_err());
        assert_eq!(registered_file("00ff"), None);

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
