import { useState, useEffect } from "react";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Brain,
  X,
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

const correctionColors: Record<string, string> = {
  fact: "border-red-100 bg-red-50/60",
  contradiction: "border-amber-100 bg-amber-50/60",
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

  // Slide-in animation
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss after 10 seconds if not expanded
  useEffect(() => {
    if (expanded) return;
    const t = setTimeout(() => handleDismiss(), 10000);
    return () => clearTimeout(t);
  }, [expanded]);

  // Resize and reposition window on expand/collapse
  useEffect(() => {
    const win = getCurrentWindow();
    (async () => {
      if (expanded) {
        const corrs = data.corrections || [];
        const srcs = data.sources || [];
        let h = 100;
        h += Math.min(Math.ceil(data.insight.length / 45) * 20, 80);
        if (corrs.length > 0) h += corrs.length * 52 + 8;
        if (srcs.length > 0) h += 36;
        h += 32; // footer
        h = Math.max(h, 160);
        h = Math.min(h, 420);
        const w = 340;
        // Get current position (bottom-right of logo), reposition so expanded card stays on screen
        const pos = await win.outerPosition();
        const factor = await win.scaleFactor();
        const logicalX = pos.x / factor;
        const logicalY = pos.y / factor;
        // Move up and left so the bottom-right corner stays roughly where the logo was
        const newX = logicalX + 36 - w;
        const newY = logicalY + 36 - h;
        await win.setPosition(new LogicalPosition(Math.max(newX, 8), Math.max(newY, 8)));
        await win.setSize(new LogicalSize(w, h));
      } else {
        await win.setSize(new LogicalSize(36, 36));
      }
    })();
  }, [expanded]);

  function handleDismiss() {
    setDismissed(true);
    setTimeout(() => getCurrentWindow().close(), 250);
  }

  async function handleSnooze(minutes: number) {
    await invoke("snooze_ambient", { minutes });
    handleDismiss();
  }

  if (!data.insight || dismissed) return null;

  const corrections = data.corrections || [];

  // ── Collapsed: just the logo ──
  if (!expanded) {
    return (
      <div
        className={`h-screen flex items-end justify-end transition-all duration-500 ease-out ${
          entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <button
          onClick={() => setExpanded(true)}
          className="w-[36px] h-[36px] rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 cursor-pointer overflow-hidden bg-white border border-gray-200/80"
          title="Reattend insight"
        >
          <img src="/ambient.svg" alt="" className="w-full h-full" />
        </button>
      </div>
    );
  }

  // ── Expanded card ──
  return (
    <div className={`h-screen transition-opacity duration-250 ${dismissed ? "opacity-0" : "opacity-100"}`}>
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <img src="/ambient.svg" alt="" className="w-5 h-5 rounded-full" />
            <span className="text-[11px] font-medium text-gray-500">Reattend</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Insight */}
        <div className="px-3 py-2.5">
          <p className="text-[13px] text-gray-800 leading-relaxed">{data.insight}</p>
        </div>

        {/* Corrections */}
        {corrections.length > 0 && (
          <div className="px-3 pb-2.5 space-y-1.5">
            {corrections.slice(0, 3).map((c, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border ${
                  correctionColors[c.type] || "border-gray-100 bg-gray-50/50"
                }`}
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
                    <span className="line-through text-gray-400 truncate max-w-[100px]">{c.original}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-gray-300 shrink-0" />
                    <span className="font-medium text-gray-700 truncate max-w-[100px]">{c.suggested}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{c.reason}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {data.sources && data.sources.length > 0 && (
          <div className="px-3 pb-2">
            <div className="flex flex-wrap gap-1">
              {data.sources.map((s) => {
                const Icon = typeIcons[s.type] || Brain;
                const color = typeColors[s.type] || "text-gray-400";
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-100"
                  >
                    <Icon className={`w-2.5 h-2.5 ${color} shrink-0`} />
                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{s.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 text-gray-300" />
            {[
              { label: "30m", mins: 30 },
              { label: "2h", mins: 120 },
              { label: "8h", mins: 480 },
            ].map((s, i) => (
              <span key={s.label} className="flex items-center">
                {i > 0 && <span className="text-gray-200 text-[9px] mx-0.5">&middot;</span>}
                <button
                  onClick={() => handleSnooze(s.mins)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {s.label}
                </button>
              </span>
            ))}
          </div>
          <button onClick={handleDismiss} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
