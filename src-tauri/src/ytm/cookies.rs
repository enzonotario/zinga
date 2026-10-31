use crate::ytm::data_file;
use crate::ytm::ytdlp::{ensure_ytdlp, normalize_browser, run_ytdlp, ytdlp_version};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::command;

const COOKIES_FILE: &str = "ytm-cookies.txt";
const META_FILE: &str = "ytm-auth.json";
const IMPORT_TIMEOUT: Duration = Duration::from_secs(120);
const CONNECTED_NAMES: &[&str] = &["__Secure-3PSID", "SAPISID"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmStatus {
    pub connected: bool,
    pub ytdlp_version: Option<String>,
    pub browser: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct AuthMeta {
    browser: Option<String>,
}

pub(crate) fn cookies_path() -> Result<PathBuf, String> {
    data_file(COOKIES_FILE).ok_or_else(|| "YTM storage not initialized".to_string())
}

fn meta_path() -> Result<PathBuf, String> {
    data_file(META_FILE).ok_or_else(|| "YTM storage not initialized".to_string())
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
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn read_meta() -> AuthMeta {
    let Ok(path) = meta_path() else {
        return AuthMeta::default();
    };
    std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_meta(meta: &AuthMeta) -> Result<(), String> {
    let path = meta_path()?;
    let data = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    write_private_file(&path, &data)
}

fn netscape_cookie_name(line: &str) -> Option<&str> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        let stripped = line
            .strip_prefix("#HttpOnly_")
            .or_else(|| line.strip_prefix("#httponly_"));
        if let Some(rest) = stripped {
            return netscape_fields(rest).map(|fields| fields[5]);
        }
        return None;
    }
    netscape_fields(line).map(|fields| fields[5])
}

fn netscape_fields(line: &str) -> Option<Vec<&str>> {
    let fields: Vec<&str> = line.split('\t').collect();
    if fields.len() >= 7 {
        Some(fields)
    } else {
        None
    }
}

pub(crate) fn cookie_file_connected(contents: &str) -> bool {
    contents.lines().any(|line| {
        netscape_cookie_name(line).is_some_and(|name| CONNECTED_NAMES.contains(&name))
    })
}

pub fn cookies_connected() -> bool {
    let Ok(path) = cookies_path() else {
        return false;
    };
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return false;
    };
    cookie_file_connected(&contents)
}

pub(crate) fn cookies_file_path() -> Option<PathBuf> {
    let path = cookies_path().ok()?;
    if path.is_file() && cookies_connected() {
        Some(path)
    } else if path.is_file() {
        Some(path)
    } else {
        None
    }
}

pub(crate) fn read_cookies_txt() -> Option<String> {
    let path = cookies_path().ok()?;
    std::fs::read_to_string(path).ok()
}

fn chmod_private(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

#[command]
pub async fn ytm_import_cookies(browser: String) -> Result<YtmStatus, String> {
    tauri::async_runtime::spawn_blocking(move || import_cookies_from_browser(&browser))
        .await
        .map_err(|e| e.to_string())?
}

fn import_cookies_from_browser(browser: &str) -> Result<YtmStatus, String> {
    let browser = normalize_browser(browser)?;
    let bin = ensure_ytdlp()?;
    let dest = cookies_path()?;
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = dest.with_extension("import.tmp");
    let _ = std::fs::remove_file(&tmp);

    let browser_arg = format!("--cookies-from-browser={browser}");
    let cookies_arg = format!("--cookies={}", tmp.display());
    let output = run_ytdlp(
        &bin,
        &[
            browser_arg.as_str(),
            cookies_arg.as_str(),
            "--skip-download",
            "https://music.youtube.com/",
        ],
        IMPORT_TIMEOUT,
    )?;

    if !tmp.is_file() {
        let detail = output.stderr_last_line();
        return Err(format!("Cookie import failed: {detail}"));
    }
    if !output.status_ok {
        let detail = output.stderr_last_line();
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Cookie import failed: {detail}"));
    }

    let contents = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    if !cookie_file_connected(&String::from_utf8_lossy(&contents)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(
            "Imported cookies are missing YouTube login markers (SAPISID / __Secure-3PSID)"
                .to_string(),
        );
    }
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    chmod_private(&dest);
    write_meta(&AuthMeta {
        browser: Some(browser),
    })?;
    status_now()
}

#[command]
pub async fn ytm_import_cookies_file(path: String) -> Result<YtmStatus, String> {
    tauri::async_runtime::spawn_blocking(move || import_cookies_from_file(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn import_cookies_from_file(path: &str) -> Result<YtmStatus, String> {
    let src = PathBuf::from(path);
    if !src.is_file() {
        return Err(format!("Cookies file not found: {path}"));
    }
    let contents = std::fs::read_to_string(&src).map_err(|e| e.to_string())?;
    if !cookie_file_connected(&contents) {
        return Err(
            "Cookies file is missing YouTube login markers (SAPISID / __Secure-3PSID)".to_string(),
        );
    }
    let dest = cookies_path()?;
    write_private_file(&dest, contents.as_bytes())?;
    write_meta(&AuthMeta { browser: None })?;
    status_now()
}

#[command]
pub async fn ytm_logout() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        if let Ok(path) = cookies_path() {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        if let Ok(path) = meta_path() {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
pub async fn ytm_status() -> Result<YtmStatus, String> {
    tauri::async_runtime::spawn_blocking(status_now)
        .await
        .map_err(|e| e.to_string())?
}

fn status_now() -> Result<YtmStatus, String> {
    let version = ytdlp_version().ok();
    let meta = read_meta();
    Ok(YtmStatus {
        connected: cookies_connected(),
        ytdlp_version: version,
        browser: meta.browser,
    })
}
