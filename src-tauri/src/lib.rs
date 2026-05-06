#[cfg_attr(mobile, tauri::mobile_entry_point)]
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_sql::{Migration, MigrationKind};

mod upnp;
use upnp::{
    upnp_connect, upnp_disconnect, upnp_discover, upnp_get_media_info, upnp_get_position_info,
    upnp_get_services, upnp_get_transport_info, upnp_get_volume, upnp_next, upnp_pause, upnp_play,
    upnp_previous, upnp_seek, upnp_set_playlist, upnp_set_uri_and_play, upnp_set_volume, upnp_stop,
    AppState,
};

mod library;
mod remote;
mod setup;

#[tauri::command]
async fn mopidy_rpc(
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    remote::mopidy::call_mopidy_rpc("127.0.0.1", &method, &params)
}

use std::process::Command;
use std::sync::Mutex;
static TEST_PIPELINE: Mutex<Option<gstreamer::Pipeline>> = Mutex::new(None);
const TEST_AUDIO_URI: &str =
    "https://www.learningcontainer.com/wp-content/uploads/2020/02/Sample-OGG-File.ogg";
const TEST_AUDIO_SINK_DEVICE: &str = "mopidy_null";

fn build_test_pipeline_uri() -> String {
    format!(
        "playbin uri={} audio-sink=\"pulsesink device={}\"",
        TEST_AUDIO_URI, TEST_AUDIO_SINK_DEVICE
    )
}

#[tauri::command]
fn set_local_loopback_mute(mute: bool) -> Result<(), String> {
    println!("[Audio] Setting local loopback mute to: {}", mute);

    let module_id = find_loopback_module_id()?;

    if let Some(id) = module_id {
        println!("[Audio] Found loopback module ID: {}", id);
        if let Some(si_id) = find_sink_input_id(&id)? {
            let mute_val = if mute { "1" } else { "0" };

            Command::new("pactl")
                .args(["set-sink-input-mute", &si_id, mute_val])
                .output()
                .map_err(|e| format!("Error muteando sink-input {}: {}", si_id, e))?;

            println!(
                "[Audio] Loopback sink-input {} (from module {}) mute set to {}",
                si_id, id, mute_val
            );
            return Ok(());
        }

        if let Some(si_id) = find_sink_input_id_fallback(&id)? {
            let mute_val = if mute { "1" } else { "0" };
            Command::new("pactl")
                .args(["set-sink-input-mute", &si_id, mute_val])
                .output()
                .map_err(|e| format!("Error muteando sink-input {} (fallback): {}", si_id, e))?;
            println!(
                "[Audio] Loopback sink-input {} (fallback) mute set to {}",
                si_id, mute_val
            );
            return Ok(());
        }

        Err(format!(
            "No se encontró el sink-input para el loopback (module {})",
            id
        ))
    } else {
        println!("[Audio] No se encontró el módulo loopback de mopidy_null");
        if mute {
            Ok(())
        } else {
            Err("Módulo loopback no encontrado".to_string())
        }
    }
}

fn find_loopback_module_id() -> Result<Option<String>, String> {
    let output = Command::new("pactl")
        .args(["list", "modules", "short"])
        .output()
        .map_err(|e| format!("Error ejecutando pactl: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 && parts[1] == "module-loopback" && line.contains("mopidy_null.monitor")
        {
            return Ok(Some(parts[0].to_string()));
        }
    }
    Ok(None)
}

fn find_sink_input_id(module_id: &str) -> Result<Option<String>, String> {
    let sink_inputs = Command::new("pactl")
        .args(["list", "sink-inputs", "short"])
        .output()
        .map_err(|e| format!("Error listando sink-inputs: {}", e))?;

    let si_stdout = String::from_utf8_lossy(&sink_inputs.stdout);

    for line in si_stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 && parts[3] == module_id {
            return Ok(Some(parts[0].to_string()));
        }
    }
    Ok(None)
}

fn find_sink_input_id_fallback(module_id: &str) -> Result<Option<String>, String> {
    let full_sink_inputs = Command::new("pactl")
        .args(["list", "sink-inputs"])
        .output()
        .map_err(|e| format!("Error listando sink-inputs completo: {}", e))?;
    let full_si_stdout = String::from_utf8_lossy(&full_sink_inputs.stdout);

    let mut current_si_id = None;
    let mut found_target = false;

    for line in full_si_stdout.lines() {
        if line.contains("Entrada del destino #") || line.contains("Sink Input #") {
            if found_target && current_si_id.is_some() {
                break;
            }
            current_si_id = line.split('#').last().map(|s| s.trim().to_string());
            found_target = false;
        }
        if let Some(_id) = &current_si_id {
            if line.contains(&format!("pulse.module.id = \"{}\"", module_id))
                || (line.contains("media.name =")
                    && line.contains("loopback")
                    && line.contains("mopidy_null"))
            {
                found_target = true;
            }
        }
    }

    if found_target {
        Ok(current_si_id)
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn mopidy_test_sound() -> Result<(), String> {
    use gst::prelude::*;
    use gstreamer as gst;

    mopidy_stop_test_sound().await?;

    tokio::task::spawn_blocking(move || {
        gst::init().map_err(|e| format!("Error inicializando GStreamer: {}", e))?;

        let pipeline_str = build_test_pipeline_uri();

        let pipeline = gst::parse::launch(&pipeline_str)
            .map_err(|e| format!("Error creando pipeline: {}", e))?
            .dynamic_cast::<gst::Pipeline>()
            .map_err(|_| "Error casting a Pipeline")?;

        pipeline
            .set_state(gst::State::Playing)
            .map_err(|e| format!("Error al iniciar: {}", e))?;

        if let Ok(mut lock) = TEST_PIPELINE.lock() {
            *lock = Some(pipeline);
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Error de tarea: {}", e))?
}

#[tauri::command]
async fn mopidy_stop_test_sound() -> Result<(), String> {
    use gstreamer::prelude::*;

    if let Ok(mut lock) = TEST_PIPELINE.lock() {
        if let Some(pipeline) = lock.take() {
            pipeline.set_state(gstreamer::State::Null).ok();
        }
    }
    Ok(())
}

fn preferred_ipv4_from_interfaces() -> Option<String> {
    use if_addrs::IfAddr;
    use std::net::Ipv4Addr;

    let addrs = if_addrs::get_if_addrs().ok()?;
    let mut candidates: Vec<Ipv4Addr> = Vec::new();
    for iface in addrs {
        if iface.is_loopback() {
            continue;
        }
        let name = iface.name.to_lowercase();
        if name.starts_with("docker")
            || name.starts_with("br-")
            || name.starts_with("veth")
            || name.starts_with("virbr")
            || name.starts_with("vmnet")
        {
            continue;
        }
        if let IfAddr::V4(v4) = iface.addr {
            let ip = v4.ip;
            if ip.is_loopback() || ip.is_link_local() {
                continue;
            }
            candidates.push(ip);
        }
    }
    candidates.sort_by_key(|ip| if ip.is_private() { 0 } else { 1 });
    candidates.first().map(|ip| ip.to_string())
}

fn udp_trick_local_ip() -> Result<String, String> {
    use std::net::UdpSocket;

    let socket =
        UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("Error creando socket: {}", e))?;
    let _ = socket.connect("8.8.8.8:80");
    match socket.local_addr() {
        Ok(addr) => {
            let ip = addr.ip().to_string();
            if ip == "0.0.0.0" {
                Err("No se pudo determinar la IP del host.".to_string())
            } else {
                Ok(ip)
            }
        }
        Err(e) => Err(format!("Error obteniendo dirección local: {}", e)),
    }
}

#[tauri::command]
fn get_host_ip() -> Result<String, String> {
    if let Some(ip) = preferred_ipv4_from_interfaces() {
        return Ok(ip);
    }
    match udp_trick_local_ip() {
        Ok(ip) if ip != "127.0.0.1" && ip != "::1" => Ok(ip),
        Ok(_) => Err(
            "No se pudo obtener una IP de red local para que el dispositivo UPnP reciba el audio."
                .to_string(),
        ),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_host_ip() {
        let result = get_host_ip();
        match result {
            Ok(ip) => {
                assert!(!ip.is_empty());
                assert_ne!(ip, "0.0.0.0");
            }
            Err(e) => {
                println!("get_host_ip falló (posiblemente sin red): {}", e);
            }
        }
    }

    #[test]
    fn test_find_loopback_module_id_not_found() {
        let result = find_loopback_module_id();
        assert!(result.is_ok());
    }
}

#[tauri::command]
async fn remote_server_start(
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let client_dir = app_handle
        .path()
        .resource_dir()
        .ok()
        .map(|p| p.join("remote-client"));

    {
        let mut handle = remote_state.app_handle.lock().await;
        *handle = Some(app_handle.clone());
    }

    let (ip, port, code) = remote::start_server(remote_state.inner().clone(), client_dir).await?;

    Ok(serde_json::json!({
        "ip": ip,
        "port": port,
        "pairingCode": code,
    }))
}

#[tauri::command]
async fn remote_server_stop(
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<(), String> {
    remote::stop_server(&remote_state).await;
    Ok(())
}

#[tauri::command]
async fn remote_get_pairing_code(
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<String, String> {
    Ok(remote_state.generate_pairing_code().await)
}

#[tauri::command]
async fn remote_get_paired_devices(
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<Vec<remote::state::PairedDevice>, String> {
    let devices = remote_state.paired_devices.lock().await;
    Ok(devices.values().cloned().collect())
}

#[tauri::command]
async fn remote_revoke_device(
    device_id: String,
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<(), String> {
    let mut devices = remote_state.paired_devices.lock().await;
    devices.remove(&device_id);
    Ok(())
}

#[tauri::command]
async fn remote_set_tidal_token(
    token: String,
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<(), String> {
    let mut t = remote_state.tidal_token.lock().await;
    *t = Some(token);
    Ok(())
}

#[tauri::command]
async fn remote_broadcast_state(
    payload: serde_json::Value,
    remote_state: tauri::State<'_, Arc<remote::state::RemoteState>>,
) -> Result<(), String> {
    let msg = serde_json::json!({
        "type": "playback_state",
        "data": payload,
    });
    let _ = remote_state.broadcast_tx.send(msg.to_string());
    Ok(())
}

#[tauri::command]
async fn remote_discover_servers() -> Result<Vec<remote::discovery::DiscoveredServer>, String> {
    Ok(remote::discovery::discover_servers(3000).await)
}

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: r#"
                CREATE TABLE IF NOT EXISTS artists (
                    id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    picture TEXT,
                    biography TEXT,
                    genres TEXT,
                    external_links TEXT,
                    synced_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS albums (
                    id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    cover_url TEXT,
                    release_date TEXT,
                    number_of_tracks INTEGER,
                    duration INTEGER,
                    type TEXT,
                    explicit INTEGER DEFAULT 0,
                    media_tags TEXT,
                    audio_quality TEXT,
                    copyright TEXT,
                    barcode_id TEXT,
                    label TEXT,
                    genres TEXT,
                    synced_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS album_artists (
                    album_id TEXT NOT NULL,
                    artist_id TEXT NOT NULL,
                    artist_name TEXT NOT NULL,
                    PRIMARY KEY (album_id, artist_id),
                    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sync_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sync_type TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    items_synced INTEGER DEFAULT 0,
                    status TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_artists_provider ON artists(provider_id);
                CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
                CREATE INDEX IF NOT EXISTS idx_albums_provider ON albums(provider_id);
                CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);
                CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date);
                CREATE INDEX IF NOT EXISTS idx_albums_type ON albums(type);
                CREATE INDEX IF NOT EXISTS idx_album_artists_artist ON album_artists(artist_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "recreate_tables_with_provider_data",
            sql: r#"
                DROP TABLE IF EXISTS album_artists;
                DROP TABLE IF EXISTS albums;
                DROP TABLE IF EXISTS artists;
                DROP TABLE IF EXISTS sync_history;

                CREATE TABLE artists (
                    id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    picture TEXT,
                    biography TEXT,
                    genres TEXT,
                    external_links TEXT,
                    tidal_url TEXT,
                    popularity REAL,
                    added_at TEXT,
                    synced_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE albums (
                    id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    cover_url TEXT,
                    release_date TEXT,
                    number_of_tracks INTEGER,
                    number_of_volumes INTEGER,
                    duration INTEGER,
                    type TEXT,
                    explicit INTEGER DEFAULT 0,
                    media_tags TEXT,
                    audio_quality TEXT,
                    copyright TEXT,
                    barcode_id TEXT,
                    label TEXT,
                    genres TEXT,
                    tidal_url TEXT,
                    popularity REAL,
                    availability TEXT,
                    version TEXT,
                    added_at TEXT,
                    synced_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE album_artists (
                    album_id TEXT NOT NULL,
                    artist_id TEXT NOT NULL,
                    artist_name TEXT NOT NULL,
                    PRIMARY KEY (album_id, artist_id),
                    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
                );

                CREATE TABLE sync_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sync_type TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    items_synced INTEGER DEFAULT 0,
                    status TEXT NOT NULL
                );

                CREATE INDEX idx_artists_provider ON artists(provider_id);
                CREATE INDEX idx_artists_name ON artists(name);
                CREATE INDEX idx_artists_popularity ON artists(popularity);
                CREATE INDEX idx_albums_provider ON albums(provider_id);
                CREATE INDEX idx_albums_title ON albums(title);
                CREATE INDEX idx_albums_release_date ON albums(release_date);
                CREATE INDEX idx_albums_type ON albums(type);
                CREATE INDEX idx_albums_popularity ON albums(popularity);
                CREATE INDEX idx_albums_added_at ON albums(added_at);
                CREATE INDEX idx_album_artists_artist ON album_artists(artist_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "ensure local library tables",
            sql: r#"
                CREATE TABLE IF NOT EXISTS local_folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL UNIQUE,
                    added_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS local_tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uri TEXT NOT NULL UNIQUE,
                    path TEXT NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album TEXT NOT NULL,
                    duration REAL NOT NULL,
                    folder_id INTEGER NOT NULL,
                    FOREIGN KEY (folder_id) REFERENCES local_folders(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_local_tracks_artist ON local_tracks(artist);
                CREATE INDEX IF NOT EXISTS idx_local_tracks_album ON local_tracks(album);
                CREATE INDEX IF NOT EXISTS idx_local_tracks_folder ON local_tracks(folder_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_cover_to_local_tracks",
            sql: "ALTER TABLE local_tracks ADD COLUMN cover TEXT;",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zinga.db", migrations)
                .build(),
        )
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    other => {
                        println!("menu item {} not handled", other);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .manage(AppState::default())
        .manage(remote::state::RemoteState::new())
        .invoke_handler(tauri::generate_handler![
            upnp_discover,
            upnp_get_services,
            upnp_get_volume,
            upnp_set_volume,
            upnp_play,
            upnp_set_uri_and_play,
            upnp_pause,
            upnp_stop,
            upnp_connect,
            upnp_disconnect,
            upnp_get_transport_info,
            upnp_get_position_info,
            upnp_get_media_info,
            upnp_seek,
            upnp_next,
            upnp_previous,
            upnp_set_playlist,
            set_local_loopback_mute,
            mopidy_rpc,
            mopidy_test_sound,
            mopidy_stop_test_sound,
            get_host_ip,
            remote_server_start,
            remote_server_stop,
            remote_get_pairing_code,
            remote_get_paired_devices,
            remote_revoke_device,
            remote_set_tidal_token,
            remote_broadcast_state,
            remote_discover_servers,
            setup::system_check,
            setup::run_setup_script,
            setup::run_start_services,
            setup::run_stop_services,
            setup::run_restart_services,
            setup::run_verify,
            setup::get_tmux_output,
            setup::send_tmux_input,
            setup::is_tmux_session_alive,
            setup::kill_tmux_session,
            setup::open_tmux_terminal,
            setup::run_uninstall,
            setup::debug_terminal,
            setup::shell_open,
            library::scan_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
