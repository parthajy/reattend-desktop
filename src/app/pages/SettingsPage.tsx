import { useState, useEffect, useRef } from "react";
import {
  getRecentJobs,
  getJobCounts,
  runManualRelink,
  runRebuildEmbeddings,
  getConfigValue,
  setConfigValue,
  getUsageStats,
  logout as logoutApi,
  connectToken,
  checkScreenPermission,
  // (checkMicPermission removed with the audio recorder strip 2026-05-07.)
  openPrivacySettings,
  getCaptureHealth,
  retryCaptureTest,
} from "@/lib/tauri-api";
import type { JobQueueItem } from "@/types";
// import { open } from "@tauri-apps/plugin-shell";
import { useTheme } from "@/hooks/use-theme";
import { useAppStore } from "@/stores/app-store";
import {
  Settings,
  Loader2,
  Check,
  Moon,
  Sun,
  RefreshCw,
  Link2,
  Database,
  Zap,
  Keyboard,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  MessageSquare,
  Trash2,
  Camera,
  Shield,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

import { getVersion } from "@tauri-apps/api/app";

type Tab = "profile" | "preferences" | "permissions" | "chat" | "agent" | "about";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat management — subscribe reactively
  const threadCount = useChatStore((s) => s.threads.length);
  const deleteAllThreads = useChatStore((s) => s.deleteAllThreads);
  const [deletingChats, setDeletingChats] = useState(false);
  const [chatsDeleted, setChatsDeleted] = useState(false);

  // Account & usage
  const usageTier = useAppStore((s) => s.usageTier);
  const [usageUsed, setUsageUsed] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState(30);
  const [trialExpired, setTrialExpired] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Token connect
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // Permissions
  const [screenPerm, setScreenPerm] = useState<boolean | null>(null);
  const [micPerm, setMicPerm] = useState<boolean | null>(null);
  const [captureWorking, setCaptureWorking] = useState<boolean | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [retryingCapture, setRetryingCapture] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  // Agent logs
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [jobFilter, setJobFilter] = useState<"all" | "pending" | "completed">("all");
  const [jobPage, setJobPage] = useState(0);
  const [jobCounts, setJobCounts] = useState<{ total: number; pending: number; completed: number; failed: number }>({ total: 0, pending: 0, completed: 0, failed: 0 });
  const PAGE_SIZE = 50;

  useEffect(() => {
    Promise.all([
      getConfigValue("user_name"),
      getConfigValue("user_email"),
      getConfigValue("user_avatar"),
    ])
      .then(([name, email, avatar]) => {
        setProfileName(name || "");
        setProfileEmail(email || "");
        if (avatar) setProfilePic(avatar);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "profile") fetchUsage();
    if (activeTab === "agent") fetchJobs();
    if (activeTab === "permissions") fetchPermissions();
    if (activeTab === "about") {
      getVersion().then(setAppVersion).catch(() => {});
    }
  }, [activeTab]);

  const fetchPermissions = async () => {
    setPermLoading(true);
    try {
      const [screen, health] = await Promise.all([
        checkScreenPermission().catch(() => false),
        getCaptureHealth().catch(() => null),
      ]);
      setScreenPerm(screen);
      // (Mic permission check removed with the audio recorder strip — we
      // no longer request microphone access.)
      setMicPerm(false);
      if (health) {
        setCaptureWorking(health.status === "healthy");
      }
    } finally {
      setPermLoading(false);
    }
  };

  const fetchUsage = async () => {
    setUsageLoading(true);
    try {
      const stats = await getUsageStats();
      setUsageUsed(stats.used);
      setTrialDaysLeft(stats.trialDaysLeft ?? 30);
      setTrialExpired(stats.trialExpired ?? false);
    } catch {
      // offline or server unreachable
    } finally {
      setUsageLoading(false);
    }
  };

  const handleConnectToken = async () => {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setConnectError("");
    try {
      const result = await connectToken(tokenInput.trim());
      // Token validated and saved — update UI
      useAppStore.getState().setUsageTier(result.tier);
      setTokenInput("");
      fetchUsage();
    } catch (err: any) {
      setConnectError(err?.toString() || "Failed to connect token");
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutApi();
      setProfileName("");
      setProfileEmail("");
      setProfilePic(null);
      useAppStore.getState().setUsageTier("anonymous");
      useAppStore.getState().setUserName("");
      useAppStore.getState().setUserAvatar(null);
      fetchUsage();
    } catch {}
    setLoggingOut(false);
  };

  const fetchJobs = async (page = jobPage) => {
    setJobsLoading(true);
    try {
      const [data, counts] = await Promise.all([
        getRecentJobs(PAGE_SIZE, page * PAGE_SIZE),
        getJobCounts(),
      ]);
      setJobs(data);
      setJobCounts({ total: counts[0], pending: counts[1], completed: counts[2], failed: counts[3] });
    } catch {
      // silent
    } finally {
      setJobsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await setConfigValue("user_name", profileName);
      await setConfigValue("user_email", profileEmail);
      if (profilePic) await setConfigValue("user_avatar", profilePic);
      useAppStore.getState().setUserName(profileName);
      useAppStore.getState().setUserAvatar(profilePic);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      alert("Image too large. Please use an image under 500KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setProfilePic(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleRelink = async () => {
    setRelinking(true);
    try {
      await runManualRelink();
      await fetchJobs();
    } catch {}
    setRelinking(false);
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await runRebuildEmbeddings();
      await fetchJobs();
    } catch {}
    setRebuilding(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { value: Tab; label: string; icon: typeof Settings }[] = [
    { value: "profile", label: "Profile", icon: User },
    { value: "preferences", label: "Preferences", icon: Settings },
    { value: "permissions", label: "Permissions", icon: Shield },
    { value: "chat", label: "Chat", icon: MessageSquare },
    { value: "agent", label: "Agent Logs", icon: Zap },
    { value: "about", label: "About", icon: Info },
  ];

  const jobStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "running":
        return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5" />
          Settings
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-muted/50 rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ─────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {profilePic ? (
                    <img
                      src={profilePic}
                      alt="Avatar"
                      className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/10"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                      {profileName
                        ? profileName.charAt(0).toUpperCase()
                        : "U"}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="w-5 h-5 text-white" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">Your Profile</p>
                  <p className="text-xs text-muted-foreground">
                    Local profile stored on this device
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary hover:underline mt-0.5"
                  >
                    Upload photo
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                size="sm"
              >
                {saving && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                )}
                {saved && <Check className="w-3.5 h-3.5 mr-1" />}
                Save Profile
              </Button>
            </div>

            {/* Account & Usage */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <p className="text-sm font-semibold">Account & Usage</p>

              {/* Tier badge */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Plan</p>
                  <p className="text-xs text-muted-foreground">
                    {usageTier === "smart"
                      ? "Smart — unlimited AI operations"
                      : trialExpired
                        ? "Trial expired — upgrade to continue"
                        : `Free trial — ${trialDaysLeft} days remaining`}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    usageTier === "smart"
                      ? "border-emerald-500/30 text-emerald-600"
                      : trialExpired
                        ? "border-red-500/30 text-red-600"
                        : "border-primary/30 text-primary"
                  )}
                >
                  {usageTier === "smart" ? "Smart" : trialExpired ? "Expired" : "Trial"}
                </Badge>
              </div>

              {/* Usage / Trial info */}
              {usageLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading usage...
                </div>
              ) : usageTier === "smart" ? (
                <div className="text-xs text-muted-foreground">
                  {usageUsed} AI operations today · <span className="text-emerald-600 font-medium">Unlimited</span>
                </div>
              ) : trialExpired ? (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Trial expired</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    Your 30-day free trial has ended. Upgrade to Smart to continue.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Free trial</span>
                    <span className="font-medium">{trialDaysLeft} days remaining</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        trialDaysLeft <= 5 ? "bg-red-500" : trialDaysLeft <= 10 ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(100, (trialDaysLeft / 30) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {usageUsed} AI operations today · Unlimited during trial
                  </p>
                </div>
              )}

              {/* Connect account (anonymous only) */}
              {usageTier === "anonymous" && (
                <div className="pt-1 space-y-3">
                  <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
                    <p className="text-xs font-medium mb-1">Connect to Reattend</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Go to <a href="https://www.reattend.com/app/desktop" target="_blank" rel="noopener" className="text-indigo-600 hover:underline font-medium">reattend.com/app/desktop</a>, generate a token, and paste it below.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tokenInput}
                        onChange={(e) => {
                          setTokenInput(e.target.value);
                          setConnectError("");
                        }}
                        placeholder="Paste your token here"
                        className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <Button
                        size="sm"
                        onClick={handleConnectToken}
                        disabled={connecting || !tokenInput.trim()}
                      >
                        {connecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Connect"
                        )}
                      </Button>
                    </div>
                    {connectError && (
                      <p className="text-xs text-red-500 mt-1">{connectError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Disconnect (only if connected) */}
              {usageTier !== "anonymous" && (
                <div className="flex items-center justify-between border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Connected as {profileEmail || profileName || "user"}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : null}
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Preferences Tab ───────────────────────────────────── */}
        {activeTab === "preferences" && (
          <div className="space-y-4">
            {/* Theme */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {theme === "dark" ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Dark Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Toggle between light and dark theme
                    </p>
                  </div>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </div>

            {/* AI Behavior */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">AI Behavior</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Auto-triage inbox items</p>
                  <p className="text-xs text-muted-foreground">
                    AI automatically processes new captures
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Auto-link memories</p>
                  <p className="text-xs text-muted-foreground">
                    AI automatically finds relationships between memories
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>
            </div>

          </div>
        )}

        {/* ── Permissions Tab ──────────────────────────────────── */}
        {activeTab === "permissions" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-sm font-semibold mb-1">System Permissions</p>

              {permLoading ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Checking...</span>
                </div>
              ) : navigator.platform?.toLowerCase().includes("win") ? (
                /* ── Windows ── */
                <div className="py-4 space-y-3">
                  <p className="text-xs text-muted-foreground mb-4">
                    Windows doesn't require special permissions. Screen text is extracted via server-side OCR (internet required).
                  </p>
                  {/* Screen Capture health */}
                  <div className={cn(
                    "p-4 rounded-lg border",
                    captureWorking === false
                      ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-emerald-200 dark:border-emerald-800/50"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        captureWorking === false ? "bg-amber-100 dark:bg-amber-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                      )}>
                        {captureWorking === false ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Screen Capture</p>
                        <p className="text-xs text-muted-foreground">
                          {captureWorking === false
                            ? "Not working — check your internet connection"
                            : captureWorking === true
                              ? "Working — screen text is being captured"
                              : "No special permissions needed on Windows"}
                        </p>
                      </div>
                      {captureWorking === false && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingCapture}
                          onClick={async () => {
                            setRetryingCapture(true);
                            try {
                              const result = await retryCaptureTest();
                              setCaptureWorking(result.status === "healthy");
                            } catch { setCaptureWorking(false); }
                            finally { setRetryingCapture(false); }
                          }}
                        >
                          {retryingCapture ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Microphone */}
                  <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-900/30">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Microphone</p>
                        <p className="text-xs text-muted-foreground">Windows will prompt for microphone access when you start a meeting recording.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              /* ── macOS ── */
              <>
              <p className="text-xs text-muted-foreground mb-4">
                Reattend needs these macOS permissions to work. Without them, it can't capture your screen or record meetings.
              </p>

              <div className="space-y-4">
                {/* Screen Recording */}
                {(() => {
                  // Permission granted AND capture working = green
                  // Permission granted BUT capture broken = amber (stale permission)
                  // Permission not granted = red
                  const isStale = screenPerm && captureWorking === false;
                  const isOk = screenPerm && captureWorking !== false;
                  const borderClass = !screenPerm
                    ? "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20"
                    : isStale
                      ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-emerald-200 dark:border-emerald-800/50";
                  const iconBgClass = !screenPerm
                    ? "bg-red-100 dark:bg-red-900/30"
                    : isStale
                      ? "bg-amber-100 dark:bg-amber-900/30"
                      : "bg-emerald-100 dark:bg-emerald-900/30";

                  return (
                    <div className={cn("p-4 rounded-lg border", borderClass)}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", iconBgClass)}>
                          {!screenPerm ? (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          ) : isStale ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Screen Recording</p>
                          <p className="text-xs text-muted-foreground">
                            {!screenPerm
                              ? "Not granted — Reattend can't read your screen"
                              : isStale
                                ? "Permission granted but capture isn't working — toggle it off and on in System Settings, then restart"
                                : isOk
                                  ? "Granted — screen text is being captured"
                                  : "Granted — checking capture..."}
                          </p>
                        </div>
                      </div>
                      {!screenPerm && (
                        <div className="ml-11 space-y-2">
                          <div className="text-xs text-muted-foreground space-y-1.5">
                            <p className="font-medium text-foreground">How to enable:</p>
                            <p>1. Click the button below to open System Settings</p>
                            <p>2. Find <span className="font-medium text-foreground">Reattend</span> in the list</p>
                            <p>3. Toggle it <span className="font-medium text-foreground">ON</span></p>
                            <p>4. Restart Reattend when prompted</p>
                          </div>
                          <Button size="sm" onClick={() => openPrivacySettings("screen")} className="mt-2">
                            Open Screen Recording Settings
                          </Button>
                        </div>
                      )}
                      {isStale && (
                        <div className="ml-11 mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPrivacySettings("screen")}
                          >
                            Open Settings
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retryingCapture}
                            onClick={async () => {
                              setRetryingCapture(true);
                              try {
                                const result = await retryCaptureTest();
                                setCaptureWorking(result.status === "healthy");
                              } catch { setCaptureWorking(false); }
                              finally { setRetryingCapture(false); }
                            }}
                          >
                            {retryingCapture ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                            Retry Capture
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Microphone */}
                <div className={cn(
                  "p-4 rounded-lg border",
                  micPerm ? "border-emerald-200 dark:border-emerald-800/50" : "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20"
                )}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      micPerm ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"
                    )}>
                      {micPerm ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Microphone</p>
                      <p className="text-xs text-muted-foreground">
                        {micPerm
                          ? "Granted — meeting recording is available"
                          : "Not granted — meeting recording won't work"}
                      </p>
                    </div>
                  </div>
                  {!micPerm && (
                    <div className="ml-11 space-y-2">
                      <div className="text-xs text-muted-foreground space-y-1.5">
                        <p className="font-medium text-foreground">How to enable:</p>
                        <p>1. Click the button below to open System Settings</p>
                        <p>2. Find <span className="font-medium text-foreground">Reattend</span> in the list</p>
                        <p>3. Toggle it <span className="font-medium text-foreground">ON</span></p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPrivacySettings("mic")}
                        className="mt-2"
                      >
                        Open Microphone Settings
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={fetchPermissions}
                  disabled={permLoading}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", permLoading && "animate-spin")} />
                  Re-check Permissions
                </Button>
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* ── Chat Tab ──────────────────────────────────────────── */}
        {activeTab === "chat" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Chat History</p>
              <p className="text-xs text-muted-foreground">
                Chat threads are kept for a rolling 30 days. You can delete all
                conversations below.
              </p>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    {threadCount} conversation
                    {threadCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingChats || threadCount === 0}
                  onClick={async () => {
                    setDeletingChats(true);
                    try {
                      await deleteAllThreads();
                      setChatsDeleted(true);
                      setTimeout(() => setChatsDeleted(false), 2000);
                    } catch {}
                    setDeletingChats(false);
                  }}
                >
                  {deletingChats ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : chatsDeleted ? (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {chatsDeleted ? "Deleted" : "Delete All Chats"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Retention</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Rolling 30-day window</p>
                  <p className="text-xs text-muted-foreground">
                    Older threads are automatically removed
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Active
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* ── Agent Logs Tab ────────────────────────────────────── */}
        {activeTab === "agent" && (() => {
          const filteredJobs = jobFilter === "all"
            ? jobs
            : jobFilter === "pending"
              ? jobs.filter((j) => j.status === "pending" || j.status === "running" || j.status === "failed")
              : jobs.filter((j) => j.status === "completed");
          const totalPages = Math.max(1, Math.ceil(jobCounts.total / PAGE_SIZE));

          return (
          <div className="space-y-4">
            {/* Manual actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRelink}
                disabled={relinking}
              >
                {relinking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Re-link All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRebuild}
                disabled={rebuilding}
              >
                {rebuilding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                )}
                Rebuild Embeddings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchJobs()}
                disabled={jobsLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    jobsLoading && "animate-spin"
                  )}
                />
              </Button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              {([
                { value: "all", label: "All", count: jobCounts.total },
                { value: "pending", label: "Pending", count: jobCounts.pending + jobCounts.failed },
                { value: "completed", label: "Completed", count: jobCounts.completed },
              ] as const).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setJobFilter(f.value)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                    jobFilter === f.value
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className={cn(
                    "inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-medium",
                    jobFilter === f.value
                      ? f.value === "pending" && f.count > 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                      : "bg-muted/70 text-muted-foreground"
                  )}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Jobs list */}
            {jobsLoading && jobs.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {jobFilter === "all" ? "No jobs yet" : `No ${jobFilter} jobs`}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-card p-2.5 text-sm",
                      job.status === "failed" && "border-red-200 dark:border-red-900/40"
                    )}
                  >
                    {jobStatusIcon(job.status)}
                    <Badge
                      variant="outline"
                      className="text-[10px] capitalize shrink-0"
                    >
                      {job.job_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {job.status === "failed" && job.last_error
                        ? job.last_error.slice(0, 50)
                        : (() => {
                            try {
                              const p = JSON.parse(job.payload);
                              return (p.record_id || p.raw_item_id || "").slice(0, 8) + "...";
                            } catch {
                              return job.payload.slice(0, 30);
                            }
                          })()}
                    </span>
                    {job.attempts > 1 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {job.attempts}/{job.max_attempts}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        job.status === "completed" &&
                          "border-emerald-500/20 text-emerald-600",
                        job.status === "failed" &&
                          "border-red-500/20 text-red-600",
                        job.status === "running" &&
                          "border-blue-500/20 text-blue-600"
                      )}
                    >
                      {job.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Page {jobPage + 1} of {totalPages} ({jobCounts.total} total)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={jobPage === 0 || jobsLoading}
                    onClick={() => { const p = jobPage - 1; setJobPage(p); fetchJobs(p); }}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={jobPage >= totalPages - 1 || jobsLoading}
                    onClick={() => { const p = jobPage + 1; setJobPage(p); fetchJobs(p); }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ── About Tab ─────────────────────────────────────────── */}
        {activeTab === "about" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/logo.svg"
                  alt="Reattend"
                  className="h-10 w-10 dark:invert"
                />
                <div>
                  <p className="font-semibold">Reattend Desktop</p>
                  <p className="text-xs text-muted-foreground">
                    v{appVersion || "..."} · Local-first AI memory
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-native shared memory & decision OS. Captures raw moments,
                enriches them with AI, and links them into a living memory
                graph.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Changelog
              </p>
              <div className="space-y-4">
                {[
                  {
                    version: "0.1.10",
                    date: "Mar 9, 2026",
                    changes: [
                      "In-app update button in topbar — never miss an update",
                      "Changelog in Settings > About",
                    ],
                  },
                  {
                    version: "0.1.9",
                    date: "Mar 9, 2026",
                    changes: [
                      "Capture health monitoring — get notified if screen capture stops",
                      "Enhanced writing assist: grammar, contradiction & fact checking",
                      "Categorized popup UI (color-coded by type)",
                      "Startup capture test — detects broken permissions immediately",
                    ],
                  },
                  {
                    version: "0.1.8",
                    date: "Mar 9, 2026",
                    changes: [
                      "In-app auto-updater (Rust-side update check)",
                      "Fixed screen capture dedup bug — much more reliable capture",
                      "Landing page overhaul — Download for Mac CTA everywhere",
                    ],
                  },
                  {
                    version: "0.1.7",
                    date: "Mar 8, 2026",
                    changes: [
                      "Meeting recording & transcription via mic",
                      "Share meeting notes via email/link",
                      "Transcripts page with dedicated view",
                      "Writing assist (Grammarly-like memory popups)",
                      "Auto-stop meeting after 5 min silence",
                    ],
                  },
                ].map((release) => (
                  <div key={release.version}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold">v{release.version}</span>
                      <span className="text-[10px] text-muted-foreground">{release.date}</span>
                    </div>
                    <ul className="space-y-1">
                      {release.changes.map((c, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Keyboard Shortcuts
              </p>
              <div className="space-y-2 text-xs">
                {[
                  ["Quick Capture", "⌘K"],
                  ["Save Selection", "⌘⇧S"],
                  ["Start/Stop Meeting", "⌘⇧M"],
                  ["Open Reattend", "⌘⇧O"],
                  ["Board: Delete Node", "Backspace"],
                ].map(([label, shortcut]) => (
                  <div
                    key={label}
                    className="flex justify-between text-muted-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <Keyboard className="h-3 w-3" />
                      {label}
                    </span>
                    <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
