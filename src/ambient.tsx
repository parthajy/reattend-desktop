import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Brain, X, ChevronRight, Sparkles, Clock } from "lucide-react";

interface AmbientMemory {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  similarity: number;
}

/**
 * Ambient popup — appears at bottom-right when screen content matches existing memories.
 * Shows related memories with snooze option.
 */
export function AmbientPopup() {
  const params = new URLSearchParams(window.location.search);
  const memoriesJson = params.get("memories") || "[]";
  const contextHint = params.get("context") || null;

  const [memories] = useState<AmbientMemory[]>(() => {
    try {
      return JSON.parse(decodeURIComponent(memoriesJson));
    } catch {
      return [];
    }
  });

  const [dismissed, setDismissed] = useState(false);

  function handleClose() {
    getCurrentWindow().close();
  }

  function handleDismiss() {
    setDismissed(true);
    setTimeout(() => getCurrentWindow().close(), 300);
  }

  async function handleSnooze(minutes: number) {
    await invoke("snooze_ambient", { minutes });
    setDismissed(true);
    setTimeout(() => getCurrentWindow().close(), 300);
  }

  if (memories.length === 0 || dismissed) return null;

  const typeColors: Record<string, string> = {
    decision: "text-amber-600",
    meeting: "text-blue-600",
    idea: "text-purple-600",
    insight: "text-emerald-600",
    context: "text-gray-600",
    tasklike: "text-rose-600",
    note: "text-indigo-600",
  };

  return (
    <div className={`h-screen transition-opacity duration-300 ${dismissed ? "opacity-0" : "opacity-100"}`}>
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-[#4F46E5]/5 border-b border-[#4F46E5]/10">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span className="text-[11px] font-semibold text-[#4F46E5]">Related memories found</span>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Context hint — explains WHY this popup appeared */}
        {contextHint && (
          <div className="px-3.5 py-1.5 bg-gray-50/80">
            <p className="text-[11px] text-gray-500 italic">{contextHint}</p>
          </div>
        )}

        {/* Memories */}
        <div className="px-3.5 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
          {memories.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-2 py-1.5 group cursor-default"
            >
              <Brain className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${typeColors[m.type] || "text-gray-500"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{m.title}</p>
                {m.summary && (
                  <p className="text-[11px] text-gray-500 line-clamp-1">{m.summary}</p>
                )}
              </div>
              <ChevronRight className="w-3 h-3 text-gray-300 mt-0.5 shrink-0" />
            </div>
          ))}
        </div>

        {/* Footer with snooze + open */}
        <div className="px-3.5 py-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-gray-400" />
            <button
              onClick={() => handleSnooze(30)}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Snooze 30m
            </button>
            <span className="text-gray-300 text-[10px]">|</span>
            <button
              onClick={() => handleSnooze(120)}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              2h
            </button>
            <span className="text-gray-300 text-[10px]">|</span>
            <button
              onClick={() => handleSnooze(480)}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              8h
            </button>
          </div>
          <button
            onClick={handleClose}
            className="text-[11px] text-gray-400 hover:text-[#4F46E5] transition-colors"
          >
            Open in Reattend →
          </button>
        </div>
      </div>
    </div>
  );
}
