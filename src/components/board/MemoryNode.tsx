import { type NodeProps, Handle, Position } from "@xyflow/react";
import { Brain } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  decision: "#3b82f6",
  insight: "#a855f7",
  meeting: "#22c55e",
  idea: "#eab308",
  context: "#6366f1",
  tasklike: "#f43f5e",
  note: "#94a3b8",
};

interface MemoryData {
  title: string;
  summary: string;
  recordType: string;
}

export function MemoryNode({ data, selected }: NodeProps) {
  const d = data as unknown as MemoryData;
  const borderColor = TYPE_COLORS[d.recordType] || "#94a3b8";

  return (
    <div
      className="rounded-lg border-2 bg-background px-3 py-2.5 min-w-[160px] max-w-[220px] shadow-sm transition-shadow"
      style={{
        borderColor,
        boxShadow: selected ? `0 0 0 2px ${borderColor}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <Brain className="w-3 h-3" style={{ color: borderColor }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: borderColor }}
        >
          {d.recordType}
        </span>
      </div>
      <p className="text-xs font-medium leading-snug line-clamp-2">
        {d.title}
      </p>
      {d.summary && (
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
          {d.summary}
        </p>
      )}
    </div>
  );
}
