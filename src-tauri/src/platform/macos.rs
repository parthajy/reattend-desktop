use tauri_plugin_global_shortcut::Modifiers;

// FFI to Objective-C helper — safe wrappers with @try/@catch
extern "C" {
    fn elevate_ns_window(ns_window_ptr: *mut std::ffi::c_void);
    fn activate_reattend_app();
    fn hide_from_dock();
    fn simulate_copy();
    fn register_services_provider();
}

/// Global app handle for the macOS Services callback
pub static GLOBAL_APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Called from ObjC when "Save to Reattend" service receives text
#[no_mangle]
pub extern "C" fn handle_service_text(text_ptr: *const std::ffi::c_char) {
    if text_ptr.is_null() { return; }
    let c_str = unsafe { std::ffi::CStr::from_ptr(text_ptr) };
    let text = match c_str.to_str() {
        Ok(s) => s.to_string(),
        Err(_) => return,
    };
    if text.trim().is_empty() { return; }

    if let Some(app_handle) = GLOBAL_APP_HANDLE.get() {
        let handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            crate::save_service_text(handle, text).await;
        });
    }
}

/// Elevate a window above fullscreen spaces (macOS-specific).
pub fn platform_elevate_window(window: &tauri::WebviewWindow) {
    if let Ok(ns_win) = window.ns_window() {
        unsafe { elevate_ns_window(ns_win); }
    }
}

/// Bring the app to the foreground (required for LSUIElement apps).
pub fn platform_activate_app() {
    unsafe { activate_reattend_app(); }
}

/// Hide app from Dock — tray-only (LSUIElement equivalent at runtime).
pub fn platform_hide_from_dock() {
    unsafe { hide_from_dock(); }
}

/// Simulate Cmd+C to copy the current selection.
pub fn platform_simulate_copy() {
    unsafe { simulate_copy(); }
}

/// Register macOS Services provider for right-click "Save to Reattend".
pub fn platform_register_context_menu() {
    unsafe { register_services_provider(); }
}

/// Store the global app handle (for Services callback).
pub fn platform_store_app_handle(handle: &tauri::AppHandle) {
    GLOBAL_APP_HANDLE.set(handle.clone()).ok();
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

/// Capture the screen and perform OCR using the Swift Vision binary.
pub async fn platform_capture_screen_ocr(app_handle: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // In bundled app: Resources/reattend-capture
    let bundled_bin = resource_dir.join("reattend-capture");

    // In dev: src-tauri/swift-plugin/.build/debug/reattend-capture
    let dev_bin = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string()),
    )
    .join("swift-plugin")
    .join(".build")
    .join("debug")
    .join("reattend-capture");

    let bin_path = if bundled_bin.exists() {
        bundled_bin
    } else if dev_bin.exists() {
        dev_bin
    } else {
        return Err("reattend-capture binary not found. Build the Swift plugin first.".to_string());
    };

    let output = tokio::process::Command::new(&bin_path)
        .arg("screenshot")
        .output()
        .await
        .map_err(|e| format!("Failed to run capture: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Capture failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON: {}", e))
}

/// Return the platform-appropriate shortcut modifier (Cmd on macOS).
pub fn platform_shortcut_modifier() -> Modifiers {
    Modifiers::SUPER
}

/// Return the platform shortcut display prefix for menus.
pub fn platform_shortcut_display() -> &'static str {
    "\u{2318}\u{21E7}" // ⌘⇧
}
