use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

mod api;
mod platform;

/// Flag to distinguish intentional quit from window-close
static SHOULD_QUIT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Ambient snooze: unix timestamp (seconds) until which ambient popups are suppressed
static SNOOZE_UNTIL: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub api_url: String,
    pub api_token: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_url: "https://reattend.com".to_string(),
            api_token: String::new(),
        }
    }
}

/// Save text received from macOS Services menu (called from platform::macos)
pub async fn save_service_text(app_handle: tauri::AppHandle, text: String) {
    let store = match app_handle.store("config.json") {
        Ok(s) => s,
        Err(_) => return,
    };
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());

    if token.is_empty() {
        let _ = app_handle.notification()
            .builder()
            .title("Reattend")
            .body("Not connected. Set your API token in Settings.")
            .show();
        return;
    }

    let meta = serde_json::json!({
        "capture_type": "selection",
        "source": "services_menu",
    });
    let preview = if text.len() > 60 {
        format!("{}...", &text[..57])
    } else {
        text.clone()
    };

    match api::capture(&url, &token, &text, "selection", Some(meta)).await {
        Ok(_) => {
            let _ = app_handle.notification()
                .builder()
                .title("Saved to Reattend")
                .body(&preview)
                .show();
        }
        Err(e) => {
            let _ = app_handle.notification()
                .builder()
                .title("Reattend")
                .body(&format!("Failed to save: {}", e))
                .show();
        }
    }
}

// ── Tauri commands callable from the frontend ───────────────────────────────

#[tauri::command]
async fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    Ok(AppConfig {
        api_url: url,
        api_token: token,
    })
}

#[tauri::command]
async fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    store.set("api_url", serde_json::json!(config.api_url));
    store.set("api_token", serde_json::json!(config.api_token));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn capture_text(app: tauri::AppHandle, text: String, source: String) -> Result<String, String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    api::capture(&url, &token, &text, &source, None).await
}

#[tauri::command]
async fn search_memories(app: tauri::AppHandle, query: String) -> Result<serde_json::Value, String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    api::search(&url, &token, &query).await
}

#[tauri::command]
async fn ask_ai(app: tauri::AppHandle, question: String) -> Result<String, String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    api::ask(&url, &token, &question).await
}

#[tauri::command]
async fn analyze_screen(
    app: tauri::AppHandle,
    screen_text: String,
    app_name: String,
) -> Result<serde_json::Value, String> {
    let store = app
        .store("config.json")
        .map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    api::analyze(&url, &token, &screen_text, &app_name).await
}

/// Snooze ambient popups for N minutes
#[tauri::command]
async fn snooze_ambient(minutes: u64) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    SNOOZE_UNTIL.store(now + (minutes as i64 * 60), std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

/// Run OCR capture using the platform-specific implementation
#[tauri::command]
async fn run_ocr_capture(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    platform::platform_capture_screen_ocr(&app).await
}

// ── Apps that should NEVER trigger screen capture ──────────────────────────
// Sensitive (passwords/keys), system utilities, media players, dev tools (pure code noise)
const SKIP_APPS: &[&str] = &[
    // Dev tools — code syntax is noise for a memory system
    "terminal", "iterm", "warp", "hyper", "alacritty", "kitty",
    "visual studio code", "code", "xcode", "intellij", "android studio",
    "pycharm", "webstorm", "rustrover", "goland", "clion", "datagrip",
    "sublime text", "atom", "neovim", "vim",
    // macOS system utilities
    "finder", "system preferences", "system settings",
    "activity monitor", "console", "disk utility", "font book",
    "migration assistant", "bluetooth", "airdrop",
    // Windows system utilities
    "explorer", "task manager", "control panel", "registry editor",
    "device manager", "event viewer", "windows security",
    // Windows dev tools
    "cmd.exe", "powershell", "windows terminal", "command prompt",
    "devenv", // Visual Studio
    // Sensitive
    "1password", "bitwarden", "lastpass", "dashlane", "keychain access",
    "authy", "google authenticator", "credential manager",
    // Media — no meaningful text
    "spotify", "music", "vlc", "quicktime player", "iina", "podcasts",
    "tv", "infuse", "plex", "groove music", "movies & tv",
    // Package managers, containers
    "docker desktop", "docker", "parallels desktop", "vmware",
    // App stores
    "app store", "software update", "self service", "microsoft store",
    // Reattend itself — avoid recursive capture
    "reattend",
];

/// Check if app should be skipped for screen capture
fn should_skip_app(app_name: &str) -> bool {
    let lower = app_name.to_lowercase();
    SKIP_APPS.iter().any(|skip| lower.contains(skip))
}

/// Clean raw OCR text — strip UI noise, keep substantive content.
fn clean_ocr_text(raw: &str) -> String {
    let mut cleaned_lines: Vec<&str> = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim();

        // Skip empty / tiny lines
        if trimmed.len() < 5 { continue; }

        // Skip URLs
        if trimmed.contains("://") || trimmed.starts_with("www.") { continue; }
        if trimmed.contains(".com/") || trimmed.contains(".io/") || trimmed.contains(".org/") {
            if !trimmed.contains(' ') && trimmed.contains('/') { continue; }
        }

        // Skip browser tab bars: many short segments separated by | or X
        let pipe_count = trimmed.matches('|').count();
        if pipe_count >= 2 && trimmed.len() < 300 {
            let avg_segment = trimmed.len() / (pipe_count + 1);
            if avg_segment < 25 { continue; }
        }

        // Skip lines that are mostly symbols/non-alpha (UI chrome, icons, separators)
        let alpha_count = trimmed.chars().filter(|c| c.is_alphabetic()).count();
        let total_count = trimmed.chars().count();
        if total_count > 0 && (alpha_count as f64 / total_count as f64) < 0.35 { continue; }

        // Skip known menu bar patterns
        let lower = trimmed.to_lowercase();
        if lower.starts_with("file ") && lower.contains("edit ") && lower.contains("view ") { continue; }
        if lower == "file" || lower == "edit" || lower == "view" || lower == "window"
            || lower == "help" || lower == "format" || lower == "insert" || lower == "tools" { continue; }

        // Skip single-word UI elements (buttons, labels)
        if !trimmed.contains(' ') && trimmed.len() < 20 { continue; }

        // Skip navigation breadcrumbs and sidebars (bullet-heavy lines)
        let bullet_count = trimmed.matches('•').count() + trimmed.matches('·').count()
            + trimmed.matches('›').count() + trimmed.matches('→').count();
        if bullet_count >= 3 { continue; }

        // Skip file paths
        if trimmed.starts_with('/') && trimmed.contains('/') && !trimmed.contains(' ') { continue; }
        if trimmed.starts_with("C:\\") || trimmed.starts_with("D:\\") { continue; }
        if trimmed.contains("Users/") || trimmed.contains("Desktop/") || trimmed.contains("Documents/") ||
           trimmed.contains("Users\\") || trimmed.contains("Desktop\\") || trimmed.contains("Documents\\") {
            if !trimmed.contains(' ') || trimmed.len() < 40 { continue; }
        }

        // Skip timestamp-only lines
        if trimmed.len() < 20 {
            let digit_count = trimmed.chars().filter(|c| c.is_ascii_digit()).count();
            let colon_count = trimmed.matches(':').count();
            if digit_count > trimmed.len() / 2 && colon_count >= 1 { continue; }
        }

        cleaned_lines.push(trimmed);
    }

    // Second pass: group into content blocks and score them.
    let mut result = String::new();
    let mut current_block = String::new();

    for line in &cleaned_lines {
        if line.len() < 8 {
            if !current_block.is_empty() {
                let word_count = current_block.split_whitespace().count();
                if word_count >= 8 {
                    if !result.is_empty() { result.push('\n'); }
                    result.push_str(current_block.trim());
                }
                current_block.clear();
            }
        } else {
            if !current_block.is_empty() { current_block.push(' '); }
            current_block.push_str(line);
        }
    }
    // Flush last block
    if !current_block.is_empty() {
        let word_count = current_block.split_whitespace().count();
        if word_count >= 8 {
            if !result.is_empty() { result.push('\n'); }
            result.push_str(current_block.trim());
        }
    }

    result
}

/// Save the current text selection to Reattend.
/// Simulates Cmd/Ctrl+C, reads clipboard, sends to capture API, shows notification.
async fn save_selection(app_handle: tauri::AppHandle) {
    // Step 1: Simulate copy keystroke
    platform::platform_simulate_copy();

    // Step 2: Wait for clipboard to update
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

    // Step 3: Read clipboard
    let clip_text = match platform::platform_read_clipboard() {
        Some(t) if t.split_whitespace().count() >= 2 => t,
        _ => {
            let _ = app_handle.notification()
                .builder()
                .title("Reattend")
                .body("No text selected. Select some text and try again.")
                .show();
            return;
        }
    };

    // Step 4: Get config
    let store = match app_handle.store("config.json") {
        Ok(s) => s,
        Err(_) => return,
    };
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());

    if token.is_empty() {
        let _ = app_handle.notification()
            .builder()
            .title("Reattend")
            .body("Not connected. Set your API token in Settings.")
            .show();
        return;
    }

    // Step 5: Send to capture API
    let meta = serde_json::json!({
        "capture_type": "selection",
        "source": "manual_selection",
    });
    let preview = if clip_text.len() > 60 {
        format!("{}...", &clip_text[..57])
    } else {
        clip_text.clone()
    };

    match api::capture(&url, &token, &clip_text, "selection", Some(meta)).await {
        Ok(_) => {
            let _ = app_handle.notification()
                .builder()
                .title("Saved to Reattend")
                .body(&preview)
                .show();
        }
        Err(e) => {
            let _ = app_handle.notification()
                .builder()
                .title("Reattend")
                .body(&format!("Failed to save: {}", e))
                .show();
        }
    }
}

/// Background "Passive Second Brain" loop:
/// 1. Clipboard monitoring (every ~6s) → capture for triage
/// 2. App switch detection (every 4s) → triggers early OCR
/// 3. OCR screen capture (every 60s or on app switch) → capture for triage + ambient recall
async fn passive_capture_loop(app_handle: tauri::AppHandle) {
    let mut last_ocr_text = String::new();
    let mut last_clipboard_text = String::new();
    let mut last_app_name = String::new();
    let mut ticks: u32 = 0; // Each tick = 2s

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        ticks += 1;

        // Check if token is configured
        let store = match app_handle.store("config.json") {
            Ok(s) => s,
            Err(_) => continue,
        };
        let token = store
            .get("api_token")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let url = store
            .get("api_url")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "https://reattend.com".to_string());

        if token.is_empty() {
            continue;
        }

        // --- Signal 1: Clipboard capture (every ~6s) ---
        if ticks % 3 == 0 {
            if let Some(clip_text) = platform::platform_read_clipboard() {
                if clip_text != last_clipboard_text {
                    last_clipboard_text = clip_text.clone();
                    // Only capture meaningful clipboard content
                    if clip_text.split_whitespace().count() >= 5 && clip_text.len() >= 30 {
                        let meta = serde_json::json!({
                            "capture_type": "clipboard",
                            "app_name": &last_app_name,
                        });
                        let _ = api::capture(&url, &token, &clip_text, "clipboard", Some(meta)).await;
                    }
                }
            }
        }

        // --- Signal 2: App switch detection (every 4s) ---
        if ticks % 2 == 0 {
            let current_app = platform::platform_get_active_app_name();
            if !current_app.is_empty() && current_app != "Unknown" {
                if current_app != last_app_name && !last_app_name.is_empty() {
                    last_app_name = current_app;
                    ticks = 29; // Force OCR on next 2s tick
                } else {
                    last_app_name = current_app;
                }
            }
        }

        // --- Signal 3: OCR screen capture (every 60s or after app switch) ---
        if ticks % 30 == 0 {
            // Run OCR via platform-specific implementation
            let ocr_result = match platform::platform_capture_screen_ocr(&app_handle).await {
                Ok(v) => v,
                Err(_) => continue,
            };

            let raw_text = ocr_result["text"].as_str().unwrap_or("").to_string();
            let app_name = ocr_result["appName"].as_str().unwrap_or("Unknown").to_string();

            let app_switched = app_name != last_app_name && !last_app_name.is_empty();
            last_app_name = app_name.clone();

            // Skip noise apps entirely
            if should_skip_app(&app_name) {
                continue;
            }

            // Clean OCR text: strip UI chrome, URLs, tabs, menus → keep content
            let cleaned = clean_ocr_text(&raw_text);

            // Skip if cleaned text is too short
            if cleaned.split_whitespace().count() < 12 {
                continue;
            }

            // Skip if text hasn't changed significantly
            let similarity = text_similarity(&last_ocr_text, &cleaned);
            if similarity > 0.75 && !app_switched {
                continue;
            }
            last_ocr_text = cleaned.clone();

            // Truncate for API
            let capture_text = if cleaned.len() > 3000 {
                cleaned.chars().take(3000).collect::<String>()
            } else {
                cleaned.clone()
            };

            // --- Capture: send cleaned text to triage pipeline ---
            {
                let meta = serde_json::json!({
                    "capture_type": "screen",
                    "app_name": &app_name,
                });
                let url_c = url.clone();
                let token_c = token.clone();
                let text_c = capture_text.clone();
                tokio::spawn(async move {
                    let _ = api::capture(&url_c, &token_c, &text_c, "screen", Some(meta)).await;
                });
            }

            // --- Ambient recall: Grammarly-like popup ---
            {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                let snoozed_until = SNOOZE_UNTIL.load(std::sync::atomic::Ordering::SeqCst);
                if now >= snoozed_until {
                    match api::analyze(&url, &token, &capture_text, &app_name).await {
                        Ok(result) => {
                            if let Some(related) = result["related"].as_array() {
                                if !related.is_empty() {
                                    let memories_json =
                                        serde_json::to_string(related).unwrap_or_default();
                                    let encoded_memories = urlencoding::encode(&memories_json);
                                    let mut popup_url = format!("/?memories={}", encoded_memories);

                                    if let Some(context) = result["context"].as_str() {
                                        let encoded_context = urlencoding::encode(context);
                                        popup_url.push_str(&format!("&context={}", encoded_context));
                                    }

                                    create_ambient_popup(&app_handle, &popup_url);
                                }
                            }
                        }
                        Err(_) => {}
                    }
                }
            }
        }
    }
}

/// Simple text similarity (Jaccard on words)
fn text_similarity(a: &str, b: &str) -> f64 {
    let words_a: std::collections::HashSet<&str> = a.split_whitespace().collect();
    let words_b: std::collections::HashSet<&str> = b.split_whitespace().collect();
    if words_a.is_empty() && words_b.is_empty() {
        return 1.0;
    }
    let intersection = words_a.intersection(&words_b).count();
    let union = words_a.union(&words_b).count();
    if union == 0 {
        return 1.0;
    }
    intersection as f64 / union as f64
}

/// Create ambient popup at bottom-right of screen
fn create_ambient_popup(app: &tauri::AppHandle, url: &str) {
    let app_clone = app.clone();
    let url = url.to_string();
    let width = 340.0_f64;
    let height = 260.0_f64;
    let margin = 16.0_f64;

    let _ = app.run_on_main_thread(move || {
        let app = app_clone;

        // Close existing ambient popup if open
        if let Some(window) = app.get_webview_window("ambient") {
            let _ = window.close();
        }

        // Calculate bottom-right position
        let (x, y) = if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let screen_w = size.width as f64 / scale;
            let screen_h = size.height as f64 / scale;
            (screen_w - width - margin, screen_h - height - margin - 40.0)
        } else {
            (1200.0, 600.0)
        };

        platform::platform_activate_app();

        if let Ok(window) = WebviewWindowBuilder::new(&app, "ambient", WebviewUrl::App(url.into()))
            .title("Reattend")
            .inner_size(width, height)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .visible(true)
            .build()
        {
            let _ = window.set_focus();
            platform::platform_elevate_window(&window);
        }
    });
}

fn create_window(app: &tauri::AppHandle, label: &str, title: &str, url: &str, width: f64, height: f64) {
    let app_clone = app.clone();
    let label = label.to_string();
    let title = title.to_string();
    let url = url.to_string();

    let _ = app.run_on_main_thread(move || {
        let app = app_clone;

        platform::platform_activate_app();

        let window = if let Some(window) = app.get_webview_window(&label) {
            let _ = window.show();
            let _ = window.set_focus();
            Some(window)
        } else {
            WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
                .title(&title)
                .inner_size(width, height)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .center()
                .visible(true)
                .build()
                .ok()
                .map(|w| { let _ = w.set_focus(); w })
        };

        if let Some(ref win) = window {
            platform::platform_elevate_window(win);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            capture_text,
            search_memories,
            ask_ai,
            analyze_screen,
            run_ocr_capture,
            snooze_ambient,
        ])
        .setup(|app| {
            // Platform-specific startup
            platform::platform_hide_from_dock();
            platform::platform_store_app_handle(&app.handle());
            platform::platform_register_context_menu();

            // Build tray menu with platform-appropriate shortcut display
            let shortcut_prefix = platform::platform_shortcut_display();
            let quit = MenuItem::with_id(app, "quit", "Quit Reattend", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "Quick Capture", true, None::<&str>)?;
            let save_sel = MenuItem::with_id(
                app, "save_selection",
                &format!("Save Selection  {}S", shortcut_prefix),
                true, None::<&str>
            )?;
            let ask = MenuItem::with_id(app, "ask", "Ask AI", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&capture, &save_sel, &ask, &separator, &settings, &separator, &quit])?;

            // Build tray icon (embedded at compile time for reliable loading)
            let icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                .expect("failed to load tray icon");
            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Reattend — Memory Layer")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            SHOULD_QUIT.store(true, std::sync::atomic::Ordering::SeqCst);
                            app.exit(0);
                        }
                        "capture" => {
                            create_window(app, "capture", "Quick Capture", "/", 480.0, 320.0);
                        }
                        "save_selection" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                save_selection(handle).await;
                            });
                        }
                        "ask" => {
                            create_window(app, "ask", "Ask AI", "/", 480.0, 400.0);
                        }
                        "settings" => {
                            create_window(app, "settings", "Settings", "/", 400.0, 360.0);
                        }
                        _ => {}
                    }
                });

            // Template icons only work on macOS
            #[cfg(target_os = "macos")]
            { tray_builder = tray_builder.icon_as_template(true); }

            let _tray = tray_builder.build(app)?;

            // Register global shortcuts with platform-appropriate modifier
            let app_handle = app.handle().clone();
            let modifier = platform::platform_shortcut_modifier() | tauri_plugin_global_shortcut::Modifiers::SHIFT;

            // Quick Capture
            let capture_shortcut = Shortcut::new(Some(modifier), Code::KeyR);
            app.global_shortcut().on_shortcut(capture_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    create_window(&app_handle, "capture", "Quick Capture", "/", 480.0, 320.0);
                }
            })?;

            // Save Selection
            let save_shortcut = Shortcut::new(Some(modifier), Code::KeyS);
            app.global_shortcut().on_shortcut(save_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        save_selection(handle).await;
                    });
                }
            })?;

            // Ask AI
            let ask_shortcut = Shortcut::new(Some(modifier), Code::KeyA);
            app.global_shortcut().on_shortcut(ask_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    create_window(&app_handle, "ask", "Ask AI", "/", 480.0, 400.0);
                }
            })?;

            // Start passive capture loop in background
            let bg_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                passive_capture_loop(bg_handle).await;
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if !SHOULD_QUIT.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
