use crate::ytm::client::{
    connected_browser_client, cookies_are_connected, parse_duration_sec, parse_year,
    pick_thumbnail, unauthenticated_client,
};
use crate::ytm::is_valid_video_id;
use serde::Serialize;
use tauri::command;
use ytmapi_rs::auth::AuthToken;
use ytmapi_rs::common::YoutubeID;
use ytmapi_rs::parse::{
    SearchResultAlbum, SearchResultArtist, SearchResultSong, SearchResultVideo,
};
use ytmapi_rs::YtMusic;

const SEARCH_THUMB_MAX: u64 = 544;
const VIDEO_THUMB_MAX: u64 = 640;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmArtistRef {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmAlbumRef {
    pub id: Option<String>,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmTrack {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub album: Option<YtmAlbumRef>,
    pub duration_sec: Option<u32>,
    pub thumbnail_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YtmVideo {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<YtmArtistRef>,
    pub views: Option<String>,
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
    pub videos: Vec<YtmVideo>,
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
        thumbnail_url: pick_thumbnail(&song.thumbnails, SEARCH_THUMB_MAX),
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
        thumbnail_url: pick_thumbnail(&album.thumbnails, SEARCH_THUMB_MAX),
    }
}

fn map_artist(artist: SearchResultArtist) -> YtmArtist {
    YtmArtist {
        id: artist.browse_id.get_raw().to_string(),
        name: artist.artist,
        thumbnail_url: pick_thumbnail(&artist.thumbnails, SEARCH_THUMB_MAX),
    }
}

pub(crate) fn map_search_video(video: SearchResultVideo) -> Option<YtmVideo> {
    match video {
        SearchResultVideo::Video {
            title,
            channel_name,
            video_id,
            views,
            length,
            thumbnails,
            ..
        } => {
            let id = video_id.get_raw().to_string();
            if !is_valid_video_id(&id) {
                return None;
            }
            Some(YtmVideo {
                video_id: id,
                title,
                artists: vec![YtmArtistRef {
                    id: None,
                    name: channel_name,
                }],
                views: Some(views).filter(|v| !v.trim().is_empty()),
                duration_sec: parse_duration_sec(&length),
                thumbnail_url: pick_thumbnail(&thumbnails, VIDEO_THUMB_MAX),
            })
        }
        SearchResultVideo::VideoEpisode { .. } => None,
    }
}

async fn search_with_auth_token<A: AuthToken>(
    yt: &YtMusic<A>,
    query: &str,
) -> Result<YtmSearchResults, String> {
    let (songs, albums, artists, videos) = tokio::join!(
        yt.search_songs(query),
        yt.search_albums(query),
        yt.search_artists(query),
        yt.search_videos(query),
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
        videos: videos
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter_map(map_search_video)
            .collect(),
    })
}

pub(crate) async fn search_music(query: &str) -> Result<YtmSearchResults, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(YtmSearchResults {
            tracks: Vec::new(),
            albums: Vec::new(),
            artists: Vec::new(),
            videos: Vec::new(),
        });
    }

    if cookies_are_connected() {
        let yt = connected_browser_client().await?;
        return search_with_auth_token(&yt, query).await;
    }

    let yt = unauthenticated_client().await?;
    search_with_auth_token(&yt, query).await
}

#[command]
pub async fn ytm_search(query: String) -> Result<YtmSearchResults, String> {
    search_music(&query).await
}
