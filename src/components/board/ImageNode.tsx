import { type NodeProps, Handle, Position } from "@xyflow/react";

interface ImageData {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export function ImageNode({ data, selected }: NodeProps) {
  const d = data as unknown as ImageData;

  return (
    <div
      className="rounded-xl overflow-hidden bg-background shadow-md transition-shadow"
      style={{
        boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
        maxWidth: d.width || 300,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      {d.src ? (
        <img
          src={d.src}
          alt={d.alt || "Board image"}
          className="block w-full h-auto object-cover"
          style={{ maxHeight: d.height || 400 }}
          draggable={false}
        />
      ) : (
        <div className="w-[200px] h-[140px] flex items-center justify-center text-muted-foreground text-xs">
          No image
        </div>
      )}
    </div>
  );
}
