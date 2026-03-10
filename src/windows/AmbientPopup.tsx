import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Brain,
  X,
  Sparkles,
  Clock,
  Scale,
  Lightbulb,
  Users,
  Mic,
  Flame,
  FileText,
  CircleCheckBig,
  PenLine,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

interface AmbientSource {
  id: string;
  title: string;
  type: string;
}

interface WritingCorrection {
  original: string;
  suggested: string;
  reason: string;
  type: "fact" | "contradiction";
}

interface AmbientData {
  insight: string;
  sources: AmbientSource[];
  category?: string;
  corrections?: WritingCorrection[];
  writing_assist?: boolean;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  decision: Scale,
  insight: Lightbulb,
  meeting: Users,
  transcript: Mic,
  idea: Flame,
  context: FileText,
  tasklike: CircleCheckBig,
  note: PenLine,
};

const typeColors: Record<string, string> = {
  decision: "text-violet-500",
  insight: "text-emerald-500",
  meeting: "text-blue-500",
  transcript: "text-pink-500",
  idea: "text-amber-500",
  context: "text-slate-500",
  tasklike: "text-red-500",
  note: "text-gray-500",
};

const categoryConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string }> = {
  contradiction: { icon: AlertTriangle, label: "Contradiction", color: "text-amber-600", bg: "from-amber-500/5 to-orange-500/5" },
  fact: { icon: AlertTriangle, label: "Fact Check", color: "text-red-600", bg: "from-red-500/5 to-rose-500/5" },
  context: { icon: Sparkles, label: "Reattend", color: "text-indigo-600", bg: "from-indigo-500/5 to-violet-500/5" },
  memory: { icon: Brain, label: "Memory Match", color: "text-indigo-600", bg: "from-indigo-500/5 to-violet-500/5" },
};

const correctionColors: Record<string, string> = {
  fact: "border-red-200 bg-red-50/50",
  contradiction: "border-amber-200 bg-amber-50/50",
};

export function AmbientPopup() {
  const params = new URLSearchParams(window.location.search);
  const dataJson = params.get("data") || "{}";

  const [data] = useState<AmbientData>(() => {
    try {
      return JSON.parse(decodeURIComponent(dataJson));
    } catch {
      return { insight: "", sources: [] };
    }
  });

  const [dismissed, setDismissed] = useState(false);

  function handleDismiss() {
    setDismissed(true);
    setTimeout(() => getCurrentWindow().close(), 300);
  }

  async function handleSnooze(minutes: number) {
    await invoke("snooze_ambient", { minutes });
    setDismissed(true);
    setTimeout(() => getCurrentWindow().close(), 300);
  }

  if (!data.insight || dismissed) return null;

  const cat = data.category && categoryConfig[data.category]
    ? categoryConfig[data.category]
    : categoryConfig.context;
  const CatIcon = cat.icon;
  const corrections = data.corrections || [];

  return (
    <div className={`h-screen transition-opacity duration-300 ${dismissed ? "opacity-0" : "opacity-100"}`}>
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-2.5 bg-gradient-to-r ${cat.bg} border-b border-gray-100/50`}>
          <div className="flex items-center gap-2">
            <div className={`flex h-5 w-5 items-center justify-center rounded-md ${cat.color.replace("text-", "bg-").replace("600", "500/10")}`}>
              <CatIcon className={`w-3 h-3 ${cat.color}`} />
            </div>
            <span className={`text-[11px] font-bold ${cat.color} tracking-wide uppercase`}>
              {cat.label}
            </span>
          </div>
          <button onClick={handleDismiss} className="p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Insight */}
        <div className="px-4 py-3">
          <p className="text-[13px] text-gray-800 leading-relaxed">
            {data.insight}
          </p>
        </div>

        {/* Corrections (grammar/spelling/fact fixes) */}
        {corrections.length > 0 && (
          <div className="px-4 pb-3">
            <div className="space-y-1.5">
              {corrections.slice(0, 3).map((c, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border ${correctionColors[c.type] || "border-gray-200 bg-gray-50/50"}`}
                >
                  <div className="shrink-0 mt-0.5">
                    {c.type === "contradiction" ? (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="line-through text-gray-400 truncate max-w-[120px]">{c.original}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-gray-300 shrink-0" />
                      <span className="font-medium text-gray-700 truncate max-w-[120px]">{c.suggested}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source memories */}
        {data.sources && data.sources.length > 0 && (
          <div className="px-4 pb-2.5">
            <div className="flex flex-wrap gap-1.5">
              {data.sources.map((s) => {
                const Icon = typeIcons[s.type] || Brain;
                const color = typeColors[s.type] || "text-gray-500";
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <Icon className={`w-3 h-3 ${color} shrink-0`} />
                    <span className="text-[11px] text-gray-600 font-medium truncate max-w-[180px]">
                      {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-gray-400" />
            <button
              onClick={() => handleSnooze(30)}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              30m
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
            onClick={handleDismiss}
            className="text-[11px] font-medium text-gray-400 hover:text-indigo-500 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
