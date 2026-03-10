import {
  Brain,
  Target,
  Lightbulb,
  MessageSquare,
  Zap,
  FileText,
  ListTodo,
  StickyNote,
  X,
} from "lucide-react";
import { useBoardStore, EDGE_KIND_COLORS } from "@/stores/board-store";
import { cn } from "@/lib/utils";

const NODE_TYPES = [
  { type: "decision", icon: Target, color: "#3b82f6", label: "Decision" },
  { type: "insight", icon: Lightbulb, color: "#f59e0b", label: "Insight" },
  { type: "meeting", icon: MessageSquare, color: "#22c55e", label: "Meeting" },
  { type: "idea", icon: Zap, color: "#a855f7", label: "Idea" },
  { type: "context", icon: FileText, color: "#6366f1", label: "Context" },
  { type: "tasklike", icon: ListTodo, color: "#f43f5e", label: "Task" },
  { type: "note", icon: StickyNote, color: "#94a3b8", label: "Note" },
];

const EDGE_TYPES = [
  { kind: "same_topic", label: "Same Topic", style: "solid" },
  { kind: "depends_on", label: "Depends On", style: "solid" },
  { kind: "contradicts", label: "Contradicts", style: "dashed" },
  { kind: "supports", label: "Supports", style: "solid" },
  { kind: "continuation_of", label: "Continuation", style: "solid" },
  { kind: "causes", label: "Causes", style: "solid" },
  { kind: "temporal", label: "Temporal", style: "solid" },
  { kind: "followup", label: "Follow-up", style: "solid" },
];

export function LegendPanel() {
  const { legendOpen, toggleLegend } = useBoardStore();

  if (!legendOpen) return null;

  return (
    <div className="absolute top-3 right-3 z-10 w-56 bg-background/95 backdrop-blur-xl border rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Legend
        </h3>
        <button
          onClick={toggleLegend}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="p-3 space-y-4 max-h-[400px] overflow-y-auto">
        {/* Memory Types */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Memory Types
          </p>
          <div className="space-y-0.5">
            {NODE_TYPES.map(({ type, icon: Icon, color, label }) => (
              <div
                key={type}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Icon className="h-3 w-3" style={{ color }} />
                </div>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Types */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Relationship Types
          </p>
          <div className="space-y-0.5">
            {EDGE_TYPES.map(({ kind, label, style }) => {
              const color = EDGE_KIND_COLORS[kind] || EDGE_KIND_COLORS.default;
              return (
                <div
                  key={kind}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="w-6 flex items-center justify-center">
                    <svg width="20" height="4" viewBox="0 0 20 4">
                      <line
                        x1="0"
                        y1="2"
                        x2="20"
                        y2="2"
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray={style === "dashed" ? "4,2" : undefined}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <span className="text-xs font-medium">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Board Elements */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Board Elements
          </p>
          <div className="space-y-0.5">
            {[
              { color: "#fef08a", label: "Sticky Note" },
              { color: "#bfdbfe", label: "Text" },
              { color: "#fde68a", label: "Comment" },
              { color: "#e2e8f0", label: "Shape" },
              { color: "#1a1a1a", label: "Drawing", isDraw: true },
            ].map(({ color, label, isDraw }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="w-6 flex items-center justify-center">
                  {isDraw ? (
                    <svg width="20" height="12" viewBox="0 0 20 12">
                      <path
                        d="M2 10 Q 8 0, 18 6"
                        stroke={color}
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <div
                      className="w-5 h-4 rounded-sm border"
                      style={{ backgroundColor: color, borderColor: `${color}cc` }}
                    />
                  )}
                </div>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
