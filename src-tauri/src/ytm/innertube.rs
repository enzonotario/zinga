use crate::ytm::client::{
    cookies_are_connected, netscape_to_cookie_header, parse_duration_sec, reqwest_http1_client,
};
use crate::ytm::cookies::read_cookies_txt;
use crate::ytm::is_valid_video_id;
use crate::ytm::search::{YtmArtistRef, YtmVideo};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::time::{SystemTime, UNIX_EPOCH};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0";
const YTM_URL: &str = "https://music.youtube.com";
const BROWSE_URL: &str =
    "https://music.youtube.com/youtubei/v1/browse?alt=json&prettyPrint=false&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const VIDEO_THUMB_MAX: u64 = 640;

#[derive(Debug, Clone)]
pub(crate) struct ParsedVideoCarousel {
    pub title: String,
    pub playlist_id: Option<String>,
    pub items: Vec<YtmVideo>,
}

fn fallback_client_version() -> String {
    // ytmapi-rs uses 1.YYYYMMDD.01.00; a fixed recent stamp is enough when ytcfg is missing.
    "1.20261027.01.00".to_string()
}

fn hash_sapisid(sapisid: &str) -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut hasher = Sha1::new();
    hasher.update(format!("{elapsed} {sapisid} {YTM_URL}"));
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(40);
    for byte in digest {
        hex.push_str(&format!("{byte:02x}"));
    }
    format!("{elapsed}_{hex}")
}

fn cookie_value<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    cookie_header.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(&format!("{name}="))
    })
}

async fn fetch_ytcfg(
    client: &reqwest::Client,
    cookie_header: Option<&str>,
) -> Result<(String, String), String> {
    let mut req = client
        .get(YTM_URL)
        .header("User-Agent", USER_AGENT)
        .header("X-Origin", YTM_URL);
    if let Some(cookie) = cookie_header {
        req = req.header("Cookie", cookie);
    }
    let html = req
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let visitor = html
        .split_once("\"VISITOR_DATA\":\"")
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(v, _)| v.to_string())
        .unwrap_or_default();
    let client_version = html
        .split_once("INNERTUBE_CLIENT_VERSION\":\"")
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(v, _)| v.to_string())
        .unwrap_or_else(fallback_client_version);
    Ok((visitor, client_version))
}

pub(crate) async fn browse_artist_raw(channel_id: &str) -> Result<Value, String> {
    let client = reqwest_http1_client()?;
    let cookie_header = if cookies_are_connected() {
        let contents = read_cookies_txt().ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?;
        Some(netscape_to_cookie_header(&contents).ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?)
    } else {
        None
    };
    let (visitor, client_version) = fetch_ytcfg(&client, cookie_header.as_deref()).await?;
    let body = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": client_version,
                "hl": "es-419",
                "gl": "AR",
                "user": {},
            },
        },
        "browseId": channel_id,
    });
    let mut req = client
        .post(BROWSE_URL)
        .header("User-Agent", USER_AGENT)
        .header("X-Origin", YTM_URL)
        .header("Origin", YTM_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .json(&body);
    if !visitor.is_empty() {
        req = req.header("X-Goog-Visitor-Id", &visitor);
    }
    if let Some(cookie) = cookie_header.as_deref() {
        req = req.header("Cookie", cookie);
        if let Some(sapisid) = cookie_value(cookie, "SAPISID") {
            req = req.header(
                "Authorization",
                format!("SAPISIDHASH {}", hash_sapisid(sapisid)),
            );
        }
    }
    let response = req.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("InnerTube browse failed: {}", response.status()));
    }
    response.json().await.map_err(|e| e.to_string())
}

fn runs_text(runs: Option<&Value>) -> String {
    let Some(Value::Array(runs)) = runs else {
        return String::new();
    };
    runs.iter()
        .filter_map(|run| run.get("text").and_then(Value::as_str))
        .collect()
}

fn pick_json_thumbnail(thumbs: &Value, max_edge: u64) -> Option<String> {
    let Value::Array(items) = thumbs else {
        return None;
    };
    let mut best: Option<(&Value, u64)> = None;
    let mut fallback: Option<(&Value, u64)> = None;
    for thumb in items {
        let width = thumb.get("width").and_then(Value::as_u64).unwrap_or(0);
        let height = thumb.get("height").and_then(Value::as_u64).unwrap_or(0);
        let edge = width.max(height);
        if edge == 0 {
            continue;
        }
        if edge <= max_edge {
            if best.map(|(_, e)| e).unwrap_or(0) <= edge {
                best = Some((thumb, edge));
            }
        } else if fallback.map(|(_, e)| e).unwrap_or(u64::MAX) > edge {
            fallback = Some((thumb, edge));
        }
    }
    best.or(fallback)
        .and_then(|(thumb, _)| thumb.get("url").and_then(Value::as_str))
        .map(str::to_string)
}

fn album_browse_id(item: &Value) -> Option<&str> {
    let browse = item
        .pointer("/navigationEndpoint/browseEndpoint")
        .or_else(|| item.pointer("/title/runs/0/navigationEndpoint/browseEndpoint"))?;
    let page_type = browse
        .pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
        .and_then(Value::as_str)
        .unwrap_or("");
    if page_type == "MUSIC_PAGE_TYPE_ALBUM" {
        return browse.get("browseId").and_then(Value::as_str);
    }
    let id = browse.get("browseId").and_then(Value::as_str)?;
    if id.starts_with("MPRE") {
        Some(id)
    } else {
        None
    }
}

fn parse_carousel_video_item(item: &Value, fallback_artist: &str) -> Option<YtmVideo> {
    let renderer = item
        .get("musicTwoRowItemRenderer")
        .or_else(|| item.get("musicResponsiveListItemRenderer"))?;
    if album_browse_id(renderer).is_some() {
        return None;
    }
    let video_id = renderer
        .pointer("/navigationEndpoint/watchEndpoint/videoId")
        .and_then(Value::as_str)
        .or_else(|| {
            renderer
                .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId")
                .and_then(Value::as_str)
        })?;
    if !is_valid_video_id(video_id) {
        return None;
    }
    let title = runs_text(renderer.pointer("/title/runs")).trim().to_string();
    if title.is_empty() {
        return None;
    }
    let subtitle_runs = renderer.pointer("/subtitle/runs");
    let artist_name = subtitle_runs
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("text"))
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .unwrap_or(fallback_artist)
        .to_string();
    let views = subtitle_runs
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .find_map(|run| {
            let text = run.get("text").and_then(Value::as_str)?.trim();
            if text.contains("view") || text.contains("vista") {
                Some(text.to_string())
            } else {
                None
            }
        });
    let length = renderer
        .pointer("/lengthText/runs")
        .map(|runs| runs_text(Some(runs)))
        .filter(|s| !s.is_empty());
    let thumbs = renderer
        .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| renderer.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"))
        .or_else(|| renderer.pointer("/thumbnails"));
    Some(YtmVideo {
        video_id: video_id.to_string(),
        title,
        artists: vec![YtmArtistRef {
            id: None,
            name: artist_name,
        }],
        views,
        duration_sec: length.as_deref().and_then(parse_duration_sec),
        thumbnail_url: thumbs.and_then(|t| pick_json_thumbnail(t, VIDEO_THUMB_MAX)),
    })
}

fn carousel_playlist_id(header: &Value) -> Option<String> {
    let runs = header.pointer("/title/runs")?.as_array()?;
    for run in runs {
        let browse = run.pointer("/navigationEndpoint/browseEndpoint")?;
        let page_type = browse
            .pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
            .and_then(Value::as_str)
            .unwrap_or("");
        let id = browse.get("browseId").and_then(Value::as_str)?;
        if page_type == "MUSIC_PAGE_TYPE_PLAYLIST" || id.starts_with("VL") {
            if !id.is_empty()
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            {
                return Some(id.to_string());
            }
        }
    }
    None
}

fn is_videos_shelf_title(title: &str) -> bool {
    matches!(
        title.trim().to_lowercase().as_str(),
        "videos" | "vídeos" | "vídeo" | "video"
    )
}

/// Defensive parse of artist browse JSON for video carousels (Videos, Live performances, …).
pub(crate) fn parse_artist_video_carousels(root: &Value) -> Vec<ParsedVideoCarousel> {
    let Some(Value::Array(sections)) = root.pointer(
        "/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents",
    ) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for section in sections {
        let Some(carousel) = section.get("musicCarouselShelfRenderer") else {
            continue;
        };
        let header = carousel
            .get("header")
            .and_then(|h| h.get("musicCarouselShelfBasicHeaderRenderer"));
        let title = header
            .map(|h| runs_text(h.pointer("/title/runs")))
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }
        let Some(Value::Array(contents)) = carousel.get("contents") else {
            continue;
        };
        let items: Vec<YtmVideo> = contents
            .iter()
            .filter_map(|item| parse_carousel_video_item(item, ""))
            .collect();
        if items.is_empty() {
            continue;
        }
        let playlist_id = header.and_then(carousel_playlist_id);
        out.push(ParsedVideoCarousel {
            title,
            playlist_id,
            items,
        });
    }
    out
}

pub(crate) fn split_videos_and_extras(
    carousels: Vec<ParsedVideoCarousel>,
) -> (Vec<YtmVideo>, Option<String>, Vec<(String, Vec<YtmVideo>)>) {
    let mut videos = Vec::new();
    let mut videos_playlist_id = None;
    let mut extras = Vec::new();
    let mut used_videos_shelf = false;
    for carousel in carousels {
        let is_main = !used_videos_shelf
            && (is_videos_shelf_title(&carousel.title)
                || carousel
                    .playlist_id
                    .as_deref()
                    .is_some_and(|id| id.starts_with("VL")));
        if is_main {
            used_videos_shelf = true;
            videos_playlist_id = carousel.playlist_id;
            videos = carousel.items;
            continue;
        }
        extras.push((carousel.title, carousel.items));
    }
    let known: std::collections::HashSet<_> =
        videos.iter().map(|v| v.video_id.clone()).collect();
    let extras = extras
        .into_iter()
        .map(|(title, items)| {
            let items = items
                .into_iter()
                .filter(|item| !known.contains(&item.video_id))
                .collect::<Vec<_>>();
            (title, items)
        })
        .filter(|(_, items)| !items.is_empty())
        .collect();
    (videos, videos_playlist_id, extras)
}

#[cfg(test)]
mod tests {
    use super::{parse_artist_video_carousels, split_videos_and_extras};
    use serde_json::json;

    #[test]
    fn parses_videos_and_live_carousels_from_fixture() {
        let fixture = json!({
            "contents": {
                "singleColumnBrowseResultsRenderer": {
                    "tabs": [{
                        "tabRenderer": {
                            "content": {
                                "sectionListRenderer": {
                                    "contents": [
                                        { "musicShelfRenderer": {} },
                                        {
                                            "musicCarouselShelfRenderer": {
                                                "header": {
                                                    "musicCarouselShelfBasicHeaderRenderer": {
                                                        "title": {
                                                            "runs": [{
                                                                "text": "Videos",
                                                                "navigationEndpoint": {
                                                                    "browseEndpoint": {
                                                                        "browseId": "VLOLAK5uy_nEXt1ANwwbEDHVBR1SGJGU08fabv_3dZE",
                                                                        "browseEndpointContextSupportedConfigs": {
                                                                            "browseEndpointContextMusicConfig": {
                                                                                "pageType": "MUSIC_PAGE_TYPE_PLAYLIST"
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }]
                                                        }
                                                    }
                                                },
                                                "contents": [{
                                                    "musicTwoRowItemRenderer": {
                                                        "title": { "runs": [{ "text": "Nos siguen pegando abajo (Pecado mortal)" }] },
                                                        "subtitle": { "runs": [
                                                            { "text": "Charly García" },
                                                            { "text": " • " },
                                                            { "text": "235K views" }
                                                        ] },
                                                        "navigationEndpoint": {
                                                            "watchEndpoint": { "videoId": "dK5PPQy7uHI" }
                                                        },
                                                        "thumbnailRenderer": {
                                                            "musicThumbnailRenderer": {
                                                                "thumbnail": {
                                                                    "thumbnails": [
                                                                        { "url": "https://img/400.jpg", "width": 400, "height": 225 },
                                                                        { "url": "https://img/800.jpg", "width": 800, "height": 450 }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    }
                                                }]
                                            }
                                        },
                                        {
                                            "musicCarouselShelfRenderer": {
                                                "header": {
                                                    "musicCarouselShelfBasicHeaderRenderer": {
                                                        "title": { "runs": [{ "text": "Live performances" }] }
                                                    }
                                                },
                                                "contents": [{
                                                    "musicTwoRowItemRenderer": {
                                                        "title": { "runs": [{ "text": "Demoliendo Hoteles" }] },
                                                        "subtitle": { "runs": [
                                                            { "text": "Charly García" },
                                                            { "text": " • " },
                                                            { "text": "5.5M views" }
                                                        ] },
                                                        "navigationEndpoint": {
                                                            "watchEndpoint": { "videoId": "Mm3IgrVsu24" }
                                                        },
                                                        "thumbnailRenderer": {
                                                            "musicThumbnailRenderer": {
                                                                "thumbnail": {
                                                                    "thumbnails": [
                                                                        { "url": "https://live/400.jpg", "width": 400, "height": 225 }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    }
                                                }]
                                            }
                                        },
                                        {
                                            "musicCarouselShelfRenderer": {
                                                "header": {
                                                    "musicCarouselShelfBasicHeaderRenderer": {
                                                        "title": { "runs": [{ "text": "Albums" }] }
                                                    }
                                                },
                                                "contents": [{
                                                    "musicTwoRowItemRenderer": {
                                                        "title": { "runs": [{ "text": "60x60" }] },
                                                        "navigationEndpoint": {
                                                            "browseEndpoint": {
                                                                "browseId": "MPREb_abc",
                                                                "browseEndpointContextSupportedConfigs": {
                                                                    "browseEndpointContextMusicConfig": {
                                                                        "pageType": "MUSIC_PAGE_TYPE_ALBUM"
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }]
                }
            }
        });
        let carousels = parse_artist_video_carousels(&fixture);
        assert_eq!(carousels.len(), 2);
        let (videos, playlist_id, extras) = split_videos_and_extras(carousels);
        assert_eq!(playlist_id.as_deref(), Some("VLOLAK5uy_nEXt1ANwwbEDHVBR1SGJGU08fabv_3dZE"));
        assert_eq!(videos.len(), 1);
        assert_eq!(videos[0].title, "Nos siguen pegando abajo (Pecado mortal)");
        assert_eq!(videos[0].video_id, "dK5PPQy7uHI");
        assert_eq!(videos[0].views.as_deref(), Some("235K views"));
        assert_eq!(videos[0].thumbnail_url.as_deref(), Some("https://img/400.jpg"));
        assert_eq!(extras.len(), 1);
        assert_eq!(extras[0].0, "Live performances");
        assert_eq!(extras[0].1[0].title, "Demoliendo Hoteles");
    }
}
