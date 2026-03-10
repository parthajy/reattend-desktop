import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Layout } from "./Layout";
import { Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/app-store";

// Lazy-load pages
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const MemoriesPage = lazy(() => import("./pages/MemoriesPage"));
const MemoryDetailPage = lazy(() => import("./pages/MemoryDetailPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const BoardPage = lazy(() => import("./pages/BoardPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const MeetingsPage = lazy(() => import("./pages/MeetingsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = listen<{ path: string; filter?: string }>("navigate", (event) => {
      const { path, filter } = event.payload;
      if (filter) {
        useAppStore.getState().setPendingNavFilter(filter);
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
          <Route path="explore" element={<DashboardPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="transcripts" element={<MeetingsPage />} />
          <Route path="memories" element={<MemoriesPage />} />
          <Route path="memories/:id" element={<MemoryDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
