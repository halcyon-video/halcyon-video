//! Steam's own login runs in a separate, unprivileged webview. Cookies and
//! access tokens never cross IPC into the store or appear in diagnostics.
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, sync::{atomic::{AtomicBool, Ordering}, Mutex}, time::{Duration, Instant}};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use reqwest::blocking::Client;

const AUTH_WINDOW: &str = "steam-sign-in";
const STORE: &str = "https://store.steampowered.com";
#[derive(Default)]
pub struct SteamState {
    owned: Mutex<HashSet<u32>>,
    generation: Mutex<u64>,
    launching: AtomicBool,
    reviews: Mutex<HashMap<u32, (Instant, Review)>>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Review { score: u8, total: u64, positive: u64 }
#[derive(Serialize, Deserialize)]
pub struct Game {
    appid: u32,
    name: String,
    #[serde(default)] playtime_forever: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library { steam_id: String, games: Vec<Game> }

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("Steam commands are only available in Halcyon.".into()); }
    Ok(())
}
fn steam_navigation(url: &url::Url) -> bool {
    url.scheme() == "https" && matches!(url.host_str(), Some("store.steampowered.com" | "login.steampowered.com" | "help.steampowered.com" | "steamcommunity.com"))
}
fn auth_window(app: &AppHandle, visible: bool) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(AUTH_WINDOW) {
        if visible { let _ = window.show(); let _ = window.set_focus(); }
        return Ok(window);
    }
    let directory = app.path().app_data_dir().map_err(|_| "Cannot open Steam sign-in storage.")?.join("steam-browser");
    WebviewWindowBuilder::new(app, AUTH_WINDOW, WebviewUrl::External(format!("{STORE}/login/?redir=explore%2F").parse().unwrap()))
        .title("Sign in to Steam — then return to Halcyon and Refresh library")
        .inner_size(650., 780.).visible(visible).data_directory(directory)
        .on_navigation(steam_navigation)
        .build().map_err(|_| "Cannot open the Steam sign-in window.".into())
}
#[tauri::command]
pub async fn steam_connect(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    main_only(&window)?;
    companion_connect(&app)
}
pub(crate) fn companion_connect(app: &AppHandle) -> Result<(), String> { auth_window(app, true).map(|_| ()) }
#[tauri::command]
pub async fn steam_disconnect(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    main_only(&window)?;
    crate::steam_companion::revoke_all(&app)?;
    companion_disconnect(&app)
}
pub(crate) fn companion_disconnect(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<SteamState>();
    *state.generation.lock().unwrap() += 1;
    state.owned.lock().unwrap().clear();
    if let Some(auth) = app.get_webview_window(AUTH_WINDOW) {
        auth.clear_all_browsing_data().map_err(|_| "Could not clear Steam sign-in. Please try again.")?;
        auth.close().map_err(|_| "Could not close Steam sign-in.")?;
    } else {
        // Open the dedicated profile to clear a session retained across restarts.
        let auth = auth_window(&app, false)?;
        auth.clear_all_browsing_data().map_err(|_| "Could not clear Steam sign-in. Please try again.")?;
        let _ = auth.close();
    }
    Ok(())
}
fn client() -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("HalcyonVideo/SteamLibrary")
        .build().map_err(|_| "Cannot start Steam connection.".into())
}
fn response_text(response: Result<reqwest::blocking::Response, reqwest::Error>) -> Result<String, String> {
    let response = response.map_err(|_| "Steam could not be reached. Please try Refresh library again.")?;
    if !response.status().is_success() {
        return Err(format!("Steam returned HTTP {}. Sign in again or retry later.", response.status().as_u16()));
    }
    // Do not include reqwest errors: they may contain the token-bearing URL.
    response.text().map_err(|_| "Could not read Steam's response.".into())
}
fn attribute_json(html: &str, name: &str) -> Result<serde_json::Value, String> {
    let tail = html.split_once(&format!("{name}=")).ok_or("Steam sign-in expired or its page changed. Sign in again.")?.1;
    let quote = tail.chars().next().ok_or("Steam returned an incomplete page.")?;
    if quote != '\'' && quote != '"' { return Err("Steam returned an unfamiliar sign-in page.".into()); }
    let encoded = tail[1..].split(quote).next().unwrap_or("");
    let decoded = encoded.replace("&quot;", "\"").replace("&#34;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    serde_json::from_str(&decoded).map_err(|_| "Steam returned an unfamiliar sign-in response.".into())
}
fn read_library(cookie: String) -> Result<Library, String> {
    let client = client()?;
    let html = response_text(client.get(format!("{STORE}/explore/")).header(reqwest::header::COOKIE, cookie).send())?;
    let user = attribute_json(&html, "data-userinfo")?;
    let config = attribute_json(&html, "data-store_user_config")?;
    if user["logged_in"].as_bool() != Some(true) { return Err("Sign in to Steam, then choose Refresh library.".into()); }
    let steam_id = user["steamid"].as_str().filter(|s| s.len() == 17 && s.bytes().all(|c| c.is_ascii_digit())).ok_or("Steam did not confirm the signed-in account.")?.to_owned();
    let token = config["webapi_token"].as_str().filter(|s| !s.is_empty()).ok_or("Steam sign-in expired. Sign in again.")?;
    let body = response_text(client.get("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/")
        .query(&[("access_token", token), ("steamid", &steam_id), ("include_appinfo", "true"), ("include_played_free_games", "true"), ("include_free_sub", "true"), ("language", "english")]).send())?;
    let response: serde_json::Value = serde_json::from_str(&body).map_err(|_| "Steam returned an invalid library.")?;
    let root = response.get("response").ok_or("Steam did not return a library. Sign in again.")?;
    let count = root["game_count"].as_u64().ok_or("Steam could not read this library. Check your sign-in and retry.")?;
    let games: Vec<Game> = match root.get("games") {
        Some(games) => serde_json::from_value(games.clone()).map_err(|_| "Steam returned invalid game details.")?,
        None if count == 0 => vec![],
        _ => return Err("Steam returned an incomplete library. Please retry.".into()),
    };
    if games.len() as u64 != count { return Err("Steam returned an incomplete library. Please retry.".into()); }
    Ok(Library { steam_id, games })
}
#[tauri::command]
pub async fn steam_library(app: AppHandle, window: WebviewWindow) -> Result<Library, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || companion_library(&app)).await.map_err(|_| "Steam library request stopped.".to_string())?
}
pub(crate) fn companion_library(app: &AppHandle) -> Result<Library, String> {
    let auth = auth_window(&app, false)?;
    let generation = *app.state::<SteamState>().generation.lock().unwrap();
    let cookies = auth.cookies_for_url(STORE.parse().unwrap()).map_err(|_| "Cannot read Steam sign-in. Please sign in again.")?;
    if !cookies.iter().any(|c| c.name() == "steamLoginSecure") { return Err("Sign in to Steam, then choose Refresh library.".into()); }
    let cookie = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");
    let library = read_library(cookie)?;
    let state = app.state::<SteamState>();
    let current = state.generation.lock().unwrap();
    if generation != *current { return Err("Steam account changed. Refresh the library again.".into()); }
    *state.owned.lock().unwrap() = library.games.iter().map(|g| g.appid).collect();
    let _ = auth.hide();
    Ok(library)
}
fn read_review(client: &Client, app_id: u32) -> Result<Review, String> {
    let text = response_text(client.get(format!("{STORE}/appreviews/{app_id}"))
        .query(&[("json", "1"), ("language", "all"), ("purchase_type", "all"), ("num_per_page", "0"), ("filter", "all")]).send())?;
    let body: serde_json::Value = serde_json::from_str(&text).map_err(|_| "Steam returned invalid review data.")?;
    if body["success"].as_u64() != Some(1) { return Err("Steam review data is temporarily unavailable.".into()); }
    let summary = &body["query_summary"];
    let score = summary["review_score"].as_u64().filter(|s| *s <= 9).ok_or("Steam returned an unknown review rating.")? as u8;
    Ok(Review { score, total: summary["total_reviews"].as_u64().unwrap_or(0), positive: summary["total_positive"].as_u64().unwrap_or(0) })
}
#[tauri::command]
pub async fn steam_reviews(app: AppHandle, window: WebviewWindow, app_ids: Vec<u32>) -> Result<HashMap<u32, Review>, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || companion_reviews(&app, app_ids)).await.map_err(|_| "Steam review request stopped.".to_string())?
}
pub(crate) fn companion_reviews(app: &AppHandle, app_ids: Vec<u32>) -> Result<HashMap<u32, Review>, String> {
    if app_ids.len() > 100 || app_ids.iter().any(|id| *id == 0) { return Err("Request up to 100 valid Steam games at a time.".into()); }
    let client = client()?;
    let state = app.state::<SteamState>();
    let mut result = HashMap::new();
    for id in app_ids {
        if state.launching.load(Ordering::SeqCst) { return Err("Review refresh paused while a Steam game runs.".into()); }
        let cached = state.reviews.lock().unwrap().get(&id).filter(|(at, _)| at.elapsed() < Duration::from_secs(86400)).map(|(_, r)| r.clone());
        let review = if let Some(review) = cached { review } else {
            let review = read_review(&client, id)?;
            state.reviews.lock().unwrap().insert(id, (Instant::now(), review.clone()));
            std::thread::sleep(Duration::from_millis(150));
            review
        };
        result.insert(id, review);
    }
    Ok(result)
}

// Steam's launcher process exits as soon as it hands off to the client. Track
// the game's own process environment instead, including Proton descendants.
#[cfg(target_os = "linux")]
fn game_running(app_id: u32) -> bool {
    let Ok(entries) = std::fs::read_dir("/proc") else { return false; };
    entries.filter_map(Result::ok).any(|entry| {
        if !entry.file_name().to_string_lossy().bytes().all(|c| c.is_ascii_digit()) { return false; }
        let Ok(environment) = std::fs::read(entry.path().join("environ")) else { return false; };
        environment_matches(&environment, app_id)
    })
}
fn environment_matches(environment: &[u8], app_id: u32) -> bool {
    let id = app_id.to_string();
    environment.split(|c| *c == 0).any(|value| {
        value == format!("SteamAppId={id}").as_bytes() || value == format!("SteamGameId={id}").as_bytes()
    })
}
#[tauri::command]
pub async fn steam_launch(app: AppHandle, window: WebviewWindow, app_id: u32) -> Result<(), String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || companion_launch(&app, app_id)).await.map_err(|_| "Steam monitoring stopped; return to Halcyon to retry.".to_string())?
}
pub(crate) fn companion_launch(app: &AppHandle, app_id: u32) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    { let _ = (app, app_id); return Err("Steam game monitoring currently requires Linux.".into()); }
    #[cfg(target_os = "linux")]
    {
        let state = app.state::<SteamState>();
        if !state.owned.lock().unwrap().contains(&app_id) { return Err("Refresh your Steam library before launching this game.".into()); }
        if state.launching.swap(true, Ordering::SeqCst) { return Err("A Steam game is already starting or running.".into()); }
        let result = (|| {
            let mut launcher = std::process::Command::new("steam")
                .arg(format!("steam://rungameid/{app_id}"))
                .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
                .spawn().map_err(|_| "Steam could not start. Install Steam and sign in to its client first.".to_string())?;
            let start = Instant::now();
            let mut seen = false;
            let mut missing = 0;
            loop {
                let running = game_running(app_id);
                if running { seen = true; missing = 0; }
                else if seen { missing += 1; if missing >= 3 { break; } }
                else if start.elapsed() >= Duration::from_secs(120) {
                    // Do not kill Steam or the game: installation/first-run prompts
                    // may still be open. The owner can retry after completing them.
                    let _ = launcher.try_wait();
                    return Err("Steam has not started the game yet. Finish any installation or prompts in Steam, then try again.".into());
                }
                let _ = launcher.try_wait(); // reap the handoff child without treating it as the game
                std::thread::sleep(Duration::from_secs(3));
            }
            Ok(())
        })();
        app.state::<SteamState>().launching.store(false, Ordering::SeqCst);
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn auth_origin_is_exact() {
        for url in ["https://store.steampowered.com/login", "https://login.steampowered.com/jwt/finalizelogin"] { assert!(steam_navigation(&url.parse().unwrap())); }
        for url in ["http://store.steampowered.com", "https://store.steampowered.com.attacker.invalid", "file:///tmp/login", "steam://run/1"] { assert!(!steam_navigation(&url.parse().unwrap())); }
    }
    #[test] fn parse_steam_attributes_without_executing_scripts() {
        let html = r#"<div data-userinfo="{&quot;logged_in&quot;:true,&quot;steamid&quot;:&quot;123&quot;}"></div>"#;
        assert_eq!(attribute_json(html, "data-userinfo").unwrap()["steamid"], "123");
        assert!(attribute_json("login page", "data-userinfo").is_err());
    }
    #[test] fn track_exact_game_environment_not_client_or_prefix() {
        assert!(environment_matches(b"PATH=/bin\0SteamAppId=42\0", 42));
        assert!(environment_matches(b"SteamGameId=42\0", 42));
        assert!(!environment_matches(b"SteamAppId=420\0", 42));
        assert!(!environment_matches(b"SteamAppId=0\0", 42));
        assert!(!environment_matches(b"ARGS=SteamAppId=42\0", 42));
    }
}
