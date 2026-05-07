import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Layout } from "./Layout";
import { Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useAppStore } from "@/stores/app-store";

// Desktop is a thin client now. Browse / explore / detail views live on the
// web app at https://reattend.com/app/* — the desktop's job is to capture,
// ask, and surface ambient insights. The pages below are everything the
// desktop UI ships:
const ChatPage = lazy(() => import("./pages/ChatPage"));      // Ask + chat threads
const InboxPage = lazy(() => import("./pages/InboxPage"));    // Recent captures
const SettingsPage = lazy(() => import("./pages/SettingsPage")); // Account + connection

// Removed 2026-05-07 (Phase 1d) — these duplicated the web app:
//   DashboardPage, MemoriesPage, MemoryDetailPage, ProjectsPage,
//   ProjectDetailPage, BoardPage, SearchPage. Their old in-app routes
//   are intercepted below and bounced to the equivalent web URL via the
//   default browser, so any deep-link / tray nav targeting an old route
//   still does the right thing.

const OPEN_IN_BROWSER_PATHS: Record<string, string> = {
  "/explore": "https://reattend.com/app",
  "/memories": "https://reattend.com/app/memories",
  "/projects": "https://reattend.com/app/memories",
  "/board": "https://reattend.com/app/landscape",
  "/search": "https://reattend.com/app/search",
};

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Renders nothing — used for routes whose only purpose is to be the
 *  redirect target of a tray-emitted `navigate` event. The effect in
 *  AppRoutes handles the actual side-effect (open browser + go home). */
function ExternalRedirect() {
  return null;
}

export function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = listen<{ path: string; filter?: string }>("navigate", (event) => {
      const { path, filter } = event.payload;
      if (filter) {
        useAppStore.getState().setPendingNavFilter(filter);
      }

      // If the requested path is one of the deleted full-app pages, open
      // it in the browser instead of trying to render in-app. Then drop
      // the desktop on its home page so the user has somewhere to land.
      const externalUrl = OPEN_IN_BROWSER_PATHS[path]
        ?? (path.startsWith("/memories/") ? `https://reattend.com/app/memories${path.slice(9)}` : null)
        ?? (path.startsWith("/projects/") ? "https://reattend.com/app/memories" : null);
      if (externalUrl) {
        openExternal(externalUrl).catch(() => { /* silent */ });
        navigate("/");
        return;
      }

      navigate(path);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Legacy paths — bounce to the web app via the navigate listener
              above. The placeholder element is just so the route matches. */}
          <Route path="explore" element={<ExternalRedirect />} />
          <Route path="memories/*" element={<ExternalRedirect />} />
          <Route path="projects/*" element={<ExternalRedirect />} />
          <Route path="board" element={<ExternalRedirect />} />
          <Route path="search" element={<ExternalRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
