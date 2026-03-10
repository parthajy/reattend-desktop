import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { QuickCaptureModal } from "@/components/app/QuickCaptureModal";
import { UpgradePrompt } from "@/components/app/UpgradePrompt";
import { useAppStore } from "@/stores/app-store";
import { getUsageStats, getConfigValue, openPrivacySettings } from "@/lib/tauri-api";
import { X, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export function Layout() {
  const setShowUpgradePrompt = useAppStore((s) => s.setShowUpgradePrompt);
  const setUsageTier = useAppStore((s) => s.setUsageTier);
  const setUsageRemaining = useAppStore((s) => s.setUsageRemaining);
  const setUserName = useAppStore((s) => s.setUserName);
  const [screenPermissionNeeded, setScreenPermissionNeeded] = useState(false);
  const [captureBroken, setCaptureBroken] = useState<string | null>(null);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const navigate = useNavigate();

  // Load current auth state and usage on mount
  useEffect(() => {
    (async () => {
      try {
        const [stats, name] = await Promise.all([
          getUsageStats().catch(() => null),
          getConfigValue("user_name").catch(() => null),
        ]);
        if (stats) {
          setUsageTier(stats.tier);
          setUsageRemaining(stats.remaining);
        }
        if (name) setUserName(name);
      } catch {}
    })();
  }, [setUsageTier, setUsageRemaining, setUserName]);

  // Check capture health on mount
  useEffect(() => {
    invoke<{ status: string; fail_count: number; success_count: number; has_permission: boolean }>("get_capture_health")
      .then((health) => {
        if (health.status === "broken") {
          const isWindows = navigator.platform?.toLowerCase().includes("win");
          setCaptureBroken(
            isWindows
              ? "Screen capture not working. Check your internet connection — Windows uses server-side OCR."
              : health.has_permission
                ? "Screen capture not working. Try toggling Screen Recording permission off and on in System Settings."
                : "Screen Recording permission not granted. Reattend can't capture your screen."
          );
        }
      })
      .catch(() => {});
  }, []);

  // Listen for runtime events
  useEffect(() => {
    const u1 = listen("usage_limit_reached", () => {
      setShowUpgradePrompt(true);
    });
    const u2 = listen<{ email: string; name: string; tier: string }>("auth-complete", (event) => {
      setUsageTier(event.payload.tier as "anonymous" | "registered" | "smart");
      if (event.payload.name) setUserName(event.payload.name);
      setShowUpgradePrompt(false);
    });
    const u3 = listen<{ reason: string }>("screen_permission_needed", () => {
      setScreenPermissionNeeded(true);
    });
    const u4 = listen<{ status: string; message: string }>("capture_health", (event) => {
      if (event.payload.status === "broken") {
        setCaptureBroken(event.payload.message);
      } else if (event.payload.status === "healthy") {
        setCaptureBroken(null);
      }
    });
    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
      u3.then((fn) => fn());
      u4.then((fn) => fn());
    };
  }, [setShowUpgradePrompt, setUsageTier, setUserName]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        {updateAvailable && (
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 px-4 py-2.5 text-sm flex items-center justify-between shrink-0">
            <span className="text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
              <Download className="h-4 w-4" />
              Reattend {updateAvailable.version} is available.{" "}
              {updateAvailable.notes && (
                <span className="text-indigo-600 dark:text-indigo-400 text-xs">{updateAvailable.notes}</span>
              )}
            </span>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button
                onClick={async () => {
                  try {
                    await invoke("install_update");
                    await relaunch();
                  } catch (e) {
                    console.error("[Updater] Install failed:", e);
                  }
                }}
                className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md flex items-center gap-1"
              >
                Install &amp; Restart <RefreshCw className="h-3 w-3" />
              </button>
              <button
                onClick={() => useAppStore.getState().setUpdateAvailable(null)}
                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {screenPermissionNeeded && (
          <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 px-4 py-3 text-sm shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-red-800 dark:text-red-200 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Screen Recording permission is required
              </span>
              <button
                onClick={() => setScreenPermissionNeeded(false)}
                className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-6">
              Reattend can't capture your screen without this permission. No memories will be saved.
            </p>
            <div className="flex items-center gap-2 mt-2 ml-6">
              <button
                onClick={() => openPrivacySettings("screen")}
                className="text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md"
              >
                Grant Permission
              </button>
              <button
                onClick={() => navigate("/settings")}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                See setup instructions
              </button>
            </div>
          </div>
        )}
        {captureBroken && !screenPermissionNeeded && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 text-sm shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {captureBroken}
              </span>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                {!navigator.platform?.toLowerCase().includes("win") && (
                <button
                  onClick={() => invoke("open_screen_recording_settings")}
                  className="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md"
                >
                  Open Settings
                </button>
                )}
                <button
                  onClick={() => setCaptureBroken(null)}
                  className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <QuickCaptureModal />
      <UpgradePrompt />
    </div>
  );
}
