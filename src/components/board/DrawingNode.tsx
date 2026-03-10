import { type NodeProps, Handle, Position } from "@xyflow/react";

interface DrawingData {
  path: string;
  color: string;
  strokeWidth: number;
}

export function DrawingNode({ data, selected }: NodeProps) {
  const d = data as unknown as DrawingData;
  return (
    <div style={{ position: "relative" }}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      <svg
        width="300"
        height="200"
        viewBox="0 0 300 200"
        className="pointer-events-none"
        style={{
          filter: selected ? "drop-shadow(0 0 2px #3b82f6)" : undefined,
        }}
      >
        <path
          d={d.path || ""}
          stroke={d.color || "#1a1a1a"}
          strokeWidth={d.strokeWidth || 2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
