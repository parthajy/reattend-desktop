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

// Hide from Dock — equivalent to LSUIElement=true but works at runtime (for dev mode)
void hide_from_dock(void) {
    @try {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
    } @catch (NSException *e) {
        NSLog(@"[Reattend] hide_from_dock exception: %@", e);
    }
}
