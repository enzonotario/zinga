use crate::ytm::cookies::{cookies_connected, read_cookies_txt};
use serde::Serialize;
use tauri::command;
use ytmapi_rs::auth::noauth::NoAuthToken;
use ytmapi_rs::auth::BrowserToken;
use ytmapi_rs::common::{Thumbnail, YoutubeID};
use ytmapi_rs::parse::{SearchResultAlbum, SearchResultArtist, SearchResultSong};
use ytmapi_rs::{Client, YtMusic, YtMusicBuilder};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmArtistRef {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmAlbumRef {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmTrack {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub album: Option<YtmAlbumRef>,
    pub duration_sec: Option<u32>,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmAlbum {
    pub id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub year: Option<u16>,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmArtist {
    pub id: String,
    pub name: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmSearchResults {
    pub tracks: Vec<YtmTrack>,
    pub albums: Vec<YtmAlbum>,
    pub artists: Vec<YtmArtist>,
}

fn pick_thumbnail(thumbs: &[Thumbnail]) -> Option<String> {
    thumbs
        .iter()
        .filter(|t| t.width <= 544 && t.height <= 544)
        .max_by_key(|t| (t.width.max(t.height), t.width, t.height))
        .map(|t| t.url.clone())
}

fn parse_duration_sec(raw: &str) -> Option<u32> {
    let parts: Vec<u32> = raw
        .trim()
        .split(':')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| p.parse().ok())
        .collect::<Option<Vec<_>>>()?;
    match parts.as_slice() {
        [secs] => Some(*secs),
        [mins, secs] => Some(mins * 60 + secs),
        [hours, mins, secs] => Some(hours * 3600 + mins * 60 + secs),
        _ => None,
    }
}

fn parse_year(raw: &str) -> Option<u16> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse().ok()
}

/// Convert Netscape cookies.txt into a Cookie request-header string for ytmapi-rs.
/// Values are never logged.
pub(crate) fn netscape_to_cookie_header(contents: &str) -> Option<String> {
    let mut parts = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let data = trimmed
            .strip_prefix("#HttpOnly_")
            .or_else(|| trimmed.strip_prefix("#httponly_"))
            .unwrap_or_else(|| {
                if trimmed.starts_with('#') {
                    ""
                } else {
                    trimmed
                }
            });
        if data.is_empty() {
            continue;
        }
        let fields: Vec<&str> = data.split('\t').collect();
        if fields.len() < 7 {
            continue;
        }
        let name = fields[5].trim();
        let value = fields[6].trim();
        if name.is_empty() {
            continue;
        }
        parts.push(format!("{name}={value}"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

fn map_song(song: SearchResultSong) -> YtmTrack {
    YtmTrack {
        video_id: song.video_id.get_raw().to_string(),
        title: song.title,
        artists: vec![YtmArtistRef {
            id: None,
            name: song.artist,
        }],
        album: song.album.map(|album| YtmAlbumRef {
            id: Some(album.id.get_raw().to_string()),
            name: album.name,
        }),
        duration_sec: parse_duration_sec(&song.duration),
        thumbnail_url: pick_thumbnail(&song.thumbnails),
    }
}

fn map_album(album: SearchResultAlbum) -> YtmAlbum {
    YtmAlbum {
        id: album.album_id.get_raw().to_string(),
        title: album.title,
        artists: vec![YtmArtistRef {
            id: None,
            name: album.artist,
        }],
        year: parse_year(&album.year),
        thumbnail_url: pick_thumbnail(&album.thumbnails),
    }
}

fn map_artist(artist: SearchResultArtist) -> YtmArtist {
    YtmArtist {
        id: artist.browse_id.get_raw().to_string(),
        name: artist.artist,
        thumbnail_url: pick_thumbnail(&artist.thumbnails),
    }
}

fn http_client() -> Result<Client, String> {
    // HTTP/1.1 + native-tls: reqwest HTTP/2 rejects ytmapi-rs' Firefox 88 User-Agent here.
    let inner = reqwest::Client::builder()
        .use_native_tls()
        .http1_only()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Client::new_from_reqwest_client(inner))
}

async fn search_with_auth_token<A: ytmapi_rs::auth::AuthToken>(
    yt: &YtMusic<A>,
    query: &str,
) -> Result<YtmSearchResults, String> {
    let (songs, albums, artists) = tokio::join!(
        yt.search_songs(query),
        yt.search_albums(query),
        yt.search_artists(query),
    );
    Ok(YtmSearchResults {
        tracks: songs
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(map_song)
            .collect(),
        albums: albums
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(map_album)
            .collect(),
        artists: artists
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(map_artist)
            .collect(),
    })
}

async fn unauthenticated_client() -> Result<YtMusic<NoAuthToken>, String> {
    let client = http_client()?;
    let token = NoAuthToken::new(&client)
        .await
        .map_err(|e| e.to_string())?;
    YtMusicBuilder::new_with_client(client)
        .with_auth_token(token)
        .build()
        .map_err(|e| e.to_string())
}

async fn browser_client(cookie_header: &str) -> Result<YtMusic<BrowserToken>, String> {
    let client = http_client()?;
    let token = BrowserToken::from_str(cookie_header, &client)
        .await
        .map_err(|e| format!("YTM cookie auth failed: {e}"))?;
    YtMusicBuilder::new_with_client(client)
        .with_auth_token(token)
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) async fn search_music(query: &str) -> Result<YtmSearchResults, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(YtmSearchResults {
            tracks: Vec::new(),
            albums: Vec::new(),
            artists: Vec::new(),
        });
    }

    if cookies_connected() {
        let contents = read_cookies_txt().ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?;
        let header =
            netscape_to_cookie_header(&contents).ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?;
        let yt = browser_client(&header).await?;
        return search_with_auth_token(&yt, query).await;
    }

    // Filtered search is implemented for AuthToken (including NoAuthToken).
    let yt = unauthenticated_client().await?;
    search_with_auth_token(&yt, query).await
}

#[command]
pub async fn ytm_search(query: String) -> Result<YtmSearchResults, String> {
    search_music(&query).await
}

#[cfg(test)]
mod tests {
    use super::netscape_to_cookie_header;

    #[test]
    fn netscape_to_header_keeps_names_and_values() {
        let netscape = "\
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tabc
.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PSID\tdef
";
        let header = netscape_to_cookie_header(netscape).expect("header");
        assert!(header.contains("SAPISID=abc"));
        assert!(header.contains("__Secure-3PSID=def"));
        assert!(header.contains("; "));
    }
}
