#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>

// Safe wrappers for NSWindow/NSApplication operations.
// All ObjC exceptions are caught here so they never crash the Rust process.

void elevate_ns_window(void *ns_window_ptr) {
    @try {
        if (!ns_window_ptr) return;
        NSWindow *window = (__bridge NSWindow *)ns_window_ptr;
        // kCGScreenSaverWindowLevel (1000) + 1 — above fullscreen
        [window setLevel:1001];
        // fullScreenAuxiliary + moveToActiveSpace (NOT canJoinAllSpaces — mutually exclusive)
        NSWindowCollectionBehavior behavior =
            NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary;
        [window setCollectionBehavior:behavior];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] elevate_ns_window exception: %@", e);
    }
}

void activate_reattend_app(void) {
    @try {
        NSApplication *app = [NSApplication sharedApplication];
        [app activateIgnoringOtherApps:YES];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] activate_reattend_app exception: %@", e);
    }
}

// Simulate Cmd+C to copy the current selection to clipboard.
// Uses CGEvent for maximum compatibility across all apps.
void simulate_copy(void) {
    @try {
        CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
        if (!source) return;

        // Key down: Cmd+C
        CGEventRef keyDown = CGEventCreateKeyboardEvent(source, (CGKeyCode)kVK_ANSI_C, true);
        CGEventSetFlags(keyDown, kCGEventFlagMaskCommand);
        CGEventPost(kCGAnnotatedSessionEventTap, keyDown);
        CFRelease(keyDown);

        // Small delay for the target app to process
        usleep(50000); // 50ms

        // Key up: Cmd+C
        CGEventRef keyUp = CGEventCreateKeyboardEvent(source, (CGKeyCode)kVK_ANSI_C, false);
        CGEventSetFlags(keyUp, kCGEventFlagMaskCommand);
        CGEventPost(kCGAnnotatedSessionEventTap, keyUp);
        CFRelease(keyUp);

        CFRelease(source);
    } @catch (NSException *e) {
        NSLog(@"[Reattend] simulate_copy exception: %@", e);
    }
}

// ── macOS Services: "Save to Reattend" right-click menu ──────────────────

// Rust callback — declared in lib.rs as #[no_mangle] extern "C"
extern void handle_service_text(const char *text);

// Strong ref to keep the provider alive
static id _serviceProvider = nil;

@interface ReattendServiceProvider : NSObject
- (void)saveToReattend:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error;
@end

@implementation ReattendServiceProvider
- (void)saveToReattend:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error {
    NSString *text = [pboard stringForType:NSPasteboardTypeString];
    if (text && text.length > 0) {
        handle_service_text([text UTF8String]);
    }
}
@end

void register_services_provider(void) {
    @try {
        _serviceProvider = [[ReattendServiceProvider alloc] init];
        [NSApp setServicesProvider:_serviceProvider];
        NSUpdateDynamicServices();
    } @catch (NSException *e) {
        NSLog(@"[Reattend] register_services_provider exception: %@", e);
    }
}

// ── Screen Recording permission check (macOS 10.15+) ─────────────────────
// Uses CGPreflightScreenCaptureAccess which returns instantly without prompting.

bool check_screen_capture_permission(void) {
    if (@available(macOS 10.15, *)) {
        return CGPreflightScreenCaptureAccess();
    }
    return true; // pre-Catalina: no permission needed
}

// Request screen capture permission (shows the system prompt if never asked).
bool request_screen_capture_permission(void) {
    if (@available(macOS 10.15, *)) {
        return CGRequestScreenCaptureAccess();
    }
    return true;
}

// Open System Settings → Privacy & Security → Screen Recording
void open_screen_recording_settings(void) {
    @try {
        // macOS 13+ (Ventura) and later
        NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"];
        [[NSWorkspace sharedWorkspace] openURL:url];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] open_screen_recording_settings exception: %@", e);
    }
}

// Open System Settings → Privacy & Security → Microphone
void open_microphone_settings(void) {
    @try {
        NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"];
        [[NSWorkspace sharedWorkspace] openURL:url];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] open_microphone_settings exception: %@", e);
    }
}

// Get frontmost (active) application name via NSWorkspace.
// Returns a malloc'd C string that MUST be freed by the caller.
// This works correctly for tray/LSUIElement apps (unlike active_win_pos_rs).
char* get_frontmost_app_name(void) {
    @try {
        NSRunningApplication *app = [[NSWorkspace sharedWorkspace] frontmostApplication];
        if (app) {
            NSString *name = app.localizedName;
            if (!name) name = app.bundleIdentifier;
            if (name && name.length > 0) {
                return strdup([name UTF8String]);
            }
        }
    } @catch (NSException *e) {
        NSLog(@"[Reattend] get_frontmost_app_name exception: %@", e);
    }
    return NULL;
}

// Hide from Dock — equivalent to LSUIElement=true but works at runtime (for dev mode)
void hide_from_dock(void) {
    @try {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] hide_from_dock exception: %@", e);
    }
}

// Show in Dock — switch to Regular activation policy (when main window opens)
void show_in_dock(void) {
    @try {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        // Set process name so dock shows "Reattend" instead of binary name in dev mode
        [[NSProcessInfo processInfo] setProcessName:@"Reattend"];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] show_in_dock exception: %@", e);
    }
}
