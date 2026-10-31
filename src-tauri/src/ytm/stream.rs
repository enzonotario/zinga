use crate::ytm::cookies::{cookies_connected, cookies_file_path};
use crate::ytm::is_valid_video_id;
use crate::ytm::ytdlp::{ensure_ytdlp, run_ytdlp, FORMAT_SELECTOR};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(90);
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Debug)]
pub struct ResolvedStream {
    pub url: String,
    pub http_headers: Vec<(String, String)>,
    pub itag: String,
    pub codec: String,
    pub abr: f64,
}

struct CacheEntry {
    stream: ResolvedStream,
    fetched_at: Instant,
}

fn cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached(video_id: &str) -> Option<ResolvedStream> {
    let cache = cache().lock().ok()?;
    let entry = cache.get(video_id)?;
    if entry.fetched_at.elapsed() >= CACHE_TTL {
        return None;
    }
    Some(entry.stream.clone())
}

fn store_cache(video_id: &str, stream: ResolvedStream) {
    if let Ok(mut cache) = cache().lock() {
        cache.insert(
            video_id.to_string(),
            CacheEntry {
                stream,
                fetched_at: Instant::now(),
            },
        );
    }
}

#[derive(Deserialize)]
struct YtdlpFormat {
    url: Option<String>,
    format_id: Option<String>,
    acodec: Option<String>,
    abr: Option<Value>,
    http_headers: Option<HashMap<String, String>>,
}

fn abr_as_f64(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn format_to_resolved(format: YtdlpFormat) -> Result<ResolvedStream, String> {
    let url = format
        .url
        .filter(|u| !u.is_empty())
        .ok_or_else(|| "yt-dlp JSON missing url".to_string())?;
    let itag = format
        .format_id
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    let codec = format
        .acodec
        .filter(|c| !c.is_empty() && c != "none")
        .unwrap_or_else(|| "unknown".to_string());
    let abr = abr_as_f64(format.abr.as_ref());
    let http_headers = format
        .http_headers
        .unwrap_or_default()
        .into_iter()
        .collect();
    Ok(ResolvedStream {
        url,
        http_headers,
        itag,
        codec,
        abr,
    })
}

pub fn parse_ytdlp_json(json: &str) -> Result<ResolvedStream, String> {
    let root: Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid yt-dlp JSON: {e}"))?;

    if let Some(downloads) = root.get("requested_downloads").and_then(|v| v.as_array()) {
        if let Some(first) = downloads.first() {
            let format: YtdlpFormat = serde_json::from_value(first.clone())
                .map_err(|e| format!("Invalid requested_downloads entry: {e}"))?;
            return format_to_resolved(format);
        }
    }

    let format: YtdlpFormat =
        serde_json::from_value(root).map_err(|e| format!("Invalid yt-dlp JSON object: {e}"))?;
    format_to_resolved(format)
}

fn looks_premium_or_age_restricted(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "sign in",
        "login required",
        "age-restricted",
        "age restricted",
        "confirm your age",
        "members-only",
        "members only",
        "premium",
        "private video",
        "this video is private",
        "join this channel",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

pub fn resolve_stream(video_id: &str) -> Result<ResolvedStream, String> {
    if !is_valid_video_id(video_id) {
        return Err(format!("Invalid YouTube video id: {video_id}"));
    }
    if let Some(cached) = cached(video_id) {
        return Ok(cached);
    }

    let bin = ensure_ytdlp().map_err(|e| {
        if e.contains("YTM_YTDLP_MISSING") {
            e
        } else {
            format!("YTM_YTDLP_MISSING: {e}")
        }
    })?;

    let url = format!("https://music.youtube.com/watch?v={video_id}");
    let mut args = vec![
        "-J".to_string(),
        "--no-playlist".to_string(),
        "-f".to_string(),
        FORMAT_SELECTOR.to_string(),
        "--no-warnings".to_string(),
    ];
    if let Some(cookies) = cookies_file_path() {
        args.push("--cookies".to_string());
        args.push(cookies.display().to_string());
    }
    args.push(url);

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_ytdlp(&bin, &arg_refs, RESOLVE_TIMEOUT)?;
    if !output.status_ok {
        let detail = output.stderr_last_line();
        if !cookies_connected() && looks_premium_or_age_restricted(&detail) {
            return Err("YTM_NOT_CONNECTED".to_string());
        }
        return Err(detail);
    }

    let json = output.stdout_lossy();
    if json.is_empty() {
        let detail = output.stderr_last_line();
        if !cookies_connected() && looks_premium_or_age_restricted(&detail) {
            return Err("YTM_NOT_CONNECTED".to_string());
        }
        return Err(if detail.is_empty() {
            "yt-dlp returned empty JSON".to_string()
        } else {
            detail
        });
    }

    let resolved = parse_ytdlp_json(&json)?;
    eprintln!(
        "[YTM] stream {video_id} itag={} codec={} abr={}",
        resolved.itag, resolved.codec, resolved.abr
    );
    store_cache(video_id, resolved.clone());
    Ok(resolved)
}
