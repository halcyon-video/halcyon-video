//! Opt-in loopback bridge for browser and Docker deployments.
//! The browser receives catalog data only; Steam cookies and access tokens
//! stay in this process. Every origin requires an explicit native approval.
use crate::steam;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::Read, path::PathBuf, sync::Mutex, thread};
#[cfg(unix)] use std::os::unix::fs::OpenOptionsExt;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use url::Url;

const ADDRESS: &str = "127.0.0.1:1421";
const APPROVAL_WINDOW: &str = "steam-companion-approval";

#[derive(Default)]
pub struct CompanionState {
    pairs: Mutex<HashMap<String, String>>,
    pending: Mutex<HashMap<String, String>>,
    store: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize)]
struct PairRequest { origin: String }

fn secret() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|_| "Secure random source is unavailable.".to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn valid_origin(value: &str) -> bool {
    Url::parse(value).ok().is_some_and(|url| {
        matches!(url.scheme(), "http" | "https") && url.username().is_empty()
            && url.password().is_none() && url.host_str().is_some()
            && url.path() == "/" && url.query().is_none() && url.fragment().is_none()
    })
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static header")
}

fn origin(request: &Request) -> Option<String> {
    request.headers().iter().find(|h| h.field.equiv("Origin")).map(|h| h.value.as_str().to_string())
}

fn response(status: u16, body: impl Into<String>, cors: Option<&str>) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut result = Response::from_string(body.into()).with_status_code(StatusCode(status))
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Cache-Control", "no-store"));
    if let Some(value) = cors {
        result.add_header(header("Access-Control-Allow-Origin", value));
        result.add_header(header("Vary", "Origin"));
        result.add_header(header("Access-Control-Allow-Private-Network", "true"));
    }
    result
}

fn error(message: impl AsRef<str>) -> String {
    serde_json::json!({ "error": message.as_ref() }).to_string()
}

fn read_json<T: for<'de> Deserialize<'de>>(request: &mut Request) -> Result<T, String> {
    let length = request.body_length().unwrap_or(0);
    if length > 64 * 1024 { return Err("Request is too large.".into()); }
    let mut body = String::new();
    request.as_reader().take(64 * 1024).read_to_string(&mut body).map_err(|_| "Could not read request.".to_string())?;
    serde_json::from_str(&body).map_err(|_| "Invalid request.".to_string())
}

fn bearer(request: &Request) -> Option<&str> {
    request.headers().iter().find(|h| h.field.equiv("Authorization"))
        .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
}

fn authorized(request: &Request, state: &CompanionState) -> Result<String, String> {
    let origin = origin(request).ok_or("Missing browser origin.")?;
    let token = bearer(request).ok_or("Pair this Halcyon store with the Steam companion first.")?;
    let pairs = state.pairs.lock().unwrap();
    if pairs.get(&origin).map(String::as_str) != Some(token) { return Err("Steam companion pairing is invalid or expired.".into()); }
    Ok(origin)
}

fn save_pairs(state: &CompanionState) {
    let Some(path) = state.store.lock().unwrap().clone() else { return; };
    let data = serde_json::to_vec(&*state.pairs.lock().unwrap()).unwrap_or_default();
    #[cfg(unix)] {
        use std::io::Write;
        if let Ok(mut file) = fs::OpenOptions::new().create(true).write(true).truncate(true).mode(0o600).open(path) { let _ = file.write_all(&data); }
    }
    #[cfg(not(unix))] { let _ = fs::write(path, data); }
}

fn approval_html(id: &str, origin: &str) -> String {
    let safe_origin = origin.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    format!(r#"<!doctype html><meta charset=utf-8><title>Pair Halcyon</title><style>body{{font:18px system-ui;background:#101820;color:#fff;display:grid;place-content:center;min-height:90vh;text-align:center}}button{{font:inherit;padding:12px 24px;margin:8px}}</style><main><h1>Allow this Halcyon store?</h1><p>{safe_origin}</p><p>It may read your Steam library and launch games you choose.</p><button id=yes>Allow</button><button onclick=window.close()>Deny</button></main><script>yes.onclick=async()=>{{await fetch('/approve/{id}',{{method:'POST'}});document.body.innerHTML='<h1>Paired</h1><p>You may return to Halcyon.</p>';setTimeout(()=>window.close(),700)}}</script>"#)
}

fn open_approval(app: &AppHandle, id: &str) -> Result<(), String> {
    let url: Url = format!("http://{ADDRESS}/approve/{id}").parse().unwrap();
    if let Some(old) = app.get_webview_window(APPROVAL_WINDOW) {
        old.navigate(url).map_err(|_| "Could not update the companion approval window.".to_string())?;
        let _ = old.show(); let _ = old.set_focus(); return Ok(());
    }
    WebviewWindowBuilder::new(app, APPROVAL_WINDOW, WebviewUrl::External(url))
        .title("Pair Halcyon Steam Companion").inner_size(560., 380.).resizable(false)
        .on_navigation(|url| url.host_str() == Some("127.0.0.1") && url.port() == Some(1421))
        .build().map(|_| ()).map_err(|_| "Could not open the companion approval window.".into())
}

fn handle(mut request: Request, app: AppHandle) {
    let cors = origin(&request);
    if request.method() == &Method::Options {
        let mut out = response(204, "", cors.as_deref());
        out.add_header(header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"));
        out.add_header(header("Access-Control-Allow-Headers", "Authorization, Content-Type"));
        let _ = request.respond(out); return;
    }
    let path = request.url().split('?').next().unwrap_or("").to_string();
    let state = app.state::<CompanionState>();
    let result: Result<String, String> = (|| {
        if request.method() == &Method::Get && path == "/v1/status" {
            return Ok(serde_json::json!({"ok":true,"version":1,"paired":cors.as_ref().is_some_and(|o| state.pairs.lock().unwrap().contains_key(o))}).to_string());
        }
        if request.method() == &Method::Post && path == "/v1/pair" {
            let body: PairRequest = read_json(&mut request)?;
            let request_origin = cors.clone().ok_or("Missing browser origin.")?;
            if body.origin != request_origin || !valid_origin(&body.origin) { return Err("Invalid browser origin.".into()); }
            let id = secret()?; state.pending.lock().unwrap().insert(id.clone(), body.origin);
            open_approval(&app, &id)?;
            return Ok(serde_json::json!({"requestId":id}).to_string());
        }
        if request.method() == &Method::Get && path.starts_with("/v1/pair/") {
            let id = path.trim_start_matches("/v1/pair/");
            let request_origin = cors.clone().ok_or("Missing browser origin.")?;
            if state.pending.lock().unwrap().get(id).map(String::as_str) == Some(request_origin.as_str()) {
                return Ok(serde_json::json!({"pending":true}).to_string());
            }
            let pairs = state.pairs.lock().unwrap();
            return Ok(match pairs.get(&request_origin) { Some(token) => serde_json::json!({"token":token}), None => serde_json::json!({"pending":false}) }.to_string());
        }
        if request.method() == &Method::Get && path.starts_with("/approve/") {
            let id = path.trim_start_matches("/approve/");
            let pair_origin = state.pending.lock().unwrap().get(id).cloned().ok_or("Pairing request expired.")?;
            return Ok(serde_json::json!({"html":approval_html(id, &pair_origin)}).to_string());
        }
        if request.method() == &Method::Post && path.starts_with("/approve/") && cors.as_deref() == Some("http://127.0.0.1:1421") {
            let id = path.trim_start_matches("/approve/");
            let pair_origin = state.pending.lock().unwrap().remove(id).ok_or("Pairing request expired.")?;
            let token = secret()?; state.pairs.lock().unwrap().insert(pair_origin, token); save_pairs(&state);
            return Ok("{\"ok\":true}".into());
        }
        authorized(&request, &state)?;
        match (request.method(), path.as_str()) {
            (&Method::Post, "/v1/connect") => { steam::companion_connect(&app)?; Ok("{\"ok\":true}".into()) }
            (&Method::Post, "/v1/library") => serde_json::to_string(&steam::companion_library(&app)?).map_err(|_| "Could not encode Steam library.".into()),
            (&Method::Post, "/v1/reviews") => { let body: serde_json::Value = read_json(&mut request)?; let ids = serde_json::from_value(body["appIds"].clone()).map_err(|_| "Invalid Steam game list.".to_string())?; serde_json::to_string(&steam::companion_reviews(&app, ids)?).map_err(|_| "Could not encode Steam reviews.".into()) }
            (&Method::Post, "/v1/launch") => { let body: serde_json::Value = read_json(&mut request)?; let id = body["appId"].as_u64().filter(|id| *id <= u32::MAX as u64).ok_or("Invalid Steam game.".to_string())? as u32; steam::companion_launch(&app, id)?; Ok("{\"ok\":true}".into()) }
            (&Method::Delete, "/v1/pair") => { let pair_origin = cors.clone().unwrap(); steam::companion_disconnect(&app)?; state.pairs.lock().unwrap().remove(&pair_origin); save_pairs(&state); Ok("{\"ok\":true}".into()) }
            _ => Err("Unknown Steam companion action.".into()),
        }
    })();
    // Approval HTML is wrapped above so all other responses stay JSON.
    if request.method() == &Method::Get && path.starts_with("/approve/") {
        let output = match result { Ok(value) => serde_json::from_str::<serde_json::Value>(&value).ok().and_then(|v| v["html"].as_str().map(str::to_owned)).unwrap_or_else(|| "Pairing request expired.".into()), Err(e) => e };
        let _ = request.respond(Response::from_string(output).with_header(header("Content-Type", "text/html; charset=utf-8")).with_header(header("Cache-Control", "no-store"))); return;
    }
    let (status, body) = match result { Ok(body) => (200, body), Err(message) => (400, error(message)) };
    let _ = request.respond(response(status, body, cors.as_deref()));
}

pub fn start(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<CompanionState>();
    let data = app.path().app_data_dir().map_err(|_| "Cannot locate companion data directory.")?;
    fs::create_dir_all(&data).map_err(|_| "Cannot create companion data directory.")?;
    let store = data.join("steam-companion-pairs.json");
    if let Ok(bytes) = fs::read(&store) { if let Ok(pairs) = serde_json::from_slice(&bytes) { *state.pairs.lock().unwrap() = pairs; } }
    *state.store.lock().unwrap() = Some(store);
    let server = Server::http(ADDRESS).map_err(|_| "Another Steam companion is already running.".to_string())?;
    let app_handle = app.clone();
    thread::spawn(move || for request in server.incoming_requests() { let app = app_handle.clone(); thread::spawn(move || handle(request, app)); });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn pairing_accepts_only_exact_web_origins() {
        for origin in ["http://localhost:1420/", "https://halcyon.example/"] { assert!(valid_origin(origin)); }
        for origin in ["file:///tmp/x", "javascript:alert(1)", "https://user@halcyon.example/", "https://halcyon.example/path"] { assert!(!valid_origin(origin)); }
    }
}
