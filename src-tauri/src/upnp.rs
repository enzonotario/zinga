use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::{SocketAddrV4, UdpSocket};
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use ureq::Agent;
use url::Url;

const AV_TRANSPORT_INSTANCE_ID: u8 = 0;
const SET_URI_SETTLE_DELAY_MS: u64 = 500;
const PLAY_RETRY_DELAY_SECS: u64 = 1;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransportInfo {
    pub current_transport_state: String,
    pub current_transport_status: String,
    pub current_speed: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PositionInfo {
    pub track: u32,
    pub track_duration: String,
    pub track_meta_data: Option<String>,
    pub track_uri: Option<String>,
    pub rel_time: String,
    pub abs_time: String,
    pub rel_count: i32,
    pub abs_count: i32,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub nr_tracks: u32,
    pub media_duration: String,
    pub current_uri: String,
    pub current_uri_meta_data: Option<String>,
    pub next_uri: Option<String>,
    pub next_uri_meta_data: Option<String>,
    pub play_medium: String,
    pub record_medium: String,
    pub write_status: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub usn: Option<String>,
    pub location: Option<String>,
    pub ip: Option<String>,
    pub manufacturer: Option<String>,
    pub model_name: Option<String>,
    pub model_number: Option<String>,
    pub serial_number: Option<String>,
    pub device_type: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct UpnpDeviceInfo {
    pub id: String,
    pub name: String,
    pub usn: Option<String>,
    pub location: Option<String>,
    pub ip: Option<String>,
    pub rendering_control_url: Option<String>,
    pub av_transport_url: Option<String>,
    pub manufacturer: Option<String>,
    pub model_name: Option<String>,
    pub model_number: Option<String>,
    pub serial_number: Option<String>,
    pub device_type: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TrackInfo {
    pub uri: String,
    pub stream_url: String,
}

#[derive(Default)]
pub struct InnerState {
    pub devices: HashMap<String, UpnpDeviceInfo>,
    pub connected_device_id: Option<String>,
    pub playlist: Vec<TrackInfo>,
    pub current_track_index: usize,
}

#[derive(Default)]
pub struct AppState {
    pub inner: Mutex<InnerState>,
}

fn parse_headers(resp: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in resp.lines().skip(1) {
        if let Some((k, v)) = line.split_once(':') {
            map.insert(k.trim().to_ascii_uppercase(), v.trim().to_string());
        }
    }
    map
}

#[derive(Debug, Default)]
struct DescriptionResult {
    friendly_name: String,
    rendering_control_url: Option<String>,
    av_transport_url: Option<String>,
    manufacturer: Option<String>,
    model_name: Option<String>,
    model_number: Option<String>,
    serial_number: Option<String>,
    device_type: Option<String>,
    icon_url: Option<String>,
}

fn fetch_description(location: &str) -> Option<DescriptionResult> {
    let mut resp = ureq::get(location).call().ok()?;
    let body = resp.body_mut().read_to_string().ok()?;
    let mut reader = Reader::from_str(&body);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut friendly_name: Option<String> = None;
    let mut cur_text: Option<String> = None;
    let mut in_service = false;
    let mut current_service_type: Option<String> = None;
    let mut current_control_url: Option<String> = None;
    let mut rendering_control_url: Option<String> = None;
    let mut av_transport_url: Option<String> = None;
    let mut manufacturer: Option<String> = None;
    let mut model_name: Option<String> = None;
    let mut model_number: Option<String> = None;
    let mut serial_number: Option<String> = None;
    let mut device_type: Option<String> = None;
    let mut in_icon = false;
    let mut icon_mimetype: Option<String> = None;
    let mut icon_width: Option<u32> = None;
    let mut icon_url: Option<String> = None;
    let mut best_icon_url: Option<String> = None;
    let mut best_icon_score: u32 = 0;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "service" {
                    in_service = true;
                    current_service_type = None;
                    current_control_url = None;
                } else if name == "icon" {
                    in_icon = true;
                    icon_mimetype = None;
                    icon_width = None;
                    icon_url = None;
                }
                cur_text = None;
            }
            Ok(Event::Text(e)) => {
                cur_text = Some(e.decode().unwrap_or_default().to_string());
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "friendlyName" => {
                        if !in_service && !in_icon {
                            if let Some(t) = cur_text.take() {
                                friendly_name = Some(t);
                            }
                        }
                    }
                    "manufacturer" => {
                        if let Some(t) = cur_text.take() {
                            manufacturer = Some(t);
                        }
                    }
                    "modelName" => {
                        if let Some(t) = cur_text.take() {
                            model_name = Some(t);
                        }
                    }
                    "modelNumber" => {
                        if let Some(t) = cur_text.take() {
                            model_number = Some(t);
                        }
                    }
                    "serialNumber" => {
                        if let Some(t) = cur_text.take() {
                            serial_number = Some(t);
                        }
                    }
                    "deviceType" => {
                        if let Some(t) = cur_text.take() {
                            device_type = Some(t);
                        }
                    }
                    "mimetype" => {
                        if in_icon {
                            icon_mimetype = cur_text.take();
                        }
                    }
                    "width" => {
                        if in_icon {
                            if let Some(t) = cur_text.take() {
                                icon_width = t.parse().ok();
                            }
                        }
                    }
                    "url" => {
                        if in_icon {
                            icon_url = cur_text.take();
                        }
                    }
                    "icon" => {
                        if let Some(ref url) = icon_url {
                            let is_png = icon_mimetype.as_deref() == Some("image/png");
                            let w = icon_width.unwrap_or(0);
                            let score = w + if is_png { 10000 } else { 0 };
                            if score > best_icon_score {
                                best_icon_score = score;
                                best_icon_url = Some(url.clone());
                            }
                        }
                        in_icon = false;
                    }
                    "serviceType" => {
                        if in_service {
                            if let Some(t) = cur_text.take() {
                                current_service_type = Some(t);
                            }
                        }
                    }
                    "controlURL" => {
                        if in_service {
                            if let Some(t) = cur_text.take() {
                                current_control_url = Some(t);
                            }
                        }
                    }
                    "service" => {
                        if let (Some(st), Some(cu)) =
                            (current_service_type.clone(), current_control_url.clone())
                        {
                            if st.contains("RenderingControl") && rendering_control_url.is_none() {
                                rendering_control_url = Some(cu.clone());
                            }
                            if st.contains("AVTransport") && av_transport_url.is_none() {
                                av_transport_url = Some(cu);
                            }
                        }
                        in_service = false;
                        current_service_type = None;
                        current_control_url = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    let resolved_icon = best_icon_url.and_then(|u| absolute_url(location, &u));

    Some(DescriptionResult {
        friendly_name: friendly_name.unwrap_or_else(|| "Unknown".to_string()),
        rendering_control_url,
        av_transport_url,
        manufacturer,
        model_name,
        model_number,
        serial_number,
        device_type,
        icon_url: resolved_icon,
    })
}

fn absolute_url(base: &str, maybe_rel: &str) -> Option<String> {
    if let Ok(url) = Url::parse(maybe_rel) {
        return Some(url.to_string());
    }
    if let Ok(base_url) = Url::parse(base) {
        if let Ok(joined) = base_url.join(maybe_rel) {
            return Some(joined.to_string());
        }
    }
    None
}

fn ssdp_discover() -> Vec<UpnpDeviceInfo> {
    let ssdp_addr = SocketAddrV4::from_str("239.255.255.250:1900").unwrap();
    let socket = UdpSocket::bind(("0.0.0.0", 0)).ok();
    if socket.is_none() {
        return vec![];
    }
    let socket = socket.unwrap();
    socket
        .set_read_timeout(Some(std::time::Duration::from_millis(800)))
        .ok();
    let searches = vec![
        "urn:schemas-upnp-org:device:MediaRenderer:1",
        "urn:schemas-upnp-org:service:RenderingControl:1",
    ];
    for st in &searches {
        let req = format!(
            "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: {}\r\n\r\n",
            st
        );
        let _ = socket.send_to(req.as_bytes(), ssdp_addr);
    }
    let mut seen_locations: HashSet<String> = HashSet::new();
    let mut devices: Vec<UpnpDeviceInfo> = Vec::new();
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(3) {
        let mut buf = [0u8; 2048];
        if let Ok((n, src)) = socket.recv_from(&mut buf) {
            let resp = String::from_utf8_lossy(&buf[..n]).to_string();
            let headers = parse_headers(&resp);
            if let Some(location) = headers.get("LOCATION").cloned() {
                if seen_locations.insert(location.clone()) {
                    let ip = src.ip().to_string();
                    let usn = headers.get("USN").cloned();
                    if let Some(desc) = fetch_description(&location) {
                        let id = usn.clone().unwrap_or_else(|| location.clone());
                        let rc_abs = desc
                            .rendering_control_url
                            .and_then(|u| absolute_url(&location, &u));
                        let av_abs = desc
                            .av_transport_url
                            .and_then(|u| absolute_url(&location, &u));
                        devices.push(UpnpDeviceInfo {
                            id,
                            name: desc.friendly_name,
                            usn,
                            location: Some(location.clone()),
                            ip: Some(ip),
                            rendering_control_url: rc_abs,
                            av_transport_url: av_abs,
                            manufacturer: desc.manufacturer,
                            model_name: desc.model_name,
                            model_number: desc.model_number,
                            serial_number: desc.serial_number,
                            device_type: desc.device_type,
                            icon_url: desc.icon_url,
                        });
                    }
                }
            }
        }
    }
    devices
}

#[tauri::command]
pub async fn upnp_discover(state: tauri::State<'_, AppState>) -> Result<Vec<DeviceDto>, String> {
    let devices = tauri::async_runtime::spawn_blocking(ssdp_discover)
        .await
        .map_err(|e| format!("discovery task failed: {}", e))?;

    let mut inner = state.inner.lock().unwrap();
    inner.devices.clear();
    for d in &devices {
        inner.devices.insert(d.id.clone(), d.clone());
    }

    Ok(devices
        .into_iter()
        .map(|d| DeviceDto {
            id: d.id,
            name: d.name,
            usn: d.usn,
            location: d.location,
            ip: d.ip,
            manufacturer: d.manufacturer,
            model_name: d.model_name,
            model_number: d.model_number,
            serial_number: d.serial_number,
            device_type: d.device_type,
            icon_url: d.icon_url,
        })
        .collect())
}

#[tauri::command]
pub fn upnp_get_services(device_id: String, state: tauri::State<AppState>) -> Vec<String> {
    let inner = state.inner.lock().unwrap();
    if let Some(d) = inner.devices.get(&device_id) {
        let mut v = Vec::new();
        if d.av_transport_url.is_some() {
            v.push("AVTransport".to_string());
        }
        if d.rendering_control_url.is_some() {
            v.push("RenderingControl".to_string());
        }
        return v;
    }
    vec![]
}

fn soap_agent() -> &'static Agent {
    static AGENT: OnceLock<Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        let config = Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(5)))
            .timeout_connect(Some(Duration::from_secs(2)))
            .timeout_recv_response(Some(Duration::from_secs(4)))
            .timeout_recv_body(Some(Duration::from_secs(4)))
            .build();
        Agent::new_with_config(config)
    })
}

fn soap_post(url: &str, action: &str, body: &str) -> Result<String, String> {
    let mut res = soap_agent()
        .post(url)
        .header("SOAPACTION", action)
        .header("Content-Type", "text/xml; charset=\"utf-8\"")
        .send(body)
        .map_err(|e| format!("request error: {}", e))?;
    Ok(res.body_mut().read_to_string().map_err(|e| e.to_string())?)
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn build_didl_metadata(uri: &str) -> String {
    format!(
        "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" \
                   xmlns:dc=\"http://purl.org/dc/elements/1.1/\" \
                   xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" \
                   xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\">\
          <item id=\"0\" parentID=\"0\" restricted=\"1\">\
            <dc:title>Zinga Stream</dc:title>\
            <upnp:class>object.item.audioItem.musicTrack</upnp:class>\
            <res protocolInfo=\"http-get:*:audio/mpeg:*\">{}</res>\
          </item>\
        </DIDL-Lite>",
        uri
    )
}

fn append_xml_start_tag(
    target: &mut String,
    name: &str,
    attributes: quick_xml::events::attributes::Attributes<'_>,
    decoder: quick_xml::encoding::Decoder,
) {
    target.push('<');
    target.push_str(name);
    for attr in attributes.flatten() {
        let attr_name = String::from_utf8_lossy(attr.key.as_ref());
        let attr_value = attr.decode_and_unescape_value(decoder).unwrap_or_default();
        target.push_str(&format!(" {}=\"{}\"", attr_name, attr_value));
    }
    target.push('>');
}

fn upnp_play_body() -> &'static str {
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Play xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
<Speed>1</Speed>\
</u:Play>\
</s:Body>\
</s:Envelope>"
}

fn send_play_with_retry(av_url: &str) -> Result<(), String> {
    let play_body = upnp_play_body();
    match soap_post(
        av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#Play\"",
        play_body,
    ) {
        Ok(resp) => {
            println!("[UPnP] Play OK: {} bytes", resp.len());
            Ok(())
        }
        Err(first_error) => {
            println!(
                "[UPnP] WARNING Play failed, retrying in 1s: {}",
                first_error
            );
            std::thread::sleep(Duration::from_secs(PLAY_RETRY_DELAY_SECS));
            soap_post(
                av_url,
                "\"urn:schemas-upnp-org:service:AVTransport:1#Play\"",
                play_body,
            )
            .map(|_| println!("[UPnP] Play OK on retry"))
            .map_err(|retry_error| format!("Play failed: {}", retry_error))
        }
    }
}

fn step_playlist_index(current: usize, len: usize, forward: bool) -> usize {
    if len == 0 {
        return 0;
    }

    if forward {
        (current + 1) % len
    } else if current == 0 {
        len - 1
    } else {
        current - 1
    }
}

#[tauri::command]
pub fn upnp_connect(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|_| "state poisoned")?;
    if inner.devices.contains_key(&device_id) {
        inner.connected_device_id = Some(device_id);
        Ok(())
    } else {
        Err("device not found".into())
    }
}

#[tauri::command]
pub fn upnp_disconnect(state: tauri::State<AppState>) {
    let mut inner = state.inner.lock().unwrap();
    inner.connected_device_id = None;
}

#[tauri::command]
pub fn upnp_get_volume(device_id: String, state: tauri::State<AppState>) -> Result<u8, String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let rc_url = dev
        .rendering_control_url
        .clone()
        .ok_or("device has no RenderingControl")?;
    drop(inner);
    let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:GetVolume xmlns:u=\"urn:schemas-upnp-org:service:RenderingControl:1\">\
<InstanceID>0</InstanceID>\
<Channel>Master</Channel>\
</u:GetVolume>\
</s:Body>\
</s:Envelope>";
    let resp = soap_post(
        &rc_url,
        "\"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume\"",
        body,
    )?;
    let mut reader = Reader::from_str(&resp);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut cur_text: Option<String> = None;
    let mut vol: Option<u8> = None;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(e)) => {
                cur_text = Some(e.decode().unwrap_or_default().to_string());
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("CurrentVolume") {
                    if let Some(t) = cur_text.take() {
                        if let Ok(v) = t.parse::<u8>() {
                            vol = Some(v);
                            break;
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    vol.ok_or("no volume in response".into())
}

#[tauri::command]
pub fn upnp_set_volume(
    device_id: String,
    level: u8,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if level > 100 {
        return Err("volume must be 0-100".into());
    }
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let rc_url = dev
        .rendering_control_url
        .clone()
        .ok_or("device has no RenderingControl")?;
    drop(inner);
    let body = format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:SetVolume xmlns:u=\"urn:schemas-upnp-org:service:RenderingControl:1\">\
<InstanceID>0</InstanceID>\
<Channel>Master</Channel>\
<DesiredVolume>{}</DesiredVolume>\
</u:SetVolume>\
</s:Body>\
</s:Envelope>", level);
    let _resp = soap_post(
        &rc_url,
        "\"urn:schemas-upnp-org:service:RenderingControl:1#SetVolume\"",
        &body,
    )?;
    Ok(())
}

#[tauri::command]
pub fn upnp_play(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    send_play_with_retry(&av_url)
}

#[tauri::command]
pub fn upnp_set_uri_and_play(
    device_id: String,
    uri: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    println!("[UPnP] upnp_set_uri_and_play llamado");
    println!("[UPnP] device_id: {}", device_id);
    println!("[UPnP] uri: {}", uri);

    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or_else(|| {
        println!("[UPnP] ERROR: device not found: {}", device_id);
        "device not found".to_string()
    })?;
    let dev_name = dev.name.clone();
    let av_url = dev.av_transport_url.clone().ok_or_else(|| {
        println!("[UPnP] ERROR: device has no AVTransport");
        "device has no AVTransport".to_string()
    })?;
    drop(inner);

    println!("[UPnP] Dispositivo: {} ({})", dev_name, device_id);
    println!("[UPnP] AVTransport URL: {}", av_url);

    let escaped_uri = escape_xml(&uri);
    let escaped_metadata = escape_xml(&build_didl_metadata(&escaped_uri));

    let set_body = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:SetAVTransportURI xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>{}</InstanceID>\
<CurrentURI>{}</CurrentURI>\
<CurrentURIMetaData>{}</CurrentURIMetaData>\
</u:SetAVTransportURI>\
</s:Body>\
</s:Envelope>",
        AV_TRANSPORT_INSTANCE_ID,
        escaped_uri,
        escaped_metadata
    );

    println!("[UPnP] Enviando SetAVTransportURI...");
    match soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI\"",
        &set_body,
    ) {
        Ok(resp) => println!("[UPnP] SetAVTransportURI OK: {} bytes", resp.len()),
        Err(e) => {
            println!("[UPnP] ERROR SetAVTransportURI: {}", e);
            return Err(format!("SetAVTransportURI failed: {}", e));
        }
    }

    std::thread::sleep(Duration::from_millis(SET_URI_SETTLE_DELAY_MS));
    println!("[UPnP] Enviando Play...");
    send_play_with_retry(&av_url)?;

    println!("[UPnP] upnp_set_uri_and_play completado exitosamente");
    Ok(())
}

#[tauri::command]
pub fn upnp_stop(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let stop_body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:Stop>\
</s:Body>\
</s:Envelope>";
    let _ = soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#Stop\"",
        stop_body,
    )?;
    Ok(())
}

#[tauri::command]
pub fn upnp_pause(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let pause_body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Pause xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:Pause>\
</s:Body>\
</s:Envelope>";
    match soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#Pause\"",
        pause_body,
    ) {
        Ok(_) => Ok(()),
        Err(_) => {
            let stop_body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:Stop>\
</s:Body>\
</s:Envelope>";
            let _ = soap_post(
                &av_url,
                "\"urn:schemas-upnp-org:service:AVTransport:1#Stop\"",
                stop_body,
            )?;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn upnp_get_transport_info(state: tauri::State<AppState>) -> Result<TransportInfo, String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev_id = inner
        .connected_device_id
        .clone()
        .ok_or("no connected device")?;
    let dev = inner
        .devices
        .get(&dev_id)
        .ok_or("connected device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:GetTransportInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:GetTransportInfo>\
</s:Body>\
</s:Envelope>";
    let resp = soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#GetTransportInfo\"",
        body,
    )?;
    let mut reader = Reader::from_str(&resp);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut cur_text: Option<String> = None;
    let mut current_transport_state: Option<String> = None;
    let mut current_transport_status: Option<String> = None;
    let mut current_speed: Option<String> = None;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(e)) => {
                cur_text = Some(e.decode().unwrap_or_default().to_string());
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("CurrentTransportState") {
                    if let Some(t) = cur_text.take() {
                        current_transport_state = Some(t);
                    }
                } else if name.ends_with("CurrentTransportStatus") {
                    if let Some(t) = cur_text.take() {
                        current_transport_status = Some(t);
                    }
                } else if name.ends_with("CurrentSpeed") {
                    if let Some(t) = cur_text.take() {
                        current_speed = Some(t);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(TransportInfo {
        current_transport_state: current_transport_state.unwrap_or_else(|| "UNKNOWN".to_string()),
        current_transport_status: current_transport_status.unwrap_or_else(|| "UNKNOWN".to_string()),
        current_speed: current_speed.unwrap_or_else(|| "1".to_string()),
    })
}

#[tauri::command]
pub fn upnp_get_position_info(state: tauri::State<AppState>) -> Result<PositionInfo, String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev_id = inner
        .connected_device_id
        .clone()
        .ok_or("no connected device")?;
    let dev = inner
        .devices
        .get(&dev_id)
        .ok_or("connected device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:GetPositionInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:GetPositionInfo>\
</s:Body>\
</s:Envelope>";
    let resp = soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo\"",
        body,
    )?;
    let mut reader = Reader::from_str(&resp);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut cur_text: Option<String> = None;
    let mut track: Option<u32> = None;
    let mut track_duration: Option<String> = None;
    let mut track_meta_data: Option<String> = None;
    let mut track_uri: Option<String> = None;
    let mut rel_time: Option<String> = None;
    let mut abs_time: Option<String> = None;
    let mut rel_count: Option<i32> = None;
    let mut abs_count: Option<i32> = None;
    let mut in_track_meta_data = false;
    let mut track_meta_data_depth = 0;
    let mut track_meta_data_content = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("TrackMetaData") {
                    in_track_meta_data = true;
                    track_meta_data_depth = 1;
                    track_meta_data_content.clear();
                    append_xml_start_tag(
                        &mut track_meta_data_content,
                        &name,
                        e.attributes(),
                        reader.decoder(),
                    );
                } else if in_track_meta_data {
                    track_meta_data_depth += 1;
                    append_xml_start_tag(
                        &mut track_meta_data_content,
                        &name,
                        e.attributes(),
                        reader.decoder(),
                    );
                }
            }
            Ok(Event::Text(e)) => {
                if in_track_meta_data {
                    let text = e.decode().unwrap_or_default();
                    track_meta_data_content.push_str(&text);
                } else {
                    cur_text = Some(e.decode().unwrap_or_default().to_string());
                }
            }
            Ok(Event::CData(e)) => {
                if in_track_meta_data {
                    let cdata = String::from_utf8_lossy(&e);
                    track_meta_data_content.push_str(&format!("<![CDATA[{}]]>", cdata));
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("TrackMetaData") {
                    track_meta_data_content.push_str(&format!("</{}>", name));
                    track_meta_data = Some(track_meta_data_content.clone());
                    in_track_meta_data = false;
                    track_meta_data_depth = 0;
                    track_meta_data_content.clear();
                } else if in_track_meta_data {
                    track_meta_data_depth -= 1;
                    track_meta_data_content.push_str(&format!("</{}>", name));
                    if track_meta_data_depth == 0 {
                        track_meta_data = Some(track_meta_data_content.clone());
                        in_track_meta_data = false;
                        track_meta_data_content.clear();
                    }
                } else if name.ends_with("Track") {
                    if let Some(t) = cur_text.take() {
                        if let Ok(v) = t.parse::<u32>() {
                            track = Some(v);
                        }
                    }
                } else if name.ends_with("TrackDuration") {
                    if let Some(t) = cur_text.take() {
                        track_duration = Some(t);
                    }
                } else if name.ends_with("TrackURI") {
                    if let Some(t) = cur_text.take() {
                        track_uri = Some(t);
                    }
                } else if name.ends_with("RelTime") {
                    if let Some(t) = cur_text.take() {
                        rel_time = Some(t);
                    }
                } else if name.ends_with("AbsTime") {
                    if let Some(t) = cur_text.take() {
                        abs_time = Some(t);
                    }
                } else if name.ends_with("RelCount") {
                    if let Some(t) = cur_text.take() {
                        if let Ok(v) = t.parse::<i32>() {
                            rel_count = Some(v);
                        }
                    }
                } else if name.ends_with("AbsCount") {
                    if let Some(t) = cur_text.take() {
                        if let Ok(v) = t.parse::<i32>() {
                            abs_count = Some(v);
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(PositionInfo {
        track: track.unwrap_or(0),
        track_duration: track_duration.unwrap_or_else(|| "00:00:00".to_string()),
        track_meta_data,
        track_uri,
        rel_time: rel_time.unwrap_or_else(|| "00:00:00".to_string()),
        abs_time: abs_time.unwrap_or_else(|| "00:00:00".to_string()),
        rel_count: rel_count.unwrap_or(0),
        abs_count: abs_count.unwrap_or(0),
    })
}

#[tauri::command]
pub fn upnp_seek(rel_time: String, state: tauri::State<AppState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev_id = inner
        .connected_device_id
        .clone()
        .ok_or("no connected device")?;
    let dev = inner
        .devices
        .get(&dev_id)
        .ok_or("connected device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let body = format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Seek xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
<Unit>REL_TIME</Unit>\
<Target>{}</Target>\
</u:Seek>\
</s:Body>\
</s:Envelope>", rel_time);
    let _resp = soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#Seek\"",
        &body,
    )?;
    Ok(())
}

#[tauri::command]
pub fn upnp_next(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|_| "state poisoned")?;
    if inner.playlist.is_empty() {
        let dev = inner.devices.get(&device_id).ok_or("device not found")?;
        let av_url = dev
            .av_transport_url
            .clone()
            .ok_or("device has no AVTransport")?;
        drop(inner);
        let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Next xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:Next>\
</s:Body>\
</s:Envelope>";
        let _resp = soap_post(
            &av_url,
            "\"urn:schemas-upnp-org:service:AVTransport:1#Next\"",
            body,
        )?;
        return Ok(());
    }

    inner.current_track_index =
        step_playlist_index(inner.current_track_index, inner.playlist.len(), true);

    let track = inner.playlist[inner.current_track_index].clone();
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let _av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);

    upnp_set_uri_and_play(device_id, track.stream_url, state)?;

    Ok(())
}

#[tauri::command]
pub fn upnp_previous(device_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|_| "state poisoned")?;
    if inner.playlist.is_empty() {
        let dev = inner.devices.get(&device_id).ok_or("device not found")?;
        let av_url = dev
            .av_transport_url
            .clone()
            .ok_or("device has no AVTransport")?;
        drop(inner);
        let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:Previous xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:Previous>\
</s:Body>\
</s:Envelope>";
        let _resp = soap_post(
            &av_url,
            "\"urn:schemas-upnp-org:service:AVTransport:1#Previous\"",
            body,
        )?;
        return Ok(());
    }

    inner.current_track_index =
        step_playlist_index(inner.current_track_index, inner.playlist.len(), false);

    let track = inner.playlist[inner.current_track_index].clone();
    let dev = inner.devices.get(&device_id).ok_or("device not found")?;
    let _av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);

    upnp_set_uri_and_play(device_id, track.stream_url, state)?;

    Ok(())
}

#[tauri::command]
pub fn upnp_get_media_info(state: tauri::State<AppState>) -> Result<MediaInfo, String> {
    let inner = state.inner.lock().map_err(|_| "state poisoned")?;
    let dev_id = inner
        .connected_device_id
        .clone()
        .ok_or("no connected device")?;
    let dev = inner
        .devices
        .get(&dev_id)
        .ok_or("connected device not found")?;
    let av_url = dev
        .av_transport_url
        .clone()
        .ok_or("device has no AVTransport")?;
    drop(inner);
    let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\
<s:Body>\
<u:GetMediaInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">\
<InstanceID>0</InstanceID>\
</u:GetMediaInfo>\
</s:Body>\
</s:Envelope>";
    let resp = soap_post(
        &av_url,
        "\"urn:schemas-upnp-org:service:AVTransport:1#GetMediaInfo\"",
        body,
    )?;
    let mut reader = Reader::from_str(&resp);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut cur_text: Option<String> = None;
    let mut nr_tracks: Option<u32> = None;
    let mut media_duration: Option<String> = None;
    let mut current_uri: Option<String> = None;
    let mut current_uri_meta_data: Option<String> = None;
    let mut next_uri: Option<String> = None;
    let mut next_uri_meta_data: Option<String> = None;
    let mut play_medium: Option<String> = None;
    let mut record_medium: Option<String> = None;
    let mut write_status: Option<String> = None;
    let mut in_current_uri_meta_data = false;
    let mut current_uri_meta_data_depth = 0;
    let mut current_uri_meta_data_content = String::new();
    let mut in_next_uri_meta_data = false;
    let mut next_uri_meta_data_depth = 0;
    let mut next_uri_meta_data_content = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("CurrentURIMetaData") {
                    in_current_uri_meta_data = true;
                    current_uri_meta_data_depth = 1;
                    current_uri_meta_data_content.clear();
                    current_uri_meta_data_content.push_str(&format!("<{}", name));
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let attr_value = attr
                                .decode_and_unescape_value(reader.decoder())
                                .unwrap_or_default();
                            current_uri_meta_data_content
                                .push_str(&format!(" {}=\"{}\"", attr_name, attr_value));
                        }
                    }
                    current_uri_meta_data_content.push('>');
                } else if name.ends_with("NextURIMetaData") {
                    in_next_uri_meta_data = true;
                    next_uri_meta_data_depth = 1;
                    next_uri_meta_data_content.clear();
                    next_uri_meta_data_content.push_str(&format!("<{}", name));
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let attr_value = attr
                                .decode_and_unescape_value(reader.decoder())
                                .unwrap_or_default();
                            next_uri_meta_data_content
                                .push_str(&format!(" {}=\"{}\"", attr_name, attr_value));
                        }
                    }
                    next_uri_meta_data_content.push('>');
                } else if in_current_uri_meta_data {
                    current_uri_meta_data_depth += 1;
                    current_uri_meta_data_content.push_str(&format!("<{}", name));
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let attr_value = attr
                                .decode_and_unescape_value(reader.decoder())
                                .unwrap_or_default();
                            current_uri_meta_data_content
                                .push_str(&format!(" {}=\"{}\"", attr_name, attr_value));
                        }
                    }
                    current_uri_meta_data_content.push('>');
                } else if in_next_uri_meta_data {
                    next_uri_meta_data_depth += 1;
                    next_uri_meta_data_content.push_str(&format!("<{}", name));
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let attr_name = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let attr_value = attr
                                .decode_and_unescape_value(reader.decoder())
                                .unwrap_or_default();
                            next_uri_meta_data_content
                                .push_str(&format!(" {}=\"{}\"", attr_name, attr_value));
                        }
                    }
                    next_uri_meta_data_content.push('>');
                }
            }
            Ok(Event::Text(e)) => {
                if in_current_uri_meta_data {
                    let text = e.decode().unwrap_or_default();
                    current_uri_meta_data_content.push_str(&text);
                } else if in_next_uri_meta_data {
                    let text = e.decode().unwrap_or_default();
                    next_uri_meta_data_content.push_str(&text);
                } else {
                    cur_text = Some(e.decode().unwrap_or_default().to_string());
                }
            }
            Ok(Event::CData(e)) => {
                if in_current_uri_meta_data {
                    let cdata = String::from_utf8_lossy(&e);
                    current_uri_meta_data_content.push_str(&format!("<![CDATA[{}]]>", cdata));
                } else if in_next_uri_meta_data {
                    let cdata = String::from_utf8_lossy(&e);
                    next_uri_meta_data_content.push_str(&format!("<![CDATA[{}]]>", cdata));
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name.ends_with("CurrentURIMetaData") {
                    current_uri_meta_data_content.push_str(&format!("</{}>", name));
                    current_uri_meta_data = Some(current_uri_meta_data_content.clone());
                    in_current_uri_meta_data = false;
                    current_uri_meta_data_depth = 0;
                    current_uri_meta_data_content.clear();
                } else if name.ends_with("NextURIMetaData") {
                    next_uri_meta_data_content.push_str(&format!("</{}>", name));
                    next_uri_meta_data = Some(next_uri_meta_data_content.clone());
                    in_next_uri_meta_data = false;
                    next_uri_meta_data_depth = 0;
                    next_uri_meta_data_content.clear();
                } else if in_current_uri_meta_data {
                    current_uri_meta_data_depth -= 1;
                    current_uri_meta_data_content.push_str(&format!("</{}>", name));
                    if current_uri_meta_data_depth == 0 {
                        current_uri_meta_data = Some(current_uri_meta_data_content.clone());
                        in_current_uri_meta_data = false;
                        current_uri_meta_data_content.clear();
                    }
                } else if in_next_uri_meta_data {
                    next_uri_meta_data_depth -= 1;
                    next_uri_meta_data_content.push_str(&format!("</{}>", name));
                    if next_uri_meta_data_depth == 0 {
                        next_uri_meta_data = Some(next_uri_meta_data_content.clone());
                        in_next_uri_meta_data = false;
                        next_uri_meta_data_content.clear();
                    }
                } else if name.ends_with("NrTracks") {
                    if let Some(t) = cur_text.take() {
                        if let Ok(v) = t.parse::<u32>() {
                            nr_tracks = Some(v);
                        }
                    }
                } else if name.ends_with("MediaDuration") {
                    if let Some(t) = cur_text.take() {
                        media_duration = Some(t);
                    }
                } else if name.ends_with("CurrentURI") {
                    if let Some(t) = cur_text.take() {
                        current_uri = Some(t);
                    }
                } else if name.ends_with("NextURI") {
                    if let Some(t) = cur_text.take() {
                        next_uri = Some(t);
                    }
                } else if name.ends_with("PlayMedium") {
                    if let Some(t) = cur_text.take() {
                        play_medium = Some(t);
                    }
                } else if name.ends_with("RecordMedium") {
                    if let Some(t) = cur_text.take() {
                        record_medium = Some(t);
                    }
                } else if name.ends_with("WriteStatus") {
                    if let Some(t) = cur_text.take() {
                        write_status = Some(t);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(MediaInfo {
        nr_tracks: nr_tracks.unwrap_or(0),
        media_duration: media_duration.unwrap_or_else(|| "NOT_IMPLEMENTED".to_string()),
        current_uri: current_uri.unwrap_or_else(|| "".to_string()),
        current_uri_meta_data,
        next_uri,
        next_uri_meta_data,
        play_medium: play_medium.unwrap_or_else(|| "NONE".to_string()),
        record_medium: record_medium.unwrap_or_else(|| "NOT_IMPLEMENTED".to_string()),
        write_status: write_status.unwrap_or_else(|| "NOT_IMPLEMENTED".to_string()),
    })
}

#[tauri::command]
pub fn upnp_set_playlist(
    _device_id: String,
    track_uris: Vec<String>,
    stream_urls: Vec<String>,
    start_index: Option<usize>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if track_uris.len() != stream_urls.len() {
        return Err("track_uris and stream_urls must have the same length".to_string());
    }

    let mut inner = state.inner.lock().map_err(|_| "state poisoned")?;

    inner.playlist = track_uris
        .into_iter()
        .zip(stream_urls.into_iter())
        .map(|(uri, stream_url)| TrackInfo { uri, stream_url })
        .collect();

    let requested_index = start_index.unwrap_or(0);
    if inner.playlist.is_empty() {
        inner.current_track_index = 0;
    } else {
        inner.current_track_index = requested_index.min(inner.playlist.len() - 1);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_headers() {
        let resp = "HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.10:8080/desc.xml\r\nUSN: uuid:1234::upnp:rootdevice\r\n";
        let headers = parse_headers(resp);
        assert_eq!(
            headers.get("LOCATION").unwrap(),
            "http://192.168.1.10:8080/desc.xml"
        );
        assert_eq!(headers.get("USN").unwrap(), "uuid:1234::upnp:rootdevice");
    }

    #[test]
    fn test_absolute_url() {
        let base = "http://192.168.1.10:8080/desc.xml";
        assert_eq!(
            absolute_url(base, "ctrl.xml").unwrap(),
            "http://192.168.1.10:8080/ctrl.xml"
        );
        assert_eq!(
            absolute_url(base, "/root/ctrl.xml").unwrap(),
            "http://192.168.1.10:8080/root/ctrl.xml"
        );
        assert_eq!(
            absolute_url(base, "http://other.com/api").unwrap(),
            "http://other.com/api"
        );
    }
}
