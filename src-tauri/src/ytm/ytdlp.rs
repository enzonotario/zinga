use crate::setup::sanitize_external_env;
use crate::ytm::data_dir;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use ureq::Agent;

pub(crate) const FORMAT_SELECTOR: &str = "774/141/251/140/bestaudio";
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(180);
const CMD_TIMEOUT: Duration = Duration::from_secs(90);
const VERSION_TIMEOUT: Duration = Duration::from_secs(20);

const ALLOWED_BROWSERS: &[&str] = &[
    "chrome", "chromium", "brave", "firefox", "edge", "opera", "vivaldi",
];

pub(crate) fn normalize_browser(browser: &str) -> Result<String, String> {
    let lower = browser.trim().to_ascii_lowercase();
    if ALLOWED_BROWSERS.contains(&lower.as_str()) {
        Ok(lower)
    } else {
        Err(format!("Unsupported browser: {browser}"))
    }
}

fn ytdlp_asset_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "yt-dlp.exe"
    }
    #[cfg(target_os = "macos")]
    {
        "yt-dlp_macos"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "yt-dlp_linux"
    }
}

pub fn ytdlp_bin_path() -> Result<PathBuf, String> {
    let dir = data_dir().ok_or("YTM storage not initialized")?;
    Ok(dir.join("bin").join(ytdlp_asset_name()))
}

fn download_url() -> String {
    format!(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
        ytdlp_asset_name()
    )
}

fn agent() -> Agent {
    let config = Agent::config_builder()
        .timeout_global(Some(DOWNLOAD_TIMEOUT))
        .timeout_connect(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build();
    Agent::new_with_config(config)
}

pub(crate) fn write_executable(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("download.tmp");
    {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o755);
        }
        let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
        file.write_all(data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn ensure_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn ensure_ytdlp() -> Result<PathBuf, String> {
    let path = ytdlp_bin_path()?;
    if path.is_file() {
        return Ok(path);
    }

    let _guard = ensure_lock()
        .lock()
        .map_err(|_| "yt-dlp ensure lock poisoned".to_string())?;
    if path.is_file() {
        return Ok(path);
    }

    eprintln!("[YTM] Downloading yt-dlp from {}", download_url());
    let mut response = agent()
        .get(download_url())
        .call()
        .map_err(|e| format!("YTM_YTDLP_MISSING: download failed: {e}"))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("YTM_YTDLP_MISSING: download HTTP {status}"));
    }
    let body = response
        .body_mut()
        .with_config()
        .limit(100 * 1024 * 1024)
        .read_to_vec()
        .map_err(|e| format!("YTM_YTDLP_MISSING: read failed: {e}"))?;
    if body.len() < 1024 {
        return Err("YTM_YTDLP_MISSING: download too small".to_string());
    }
    write_executable(&path, &body)?;
    Ok(path)
}

pub fn ytdlp_update() -> Result<String, String> {
    let path = ensure_ytdlp()?;
    let output = run_ytdlp(&path, &["-U"], CMD_TIMEOUT)?;
    Ok(output.stdout_lossy())
}

pub fn ytdlp_version() -> Result<String, String> {
    let path = ensure_ytdlp()?;
    let output = run_ytdlp(&path, &["--version"], VERSION_TIMEOUT)?;
    let version = output.stdout_lossy();
    let version = version.lines().next().unwrap_or(&version).trim();
    if version.is_empty() {
        return Err("yt-dlp returned empty version".to_string());
    }
    Ok(version.to_string())
}

pub(crate) struct YtdlpOutput {
    pub status_ok: bool,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl YtdlpOutput {
    pub fn stdout_lossy(&self) -> String {
        String::from_utf8_lossy(&self.stdout).trim().to_string()
    }

    pub fn stderr_lossy(&self) -> String {
        String::from_utf8_lossy(&self.stderr).trim().to_string()
    }

    pub fn stderr_last_line(&self) -> String {
        self.stderr_lossy()
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("yt-dlp failed")
            .to_string()
    }
}

pub(crate) fn run_ytdlp(bin: &Path, args: &[&str], timeout: Duration) -> Result<YtdlpOutput, String> {
    let mut command = Command::new(bin);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sanitize_external_env(&mut command);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {e}"))?;

    // Drain pipes while waiting so a large -J JSON body cannot fill the pipe and hang yt-dlp.
    let stdout_handle = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = out.read_to_end(&mut buf);
            buf
        })
    });
    let stderr_handle = child.stderr.take().map(|mut err| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = err.read_to_end(&mut buf);
            buf
        })
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("yt-dlp timed out after {}s", timeout.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => return Err(format!("yt-dlp wait failed: {e}")),
        }
    };

    let stdout = stdout_handle
        .map(|handle| handle.join().unwrap_or_default())
        .unwrap_or_default();
    let stderr = stderr_handle
        .map(|handle| handle.join().unwrap_or_default())
        .unwrap_or_default();
    Ok(YtdlpOutput {
        status_ok: status.success(),
        stdout,
        stderr,
    })
}
