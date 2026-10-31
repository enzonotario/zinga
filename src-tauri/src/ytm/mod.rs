pub(crate) mod browse;
pub(crate) mod client;
pub(crate) mod cookies;
pub(crate) mod innertube;
pub(crate) mod search;
pub(crate) mod stream;
pub(crate) mod ytdlp;

pub use stream::{resolve_stream, resolve_video};
pub use ytdlp::ensure_ytdlp;

#[tauri::command]
pub async fn ytm_ytdlp_update() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ytdlp::ytdlp_update)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ytm_resolve_video(video_id: String) -> Result<stream::YtmVideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let resolved = resolve_video(&video_id)?;
        Ok(stream::YtmVideoInfo {
            width: resolved.width,
            height: resolved.height,
            itag: resolved.itag,
            vcodec: resolved.vcodec,
        })
    })
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
    use crate::ytm::stream::{parse_ytdlp_json, parse_ytdlp_video_json, resolve_stream, resolve_video};
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
            "artist name={} albums={} singles={} top_songs={} videos={} extras={}",
            artist.name,
            artist.albums.len(),
            artist.singles.len(),
            artist.top_songs.len(),
            artist.videos.len(),
            artist.extra_video_sections.len()
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
        for video in artist.videos.iter().take(4) {
            println!("  video: {}", video.title);
        }
        for section in &artist.extra_video_sections {
            println!(
                "  extra section: {} ({})",
                section.title,
                section.items.len()
            );
        }
    }

    #[test]
    #[ignore = "live network: ytm artist videos + playlist + stream for Charly García"]
    fn live_artist_videos_and_stream() {
        let dir = dirs_fallback();
        let _ = std::fs::create_dir_all(dir.join("bin"));
        let _ = DATA_DIR.set(dir);
        ensure_ytdlp().expect("ensure yt-dlp");

        let artist_id = "UChhfHmbdySv6Gh8qcWzdoiw";
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let artist = rt
            .block_on(browse::get_artist_detail(artist_id))
            .expect("get_artist");
        println!("videos={}", artist.videos.len());
        for video in artist.videos.iter().take(4) {
            println!("  video: {}", video.title);
        }
        for section in &artist.extra_video_sections {
            println!(
                "extra: {} count={}",
                section.title,
                section.items.len()
            );
        }
        let playlist_id = artist
            .videos_playlist_id
            .clone()
            .expect("videosPlaylistId");
        let full = rt
            .block_on(browse::get_playlist_videos(&playlist_id))
            .expect("playlist videos");
        println!("playlist_videos={}", full.len());

        let first_id = artist
            .videos
            .first()
            .map(|v| v.video_id.clone())
            .expect("first video");
        let resolved = resolve_stream(&first_id).expect("resolve");
        println!(
            "resolved itag={} codec={} abr={}",
            resolved.itag, resolved.codec, resolved.abr
        );
    }

    #[test]
    fn parses_ytdlp_video_json() {
        let json = r#"{
          "requested_downloads": [{
            "url": "https://googlevideo.example/videoplayback",
            "format_id": "137",
            "vcodec": "avc1.640028",
            "width": 1920,
            "height": 1080,
            "http_headers": { "User-Agent": "UA" }
          }]
        }"#;
        let resolved = parse_ytdlp_video_json(json).expect("parse");
        assert_eq!(resolved.itag, "137");
        assert_eq!(resolved.vcodec, "avc1.640028");
        assert_eq!(resolved.width, 1920);
        assert_eq!(resolved.height, 1080);
    }

    #[test]
    #[ignore = "live network: resolve progressive H.264 video for aoRaUT9G8Hc"]
    fn live_resolve_video_sample() {
        let dir = dirs_fallback();
        let _ = std::fs::create_dir_all(dir.join("bin"));
        let _ = DATA_DIR.set(dir);
        ensure_ytdlp().expect("ensure yt-dlp");
        let resolved = resolve_video("aoRaUT9G8Hc").expect("resolve video");
        println!(
            "itag={} vcodec={} height={}",
            resolved.itag, resolved.vcodec, resolved.height
        );
        assert!(!resolved.url.is_empty());
        assert!(!resolved.url.contains(".m3u8"));

        let rt = tokio::runtime::Runtime::new().expect("runtime");
        rt.block_on(async {
            let client = client::reqwest_http1_client().expect("client");
            let mut head = client.head(&resolved.url);
            let mut get = client.get(&resolved.url).header("Range", "bytes=0-1023");
            for (key, value) in &resolved.http_headers {
                head = head.header(key, value);
                get = get.header(key, value);
            }
            let head_res = head.send().await.expect("head");
            println!(
                "upstream HEAD status={} content-type={:?}",
                head_res.status(),
                head_res.headers().get("content-type")
            );
            assert!(head_res.status().is_success() || head_res.status().as_u16() == 206);
            let get_res = get.send().await.expect("range get");
            let status = get_res.status().as_u16();
            let len = get_res.bytes().await.expect("bytes").len();
            println!("upstream Range GET status={status} bytes={len}");
            assert!(status == 206 || status == 200);
            assert!(len > 0 && len <= 1024);
        });
    }

    fn dirs_fallback() -> PathBuf {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(".local/share/com.enzonotario.zinga");
        }
        std::env::temp_dir().join(format!("zinga-ytm-live-{}", std::process::id()))
    }
}
