#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The AppImage AppRun points these at a bundled directory that is removed.
    // Host GStreamer plugins are on the default system path.
    std::env::remove_var("GST_PLUGIN_SYSTEM_PATH");
    std::env::remove_var("GST_PLUGIN_SYSTEM_PATH_1_0");
    zinga_lib::run();
}
