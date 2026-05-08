import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { getCurrentWindow } from "@tauri-apps/api/window";

Sentry.init({
  dsn: "https://c2f90817dc04b2ed45eae131ce880519@o4511074431598592.ingest.de.sentry.io/4511074453094480",
  environment: "production",
  tracesSampleRate: 0.1,
});

import { CaptureWindow } from "./windows/CaptureWindow";
import { AskWindow } from "./windows/AskWindow";
import { SettingsWindow } from "./windows/SettingsWindow";
import { AmbientPopup } from "./windows/AmbientPopup";
import { ClipboardChip } from "./windows/ClipboardChip";
import "./styles.css";

// Tray-only architecture (2026-05-08): the desktop app no longer ships a
// dashboard window. Every interactive surface is one of four lightweight
// floating windows, each routed by Tauri window label below:
//
//   capture  — Quick Capture firehose (⌘⇧R)
//   ask      — Spotlight-style ask (⌘⇧A)
//   settings — Token paste + account info + theme
//   ambient  — Ambient insight popup (background-spawned)
//
// "Open Dashboard" in the tray menu (and ⌘⇧O) opens the user's default
// browser at https://reattend.com/app instead of creating a Tauri window
// — the full memory experience lives on the web.
//
// Any unrecognized window label falls through to SettingsWindow so a
// stray invocation surfaces something useful instead of a blank screen.

const label = getCurrentWindow().label;

function Root() {
  switch (label) {
    case "capture":
      return <CaptureWindow />;
    case "ask":
      return <AskWindow />;
    case "ambient":
      return <AmbientPopup />;
    case "clipboard-chip":
      return <ClipboardChip />;
    case "settings":
    default:
      return <SettingsWindow />;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
