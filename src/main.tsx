import React, { lazy, Suspense } from "react";
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
// (MeetingIndicator + MeetingResult windows removed with the audio
// recorder strip — they were only opened by the mic recorder pipeline.)
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
    // (meeting-indicator + meeting-result window cases removed with the
    // audio recorder strip — those windows were only opened by the mic
    // recorder. Labels still ever delivered will fall through to <MainApp />,
    // which is harmless.)
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
