use tauri_plugin_global_shortcut::Modifiers;
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

// platform_show_in_dock removed 2026-05-05: tray-only architecture has
// no main window to surface in the taskbar.

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
    // Steps 1-4 run in spawn_blocking because xcap types are !Send
    let (base64_image, app_name) = tokio::task::spawn_blocking(|| -> Result<(String, String), String> {
        // Step 1: Capture screenshot via xcap
        let monitors = xcap::Monitor::all().map_err(|e| format!("Monitor enumerate error: {}", e))?;
        println!("[Win OCR] Found {} monitors", monitors.len());
        let primary = monitors
            .into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .or_else(|| xcap::Monitor::all().ok()?.into_iter().next())
            .ok_or("No monitor found")?;

        let image = primary.capture_image().map_err(|e| format!("Screen capture error: {}", e))?;

        // Step 2: Resize to 25% for bandwidth efficiency
        let (w, h) = (image.width(), image.height());
        println!("[Win OCR] Captured {}x{} screenshot", w, h);
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
        let bytes = buf.into_inner();
        println!("[Win OCR] JPEG size: {} bytes", bytes.len());
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);

        // Step 4: Get active app name
        let app_name = platform_get_active_app_name();

        Ok((b64, app_name))
    })
    .await
    .map_err(|e| format!("Capture task panicked: {}", e))?
    ?;

    // Step 5: Get server config from database (consistent with rest of app)
    use tauri::Manager;
    let db = app_handle
        .try_state::<std::sync::Arc<crate::db::Database>>()
        .ok_or("Database not initialized")?;
    let url = db.get_config("server_url")
        .unwrap_or_else(|| "https://reattend.com".to_string());
    let token = db.get_config("auth_token").unwrap_or_default();
    let device_id = db.get_config("device_id").unwrap_or_default();

    if token.is_empty() && device_id.is_empty() {
        return Err("No auth: device_id and auth_token both empty".to_string());
    }

    println!("[Win OCR] POST {}/api/tray/ocr (image: {} chars, device_id: {}, has_token: {})",
        url, base64_image.len(), if device_id.is_empty() { "none" } else { &device_id[..8] }, !token.is_empty());

    // Step 6: Send to server for OCR
    let client = reqwest::Client::new();
    let mut req = client
        .post(format!("{}/api/tray/ocr", url))
        .json(&serde_json::json!({
            "image": base64_image,
            "app_name": &app_name,
        }))
        .timeout(std::time::Duration::from_secs(30));

    if !device_id.is_empty() {
        req = req.header("X-Device-Id", &device_id);
    }
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await
        .map_err(|e| format!("OCR request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OCR API error {}: {}", status, body));
    }

    let mut result: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text_len = result["text"].as_str().map(|t| t.len()).unwrap_or(0);
    println!("[Win OCR] Success: {} chars of text from {}", text_len, app_name);
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
