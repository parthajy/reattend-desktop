import { useState, useRef, useEffect } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";
import { Link2, ExternalLink } from "lucide-react";

interface LinkData {
  url: string;
  title?: string;
  content?: string;
  onContentChange?: (id: string, content: string) => void;
}

export function LinkNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LinkData;
  const [editing, setEditing] = useState(!d.url);
  const [url, setUrl] = useState(d.url || "");
  const [title, setTitle] = useState(d.title || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  function handleSave() {
    setEditing(false);
    const displayTitle = title || url;
    d.onContentChange?.(id, JSON.stringify({ url, title: displayTitle }));
  }

  const displayUrl = url
    ? url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";
  const hostname = url
    ? (() => {
        try {
          return new URL(url.startsWith("http") ? url : `https://${url}`)
            .hostname;
        } catch {
          return displayUrl;
        }
      })()
    : "";

  return (
    <div
      className="rounded-xl border bg-background shadow-md transition-shadow w-[220px]"
      style={{
        boxShadow: selected ? "0 0 0 2px #3b82f6" : undefined,
      }}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2"
      />

      {editing ? (
        <div className="p-3 space-y-2">
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleSave();
            }}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleSave();
            }}
          />
          <button
            onClick={handleSave}
            className="w-full px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 shrink-0">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-[10px] text-muted-foreground truncate">
              {hostname || "No URL"}
            </span>
          </div>
          <p className="text-xs font-medium truncate">
            {title || displayUrl || "Double-click to add URL"}
          </p>
          {url && (
            <a
              href={url.startsWith("http") ? url : `https://${url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[10px] text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Open link
            </a>
          )}
        </div>
      )}
    </div>
  );
}
