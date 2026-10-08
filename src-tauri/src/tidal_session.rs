use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use rand::{Rng, RngCore};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use ureq::Agent;

// Public PKCE client credentials shipped with the open-source tidalapi library.
// TIDAL falls back to the best available quality when a track has no hi-res master
const AUDIO_QUALITY: &str = "HI_RES_LOSSLESS";
const CLIENT_ID: &str = "6BDSRdpK9hqEBTgU";
const CLIENT_SECRET: &str = "xeuPmY7nbpZ9IIbLAcQ93shka1VNheUAqN6IcszjTG8=";

const LOGIN_URL: &str = "https://login.tidal.com/authorize";
const REDIRECT_URI: &str = "https://tidal.com/android/login/auth";
const TOKEN_URL: &str = "https://auth.tidal.com/v1/oauth2/token";
const API_BASE: &str = "https://api.tidal.com/v1/";
const CLIENT_VERSION: &str = "2025.7.16";
const USER_AGENT: &str = "Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36";
const SESSION_FILE: &str = "tidal-playback-session.json";
const MIGRATION_MARKER_FILE: &str = "tidal-playback-session.migrated";
const LOGIN_WINDOW_LABEL: &str = "tidal-login";
const LOGIN_FINISHED_EVENT: &str = "tidal-login-finished";
const NOT_LOGGED_IN: &str = "TIDAL_NOT_LOGGED_IN";
const LOGIN_CANCELLED: &str = "TIDAL_LOGIN_CANCELLED";
const TOKEN_EXPIRED_MESSAGE: &str = "The token has expired.";
const EXPIRY_MARGIN_SECS: u64 = 60;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
struct Session {
    access_token: String,
    refresh_token: String,
    token_type: String,
    #[serde(default)]
    expires_at: u64,
    #[serde(default)]
    country_code: String,
    #[serde(default)]
    session_id: String,
}

#[derive(Deserialize)]
struct Stored<T> {
    data: T,
}

#[derive(Deserialize)]
struct MopidySession {
    access_token: Stored<String>,
    refresh_token: Stored<String>,
    token_type: Stored<String>,
    session_id: Option<Stored<Option<String>>>,
    is_pkce: Option<Stored<bool>>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct BtsManifest {
    #[serde(default, rename = "encryptionType")]
    encryption_type: Option<String>,
    #[serde(default)]
    urls: Vec<String>,
}

struct PendingLogin {
    verifier: String,
    unique_key: String,
}

struct HttpResponse {
    status: u16,
    body: String,
}

#[derive(Debug, PartialEq)]
pub enum PlaybackSource {
    Mpd(String),
    Url(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TidalSessionStatus {
    logged_in: bool,
    country_code: Option<String>,
}

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static PENDING_LOGIN: Mutex<Option<PendingLogin>> = Mutex::new(None);

fn lock_session() -> MutexGuard<'static, Option<Session>> {
    static SESSION: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
    SESSION
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn take_pending_login() -> Option<PendingLogin> {
    PENDING_LOGIN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
}

fn agent() -> &'static Agent {
    static AGENT: OnceLock<Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        let config = Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .timeout_connect(Some(Duration::from_secs(5)))
            .http_status_as_error(false)
            .build();
        Agent::new_with_config(config)
    })
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn data_file(name: &str) -> Option<PathBuf> {
    DATA_DIR.get().map(|dir| dir.join(name))
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let data = std::fs::read(path).ok()?;
    serde_json::from_slice(&data).ok()
}

fn write_private_file(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn write_session_file(session: &Session) -> Result<(), String> {
    let path = data_file(SESSION_FILE).ok_or("TIDAL session storage not initialized")?;
    let data = serde_json::to_vec_pretty(session).map_err(|e| e.to_string())?;
    write_private_file(&path, &data)
}

fn current_session() -> Option<Session> {
    lock_session().clone()
}

fn set_session(session: Session) -> Result<(), String> {
    let mut slot = lock_session();
    write_session_file(&session)?;
    *slot = Some(session);
    Ok(())
}

fn update_session(session: &Session) -> Result<(), String> {
    let mut slot = lock_session();
    if slot.is_none() {
        return Ok(());
    }
    write_session_file(session)?;
    *slot = Some(session.clone());
    Ok(())
}

fn clear_session() -> Result<(), String> {
    let mut slot = lock_session();
    *slot = None;
    let Some(path) = data_file(SESSION_FILE) else {
        return Ok(());
    };
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn migrate_mopidy_session() -> Option<Session> {
    let marker = data_file(MIGRATION_MARKER_FILE)?;
    if marker.exists() {
        return None;
    }
    let home = std::env::var_os("HOME")?;
    let mopidy_path = PathBuf::from(home).join(".local/share/mopidy/tidal/tidal-pkce.json");
    let mopidy: MopidySession = read_json(&mopidy_path)?;
    if !mopidy.is_pkce.is_some_and(|flag| flag.data) {
        return None;
    }
    let session = Session {
        access_token: mopidy.access_token.data,
        refresh_token: mopidy.refresh_token.data,
        token_type: mopidy.token_type.data,
        expires_at: 0,
        country_code: String::new(),
        session_id: mopidy.session_id.and_then(|id| id.data).unwrap_or_default(),
    };
    if let Err(e) = write_session_file(&session) {
        eprintln!("[TidalSession] Failed to save migrated session: {e}");
    }
    if let Err(e) = write_private_file(&marker, b"") {
        eprintln!("[TidalSession] Failed to write migration marker: {e}");
    }
    Some(session)
}

pub fn init(app: &AppHandle) {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = DATA_DIR.set(dir);
        }
        Err(e) => {
            eprintln!("[TidalSession] App data dir unavailable: {e}");
            return;
        }
    }
    let Some(path) = data_file(SESSION_FILE) else {
        return;
    };
    let session = if path.exists() {
        read_json(&path)
    } else {
        migrate_mopidy_session()
    };
    *lock_session() = session;
}

fn read_response(
    result: Result<ureq::http::Response<ureq::Body>, ureq::Error>,
) -> Result<HttpResponse, String> {
    let mut res = result.map_err(|e| format!("TIDAL request failed: {e}"))?;
    let status = res.status().as_u16();
    let body = res
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("TIDAL response unreadable: {e}"))?;
    Ok(HttpResponse { status, body })
}

fn is_success(res: &HttpResponse) -> bool {
    (200..300).contains(&res.status)
}

fn json_field(body: &str, field: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()?
        .get(field)?
        .as_str()
        .map(str::to_string)
}

fn error_message(res: &HttpResponse) -> String {
    let detail = json_field(&res.body, "userMessage")
        .or_else(|| json_field(&res.body, "error_description"))
        .unwrap_or_else(|| res.body.chars().take(200).collect());
    format!("TIDAL HTTP {}: {detail}", res.status)
}

fn is_token_expired(res: &HttpResponse) -> bool {
    !is_success(res)
        && json_field(&res.body, "userMessage")
            .is_some_and(|msg| msg.starts_with(TOKEN_EXPIRED_MESSAGE))
}

fn apply_token(session: &mut Session, token: TokenResponse) {
    session.access_token = token.access_token;
    session.token_type = token.token_type;
    if let Some(refresh_token) = token.refresh_token {
        session.refresh_token = refresh_token;
    }
    session.expires_at = token.expires_in.map_or(0, |secs| now_secs() + secs);
}

fn parse_token(res: &HttpResponse) -> Result<TokenResponse, String> {
    serde_json::from_str(&res.body).map_err(|e| format!("Invalid TIDAL token response: {e}"))
}

fn refresh(session: &mut Session) -> Result<(), String> {
    let res = read_response(agent().post(TOKEN_URL).send_form([
        ("grant_type", "refresh_token"),
        ("refresh_token", session.refresh_token.as_str()),
        ("client_id", CLIENT_ID),
        ("client_secret", CLIENT_SECRET),
    ]))?;
    if res.status == 400 || res.status == 401 {
        return Err(format!("{NOT_LOGGED_IN}: {}", error_message(&res)));
    }
    if !is_success(&res) {
        return Err(error_message(&res));
    }
    apply_token(session, parse_token(&res)?);
    Ok(())
}

fn ensure_fresh_token(session: &mut Session) -> Result<(), String> {
    if session.expires_at.saturating_sub(EXPIRY_MARGIN_SECS) <= now_secs() {
        refresh(session)?;
    }
    Ok(())
}

fn api_get(session: &Session, path: &str, params: &[(&str, &str)]) -> Result<HttpResponse, String> {
    let mut req = agent()
        .get(format!("{API_BASE}{path}"))
        .header(
            "authorization",
            format!("{} {}", session.token_type, session.access_token),
        )
        .header("x-tidal-client-version", CLIENT_VERSION)
        .header("User-Agent", USER_AGENT);
    if !session.country_code.is_empty() {
        req = req.query("countryCode", &session.country_code);
    }
    if !session.session_id.is_empty() {
        req = req.query("sessionId", &session.session_id);
    }
    for (key, value) in params {
        req = req.query(*key, *value);
    }
    read_response(req.call())
}

fn authorized_get(session: &mut Session, path: &str, params: &[(&str, &str)]) -> Result<Value, String> {
    let mut res = api_get(session, path, params)?;
    if is_token_expired(&res) {
        refresh(session)?;
        res = api_get(session, path, params)?;
    }
    if !is_success(&res) {
        return Err(error_message(&res));
    }
    serde_json::from_str(&res.body).map_err(|e| format!("Invalid TIDAL response: {e}"))
}

fn ensure_country_code(session: &mut Session) -> Result<(), String> {
    if !session.country_code.is_empty() {
        return Ok(());
    }
    let info = authorized_get(session, "sessions", &[])?;
    session.country_code = info
        .get("countryCode")
        .and_then(Value::as_str)
        .ok_or("TIDAL session has no country code")?
        .to_string();
    if let Some(id) = info.get("sessionId").and_then(Value::as_str) {
        session.session_id = id.to_string();
    }
    Ok(())
}

fn decode_playback_info(info: &Value) -> Result<PlaybackSource, String> {
    let mime = info
        .get("manifestMimeType")
        .and_then(Value::as_str)
        .ok_or("TIDAL playback info has no manifestMimeType")?;
    let encoded = info
        .get("manifest")
        .and_then(Value::as_str)
        .ok_or("TIDAL playback info has no manifest")?;
    let manifest = STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid TIDAL manifest encoding: {e}"))?;

    match mime {
        "application/dash+xml" => String::from_utf8(manifest)
            .map(PlaybackSource::Mpd)
            .map_err(|e| format!("Invalid TIDAL DASH manifest: {e}")),
        "application/vnd.tidal.bts" => {
            let bts: BtsManifest = serde_json::from_slice(&manifest)
                .map_err(|e| format!("Invalid TIDAL BTS manifest: {e}"))?;
            if let Some(encryption) = bts.encryption_type.filter(|e| e != "NONE") {
                return Err(format!("Encrypted TIDAL stream not supported: {encryption}"));
            }
            bts.urls
                .into_iter()
                .next()
                .map(PlaybackSource::Url)
                .ok_or_else(|| "TIDAL manifest has no URLs".to_string())
        }
        other => Err(format!("Unsupported TIDAL manifest type: {other}")),
    }
}

fn fetch_playback_info(session: &mut Session, track_id: &str) -> Result<Value, String> {
    ensure_fresh_token(session)?;
    ensure_country_code(session)?;
    authorized_get(
        session,
        &format!("tracks/{track_id}/playbackinfopostpaywall"),
        &[
            ("playbackmode", "STREAM"),
            ("audioquality", AUDIO_QUALITY),
            ("assetpresentation", "FULL"),
        ],
    )
}

pub fn fetch_source(track_id: &str) -> Result<PlaybackSource, String> {
    let mut session = current_session().ok_or(NOT_LOGGED_IN)?;
    let original = session.clone();
    let result = fetch_playback_info(&mut session, track_id);

    match &result {
        Err(e) if e.starts_with(NOT_LOGGED_IN) => {
            if let Err(err) = clear_session() {
                eprintln!("[TidalSession] Failed to clear rejected session: {err}");
            }
        }
        _ if session != original => {
            if let Err(err) = update_session(&session) {
                eprintln!("[TidalSession] Failed to save session: {err}");
            }
        }
        _ => {}
    }

    decode_playback_info(&result?)
}

fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn new_pending_login() -> PendingLogin {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 32];
    rng.fill_bytes(&mut bytes);
    PendingLogin {
        verifier: URL_SAFE_NO_PAD.encode(bytes),
        unique_key: format!("{:x}", rng.gen::<u64>()),
    }
}

fn login_url(pending: &PendingLogin) -> Result<Url, String> {
    let challenge = code_challenge(&pending.verifier);
    Url::parse_with_params(
        LOGIN_URL,
        [
            ("response_type", "code"),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("lang", "EN"),
            ("appMode", "android"),
            ("client_unique_key", pending.unique_key.as_str()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("restrict_signup", "true"),
        ],
    )
    .map_err(|e| e.to_string())
}

fn exchange_code(code: &str, pending: &PendingLogin) -> Result<Session, String> {
    let res = read_response(agent().post(TOKEN_URL).send_form([
        ("code", code),
        ("client_id", CLIENT_ID),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
        ("scope", "r_usr w_usr w_sub"),
        ("code_verifier", pending.verifier.as_str()),
        ("client_unique_key", pending.unique_key.as_str()),
    ]))?;
    if !is_success(&res) {
        return Err(error_message(&res));
    }
    let token = parse_token(&res)?;
    let mut session = Session {
        access_token: String::new(),
        refresh_token: token
            .refresh_token
            .clone()
            .ok_or("TIDAL did not return a refresh token")?,
        token_type: String::new(),
        expires_at: 0,
        country_code: String::new(),
        session_id: String::new(),
    };
    apply_token(&mut session, token);
    ensure_country_code(&mut session)?;
    Ok(session)
}

fn finish_login(app: &AppHandle, code: Option<String>, pending: PendingLogin) {
    let result = code
        .ok_or_else(|| "TIDAL login did not return an authorization code".to_string())
        .and_then(|code| exchange_code(&code, &pending))
        .and_then(set_session);
    if let Err(e) = &result {
        eprintln!("[TidalSession] Login failed: {e}");
    }
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = window.close();
    }
    let _ = app.emit(
        LOGIN_FINISHED_EVENT,
        json!({ "ok": result.is_ok(), "error": result.err() }),
    );
}

#[tauri::command]
pub async fn tidal_login_start(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = window.set_focus();
        return Ok(());
    }

    let pending = new_pending_login();
    let url = login_url(&pending)?;
    *PENDING_LOGIN.lock().unwrap_or_else(|e| e.into_inner()) = Some(pending);

    let handle = app.clone();
    let window = WebviewWindowBuilder::new(&app, LOGIN_WINDOW_LABEL, WebviewUrl::External(url))
        .title("TIDAL")
        .inner_size(480.0, 720.0)
        .on_navigation(move |url: &Url| {
            if !url.as_str().starts_with(REDIRECT_URI) {
                return true;
            }
            let Some(pending) = take_pending_login() else {
                return false;
            };
            let code = url
                .query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.into_owned());
            let app = handle.clone();
            tauri::async_runtime::spawn_blocking(move || finish_login(&app, code, pending));
            false
        })
        .build()
        .map_err(|e| {
            take_pending_login();
            e.to_string()
        })?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) && take_pending_login().is_some() {
            let _ = handle.emit(
                LOGIN_FINISHED_EVENT,
                json!({ "ok": false, "error": LOGIN_CANCELLED }),
            );
        }
    });
    Ok(())
}

#[tauri::command]
pub fn tidal_session_status() -> TidalSessionStatus {
    let session = current_session();
    TidalSessionStatus {
        logged_in: session.is_some(),
        country_code: session
            .map(|s| s.country_code)
            .filter(|code| !code.is_empty()),
    }
}

#[tauri::command]
pub fn tidal_logout() -> Result<(), String> {
    clear_session()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playback_info(mime: &str, manifest: &str) -> Value {
        json!({
            "trackId": 1,
            "manifestMimeType": mime,
            "manifest": STANDARD.encode(manifest),
        })
    }

    #[test]
    fn parses_tidalapi_session_file_format() {
        let data = r#"{"token_type":{"data":"Bearer"},"session_id":{"data":"sid"},"access_token":{"data":"at"},"refresh_token":{"data":"rt"},"is_pkce":{"data":true}}"#;
        let session: MopidySession = serde_json::from_str(data).unwrap();
        assert_eq!(session.refresh_token.data, "rt");
        assert!(session.is_pkce.is_some_and(|flag| flag.data));
        assert_eq!(session.session_id.and_then(|id| id.data).as_deref(), Some("sid"));
    }

    #[test]
    fn derives_pkce_challenge_like_tidalapi() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn decodes_dash_manifest() {
        let mpd = r#"<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"></MPD>"#;
        let info = playback_info("application/dash+xml", mpd);
        assert_eq!(
            decode_playback_info(&info),
            Ok(PlaybackSource::Mpd(mpd.to_string()))
        );
    }

    #[test]
    fn decodes_bts_manifest() {
        let bts = r#"{"mimeType":"audio/flac","codecs":"flac","encryptionType":"NONE","urls":["https://example.com/a.flac","https://example.com/b.flac"]}"#;
        let info = playback_info("application/vnd.tidal.bts", bts);
        assert_eq!(
            decode_playback_info(&info),
            Ok(PlaybackSource::Url("https://example.com/a.flac".to_string()))
        );
    }

    #[test]
    fn rejects_encrypted_bts_manifest() {
        let bts = r#"{"mimeType":"audio/flac","codecs":"flac","encryptionType":"OLD_AES","urls":["https://example.com/a.flac"]}"#;
        let info = playback_info("application/vnd.tidal.bts", bts);
        assert!(decode_playback_info(&info).is_err());
    }
}
