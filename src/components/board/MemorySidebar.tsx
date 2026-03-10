import { useState, useEffect } from "react";
import { searchRecords, getRecords } from "@/lib/tauri-api";
import type { Record } from "@/types";
import { Search, Brain, X, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useBoardStore } from "@/stores/board-store";

interface MemorySidebarProps {
  onDragMemory: (record: Record) => void;
}

export function MemorySidebar({ onDragMemory }: MemorySidebarProps) {
  const { sidebarOpen, toggleSidebar } = useBoardStore();
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sidebarOpen) return;
    setLoading(true);
    getRecords({ limit: 50 })
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sidebarOpen]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      getRecords({ limit: 50 }).then(setRecords).catch(() => {});
      return;
    }
    setLoading(true);
    try {
      const r = await searchRecords(query.trim());
      setRecords(r);
    } catch {
      setRecords([]);
    }
    setLoading(false);
  }

  if (!sidebarOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 w-[280px] bg-background border-l shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" />
          Memories
        </h3>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : records.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No memories found
            </p>
          ) : (
            records.map((r) => (
              <div
                key={r.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/reattend-memory",
                    JSON.stringify(r)
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onDragMemory(r)}
                className="flex items-start gap-2 p-2 rounded-lg border cursor-grab hover:bg-accent/30 active:cursor-grabbing transition-colors"
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1 py-0"
                    >
                      {r.type}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium truncate">{r.title}</p>
                  {r.summary && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {r.summary}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2">
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Drag or click to add to board
        </p>
      </div>
    </div>
  );
}
