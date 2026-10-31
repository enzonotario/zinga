use crate::ytm::cookies::{cookies_connected, read_cookies_txt};
use ytmapi_rs::auth::noauth::NoAuthToken;
use ytmapi_rs::auth::BrowserToken;
use ytmapi_rs::common::Thumbnail;
use ytmapi_rs::{Client, YtMusic, YtMusicBuilder};

pub(crate) fn pick_thumbnail(thumbs: &[Thumbnail], max_edge: u64) -> Option<String> {
    thumbs
        .iter()
        .filter(|t| t.width <= max_edge && t.height <= max_edge)
        .max_by_key(|t| (t.width.max(t.height), t.width, t.height))
        .or_else(|| {
            thumbs
                .iter()
                .min_by_key(|t| (t.width.max(t.height), t.width, t.height))
        })
        .map(|t| t.url.clone())
}

pub(crate) fn parse_duration_sec(raw: &str) -> Option<u32> {
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

pub(crate) fn parse_year(raw: &str) -> Option<u16> {
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

fn http_client() -> Result<Client, String> {
    // HTTP/1.1 + native-tls: reqwest HTTP/2 rejects ytmapi-rs' Firefox 88 User-Agent here.
    let inner = reqwest::Client::builder()
        .use_native_tls()
        .http1_only()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Client::new_from_reqwest_client(inner))
}

pub(crate) async fn unauthenticated_client() -> Result<YtMusic<NoAuthToken>, String> {
    let client = http_client()?;
    let token = NoAuthToken::new(&client)
        .await
        .map_err(|e| e.to_string())?;
    YtMusicBuilder::new_with_client(client)
        .with_auth_token(token)
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) async fn browser_client(cookie_header: &str) -> Result<YtMusic<BrowserToken>, String> {
    let client = http_client()?;
    let token = BrowserToken::from_str(cookie_header, &client)
        .await
        .map_err(|e| format!("YTM cookie auth failed: {e}"))?;
    YtMusicBuilder::new_with_client(client)
        .with_auth_token(token)
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) async fn connected_browser_client() -> Result<YtMusic<BrowserToken>, String> {
    let contents = read_cookies_txt().ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?;
    let header =
        netscape_to_cookie_header(&contents).ok_or_else(|| "YTM_NOT_CONNECTED".to_string())?;
    browser_client(&header).await
}

pub(crate) fn cookies_are_connected() -> bool {
    cookies_connected()
}

#[cfg(test)]
mod tests {
    use super::{netscape_to_cookie_header, parse_duration_sec, parse_year, pick_thumbnail};
    use ytmapi_rs::common::Thumbnail;

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

    #[test]
    fn duration_parses_mm_ss_and_h_mm_ss() {
        assert_eq!(parse_duration_sec("3:45"), Some(225));
        assert_eq!(parse_duration_sec("1:02:03"), Some(3723));
        assert_eq!(parse_duration_sec("45"), Some(45));
        assert_eq!(parse_duration_sec(""), None);
    }

    #[test]
    fn year_parses_or_none() {
        assert_eq!(parse_year("1983"), Some(1983));
        assert_eq!(parse_year("  "), None);
        assert_eq!(parse_year("abc"), None);
    }

    #[test]
    fn thumbnail_prefers_largest_under_cap() {
        let thumbs = vec![
            Thumbnail {
                width: 60,
                height: 60,
                url: "small".into(),
            },
            Thumbnail {
                width: 544,
                height: 544,
                url: "mid".into(),
            },
            Thumbnail {
                width: 1200,
                height: 1200,
                url: "large".into(),
            },
            Thumbnail {
                width: 3000,
                height: 3000,
                url: "huge".into(),
            },
        ];
        assert_eq!(pick_thumbnail(&thumbs, 544).as_deref(), Some("mid"));
        assert_eq!(pick_thumbnail(&thumbs, 1200).as_deref(), Some("large"));
    }
}
