use tauri_plugin_global_shortcut::Modifiers;

// FFI to Objective-C helper — safe wrappers with @try/@catch
extern "C" {
    fn elevate_ns_window(ns_window_ptr: *mut std::ffi::c_void);
    fn activate_reattend_app();
    fn hide_from_dock();
    fn register_services_provider();
    fn check_screen_capture_permission() -> bool;
    fn request_screen_capture_permission() -> bool;
    fn open_screen_recording_settings();
    fn open_microphone_settings();
    fn get_frontmost_app_name() -> *mut std::ffi::c_char;
}

/// Check if screen recording permission is granted (instant, no prompt).
pub fn platform_check_screen_permission() -> bool {
    unsafe { check_screen_capture_permission() }
}

/// Request screen recording permission (shows system prompt if never asked).
pub fn platform_request_screen_permission() -> bool {
    unsafe { request_screen_capture_permission() }
}

/// Open macOS System Settings to Screen Recording pane.
pub fn platform_open_screen_settings() {
    unsafe { open_screen_recording_settings(); }
}

/// Open macOS System Settings to Microphone pane.
pub fn platform_open_mic_settings() {
    unsafe { open_microphone_settings(); }
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

// platform_show_in_dock removed 2026-05-05: tray-only architecture never
// returns to the Dock. The app stays LSUIElement for its whole lifetime.

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
/// Uses NSWorkspace via ObjC FFI (reliable for tray/LSUIElement apps).
pub fn platform_get_active_app_name() -> String {
    extern "C" { fn free(ptr: *mut std::ffi::c_void); }
    unsafe {
        let name_ptr = get_frontmost_app_name();
        if name_ptr.is_null() {
            return "Unknown".to_string();
        }
        let c_str = std::ffi::CStr::from_ptr(name_ptr);
        let result = c_str.to_str().unwrap_or("Unknown").to_string();
        free(name_ptr as *mut std::ffi::c_void);
        result
    }
}

/// Capture the screen and perform OCR using the Swift Vision binary.
pub async fn platform_capture_screen_ocr(app_handle: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // In bundled app: Tauri copies resources preserving path structure
    let bundled_bin = resource_dir.join("swift-plugin/.build/release/reattend-capture");
    // Also check flat path (in case resources config changes)
    let bundled_flat = resource_dir.join("reattend-capture");

    // In dev: try release first (prebuild.cjs builds with -c release)
    let cargo_dir = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string()),
    );
    let dev_release_bin = cargo_dir.join("swift-plugin/.build/release/reattend-capture");
    let dev_debug_bin = cargo_dir.join("swift-plugin/.build/debug/reattend-capture");

    let bin_path = if bundled_bin.exists() {
        bundled_bin
    } else if bundled_flat.exists() {
        bundled_flat
    } else if dev_release_bin.exists() {
        dev_release_bin
    } else if dev_debug_bin.exists() {
        dev_debug_bin
    } else {
        return Err(format!(
            "reattend-capture binary not found. Searched:\n  {}\n  {}\n  {}\n  {}\nRun: cd src-tauri/swift-plugin && swift build -c release",
            bundled_bin.display(), bundled_flat.display(), dev_release_bin.display(), dev_debug_bin.display(),
        ));
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
