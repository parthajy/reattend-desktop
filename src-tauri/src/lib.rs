use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Listener, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};
use tauri_plugin_notification::NotificationExt;

pub mod db;
pub mod commands;
pub mod ai;
pub mod worker;
pub mod audio;
mod platform;

/// Flag to distinguish intentional quit from window-close
static SHOULD_QUIT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Ambient snooze: unix timestamp (seconds) until which ambient popups are suppressed
pub static SNOOZE_UNTIL: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

/// Capture health: consecutive OCR failure count (reset on success)
pub static CAPTURE_FAIL_COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
/// Capture health: total successful captures since launch
pub static CAPTURE_SUCCESS_COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
/// Capture health: whether we've already shown the "capture broken" notification
static CAPTURE_BROKEN_NOTIFIED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Save text received from macOS Services menu (called from platform::macos)
pub async fn save_service_text(app_handle: tauri::AppHandle, text: String) {
    let db = match app_handle.try_state::<std::sync::Arc<db::Database>>() {
        Some(d) => d,
        None => return,
    };

    let meta = serde_json::json!({
        "capture_type": "selection",
        "source": "services_menu",
    });
    let preview = if text.len() > 60 {
        format!("{}...", &text[..57])
    } else {
        text.clone()
    };

    match db.insert_raw_item(&text, "selection", None, Some(&meta.to_string())) {
        Ok(raw_id) => {
            let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
            let _ = db.queue_job("triage", &payload);
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

// ── Productive apps: OCR more frequently (every 20s instead of 60s) ────────
const PRODUCTIVE_APPS: &[&str] = &[
    "google chrome", "chrome", "safari", "firefox", "arc", "brave",
    "microsoft edge", "edge", "opera", "vivaldi",
    "mail", "outlook", "spark", "airmail", "thunderbird",
    "notes", "obsidian", "notion", "bear", "craft",
    "pages", "microsoft word", "google docs", "textedit",
    "slack", "microsoft teams", "zoom", "discord", "telegram", "whatsapp",
    "linear", "jira", "asana", "trello", "clickup", "todoist", "things",
    "figma", "sketch", "miro",
];

fn is_productive_app(app_name: &str) -> bool {
    let lower = app_name.to_lowercase();
    PRODUCTIVE_APPS.iter().any(|app| lower.contains(app))
}

// ── Apps that should NEVER trigger screen capture ──────────────────────────
const SKIP_APPS: &[&str] = &[
    "terminal", "iterm", "warp", "hyper", "alacritty", "kitty",
    "visual studio code", "code", "xcode", "intellij", "android studio",
    "pycharm", "webstorm", "rustrover", "goland", "clion", "datagrip",
    "sublime text", "atom", "neovim", "vim",
    "finder", "system preferences", "system settings",
    "activity monitor", "console", "disk utility", "font book",
    "migration assistant", "bluetooth", "airdrop",
    "explorer", "task manager", "control panel", "registry editor",
    "device manager", "event viewer", "windows security",
    "cmd.exe", "powershell", "windows terminal", "command prompt",
    "devenv",
    "1password", "bitwarden", "lastpass", "dashlane", "keychain access",
    "authy", "google authenticator", "credential manager",
    "spotify", "music", "vlc", "quicktime player", "iina", "podcasts",
    "tv", "infuse", "plex", "groove music", "movies & tv",
    "docker desktop", "docker", "parallels desktop", "vmware",
    "app store", "software update", "self service", "microsoft store",
    "reattend",
];

fn should_skip_app(app_name: &str) -> bool {
    let lower = app_name.to_lowercase();
    SKIP_APPS.iter().any(|skip| lower.contains(skip))
}

fn is_domain_or_product_listing(line: &str) -> bool {
    let lower = line.to_lowercase();
    let tlds = [".com", ".net", ".org", ".io", ".xyz", ".co", ".dev", ".app",
                ".me", ".info", ".biz", ".us", ".uk", ".de", ".fr", ".in",
                ".ai", ".tech", ".store", ".online", ".site", ".club"];
    let has_tld = tlds.iter().any(|tld| {
        if let Some(pos) = lower.find(tld) {
            let after = pos + tld.len();
            after >= lower.len() || !lower.as_bytes()[after].is_ascii_alphanumeric()
        } else {
            false
        }
    });
    let has_price = lower.contains('$') || lower.contains('€') || lower.contains('£')
        || lower.contains("/yr") || lower.contains("/mo") || lower.contains("per year")
        || lower.contains("per month");
    let commerce_words = ["available", "taken", "premium", "add to cart", "buy now",
        "register", "renew", "transfer", "in stock", "out of stock", "sale",
        "free shipping", "add to bag", "wishlist", "compare"];
    let has_commerce = commerce_words.iter().any(|w| lower.contains(w));

    if has_tld && (has_price || has_commerce) { return true; }
    if has_price && has_commerce && line.split_whitespace().count() < 15 { return true; }

    false
}

fn line_shape(line: &str) -> Vec<u8> {
    line.split_whitespace()
        .map(|w| {
            let is_num = w.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ',' || c == '$' || c == '€' || c == '%');
            if is_num { b'N' }
            else if w.len() <= 3 { b'S' }
            else { b'W' }
        })
        .collect()
}

fn extract_delta_text(previous: &str, current: &str) -> String {
    let prev_lines: std::collections::HashSet<&str> = previous.lines()
        .map(|l| l.trim())
        .filter(|l| l.len() >= 5)
        .collect();

    let new_lines: Vec<&str> = current.lines()
        .map(|l| l.trim())
        .filter(|l| l.len() >= 5 && !prev_lines.contains(l))
        .collect();

    new_lines.join("\n")
}

/// Noise phrases that indicate UI chrome, not content.
const UI_NOISE: &[&str] = &[
    "sign in", "sign up", "log in", "log out", "sign out",
    "cookie", "accept all", "reject all", "privacy policy", "terms of service",
    "terms & conditions", "terms of use", "cookie policy",
    "ad choices", "advertising", "help center", "get the app",
    "download app", "open app", "install", "update available",
    "notifications", "settings", "preferences",
    "copyright", "all rights reserved", "corporation ©",
    "add to cart", "buy now", "add to bag", "free shipping", "in stock",
    "wishlist", "compare", "sold out", "checkout", "your cart",
    "subscribe", "newsletter", "unsubscribe",
    "powered by", "built with", "© 20",
    "skip to content", "skip to main", "go to",
    "back to top", "load more", "show more", "see all",
    "collapse", "expand",
];

/// Patterns indicating browser tab bars and app chrome.
fn is_browser_chrome(text: &str) -> bool {
    let lower = text.to_lowercase();
    // Tab bar: multiple "X" close buttons mixed with app names
    let x_count = text.matches(" X ").count() + text.matches(" x ").count();
    if x_count >= 2 { return true; }
    // Address bar / URL fragments embedded in text
    if lower.contains(".com/") && lower.contains(" x ") { return true; }
    // Browser UI: common fragments
    let chrome_fragments = [
        "new tab", "new window", "incognito", "private window",
        "enter passphrase", "chrome available", "chrome update",
        "bookmark", "reading list", "extensions",
        "browse thou",  // garbled "Browse through"
    ];
    chrome_fragments.iter().any(|f| lower.contains(f))
}

/// Check if a sentence is mostly noise (short fragments, UI labels, social counts).
fn is_noise_sentence(text: &str) -> bool {
    let lower = text.to_lowercase();
    let word_count = text.split_whitespace().count();

    // Very short fragments are noise
    if word_count < 4 { return true; }

    // Social media noise patterns
    let social_noise = [
        "connections", "followers", "following", "also follow",
        "like", "repost", "comment", "share", "reply",
        "reactions", "comments", "views", "impressions",
        "1st", "2nd", "3rd", "mutual connection",
        "promoted", "sponsored",
    ];
    let noise_hits: usize = social_noise.iter()
        .filter(|n| lower.contains(*n))
        .count();
    if noise_hits >= 2 && word_count < 15 { return true; }

    // Footer / legal patterns
    if UI_NOISE.iter().any(|n| lower.contains(n)) && word_count < 20 { return true; }

    // Lines that are mostly single-word labels separated by pipes/bullets
    let separator_count = text.matches('|').count()
        + text.matches('•').count()
        + text.matches('·').count()
        + text.matches('›').count();
    if separator_count >= 3 && word_count < separator_count * 4 { return true; }

    false
}

fn clean_ocr_text(raw: &str) -> String {
    // Step 1: Split into sentences (OCR often dumps everything on few lines)
    // Split on sentence boundaries and common OCR line breaks
    let mut sentences: Vec<String> = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        // Split long lines on sentence boundaries (. ! ? followed by uppercase)
        let mut current = String::new();
        let chars: Vec<char> = trimmed.chars().collect();
        for i in 0..chars.len() {
            current.push(chars[i]);
            let is_sentence_end = (chars[i] == '.' || chars[i] == '!' || chars[i] == '?')
                && i + 2 < chars.len()
                && chars[i + 1] == ' '
                && chars[i + 2].is_uppercase();
            // Also split on " | " separators (common in OCR of UI)
            let is_pipe_sep = chars[i] == '|'
                && i > 0 && chars[i - 1] == ' '
                && i + 1 < chars.len() && chars[i + 1] == ' ';

            if is_sentence_end || is_pipe_sep {
                if is_pipe_sep {
                    current.pop(); // remove the pipe
                }
                let s = current.trim().to_string();
                if !s.is_empty() { sentences.push(s); }
                current.clear();
            }
        }
        let s = current.trim().to_string();
        if !s.is_empty() { sentences.push(s); }
    }

    // Step 2: Filter each sentence aggressively
    let mut kept_sentences: Vec<String> = Vec::new();

    for sentence in &sentences {
        let trimmed = sentence.trim();
        if trimmed.len() < 10 { continue; }

        // Skip URLs
        if trimmed.contains("://") || trimmed.starts_with("www.") { continue; }
        let lower = trimmed.to_lowercase();

        // Skip browser chrome
        if is_browser_chrome(trimmed) { continue; }

        // Skip noise sentences (UI, social, ads, footer)
        if is_noise_sentence(trimmed) { continue; }

        // Skip domain listings / commerce
        if is_domain_or_product_listing(trimmed) { continue; }

        // Skip lines with too many non-alpha characters (OCR artifacts)
        let alpha_count = trimmed.chars().filter(|c| c.is_alphabetic()).count();
        let total_count = trimmed.chars().count();
        if total_count > 0 && (alpha_count as f64 / total_count as f64) < 0.4 { continue; }

        // Skip menu bars
        if lower.starts_with("file ") && lower.contains("edit ") { continue; }

        // Skip single words or very short labels
        if !trimmed.contains(' ') && trimmed.len() < 25 { continue; }

        // Skip file paths
        if trimmed.starts_with('/') && !trimmed.contains(' ') { continue; }
        if trimmed.starts_with("C:\\") || trimmed.starts_with("D:\\") { continue; }
        if (trimmed.contains("Users/") || trimmed.contains("Desktop/")) && trimmed.len() < 60 { continue; }

        // Skip price-heavy lines
        let price_count = trimmed.matches('$').count()
            + trimmed.matches('€').count()
            + trimmed.matches('£').count();
        if price_count >= 2 { continue; }

        // Skip navigation breadcrumbs (short items separated by > or /)
        let arrow_count = trimmed.matches(" > ").count() + trimmed.matches(" › ").count();
        if arrow_count >= 2 && trimmed.split_whitespace().count() < 15 { continue; }

        // Must have enough real words (at least 5 words > 2 chars)
        let real_words = trimmed.split_whitespace()
            .filter(|w| w.len() > 2 && w.chars().any(|c| c.is_alphabetic()))
            .count();
        if real_words < 5 { continue; }

        kept_sentences.push(trimmed.to_string());
    }

    // Step 3: Repetition filter — remove near-duplicate sentences
    if kept_sentences.len() >= 3 {
        let shapes: Vec<Vec<u8>> = kept_sentences.iter().map(|l| line_shape(l)).collect();
        let mut shape_counts: std::collections::HashMap<Vec<u8>, usize> = std::collections::HashMap::new();
        for shape in &shapes {
            if !shape.is_empty() {
                *shape_counts.entry(shape.clone()).or_insert(0) += 1;
            }
        }
        if let Some((dominant_shape, &count)) = shape_counts.iter().max_by_key(|(_, c)| *c) {
            if count >= 4 && (count as f64 / kept_sentences.len() as f64) > 0.3 {
                let dominant = dominant_shape.clone();
                let mut kept = 0;
                kept_sentences.retain(|s| {
                    if line_shape(s) == dominant {
                        kept += 1;
                        kept <= 2
                    } else {
                        true
                    }
                });
            }
        }
    }

    // Step 4: Join kept sentences into coherent blocks
    let mut result = String::new();
    for sentence in &kept_sentences {
        if !result.is_empty() { result.push(' '); }
        result.push_str(sentence);
    }

    result
}

/// Toggle meeting recording on/off. Called from tray menu or ⌘⇧M.
async fn toggle_meeting(app_handle: tauri::AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let meeting_state = match app_handle.try_state::<std::sync::Arc<std::sync::Mutex<audio::MeetingState>>>() {
        Some(s) => s,
        None => return,
    };

    let is_recording = {
        let state = meeting_state.lock().unwrap();
        state.is_recording
    };

    if is_recording {
        // Stop recording
        let db = match app_handle.try_state::<std::sync::Arc<db::Database>>() {
            Some(d) => d,
            None => return,
        };

        let (recording_id, duration_secs, audio_path) = {
            let mut state = meeting_state.lock().unwrap();
            if let Some(flag) = state.stop_flag.take() {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            let duration = state.start_time.map(|t| t.elapsed().as_secs()).unwrap_or(0);
            let recording_id = state.recording_id.clone().unwrap_or_default();
            let audio_path = state.audio_path.clone().unwrap_or_default();
            state.is_recording = false;
            state.recording_id = None;
            state.start_time = None;
            state.audio_path = None;
            (recording_id, duration, audio_path)
        };

        // Wait for WAV finalization
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        let meta = serde_json::json!({
            "capture_type": "meeting",
            "recording_id": recording_id,
            "audio_path": audio_path.to_string_lossy(),
            "duration_secs": duration_secs,
        });

        match db.insert_raw_item(
            &format!("Meeting recording ({} seconds)", duration_secs),
            "meeting",
            Some("audio"),
            Some(&meta.to_string()),
        ) {
            Ok(raw_id) => {
                let payload = serde_json::json!({
                    "raw_item_id": raw_id,
                    "audio_path": audio_path.to_string_lossy(),
                    "recording_id": recording_id,
                }).to_string();
                let _ = db.queue_job("transcribe", &payload);
                println!("[Meeting] Stopped: {}s → transcribe queued", duration_secs);
            }
            Err(e) => eprintln!("[Meeting] Failed to save recording: {}", e),
        }

        // Close indicator window
        if let Some(win) = app_handle.get_webview_window("meeting-indicator") {
            let _ = win.close();
        }

        let _ = app_handle.notification()
            .builder()
            .title("Meeting ended")
            .body(&format!("{}s recorded — transcribing...", duration_secs))
            .show();

        let _ = app_handle.emit("meeting_stopped", serde_json::json!({
            "recording_id": recording_id,
            "duration_secs": duration_secs,
        }));
    } else {
        // Start recording
        let data_dir = match app_handle.path().app_data_dir() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Meeting] No data dir: {}", e);
                return;
            }
        };

        match audio::start_recording(&data_dir) {
            Ok((recording_id, wav_path, stop_flag)) => {
                let mut state = meeting_state.lock().unwrap();
                state.is_recording = true;
                state.recording_id = Some(recording_id.clone());
                state.start_time = Some(std::time::Instant::now());
                state.audio_path = Some(wav_path);
                state.stop_flag = Some(stop_flag);

                println!("[Meeting] Started recording: {}", recording_id);

                // Open meeting indicator window (top-right near menu bar)
                {
                    let ah = app_handle.clone();
                    let _ = app_handle.run_on_main_thread(move || {
                        if let Some(win) = ah.get_webview_window("meeting-indicator") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        } else if let Ok(win) = WebviewWindowBuilder::new(
                            &ah, "meeting-indicator", WebviewUrl::App("/".into()))
                            .title("Meeting")
                            .inner_size(220.0, 48.0)
                            .resizable(false)
                            .decorations(false)
                            .always_on_top(true)
                            .visible(true)
                            .build()
                        {
                            // Position top-right, below menu bar
                            if let Ok(monitor) = win.current_monitor() {
                                if let Some(monitor) = monitor {
                                    let size = monitor.size();
                                    let scale = monitor.scale_factor();
                                    let x = (size.width as f64 / scale) - 240.0;
                                    let _ = win.set_position(tauri::PhysicalPosition::new(
                                        (x * scale) as i32,
                                        (32.0 * scale) as i32,
                                    ));
                                }
                            }
                        }
                    });
                }

                let _ = app_handle.notification()
                    .builder()
                    .title("Meeting started")
                    .body("Recording audio — press ⌘⇧M to stop")
                    .show();

                let _ = app_handle.emit("meeting_started", serde_json::json!({
                    "recording_id": recording_id,
                }));

                // Spawn background monitor for auto-stop (silence detection)
                let ah_auto = app_handle.clone();
                let stop_monitor = state.stop_flag.as_ref().map(|f| f.clone());
                drop(state); // release lock before spawning
                if let Some(flag) = stop_monitor {
                    std::thread::spawn(move || {
                        loop {
                            std::thread::sleep(std::time::Duration::from_secs(5));
                            // First check if meeting was already stopped by user
                            if let Some(ms) = ah_auto.try_state::<std::sync::Arc<std::sync::Mutex<audio::MeetingState>>>() {
                                let s = ms.lock().unwrap();
                                if !s.is_recording {
                                    println!("[Meeting] Monitor: recording already stopped, exiting monitor");
                                    break;
                                }
                            }
                            if flag.load(std::sync::atomic::Ordering::Relaxed) {
                                // Recording thread auto-stopped due to silence — only stop if still recording
                                if let Some(ms) = ah_auto.try_state::<std::sync::Arc<std::sync::Mutex<audio::MeetingState>>>() {
                                    let s = ms.lock().unwrap();
                                    if !s.is_recording {
                                        println!("[Meeting] Monitor: auto-stop flag set but already stopped, exiting");
                                        break;
                                    }
                                }
                                println!("[Meeting] Auto-stop detected — triggering stop");
                                let rt = tokio::runtime::Builder::new_current_thread()
                                    .enable_all()
                                    .build();
                                if let Ok(rt) = rt {
                                    rt.block_on(toggle_meeting(ah_auto));
                                }
                                break;
                            }
                        }
                    });
                }
            }
            Err(e) => {
                eprintln!("[Meeting] Failed to start recording: {}", e);
                let _ = app_handle.notification()
                    .builder()
                    .title("Meeting failed")
                    .body(&e)
                    .show();
            }
        }
    }
}

/// Save the current text selection to Reattend (local database).
async fn save_selection(app_handle: tauri::AppHandle) {
    platform::platform_simulate_copy();
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

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

    let db = match app_handle.try_state::<std::sync::Arc<db::Database>>() {
        Some(d) => d,
        None => return,
    };

    let meta = serde_json::json!({
        "capture_type": "selection",
        "source": "manual_selection",
    });
    let preview = if clip_text.len() > 60 {
        format!("{}...", &clip_text[..57])
    } else {
        clip_text.clone()
    };

    match db.insert_raw_item(&clip_text, "selection", None, Some(&meta.to_string())) {
        Ok(raw_id) => {
            let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
            let _ = db.queue_job("triage", &payload);
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

/// Check if cleaned OCR text has enough signal to be worth triaging.
/// Prevents sending noise to the LLM and wasting API calls.
fn is_quality_content(text: &str) -> bool {
    let word_count = text.split_whitespace().count();
    // Need at least 8 words of content
    if word_count < 8 { return false; }

    // Calculate ratio of "real words" (>2 chars, mostly alphabetic) vs short fragments
    let real_words = text.split_whitespace()
        .filter(|w| w.len() > 2 && w.chars().filter(|c| c.is_alphabetic()).count() > w.len() / 2)
        .count();
    let real_ratio = real_words as f64 / word_count as f64;
    if real_ratio < 0.3 { return false; }

    // For longer text (30+ words), always accept — enough content for the AI to triage
    if word_count >= 30 { return true; }

    // For shorter text, check for sentence-like structure or coherent phrases
    let has_sentences = text.contains(". ") || text.contains("? ") || text.contains("! ")
        || text.contains(": ") || text.contains("— ") || text.contains(" - ");
    let longest_word_run = text.split(|c: char| !c.is_alphabetic() && c != ' ' && c != '\'')
        .map(|s| s.split_whitespace().count())
        .max()
        .unwrap_or(0);

    // Must have either sentence structure or at least one run of 5+ coherent words
    if !has_sentences && longest_word_run < 5 { return false; }

    true
}

/// Max ambient captures per hour to prevent flooding the memory store.
const MAX_AMBIENT_CAPTURES_PER_HOUR: u32 = 30;
/// Minimum seconds between ambient popups during meetings
const MEETING_POPUP_COOLDOWN_SECS: u64 = 45;

/// Check if a meeting is currently being recorded
fn is_meeting_active(app: &tauri::AppHandle) -> bool {
    app.try_state::<std::sync::Arc<std::sync::Mutex<audio::MeetingState>>>()
        .map(|s| s.lock().unwrap().is_recording)
        .unwrap_or(false)
}

/// Background "Passive Second Brain" loop — now stores locally.
async fn passive_capture_loop(app_handle: tauri::AppHandle) {
    println!("[Capture] Passive capture loop started");
    let mut last_clipboard_text = String::new();
    let mut last_app_name = String::new();
    let mut ticks: u32 = 0;
    let mut per_app_text: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut last_capture_text: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut captures_this_hour: u32 = 0;
    let mut hour_start = std::time::Instant::now();

    // Ambient recall: in-memory embedding cache + dedup
    let embedding_cache: std::sync::Arc<tokio::sync::RwLock<Vec<(String, Vec<f64>)>>> =
        std::sync::Arc::new(tokio::sync::RwLock::new(Vec::new()));
    let mut embedding_cache_age: u32 = u32::MAX; // force refresh on first use
    let recently_shown: std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::new()));
    // Track last popup time for meeting cooldown
    let last_popup_epoch = std::sync::Arc::new(std::sync::atomic::AtomicI64::new(0));

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        ticks += 1;

        let db = match app_handle.try_state::<std::sync::Arc<db::Database>>() {
            Some(d) => d,
            None => continue,
        };

        // Reset hourly capture counter
        if hour_start.elapsed() >= std::time::Duration::from_secs(3600) {
            captures_this_hour = 0;
            hour_start = std::time::Instant::now();
        }

        // --- Signal 1: Clipboard capture (every ~6s) ---
        if ticks % 3 == 0 {
            if let Some(clip_text) = platform::platform_read_clipboard() {
                if clip_text != last_clipboard_text {
                    last_clipboard_text = clip_text.clone();
                    if clip_text.split_whitespace().count() >= 5 && clip_text.len() >= 30 {
                        let meta = serde_json::json!({
                            "capture_type": "clipboard",
                            "app_name": &last_app_name,
                        });
                        if let Ok(raw_id) = db.insert_raw_item(&clip_text, "tray_clipboard", None, Some(&meta.to_string())) {
                            let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
                            let _ = db.queue_job("triage", &payload);
                        }
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
                    let next_ocr = if is_productive_app(&last_app_name) { 9 } else { 29 };
                    ticks = next_ocr;
                } else {
                    last_app_name = current_app;
                }
            }
        }

        // --- Signal 3: OCR screen capture (dynamic interval) ---
        let in_meeting = is_meeting_active(&app_handle);
        let ocr_interval: u32 = if in_meeting {
            4 // Every 8s during meetings (more responsive)
        } else if is_productive_app(&last_app_name) {
            10
        } else {
            30
        };
        if ticks % ocr_interval == 0 {
            let verbose = ticks <= 50; // Detailed logging for first ~100s after launch

            let ocr_result = match platform::platform_capture_screen_ocr(&app_handle).await {
                Ok(v) => {
                    // Reset failure counter on success
                    let prev_fails = CAPTURE_FAIL_COUNT.swap(0, std::sync::atomic::Ordering::SeqCst);
                    if prev_fails >= 5 {
                        println!("[Capture] OCR recovered after {} consecutive failures", prev_fails);
                        CAPTURE_BROKEN_NOTIFIED.store(false, std::sync::atomic::Ordering::SeqCst);
                        let _ = app_handle.emit("capture_health", serde_json::json!({
                            "status": "healthy",
                            "message": "Screen capture recovered"
                        }));
                    }
                    v
                }
                Err(e) => {
                    let fail_count = CAPTURE_FAIL_COUNT.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    // Always log during startup; periodic log + every 5th failure after
                    if verbose || fail_count % 5 == 0 {
                        eprintln!("[Capture] OCR failed (tick {}, consecutive fails: {}): {}", ticks, fail_count, e);
                    }
                    // After 5 consecutive failures, notify user (once)
                    if fail_count == 5 && !CAPTURE_BROKEN_NOTIFIED.load(std::sync::atomic::Ordering::SeqCst) {
                        CAPTURE_BROKEN_NOTIFIED.store(true, std::sync::atomic::Ordering::SeqCst);
                        eprintln!("[Capture] ALERT: {} consecutive OCR failures — screen capture is broken", fail_count);
                        let msg = if cfg!(target_os = "macos") {
                            "Screen capture not working. Check Screen Recording permission in System Settings."
                        } else {
                            "Screen capture not working. Check your internet connection — Windows uses server-side OCR."
                        };
                        let _ = app_handle.emit("capture_health", serde_json::json!({
                            "status": "broken",
                            "message": msg,
                            "fail_count": fail_count
                        }));
                        let notif_body = if cfg!(target_os = "macos") {
                            "Screen Recording permission may have been revoked. Click to fix in System Settings."
                        } else {
                            "Screen capture is failing. Check your internet connection."
                        };
                        let _ = app_handle.notification()
                            .builder()
                            .title("Reattend: Screen Capture Stopped")
                            .body(notif_body)
                            .show();
                    }
                    // Every 50 failures, re-notify (in case user missed it)
                    if fail_count > 0 && fail_count % 50 == 0 {
                        let _ = app_handle.notification()
                            .builder()
                            .title("Reattend: Still Can't Capture")
                            .body("Screen capture has failed {} times. Grant Screen Recording permission in System Settings.")
                            .show();
                    }
                    continue;
                }
            };

            let raw_text = ocr_result["text"].as_str().unwrap_or("").to_string();
            let app_name = ocr_result["appName"].as_str().unwrap_or("Unknown").to_string();

            if verbose {
                println!("[Capture] tick={} app=\"{}\" text_len={}", ticks, app_name, raw_text.len());
            }

            let app_switched = app_name != last_app_name && !last_app_name.is_empty();
            last_app_name = app_name.clone();

            if should_skip_app(&app_name) {
                if verbose {
                    println!("[Capture] Skipped app: {}", app_name);
                }
                continue;
            }

            let cleaned = clean_ocr_text(&raw_text);

            // Quality gate: reject noise before wasting LLM calls
            if !is_quality_content(&cleaned) {
                if verbose {
                    let word_count = cleaned.split_whitespace().count();
                    println!("[Capture] Quality gate rejected: {} words from {}", word_count, app_name);
                }
                continue;
            }
            if verbose {
                let word_count = cleaned.split_whitespace().count();
                println!("[Capture] Quality PASSED: {} words from {} — processing", word_count, app_name);
            }

            // Writing detection via text deltas
            let mut writing_assist_fired = false;
            if is_productive_app(&app_name) {
                let prev_text = per_app_text.get(&app_name).cloned().unwrap_or_default();
                if !prev_text.is_empty() {
                    let delta = extract_delta_text(&prev_text, &cleaned);
                    if is_quality_content(&delta) {
                        let delta_text = if delta.len() > 2000 {
                            delta.chars().take(2000).collect::<String>()
                        } else {
                            delta.clone()
                        };
                        let meta = serde_json::json!({
                            "capture_type": "writing",
                            "app_name": &app_name,
                        });
                        if captures_this_hour < MAX_AMBIENT_CAPTURES_PER_HOUR {
                            if let Ok(raw_id) = db.insert_raw_item(&delta_text, "tray_writing", None, Some(&meta.to_string())) {
                                let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
                                let _ = db.queue_job("triage", &payload);
                                captures_this_hour += 1;
                            }
                        }

                        // Writing assist: check if written text has factual errors or contradicts memories
                        if delta_text.split_whitespace().count() >= 15 && ai::is_embedder_ready() {
                            writing_assist_fired = true;
                            let writing_text = delta_text.clone();
                            let writing_handle = app_handle.clone();
                            let w_cache = std::sync::Arc::clone(&embedding_cache);
                            let w_shown = std::sync::Arc::clone(&recently_shown);
                            let w_db = std::sync::Arc::clone(&*db);
                            let w_popup_epoch = std::sync::Arc::clone(&last_popup_epoch);

                            tauri::async_runtime::spawn(async move {
                                let query_text = if writing_text.len() > 500 { &writing_text[..500] } else { &writing_text };
                                let query_vec = match ai::embed_query(query_text).await {
                                    Ok(v) => v,
                                    Err(_) => return,
                                };

                                let cached = w_cache.read().await;
                                if cached.is_empty() { return; }

                                let mut sims: Vec<(String, f64)> = cached.iter()
                                    .map(|(id, vec)| (id.clone(), ai::cosine_similarity(&query_vec, vec)))
                                    .filter(|(_, s)| *s > 0.60) // higher threshold for writing — only very relevant
                                    .collect();
                                drop(cached);
                                sims.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                                let top: Vec<(String, f64)> = sims.into_iter().take(3).collect();
                                if top.is_empty() { return; }

                                // Dedup
                                let key = format!("w:{}", top.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>().join(","));
                                {
                                    let mut shown = w_shown.lock().await;
                                    if shown.contains(&key) { return; }
                                    shown.insert(key);
                                    if shown.len() > 50 { shown.clear(); }
                                }

                                // Cooldown check
                                let last = w_popup_epoch.load(std::sync::atomic::Ordering::Relaxed);
                                let now_e = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
                                if now_e - last < 30 { return; } // 30s cooldown for writing assist

                                let records: Vec<(String, String, Option<String>, Option<String>, String)> = top.iter()
                                    .filter_map(|(id, _)| w_db.get_record(id).ok().map(|r| (r.id, r.title, r.summary, r.content, r.record_type)))
                                    .collect();
                                if records.is_empty() { return; }

                                let ai_provider = w_db.get_config("ai_provider").unwrap_or_else(|| "server".to_string());
                                let client = if ai_provider == "server" {
                                    let server_url = w_db.get_config("server_url").unwrap_or_else(|| "https://www.reattend.com".to_string());
                                    let device_id = w_db.get_config("device_id").unwrap_or_default();
                                    let auth_token = w_db.get_config("auth_token").unwrap_or_default();
                                    ai::AiClient::new_server(&server_url, &device_id, &auth_token)
                                } else if ai_provider == "groq" {
                                    let key = w_db.get_config("groq_api_key").unwrap_or_default();
                                    ai::AiClient::new_groq(&key)
                                } else {
                                    let url = w_db.get_config("ollama_url").unwrap_or_else(|| "http://localhost:11434".to_string());
                                    let model = w_db.get_config("ollama_model").unwrap_or_else(|| "llama3.2:3b".to_string());
                                    ai::AiClient::new_ollama(&url, &model)
                                };

                                let synthesis = match tokio::time::timeout(
                                    tokio::time::Duration::from_secs(15),
                                    client.synthesize_writing_assist(&writing_text, &records)
                                ).await {
                                    Ok(Ok(s)) => s,
                                    _ => return,
                                };

                                if !synthesis.show || synthesis.insight.is_empty() { return; }

                                w_popup_epoch.store(now_e, std::sync::atomic::Ordering::Relaxed);

                                let cat = if synthesis.category.is_empty() { "context".to_string() } else { synthesis.category.clone() };
                                println!("[Writing Assist] Showing [{}]: {}...", cat, &synthesis.insight[..60.min(synthesis.insight.len())]);
                                let popup_data = serde_json::json!({
                                    "insight": synthesis.insight,
                                    "sources": synthesis.sources,
                                    "category": cat,
                                    "corrections": synthesis.corrections,
                                    "writing_assist": true,
                                });
                                let popup_json = serde_json::to_string(&popup_data).unwrap_or_default();
                                let encoded = urlencoding::encode(&popup_json);
                                let popup_url = format!("/?data={}", encoded);
                                create_ambient_popup(&writing_handle, &popup_url);
                            });
                        }
                    }
                }
                per_app_text.insert(app_name.clone(), cleaned.clone());
            }

            // Skip if text hasn't changed significantly (per-app dedup)
            // Note: per_app_text was already updated above for writing detection,
            // so we use a separate dedup map.
            let dedup_threshold = if is_productive_app(&app_name) { 0.55 } else { 0.75 };
            let prev_ocr = last_capture_text.get(&app_name).cloned().unwrap_or_default();
            let similarity = text_similarity(&prev_ocr, &cleaned);
            if similarity > dedup_threshold && !app_switched {
                if verbose {
                    println!("[Capture] Dedup skipped: {:.0}% similar to last {} capture", similarity * 100.0, app_name);
                }
                continue;
            }

            // Rate limit: max N captures per hour
            if captures_this_hour >= MAX_AMBIENT_CAPTURES_PER_HOUR {
                if verbose {
                    println!("[Capture] Rate limited: {} captures this hour", captures_this_hour);
                }
                continue;
            }

            let capture_text = if cleaned.len() > 3000 {
                cleaned.chars().take(3000).collect::<String>()
            } else {
                cleaned.clone()
            };

            // Capture: store locally → queue triage
            {
                let meta = serde_json::json!({
                    "capture_type": "screen",
                    "app_name": &app_name,
                });
                if let Ok(raw_id) = db.insert_raw_item(&capture_text, "tray_ocr", None, Some(&meta.to_string())) {
                    let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
                    let _ = db.queue_job("triage", &payload);
                    captures_this_hour += 1;
                    CAPTURE_SUCCESS_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    last_capture_text.insert(app_name.clone(), cleaned.clone());
                    println!("[Capture] Stored screen capture #{} from {} ({} words)", captures_this_hour, app_name, capture_text.split_whitespace().count());
                }
            }

            // Detect "reattend" keyword in captured text (triggers enhanced search)
            let keyword_triggered = capture_text.to_lowercase().contains("reattend");

            // Ambient recall: semantic search for related memories
            // Skip if writing assist already fired (they share the same popup window)
            if !writing_assist_fired {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                let snoozed_until = SNOOZE_UNTIL.load(std::sync::atomic::Ordering::SeqCst);
                // During meetings or keyword trigger, bypass snooze
                let snooze_ok = now >= snoozed_until || in_meeting || keyword_triggered;
                if snooze_ok && ai::is_embedder_ready() {
                    // Refresh embedding cache every ~60 ticks (~2 min) or on first use
                    if embedding_cache_age > 60 {
                        if let Ok(fresh) = db.get_all_embeddings() {
                            let mut cache = embedding_cache.blocking_write();
                            *cache = fresh;
                            embedding_cache_age = 0;
                        }
                    }
                    embedding_cache_age += 1;

                    let recall_text = capture_text.clone();
                    let recall_handle = app_handle.clone();
                    let cache_ref = std::sync::Arc::clone(&embedding_cache);
                    let shown_ref = std::sync::Arc::clone(&recently_shown);
                    let recall_db = std::sync::Arc::clone(&*db);
                    let popup_epoch_ref = std::sync::Arc::clone(&last_popup_epoch);

                    let is_meeting_mode = in_meeting;
                    let is_keyword = keyword_triggered;
                    tauri::async_runtime::spawn(async move {
                        // Truncate to ~500 chars for embedding (enough for semantic matching)
                        let query_text = if recall_text.len() > 500 {
                            &recall_text[..500]
                        } else {
                            &recall_text
                        };

                        let query_vec = match ai::embed_query(query_text).await {
                            Ok(v) => v,
                            Err(_) => return,
                        };

                        let cached = cache_ref.read().await;
                        if cached.is_empty() { return; }

                        // Lower threshold during meetings (0.45) or keyword trigger (0.40) vs normal (0.55)
                        let threshold = if is_keyword { 0.40 } else if is_meeting_mode { 0.45 } else { 0.55 };

                        let mut similarities: Vec<(String, f64)> = cached
                            .iter()
                            .map(|(id, vec)| (id.clone(), ai::cosine_similarity(&query_vec, vec)))
                            .filter(|(_, sim)| *sim > threshold)
                            .collect();
                        drop(cached);
                        similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

                        let top: Vec<(String, f64)> = similarities.into_iter().take(3).collect();
                        if top.is_empty() { return; }

                        // Dedup: skip if we recently showed the same set of memories
                        let top_key = top.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>().join(",");
                        {
                            let mut shown = shown_ref.lock().await;
                            if shown.contains(&top_key) { return; }
                            shown.insert(top_key);
                            // Keep set bounded — clear if too large
                            if shown.len() > 50 { shown.clear(); }
                        }

                        // Fetch full records for synthesis
                        let records: Vec<(String, String, Option<String>, Option<String>, String)> = top
                            .iter()
                            .filter_map(|(id, _)| {
                                recall_db.get_record(id).ok().map(|r| {
                                    (r.id, r.title, r.summary, r.content, r.record_type)
                                })
                            })
                            .collect();

                        if records.is_empty() { return; }

                        // Create AI client for synthesis
                        let ai_provider = recall_db.get_config("ai_provider").unwrap_or_else(|| "server".to_string());
                        let client = if ai_provider == "server" {
                            let server_url = recall_db.get_config("server_url")
                                .unwrap_or_else(|| "https://www.reattend.com".to_string());
                            let device_id = recall_db.get_config("device_id").unwrap_or_default();
                            let auth_token = recall_db.get_config("auth_token").unwrap_or_default();
                            ai::AiClient::new_server(&server_url, &device_id, &auth_token)
                        } else if ai_provider == "groq" {
                            let key = recall_db.get_config("groq_api_key").unwrap_or_default();
                            ai::AiClient::new_groq(&key)
                        } else {
                            let url = recall_db.get_config("ollama_url").unwrap_or_else(|| "http://localhost:11434".to_string());
                            let model = recall_db.get_config("ollama_model").unwrap_or_else(|| "llama3.2:3b".to_string());
                            ai::AiClient::new_ollama(&url, &model)
                        };

                        // Synthesize insight via LLM (with timeout)
                        let synthesis = match tokio::time::timeout(
                            tokio::time::Duration::from_secs(15),
                            client.synthesize_ambient(&recall_text, &records)
                        ).await {
                            Ok(Ok(s)) => s,
                            Ok(Err(e)) => {
                                println!("[Ambient] Synthesis error: {}", e);
                                return;
                            }
                            Err(_) => {
                                println!("[Ambient] Synthesis timed out");
                                return;
                            }
                        };

                        // During meetings or keyword trigger: always show if LLM says show,
                        // or if similarity was very high (>0.7) even if LLM says no
                        let force_show = (is_meeting_mode || is_keyword) && top.first().map(|(_, s)| *s > 0.7).unwrap_or(false);
                        if !force_show && (!synthesis.show || synthesis.insight.is_empty()) {
                            println!("[Ambient] LLM decided not to show (not relevant enough)");
                            return;
                        }

                        // If LLM said no but we're forcing, use a simple fallback insight
                        let insight = if synthesis.insight.is_empty() || (!synthesis.show && force_show) {
                            let titles: Vec<String> = records.iter().map(|(_, t, _, _, _)| t.clone()).collect();
                            format!("Related context from your memories: {}", titles.join(", "))
                        } else {
                            synthesis.insight
                        };

                        // Popup cooldown: don't spam during meetings
                        if is_meeting_mode {
                            let last = popup_epoch_ref.load(std::sync::atomic::Ordering::Relaxed);
                            let now_epoch = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
                            if now_epoch - last < MEETING_POPUP_COOLDOWN_SECS as i64 {
                                println!("[Ambient] Skipping popup — cooldown ({} secs remaining)", MEETING_POPUP_COOLDOWN_SECS as i64 - (now_epoch - last));
                                return;
                            }
                        }

                        println!("[Ambient] Showing synthesized insight: {}...", &insight[..80.min(insight.len())]);

                        // Update popup cooldown
                        let now_epoch = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
                        popup_epoch_ref.store(now_epoch, std::sync::atomic::Ordering::Relaxed);

                        let popup_data = serde_json::json!({
                            "insight": insight,
                            "sources": synthesis.sources,
                            "meeting_mode": is_meeting_mode,
                        });
                        let popup_json = serde_json::to_string(&popup_data).unwrap_or_default();
                        let encoded = urlencoding::encode(&popup_json);
                        let popup_url = format!("/?data={}", encoded);
                        create_ambient_popup(&recall_handle, &popup_url);
                    });
                }
            }
        }
    }
}

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

fn create_ambient_popup(app: &tauri::AppHandle, url: &str) {
    let app_clone = app.clone();
    let url = url.to_string();
    let width = 360.0_f64;
    // Auto-size: taller when corrections are present (detected by URL content)
    let has_corrections = url.contains("corrections");
    let height = if has_corrections { 340.0_f64 } else { 260.0_f64 };
    let margin = 16.0_f64;

    let _ = app.run_on_main_thread(move || {
        let app = app_clone;

        if let Some(window) = app.get_webview_window("ambient") {
            let _ = window.close();
        }

        let (x, y) = if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let screen_w = size.width as f64 / scale;
            let screen_h = size.height as f64 / scale;
            (screen_w - width - margin, screen_h - height - margin - 40.0)
        } else {
            (1200.0, 600.0)
        };

        // Don't call platform_activate_app() — ambient popup should NOT steal focus
        if let Ok(window) = WebviewWindowBuilder::new(&app, "ambient", WebviewUrl::App(url.into()))
            .title("Reattend")
            .inner_size(width, height)
            .position(x, y)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .visible(true)
            .focused(false)
            .build()
        {
            // Just elevate above other windows, don't grab focus
            platform::platform_elevate_window(&window);
        }
    });
}

/// Show meeting result window after transcription + triage completes.
fn create_meeting_result_window(app: &tauri::AppHandle, url: &str) {
    let app_clone = app.clone();
    let url = url.to_string();
    let width = 420.0_f64;
    let height = 480.0_f64;

    let _ = app.run_on_main_thread(move || {
        let app = app_clone;

        if let Some(window) = app.get_webview_window("meeting-result") {
            let _ = window.close();
        }

        let (x, y) = if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let screen_w = size.width as f64 / scale;
            let screen_h = size.height as f64 / scale;
            ((screen_w - width) / 2.0, (screen_h - height) / 2.0)
        } else {
            (400.0, 200.0)
        };

        platform::platform_activate_app();

        if let Ok(window) = WebviewWindowBuilder::new(&app, "meeting-result", WebviewUrl::App(url.into()))
            .title("Meeting Summary — Reattend")
            .inner_size(width, height)
            .position(x, y)
            .resizable(true)
            .decorations(true)
            .always_on_top(true)
            .visible(true)
            .build()
        {
            let _ = window.set_focus();
        }
    });
}

/// Open the full Reattend app in a main window (local React frontend).
fn create_main_window(app: &tauri::AppHandle) {
    let app_clone = app.clone();
    let _ = app.run_on_main_thread(move || {
        let app = app_clone;

        // Activate the app first (brings to foreground on macOS)
        platform::platform_activate_app();
        platform::platform_show_in_dock();

        // If already open, focus it
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            return;
        }

        // Load the local React frontend (not an external URL)
        if let Ok(window) = WebviewWindowBuilder::new(
            &app,
            "main",
            WebviewUrl::App("/".into()),
        )
        .title("Reattend")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(false)
        .center()
        .visible(true)
        .build()
        {
            let _ = window.set_focus();
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

/// Check for app updates from Rust side. Emits "update_available" event to all windows.
async fn check_for_updates_rust(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    let version = update.version.clone();
                    let notes = update.body.clone().unwrap_or_default();
                    println!("[Updater] Update available: v{} — {}", version, notes);
                    // Store in a global so the frontend can pick it up via command
                    *UPDATE_INFO.lock().unwrap() = Some((version.clone(), notes.clone()));
                    // Also emit event in case a window is already open
                    let _ = app.emit("update_available", serde_json::json!({
                        "version": version,
                        "notes": notes,
                    }));
                }
                Ok(None) => {
                    println!("[Updater] App is up to date");
                }
                Err(e) => {
                    println!("[Updater] Check failed: {}", e);
                }
            }
        }
        Err(e) => {
            println!("[Updater] Could not create updater: {}", e);
        }
    }
}

/// Global storage for pending update info (version, notes)
static UPDATE_INFO: std::sync::Mutex<Option<(String, String)>> = std::sync::Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_records,
            commands::get_record,
            commands::create_record,
            commands::update_record,
            commands::delete_record,
            commands::search_records,
            commands::get_entities,
            commands::get_record_entities,
            commands::get_record_links,
            commands::get_graph_data,
            commands::get_board,
            commands::save_board,
            commands::get_chat_threads,
            commands::create_chat_thread,
            commands::get_chat_messages,
            commands::send_chat_message,
            commands::get_dashboard_stats,
            commands::get_today_briefing,
            commands::capture_text,
            commands::snooze_ambient,
            commands::run_ocr_capture,
            commands::ask_ai,
            commands::ask_ai_stream,
            commands::get_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_project_records,
            commands::get_record_project,
            commands::add_record_to_project,
            commands::remove_record_from_project,
            commands::get_raw_items,
            commands::get_raw_items_count,
            commands::update_raw_item_status,
            commands::run_triage_on_item,
            commands::run_triage_all_pending,
            commands::get_notifications,
            commands::get_notification_count,
            commands::mark_notification_done,
            commands::get_recent_jobs,
            commands::get_job_counts,
            commands::run_manual_relink,
            commands::run_rebuild_embeddings,
            commands::test_ai_connection,
            commands::delete_chat_thread,
            commands::get_config_value,
            commands::set_config_value,
            commands::get_usage_stats,
            commands::connect_token,
            commands::check_screen_permission,
            commands::open_privacy_settings,
            commands::start_meeting,
            commands::stop_meeting,
            commands::get_meeting_status,
            commands::check_mic_permission,
            commands::get_update_info,
            commands::install_update,
            commands::get_capture_health,
            commands::open_screen_recording_settings,
        ])
        .setup(|app| {
            // Initialize local database (Arc for shared access with worker)
            let database = std::sync::Arc::new(
                db::Database::open().expect("Failed to open local database")
            );

            // Generate device_id on first run (used for anonymous metering)
            if database.get_config("device_id").is_none() {
                let device_id = uuid::Uuid::new_v4().to_string();
                let _ = database.set_config("device_id", &device_id);
                let _ = database.set_config("server_url", "https://www.reattend.com");
                let _ = database.set_config("ai_provider", "server");
                println!("[Init] Generated device_id: {}", device_id);
            }

            // Migrate: fix bare domain → www (301 redirects break POST requests)
            if let Some(url) = database.get_config("server_url") {
                if url == "https://reattend.com" {
                    let _ = database.set_config("server_url", "https://www.reattend.com");
                    println!("[Init] Migrated server_url to www.reattend.com");
                }
            }

            // Initialize local embedding model (downloads ~130MB on first run, then cached)
            let models_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("com.reattend.desktop")
                .join("models");
            let _ = std::fs::create_dir_all(&models_dir);
            println!("[Init] Embedding model cache dir: {:?}", models_dir);
            tauri::async_runtime::spawn_blocking(move || {
                println!("[Init] Starting embedding model download/load...");
                match ai::init_local_embedder(models_dir) {
                    Ok(()) => println!("[Init] Embedding model ready!"),
                    Err(e) => eprintln!("[Init] FAILED to init embedding model: {}", e),
                }
            });

            let worker_db = database.clone();
            let deep_link_db = database.clone();
            app.manage(database);

            // Meeting mode state
            app.manage(std::sync::Arc::new(std::sync::Mutex::new(audio::MeetingState::default())));

            // Handle deep links (reattend://auth/callback?... or reattend://share/TOKEN)
            let deep_link_handle = app.handle().clone();
            let share_link_db = deep_link_db.clone();
            app.listen("deep-link://new-url", move |event| {
                let url_str = event.payload().trim_matches('"');
                if let Ok(url) = url::Url::parse(url_str) {
                    let host = url.host_str().unwrap_or("");
                    let path = url.path();

                    if host == "auth" && path == "/callback" {
                        // Auth callback
                        let params: std::collections::HashMap<String, String> =
                            url.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();

                        if let Some(token) = params.get("token") {
                            let _ = deep_link_db.set_config("auth_token", token);
                            if let Some(email) = params.get("email") {
                                let _ = deep_link_db.set_config("user_email", email);
                            }
                            if let Some(name) = params.get("name") {
                                let _ = deep_link_db.set_config("user_name", name);
                            }
                            let _ = deep_link_db.set_config("ai_provider", "server");

                            let _ = deep_link_handle.emit("auth-complete", serde_json::json!({
                                "email": params.get("email").cloned().unwrap_or_default(),
                                "name": params.get("name").cloned().unwrap_or_default(),
                                "tier": "registered",
                            }));
                            println!("[Auth] Desktop login complete: {}", params.get("email").unwrap_or(&String::new()));
                        }
                    } else if host == "share" {
                        // Share import: reattend://share/TOKEN
                        let token = path.trim_start_matches('/');
                        if token.is_empty() { return; }
                        let token = token.to_string();
                        let db = share_link_db.clone();
                        let handle = deep_link_handle.clone();
                        let server_url = db.get_config("server_url")
                            .unwrap_or_else(|| "https://www.reattend.com".to_string());

                        std::thread::spawn(move || {
                            let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
                                Ok(rt) => rt,
                                Err(_) => return,
                            };
                            rt.block_on(async {
                                let url = format!("{}/api/tray/proxy/share/{}", server_url, token);
                                let client = reqwest::Client::new();
                                let res = match client.get(&url).send().await {
                                    Ok(r) => r,
                                    Err(e) => {
                                        eprintln!("[Share Import] Fetch failed: {}", e);
                                        return;
                                    }
                                };
                                if !res.status().is_success() {
                                    eprintln!("[Share Import] Server returned {}", res.status());
                                    return;
                                }
                                let data: serde_json::Value = match res.json().await {
                                    Ok(d) => d,
                                    Err(e) => {
                                        eprintln!("[Share Import] Parse failed: {}", e);
                                        return;
                                    }
                                };

                                let title = data["title"].as_str().unwrap_or("Shared Note");
                                let summary = data["summary"].as_str();
                                let content = data["content"].as_str();
                                let record_type = data["record_type"].as_str().unwrap_or("note");
                                let tags = if data["tags"].is_array() {
                                    Some(data["tags"].to_string())
                                } else { None };
                                let meta = if data["meta"].is_object() {
                                    Some(data["meta"].to_string())
                                } else { None };

                                match db.insert_record(
                                    record_type,
                                    title,
                                    summary,
                                    content,
                                    None,
                                    tags.as_deref(),
                                    Some("shared"),
                                    meta.as_deref(),
                                    None,
                                ) {
                                    Ok(record_id) => {
                                        // Queue embedding
                                        let _ = db.queue_job("embed", &serde_json::json!({ "record_id": record_id }).to_string());
                                        println!("[Share Import] Created record {} from token {}", record_id, token);
                                        // Navigate frontend to the new memory
                                        let _ = handle.emit("navigate", serde_json::json!({
                                            "path": format!("/memories/{}", record_id),
                                        }));
                                    }
                                    Err(e) => {
                                        eprintln!("[Share Import] Insert failed: {}", e);
                                    }
                                }
                            });
                        });
                    }
                }
            });

            // Platform-specific startup
            platform::platform_hide_from_dock();
            platform::platform_store_app_handle(&app.handle());
            platform::platform_register_context_menu();

            // Check screen capture permission on startup (macOS)
            #[cfg(target_os = "macos")]
            {
                let has_permission = platform::platform_check_screen_permission();
                if !has_permission {
                    eprintln!("[Init] Screen Recording permission not granted — requesting access");
                    platform::platform_request_screen_permission();
                    let _ = app.handle().emit("screen_permission_needed", serde_json::json!({
                        "reason": "Screen Recording permission is not granted."
                    }));
                    // Show macOS notification so user knows even without opening the app
                    let _ = app.handle().notification()
                        .builder()
                        .title("Reattend Needs Screen Recording Permission")
                        .body("Grant access in System Settings > Privacy & Security > Screen Recording to start capturing.")
                        .show();
                } else {
                    println!("[Init] Screen Recording permission granted");
                    // Do a quick test capture to verify it actually works (permission can be stale)
                    let test_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        match platform::platform_capture_screen_ocr(&test_handle).await {
                            Ok(v) => {
                                let text_len = v["text"].as_str().unwrap_or("").len();
                                println!("[Init] Screen capture test passed ({} chars)", text_len);
                            }
                            Err(e) => {
                                eprintln!("[Init] Screen capture test FAILED despite permission granted: {}", e);
                                CAPTURE_BROKEN_NOTIFIED.store(true, std::sync::atomic::Ordering::SeqCst);
                                CAPTURE_FAIL_COUNT.store(5, std::sync::atomic::Ordering::SeqCst);
                                let msg = if cfg!(target_os = "macos") {
                                    "Screen capture not working. Try toggling Screen Recording permission off and on in System Settings."
                                } else {
                                    "Screen capture not working. Check your internet connection — Windows uses server-side OCR."
                                };
                                let _ = test_handle.emit("capture_health", serde_json::json!({
                                    "status": "broken",
                                    "message": msg
                                }));
                                let notif_body = if cfg!(target_os = "macos") {
                                    "Try toggling Screen Recording permission off and on in System Settings, then restart Reattend."
                                } else {
                                    "Screen capture is failing. Check your internet connection and restart Reattend."
                                };
                                let _ = test_handle.notification()
                                    .builder()
                                    .title("Reattend: Screen Capture Not Working")
                                    .body(notif_body)
                                    .show();
                            }
                        }
                    });
                }
            }

            // Build tray menu
            let shortcut_prefix = platform::platform_shortcut_display();
            let open_main = MenuItem::with_id(
                app, "open_main",
                &format!("Open Reattend  {}O", shortcut_prefix),
                true, None::<&str>
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit Reattend", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "Quick Capture", true, None::<&str>)?;
            let save_sel = MenuItem::with_id(
                app, "save_selection",
                &format!("Save Selection  {}S", shortcut_prefix),
                true, None::<&str>
            )?;
            let ask = MenuItem::with_id(app, "ask", "Ask AI", true, None::<&str>)?;
            let meeting = MenuItem::with_id(
                app, "meeting",
                &format!("Start Meeting  {}M", shortcut_prefix),
                true, None::<&str>
            )?;
            let meeting_notes = MenuItem::with_id(app, "meeting_notes", "Transcripts", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let sep3 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open_main, &sep1, &capture, &save_sel, &ask, &meeting, &meeting_notes, &sep2, &settings, &sep3, &quit])?;

            let icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                .expect("failed to load tray icon");
            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Reattend — Memory Layer")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "open_main" => {
                            create_main_window(app);
                        }
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
                        "meeting" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                toggle_meeting(handle).await;
                            });
                        }
                        "meeting_notes" => {
                            // Open main app and navigate to dedicated meetings page
                            create_main_window(app);
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                                use tauri::Emitter;
                                let _ = handle.emit("navigate", serde_json::json!({
                                    "path": "/transcripts"
                                }));
                            });
                        }
                        "settings" => {
                            create_window(app, "settings", "Settings", "/", 400.0, 360.0);
                        }
                        _ => {}
                    }
                });

            #[cfg(target_os = "macos")]
            { tray_builder = tray_builder.icon_as_template(false); }

            let _tray = tray_builder.build(app)?;

            // Register global shortcuts
            let app_handle = app.handle().clone();
            let modifier = platform::platform_shortcut_modifier() | tauri_plugin_global_shortcut::Modifiers::SHIFT;

            let capture_shortcut = Shortcut::new(Some(modifier), Code::KeyR);
            app.global_shortcut().on_shortcut(capture_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    create_window(&app_handle, "capture", "Quick Capture", "/", 480.0, 320.0);
                }
            })?;

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

            let ask_shortcut = Shortcut::new(Some(modifier), Code::KeyA);
            app.global_shortcut().on_shortcut(ask_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    create_window(&app_handle, "ask", "Ask AI", "/", 480.0, 400.0);
                }
            })?;

            let open_shortcut = Shortcut::new(Some(modifier), Code::KeyO);
            app.global_shortcut().on_shortcut(open_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    create_main_window(&app_handle);
                }
            })?;

            let meeting_shortcut = Shortcut::new(Some(modifier), Code::KeyM);
            app.global_shortcut().on_shortcut(meeting_shortcut, {
                let app_handle = app_handle.clone();
                move |_app, _shortcut, _event| {
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        toggle_meeting(handle).await;
                    });
                }
            })?;

            // Start passive capture loop
            let bg_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                passive_capture_loop(bg_handle).await;
            });

            // Start AI worker loop (embeddings are local via fastembed, LLM via server/groq/ollama)
            let ai_provider = worker_db.get_config("ai_provider").unwrap_or_else(|| "server".to_string());
            let server_url = worker_db.get_config("server_url")
                .unwrap_or_else(|| "https://www.reattend.com".to_string());
            let device_id = worker_db.get_config("device_id").unwrap_or_default();
            let auth_token = worker_db.get_config("auth_token").unwrap_or_default();
            let groq_key = worker_db.get_config("groq_api_key").unwrap_or_default();
            let ollama_url = worker_db.get_config("ollama_url")
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            let ollama_model = worker_db.get_config("ollama_model")
                .unwrap_or_else(|| "llama3.2:3b".to_string());
            let worker_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                worker::run_worker_loop(
                    worker_db, worker_handle, ai_provider, server_url, device_id, auth_token,
                    groq_key, ollama_url, ollama_model,
                ).await;
            });

            // Check for updates from Rust (works even without main window open)
            let update_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                // Wait 10s for app to fully start
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                check_for_updates_rust(update_handle).await;
            });

            // Listen for meeting result events → spawn result window
            let result_handle = app_handle.clone();
            app_handle.listen("meeting_result", move |event| {
                let payload_str = event.payload();
                // Validate it's valid JSON before opening window
                if serde_json::from_str::<serde_json::Value>(payload_str).is_err() {
                    return;
                }
                let encoded = urlencoding::encode(payload_str);
                let url = format!("/?data={}", encoded);
                create_meeting_result_window(&result_handle, &url);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::Destroyed = event {
                    platform::platform_hide_from_dock();
                }
            }
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
