pub(crate) mod browse;
pub(crate) mod client;
pub(crate) mod cookies;
pub(crate) mod search;
pub(crate) mod stream;
pub(crate) mod ytdlp;

pub use stream::resolve_stream;
pub use ytdlp::ensure_ytdlp;

#[tauri::command]
pub async fn ytm_ytdlp_update() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ytdlp::ytdlp_update)
        .await
        .map_err(|e| e.to_string())?
}

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn data_dir() -> Option<&'static PathBuf> {
    DATA_DIR.get()
}

pub(crate) fn data_file(name: &str) -> Option<PathBuf> {
    DATA_DIR.get().map(|dir| dir.join(name))
}

pub fn init(app: &AppHandle) {
    match app.path().app_data_dir() {
        Ok(dir) => {
            if let Err(e) = std::fs::create_dir_all(dir.join("bin")) {
                eprintln!("[YTM] Failed to create bin dir: {e}");
            }
            let _ = DATA_DIR.set(dir);
        }
        Err(e) => {
            eprintln!("[YTM] App data dir unavailable: {e}");
            return;
        }
    }
    // Download off the setup path so the window can open before yt-dlp is ready.
    std::thread::spawn(|| match ensure_ytdlp() {
        Ok(path) => eprintln!("[YTM] yt-dlp ready at {}", path.display()),
        Err(e) => eprintln!("[YTM] yt-dlp ensure failed: {e}"),
    });
}

pub(crate) fn is_valid_video_id(id: &str) -> bool {
    id.len() == 11
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ytm::cookies::{cookie_file_connected, youtube_cookies_only};
    use crate::ytm::stream::{parse_ytdlp_json, resolve_stream};
    use crate::ytm::ytdlp::{ensure_ytdlp, normalize_browser};

    #[test]
    fn video_id_validation() {
        assert!(is_valid_video_id("dQw4w9WgXcQ"));
        assert!(is_valid_video_id("abcdefghijk"));
        assert!(is_valid_video_id("aB1-_cdefgh"));
        assert!(!is_valid_video_id(""));
        assert!(!is_valid_video_id("short"));
        assert!(!is_valid_video_id("toolongvideoid"));
        assert!(!is_valid_video_id("bad id!!!!"));
    }

    #[test]
    fn browser_allowlist_rejects_unknown() {
        assert!(normalize_browser("chrome").is_ok());
        assert!(normalize_browser("Firefox").is_ok());
        assert_eq!(
            normalize_browser("safari").unwrap_err(),
            "Unsupported browser: safari"
        );
        assert!(normalize_browser("iexplore").is_err());
    }

    #[test]
    fn cookie_connected_checks_names_only() {
        let connected = "\
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tsecret-value-here
.youtube.com\tTRUE\t/\tTRUE\t0\tOTHER\tnope
";
        assert!(cookie_file_connected(connected));

        let secure = "\
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PSID\tsecret
";
        assert!(cookie_file_connected(secure));

        let missing = "\
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\tVISITOR_INFO1_LIVE\tx
";
        assert!(!cookie_file_connected(missing));
        assert!(!cookie_file_connected(""));
    }

    #[test]
    fn youtube_cookies_only_drops_other_domains() {
        let jar = "# Netscape HTTP Cookie File\n\
.youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tyt\n\
#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PSID\tyt2\n\
music.youtube.com\tFALSE\t/\tTRUE\t0\tPREF\tx\n\
.google.com\tTRUE\t/\tTRUE\t0\tSID\tg\n\
.mybank.com\tTRUE\t/\tTRUE\t0\tsession\tsecret\n\
.notyoutube.com\tTRUE\t/\tTRUE\t0\tx\ty\n";
        let kept = youtube_cookies_only(jar);
        assert!(kept.contains("SAPISID") && kept.contains("__Secure-3PSID") && kept.contains("PREF"));
        assert!(!kept.contains("mybank") && !kept.contains("google.com") && !kept.contains("notyoutube"));
        assert!(cookie_file_connected(&kept));
    }

    #[test]
    fn parses_ytdlp_json_from_requested_downloads() {
        let json = r#"{
          "id": "dQw4w9WgXcQ",
          "requested_downloads": [{
            "url": "https://googlevideo.example/videoplayback",
            "format_id": "774",
            "acodec": "opus",
            "abr": 256.1,
            "http_headers": {
              "User-Agent": "TestAgent/1.0",
              "Accept": "*/*"
            }
          }]
        }"#;
        let resolved = parse_ytdlp_json(json).expect("parse");
        assert_eq!(resolved.itag, "774");
        assert_eq!(resolved.codec, "opus");
        assert!((resolved.abr - 256.1).abs() < f64::EPSILON);
        assert_eq!(resolved.url, "https://googlevideo.example/videoplayback");
        assert!(resolved
            .http_headers
            .iter()
            .any(|(k, v)| k.eq_ignore_ascii_case("User-Agent") && v == "TestAgent/1.0"));
    }

    #[test]
    fn parses_ytdlp_json_from_top_level() {
        let json = r#"{
          "url": "https://example.com/a.webm",
          "format_id": "251",
          "acodec": "opus",
          "abr": 160,
          "http_headers": { "User-Agent": "UA" }
        }"#;
        let resolved = parse_ytdlp_json(json).expect("parse");
        assert_eq!(resolved.itag, "251");
        assert_eq!(resolved.codec, "opus");
        assert!((resolved.abr - 160.0).abs() < f64::EPSILON);
    }

    #[test]
    #[ignore = "live network: ytm search + resolve without cookies"]
    fn live_search_and_resolve_without_cookies() {
        let dir = dirs_fallback();
        let _ = std::fs::create_dir_all(dir.join("bin"));
        let _ = DATA_DIR.set(dir);

        ensure_ytdlp().expect("ensure yt-dlp");
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let results = rt
            .block_on(search::search_music("charly garcia"))
            .expect("search");
        println!(
            "tracks={} albums={} artists={}",
            results.tracks.len(),
            results.albums.len(),
            results.artists.len()
        );
        for track in results.tracks.iter().take(3) {
            println!("track: {} ({})", track.title, track.video_id);
        }
        let video_id = results
            .tracks
            .first()
            .map(|t| t.video_id.clone())
            .expect("at least one track");
        let resolved = resolve_stream(&video_id).expect("resolve");
        println!(
            "resolved itag={} codec={} abr={}",
            resolved.itag, resolved.codec, resolved.abr
        );
    }

    #[test]
    #[ignore = "live network: ytm get_album + get_artist from charly garcia search"]
    fn live_get_album_and_artist() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let results = rt
            .block_on(search::search_music("charly garcia"))
            .expect("search");
        let album_id = results
            .albums
            .first()
            .map(|a| a.id.clone())
            .expect("album id");
        let artist_id = results
            .artists
            .first()
            .map(|a| a.id.clone())
            .expect("artist id");
        println!("album_id={album_id} artist_id={artist_id}");

        let album = rt
            .block_on(browse::get_album_detail(&album_id))
            .expect("get_album");
        println!(
            "album title={} tracks={} year={:?}",
            album.title,
            album.tracks.len(),
            album.year
        );
        for track in album.tracks.iter().take(5) {
            println!("  track: {}", track.title);
        }

        let artist = rt
            .block_on(browse::get_artist_detail(&artist_id))
            .expect("get_artist");
        println!(
            "artist name={} albums={} singles={} top_songs={}",
            artist.name,
            artist.albums.len(),
            artist.singles.len(),
            artist.top_songs.len()
        );
        for item in artist.albums.iter().take(3) {
            println!("  album: {}", item.title);
        }
        for item in artist.singles.iter().take(3) {
            println!("  single: {}", item.title);
        }
        for song in artist.top_songs.iter().take(3) {
            println!("  top: {}", song.title);
        }
    }

    fn dirs_fallback() -> PathBuf {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(".local/share/com.enzonotario.zinga");
        }
        std::env::temp_dir().join(format!("zinga-ytm-live-{}", std::process::id()))
    }
}
