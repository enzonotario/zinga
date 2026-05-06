pub fn call_mopidy_rpc(
    host_ip: &str,
    method: &str,
    params: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!("http://{}:6680/mopidy/rpc", host_ip);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });

    let body_str =
        serde_json::to_string(&body).map_err(|e| format!("Error serializing JSON: {}", e))?;

    let mut response = ureq::post(&url)
        .header("Content-Type", "application/json")
        .send(&body_str)
        .map_err(|e| format!("HTTP request error: {}", e))?;

    let response_body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Error reading response: {}", e))?;

    let result: serde_json::Value =
        serde_json::from_str(&response_body).map_err(|e| format!("Error parsing JSON: {}", e))?;

    if let Some(error) = result.get("error") {
        return Err(format!("RPC error: {}", error));
    }

    Ok(result
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
}
