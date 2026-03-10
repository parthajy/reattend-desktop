import { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Sparkles,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getRawItems,
  getRawItemsCount,
  updateRawItemStatus,
  runTriageOnItem,
  runTriageAllPending,
} from "@/lib/tauri-api";
import type { RawItem, RawItemsCount } from "@/types";

type Tab = "all" | "pending" | "triaged";

export default function InboxPage() {
  const [items, setItems] = useState<RawItem[]>([]);
  const [counts, setCounts] = useState<RawItemsCount>({
    total: 0,
    pending: 0,
    triaged: 0,
    ignored: 0,
  });
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [triagingAll, setTriagingAll] = useState(false);
  const [triagingIds, setTriagingIds] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const status =
        activeTab === "all" ? undefined : activeTab === "pending" ? "pending" : "triaged";
      const data = await getRawItems({ status, limit: 100 });
      setItems(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchCounts = useCallback(async () => {
    try {
      const c = await getRawItemsCount();
      setCounts(c);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchCounts();
  }, [fetchItems, fetchCounts]);

  const handleTriage = async (id: string) => {
    setTriagingIds((prev) => new Set(prev).add(id));
    try {
      await runTriageOnItem(id);
      await fetchItems();
      await fetchCounts();
    } catch {
      // silent
    } finally {
      setTriagingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleTriageAll = async () => {
    setTriagingAll(true);
    try {
      await runTriageAllPending();
      await fetchItems();
      await fetchCounts();
    } catch {
      // silent
    } finally {
      setTriagingAll(false);
    }
  };

  const handleIgnore = async (id: string) => {
    try {
      await updateRawItemStatus(id, "ignored");
      await fetchItems();
      await fetchCounts();
    } catch {
      // silent
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await updateRawItemStatus(id, "pending");
      await fetchItems();
      await fetchCounts();
    } catch {
      // silent
    }
  };

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "all", label: "All", count: counts.total },
    { value: "pending", label: "New", count: counts.pending },
    { value: "triaged", label: "Triaged", count: counts.triaged },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
      case "triaged":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "ignored":
        return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      triaged:
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      ignored:
        "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] capitalize", variants[status])}
      >
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10">
              <Inbox className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                Raw captures waiting for AI triage
              </p>
            </div>
          </div>

          {counts.pending > 0 && (
            <Button
              onClick={handleTriageAll}
              disabled={triagingAll}
              className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
            >
              {triagingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {triagingAll ? "Triaging..." : `Triage All (${counts.pending})`}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Items */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No items</p>
            <p className="text-xs mt-1">
              Use Quick Capture (⌘K) to add items to your inbox.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="mt-1">{statusIcon(item.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">
                    {item.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {statusBadge(item.status)}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    {item.source_type && (
                      <span className="text-[10px] text-muted-foreground">
                        via {item.source_type}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-1 shrink-0">
                  {item.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={triagingIds.has(item.id)}
                        onClick={() => handleTriage(item.id)}
                      >
                        {triagingIds.has(item.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        Triage
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => handleIgnore(item.id)}
                      >
                        Ignore
                      </Button>
                    </>
                  )}
                  {item.status === "ignored" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleRestore(item.id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
