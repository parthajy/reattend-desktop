import {
  Target,
  Lightbulb,
  MessageSquare,
  Zap,
  FileText,
  ListTodo,
  StickyNote,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardStore, EDGE_KIND_COLORS } from "@/stores/board-store";

const NODE_TYPES = [
  { type: "decision", icon: Target, label: "Decisions", color: "text-blue-500" },
  { type: "insight", icon: Lightbulb, label: "Insights", color: "text-amber-500" },
  { type: "meeting", icon: MessageSquare, label: "Meetings", color: "text-emerald-500" },
  { type: "idea", icon: Zap, label: "Ideas", color: "text-violet-500" },
  { type: "context", icon: FileText, label: "Context", color: "text-cyan-500" },
  { type: "tasklike", icon: ListTodo, label: "Tasks", color: "text-rose-500" },
  { type: "note", icon: StickyNote, label: "Notes", color: "text-gray-500" },
];

const EDGE_KINDS = [
  { kind: "same_topic", label: "Same Topic" },
  { kind: "depends_on", label: "Depends On" },
  { kind: "contradicts", label: "Contradicts" },
  { kind: "supports", label: "Supports" },
  { kind: "followup", label: "Follow-up" },
];

export function FiltersPanel() {
  const { typeFilters, edgeFilters, toggleTypeFilter, toggleEdgeFilter, filtersOpen } =
    useBoardStore();

  if (!filtersOpen) return null;

  return (
    <div className="absolute top-3 left-3 z-20 w-56 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Memory Types
        </p>
        <div className="space-y-1">
          {NODE_TYPES.map(({ type, icon: Icon, label, color }) => {
            const hidden = typeFilters[type] === true;
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs transition-colors",
                  hidden
                    ? "text-muted-foreground/40 line-through"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", hidden ? "opacity-30" : color)} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Edge Types
        </p>
        <div className="space-y-1">
          {EDGE_KINDS.map(({ kind, label }) => {
            const hidden = edgeFilters[kind] === true;
            const edgeColor = EDGE_KIND_COLORS[kind] || "#94a3b8";
            return (
              <button
                key={kind}
                onClick={() => toggleEdgeFilter(kind)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs transition-colors",
                  hidden
                    ? "text-muted-foreground/40 line-through"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                <div
                  className={cn("w-4 h-0.5 rounded", hidden && "opacity-30")}
                  style={{ backgroundColor: edgeColor }}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
