use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub mopidy: ServiceStatus,
    pub icecast: ServiceStatus,
    pub ffmpeg: ServiceStatus,
    pub mopidy_config_exists: bool,
    pub icecast_config_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSession {
    pub session_name: Option<String>,
    pub has_tmux: bool,
}

fn is_command_found(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_dpkg_installed(package: &str) -> bool {
    Command::new("dpkg")
        .args(["-s", package])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn get_command_version(name: &str, args: &[&str]) -> Option<String> {
    Command::new(name)
        .args(args)
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout).to_string();
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            let combined = if out.trim().is_empty() { err } else { out };
            combined.lines().next().map(|l| l.trim().to_string())
        })
        .filter(|s| !s.is_empty())
}

fn is_process_running(pattern: &str) -> bool {
    Command::new("pgrep")
        .args(["-f", pattern])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_systemd_active(service: &str) -> bool {
    Command::new("systemctl")
        .args(["is-active", service])
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.trim() == "active"
        })
        .unwrap_or(false)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn find_script(app_handle: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let mut tried = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        for candidate in [
            resource_dir.join("scripts").join(name),
            resource_dir.join(name),
        ] {
            if candidate.exists() {
                return Ok(candidate);
            }
            tried.push(candidate.display().to_string());
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("scripts")
        .join(name);

    if dev_path.exists() {
        return Ok(dev_path);
    }
    tried.push(dev_path.display().to_string());

    Err(format!(
        "Script '{}' not found. Tried: {}",
        name,
        tried.join(", ")
    ))
}

fn spawn_terminal(args: &[&str]) -> Result<(), String> {
    let terminals: [(&str, &[&str]); 4] = [
        ("gnome-terminal", &["--"]),
        ("xfce4-terminal", &["-x"]),
        ("konsole", &["-e"]),
        ("xterm", &["-e"]),
    ];

    for (term, prefix) in terminals {
        if !is_command_found(term) {
            continue;
        }

        let mut full_args: Vec<&str> = prefix.to_vec();
        full_args.extend_from_slice(args);

        let mut command = Command::new("setsid");
        command.arg(term).args(&full_args);
        sanitize_external_env(&mut command);
        let result = command.spawn();

        match result {
            Ok(_) => return Ok(()),
            Err(e) => return Err(format!("Failed to spawn '{}': {}", term, e)),
        }
    }

    Err(
        "No supported terminal found (tried gnome-terminal, xfce4-terminal, konsole, xterm)"
            .to_string(),
    )
}

fn sanitize_external_env(command: &mut Command) {
    for key in [
        "APPDIR",
        "APPIMAGE",
        "APPIMAGE_SILENT_INSTALL",
        "ARGV0",
        "LD_LIBRARY_PATH",
        "GST_PLUGIN_SYSTEM_PATH",
        "GST_PLUGIN_SYSTEM_PATH_1_0",
        "GIO_EXTRA_MODULES",
        "GDK_PIXBUF_MODULE_FILE",
        "GTK_EXE_PREFIX",
        "GTK_DATA_PREFIX",
        "GTK_PATH",
        "GTK_IM_MODULE_FILE",
        "GTK_MODULES",
        "GTK3_MODULES",
        "QT_PLUGIN_PATH",
        "GSETTINGS_SCHEMA_DIR",
        "PYTHONHOME",
        "PYTHONPATH",
    ] {
        command.env_remove(key);
    }
}

fn run_script(
    app_handle: &AppHandle,
    name: &str,
    extra_args: &[&str],
) -> Result<ScriptSession, String> {
    let script_path = find_script(app_handle, name)?;

    let _ = Command::new("chmod")
        .args(["+x", &script_path.to_string_lossy()])
        .output();

    let script_str = script_path.to_string_lossy().to_string();
    let has_tmux = is_command_found("tmux");

    if has_tmux {
        let session_name = format!("zinga-{}", name.trim_end_matches(".sh"));

        let _ = Command::new("tmux")
            .args(["kill-session", "-t", &session_name])
            .output();

        let mut tmux_args = vec![
            "new-session".to_string(),
            "-d".to_string(),
            "-s".to_string(),
            session_name.clone(),
            "bash".to_string(),
            script_str,
        ];
        for arg in extra_args {
            tmux_args.push(arg.to_string());
        }

        let mut tmux_command = Command::new("tmux");
        tmux_command.args(&tmux_args);
        sanitize_external_env(&mut tmux_command);
        let tmux_result = tmux_command
            .output()
            .map_err(|e| format!("Failed to start tmux session: {}", e))?;

        if !tmux_result.status.success() {
            let stderr = String::from_utf8_lossy(&tmux_result.stderr);
            return Err(format!("tmux error: {}", stderr));
        }

        Ok(ScriptSession {
            session_name: Some(session_name),
            has_tmux: true,
        })
    } else {
        let mut terminal_args = vec!["bash", &script_str];
        let extra_owned: Vec<String> = extra_args.iter().map(|s| s.to_string()).collect();
        for arg in &extra_owned {
            terminal_args.push(arg);
        }

        spawn_terminal(&terminal_args)?;

        Ok(ScriptSession {
            session_name: None,
            has_tmux: false,
        })
    }
}

#[tauri::command]
pub fn system_check() -> SystemStatus {
    let mopidy = ServiceStatus {
        installed: is_command_found("mopidy"),
        running: is_process_running("python.*mopidy"),
        version: get_command_version("mopidy", &["--version"]),
    };

    let icecast = ServiceStatus {
        installed: is_dpkg_installed("icecast2"),
        running: is_systemd_active("icecast2"),
        version: get_command_version("icecast2", &["-v"]),
    };

    let ffmpeg = ServiceStatus {
        installed: is_command_found("ffmpeg"),
        running: is_process_running("ffmpeg.*icecast"),
        version: get_command_version("ffmpeg", &["-version"]),
    };

    let mopidy_config_exists = home_dir()
        .map(|h| h.join(".config/mopidy/mopidy.conf").exists())
        .unwrap_or(false);

    let icecast_config_exists = PathBuf::from("/etc/icecast2/icecast.xml").exists();

    SystemStatus {
        mopidy,
        icecast,
        ffmpeg,
        mopidy_config_exists,
        icecast_config_exists,
    }
}

#[tauri::command]
pub fn run_setup_script(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "setup.sh", &["--skip-sudo"])
}

#[tauri::command]
pub fn run_start_services(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "start.sh", &[])
}

#[tauri::command]
pub fn run_stop_services(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "stop.sh", &[])
}

#[tauri::command]
pub fn run_restart_services(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "restart.sh", &[])
}

#[tauri::command]
pub fn run_verify(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "verify.sh", &[])
}

#[tauri::command]
pub fn get_tmux_output(session_name: String) -> Result<String, String> {
    let output = Command::new("tmux")
        .args(["capture-pane", "-t", &session_name, "-p", "-S", "-500"])
        .output()
        .map_err(|e| format!("Failed to capture tmux pane: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn send_tmux_input(session_name: String, data: String) -> Result<(), String> {
    let mut rest = data.as_str();

    while !rest.is_empty() {
        if let Some((key, len)) = tmux_key(rest) {
            send_tmux_key(&session_name, &key)?;
            rest = &rest[len..];
            continue;
        }

        let len = rest
            .char_indices()
            .find_map(|(index, ch)| {
                if index > 0
                    && (ch == '\u{1b}'
                        || ch == '\r'
                        || ch == '\n'
                        || ch == '\u{7f}'
                        || ch == '\t'
                        || ch.is_control())
                {
                    Some(index)
                } else {
                    None
                }
            })
            .unwrap_or(rest.len());

        let literal = &rest[..len];
        if !literal.is_empty() {
            send_tmux_literal(&session_name, literal)?;
        }
        rest = &rest[len..];
    }

    Ok(())
}

fn send_tmux_literal(session_name: &str, data: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session_name, "-l", data])
        .output()
        .map_err(|e| format!("Failed to send tmux input: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

fn send_tmux_key(session_name: &str, key: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session_name, key])
        .output()
        .map_err(|e| format!("Failed to send tmux key: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

fn tmux_key(data: &str) -> Option<(String, usize)> {
    for (sequence, key) in [
        ("\u{1b}[A", "Up"),
        ("\u{1b}[B", "Down"),
        ("\u{1b}[C", "Right"),
        ("\u{1b}[D", "Left"),
        ("\u{1b}[H", "Home"),
        ("\u{1b}[F", "End"),
        ("\u{1b}[3~", "Delete"),
        ("\u{1b}[5~", "PageUp"),
        ("\u{1b}[6~", "PageDown"),
        ("\u{1b}", "Escape"),
        ("\r", "Enter"),
        ("\n", "Enter"),
        ("\u{7f}", "BSpace"),
        ("\t", "Tab"),
    ] {
        if data.starts_with(sequence) {
            return Some((key.to_string(), sequence.len()));
        }
    }

    let ch = data.chars().next()?;
    if ch.is_control() {
        let value = ch as u32;
        if (1..=26).contains(&value) {
            let letter = char::from_u32(value + 96)?;
            return Some((format!("C-{}", letter), ch.len_utf8()));
        }
    }

    None
}

#[tauri::command]
pub fn is_tmux_session_alive(session_name: String) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", &session_name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn kill_tmux_session(session_name: String) -> Result<(), String> {
    Command::new("tmux")
        .args(["kill-session", "-t", &session_name])
        .output()
        .map_err(|e| format!("Failed to kill tmux session: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn run_uninstall(app_handle: AppHandle) -> Result<ScriptSession, String> {
    run_script(&app_handle, "uninstall.sh", &[])
}

#[tauri::command]
pub fn open_tmux_terminal(session_name: String) -> Result<(), String> {
    spawn_terminal(&["tmux", "attach", "-t", &session_name])
}

#[tauri::command]
pub fn debug_terminal(app_handle: AppHandle) -> Result<String, String> {
    let mut info = Vec::new();

    let display = std::env::var("DISPLAY").unwrap_or_else(|_| "(not set)".into());
    let wayland = std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "(not set)".into());
    let dbus = std::env::var("DBUS_SESSION_BUS_ADDRESS").unwrap_or_else(|_| "(not set)".into());
    info.push(format!("DISPLAY={}", display));
    info.push(format!("WAYLAND_DISPLAY={}", wayland));
    info.push(format!("DBUS_SESSION_BUS_ADDRESS={}", dbus));

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        info.push(format!("resource_dir={}", resource_dir.display()));
        if let Ok(entries) = std::fs::read_dir(&resource_dir) {
            let files: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    if is_dir {
                        format!("{}/", name)
                    } else {
                        name
                    }
                })
                .collect();
            info.push(format!("resource files: {}", files.join(", ")));
        }
        let scripts_dir = resource_dir.join("scripts");
        if scripts_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&scripts_dir) {
                let files: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();
                info.push(format!("scripts/ contents: {}", files.join(", ")));
            }
        } else {
            info.push("scripts/ dir: not found".to_string());
        }
    } else {
        info.push("resource_dir: error".to_string());
    }

    for term in ["gnome-terminal", "xfce4-terminal", "konsole", "xterm"] {
        let found = is_command_found(term);
        info.push(format!(
            "{}: {}",
            term,
            if found { "found" } else { "not found" }
        ));
    }

    let tmux_found = is_command_found("tmux");
    info.push(format!(
        "tmux: {}",
        if tmux_found { "found" } else { "not found" }
    ));
    let setsid_found = is_command_found("setsid");
    info.push(format!(
        "setsid: {}",
        if setsid_found { "found" } else { "not found" }
    ));

    let test = Command::new("setsid")
        .args(["gnome-terminal", "--", "bash", "-c", "sleep 3"])
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .output();

    match test {
        Ok(o) => {
            info.push(format!(
                "test spawn exit={}, stderr={}",
                o.status,
                String::from_utf8_lossy(&o.stderr).trim()
            ));
        }
        Err(e) => {
            info.push(format!("test spawn error: {}", e));
        }
    }

    Ok(info.join("\n"))
}

#[tauri::command]
pub async fn shell_open(app_handle: AppHandle, path: String) -> Result<(), String> {
    app_handle
        .opener()
        .open_path(path, None::<&str>)
        .map_err(|e| format!("Failed to open shell path: {}", e))?;
    Ok(())
}
