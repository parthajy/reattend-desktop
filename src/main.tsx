import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureWindow } from "./windows/CaptureWindow";
import { AskWindow } from "./windows/AskWindow";
import { SettingsWindow } from "./windows/SettingsWindow";
import { AmbientPopup } from "./windows/AmbientPopup";
import { MeetingIndicator } from "./windows/MeetingIndicator";
import { MeetingResult } from "./windows/MeetingResult";
import "./styles.css";

// Lazy-load the full app — keeps popup windows lightweight
const MainApp = lazy(() =>
  import("@/app/App").then((m) => ({ default: m.App }))
);

// Route based on window label instead of URL path.
const label = getCurrentWindow().label;

function Root() {
  switch (label) {
    case "capture":
      return <CaptureWindow />;
    case "ask":
      return <AskWindow />;
    case "settings":
      return <SettingsWindow />;
    case "ambient":
      return <AmbientPopup />;
    case "meeting-indicator":
      return <MeetingIndicator />;
    case "meeting-result":
      return <MeetingResult />;
    case "main":
    default:
      return (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-screen bg-background" />
          }
        >
          <MainApp />
        </Suspense>
      );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
