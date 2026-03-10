import { useState, useRef, useEffect } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";

interface TextData {
  content: string;
  linkedMemory?: { id: string; title: string; type: string };
  onContentChange?: (id: string, content: string) => void;
}

export function TextNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextData;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.content || "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
    }
  }, [editing]);

  function handleBlur() {
    setEditing(false);
    d.onContentChange?.(id, text);
  }

  return (
    <div
      className="rounded-lg border bg-background px-4 py-3 min-w-[120px] transition-shadow"
      style={{ boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined }}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
      {editing ? (
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Escape" && handleBlur()}
          className="w-full bg-transparent resize-none text-sm outline-none min-h-[40px]"
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">
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
