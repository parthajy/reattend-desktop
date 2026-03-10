import { useState, useEffect } from "react";
import { searchRecords, getRecords } from "@/lib/tauri-api";
import type { Record as MemoryRecord } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Brain, Loader2 } from "lucide-react";

interface LinkMemoryDialogProps {
  open: boolean;
  onSelect: (record: MemoryRecord) => void;
  onCancel: () => void;
}

export function LinkMemoryDialog({
  open,
  onSelect,
  onCancel,
}: LinkMemoryDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Load initial records when opened
  useEffect(() => {
    if (open) {
      setLoading(true);
      getRecords({ limit: 20 })
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setLoading(true);
      getRecords({ limit: 20 })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    try {
      const r = await searchRecords(q.trim());
      setResults(r);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Link Memory</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Search for a memory to link to this node.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search memories..."
            className="pl-8 text-sm"
          />
        </div>
        <ScrollArea className="max-h-[240px]">
          <div className="space-y-1">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No memories found
              </p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onSelect(r);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex items-start gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Brain className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
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
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
