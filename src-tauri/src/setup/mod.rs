use gstreamer as gst;
use serde::Serialize;
use std::process::{Command, Stdio};

const GSTREAMER_PLUGINS: [&str; 5] = [
    "playbin",
    "souphttpsrc",
    "flacparse",
    "flacdec",
    "autoaudiosink",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatus {
    pub name: String,
    pub available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCheck {
    pub ffmpeg: bool,
    pub gstreamer_plugins: Vec<PluginStatus>,
    pub ready: bool,
}

pub(crate) fn sanitize_external_env(command: &mut Command) {
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

fn is_ffmpeg_available() -> bool {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    sanitize_external_env(&mut command);
    command.status().is_ok_and(|status| status.success())
}

fn gstreamer_plugins() -> Vec<PluginStatus> {
    let initialized = gst::init().is_ok();
    GSTREAMER_PLUGINS
        .iter()
        .map(|name| PluginStatus {
            name: name.to_string(),
            available: initialized && gst::ElementFactory::find(name).is_some(),
        })
        .collect()
}

fn summarize(ffmpeg: bool, gstreamer_plugins: Vec<PluginStatus>) -> SystemCheck {
    let ready = ffmpeg && gstreamer_plugins.iter().all(|plugin| plugin.available);
    SystemCheck {
        ffmpeg,
        gstreamer_plugins,
        ready,
    }
}

#[tauri::command]
pub async fn system_check() -> Result<SystemCheck, String> {
    tauri::async_runtime::spawn_blocking(|| summarize(is_ffmpeg_available(), gstreamer_plugins()))
        .await
        .map_err(|e| format!("System check failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plugins(available: &[bool]) -> Vec<PluginStatus> {
        GSTREAMER_PLUGINS
            .iter()
            .zip(available)
            .map(|(name, available)| PluginStatus {
                name: name.to_string(),
                available: *available,
            })
            .collect()
    }

    #[test]
    fn ready_requires_ffmpeg_and_every_plugin() {
        assert!(summarize(true, plugins(&[true; 5])).ready);
        assert!(!summarize(false, plugins(&[true; 5])).ready);
        assert!(!summarize(true, plugins(&[true, true, false, true, true])).ready);
    }

    #[test]
    fn serializes_in_camel_case() {
        let value = serde_json::to_value(summarize(true, plugins(&[true; 5]))).unwrap();
        assert_eq!(value["ready"], true);
        assert_eq!(value["gstreamerPlugins"][0]["name"], "playbin");
        assert_eq!(value["gstreamerPlugins"][0]["available"], true);
    }

    #[test]
    fn reports_every_required_plugin() {
        let names: Vec<String> = gstreamer_plugins().into_iter().map(|p| p.name).collect();
        assert_eq!(names, GSTREAMER_PLUGINS);
    }
}
