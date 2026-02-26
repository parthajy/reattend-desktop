import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureWindow } from "./capture";
import { AskWindow } from "./ask";
import { SettingsWindow } from "./settings";
import { AmbientPopup } from "./ambient";
import "./styles.css";

// Route based on window label instead of URL path.
// This works reliably in both dev and production.
const label = getCurrentWindow().label;

function App() {
  switch (label) {
    case "capture":
      return <CaptureWindow />;
    case "ask":
      return <AskWindow />;
    case "settings":
      return <SettingsWindow />;
    case "ambient":
      return <AmbientPopup />;
    default:
      return <SettingsWindow />;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
