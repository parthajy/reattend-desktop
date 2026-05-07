// Recent captures — pulls from /api/tray/recent on the server. The
// previous local "raw_items + triage queue" UI is gone with the thin-
// client refactor; triage runs server-side now and the desktop just
// shows what got saved.

import { useEffect, useState } from "react";
import { Inbox, Loader2, ExternalLink, Database, RefreshCw } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { fetchRecent, type RecentRecord } from "@/lib/server-api";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function InboxPage() {
  const [items, setItems] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchRecent(50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 mb-2">
        <Inbox className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent captures
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="ml-auto h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        The latest 50 things you've saved. Tap any to open it on the web.
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Inbox className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p>No captures yet.</p>
          <p className="text-xs mt-1">
            Hit <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">⌘⇧R</kbd> to capture something.
          </p>
        </div>
      )}

      <div className="space-y-1.5 overflow-y-auto">
        {items.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() =>
              openExternal(`https://reattend.com/app/memories/${r.id}`).catch(() => {})
            }
            className="w-full text-left flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors group"
          >
            <Database className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {r.type}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{relativeTime(r.createdAt)}</span>
              </div>
              <div className="text-sm font-medium mt-0.5 truncate">{r.title}</div>
              {r.summary && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.summary}</div>
              )}
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}
