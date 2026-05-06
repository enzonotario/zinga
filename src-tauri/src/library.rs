use base64::{engine::general_purpose, Engine as _};
use lofty::file::AudioFile;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::path::Path;
use urlencoding::encode;
use walkdir::WalkDir;

const SUPPORTED_AUDIO_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "ogg", "m4a"];
const SUPPORTED_COVER_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrack {
    pub uri: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub path: String,
    pub cover: Option<String>,
}

fn path_to_asset_url(path: &Path) -> String {
    let path_str = path.to_string_lossy();
    format!("asset://localhost/{}", encode(&path_str))
}

fn has_supported_extension(path: &Path, extensions: &[&str]) -> bool {
    let Some(extension) = path.extension() else {
        return false;
    };

    let ext = extension.to_string_lossy().to_lowercase();
    extensions.contains(&ext.as_str())
}

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<LocalTrack>, String> {
    let mut tracks = Vec::new();
    let root = Path::new(&path);

    if !root.exists() || !root.is_dir() {
        return Err(format!("Directorio no existe: {}", path));
    }

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || !has_supported_extension(path, &SUPPORTED_AUDIO_EXTENSIONS) {
            continue;
        }

        if let Ok(track) = extract_metadata(path) {
            tracks.push(track);
        }
    }

    Ok(tracks)
}

fn extract_metadata(path: &Path) -> Result<LocalTrack, String> {
    let tagged_file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();

    let (title, artist, album, mut cover) = if let Some(tag) = tagged_file.primary_tag() {
        let title = tag.title().map(|s| s.to_string()).unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });
        let artist = tag
            .artist()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Artista Desconocido".to_string());
        let album = tag
            .album()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Álbum Desconocido".to_string());

        let cover = tag.pictures().first().map(|pic| {
            let data = pic.data();
            let base64_data = general_purpose::STANDARD.encode(data);
            let mime_type = pic
                .mime_type()
                .map(|m| m.to_string())
                .unwrap_or_else(|| "image/jpeg".to_string());
            format!("data:{};base64,{}", mime_type, base64_data)
        });

        (title, artist, album, cover)
    } else {
        (
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            "Artista Desconocido".to_string(),
            "Álbum Desconocido".to_string(),
            None,
        )
    };

    if cover.is_none() {
        if let Some(parent) = path.parent() {
            cover = find_cover_in_folder(parent);
        }
    }

    let path_str = path.to_string_lossy().to_string();
    let uri = format!("file://{}", path_str);

    Ok(LocalTrack {
        uri,
        title,
        artist,
        album,
        duration,
        path: path_str,
        cover,
    })
}

fn find_cover_in_folder(folder: &Path) -> Option<String> {
    let cover_names = [
        "cover.jpg",
        "cover.png",
        "folder.jpg",
        "folder.png",
        "front.jpg",
        "front.png",
        "album.jpg",
        "album.png",
    ];

    for name in &cover_names {
        let cover_path = folder.join(name);
        if cover_path.exists() && cover_path.is_file() {
            return Some(path_to_asset_url(&cover_path));
        }
    }

    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && has_supported_extension(&path, &SUPPORTED_COVER_EXTENSIONS) {
                return Some(path_to_asset_url(&path));
            }
        }
    }

    None
}
