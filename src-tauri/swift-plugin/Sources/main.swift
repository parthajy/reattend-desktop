import Cocoa
import Vision
import CoreGraphics
import Foundation

// MARK: - Screen Capture + OCR CLI Tool
// Usage:
//   reattend-capture screenshot   → captures screen, runs OCR, prints JSON
//   reattend-capture active-app   → prints the name of the active application

struct CaptureResult: Codable {
    let text: String
    let appName: String
    let timestamp: String
    let confidence: Double
}

// MARK: - Screenshot

func captureScreen() -> CGImage? {
    // Capture the main display
    let displayID = CGMainDisplayID()
    guard let image = CGDisplayCreateImage(displayID) else {
        return nil
    }
    return image
}

// MARK: - OCR via Vision

func recognizeText(from image: CGImage) -> (String, Double) {
    let semaphore = DispatchSemaphore(value: 0)
    var resultText = ""
    var avgConfidence: Double = 0

    let request = VNRecognizeTextRequest { request, error in
        guard error == nil,
              let observations = request.results as? [VNRecognizedTextObservation] else {
            semaphore.signal()
            return
        }

        var texts: [String] = []
        var totalConfidence: Double = 0

        for observation in observations {
            if let topCandidate = observation.topCandidates(1).first {
                texts.append(topCandidate.string)
                totalConfidence += Double(topCandidate.confidence)
            }
        }

        resultText = texts.joined(separator: "\n")
        avgConfidence = observations.isEmpty ? 0 : totalConfidence / Double(observations.count)

        semaphore.signal()
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
    } catch {
        fputs("OCR error: \(error)\n", stderr)
        semaphore.signal()
    }

    semaphore.wait()
    return (resultText, avgConfidence)
}

// MARK: - Active App

func getActiveAppName() -> String {
    if let app = NSWorkspace.shared.frontmostApplication {
        return app.localizedName ?? app.bundleIdentifier ?? "Unknown"
    }
    return "Unknown"
}

// MARK: - Clipboard

func getClipboardText() -> String? {
    let pasteboard = NSPasteboard.general
    return pasteboard.string(forType: .string)
}

// MARK: - Activate App (bring to front above other apps)

func activateApp(pid: Int32) {
    guard let app = NSRunningApplication(processIdentifier: pid) else {
        fputs("No app with PID \(pid)\n", stderr)
        return
    }
    // Bring app to front — works for LSUIElement apps
    app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])

    // Also set all its windows to a high level so they appear above fullscreen
    // We need a tiny delay for the windows to be activatable
    usleep(50_000) // 50ms
    // Also raise all windows of this app via Accessibility API
    let axApp = AXUIElementCreateApplication(pid)
    var axWindows: AnyObject?
    AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows)
    if let windows = axWindows as? [AXUIElement] {
        for axWin in windows {
            AXUIElementSetAttributeValue(axWin, kAXFocusedAttribute as CFString, true as CFTypeRef)
            AXUIElementPerformAction(axWin, kAXRaiseAction as CFString)
        }
    }
}

// MARK: - Main

let args = CommandLine.arguments

if args.count < 2 {
    fputs("Usage: reattend-capture [screenshot|active-app|clipboard|activate <pid>]\n", stderr)
    exit(1)
}

let command = args[1]

switch command {
case "screenshot":
    guard let image = captureScreen() else {
        fputs("Failed to capture screen\n", stderr)
        exit(1)
    }

    let (text, confidence) = recognizeText(from: image)
    let appName = getActiveAppName()

    let result = CaptureResult(
        text: text,
        appName: appName,
        timestamp: ISO8601DateFormatter().string(from: Date()),
        confidence: confidence
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let data = try? encoder.encode(result),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    }

case "active-app":
    let name = getActiveAppName()
    print(name)

case "clipboard":
    if let text = getClipboardText() {
        print(text)
    }

case "activate":
    if args.count >= 3, let pid = Int32(args[2]) {
        activateApp(pid: pid)
        print("ok")
    } else {
        fputs("Usage: reattend-capture activate <pid>\n", stderr)
        exit(1)
    }

default:
    fputs("Unknown command: \(command)\n", stderr)
    exit(1)
}
