// Floating settings window — the only "real page" in the tray-only app.
//
// Two states:
//   1. Not connected → just a token-paste field. Pasting a valid Pro/Ent
//      rat_… token validates against /api/tray/me, caches user info +
//      active context, and flips to state 2.
//   2. Connected → shows email, tier, trial info, and three links:
//      open dashboard / billing / disconnect.
//
// Theme is system-following (no explicit toggle here — the window is small
// enough that the OS appearance setting is enough). Add later if asked.

import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  X, Check, Loader2, Settings, Key, ExternalLink, LogOut, AlertCircle, Sparkles,
} from "lucide-react";
import { connectToken, getConfigValue, logout, getUsageStats } from "@/lib/tauri-api";
import { clearServerApiCache } from "@/lib/server-api";

interface AccountState {
  email: string;
  name: string;
  tier: string;
  serverUrl: string;
}

export function SettingsWindow() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [token, email, name, tier, serverUrl] = await Promise.all([
        getConfigValue("auth_token"),
        getConfigValue("user_email"),
        getConfigValue("user_name"),
        getConfigValue("tier"),
        getConfigValue("server_url"),
      ]);
      const url = (serverUrl || "https://reattend.com").replace(/\/+$/, "");
      if (token && email) {
        setAccount({ email, name: name || "", tier: tier || "free", serverUrl: url });
        // Best-effort live refresh of tier (in case it changed server-side)
        try {
          const live = await getUsageStats() as { tier?: string };
          if (live?.tier) setAccount((prev) => prev ? { ...prev, tier: live.tier! } : prev);
        } catch { /* silent */ }
      } else {
        setAccount(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim() || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      await connectToken(tokenInput.trim());
      setTokenInput("");
      clearServerApiCache();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect this device? You'll need a new token to sign back in.")) return;
    await logout();
    clearServerApiCache();
    setAccount(null);
  }

  const dashboardUrl = `${account?.serverUrl ?? "https://reattend.com"}/app`;
  const tokenPageUrl = `${account?.serverUrl ?? "https://reattend.com"}/app/settings`;
  const billingUrl = `${account?.serverUrl ?? "https://reattend.com"}/app/settings/billing`;

  return (
    <div className="h-screen bg-white/95 backdrop-blur-xl flex flex-col overflow-hidden font-sans dark:bg-zinc-900/95 dark:text-zinc-100">
      {/* Title bar — drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <Settings className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[13px] font-semibold">Reattend</span>
        </div>
        <button
          type="button"
          onClick={() => getCurrentWindow().close()}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          </div>
        ) : !account ? (
          <ConnectForm
            tokenInput={tokenInput}
            setTokenInput={setTokenInput}
            connecting={connecting}
            error={error}
            onSubmit={handleConnect}
            tokenPageUrl={tokenPageUrl}
          />
        ) : (
          <ConnectedView
            account={account}
            onDisconnect={handleDisconnect}
            dashboardUrl={dashboardUrl}
            billingUrl={billingUrl}
            justSaved={justSaved}
          />
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 shrink-0 flex items-center justify-between">
        <span>⌘⇧R Capture · ⌘⇧A Ask · ⌘⇧O Dashboard</span>
        <span className="font-mono">tray-only</span>
      </div>
    </div>
  );
}

function ConnectForm({
  tokenInput,
  setTokenInput,
  connecting,
  error,
  onSubmit,
  tokenPageUrl,
}: {
  tokenInput: string;
  setTokenInput: (v: string) => void;
  connecting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  tokenPageUrl: string;
}) {
  return (
    <>
      <div>
        <h2 className="text-[15px] font-semibold mb-1">Connect this Mac</h2>
        <p className="text-[12.5px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Paste an API token from your Reattend account. Capture, Ask, and Ambient won't work without one.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
            <Key className="w-3 h-3 inline mr-1" /> API token
          </label>
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="rat_..."
            disabled={connecting}
            spellCheck={false}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        {error && (
          <p className="text-[12px] text-rose-600 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!tokenInput.trim() || connecting}
          className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
        >
          {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
          {connecting ? "Validating…" : "Connect"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => openExternal(tokenPageUrl).catch(() => {})}
        className="text-[12px] text-indigo-600 hover:underline flex items-center gap-1"
      >
        Get a token from Reattend → API tokens <ExternalLink className="w-3 h-3" />
      </button>
    </>
  );
}

function ConnectedView({
  account,
  onDisconnect,
  dashboardUrl,
  billingUrl,
  justSaved,
}: {
  account: AccountState;
  onDisconnect: () => void;
  dashboardUrl: string;
  billingUrl: string;
  justSaved: boolean;
}) {
  const tierLabel =
    account.tier === "professional" ? "Professional"
    : account.tier === "enterprise" ? "Enterprise"
    : "Free";

  return (
    <>
      {justSaved && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 flex items-center gap-2 text-[12.5px] text-emerald-700 dark:text-emerald-300">
          <Check className="w-3.5 h-3.5" /> Connected.
        </div>
      )}

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
          Account
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-800/40">
          <div className="text-[14px] font-medium">{account.name || account.email.split("@")[0]}</div>
          <div className="text-[12px] text-zinc-500 mt-0.5">{account.email}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
            <Sparkles className="w-3 h-3" /> {tierLabel}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
          On the web
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => openExternal(dashboardUrl).catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
          >
            <span>Open Dashboard</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </button>
          <button
            type="button"
            onClick={() => openExternal(billingUrl).catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
          >
            <span>Manage billing</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </button>
          <button
            type="button"
            onClick={() => openExternal(`${account.serverUrl}/help`).catch(() => {})}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
          >
            <span>Help center</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onDisconnect}
          className="text-[12px] text-rose-600 hover:underline flex items-center gap-1.5"
        >
          <LogOut className="w-3 h-3" /> Disconnect this device
        </button>
      </div>
    </>
  );
}
