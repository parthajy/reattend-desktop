import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Brain,
  Search,
  LayoutGrid,
  Settings,
  FolderKanban,
  Plus,
  MessageSquare,
  Compass,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Mic,
  ArrowUpCircle,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/app-store";
import { useChatStore } from "@/stores/chat-store";
import { getConfigValue } from "@/lib/tauri-api";

const navItems = [
  { to: "/explore", icon: Compass, label: "Explore" },
  { to: "/projects", icon: FolderKanban, label: "Projects", hasPlus: true },
  { to: "/memories", icon: Brain, label: "Memories", hasPlus: true },
  { to: "/transcripts", icon: Mic, label: "Transcripts" },
  { to: "/board", icon: LayoutGrid, label: "Board" },
];

function groupThreadsByDate(
  threads: { id: string; title: string; updated_at: string }[]
) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);

  const groups: { label: string; threads: typeof threads }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "Previous 7 Days", threads: [] },
    { label: "Previous 30 Days", threads: [] },
  ];

  for (const t of threads) {
    const d = new Date(t.updated_at);
    if (d >= todayStart) groups[0].threads.push(t);
    else if (d >= yesterdayStart) groups[1].threads.push(t);
    else if (d >= weekStart) groups[2].threads.push(t);
    else if (d >= monthStart) groups[3].threads.push(t);
  }

  return groups.filter((g) => g.threads.length > 0);
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, userName, setUserName, userAvatar, setUserAvatar, updateAvailable } =
    useAppStore();
  const [updating, setUpdating] = useState(false);
  const { threads, activeThreadId, setActiveThread, deleteThread, loadThreads } =
    useChatStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    loadThreads();
    getVersion().then(setAppVersion).catch(() => {});
    getConfigValue("user_name")
      .then((name) => {
        if (name) setUserName(name);
      })
      .catch(() => {});
    getConfigValue("user_avatar")
      .then((avatar) => {
        if (avatar) setUserAvatar(avatar);
      })
      .catch(() => {});
  }, []);

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const handleNewChat = () => {
    // Clear active thread so ChatPage shows empty state
    useChatStore.setState({ activeThreadId: null, messages: [] });
    navigate("/");
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThread(threadId);
    navigate("/");
  };

  const threadGroups = groupThreadsByDate(threads);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-[240px]"
        )}
      >
        {/* Header: Logo + Collapse */}
        <div
          data-tauri-drag-region
          className={cn(
            "flex items-center gap-2 p-3 h-12",
            sidebarCollapsed && "justify-center"
          )}
        >
          {!sidebarCollapsed ? (
            <>
              <NavLink
                to="/"
                className="flex items-center gap-2 flex-1 min-w-0 px-1"
              >
                <img
                  src="/logo.svg"
                  alt="Reattend"
                  className="h-7 w-7 shrink-0 dark:invert"
                />
                <span className="text-[15px] font-bold text-sidebar-foreground tracking-tight">
                  Reattend
                </span>
              </NavLink>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors shrink-0"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* + New Chat + Search buttons */}
        <div
          className={cn(
            "px-2 pt-2 flex flex-col gap-1.5",
            sidebarCollapsed && "items-center"
          )}
        >
          {!sidebarCollapsed ? (
            <>
              <Button
                size="sm"
                className="w-full h-9 text-xs bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white hover:from-[#4338CA] hover:to-[#5558E6] shadow-[0_2px_8px_rgba(79,70,229,0.25)] border-0"
                onClick={handleNewChat}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New chat
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 text-xs"
                onClick={() => navigate("/search")}
              >
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Search
              </Button>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="h-8 w-8 bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white hover:from-[#4338CA] hover:to-[#5558E6] shadow-[0_2px_8px_rgba(79,70,229,0.25)] border-0"
                    onClick={handleNewChat}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">New chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => navigate("/search")}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Search</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn("px-2 py-2 flex flex-col gap-0.5")}>
          {navItems.map((item) => {
            const active = isActive(item.to);
            const link = (
              <div key={item.to} className="relative group">
                <NavLink
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    sidebarCollapsed && "justify-center px-2"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active && "text-primary"
                    )}
                  />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </NavLink>
                {/* Inline + icon for Memories and Projects */}
                {item.hasPlus && !sidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(item.to);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>

        <Separator className="mx-2 bg-sidebar-border" />

        {/* Thread list */}
        <ScrollArea className="flex-1 px-2 py-1">
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              {threadGroups.length === 0 && (
                <p className="text-[11px] text-muted-foreground/40 text-center py-4">
                  No conversations yet
                </p>
              )}
              {threadGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 py-1">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.threads.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "group flex items-center rounded-md transition-colors",
                          activeThreadId === t.id && location.pathname === "/"
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <button
                          onClick={() => handleSelectThread(t.id)}
                          className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[13px] text-left min-w-0"
                        >
                          <MessageSquare className="h-3 w-3 shrink-0 opacity-50" />
                          <span className="truncate">{t.title}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteThread(t.id);
                          }}
                          className="pr-2 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink
                  to="/"
                  className={cn(
                    "flex items-center justify-center rounded-md px-2 py-2 text-sm font-medium transition-colors",
                    location.pathname === "/"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <MessageSquare
                    className={cn(
                      "h-4 w-4 shrink-0",
                      location.pathname === "/" && "text-primary"
                    )}
                  />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">Chat</TooltipContent>
            </Tooltip>
          )}
        </ScrollArea>

        {/* Bottom section */}
        <div className="px-2 pb-2">
          <Separator className="mb-2 bg-sidebar-border" />

          {/* Profile + Settings gear */}
          <div
            className={cn(
              "flex items-center gap-2.5 px-2 py-2 rounded-lg",
              sidebarCollapsed && "justify-center"
            )}
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt=""
                className="h-8 w-8 rounded-full object-cover shrink-0 ring-1 ring-violet-500/10"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center shrink-0 ring-1 ring-violet-500/10">
                <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                  {(userName || "U")[0].toUpperCase()}
                </span>
              </div>
            )}
            {!sidebarCollapsed && (
              <>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold truncate">
                    {userName || "Local User"}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    Local-first AI memory
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink
                      to="/settings"
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors",
                        isActive("/settings")
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <Settings className="h-4 w-4" />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </>
            )}
            {sidebarCollapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/settings"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="text-center pt-1">
              {updateAvailable ? (
                <button
                  onClick={async () => {
                    setUpdating(true);
                    try {
                      await invoke("install_update");
                      await relaunch();
                    } catch (e) {
                      console.error("[Updater] Install failed:", e);
                      setUpdating(false);
                    }
                  }}
                  disabled={updating}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
                >
                  <ArrowUpCircle className="h-3 w-3" />
                  {updating ? "Updating..." : `Update to v${updateAvailable.version}`}
                </button>
              ) : appVersion ? (
                <p className="text-[10px] text-muted-foreground/40">
                  v{appVersion}
                </p>
              ) : null}
            </div>
          )}
          {sidebarCollapsed && updateAvailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={async () => {
                    setUpdating(true);
                    try {
                      await invoke("install_update");
                      await relaunch();
                    } catch (e) {
                      console.error("[Updater] Install failed:", e);
                      setUpdating(false);
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-sidebar-accent/50 transition-colors mx-auto"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Update to v{updateAvailable.version}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
