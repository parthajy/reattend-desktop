#!/usr/bin/env node
/**
 * Platform-conditional prebuild script for Tauri.
 * - macOS: builds the Swift Vision plugin (for local OCR)
 * - Windows: creates placeholder for bundler (OCR is server-side)
 * - Always builds the frontend first
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const platform = os.platform();

// Step 1: Build frontend
console.log("[prebuild] Building frontend...");
execSync("npm run build", { stdio: "inherit" });

// Step 2: Platform-specific
if (platform === "darwin") {
  console.log("[prebuild] macOS — building Swift Vision plugin...");
  execSync("cd src-tauri/swift-plugin && swift build -c release", {
    stdio: "inherit",
  });
} else {
  console.log(`[prebuild] ${platform} — skipping Swift build (OCR is server-side)`);
  // Create placeholder so Tauri bundler doesn't fail on missing resource
  const placeholderDir = path.join("src-tauri", "swift-plugin", ".build", "release");
  fs.mkdirSync(placeholderDir, { recursive: true });
  const placeholderFile = path.join(placeholderDir, "reattend-capture");
  if (!fs.existsSync(placeholderFile)) {
    fs.writeFileSync(placeholderFile, "# placeholder — OCR is server-side on this platform\n");
    console.log("[prebuild] Created placeholder reattend-capture for bundler");
  }
}
