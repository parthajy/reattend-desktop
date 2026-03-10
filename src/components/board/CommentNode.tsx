import { useState, useRef, useEffect } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";
import { MessageCircle } from "lucide-react";

interface CommentData {
  content: string;
  author?: string;
  onContentChange?: (id: string, content: string) => void;
}

export function CommentNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CommentData;
  const [editing, setEditing] = useState(!d.content);
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
      className="relative"
      style={{ filter: selected ? "drop-shadow(0 0 2px #3b82f6)" : undefined }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />

      {/* Comment bubble */}
      <div
        className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 shadow-sm w-[200px] p-3"
        onDoubleClick={() => setEditing(true)}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <MessageCircle className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Comment
          </span>
        </div>

        {editing ? (
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleBlur();
            }}
            className="w-full bg-transparent resize-none text-xs outline-none leading-relaxed"
            rows={3}
            placeholder="Write a comment..."
            style={{ color: "inherit" }}
          />
        ) : (
          <p className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/80">
            {text || "Double-click to add comment"}
          </p>
        )}
      </div>

      {/* Tail */}
      <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-amber-50 dark:bg-amber-950/40 border-b border-r border-amber-200 dark:border-amber-800/50 rotate-45" />
    </div>
  );
}
