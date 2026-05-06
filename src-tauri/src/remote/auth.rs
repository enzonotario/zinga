use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};
use std::sync::Arc;

use super::state::RemoteState;

pub async fn auth_middleware(
    state: axum::extract::State<Arc<RemoteState>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path();

    if path == "/api/pair"
        || path == "/api/pair/verify"
        || path.starts_with("/assets/")
        || path == "/"
        || path == "/index.html"
        || path == "/app.js"
        || path == "/style.css"
    {
        return Ok(next.run(request).await);
    }

    if !path.starts_with("/api/") && !path.starts_with("/ws") {
        return Ok(next.run(request).await);
    }

    let token = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .or_else(|| {
            request.uri().query().and_then(|q| {
                q.split('&')
                    .find(|p| p.starts_with("token="))
                    .map(|p| &p[6..])
            })
        });

    match token {
        Some(t) if state.is_valid_token(t).await => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
