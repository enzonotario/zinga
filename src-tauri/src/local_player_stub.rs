use serde::Serialize;

const UNAVAILABLE: &str =
    "Local playback requires GStreamer. Rebuild with the local-player feature or use a UPnP renderer.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStatus {
    state: String,
    track_uri: String,
    position_sec: f64,
}

#[tauri::command]
pub async fn local_play(_uri: String, _track_uri: String) -> Result<(), String> {
    Err(UNAVAILABLE.to_string())
}

#[tauri::command]
pub async fn local_set_next(_uri: Option<String>, _track_uri: Option<String>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn local_pause() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn local_resume() -> Result<(), String> {
    Err(UNAVAILABLE.to_string())
}

#[tauri::command]
pub async fn local_stop() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn local_get_status() -> Result<LocalStatus, String> {
    Ok(LocalStatus {
        state: "STOPPED".to_string(),
        track_uri: String::new(),
        position_sec: 0.0,
    })
}

#[tauri::command]
pub async fn local_set_volume(_level: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn local_get_volume() -> Result<u32, String> {
    Ok(100)
}

#[tauri::command]
pub async fn local_test_tone() -> Result<(), String> {
    Err(UNAVAILABLE.to_string())
}
