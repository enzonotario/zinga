use std::sync::OnceLock;
use std::time::Duration;

use image::ImageFormat;
use serde::{Deserialize, Serialize};
use ureq::Agent;
use url::Url;

const MAX_ITEMS_PER_CALL: usize = 100;
const CONCURRENCY: usize = 4;
const MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_SAMPLE_SIDE: u32 = 96;
const HUE_BINS: usize = 12;
const MIN_LIGHTNESS: f64 = 0.08;
const MAX_LIGHTNESS: f64 = 0.94;
const MIN_SATURATION: f64 = 0.2;
const MIN_DOMINANT_SHARE: f64 = 0.15;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverColorRequest {
    pub album_id: String,
    pub cover_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverColorResult {
    pub album_id: String,
    pub hue: f64,
    pub saturation: f64,
    pub lightness: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hsl {
    pub hue: f64,
    pub saturation: f64,
    pub lightness: f64,
}

fn agent() -> &'static Agent {
    static AGENT: OnceLock<Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        let config = Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(15)))
            .timeout_connect(Some(Duration::from_secs(5)))
            .build();
        Agent::new_with_config(config)
    })
}

pub fn rgb_to_hsl(r: u8, g: u8, b: u8) -> Hsl {
    let r = r as f64 / 255.0;
    let g = g as f64 / 255.0;
    let b = b as f64 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let lightness = (max + min) / 2.0;
    let delta = max - min;
    if delta < f64::EPSILON {
        return Hsl {
            hue: 0.0,
            saturation: 0.0,
            lightness,
        };
    }
    let saturation = delta / (1.0 - (2.0 * lightness - 1.0).abs());
    let hue = if max == r {
        60.0 * ((g - b) / delta).rem_euclid(6.0)
    } else if max == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        60.0 * ((r - g) / delta + 4.0)
    };
    Hsl {
        hue: hue.rem_euclid(360.0),
        saturation: saturation.clamp(0.0, 1.0),
        lightness,
    }
}

#[derive(Default, Clone, Copy)]
struct HueBin {
    weight: f64,
    sin: f64,
    cos: f64,
    saturation: f64,
    lightness: f64,
}

fn hue_bin(hue: f64) -> usize {
    (((hue + 15.0).rem_euclid(360.0)) / 30.0) as usize % HUE_BINS
}

fn mean_hsl(sum: [f64; 3], count: f64) -> Hsl {
    let channel = |v: f64| (v / count).round().clamp(0.0, 255.0) as u8;
    rgb_to_hsl(channel(sum[0]), channel(sum[1]), channel(sum[2]))
}

pub fn representative_color(rgb: &[u8]) -> Option<Hsl> {
    let mut bins = [HueBin::default(); HUE_BINS];
    let mut considered_sum = [0.0; 3];
    let mut considered = 0.0;
    let mut all_sum = [0.0; 3];
    let mut all = 0.0;

    for px in rgb.chunks_exact(3) {
        let (r, g, b) = (px[0], px[1], px[2]);
        all_sum[0] += r as f64;
        all_sum[1] += g as f64;
        all_sum[2] += b as f64;
        all += 1.0;

        let hsl = rgb_to_hsl(r, g, b);
        if hsl.lightness < MIN_LIGHTNESS || hsl.lightness > MAX_LIGHTNESS {
            continue;
        }
        considered_sum[0] += r as f64;
        considered_sum[1] += g as f64;
        considered_sum[2] += b as f64;
        considered += 1.0;

        if hsl.saturation < MIN_SATURATION {
            continue;
        }
        let bin = &mut bins[hue_bin(hsl.hue)];
        let radians = hsl.hue.to_radians();
        bin.weight += 1.0;
        bin.sin += radians.sin();
        bin.cos += radians.cos();
        bin.saturation += hsl.saturation;
        bin.lightness += hsl.lightness;
    }

    if all == 0.0 {
        return None;
    }
    if considered == 0.0 {
        return Some(mean_hsl(all_sum, all));
    }

    let dominant = bins
        .iter()
        .max_by(|a, b| a.weight.total_cmp(&b.weight))
        .copied()
        .unwrap_or_default();

    if dominant.weight / considered < MIN_DOMINANT_SHARE {
        return Some(mean_hsl(considered_sum, considered));
    }

    Some(Hsl {
        hue: dominant
            .sin
            .atan2(dominant.cos)
            .to_degrees()
            .rem_euclid(360.0),
        saturation: dominant.saturation / dominant.weight,
        lightness: dominant.lightness / dominant.weight,
    })
}

pub fn thumbnail_url(raw: &str) -> Option<String> {
    let mut url = Url::parse(raw.trim()).ok()?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return None;
    }
    if url.host_str() != Some("resources.tidal.com") || !url.path().starts_with("/images/") {
        return Some(url.to_string());
    }
    let path = url.path().to_string();
    let (dir, file) = path.rsplit_once('/')?;
    let is_size = file
        .strip_suffix(".jpg")
        .and_then(|size| size.split_once('x'))
        .is_some_and(|(w, h)| {
            !w.is_empty()
                && !h.is_empty()
                && w.bytes().all(|c| c.is_ascii_digit())
                && h.bytes().all(|c| c.is_ascii_digit())
        });
    if is_size {
        url.set_path(&format!("{dir}/80x80.jpg"));
    }
    Some(url.to_string())
}

fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut response = agent().get(url).call().map_err(|e| e.to_string())?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_IMAGE_BYTES)
        .read_to_vec()
        .map_err(|e| e.to_string())
}

pub fn color_from_jpeg(bytes: &[u8]) -> Result<Hsl, String> {
    let mut img =
        image::load_from_memory_with_format(bytes, ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    if img.width() > MAX_SAMPLE_SIDE || img.height() > MAX_SAMPLE_SIDE {
        img = img.thumbnail(MAX_SAMPLE_SIDE, MAX_SAMPLE_SIDE);
    }
    representative_color(img.to_rgb8().as_raw()).ok_or_else(|| "empty image".to_string())
}

fn compute_one(item: CoverColorRequest) -> Option<CoverColorResult> {
    let url = thumbnail_url(&item.cover_url)?;
    let color = download(&url)
        .and_then(|bytes| color_from_jpeg(&bytes))
        .map_err(|err| eprintln!("[CoverColor] {}: {err}", item.album_id))
        .ok()?;
    Some(CoverColorResult {
        album_id: item.album_id,
        hue: color.hue,
        saturation: color.saturation,
        lightness: color.lightness,
    })
}

#[tauri::command]
pub async fn compute_cover_colors(
    items: Vec<CoverColorRequest>,
) -> Result<Vec<CoverColorResult>, String> {
    let mut results = Vec::with_capacity(items.len().min(MAX_ITEMS_PER_CALL));
    for chunk in items
        .into_iter()
        .take(MAX_ITEMS_PER_CALL)
        .collect::<Vec<_>>()
        .chunks(CONCURRENCY)
    {
        let handles: Vec<_> = chunk
            .iter()
            .cloned()
            .map(|item| tokio::task::spawn_blocking(move || compute_one(item)))
            .collect();
        for handle in futures_util::future::join_all(handles).await {
            if let Ok(Some(result)) = handle {
                results.push(result);
            }
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(r: u8, g: u8, b: u8, count: usize) -> Vec<u8> {
        [r, g, b].repeat(count)
    }

    fn approx(a: f64, b: f64, tolerance: f64) -> bool {
        (a - b).abs() <= tolerance
    }

    #[test]
    fn rgb_to_hsl_primaries() {
        let red = rgb_to_hsl(255, 0, 0);
        assert!(
            approx(red.hue, 0.0, 0.01)
                && approx(red.saturation, 1.0, 0.01)
                && approx(red.lightness, 0.5, 0.01)
        );
        assert!(approx(rgb_to_hsl(0, 255, 0).hue, 120.0, 0.01));
        assert!(approx(rgb_to_hsl(0, 0, 255).hue, 240.0, 0.01));
        let gray = rgb_to_hsl(128, 128, 128);
        assert_eq!(gray.saturation, 0.0);
        assert!(approx(gray.lightness, 0.5, 0.01));
    }

    #[test]
    fn red_cover_is_red() {
        let color = representative_color(&solid(220, 20, 30, 400)).unwrap();
        assert!(color.hue < 5.0 || color.hue > 355.0, "hue {}", color.hue);
        assert!(color.saturation > 0.7);
    }

    #[test]
    fn blue_cover_is_blue() {
        let color = representative_color(&solid(20, 30, 230, 400)).unwrap();
        assert!(approx(color.hue, 237.0, 5.0), "hue {}", color.hue);
    }

    #[test]
    fn gray_cover_has_low_saturation() {
        let color = representative_color(&solid(120, 122, 125, 400)).unwrap();
        assert!(color.saturation < 0.1, "saturation {}", color.saturation);
    }

    #[test]
    fn reds_across_zero_do_not_average_to_cyan() {
        let mut pixels = solid(255, 0, 20, 200);
        pixels.extend(solid(255, 20, 0, 200));
        let color = representative_color(&pixels).unwrap();
        assert!(color.hue < 10.0 || color.hue > 350.0, "hue {}", color.hue);
    }

    #[test]
    fn dominant_saturated_bin_wins_over_mean() {
        let mut pixels = solid(200, 30, 30, 600);
        pixels.extend(solid(30, 30, 200, 400));
        let color = representative_color(&pixels).unwrap();
        assert!(color.hue < 5.0 || color.hue > 355.0, "hue {}", color.hue);
    }

    #[test]
    fn ignores_black_and_white_borders() {
        let mut pixels = solid(0, 0, 0, 500);
        pixels.extend(solid(255, 255, 255, 400));
        pixels.extend(solid(30, 160, 40, 100));
        let color = representative_color(&pixels).unwrap();
        assert!(approx(color.hue, 124.0, 6.0), "hue {}", color.hue);
    }

    #[test]
    fn small_accent_on_gray_stays_neutral() {
        let mut pixels = solid(128, 128, 128, 950);
        pixels.extend(solid(255, 0, 0, 50));
        let color = representative_color(&pixels).unwrap();
        assert!(color.saturation < 0.15, "saturation {}", color.saturation);
    }

    #[test]
    fn only_black_and_white_falls_back_to_mean() {
        let mut pixels = solid(0, 0, 0, 100);
        pixels.extend(solid(255, 255, 255, 100));
        let color = representative_color(&pixels).unwrap();
        assert_eq!(color.saturation, 0.0);
        assert!(approx(color.lightness, 0.5, 0.01));
    }

    #[test]
    fn empty_buffer_has_no_color() {
        assert!(representative_color(&[]).is_none());
    }

    #[test]
    fn rewrites_tidal_image_size() {
        assert_eq!(
            thumbnail_url("https://resources.tidal.com/images/445f2174/4aa5/4a2a/a9fd/218213d1b8e6/640x640.jpg").as_deref(),
            Some("https://resources.tidal.com/images/445f2174/4aa5/4a2a/a9fd/218213d1b8e6/80x80.jpg")
        );
        assert_eq!(
            thumbnail_url("https://resources.tidal.com/images/abc/cover.jpg").as_deref(),
            Some("https://resources.tidal.com/images/abc/cover.jpg")
        );
        assert_eq!(
            thumbnail_url("https://example.com/images/a/640x640.jpg").as_deref(),
            Some("https://example.com/images/a/640x640.jpg")
        );
    }

    #[test]
    fn rejects_non_http_urls() {
        assert!(thumbnail_url("file:///etc/passwd").is_none());
        assert!(thumbnail_url("asset://localhost/cover.jpg").is_none());
        assert!(thumbnail_url("not a url").is_none());
    }

    #[test]
    #[ignore = "downloads a real TIDAL cover"]
    fn live_tidal_cover_color() {
        let url =
            "https://resources.tidal.com/images/445f2174/4aa5/4a2a/a9fd/218213d1b8e6/80x80.jpg";
        let bytes = download(url).expect("download");
        let color = color_from_jpeg(&bytes).expect("decode");
        println!(
            "live cover hsl: hue={:.1} saturation={:.3} lightness={:.3} ({} bytes)",
            color.hue,
            color.saturation,
            color.lightness,
            bytes.len()
        );
    }
}
