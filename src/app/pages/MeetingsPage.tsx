import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRecords, deleteRecord, createShareLink, sendShareEmail } from "@/lib/tauri-api";
import type { Record } from "@/types";
import { parseTags } from "@/types";
import {
  Mic,
  Loader2,
  Search,
  Clock,
  ListChecks,
  Lightbulb,
  MessageSquare,
  ChevronRight,
  Trash2,
  Share2,
  Check,
  Mail,
  Copy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function parseMeta(meta: string | null): {
  action_items?: string[];
  decisions?: string[];
  key_points?: string[];
} {
  if (!meta) return {};
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

export default function MeetingsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [shareStates, setShareStates] = useState<{ [id: string]: "idle" | "sharing" | "shared" }>({});
  const [shareUrls, setShareUrls] = useState<{ [id: string]: string }>({});
  const [expandedShareId, setExpandedShareId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Only show audio recordings (transcripts)
    getRecords({ limit: 100, type_filter: "transcript" })
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = searchQuery
    ? records.filter(
        (r) =>
          r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : records;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transcript?")) return;
    try {
      await deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  };

  const handleShare = async (record: Record) => {
    // If already have a share URL, toggle the panel
    if (shareUrls[record.id]) {
      setExpandedShareId((prev) => (prev === record.id ? null : record.id));
      return;
    }
    setShareStates((s) => ({ ...s, [record.id]: "sharing" }));
    try {
      const meta = record.meta ? JSON.parse(record.meta) : {};
      const result = await createShareLink({
        title: record.title,
        summary: record.summary || undefined,
        content: record.content || undefined,
        record_type: record.type || "transcript",
        tags: record.tags ? JSON.parse(record.tags) : [],
        meta: {
          action_items: meta.action_items,
          decisions: meta.decisions,
          key_points: meta.key_points,
        },
        entities: [],
      });
      setShareUrls((s) => ({ ...s, [record.id]: result.shareUrl }));
      setShareStates((s) => ({ ...s, [record.id]: "shared" }));
      setExpandedShareId(record.id);
      navigator.clipboard.writeText(result.shareUrl);
      setTimeout(() => setShareStates((s) => ({ ...s, [record.id]: "idle" })), 2000);
    } catch {
      setShareStates((s) => ({ ...s, [record.id]: "idle" }));
    }
  };

  return (
    <div className="flex-1 overflow-auto relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-pink-400/8 via-rose-400/8 to-violet-400/5 blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto p-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/20">
                <Mic className="h-5 w-5" />
              </div>
              Transcripts
            </h1>
            <p className="text-sm text-muted-foreground mt-1 ml-[52px]">
              {filtered.length}{" "}
              {filtered.length === 1 ? "transcript" : "transcripts"} recorded
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search transcripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background/80 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/30 transition-all"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/10 to-rose-500/10 flex items-center justify-center mx-auto mb-4">
              <Mic className="h-7 w-7 text-pink-400" />
            </div>
            <p className="text-base font-semibold text-foreground">
              No transcripts yet
            </p>
            <p className="text-sm mt-1">
              Press {"\u2318\u21E7"}M or click "Start Meeting" from the tray to
              record your first meeting.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <MeetingCard
                key={r.id}
                record={r}
                onClick={() => navigate(`/memories/${r.id}`)}
                onDelete={() => handleDelete(r.id)}
                onShare={() => handleShare(r)}
                shareState={shareStates[r.id] || "idle"}
                shareUrl={shareUrls[r.id] || null}
                showSharePanel={expandedShareId === r.id}
                onCloseSharePanel={() => setExpandedShareId(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingCard({
  record,
  onClick,
  onDelete,
  onShare,
  shareState,
  shareUrl,
  showSharePanel,
  onCloseSharePanel,
}: {
  record: Record;
  onClick: () => void;
  onDelete: () => void;
  onShare: () => void;
  shareState?: "idle" | "sharing" | "shared";
  shareUrl: string | null;
  showSharePanel: boolean;
  onCloseSharePanel: () => void;
}) {
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const meta = parseMeta(record.meta);
  const tags = parseTags(record.tags);
  const actionCount = meta.action_items?.length || 0;
  const decisionCount = meta.decisions?.length || 0;
  const keyPointCount = meta.key_points?.length || 0;
  const isTranscript = record.type === "transcript";

  const handleSendEmail = async () => {
    if (!shareUrl || !emailTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) return;
    setEmailSending(true);
    try {
      await sendShareEmail({
        to: emailTo,
        title: record.title,
        summary: record.summary || undefined,
        shareUrl,
      });
      setEmailSent(true);
      setEmailTo("");
      setTimeout(() => setEmailSent(false), 3000);
    } catch {}
    setEmailSending(false);
  };

  return (
    <div className="group relative rounded-2xl border bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-pink-200 dark:hover:border-pink-800/30 transition-all duration-200 overflow-hidden">
      {/* Left accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl",
          isTranscript
            ? "bg-gradient-to-b from-pink-500 to-rose-500"
            : "bg-gradient-to-b from-emerald-500 to-teal-500"
        )}
      />

      <div className="pl-5 pr-5 py-4 cursor-pointer" onClick={onClick}>
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl shrink-0 mt-0.5",
              isTranscript ? "bg-pink-500/10" : "bg-emerald-500/10"
            )}
          >
            {isTranscript ? (
              <Mic className="h-5 w-5 text-pink-500" />
            ) : (
              <MessageSquare className="h-5 w-5 text-emerald-500" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isTranscript ? "text-pink-500" : "text-emerald-500"
                )}
              >
                {isTranscript ? "Audio Recording" : "Meeting"}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(record.created_at)}
              </span>
            </div>

            <h3 className="text-[15px] font-semibold leading-snug mb-1.5">
              {record.title}
            </h3>

            {record.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                {record.summary}
              </p>
            )}

            {/* Meeting stats pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {actionCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-medium">
                  <ListChecks className="h-2.5 w-2.5" />
                  {actionCount} action{actionCount !== 1 ? "s" : ""}
                </span>
              )}
              {decisionCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                  <Lightbulb className="h-2.5 w-2.5" />
                  {decisionCount} decision{decisionCount !== 1 ? "s" : ""}
                </span>
              )}
              {keyPointCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-medium">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {keyPointCount} key point{keyPointCount !== 1 ? "s" : ""}
                </span>
              )}
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground text-[10px] font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              disabled={shareState === "sharing"}
              className={cn(
                "p-1.5 rounded-lg hover:bg-indigo-500/10 transition-all disabled:opacity-50",
                showSharePanel ? "opacity-100 bg-indigo-500/10" : "opacity-0 group-hover:opacity-100"
              )}
            >
              {shareState === "sharing" ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              ) : shareState === "shared" && !showSharePanel ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-indigo-500" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>
      </div>

      {/* Expandable share panel */}
      {showSharePanel && shareUrl && (
        <div className="border-t px-5 py-3 bg-muted/30" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Share</span>
            <button onClick={onCloseSharePanel} className="ml-auto p-0.5 rounded hover:bg-muted">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email address..."
                value={emailTo}
                onChange={(e) => { setEmailTo(e.target.value); setEmailSent(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
            <button
              disabled={emailSending || !emailTo}
              onClick={handleSendEmail}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[11px] font-semibold disabled:opacity-50 transition-all"
            >
              {emailSending ? <Loader2 className="h-3 w-3 animate-spin" /> : emailSent ? <Check className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
              {emailSent ? "Sent!" : "Send"}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[11px] font-medium hover:bg-muted transition-colors"
            >
              {linkCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {linkCopied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
