use tauri_plugin_global_shortcut::Modifiers;
use tauri_plugin_store::StoreExt;
use base64::Engine;

/// Elevate a window — no-op on Windows (Tauri always_on_top handles it).
pub fn platform_elevate_window(_window: &tauri::WebviewWindow) {
    // Tauri's always_on_top(true) is sufficient on Windows
}

/// Bring the app to the foreground — no-op on Windows (Tauri set_focus handles it).
pub fn platform_activate_app() {
    // Tauri's set_focus() handles this on Windows
}

/// Hide app from taskbar — no-op on Windows (tray-only apps don't show).
pub fn platform_hide_from_dock() {
    // Tray-only Tauri apps on Windows don't appear in the taskbar by default
}

/// Simulate Ctrl+C to copy the current selection.
pub fn platform_simulate_copy() {
    use enigo::{Enigo, Keyboard, Settings, Key, Direction};
    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        let _ = enigo.key(Key::Control, Direction::Press);
        let _ = enigo.key(Key::Unicode('c'), Direction::Click);
        let _ = enigo.key(Key::Control, Direction::Release);
    }
    // Small delay for the target app to process
    std::thread::sleep(std::time::Duration::from_millis(50));
}

/// Register context menu — no-op on Windows MVP.
pub fn platform_register_context_menu() {
    // No Windows equivalent of macOS Services menu for MVP
}

/// Store app handle — no-op on Windows (no Services callback needed).
pub fn platform_store_app_handle(_handle: &tauri::AppHandle) {
    // Not needed on Windows — no Services callback
}

/// Read clipboard text via arboard (cross-platform).
pub fn platform_read_clipboard() -> Option<String> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let text = clipboard.get_text().ok()?;
    if text.is_empty() { None } else { Some(text) }
}

/// Get the name of the currently active/foreground application.
pub fn platform_get_active_app_name() -> String {
    match active_win_pos_rs::get_active_window() {
        Ok(win) => win.app_name,
        Err(_) => "Unknown".to_string(),
    }
}

/// Capture the screen and perform OCR via server-side Tesseract.
/// Takes a screenshot with xcap, compresses it, and sends to the server.
pub async fn platform_capture_screen_ocr(app_handle: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    // Step 1: Capture screenshot via xcap
    let monitors = xcap::Monitor::all().map_err(|e| format!("Monitor error: {}", e))?;
    let primary = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| xcap::Monitor::all().ok()?.into_iter().next())
        .ok_or("No monitor found")?;

    let image = primary.capture_image().map_err(|e| format!("Capture error: {}", e))?;

    // Step 2: Resize to 25% for bandwidth efficiency
    let (w, h) = (image.width(), image.height());
    let resized = image::imageops::resize(
        &image,
        w / 4,
        h / 4,
        image::imageops::FilterType::Triangle,
    );

    // Step 3: Encode as JPEG (small size) → base64
    let mut buf = std::io::Cursor::new(Vec::new());
    resized
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("JPEG encode error: {}", e))?;
    let base64_image = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());

    // Step 4: Get active app name
    let app_name = platform_get_active_app_name();

    // Step 5: Get server config
    let store = app_handle.store("config.json").map_err(|e| e.to_string())?;
    let url = store
        .get("api_url")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = store
        .get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    if token.is_empty() {
        return Err("No API token configured".to_string());
    }

    // Step 6: Send to server for OCR
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/tray/ocr", url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "image": base64_image,
            "app_name": &app_name,
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("OCR request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("OCR API error: {}", resp.status()));
    }

    let mut result: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    // Ensure appName is set (server might not return it)
    if result.get("appName").is_none() {
        result["appName"] = serde_json::json!(app_name);
    }
    Ok(result)
}

/// Return the platform-appropriate shortcut modifier (Ctrl on Windows).
pub fn platform_shortcut_modifier() -> Modifiers {
    Modifiers::CONTROL
}

/// Return the platform shortcut display prefix for menus.
pub fn platform_shortcut_display() -> &'static str {
    "Ctrl+Shift+"
}
