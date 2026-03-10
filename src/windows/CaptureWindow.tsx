import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Send, X, Loader2, Check } from "lucide-react";

export function CaptureWindow() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setStatus("sending");
    try {
      await invoke("capture_text", { text: text.trim(), source: "tray-manual" });
      setStatus("done");
      setTimeout(() => getCurrentWindow().close(), 800);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  function handleClose() {
    getCurrentWindow().close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") handleClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="h-screen bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100"
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
          <span className="text-[13px] font-semibold text-gray-700">Quick Capture</span>
        </div>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4" onKeyDown={handleKeyDown}>
        <textarea
          autoFocus
          placeholder="What's on your mind? Decision, idea, note..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 resize-none text-[14px] text-gray-800 placeholder-gray-400 bg-transparent outline-none leading-relaxed"
        />

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
          <span className="text-[11px] text-gray-400">
            {status === "error" ? "Failed to save. Try again." : `${/Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+Enter to save`}
          </span>
          <button
            type="submit"
            disabled={!text.trim() || status === "sending"}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
              status === "done"
                ? "bg-emerald-500 text-white"
                : "bg-[#4F46E5] hover:bg-[#4338CA] text-white disabled:opacity-40"
            }`}
          >
            {status === "sending" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {status === "done" && <Check className="w-3.5 h-3.5" />}
            {status === "idle" && <Send className="w-3.5 h-3.5" />}
            {status === "error" && <Send className="w-3.5 h-3.5" />}
            {status === "done" ? "Saved" : "Capture"}
          </button>
        </div>
      </form>
    </div>
  );
}
