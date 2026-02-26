// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ReattendCapture",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "reattend-capture", targets: ["ReattendCapture"]),
    ],
    targets: [
        .executableTarget(
            name: "ReattendCapture",
            path: "Sources"
        ),
    ]
)
