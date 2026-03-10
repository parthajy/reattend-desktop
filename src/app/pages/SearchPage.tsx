import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { searchRecords, getRecords } from "@/lib/tauri-api";
import type { Record as MemoryRecord } from "@/types";
import {
  Search,
  Loader2,
  Brain,
  Target,
  Lightbulb,
  MessageSquare,
  Zap,
  FileText,
  ListTodo,
  StickyNote,
  Clock,
  Sparkles,
  X,
} from "lucide-react";

const TYPE_CONFIG: {
  [key: string]: {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    label: string;
  };
} = {
  decision: { icon: Target, color: "text-blue-500", bg: "bg-blue-500/10", label: "Decision" },
  insight: { icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10", label: "Insight" },
  meeting: { icon: MessageSquare, color: "text-green-500", bg: "bg-green-500/10", label: "Meeting" },
  idea: { icon: Zap, color: "text-purple-500", bg: "bg-purple-500/10", label: "Idea" },
  context: { icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10", label: "Context" },
  tasklike: { icon: ListTodo, color: "text-rose-500", bg: "bg-rose-500/10", label: "Task" },
  note: { icon: StickyNote, color: "text-slate-500", bg: "bg-slate-500/10", label: "Note" },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.note;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[]>([]);
  const [recent, setRecent] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load recent memories on mount
  useEffect(() => {
    getRecords({ limit: 10 })
      .then(setRecent)
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  // Debounced search as you type
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await searchRecords(q.trim());
      setResults(r);
    } catch (e) {
      console.error("[search] Failed:", e);
      setError(String(e));
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const showResults = query.trim().length > 0;
  const displayList = showResults ? results : recent;
  const hasResults = displayList.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your memories..."
              className="w-full pl-12 pr-10 py-3.5 rounded-2xl border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {loading && (
              <div className="absolute right-12 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {/* Error message */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
              Search failed: {error}
            </div>
          )}

          {/* Section header */}
          {hasResults && (
            <div className="flex items-center gap-2 mb-3 px-1">
              {showResults ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
                  </span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Recent memories
                  </span>
                </>
              )}
            </div>
          )}

          {/* Result cards */}
          {hasResults ? (
            <div className="space-y-1.5">
              {displayList.map((r) => {
                const tc = getTypeConfig(r.type);
                const Icon = tc.icon;
                const tags = parseTags(r.tags);

                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/memories/${r.id}`)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-border/50 bg-card/60 hover:bg-violet-50/50 dark:hover:bg-violet-500/5 hover:border-violet-200 dark:hover:border-violet-500/20 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Type icon */}
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${tc.bg}`}>
                        <Icon className={`h-4 w-4 ${tc.color}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                            {r.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">
                            {timeAgo(r.created_at)}
                          </span>
                        </div>
                        {r.summary && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {r.summary}
                          </p>
                        )}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                            {tags.length > 4 && (
                              <span className="text-[10px] text-muted-foreground/50">
                                +{tags.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : showResults && !loading ? (
            <div className="text-center py-16">
              <Brain className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No results for "<span className="font-medium">{query}</span>"
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try different keywords or check spelling
              </p>
            </div>
          ) : !showResults && !loading ? (
            <div className="text-center py-16">
              <Search className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Start typing to search your memories
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
