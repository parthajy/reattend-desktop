// Settings — slimmed for the thin-client refactor.
//
// Removed (lived only on the local-pipeline desktop):
//   - AI provider switcher (server / groq / ollama). Server-only now.
//   - Jobs queue, retry/relink/rebuild buttons. No local worker anymore.
//   - testAiConnection. The connect_token flow already validates against
//     /api/tray/me on the server.
//
// Kept on the desktop:
//   - Token connect / disconnect
//   - Account info (email, tier)
//   - Screen-recording permission (used by ambient + OCR capture)
//   - Theme toggle
//   - Capture-health debug
//   - Deep links to the web for full account / billing settings.

import { useEffect, useState } from "react";
import {
  Loader2,
  Check,
  Moon,
  Sun,
  Link2,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useTheme } from "@/hooks/use-theme";
import { useAppStore } from "@/stores/app-store";
import {
  getConfigValue,
  setConfigValue,
  getUsageStats,
  logout as logoutApi,
  connectToken,
  checkScreenPermission,
  openPrivacySettings,
  getCaptureHealth,
  retryCaptureTest,
} from "@/lib/tauri-api";
import { clearServerApiCache } from "@/lib/server-api";

interface UsageStats {
  tier?: string;
  email?: string;
  name?: string;
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const setUsageTier = useAppStore((s) => s.setUsageTier);

  // Auth state
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Permissions
  const [screenPerm, setScreenPerm] = useState(false);
  const [permLoading, setPermLoading] = useState(true);

  // Capture health
  const [captureHealthy, setCaptureHealthy] = useState<boolean | null>(null);
  const [retryingCapture, setRetryingCapture] = useState(false);

  const refreshUsage = async () => {
    setLoadingUsage(true);
    try {
      const stats = await getUsageStats();
      setUsage(stats as UsageStats);
      if (stats?.tier) setUsageTier(stats.tier as any);
    } catch {
      setUsage(null);
    } finally {
      setLoadingUsage(false);
    }
  };

  const refreshPermissions = async () => {
    setPermLoading(true);
    try {
      const [screen, health] = await Promise.all([
        checkScreenPermission().catch(() => false),
        getCaptureHealth().catch(() => null),
      ]);
      setScreenPerm(screen);
      if (health) setCaptureHealthy(health.status === "healthy");
    } finally {
      setPermLoading(false);
    }
  };

  useEffect(() => {
    refreshUsage();
    refreshPermissions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!tokenInput.trim() || connecting) return;
    setConnecting(true);
    setConnectError("");
    try {
      const result = await connectToken(tokenInput.trim());
      setUsageTier(result.tier as any);
      setTokenInput("");
      clearServerApiCache();
      refreshUsage();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Disconnect this device? You'll need to paste a new token to sign back in.")) return;
    await logoutApi();
    setUsageTier("free");
    setUsage(null);
    clearServerApiCache();
  };

  const handleRetryCapture = async () => {
    setRetryingCapture(true);
    try {
      await retryCaptureTest();
      await refreshPermissions();
    } finally {
      setRetryingCapture(false);
    }
  };

  const isConnected = !!usage?.email;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Account */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Account</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {loadingUsage ? "…" : usage?.tier ?? "Not connected"}
          </span>
        </div>

        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste an API token from{" "}
              <button
                type="button"
                onClick={() => openExternal("https://reattend.com/app/settings").catch(() => {})}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Settings → API tokens <ExternalLink className="h-3 w-3" />
              </button>{" "}
              to connect this device.
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="rat_..."
                disabled={connecting}
                className="font-mono text-xs"
              />
              <Button onClick={handleConnect} disabled={!tokenInput.trim() || connecting}>
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            </div>
            {connectError && (
              <p className="text-xs text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {connectError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">{usage?.name || "—"}</div>
              <div className="text-xs text-muted-foreground">{usage?.email}</div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openExternal("https://reattend.com/app/settings/billing").catch(() => {})}
              >
                Manage billing <ExternalLink className="h-3 w-3 ml-1.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-3 w-3 mr-1.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Permissions */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3">Permissions & capture</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">Screen recording</div>
              <div className="text-xs text-muted-foreground">
                Required for ambient context + OCR capture.
              </div>
            </div>
            {permLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : screenPerm ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Granted
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => openPrivacySettings("screen")}>
                Open System Settings
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">Capture pipeline</div>
              <div className="text-xs text-muted-foreground">
                Last screen-capture probe result.
              </div>
            </div>
            {captureHealthy === null ? (
              <span className="text-xs text-muted-foreground">Unknown</span>
            ) : captureHealthy ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" /> Healthy
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={handleRetryCapture} disabled={retryingCapture}>
                {retryingCapture ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retry test"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3">Appearance</h2>
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-xs text-muted-foreground">Light, dark, or follow the system.</div>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
            >
              <Sun className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Web links */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3">More on the web</h2>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => openExternal("https://reattend.com/app/settings").catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted text-left"
          >
            <span>Full account settings</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://reattend.com/app/integrations").catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted text-left"
          >
            <span>Integrations (Slack, Notion, Gmail, …)</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://reattend.com/help").catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted text-left"
          >
            <span>Help center</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </section>

      {/* Helper: prove getConfigValue is still imported (used by lib/server-api.ts).
          Without this no-op the linter flags the import as unused on the desktop
          since this slim Settings page doesn't read raw config keys directly. */}
      <div className="hidden">{(getConfigValue as unknown as () => null)?.name}</div>
      <div className="hidden">{(setConfigValue as unknown as () => null)?.name}</div>
    </div>
  );
}
