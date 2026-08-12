// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

fn redact_url(url_str: &str) -> String {
    if let Ok(mut parsed_url) = url::Url::parse(url_str) {
        if !parsed_url.username().is_empty() {
            let _ = parsed_url.set_username("[REDACTED]");
        }
        if parsed_url.password().is_some() {
            let _ = parsed_url.set_password(Some("[REDACTED]"));
        }
        let query_pairs: Vec<(String, String)> = parsed_url.query_pairs().map(|(k, v)| {
            let key = k.to_string();
            let lower_key = key.to_lowercase();
            if lower_key.contains("key") || lower_key.contains("token") || lower_key.contains("auth") || lower_key.contains("pass") || lower_key.contains("secret") || lower_key.contains("credential") {
                (key, "[REDACTED]".to_string())
            } else {
                (key, v.to_string())
            }
        }).collect();
        parsed_url.query_pairs_mut().clear();
        for (k, v) in query_pairs {
            parsed_url.query_pairs_mut().append_pair(&k, &v);
        }
        parsed_url.to_string()
    } else {
        url_str.to_string()
    }
}

#[tauri::command]
fn play_video(path: String) -> Result<String, String> {
    if cfg!(debug_assertions) {
        println!("[Video] Request to play: {}", redact_url(&path));
    }

    let play_path = if path.starts_with("http://") || path.starts_with("https://") {
        if let Ok(url) = url::Url::parse(&path) {
            let has_credentials = url.query_pairs().any(|(k, _)| {
                let lower_k = k.to_lowercase();
                lower_k.contains("key") || lower_k.contains("token") || lower_k.contains("auth")
            });
            if has_credentials {
                return Err("Security error: Cannot play remote URL containing credentials externally since no local path exists.".to_string());
            }
        }
        path
    } else {
        path
    };

    // Remote-friendly bindings, merged with mpv's builtin ones (same set as
    // the dev-server mpv endpoint in vite.config.ts): Up cycles subtitle
    // tracks (ending on "off"), Down cycles audio languages, OK pauses
    // (mpv's default Enter is "next playlist entry" — on a single film that
    // just quits), Back/Escape returns to the store. Left/Right still scrub.
    let input_conf = std::env::temp_dir().join("halcyon-mpv-input.conf");
    let _ = std::fs::write(
        &input_conf,
        "ESC quit\nBS quit\nENTER cycle pause\nKP_ENTER cycle pause\nUP cycle sub\nDOWN cycle audio\n",
    );

    // First, try running system mpv
    let mut command = std::process::Command::new("mpv");
    command
        .arg("--fs")
        .arg(format!("--input-conf={}", input_conf.display()))
        .arg("--osd-on-seek=msg-bar")
        .arg(&play_path);
    
    let spawn_result = command.spawn();
    
    let child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            // Fallback: see if we can run via flatpak or look for VLC
            println!("mpv command failed: {}. Trying VLC as fallback...", e);
            let mut fallback = std::process::Command::new("vlc");
            fallback.arg("--fullscreen").arg(&play_path);
            match fallback.spawn() {
                Ok(c) => c,
                Err(fe) => {
                    return Err(format!(
                        "Could not launch media player. mpv error: {}. vlc error: {}",
                        e, fe
                    ));
                }
            }
        }
    };

    // Wait in a background thread so the Tauri IPC bridge stays responsive
    // for CEC / power commands while the movie is playing.
    std::thread::spawn(move || {
        let mut child = child;
        match child.wait() {
            Ok(status) => println!("[Video] Media player exited: {:?}", status.code()),
            Err(e) => println!("[Video] Failed to wait for media player: {}", e),
        }
    });

    Ok("Playback launched".to_string())
}

#[tauri::command]
fn execute_cec_command(action: String) -> Result<String, String> {
    let cec_cmd = match action.as_str() {
        "wake" => "on 0\nas",
        "sleep" => "standby 0",
        _ => return Err(format!("Unknown CEC action: {}", action)),
    };

    println!("[CEC] Executing action '{}' (CEC commands: {})", action, cec_cmd);

    // Try to run cec-client
    let child = std::process::Command::new("cec-client")
        .args(["-s", "-d", "1"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match child {
        Ok(mut c) => {
            use std::io::Write;
            if let Some(mut stdin) = c.stdin.take() {
                let _ = stdin.write_all(cec_cmd.as_bytes());
            }
            let output = c.wait_with_output().map_err(|e| format!("Failed to wait for cec-client: {}", e))?;
            let stdout_str = String::from_utf8_lossy(&output.stdout).into_owned();
            Ok(format!("CEC output: {}", stdout_str))
        }
        Err(e) => {
            // Log fallback
            let mock_msg = format!(
                "[CEC MOCK] Hardware not found (cec-client missing: {}). Command simulated: '{}'",
                e, cec_cmd
            );
            println!("{}", mock_msg);
            Ok(mock_msg)
        }
    }
}

#[tauri::command]
fn suspend_system() -> Result<String, String> {
    println!("[Power] Initiating system suspend...");
    
    // First, send CEC standby command to turn off TV
    let _ = execute_cec_command("sleep".to_string());
    
    // Now trigger systemctl suspend
    let status = std::process::Command::new("systemctl")
        .arg("suspend")
        .status();

    match status {
        Ok(s) if s.success() => Ok("System suspending...".to_string()),
        Ok(s) => Err(format!("systemctl suspend exited with error: {:?}", s.code())),
        Err(e) => Err(format!("Failed to execute systemctl suspend: {}", e)),
    }
}

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn jellyfin_request(
    method: String,
    url: String,
    auth_header: Option<String>,
    token: Option<String>,
    body: Option<String>
) -> Result<String, String> {
    if cfg!(debug_assertions) {
        println!("[Jellyfin Request] {} {}", method, redact_url(&url));
    }

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let req_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(req_method, &url)
        .header("Content-Type", "application/json");

    if let Some(auth) = auth_header {
        req = req.header("X-Emby-Authorization", auth);
    }

    if let Some(t) = token {
        req = req.header("X-MediaBrowser-Token", t);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().map_err(|e| format!("Request failed: {}", e))?;
    let http_code = response.status().as_u16();
    let body_str = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;

    if http_code >= 400 {
        return Err(format!("HTTP error {}: {}", http_code, body_str));
    }

    if cfg!(debug_assertions) {
        println!("[Jellyfin OK] {} {} -> {} bytes", method, redact_url(&url), body_str.len());
    }
    Ok(body_str)
}

// Diagnostics sink. The webview's console goes to devtools, which a packaged
// build gives no way to open -- so a whole class of "it silently did nothing"
// bugs was undebuggable from inside the app. Mirror the in-app console to a
// file on disk instead, truncated once per boot so it always reads as the
// current session rather than an ever-growing pile.
//
// Lines arrive batched (see debug-log.ts) rather than one IPC hop each; this
// app idles for days and per-line invokes would be a real cost.
#[tauri::command]
fn append_debug_log(app: tauri::AppHandle, lines: Vec<String>, truncate: bool) -> Result<String, String> {
    use std::io::Write;
    let dir = app.path().app_log_dir().map_err(|e| format!("no log dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {}", e))?;
    let path = dir.join("store-session.log");

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(!truncate)
        .truncate(truncate)
        .open(&path)
        .map_err(|e| format!("open failed: {}", e))?;
    for line in &lines {
        writeln!(file, "{}", line).map_err(|e| format!("write failed: {}", e))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn jellyseerr_request(
    method: String,
    url: String,
    api_key: String,
    body: Option<String>
) -> Result<String, String> {
    if cfg!(debug_assertions) {
        println!("[Jellyseerr Request] {} {}", method, redact_url(&url));
    }

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let req_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(req_method, &url)
        .header("Content-Type", "application/json")
        .header("X-Api-Key", api_key);

    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().map_err(|e| format!("Request failed: {}", e))?;
    let http_code = response.status().as_u16();
    let body_str = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;

    if http_code >= 400 {
        return Err(format!("HTTP error {}: {}", http_code, body_str));
    }

    if cfg!(debug_assertions) {
        println!("[Jellyseerr OK] {} {} -> {} bytes", method, redact_url(&url), body_str.len());
    }
    Ok(body_str)
}

// T18: proxy a Romm REST request through the host (same rationale as
// jellyseerr_request: no CORS, and the host can reach a server the sandboxed
// webview can't). `auth_header` is the full Authorization header value the JS
// side computed (HTTP Basic or Bearer).
#[tauri::command]
fn romm_request(
    method: String,
    url: String,
    auth_header: String,
    body: Option<String>,
) -> Result<String, String> {
    if cfg!(debug_assertions) {
        println!("[Romm Request] {} {}", method, redact_url(&url));
    }

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let req_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(req_method, &url)
        .header("Content-Type", "application/json")
        .header("Authorization", auth_header);

    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().map_err(|e| format!("Request failed: {}", e))?;
    let http_code = response.status().as_u16();
    let body_str = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;

    if http_code >= 400 {
        return Err(format!("HTTP error {}: {}", http_code, body_str));
    }

    if cfg!(debug_assertions) {
        println!("[Romm OK] {} {} -> {} bytes", method, redact_url(&url), body_str.len());
    }
    Ok(body_str)
}

// Proxy a Plex request through the host (same rationale as jellyseerr_request:
// no CORS, and the host can reach a server the sandboxed webview can't).
//
// Unlike its siblings this takes an arbitrary header MAP rather than one named
// credential. Plex needs several headers on every call — `Accept:
// application/json` (without it the server answers XML) plus the X-Plex-*
// client identity that its tokens are issued against — and enumerating them as
// parameters here would mean editing Rust every time the JS side adjusts one.
#[tauri::command]
fn plex_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    if cfg!(debug_assertions) {
        println!("[Plex Request] {} {}", method, redact_url(&url));
    }

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let req_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(req_method, &url)
        .header("Content-Type", "application/json");

    for (name, value) in headers {
        req = req.header(name, value);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().map_err(|e| format!("Request failed: {}", e))?;
    let http_code = response.status().as_u16();
    let body_str = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;

    if http_code >= 400 {
        return Err(format!("HTTP error {}: {}", http_code, body_str));
    }

    if cfg!(debug_assertions) {
        println!("[Plex OK] {} {} -> {} bytes", method, redact_url(&url), body_str.len());
    }
    Ok(body_str)
}

// T18: launch an emulator for a rented game. The command `template` is
// tokenized on whitespace into an argv array (program + args); the literal
// token `{path}` is replaced by the rom `path` as a SINGLE argv element, and
// any `{path}` embedded in a larger token has the path substituted in place.
// Because we spawn with an argument array (never a shell string), an untrusted
// rom path can never inject shell syntax. Runs the child detached in a
// background thread so the IPC bridge stays responsive.
fn is_allowed_emulator(program: &str) -> bool {
    let path = std::path::Path::new(program);
    let file_name = match path.file_name().and_then(|f| f.to_str()) {
        Some(name) => name,
        None => return false,
    };
    
    let clean_name = file_name
        .strip_suffix(".exe")
        .unwrap_or(file_name)
        .to_lowercase();

    const ALLOWLIST: &[&str] = &[
        "retroarch",
        "mednafen",
        "mupen64plus",
        "pcsx2",
        "rpcs3",
        "dolphin-emu",
        "dolphin",
        "citra",
        "yuzu",
        "ryujinx",
        "ppsspp",
        "ppsspp-sdl",
        "mgba",
        "mgba-qt",
        "visualboyadvance",
        "vba-m",
        "snes9x",
        "bsnes",
        "fceux",
        "nestopia",
        "duckstation",
        "openemu",
        "es-de",
        "emulationstation",
        "retrodeck",
        "ares",
        "blastem",
        "kega-fusion",
        "fusion",
        "dosbox",
        "dosbox-staging",
        "dosbox-x",
        "scummvm",
        "flycast",
        "redream",
        "melonds",
        "desmume",
        "steam",
        "heroic",
        "lutris",
        "sameboy",
        "gearboy",
        "higan",
        "mesen",
        "simplemess",
        "mame",
        "fsuae",
        "vice",
        "x64",
        "x64sc",
        "x128",
        "xvic",
        "xpet",
        "xplus4",
        "xcbm2",
    ];

    ALLOWLIST.contains(&clean_name.as_str())
}

#[tauri::command]
fn launch_game(template: String, path: String) -> Result<String, String> {
    let tokens: Vec<String> = template.split_whitespace().map(|s| s.to_string()).collect();
    if tokens.is_empty() {
        return Err("Empty launch command template.".to_string());
    }

    let program = tokens[0].replace("{path}", &path);
    
    if !is_allowed_emulator(&program) {
        return Err(format!("Program '{}' is not an allowed emulator.", program));
    }

    let args: Vec<String> = tokens[1..]
        .iter()
        .map(|t| t.replace("{path}", &path))
        .collect();

    println!("[Game Launch] {} {:?}", program, args);

    let mut command = std::process::Command::new(&program);
    command.args(&args);

    match command.spawn() {
        Ok(child) => {
            std::thread::spawn(move || {
                let mut child = child;
                match child.wait() {
                    Ok(status) => println!("[Game Launch] Emulator exited: {:?}", status.code()),
                    Err(e) => println!("[Game Launch] Failed to wait for emulator: {}", e),
                }
            });
            Ok("Game launched".to_string())
        }
        Err(e) => Err(format!("Could not launch emulator '{}': {}", program, e)),
    }
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Some(w) = handle.get_webview_window("main") {
                        w.open_devtools();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            play_video,
            execute_cec_command,
            suspend_system,
            check_file_exists,
            jellyfin_request,
            plex_request,
            jellyseerr_request,
            romm_request,
            launch_game,
            append_debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
