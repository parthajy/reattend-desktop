import { useState, useEffect } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
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
  ChevronUp,
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

const categoryConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; accent: string; pillBg: string; pillText: string }> = {
  contradiction: { icon: AlertTriangle, label: "Contradiction found", accent: "border-amber-200", pillBg: "bg-amber-50", pillText: "text-amber-700" },
  fact: { icon: AlertTriangle, label: "Fact check", accent: "border-red-200", pillBg: "bg-red-50", pillText: "text-red-700" },
  context: { icon: Sparkles, label: "Memory match", accent: "border-indigo-200", pillBg: "bg-indigo-50", pillText: "text-indigo-700" },
  memory: { icon: Brain, label: "Memory match", accent: "border-indigo-200", pillBg: "bg-indigo-50", pillText: "text-indigo-700" },
};

const correctionColors: Record<string, string> = {
  fact: "border-red-100 bg-red-50/50",
  contradiction: "border-amber-100 bg-amber-50/50",
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
  const [expanded, setExpanded] = useState(false);
  const [entered, setEntered] = useState(false);

  // Slide-in animation on mount
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss after 12 seconds if not expanded
  useEffect(() => {
    if (expanded) return;
    const t = setTimeout(() => {
      if (!expanded) handleDismiss();
    }, 12000);
    return () => clearTimeout(t);
  }, [expanded]);

  // Resize window when expanding/collapsing
  useEffect(() => {
    const win = getCurrentWindow();
    if (expanded) {
      const corrs = data.corrections || [];
      const srcs = data.sources || [];
      // Calculate height based on content
      let h = 120; // base: header + insight + footer
      h += Math.min(data.insight.length / 3, 60); // insight text height estimate
      if (corrs.length > 0) h += corrs.length * 48 + 12;
      if (srcs.length > 0) h += 44;
      h = Math.min(h, 400);
      win.setSize(new LogicalSize(360, h));
    } else {
      win.setSize(new LogicalSize(260, 44));
    }
  }, [expanded]);

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
  const corrections = data.corrections || [];

  // ── Collapsed pill ──
  if (!expanded) {
    return (
      <div className={`h-screen flex items-end justify-end transition-all duration-500 ease-out ${entered ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}`}>
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-full ${cat.pillBg} border ${cat.accent} shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] cursor-pointer group`}
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className={`text-[12px] font-medium ${cat.pillText} max-w-[160px] truncate`}>
            {cat.label}
          </span>
          <ChevronUp className={`w-3 h-3 ${cat.pillText} opacity-0 group-hover:opacity-100 transition-opacity`} />
        </button>
      </div>
    );
  }

  // ── Expanded card ──
  return (
    <div className={`h-screen transition-opacity duration-300 ${dismissed ? "opacity-0" : "opacity-100"}`}>
      <div className={`bg-white/98 backdrop-blur-xl rounded-xl border ${cat.accent} shadow-2xl overflow-hidden`}>
        {/* Header — minimal */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100/60">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className={`text-[11px] font-semibold ${cat.pillText} tracking-wide`}>
              {cat.label}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Insight text */}
        <div className="px-3.5 py-2.5">
          <p className="text-[12.5px] text-gray-700 leading-[1.5]">
            {data.insight}
          </p>
        </div>

        {/* Corrections */}
        {corrections.length > 0 && (
          <div className="px-3.5 pb-2.5">
            <div className="space-y-1.5">
              {corrections.slice(0, 3).map((c, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border ${correctionColors[c.type] || "border-gray-100 bg-gray-50/50"}`}
                >
                  <div className="shrink-0 mt-0.5">
                    {c.type === "contradiction" ? (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="line-through text-gray-400 truncate max-w-[110px]">{c.original}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-gray-300 shrink-0" />
                      <span className="font-medium text-gray-700 truncate max-w-[110px]">{c.suggested}</span>
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
          <div className="px-3.5 pb-2">
            <div className="flex flex-wrap gap-1">
              {data.sources.map((s) => {
                const Icon = typeIcons[s.type] || Brain;
                const color = typeColors[s.type] || "text-gray-400";
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100"
                  >
                    <Icon className={`w-2.5 h-2.5 ${color} shrink-0`} />
                    <span className="text-[10px] text-gray-500 truncate max-w-[140px]">
                      {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer — snooze & dismiss */}
        <div className="px-3.5 py-1.5 border-t border-gray-100/60 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 text-gray-300" />
            {[{ label: "30m", mins: 30 }, { label: "2h", mins: 120 }, { label: "8h", mins: 480 }].map((s, i) => (
              <span key={s.label} className="flex items-center">
                {i > 0 && <span className="text-gray-200 text-[9px] mx-0.5">·</span>}
                <button
                  onClick={() => handleSnooze(s.mins)}
                  className="text-[10px] text-gray-400 hover:text-indigo-500 transition-colors"
                >
                  {s.label}
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={handleDismiss}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
