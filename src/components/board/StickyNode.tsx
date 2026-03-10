import { useState, useRef, useEffect } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";

interface StickyData {
  content: string;
  color: string;
  linkedMemory?: { id: string; title: string; type: string };
  onContentChange?: (id: string, content: string) => void;
}

export function StickyNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as StickyData;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.content || "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  function handleBlur() {
    setEditing(false);
    d.onContentChange?.(id, text);
  }

  return (
    <div
      className="rounded-lg shadow-md min-w-[140px] min-h-[100px] p-3 transition-shadow"
      style={{
        backgroundColor: d.color || "#fef08a",
        boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
        width: 180,
        height: 140,
      }}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-black/20" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-black/20" />
      {editing ? (
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Escape" && handleBlur()}
          className="w-full h-full bg-transparent resize-none text-xs font-medium outline-none"
          style={{ color: "#1a1a1a" }}
        />
      ) : (
        <p className="text-xs font-medium whitespace-pre-wrap" style={{ color: "#1a1a1a" }}>
          {text || "Double-click to edit"}
        </p>
      )}
      {d.linkedMemory && (
        <div className="absolute -bottom-2 left-2 right-2 bg-violet-500 text-white rounded-full px-2 py-0.5 text-[8px] font-bold truncate text-center shadow-sm">
          {d.linkedMemory.title}
        </div>
      )}
    </div>
  );
}
