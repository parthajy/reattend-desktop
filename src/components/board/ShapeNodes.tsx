import { type NodeProps, Handle, Position } from "@xyflow/react";

interface ShapeData {
  label?: string;
  color?: string;
  linkedMemory?: { id: string; title: string; type: string };
}

export function RectangleNode({ data, selected }: NodeProps) {
  const d = data as unknown as ShapeData;
  return (
    <div
      className="rounded-lg border-2 flex items-center justify-center"
      style={{
        width: 160,
        height: 100,
        borderColor: d.color || "#94a3b8",
        backgroundColor: d.color ? `${d.color}15` : "#f8fafc",
        boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      {d.label && (
        <span className="text-xs font-medium text-center px-2">{d.label}</span>
      )}
      {d.linkedMemory && (
        <div className="absolute -bottom-2 left-2 right-2 bg-violet-500 text-white rounded-full px-2 py-0.5 text-[8px] font-bold truncate text-center shadow-sm">
          {d.linkedMemory.title}
        </div>
      )}
    </div>
  );
}

export function CircleNode({ data, selected }: NodeProps) {
  const d = data as unknown as ShapeData;
  return (
    <div
      className="rounded-full border-2 flex items-center justify-center"
      style={{
        width: 100,
        height: 100,
        borderColor: d.color || "#94a3b8",
        backgroundColor: d.color ? `${d.color}15` : "#f8fafc",
        boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      {d.label && (
        <span className="text-xs font-medium text-center px-2">{d.label}</span>
      )}
      {d.linkedMemory && (
        <div className="absolute -bottom-2 left-2 right-2 bg-violet-500 text-white rounded-full px-2 py-0.5 text-[8px] font-bold truncate text-center shadow-sm z-10">
          {d.linkedMemory.title}
        </div>
      )}
    </div>
  );
}

export function DiamondNode({ data, selected }: NodeProps) {
  const d = data as unknown as ShapeData;
  return (
    <div className="relative" style={{ width: 100, height: 100 }}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      <div
        className="absolute inset-0 border-2 flex items-center justify-center"
        style={{
          transform: "rotate(45deg)",
          borderColor: d.color || "#94a3b8",
          backgroundColor: d.color ? `${d.color}15` : "#f8fafc",
          borderRadius: 4,
          boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
        }}
      >
        {d.label && (
          <span
            className="text-xs font-medium text-center px-1"
            style={{ transform: "rotate(-45deg)" }}
          >
            {d.label}
          </span>
        )}
      </div>
      {d.linkedMemory && (
        <div className="absolute -bottom-2 left-0 right-0 bg-violet-500 text-white rounded-full px-2 py-0.5 text-[8px] font-bold truncate text-center shadow-sm z-10">
          {d.linkedMemory.title}
        </div>
      )}
    </div>
  );
}
