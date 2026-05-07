import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Moon,
  Sun,
  X,
  CheckCircle2,
  Clock,
  Loader2,
  Command,
  ArrowUpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/hooks/use-theme";
import { useAppStore } from "@/stores/app-store";
import {
  getNotifications,
  markNotificationDone,
} from "@/lib/tauri-api";
import type { Notification } from "@/types";

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const {
    notificationsOpen,
    setNotificationsOpen,
    setCommandOpen,
  } = useAppStore();

  // Notifications
  const [notifications, setNotificationsState] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const ACTIONABLE_TYPES = ["todo", "decision_pending", "followup"];

  // Update check: use Tauri updater plugin to check + install
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [updateObj, setUpdateObj] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          setUpdateVersion(update.version);
          setUpdateObj(update);
        }
      } catch (e) {
        console.log("[Updater] check failed, falling back to manifest", e);
        // Fallback: fetch manifest directly for version display only
        try {
          const { getVersion } = await import("@tauri-apps/api/app");
          const currentVersion = await getVersion();
          const res = await fetch("https://reattend.com/data/updater/latest.json");
          const manifest: { version: string } = await res.json();
          if (manifest.version && manifest.version !== currentVersion) {
            setUpdateVersion(manifest.version);
          }
        } catch {}
      }
    })();
  }, []);

  // Fetch notifications (actionable only)
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const notifs = await getNotifications("unread", 50);
      const actionable = notifs.filter((n) =>
        ACTIONABLE_TYPES.includes(n.type)
      );
      setNotificationsState(actionable);
    } catch {
      // silent
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const notifs = await getNotifications("unread", 50);
      const count = notifs.filter((n) =>
        ACTIONABLE_TYPES.includes(n.type)
      ).length;
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Poll count every 30s
  useEffect(() => {
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Refetch when panel opens
  useEffect(() => {
    if (notificationsOpen) fetchNotifications();
  }, [notificationsOpen, fetchNotifications]);

  const handleMarkDone = async (id: string) => {
    try {
      await markNotificationDone(id);
      setNotificationsState((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  return (
    <>
      <header
        data-tauri-drag-region
        className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/80 backdrop-blur-sm px-4"
      >
        {/* Left: Tagline + Update button */}
        <div data-tauri-drag-region className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="text-[11px] text-muted-foreground/50 italic tracking-wide select-none">
            Your subconscious
          </span>
          {updateVersion && (
            <button
              onClick={async () => {
                setInstalling(true);
                setUpdateStatus("Downloading...");
                try {
                  if (updateObj) {
                    // Use Tauri updater plugin: download, verify signature, replace app
                    let downloaded = 0;
                    let total = 0;
                    await updateObj.downloadAndInstall((event: any) => {
                      if (event.event === "Started") {
                        total = event.data?.contentLength || 0;
                        setUpdateStatus("Downloading...");
                      } else if (event.event === "Progress") {
                        downloaded += event.data?.chunkLength || 0;
                        if (total > 0) {
                          const pct = Math.round((downloaded / total) * 100);
                          setUpdateStatus(`${pct}%`);
                        }
                      } else if (event.event === "Finished") {
                        setUpdateStatus("Restarting...");
                      }
                    });
                    // Relaunch after install
                    const { relaunch } = await import("@tauri-apps/plugin-process");
                    await relaunch();
                  } else {
                    // No updater object — fallback to DMG download
                    const { open } = await import("@tauri-apps/plugin-shell");
                    await open("https://reattend.com/download/Reattend.dmg");
                    setInstalling(false);
                    setUpdateStatus("");
                  }
                } catch (e) {
                  console.error("[Updater] Install failed:", e);
                  // Fallback to DMG on any error
                  const { open } = await import("@tauri-apps/plugin-shell");
                  await open("https://reattend.com/download/Reattend.dmg");
                  setInstalling(false);
                  setUpdateStatus("");
                }
              }}
              disabled={installing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition-all animate-in fade-in slide-in-from-left-2 duration-300"
            >
              {installing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-3 w-3" />
              )}
              {installing && updateStatus ? updateStatus : `Update to v${updateVersion}`}
            </button>
          )}
        </div>

        {/* Right: Action icons */}
        <div className="flex items-center gap-1">
          {/* Quick Save */}
          <button
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
          >
            <Command className="w-3 h-3" />
            <span>Quick Save</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <Button
            variant={notificationsOpen ? "secondary" : "ghost"}
            size="icon"
            className="relative h-8 w-8"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <Bell className="h-4 w-4 text-amber-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-400" />
            )}
          </Button>
        </div>
      </header>

      {/* ── Notification Panel ──────────────────────────────────────── */}
      {notificationsOpen && (
        <div className="fixed right-0 top-12 z-50 h-[calc(100vh-3rem)] w-80 border-l bg-background shadow-xl">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setNotificationsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2">
                {notifLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex gap-3 rounded-md p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (
                          notif.object_type === "record" &&
                          notif.object_id
                        ) {
                          setNotificationsOpen(false);
                          navigate(`/memories/${notif.object_id}`);
                        }
                      }}
                    >
                      <div className="mt-0.5">
                        {notif.type === "todo" && (
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        )}
                        {notif.type === "decision_pending" && (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                        {notif.type === "followup" && (
                          <Bell className="h-4 w-4 text-emerald-500" />
                        )}
                        {!["todo", "decision_pending", "followup"].includes(
                          notif.type
                        ) && (
                          <Bell className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{notif.title}</p>
                        {notif.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notif.body}
                          </p>
                        )}
                        {notif.object_type === "record" &&
                          notif.object_id && (
                            <p className="text-[11px] text-primary mt-1">
                              View memory &rarr;
                            </p>
                          )}
                        <div
                          className="flex gap-2 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleMarkDone(notif.id)}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </>
  );
}
