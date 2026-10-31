use crate::ytm::cookies::{cookies_connected, cookies_file_path};
use crate::ytm::is_valid_video_id;
use crate::ytm::jsruntime::js_runtime_ytdlp_arg;
use crate::ytm::ytdlp::{ensure_ytdlp, run_ytdlp, FORMAT_SELECTOR, YtdlpOutput};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const VIDEO_FORMAT_SELECTOR: &str = "bv*[vcodec^=avc1][protocol^=https][height<=1080]/bv*[vcodec^=avc1][protocol^=https]/bv*[protocol^=https][height<=720]";

fn run_resolve(
    bin: &Path,
    url: &str,
    format: &str,
    cookies: Option<&Path>,
) -> Result<YtdlpOutput, String> {
    let mut args = vec![
        "-J".to_string(),
        "--no-playlist".to_string(),
        "-f".to_string(),
        format.to_string(),
        "--no-warnings".to_string(),
    ];
    // Official yt-dlp_linux already bundles yt-dlp-ejs scripts; only a JS runtime is required.
    // Clear defaults so yt-dlp uses the runtime we resolved (deno > node > bun).
    if let Some(runtime) = js_runtime_ytdlp_arg() {
        args.push("--no-js-runtimes".to_string());
        args.push("--js-runtimes".to_string());
        args.push(runtime);
    }
    if let Some(path) = cookies {
        args.push("--cookies".to_string());
        args.push(path.display().to_string());
    }
    args.push(url.to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_ytdlp(bin, &arg_refs, RESOLVE_TIMEOUT)
}

pub fn map_ytdlp_resolve_error(stderr: &str, cookies_present: bool) -> String {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("sign in to confirm you") || lower.contains("confirm you're not a bot")
        || lower.contains("confirm you\u{2019}re not a bot")
    {
        return if cookies_present {
            "YTM_BOT_CHECK".to_string()
        } else {
            "YTM_NOT_CONNECTED".to_string()
        };
    }
    if lower.contains("signature solving failed")
        || lower.contains("only images are available")
        || lower.contains("challenge solver")
        || lower.contains("n challenge")
        || (lower.contains("javascript runtime") && lower.contains("not found"))
    {
        return "YTM_JS_RUNTIME_MISSING".to_string();
    }
    if !cookies_present && looks_premium_or_age_restricted(stderr) {
        return "YTM_NOT_CONNECTED".to_string();
    }
    stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(stderr)
        .trim()
        .to_string()
}

fn resolve_failure(output: &YtdlpOutput, cookies_present: bool) -> String {
    let detail = if output.stderr_lossy().is_empty() {
        "yt-dlp returned empty JSON".to_string()
    } else {
        output.stderr_lossy()
    };
    map_ytdlp_resolve_error(&detail, cookies_present)
}

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(90);
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Debug)]
pub struct ResolvedStream {
    pub url: String,
    pub http_headers: Vec<(String, String)>,
    pub itag: String,
    pub codec: String,
    pub abr: f64,
    pub duration_sec: Option<f64>,
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
        duration_sec: None,
    })
}

pub fn parse_ytdlp_json(json: &str) -> Result<ResolvedStream, String> {
    let root: Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid yt-dlp JSON: {e}"))?;
    let duration_sec = root
        .get("duration")
        .and_then(Value::as_f64)
        .filter(|d| d.is_finite() && *d > 0.0);

    let format_value = root
        .get("requested_downloads")
        .and_then(|v| v.as_array())
        .and_then(|downloads| downloads.first().cloned())
        .unwrap_or(root);
    let format: YtdlpFormat = serde_json::from_value(format_value)
        .map_err(|e| format!("Invalid yt-dlp format entry: {e}"))?;
    let mut resolved = format_to_resolved(format)?;
    resolved.duration_sec = duration_sec;
    Ok(resolved)
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
    let cookies = cookies_file_path();
    let cookies_present = cookies.is_some();
    let output = run_resolve(&bin, &url, FORMAT_SELECTOR, cookies.as_deref())?;
    let output = if !output.status_ok || output.stdout_lossy().is_empty() {
        let detail = output.stderr_last_line();
        // Cookie jars can break JS challenge solving and leave only storyboards; retry bare.
        if cookies_present
            && (detail.contains("Requested format is not available")
                || detail.contains("Only images are available")
                || output.stdout_lossy().is_empty())
        {
            run_resolve(&bin, &url, FORMAT_SELECTOR, None)?
        } else {
            output
        }
    } else {
        output
    };
    if !output.status_ok {
        return Err(resolve_failure(&output, cookies_connected()));
    }

    let json = output.stdout_lossy();
    if json.is_empty() {
        return Err(resolve_failure(&output, cookies_connected()));
    }

    let resolved = parse_ytdlp_json(&json)?;
    eprintln!(
        "[YTM] stream {video_id} itag={} codec={} abr={}",
        resolved.itag, resolved.codec, resolved.abr
    );
    store_cache(video_id, resolved.clone());
    Ok(resolved)
}

#[derive(Clone, Debug)]
pub struct ResolvedVideo {
    pub url: String,
    pub http_headers: Vec<(String, String)>,
    pub itag: String,
    pub vcodec: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YtmVideoInfo {
    pub width: u32,
    pub height: u32,
    pub itag: String,
    pub vcodec: String,
}

struct VideoCacheEntry {
    stream: ResolvedVideo,
    fetched_at: Instant,
}

fn video_cache() -> &'static Mutex<HashMap<String, VideoCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, VideoCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_video(video_id: &str) -> Option<ResolvedVideo> {
    let cache = video_cache().lock().ok()?;
    let entry = cache.get(video_id)?;
    if entry.fetched_at.elapsed() >= CACHE_TTL {
        return None;
    }
    Some(entry.stream.clone())
}

fn store_video_cache(video_id: &str, stream: ResolvedVideo) {
    if let Ok(mut cache) = video_cache().lock() {
        cache.insert(
            video_id.to_string(),
            VideoCacheEntry {
                stream,
                fetched_at: Instant::now(),
            },
        );
    }
}

pub fn invalidate_video_cache(video_id: &str) {
    if let Ok(mut cache) = video_cache().lock() {
        cache.remove(video_id);
    }
}

#[derive(Deserialize)]
struct YtdlpVideoFormat {
    url: Option<String>,
    format_id: Option<String>,
    vcodec: Option<String>,
    width: Option<Value>,
    height: Option<Value>,
    http_headers: Option<HashMap<String, String>>,
}

fn value_as_u32(value: Option<&Value>) -> u32 {
    match value {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0) as u32,
        Some(Value::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn format_to_resolved_video(format: YtdlpVideoFormat) -> Result<ResolvedVideo, String> {
    let url = format
        .url
        .filter(|u| !u.is_empty())
        .ok_or_else(|| "yt-dlp JSON missing video url".to_string())?;
    if url.contains(".m3u8") {
        return Err("Resolved video format is HLS (m3u8); expected progressive".to_string());
    }
    let itag = format
        .format_id
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    let vcodec = format
        .vcodec
        .filter(|c| !c.is_empty() && c != "none")
        .unwrap_or_else(|| "unknown".to_string());
    let width = value_as_u32(format.width.as_ref());
    let height = value_as_u32(format.height.as_ref());
    let http_headers = format
        .http_headers
        .unwrap_or_default()
        .into_iter()
        .collect();
    Ok(ResolvedVideo {
        url,
        http_headers,
        itag,
        vcodec,
        width,
        height,
    })
}

pub fn parse_ytdlp_video_json(json: &str) -> Result<ResolvedVideo, String> {
    let root: Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid yt-dlp JSON: {e}"))?;

    if let Some(downloads) = root.get("requested_downloads").and_then(|v| v.as_array()) {
        if let Some(first) = downloads.first() {
            let format: YtdlpVideoFormat = serde_json::from_value(first.clone())
                .map_err(|e| format!("Invalid requested_downloads entry: {e}"))?;
            return format_to_resolved_video(format);
        }
    }

    let format: YtdlpVideoFormat =
        serde_json::from_value(root).map_err(|e| format!("Invalid yt-dlp JSON object: {e}"))?;
    format_to_resolved_video(format)
}

pub fn resolve_video(video_id: &str) -> Result<ResolvedVideo, String> {
    if !is_valid_video_id(video_id) {
        return Err(format!("Invalid YouTube video id: {video_id}"));
    }
    if let Some(cached) = cached_video(video_id) {
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
    let cookies = cookies_file_path();
    let cookies_present = cookies.is_some();
    let output = run_resolve(&bin, &url, VIDEO_FORMAT_SELECTOR, cookies.as_deref())?;
    let output = if !output.status_ok || output.stdout_lossy().is_empty() {
        let detail = output.stderr_last_line();
        if cookies_present
            && (detail.contains("Requested format is not available")
                || detail.contains("Only images are available")
                || output.stdout_lossy().is_empty())
        {
            run_resolve(&bin, &url, VIDEO_FORMAT_SELECTOR, None)?
        } else {
            output
        }
    } else {
        output
    };
    if !output.status_ok {
        return Err(resolve_failure(&output, cookies_connected()));
    }

    let json = output.stdout_lossy();
    if json.is_empty() {
        return Err(resolve_failure(&output, cookies_connected()));
    }

    let resolved = parse_ytdlp_video_json(&json)?;
    eprintln!(
        "[YTM] video {video_id} itag={} vcodec={} {}x{}",
        resolved.itag, resolved.vcodec, resolved.width, resolved.height
    );
    store_video_cache(video_id, resolved.clone());
    Ok(resolved)
}
