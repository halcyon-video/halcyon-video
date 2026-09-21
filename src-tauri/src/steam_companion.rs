//! Opt-in, bounded loopback bridge. Pairing can be approved only by the
//! dedicated Tauri window through IPC; HTTP clients can never grant access.
use crate::steam;
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::{body::Incoming, header, server::conn::http1, service::service_fn, Method, Request, Response, StatusCode};
use hyper_util::rt::{TokioIo, TokioTimer};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, convert::Infallible, fs, io::{Read, Write}, path::PathBuf, sync::{Arc, Mutex}, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
#[cfg(unix)] use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::{net::TcpListener, sync::Semaphore, time::timeout};
use url::Url;

const ADDRESS: &str = "127.0.0.1:1421";
const APPROVAL_WINDOW: &str = "steam-companion-approval";
const PAIR_TTL_SECS: u64 = 120;
const GRANT_TTL_SECS: u64 = 30 * 24 * 60 * 60;
const MAX_PENDING: usize = 1;
const MAX_CONNECTIONS: usize = 32;
const MAX_OPERATIONS: usize = 4;
const MAX_BODY: usize = 64 * 1024;
const CHALLENGE_TTL_SECS: u64 = 30;
const MAX_CHALLENGES: usize = 64;

#[derive(Clone, Serialize, Deserialize)] struct Grant { token: String, expires: u64 }
#[derive(Clone)] struct Pending { origin: String, created: u64 }
#[derive(Clone)] struct Completed { origin: String, token: String, expires: u64 }
#[derive(Clone)] struct Challenge { origin: String, expires: u64 }
#[derive(Default)] struct CompanionInner {
    pairs: HashMap<String, Grant>, pending: HashMap<String, Pending>, completed: HashMap<String, Completed>, challenges: HashMap<String, Challenge>, store: Option<PathBuf>,
}
#[derive(Default)] pub struct CompanionState { inner: Mutex<CompanionInner> }
#[derive(Deserialize)] struct PairRequest { origin: String }
type HttpResponse = Response<Full<Bytes>>;

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn secret() -> Result<String, String> {
    let mut bytes = [0u8; 32]; fs::File::open("/dev/urandom").and_then(|mut file| file.read_exact(&mut bytes)).map_err(|_| "Secure random source is unavailable.".to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn valid_origin(value: &str) -> bool {
    Url::parse(value).ok().is_some_and(|url| {
        let secure = url.scheme() == "https" || (url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1")));
        secure && url.username().is_empty() && url.password().is_none() && url.host_str().is_some()
            && url.path() == "/" && url.query().is_none() && url.fragment().is_none()
    })
}
fn prune(inner: &mut CompanionInner) {
    let at = now(); inner.pending.retain(|_, item| at.saturating_sub(item.created) <= PAIR_TTL_SECS);
    inner.completed.retain(|_, item| item.expires >= at); inner.challenges.retain(|_, item| item.expires >= at); inner.pairs.retain(|_, item| item.expires >= at);
}
fn hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }
fn body_hash(body: &[u8]) -> String { hex(&Sha256::digest(body)) }
fn request_message(method: &Method, path: &str, nonce: &str, body: &[u8]) -> String { format!("{}\n{path}\n{nonce}\n{}", method.as_str(), body_hash(body)) }
fn response_message(nonce: &str, status: StatusCode, body: &str) -> String { format!("response\n{nonce}\n{}\n{}", status.as_u16(), body_hash(body.as_bytes())) }
fn sign(key: &str, message: &str) -> String { let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("HMAC key"); mac.update(message.as_bytes()); hex(&mac.finalize().into_bytes()) }
fn verify(key: &str, message: &str, proof: &str) -> bool {
    let Ok(bytes) = (0..proof.len()).step_by(2).map(|index| u8::from_str_radix(proof.get(index..index + 2).unwrap_or(""), 16)).collect::<Result<Vec<_>, _>>() else { return false; };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(key.as_bytes()) else { return false; }; mac.update(message.as_bytes()); mac.verify_slice(&bytes).is_ok()
}
fn save_locked(inner: &CompanionInner) -> Result<(), String> {
    let Some(path) = inner.store.as_ref() else { return Ok(()); }; let temporary = path.with_extension("json.tmp");
    let data = serde_json::to_vec(&inner.pairs).map_err(|_| "Could not encode companion pairings.".to_string())?;
    #[cfg(unix)] let mut file = fs::OpenOptions::new().create(true).write(true).truncate(true).mode(0o600).open(&temporary).map_err(|_| "Could not save companion pairings.".to_string())?;
    #[cfg(not(unix))] let mut file = fs::OpenOptions::new().create(true).write(true).truncate(true).open(&temporary).map_err(|_| "Could not save companion pairings.".to_string())?;
    file.write_all(&data).and_then(|_| file.sync_all()).map_err(|_| "Could not save companion pairings.".to_string())?;
    #[cfg(unix)] file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|_| "Could not secure companion pairings.".to_string())?;
    fs::rename(&temporary, path).map_err(|_| "Could not replace companion pairings.".to_string())?; Ok(())
}
fn approval_path(id: &str) -> String { format!("companion-approve.html?request={id}") }
fn open_approval(app: &AppHandle, id: &str) -> Result<(), String> {
    if let Some(old) = app.get_webview_window(APPROVAL_WINDOW) { let _ = old.show(); let _ = old.set_focus(); return Err("Close the existing approval window before starting another pairing.".into()); }
    WebviewWindowBuilder::new(app, APPROVAL_WINDOW, WebviewUrl::App(approval_path(id).into()))
        .title("Pair Halcyon Steam Companion").inner_size(560., 380.).resizable(false)
        .on_navigation(|url| url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.path() == "/companion-approve.html")
        .build().map(|_| ()).map_err(|_| "Could not open the companion approval window.".into())
}
fn is_approval_window(label: &str) -> bool { label == APPROVAL_WINDOW }
fn reserve_pair(state: &CompanionState, pair_origin: String) -> Result<String, String> {
    let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    if inner.pending.values().any(|item| item.origin == pair_origin) { return Err("This origin already has a pending approval.".into()); }
    if inner.pending.len() >= MAX_PENDING { return Err("Another pairing approval is already open. Finish or deny it first.".into()); }
    let id = secret()?; inner.pending.insert(id.clone(), Pending { origin: pair_origin, created: now() }); Ok(id)
}
fn cancel_pair(state: &CompanionState, id: &str) { state.inner.lock().unwrap().pending.remove(id); }
fn poll_pair(state: &CompanionState, id: &str, request_origin: &str) -> serde_json::Value {
    let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    if inner.pending.get(id).is_some_and(|item| item.origin == request_origin) { return serde_json::json!({"pending":true}); }
    if inner.completed.get(id).is_some_and(|item| item.origin == request_origin && item.expires >= now()) {
        let item = inner.completed.remove(id).unwrap(); return serde_json::json!({"token":item.token});
    }
    serde_json::json!({"pending":false})
}
fn issue_challenge(state: &CompanionState, request_origin: &str) -> Result<String, String> {
    if !valid_origin(request_origin) { return Err("Invalid browser origin.".into()); }
    let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    if inner.challenges.len() >= MAX_CHALLENGES { if let Some(oldest) = inner.challenges.iter().min_by_key(|(_, item)| item.expires).map(|(nonce, _)| nonce.clone()) { inner.challenges.remove(&oldest); } }
    let nonce = secret()?; inner.challenges.insert(nonce.clone(), Challenge { origin: request_origin.into(), expires: now() + CHALLENGE_TTL_SECS }); Ok(nonce)
}
fn authorize(state: &CompanionState, request_origin: &str, method: &Method, path: &str, body: &[u8], nonce: Option<&str>, proof: Option<&str>) -> Result<(String, String), String> {
    let nonce = nonce.ok_or("Missing companion challenge.")?; let proof = proof.ok_or("Missing companion proof.")?;
    let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    let challenge = inner.challenges.remove(nonce).filter(|item| item.origin == request_origin && item.expires >= now()).ok_or("Companion challenge is invalid or expired.")?;
    let _ = challenge;
    let token = inner.pairs.get(request_origin).filter(|grant| grant.expires >= now()).map(|grant| grant.token.clone()).ok_or("Steam companion pairing is invalid or expired.")?;
    if !verify(&token, &request_message(method, path, nonce, body), proof) { return Err("Companion request proof is invalid.".into()); }
    Ok((token, nonce.into()))
}

#[tauri::command]
pub fn steam_companion_pending(app: AppHandle, window: WebviewWindow, request_id: String) -> Result<String, String> {
    if !is_approval_window(window.label()) { return Err("Pairing approval is available only in the companion window.".into()); }
    let state = app.state::<CompanionState>(); let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    inner.pending.get(&request_id).map(|item| item.origin.clone()).ok_or("Pairing request expired.".into())
}
fn approve_transaction(state: &CompanionState, window_label: &str, request_id: String) -> Result<(), String> {
    if !is_approval_window(window_label) { return Err("Pairing approval is available only in the companion window.".into()); }
    let mut inner = state.inner.lock().unwrap(); prune(&mut inner);
    let pending = inner.pending.remove(&request_id).ok_or("Pairing request expired.")?; let pending_origin = pending.origin.clone(); let token = secret()?; let expires = now() + GRANT_TTL_SECS;
    let previous = inner.pairs.insert(pending_origin.clone(), Grant { token: token.clone(), expires });
    inner.completed.insert(request_id.clone(), Completed { origin: pending_origin.clone(), token, expires: now() + PAIR_TTL_SECS });
    if let Err(message) = save_locked(&inner) { inner.completed.remove(&request_id); inner.pending.insert(request_id, pending); match previous { Some(grant) => { inner.pairs.insert(pending_origin, grant); }, None => { inner.pairs.remove(&pending_origin); } }; return Err(message); }
    Ok(())
}
#[tauri::command]
pub fn steam_companion_approve(app: AppHandle, window: WebviewWindow, request_id: String) -> Result<(), String> { approve_transaction(&app.state::<CompanionState>(), window.label(), request_id)?; let _ = window.close(); Ok(()) }
fn deny_transaction(state: &CompanionState, window_label: &str, request_id: &str) -> Result<(), String> {
    if !is_approval_window(window_label) { return Err("Pairing denial is available only in the companion window.".into()); }
    cancel_pair(state, request_id); Ok(())
}
#[tauri::command]
pub fn steam_companion_deny(app: AppHandle, window: WebviewWindow, request_id: String) -> Result<(), String> { deny_transaction(&app.state::<CompanionState>(), window.label(), &request_id)?; let _ = window.close(); Ok(()) }
pub fn revoke_all(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<CompanionState>(); let mut inner = state.inner.lock().unwrap(); let old_pairs = std::mem::take(&mut inner.pairs); let old_pending = std::mem::take(&mut inner.pending); let old_completed = std::mem::take(&mut inner.completed); let old_challenges = std::mem::take(&mut inner.challenges);
    if let Err(message) = save_locked(&inner) { inner.pairs = old_pairs; inner.pending = old_pending; inner.completed = old_completed; inner.challenges = old_challenges; return Err(message); } Ok(())
}

fn json_response(status: StatusCode, body: impl Into<String>, cors: Option<&str>) -> HttpResponse {
    let mut builder = Response::builder().status(status).header(header::CONTENT_TYPE, "application/json").header(header::CACHE_CONTROL, "no-store")
        .header("X-Frame-Options", "DENY").header("Content-Security-Policy", "frame-ancestors 'none'");
    if let Some(value) = cors { builder = builder.header(header::ACCESS_CONTROL_ALLOW_ORIGIN, value).header(header::VARY, "Origin").header("Access-Control-Expose-Headers", "X-Halcyon-Response-Proof").header("Access-Control-Allow-Private-Network", "true"); }
    builder.body(Full::new(Bytes::from(body.into()))).unwrap()
}
fn error(message: impl AsRef<str>) -> String { serde_json::json!({"error":message.as_ref()}).to_string() }
struct RouteOutput { result: Result<String, String>, authentication: Option<(String, String)> }
fn route(method: Method, path: String, request_origin: Option<String>, nonce: Option<String>, proof: Option<String>, body: Vec<u8>, app: AppHandle) -> RouteOutput {
    let state = app.state::<CompanionState>();
    if method == Method::GET && path == "/v1/status" { return RouteOutput { result: Ok(serde_json::json!({"ok":true,"version":3}).to_string()), authentication: None }; }
    if method == Method::GET && path == "/v1/challenge" {
        let result = request_origin.as_deref().ok_or("Missing browser origin.".to_string()).and_then(|origin| issue_challenge(&state, origin)).map(|nonce| serde_json::json!({"nonce":nonce}).to_string());
        return RouteOutput { result, authentication: None };
    }
    if method == Method::POST && path == "/v1/pair" {
        let result = (|| { let data: PairRequest = serde_json::from_slice(&body).map_err(|_| "Invalid request.".to_string())?; let supplied = request_origin.ok_or("Missing browser origin.")?;
            if data.origin != supplied || !valid_origin(&data.origin) { return Err("Invalid browser origin.".into()); }
            let id = reserve_pair(&state, data.origin)?; if let Err(message) = open_approval(&app, &id) { cancel_pair(&state, &id); return Err(message); } Ok(serde_json::json!({"requestId":id}).to_string()) })();
        return RouteOutput { result, authentication: None };
    }
    if method == Method::GET && path.starts_with("/v1/pair/") { let result = request_origin.ok_or("Missing browser origin.".to_string()).map(|supplied| poll_pair(&state, path.trim_start_matches("/v1/pair/"), &supplied).to_string()); return RouteOutput { result, authentication: None }; }
    let supplied = match request_origin { Some(value) => value, None => return RouteOutput { result: Err("Missing browser origin.".into()), authentication: None } };
    let authentication = match authorize(&state, &supplied, &method, &path, &body, nonce.as_deref(), proof.as_deref()) { Ok(value) => value, Err(message) => return RouteOutput { result: Err(message), authentication: None } };
    let result = (|| { match (method, path.as_str()) {
        (Method::POST, "/v1/connect") => { steam::companion_connect(&app)?; Ok("{\"ok\":true}".into()) }
        (Method::POST, "/v1/library") => serde_json::to_string(&steam::companion_library(&app)?).map_err(|_| "Could not encode Steam library.".into()),
        (Method::POST, "/v1/reviews") => { let value: serde_json::Value = serde_json::from_slice(&body).map_err(|_| "Invalid request.".to_string())?; let ids = serde_json::from_value(value["appIds"].clone()).map_err(|_| "Invalid Steam game list.".to_string())?; serde_json::to_string(&steam::companion_reviews(&app, ids)?).map_err(|_| "Could not encode Steam reviews.".into()) }
        (Method::POST, "/v1/launch") => { let value: serde_json::Value = serde_json::from_slice(&body).map_err(|_| "Invalid request.".to_string())?; let id = value["appId"].as_u64().filter(|id| *id <= u32::MAX as u64).ok_or("Invalid Steam game.".to_string())? as u32; steam::companion_launch(&app, id)?; Ok("{\"ok\":true}".into()) }
        (Method::DELETE, "/v1/pair") => {
            let mut inner = state.inner.lock().unwrap(); let old = inner.pairs.remove(&supplied); inner.pending.retain(|_, item| item.origin != supplied); inner.completed.retain(|_, item| item.origin != supplied);
            if let Err(message) = save_locked(&inner) { if let Some(grant) = old { inner.pairs.insert(supplied, grant); } return Err(message); } drop(inner);
            steam::companion_disconnect(&app)?; Ok("{\"ok\":true}".into())
        }
        _ => Err("Unknown Steam companion action.".into()),
    } })();
    RouteOutput { result, authentication: Some(authentication) }
}
async fn handle_http(request: Request<Incoming>, app: AppHandle, operations: Arc<Semaphore>) -> Result<HttpResponse, Infallible> {
    let host_ok = request.headers().get(header::HOST).and_then(|value| value.to_str().ok()).is_some_and(|value| matches!(value, "127.0.0.1:1421" | "localhost:1421"));
    if !host_ok { return Ok(json_response(StatusCode::FORBIDDEN, error("Invalid companion host."), None)); }
    let request_origin = request.headers().get(header::ORIGIN).and_then(|value| value.to_str().ok()).map(str::to_owned);
    if request.method() == Method::OPTIONS {
        let mut out = json_response(StatusCode::NO_CONTENT, "", request_origin.as_deref()); let headers = out.headers_mut();
        headers.insert(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, DELETE, OPTIONS".parse().unwrap()); headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, X-Halcyon-Nonce, X-Halcyon-Proof".parse().unwrap()); return Ok(out);
    }
    let length = request.headers().get(header::CONTENT_LENGTH).and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<usize>().ok());
    if matches!(request.method(), &Method::POST) && !matches!(length, Some(1..=MAX_BODY)) { return Ok(json_response(StatusCode::BAD_REQUEST, error("A bounded Content-Length is required."), request_origin.as_deref())); }
    let nonce = request.headers().get("X-Halcyon-Nonce").and_then(|value| value.to_str().ok()).map(str::to_owned);
    let proof = request.headers().get("X-Halcyon-Proof").and_then(|value| value.to_str().ok()).map(str::to_owned);
    let method = request.method().clone(); let path = request.uri().path().to_owned(); let body = if method == Method::POST {
        match timeout(Duration::from_secs(5), Limited::new(request.into_body(), MAX_BODY).collect()).await { Ok(Ok(value)) => value.to_bytes().to_vec(), _ => return Ok(json_response(StatusCode::REQUEST_TIMEOUT, error("Request body timed out or exceeded the limit."), request_origin.as_deref())) }
    } else { Vec::new() };
    let Ok(operation) = operations.try_acquire_owned() else { return Ok(json_response(StatusCode::SERVICE_UNAVAILABLE, error("Steam companion is busy."), request_origin.as_deref())); };
    let cors = request_origin.clone(); let work = tokio::task::spawn_blocking(move || { let output = route(method, path, request_origin, nonce, proof, body, app); drop(operation); output }).await;
    let output = match work { Ok(output) => output, Err(_) => RouteOutput { result: Err("Companion request stopped.".into()), authentication: None } };
    let (status, body) = match output.result { Ok(body) => (StatusCode::OK, body), Err(message) => (StatusCode::BAD_REQUEST, error(message)) };
    let mut response = json_response(status, body.clone(), cors.as_deref());
    if let Some((token, nonce)) = output.authentication { response.headers_mut().insert("X-Halcyon-Response-Proof", sign(&token, &response_message(&nonce, status, &body)).parse().unwrap()); }
    Ok(response)
}
pub fn start(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<CompanionState>(); let data = app.path().app_data_dir().map_err(|_| "Cannot locate companion data directory.")?;
    fs::create_dir_all(&data).map_err(|_| "Cannot create companion data directory.")?; let store = data.join("steam-companion-pairs.json");
    { let mut inner = state.inner.lock().unwrap(); inner.store = Some(store.clone()); if let Ok(bytes) = fs::read(&store) { if let Ok(pairs) = serde_json::from_slice(&bytes) { inner.pairs = pairs; } } prune(&mut inner); save_locked(&inner)?; }
    let listener = std::net::TcpListener::bind(ADDRESS).map_err(|_| "Another Steam companion is already running.".to_string())?;
    listener.set_nonblocking(true).map_err(|_| "Could not configure the companion listener.".to_string())?;
    let handle = app.clone(); thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().expect("companion runtime");
        runtime.block_on(async move {
            let listener = TcpListener::from_std(listener).expect("validated companion listener"); let permits = Arc::new(Semaphore::new(MAX_CONNECTIONS)); let operations = Arc::new(Semaphore::new(MAX_OPERATIONS));
            loop {
                let Ok(Ok((stream, _))) = timeout(Duration::from_secs(1), listener.accept()).await else { continue; };
                let Ok(permit) = permits.clone().try_acquire_owned() else { drop(stream); continue; }; let app = handle.clone(); let operations = operations.clone();
                tokio::spawn(async move {
                    let mut builder = http1::Builder::new(); builder.timer(TokioTimer::new()); builder.header_read_timeout(Duration::from_secs(5)); builder.max_buf_size(MAX_BODY);
                    let _ = builder.serve_connection(TokioIo::new(stream), service_fn(move |request| handle_http(request, app.clone(), operations.clone()))).await; drop(permit);
                });
            }
        });
    }); Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn pairing_accepts_only_secure_exact_web_origins() { for origin in ["http://localhost:1420", "http://127.0.0.1:1420", "https://halcyon.example"] { assert!(valid_origin(origin)); } for origin in ["http://192.168.1.5:1420", "http://halcyon.lan:1420", "file:///tmp/x", "javascript:alert(1)", "https://user@halcyon.example/", "https://halcyon.example/path"] { assert!(!valid_origin(origin)); } }
    #[test] fn approval_is_native_app_path_and_window() { assert_eq!(approval_path("abc"), "companion-approve.html?request=abc"); assert!(is_approval_window("steam-companion-approval")); for label in ["main", "steam-sign-in", ""] { assert!(!is_approval_window(label)); } }
    #[test] fn completed_pair_is_exact_origin_and_single_delivery() {
        let state = CompanionState::default(); state.inner.lock().unwrap().completed.insert("id".into(), Completed { origin: "https://good.example".into(), token: "secret".into(), expires: now() + 30 });
        assert_eq!(poll_pair(&state, "unknown", "https://good.example"), serde_json::json!({"pending":false})); assert_eq!(poll_pair(&state, "id", "https://bad.example"), serde_json::json!({"pending":false}));
        assert_eq!(poll_pair(&state, "id", "https://good.example"), serde_json::json!({"token":"secret"})); assert_eq!(poll_pair(&state, "id", "https://good.example"), serde_json::json!({"pending":false}));
    }
    #[test] fn pending_id_is_never_redisclosed_or_swapped() { let state = CompanionState::default(); assert_eq!(reserve_pair(&state, "https://first.example".into()).unwrap().len(), 64); assert!(reserve_pair(&state, "https://first.example".into()).is_err()); assert!(reserve_pair(&state, "https://second.example".into()).is_err()); }
    #[test] fn prune_removes_expired_authority() { let state = CompanionState::default(); let mut inner = state.inner.lock().unwrap(); inner.pending.insert("p".into(), Pending { origin:"https://x.example".into(),created:0 }); inner.completed.insert("c".into(), Completed { origin:"https://x.example".into(),token:"t".into(),expires:0 }); inner.pairs.insert("https://x.example".into(), Grant {token:"t".into(),expires:0}); prune(&mut inner); assert!(inner.pending.is_empty() && inner.completed.is_empty() && inner.pairs.is_empty()); }
    #[test] fn request_proof_is_origin_body_and_nonce_bound_and_single_use() {
        let state = CompanionState::default(); let origin = "https://good.example"; let token = "pair-secret"; let nonce = "nonce"; let method = Method::POST; let path = "/v1/library"; let body = b"{}";
        { let mut inner = state.inner.lock().unwrap(); inner.pairs.insert(origin.into(), Grant { token: token.into(), expires: now() + 30 }); inner.challenges.insert(nonce.into(), Challenge { origin: origin.into(), expires: now() + 30 }); }
        let proof = sign(token, &request_message(&method, path, nonce, body));
        assert!(authorize(&state, origin, &method, path, body, Some(nonce), Some(&proof)).is_ok());
        assert!(authorize(&state, origin, &method, path, body, Some(nonce), Some(&proof)).is_err());
        { state.inner.lock().unwrap().challenges.insert("other".into(), Challenge { origin: origin.into(), expires: now() + 30 }); }
        assert!(authorize(&state, origin, &method, path, b"changed", Some("other"), Some(&proof)).is_err());
    }
    #[test] fn response_proof_cannot_be_forged_without_pair_secret() { let message = response_message("n", StatusCode::OK, "{}"); assert!(verify("secret", &message, &sign("secret", &message))); assert!(!verify("wrong", &message, &sign("secret", &message))); }
    #[test] fn native_decision_requires_window_and_allow_deny_are_terminal() {
        let state = CompanionState::default(); let id = reserve_pair(&state, "https://allow.example".into()).unwrap();
        assert!(approve_transaction(&state, "main", id.clone()).is_err()); assert_eq!(poll_pair(&state, &id, "https://allow.example"), serde_json::json!({"pending":true}));
        approve_transaction(&state, APPROVAL_WINDOW, id.clone()).unwrap(); assert!(poll_pair(&state, &id, "https://allow.example").get("token").is_some());
        let denied = reserve_pair(&state, "https://deny.example".into()).unwrap(); assert!(deny_transaction(&state, "main", &denied).is_err()); deny_transaction(&state, APPROVAL_WINDOW, &denied).unwrap();
        assert_eq!(poll_pair(&state, &denied, "https://deny.example"), serde_json::json!({"pending":false}));
    }
}
