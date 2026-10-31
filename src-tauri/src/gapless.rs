use axum::body::Body;
use axum::extract::{ConnectInfo, Path as AxumPath, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Notify;

use crate::direct_stream::{
    ensure_source, registered_file, reject_peer, FILE_PROTOCOLS, TIDAL_PROTOCOLS,
};

const READ_WAIT: Duration = Duration::from_millis(20);
const CANCEL_POLL: Duration = Duration::from_millis(200);
const CHUNK: usize = 64 * 1024;

struct Tape {
    path: PathBuf,
    len: AtomicU64,
    done: AtomicBool,
}

impl Drop for Tape {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

struct Session {
    tape: Arc<Tape>,
    queue: Mutex<VecDeque<GaplessTrack>>,
    finished: AtomicBool,
    cancel: AtomicBool,
    wake: Notify,
    alive: AtomicBool,
}

fn sessions() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock<'a, T>(mutex: &'a Mutex<T>) -> std::sync::MutexGuard<'a, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GaplessTrack {
    tlid: u64,
    kind: String,
    id: String,
    #[allow(dead_code)]
    duration_ms: u64,
    #[serde(default)]
    start_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GaplessOpened {
    id: String,
}

#[derive(Clone, Copy)]
enum StreamFormat {
    Flac,
    Mp3,
}

impl StreamFormat {
    fn parse(format: &str) -> Option<Self> {
        match format {
            "flac" => Some(Self::Flac),
            "mp3" => Some(Self::Mp3),
            _ => None,
        }
    }

    fn content_type(self) -> &'static str {
        match self {
            Self::Flac => "audio/flac",
            Self::Mp3 => "audio/mpeg",
        }
    }

    fn encoder_args(self) -> &'static [&'static str] {
        match self {
            Self::Flac => &[
                "-c:a",
                "flac",
                "-compression_level",
                "0",
                "-flush_packets",
                "1",
                "-f",
                "flac",
            ],
            Self::Mp3 => &[
                "-c:a",
                "libmp3lame",
                "-b:a",
                "320k",
                "-flush_packets",
                "1",
                "-f",
                "mp3",
            ],
        }
    }
}

fn parse_probe(text: &str) -> Option<(u32, u16)> {
    let line = text.lines().find(|line| line.contains(','))?;
    let (rate, channels) = line.split_once(',')?;
    let rate = rate.trim().parse().ok()?;
    let channels = channels.trim().parse().ok()?;
    if rate == 0 || channels == 0 {
        return None;
    }
    Some((rate, channels))
}

fn probe_audio(input: &str, protocols: &str) -> Option<(u32, u16)> {
    let mut cmd = std::process::Command::new("ffprobe");
    cmd.args([
        "-v",
        "error",
        "-protocol_whitelist",
        protocols,
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate,channels",
        "-of",
        "csv=p=0",
        input,
    ])
    .stdin(Stdio::null())
    .stderr(Stdio::null());
    crate::setup::sanitize_external_env(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_probe(&String::from_utf8_lossy(&output.stdout))
}

fn resolve_input(track: &GaplessTrack) -> Result<(String, &'static str), String> {
    match track.kind.as_str() {
        "tidal" => Ok((ensure_source(&track.id)?, TIDAL_PROTOCOLS)),
        "file" => {
            let path =
                registered_file(&track.id).ok_or_else(|| format!("Unknown file: {}", track.id))?;
            let input = path
                .to_str()
                .ok_or_else(|| format!("Unsupported file path: {}", track.id))?
                .to_string();
            Ok((input, FILE_PROTOCOLS))
        }
        other => Err(format!("Unknown source: {other}")),
    }
}

fn spawn_decoder(
    input: &str,
    protocols: &str,
    rate: u32,
    channels: u16,
    source_rate: u32,
    source_channels: u16,
    start_ms: u64,
) -> Result<(ChildStdout, Child), String> {
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        protocols,
    ]);
    if start_ms > 0 {
        cmd.arg("-ss").arg(format!("{:.3}", start_ms as f64 / 1000.0));
    }
    cmd.args(["-i", input, "-map", "0:a:0"]);
    if source_rate != rate || source_channels != channels {
        cmd.arg("-ac").arg(channels.to_string());
        cmd.arg("-ar").arg(rate.to_string());
    }
    cmd.args(["-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    crate::setup::sanitize_external_env(cmd.as_std_mut());
    let mut child = cmd
        .spawn()
        .map_err(|err| format!("Failed to decode track: {err}"))?;
    let stdout = child.stdout.take().ok_or("Decoder stdout unavailable")?;
    Ok((stdout, child))
}

fn spawn_encoder(
    format: &StreamFormat,
    rate: u32,
    channels: u16,
) -> Result<(ChildStdin, ChildStdout, Child), String> {
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        &rate.to_string(),
        "-ac",
        &channels.to_string(),
        "-i",
        "pipe:0",
    ])
    .args(format.encoder_args())
    .arg("pipe:1")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .kill_on_drop(true);
    crate::setup::sanitize_external_env(cmd.as_std_mut());
    let mut child = cmd
        .spawn()
        .map_err(|err| format!("Failed to encode playlist: {err}"))?;
    let stdin = child.stdin.take().ok_or("Encoder stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("Encoder stdout unavailable")?;
    Ok((stdin, stdout, child))
}

async fn copy_pcm(
    from: &mut ChildStdout,
    to: &mut ChildStdin,
    session: &Session,
) -> Result<(), String> {
    let mut buf = vec![0u8; CHUNK];
    loop {
        if session.cancel.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }
        let read = tokio::time::timeout(CANCEL_POLL, from.read(&mut buf)).await;
        let n = match read {
            Err(_) => continue,
            Ok(Ok(0)) => return Ok(()),
            Ok(Ok(n)) => n,
            Ok(Err(err)) => return Err(format!("Decoder read failed: {err}")),
        };
        to.write_all(&buf[..n])
            .await
            .map_err(|err| format!("Encoder write failed: {err}"))?;
    }
}

async fn pump_encoder(stdout: &mut ChildStdout, tape: &Arc<Tape>, session: &Session) {
    let mut file = match std::fs::File::create(&tape.path) {
        Ok(file) => file,
        Err(err) => {
            eprintln!("[Gapless] Cannot create stream file: {err}");
            tape.done.store(true, Ordering::Release);
            return;
        }
    };
    let mut buf = vec![0u8; CHUNK];
    loop {
        if session.cancel.load(Ordering::Relaxed) {
            break;
        }
        let read = tokio::time::timeout(CANCEL_POLL, stdout.read(&mut buf)).await;
        let n = match read {
            Err(_) => continue,
            Ok(Ok(0)) | Ok(Err(_)) => break,
            Ok(Ok(n)) => n,
        };
        if file
            .write_all(&buf[..n])
            .and_then(|_| file.flush())
            .is_err()
        {
            break;
        }
        tape.len.fetch_add(n as u64, Ordering::Release);
    }
    tape.done.store(true, Ordering::Release);
}

async fn next_track(session: &Arc<Session>) -> Option<GaplessTrack> {
    loop {
        if session.cancel.load(Ordering::Relaxed) {
            return None;
        }
        if let Some(track) = lock(&session.queue).pop_front() {
            return Some(track);
        }
        if session.finished.load(Ordering::Relaxed) {
            return None;
        }
        let _ = tokio::time::timeout(Duration::from_millis(200), session.wake.notified()).await;
    }
}

async fn encode_track(
    track: &GaplessTrack,
    encoder: &mut ChildStdin,
    session: &Session,
    rate: u32,
    channels: u16,
) -> Result<(), String> {
    let owned = track.clone();
    let (input, protocols) = tokio::task::spawn_blocking(move || resolve_input(&owned))
        .await
        .map_err(|err| err.to_string())??;
    let (source_rate, source_channels) = probe_audio(&input, protocols).unwrap_or((0, 0));
    let (mut stdout, mut child) = spawn_decoder(
        &input,
        protocols,
        rate,
        channels,
        source_rate,
        source_channels,
        track.start_ms,
    )?;
    let copied = copy_pcm(&mut stdout, encoder, session).await;
    let _ = child.wait().await;
    copied
}

fn fail_session(session: &Session) {
    session.alive.store(false, Ordering::Relaxed);
    session.tape.done.store(true, Ordering::Release);
    session.wake.notify_waiters();
}

async fn run_session(session: Arc<Session>, format: StreamFormat) {
    let Some(first) = next_track(&session).await else {
        fail_session(&session);
        return;
    };
    let track = first.clone();
    let resolved = tokio::task::spawn_blocking(move || resolve_input(&track)).await;
    let (input, protocols) = match resolved {
        Ok(Ok(input)) => input,
        Ok(Err(err)) => {
            eprintln!("[Gapless] {err}");
            fail_session(&session);
            return;
        }
        Err(err) => {
            eprintln!("[Gapless] {err}");
            fail_session(&session);
            return;
        }
    };
    let (source_rate, source_channels, rate, channels) = match probe_audio(&input, protocols) {
        Some((rate, channels)) => (rate, channels, rate, channels),
        None => (0, 0, 44_100, 2),
    };
    let (mut stdin, mut stdout, mut encoder_child) = match spawn_encoder(&format, rate, channels) {
        Ok(encoder) => encoder,
        Err(err) => {
            eprintln!("[Gapless] {err}");
            fail_session(&session);
            return;
        }
    };
    let tape = Arc::clone(&session.tape);
    let pumping = Arc::clone(&session);
    let pump = tokio::spawn(async move {
        pump_encoder(&mut stdout, &tape, &pumping).await;
    });

    let first_result = async {
        let (mut decoder_out, mut decoder) = spawn_decoder(
            &input,
            protocols,
            rate,
            channels,
            source_rate,
            source_channels,
            first.start_ms,
        )?;
        let copied = copy_pcm(&mut decoder_out, &mut stdin, &session).await;
        let _ = decoder.wait().await;
        copied
    }
    .await;
    if let Err(err) = first_result {
        if err != "cancelled" {
            eprintln!("[Gapless] track {} failed: {err}", first.tlid);
        }
    } else {
        while let Some(track) = next_track(&session).await {
            if let Err(err) = encode_track(&track, &mut stdin, &session, rate, channels).await {
                if err != "cancelled" {
                    eprintln!("[Gapless] track {} failed: {err}", track.tlid);
                }
                break;
            }
        }
    }

    drop(stdin);
    let _ = encoder_child.wait().await;
    let _ = pump.await;
    session.alive.store(false, Ordering::Relaxed);
    session.wake.notify_waiters();
}

fn session(id: &str) -> Option<Arc<Session>> {
    lock(sessions()).get(id).cloned()
}

fn take_tracks(tracks: Vec<GaplessTrack>) -> Result<VecDeque<GaplessTrack>, String> {
    if tracks.is_empty() {
        return Err("Playlist is empty".to_string());
    }
    if tracks.iter().any(|track| track.id.is_empty()) {
        return Err("Playlist track is missing an id".to_string());
    }
    Ok(tracks.into())
}

fn open_session(tracks: Vec<GaplessTrack>, format: String) -> Result<GaplessOpened, String> {
    let format = StreamFormat::parse(&format)
        .ok_or_else(|| format!("Unsupported stream format: {format}"))?;
    let queue = take_tracks(tracks)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let path = std::env::temp_dir().join(format!("zinga-gapless-{id}"));
    let session = Arc::new(Session {
        tape: Arc::new(Tape {
            path,
            len: AtomicU64::new(0),
            done: AtomicBool::new(false),
        }),
        queue: Mutex::new(queue),
        finished: AtomicBool::new(false),
        cancel: AtomicBool::new(false),
        wake: Notify::new(),
        alive: AtomicBool::new(true),
    });
    lock(sessions()).insert(id.clone(), Arc::clone(&session));
    tokio::spawn(run_session(session, format));
    Ok(GaplessOpened { id })
}

#[tauri::command]
pub async fn direct_gapless_open(
    tracks: Vec<GaplessTrack>,
    format: String,
) -> Result<GaplessOpened, String> {
    open_session(tracks, format)
}

#[tauri::command]
pub async fn direct_gapless_append(id: String, tracks: Vec<GaplessTrack>) -> Result<(), String> {
    let session = session(&id).ok_or_else(|| format!("Unknown playlist: {id}"))?;
    if !session.alive.load(Ordering::Relaxed) || session.cancel.load(Ordering::Relaxed) {
        return Err("Playlist already finished".to_string());
    }
    lock(&session.queue).extend(tracks);
    session.finished.store(false, Ordering::Relaxed);
    session.wake.notify_waiters();
    Ok(())
}

#[tauri::command]
pub async fn direct_gapless_finish(id: String) -> Result<(), String> {
    let Some(session) = session(&id) else {
        return Ok(());
    };
    session.finished.store(true, Ordering::Relaxed);
    session.wake.notify_waiters();
    Ok(())
}

#[tauri::command]
pub async fn direct_gapless_close(id: String) -> Result<(), String> {
    if let Some(session) = lock(sessions()).remove(&id) {
        session.cancel.store(true, Ordering::Relaxed);
        session.finished.store(true, Ordering::Relaxed);
        session.wake.notify_waiters();
    }
    Ok(())
}

fn content_headers(format: StreamFormat) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(format.content_type()),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    headers.insert(
        HeaderName::from_static("transfermode.dlna.org"),
        HeaderValue::from_static("Streaming"),
    );
    headers.insert(
        HeaderName::from_static("contentfeatures.dlna.org"),
        HeaderValue::from_static(
            "DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
        ),
    );
    headers
}

fn read_tape(tape: &Tape, offset: u64) -> std::io::Result<Option<Vec<u8>>> {
    let len = tape.len.load(Ordering::Acquire);
    if offset >= len {
        return Ok(None);
    }
    let mut file = std::fs::File::open(&tape.path)?;
    file.seek(SeekFrom::Start(offset))?;
    let size = ((len - offset) as usize).min(CHUNK);
    let mut buf = vec![0u8; size];
    let read = file.read(&mut buf)?;
    if read == 0 {
        return Ok(None);
    }
    buf.truncate(read);
    Ok(Some(buf))
}

fn tape_body(tape: Arc<Tape>) -> Body {
    let stream = futures_util::stream::unfold(0u64, move |offset| {
        let tape = Arc::clone(&tape);
        async move {
            loop {
                match read_tape(&tape, offset) {
                    Ok(Some(buf)) => {
                        let next = offset + buf.len() as u64;
                        return Some((Ok::<_, std::io::Error>(axum::body::Bytes::from(buf)), next));
                    }
                    Ok(None)
                        if tape.done.load(Ordering::Acquire)
                            && offset >= tape.len.load(Ordering::Acquire) =>
                    {
                        return None;
                    }
                    _ => tokio::time::sleep(READ_WAIT).await,
                }
            }
        }
    });
    Body::from_stream(stream)
}

pub async fn gapless_handler(
    method: Method,
    State(app): State<AppHandle>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    AxumPath(file): AxumPath<String>,
) -> Response {
    if let Some(rejection) = reject_peer(&app, peer.ip()) {
        return rejection;
    }
    let Some((id, ext)) = file.rsplit_once('.') else {
        return (StatusCode::BAD_REQUEST, "Invalid playlist").into_response();
    };
    let Some(format) = StreamFormat::parse(ext) else {
        return (StatusCode::BAD_REQUEST, "Invalid playlist").into_response();
    };
    let Some(session) = session(id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if method == Method::HEAD {
        return (StatusCode::OK, content_headers(format)).into_response();
    }
    (
        StatusCode::OK,
        content_headers(format),
        tape_body(Arc::clone(&session.tape)),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_csv_reads_rate_and_channels() {
        assert_eq!(parse_probe("44100,2\n"), Some((44100, 2)));
        assert_eq!(parse_probe("96000,2\n"), Some((96000, 2)));
        assert_eq!(parse_probe("nope"), None);
        assert_eq!(parse_probe("0,2"), None);
    }
}
