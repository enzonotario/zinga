use crate::ytm::client::{
    connected_browser_client, cookies_are_connected, parse_duration_sec, parse_year,
    pick_thumbnail, unauthenticated_client,
};
use crate::ytm::is_valid_video_id;
use crate::ytm::search::{YtmAlbumRef, YtmArtistRef, YtmTrack};
use serde::Serialize;
use tauri::command;
use ytmapi_rs::auth::AuthToken;
use ytmapi_rs::common::{AlbumID, ArtistChannelID, YoutubeID};
use ytmapi_rs::parse::{
    AlbumResult, AlbumSong, ArtistSong, GetAlbum, GetArtist, GetArtistAlbums, GetArtistAlbumsAlbum,
};
use ytmapi_rs::YtMusic;

const SEARCH_THUMB_MAX: u64 = 544;
const ALBUM_PAGE_THUMB_MAX: u64 = 1200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmAlbumTrack {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub duration_sec: Option<u32>,
    pub track_number: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmAlbumDetail {
    pub id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub year: Option<u16>,
    pub thumbnail_url: Option<String>,
    pub tracks: Vec<YtmAlbumTrack>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmArtistAlbum {
    pub id: String,
    pub title: String,
    pub year: Option<u16>,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmArtistDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub albums: Vec<YtmArtistAlbum>,
    pub singles: Vec<YtmArtistAlbum>,
    pub top_songs: Vec<YtmTrack>,
}

pub(crate) fn is_valid_browse_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn map_parsed_artists(
    artists: &[ytmapi_rs::parse::ParsedSongArtist],
) -> Vec<YtmArtistRef> {
    artists
        .iter()
        .map(|artist| YtmArtistRef {
            id: artist.id.as_ref().map(|id| id.get_raw().to_string()),
            name: artist.name.clone(),
        })
        .filter(|artist| !artist.name.trim().is_empty())
        .collect()
}

fn map_album_song(song: AlbumSong, album_artists: &[YtmArtistRef]) -> Option<YtmAlbumTrack> {
    let video_id = song.video_id.get_raw().to_string();
    if !is_valid_video_id(&video_id) {
        return None;
    }
    Some(YtmAlbumTrack {
        video_id,
        title: song.title,
        artists: album_artists.to_vec(),
        duration_sec: parse_duration_sec(&song.duration),
        track_number: u32::try_from(song.track_no).ok(),
    })
}

fn map_album_detail(id: String, album: GetAlbum) -> YtmAlbumDetail {
    let artists = map_parsed_artists(&album.artists);
    let tracks = album
        .tracks
        .into_iter()
        .filter_map(|song| map_album_song(song, &artists))
        .collect();
    YtmAlbumDetail {
        id,
        title: album.title,
        artists,
        year: parse_year(&album.year),
        thumbnail_url: pick_thumbnail(&album.thumbnails, ALBUM_PAGE_THUMB_MAX),
        tracks,
    }
}

fn map_album_result(album: AlbumResult) -> Option<YtmArtistAlbum> {
    let id = album.album_id.get_raw().to_string();
    if !is_valid_browse_id(&id) {
        return None;
    }
    Some(YtmArtistAlbum {
        id,
        title: album.title,
        year: parse_year(&album.year),
        thumbnail_url: pick_thumbnail(&album.thumbnails, SEARCH_THUMB_MAX),
    })
}

fn map_artist_albums_album(album: GetArtistAlbumsAlbum) -> Option<YtmArtistAlbum> {
    let id = album.browse_id.get_raw().to_string();
    if !is_valid_browse_id(&id) {
        return None;
    }
    Some(YtmArtistAlbum {
        id,
        title: album.title,
        year: album.year.as_deref().and_then(parse_year),
        thumbnail_url: pick_thumbnail(&album.thumbnails, SEARCH_THUMB_MAX),
    })
}

fn map_top_song(song: ArtistSong, fallback_artist: &str) -> Option<YtmTrack> {
    let video_id = song.video_id.get_raw().to_string();
    if !is_valid_video_id(&video_id) {
        return None;
    }
    let mut artists = map_parsed_artists(&song.artists);
    if artists.is_empty() && !fallback_artist.trim().is_empty() {
        artists.push(YtmArtistRef {
            id: None,
            name: fallback_artist.to_string(),
        });
    }
    let album_id = song.album.id.get_raw().to_string();
    let album = if song.album.name.trim().is_empty() {
        None
    } else {
        Some(YtmAlbumRef {
            id: if is_valid_browse_id(&album_id) {
                Some(album_id)
            } else {
                None
            },
            name: song.album.name,
        })
    };
    Some(YtmTrack {
        video_id,
        title: song.title,
        artists,
        album,
        duration_sec: None,
        thumbnail_url: None,
    })
}

async fn expand_album_section<A: AuthToken>(
    yt: &YtMusic<A>,
    section: Option<GetArtistAlbums>,
) -> Vec<YtmArtistAlbum> {
    let Some(section) = section else {
        return Vec::new();
    };
    if let (Some(browse_id), Some(params)) = (section.browse_id.clone(), section.params.clone()) {
        if let Ok(full) = yt.get_artist_albums(browse_id, params).await {
            let mapped: Vec<_> = full.into_iter().filter_map(map_artist_albums_album).collect();
            if !mapped.is_empty() {
                return mapped;
            }
        }
    }
    section
        .results
        .into_iter()
        .filter_map(map_album_result)
        .collect()
}

async fn fetch_album_with<A: AuthToken>(
    yt: &YtMusic<A>,
    id: &str,
) -> Result<YtmAlbumDetail, String> {
    let album = yt
        .get_album(AlbumID::from_raw(id.to_string()))
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_album_detail(id.to_string(), album))
}

async fn fetch_artist_with<A: AuthToken>(
    yt: &YtMusic<A>,
    id: &str,
) -> Result<YtmArtistDetail, String> {
    let artist = yt
        .get_artist(ArtistChannelID::from_raw(id.to_string()))
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_artist_detail(yt, id, artist).await)
}

async fn map_artist_detail<A: AuthToken>(
    yt: &YtMusic<A>,
    id: &str,
    artist: GetArtist,
) -> YtmArtistDetail {
    let albums = expand_album_section(yt, artist.top_releases.albums).await;
    let singles = expand_album_section(yt, artist.top_releases.singles).await;
    let top_songs = artist
        .top_releases
        .songs
        .map(|songs| {
            songs
                .results
                .into_iter()
                .filter_map(|song| map_top_song(song, &artist.name))
                .collect()
        })
        .unwrap_or_default();
    YtmArtistDetail {
        id: id.to_string(),
        name: artist.name,
        description: artist.description,
        thumbnail_url: pick_thumbnail(&artist.thumbnails, ALBUM_PAGE_THUMB_MAX),
        albums,
        singles,
        top_songs,
    }
}

pub(crate) async fn get_album_detail(id: &str) -> Result<YtmAlbumDetail, String> {
    let id = id.trim();
    if !is_valid_browse_id(id) {
        return Err("Invalid YouTube Music album id".into());
    }
    if cookies_are_connected() {
        let yt = connected_browser_client().await?;
        return fetch_album_with(&yt, id).await;
    }
    let yt = unauthenticated_client().await?;
    fetch_album_with(&yt, id).await
}

pub(crate) async fn get_artist_detail(id: &str) -> Result<YtmArtistDetail, String> {
    let id = id.trim();
    if !is_valid_browse_id(id) {
        return Err("Invalid YouTube Music artist id".into());
    }
    if cookies_are_connected() {
        let yt = connected_browser_client().await?;
        return fetch_artist_with(&yt, id).await;
    }
    let yt = unauthenticated_client().await?;
    fetch_artist_with(&yt, id).await
}

#[command]
pub async fn ytm_get_album(id: String) -> Result<YtmAlbumDetail, String> {
    get_album_detail(&id).await
}

#[command]
pub async fn ytm_get_artist(id: String) -> Result<YtmArtistDetail, String> {
    get_artist_detail(&id).await
}

#[cfg(test)]
mod tests {
    use super::is_valid_browse_id;

    #[test]
    fn browse_id_allows_mpreb_and_uc() {
        assert!(is_valid_browse_id("MPREb_abc123"));
        assert!(is_valid_browse_id("UCabcdefghijklmnopqrstuv"));
        assert!(is_valid_browse_id("aB1-_cdef"));
        assert!(!is_valid_browse_id(""));
        assert!(!is_valid_browse_id("bad id"));
        assert!(!is_valid_browse_id("has/slash"));
        assert!(!is_valid_browse_id("has.dot"));
    }
}
