import { create } from "zustand";

interface AppState {
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
  commandOpen: boolean;

  // User profile
  userName: string;
  userAvatar: string | null;

  // Chat
  currentThreadId: string | null;

  // Panel states
  notificationsOpen: boolean;

  // Capture modal context
  captureProjectId: string | null;
  captureProjectName: string | null;

  // Usage / Metering. Tier values: "free" | "professional" | "enterprise"
  // (matches the new server). Old "anonymous" / "registered" / "smart"
  // values still appear in stale UI that gets removed in Phase 1d when
  // we rip out the duplicate full-app pages — kept in the union so
  // those existing comparisons keep compiling until that cleanup.
  usageTier: "free" | "professional" | "enterprise" | "anonymous" | "registered" | "smart";
  usageRemaining: number | "unlimited";
  showUpgradePrompt: boolean;

  // Update available
  updateAvailable: { version: string; notes: string } | null;
  setUpdateAvailable: (update: { version: string; notes: string } | null) => void;

  // Deep-link navigation (e.g. tray → memories with filter)
  pendingNavFilter: string | null;
  setPendingNavFilter: (filter: string | null) => void;

  setUserName: (name: string) => void;
  setUserAvatar: (avatar: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
  setCommandOpen: (open: boolean) => void;
  setCurrentThreadId: (id: string | null) => void;
  setNotificationsOpen: (open: boolean) => void;
  setUsageTier: (tier: "free" | "professional" | "enterprise" | "anonymous" | "registered" | "smart") => void;
  setUsageRemaining: (remaining: number | "unlimited") => void;
  setShowUpgradePrompt: (show: boolean) => void;
  setCaptureProject: (id: string | null, name?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  theme: "light",
  userName: "",
  userAvatar: null,
  commandOpen: false,
  currentThreadId: null,
  notificationsOpen: false,
  captureProjectId: null,
  captureProjectName: null,
  usageTier: "anonymous",
  usageRemaining: 20,
  showUpgradePrompt: false,

  setUserName: (name) => set({ userName: name }),
  setUserAvatar: (avatar) => set({ userAvatar: avatar }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setCurrentThreadId: (id) => set({ currentThreadId: id }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setUsageTier: (tier) => set({ usageTier: tier }),
  setUsageRemaining: (remaining) => set({ usageRemaining: remaining }),
  setShowUpgradePrompt: (show) => set({ showUpgradePrompt: show }),
  setCaptureProject: (id, name) =>
    set({ captureProjectId: id, captureProjectName: name ?? null }),
  updateAvailable: null,
  setUpdateAvailable: (update) => set({ updateAvailable: update }),
  pendingNavFilter: null,
  setPendingNavFilter: (filter) => set({ pendingNavFilter: filter }),
}));
