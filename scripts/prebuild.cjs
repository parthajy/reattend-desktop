#!/usr/bin/env node
/**
 * Platform-conditional prebuild script for Tauri.
 * - macOS: builds the Swift Vision plugin, adds resources to config
 * - Windows: strips resources from config (OCR is server-side)
 * - Always builds the frontend first
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const platform = os.platform();
const confPath = path.join("src-tauri", "tauri.conf.json");

// Step 1: Build frontend
console.log("[prebuild] Building frontend...");
execSync("npm run build", { stdio: "inherit" });

// Step 2: Platform-specific build + config
const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));

if (platform === "darwin") {
  console.log("[prebuild] macOS — building Swift Vision plugin...");
  execSync("cd src-tauri/swift-plugin && swift build -c release", {
    stdio: "inherit",
  });
  // Add Swift binary as bundled resource
  conf.bundle.resources = ["swift-plugin/.build/release/reattend-capture"];
} else {
  console.log(`[prebuild] ${platform} — skipping Swift build (OCR is server-side)`);
  // No resources needed on Windows
  delete conf.bundle.resources;
}

fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
console.log(`[prebuild] Updated tauri.conf.json for ${platform}`);
