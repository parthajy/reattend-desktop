import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Check, Loader2, Settings, Key } from "lucide-react";

export function SettingsWindow() {
  const [apiUrl, setApiUrl] = useState("https://reattend.com");
  const [apiToken, setApiToken] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await invoke<{ api_url: string; api_token: string }>("get_config");
      setApiUrl(config.api_url || "https://reattend.com");
      setApiToken(config.api_token || "");
    } catch {
      // Use defaults
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      await invoke("save_config", {
        config: { api_url: apiUrl, api_token: apiToken },
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  function handleClose() {
    getCurrentWindow().close();
  }

  if (loading) {
    return (
      <div className="h-screen bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-[#4F46E5]" />
          <span className="text-[13px] font-semibold text-gray-700">Settings</span>
        </div>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="flex-1 flex flex-col p-4 gap-4">
        <div>
          <label className="text-[12px] font-semibold text-gray-600 mb-1.5 block">API URL</label>
          <input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </div>

        <div>
          <label className="text-[12px] font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
            <Key className="w-3 h-3" /> API Token
          </label>
          <input
            type="password"
            placeholder="rat_..."
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            Generate a token in your Reattend dashboard under Settings.
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="text-[12px]">
            {status === "saved" && <span className="text-emerald-600">Settings saved</span>}
            {status === "error" && <span className="text-red-500">Failed to save</span>}
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[13px] font-semibold transition-colors disabled:opacity-40"
          >
            {status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {status === "saved" && <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </form>

      {/* Shortcuts info */}
      <div className="px-4 pb-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-2">KEYBOARD SHORTCUTS</p>
          {(() => {
            const mod = /Mac/.test(navigator.userAgent) ? "⌘⇧" : "Ctrl+Shift+";
            return (
              <div className="space-y-1 text-[12px]">
                <div className="flex justify-between text-gray-600">
                  <span>Quick Capture</span>
                  <kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[11px] font-mono">{mod}R</kbd>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Ask AI</span>
                  <kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[11px] font-mono">{mod}A</kbd>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Save Selection</span>
                  <kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[11px] font-mono">{mod}S</kbd>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
