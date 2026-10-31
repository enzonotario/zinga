use crate::setup::sanitize_external_env;
use crate::ytm::data_dir;
use crate::ytm::ytdlp::write_executable;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use ureq::Agent;

const VERSION_TIMEOUT: Duration = Duration::from_secs(5);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsRuntime {
    pub kind: &'static str,
    pub path: PathBuf,
    pub version: String,
}

impl JsRuntime {
    pub fn label(&self) -> String {
        format!("{} {}", self.kind, self.version.trim())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeKind {
    Deno,
    Node,
    Bun,
}

impl RuntimeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RuntimeKind::Deno => "deno",
            RuntimeKind::Node => "node",
            RuntimeKind::Bun => "bun",
        }
    }

    fn priority(self) -> u8 {
        match self {
            RuntimeKind::Deno => 0,
            RuntimeKind::Node => 1,
            RuntimeKind::Bun => 2,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeCandidate {
    pub kind: RuntimeKind,
    pub path: PathBuf,
}

fn cache() -> &'static Mutex<Option<JsRuntime>> {
    static CACHE: OnceLock<Mutex<Option<JsRuntime>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn ensure_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn managed_deno_path() -> Option<PathBuf> {
    data_dir().map(|dir| dir.join("bin").join(deno_bin_name()))
}

fn deno_bin_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "deno.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "deno"
    }
}

fn deno_asset_name() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "deno-x86_64-unknown-linux-gnu.zip"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "deno-aarch64-unknown-linux-gnu.zip"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "deno-x86_64-apple-darwin.zip"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "deno-aarch64-apple-darwin.zip"
    }
    #[cfg(not(any(
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
    )))]
    {
        "deno-x86_64-unknown-linux-gnu.zip"
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn path_lookup(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn nvm_node_candidates(home: &Path) -> Vec<PathBuf> {
    let versions = home.join(".nvm/versions/node");
    let Ok(entries) = std::fs::read_dir(&versions) else {
        return Vec::new();
    };
    let mut nodes: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let bin = entry.path().join("bin").join("node");
            bin.is_file().then_some((name, bin))
        })
        .collect();
    nodes.sort_by(|a, b| b.0.cmp(&a.0));
    nodes.into_iter().map(|(_, path)| path).collect()
}

pub fn order_runtime_candidates(mut candidates: Vec<RuntimeCandidate>) -> Vec<RuntimeCandidate> {
    candidates.sort_by_key(|c| (c.kind.priority(), c.path.display().to_string()));
    let mut deduped = Vec::new();
    for candidate in candidates {
        if deduped
            .iter()
            .any(|existing: &RuntimeCandidate| existing.path == candidate.path)
        {
            continue;
        }
        deduped.push(candidate);
    }
    deduped
}

pub fn collect_runtime_candidates(
    managed_deno: Option<PathBuf>,
    path_bins: &[(RuntimeKind, PathBuf)],
    home_bins: &[(RuntimeKind, PathBuf)],
    nvm_nodes: &[PathBuf],
) -> Vec<RuntimeCandidate> {
    let mut out = Vec::new();
    let mut push = |kind: RuntimeKind, path: PathBuf| {
        if path.as_os_str().is_empty() {
            return;
        }
        out.push(RuntimeCandidate { kind, path });
    };

    if let Some(path) = managed_deno {
        push(RuntimeKind::Deno, path);
    }
    for (kind, path) in path_bins {
        push(*kind, path.clone());
    }
    for (kind, path) in home_bins {
        push(*kind, path.clone());
    }
    for path in nvm_nodes {
        push(RuntimeKind::Node, path.clone());
    }

    order_runtime_candidates(out)
        .into_iter()
        .filter(|candidate| candidate.path.is_file())
        .collect()
}

fn discover_candidates() -> Vec<RuntimeCandidate> {
    let home = home_dir();
    let mut path_bins = Vec::new();
    for (kind, name) in [
        (RuntimeKind::Deno, "deno"),
        (RuntimeKind::Node, "node"),
        (RuntimeKind::Bun, "bun"),
    ] {
        if let Some(path) = path_lookup(name) {
            path_bins.push((kind, path));
        }
    }

    let mut home_bins = Vec::new();
    if let Some(home) = home.as_ref() {
        home_bins.push((RuntimeKind::Deno, home.join(".deno/bin/deno")));
        home_bins.push((RuntimeKind::Node, home.join(".volta/bin/node")));
        home_bins.push((RuntimeKind::Bun, home.join(".bun/bin/bun")));
        home_bins.push((RuntimeKind::Bun, home.join(".volta/bin/bun")));
    }
    let nvm = home
        .as_ref()
        .map(|h| nvm_node_candidates(h))
        .unwrap_or_default();

    collect_runtime_candidates(managed_deno_path(), &path_bins, &home_bins, &nvm)
}

fn parse_version_output(kind: RuntimeKind, stdout: &str) -> Option<String> {
    let line = stdout.lines().next()?.trim();
    if line.is_empty() {
        return None;
    }
    match kind {
        RuntimeKind::Node => Some(line.trim_start_matches('v').to_string()),
        RuntimeKind::Deno | RuntimeKind::Bun => {
            let token = line
                .split_whitespace()
                .find(|part| part.chars().next().is_some_and(|c| c.is_ascii_digit()))
                .unwrap_or(line);
            Some(token.trim_start_matches('v').to_string())
        }
    }
}

pub fn verify_runtime(kind: RuntimeKind, path: &Path) -> Option<JsRuntime> {
    if !path.is_file() {
        return None;
    }
    let mut command = Command::new(path);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sanitize_external_env(&mut command);
    let mut child = command.spawn().ok()?;
    let stdout_handle = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = out.read_to_end(&mut buf);
            buf
        })
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= VERSION_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return None,
        }
    };
    if !status.success() {
        return None;
    }
    let stdout = stdout_handle
        .map(|h| String::from_utf8_lossy(&h.join().unwrap_or_default()).to_string())
        .unwrap_or_default();
    let version = parse_version_output(kind, &stdout)?;
    Some(JsRuntime {
        kind: kind.as_str(),
        path: path.to_path_buf(),
        version,
    })
}

fn probe_candidates(candidates: &[RuntimeCandidate]) -> Option<JsRuntime> {
    for candidate in candidates {
        if let Some(runtime) = verify_runtime(candidate.kind, &candidate.path) {
            return Some(runtime);
        }
    }
    None
}

pub fn resolve_js_runtime() -> Option<(String, PathBuf)> {
    if let Ok(guard) = cache().lock() {
        if let Some(cached) = guard.as_ref() {
            if cached.path.is_file() {
                return Some((cached.kind.to_string(), cached.path.clone()));
            }
        }
    }

    let runtime = probe_candidates(&discover_candidates()).or_else(|| {
        let _ = ensure_deno();
        probe_candidates(&discover_candidates())
    })?;

    if let Ok(mut guard) = cache().lock() {
        *guard = Some(runtime.clone());
    }
    Some((runtime.kind.to_string(), runtime.path))
}

pub fn js_runtime_label() -> Option<String> {
    if let Ok(guard) = cache().lock() {
        if let Some(cached) = guard.as_ref() {
            if cached.path.is_file() {
                return Some(cached.label());
            }
        }
    }
    let runtime = probe_candidates(&discover_candidates())?;
    if let Ok(mut guard) = cache().lock() {
        *guard = Some(runtime.clone());
    }
    Some(runtime.label())
}

pub fn js_runtime_ytdlp_arg() -> Option<String> {
    let (kind, path) = resolve_js_runtime()?;
    Some(format!("{kind}:{}", path.display()))
}

fn agent() -> Agent {
    let config = Agent::config_builder()
        .timeout_global(Some(DOWNLOAD_TIMEOUT))
        .timeout_connect(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build();
    Agent::new_with_config(config)
}

fn extract_deno_from_zip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Invalid deno zip: {e}"))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed reading deno zip entry: {e}"))?;
        let name = file.name().to_string();
        let file_name = Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if file_name == "deno" || file_name == "deno.exe" {
            let mut out = Vec::with_capacity(file.size() as usize);
            file.read_to_end(&mut out)
                .map_err(|e| format!("Failed extracting deno: {e}"))?;
            if out.len() < 1024 {
                return Err("Extracted deno binary too small".to_string());
            }
            return Ok(out);
        }
    }
    Err("deno binary not found in release zip".to_string())
}

pub fn ensure_deno() -> Result<PathBuf, String> {
    let path = managed_deno_path().ok_or_else(|| "YTM storage not initialized".to_string())?;
    if path.is_file() {
        if verify_runtime(RuntimeKind::Deno, &path).is_some() {
            return Ok(path);
        }
    }

    let _guard = ensure_lock()
        .lock()
        .map_err(|_| "deno ensure lock poisoned".to_string())?;
    if path.is_file() {
        if verify_runtime(RuntimeKind::Deno, &path).is_some() {
            return Ok(path);
        }
    }

    let url = format!(
        "https://github.com/denoland/deno/releases/latest/download/{}",
        deno_asset_name()
    );
    eprintln!("[YTM] Downloading Deno from {url}");
    let mut response = agent()
        .get(&url)
        .call()
        .map_err(|e| format!("Deno download failed: {e}"))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("Deno download HTTP {status}"));
    }
    let body = response
        .body_mut()
        .with_config()
        .limit(200 * 1024 * 1024)
        .read_to_vec()
        .map_err(|e| format!("Deno download read failed: {e}"))?;
    let binary = extract_deno_from_zip(&body)?;
    write_executable(&path, &binary)?;
    if verify_runtime(RuntimeKind::Deno, &path).is_none() {
        return Err("Downloaded deno failed --version".to_string());
    }
    if let Ok(mut guard) = cache().lock() {
        *guard = verify_runtime(RuntimeKind::Deno, &path);
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_candidates_deno_then_node_then_bun() {
        let ordered = order_runtime_candidates(vec![
            RuntimeCandidate {
                kind: RuntimeKind::Bun,
                path: PathBuf::from("/tmp/bun"),
            },
            RuntimeCandidate {
                kind: RuntimeKind::Node,
                path: PathBuf::from("/tmp/node"),
            },
            RuntimeCandidate {
                kind: RuntimeKind::Deno,
                path: PathBuf::from("/tmp/deno"),
            },
            RuntimeCandidate {
                kind: RuntimeKind::Node,
                path: PathBuf::from("/tmp/node"),
            },
        ]);
        assert_eq!(
            ordered
                .iter()
                .map(|c| c.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["deno", "node", "bun"]
        );
    }

    #[test]
    fn parses_version_strings() {
        assert_eq!(
            parse_version_output(RuntimeKind::Node, "v24.13.0\n"),
            Some("24.13.0".into())
        );
        assert_eq!(
            parse_version_output(RuntimeKind::Deno, "deno 2.5.1 (stable)\n"),
            Some("2.5.1".into())
        );
        assert_eq!(
            parse_version_output(RuntimeKind::Bun, "1.2.11\n"),
            Some("1.2.11".into())
        );
    }
}
