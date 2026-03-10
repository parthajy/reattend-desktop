import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/stores/chat-store";
import { ChatMessage, ThinkingIndicator } from "@/components/app/ChatMessage";
import { ChatInput } from "@/components/app/ChatInput";
import { captureText, getRecord } from "@/lib/tauri-api";
import type { Record as MemoryRecord } from "@/types";
import {
  Loader2,
  Sparkles,
  Database,
  Lightbulb,
  CheckCircle,
  Plus,
  Check,
  X,
  ExternalLink,
  Target,
  MessageSquare,
  Zap,
  FileText,
  ListTodo,
  StickyNote,
  Calendar,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/app-store";

const TYPE_META: {
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

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const QUICK_ACTIONS = [
  {
    icon: Database,
    title: "Synthesize Data",
    description: "Combine insights from multiple memories",
    prompt: "Synthesize my recent memories and find key patterns",
  },
  {
    icon: Lightbulb,
    title: "Creative Brainstorm",
    description: "Generate ideas based on your context",
    prompt: "Based on my recent thoughts and notes, suggest creative ideas",
  },
  {
    icon: CheckCircle,
    title: "Check Facts",
    description: "Verify and cross-reference your memories",
    prompt: "What are my open tasks and pending decisions?",
  },
];

export default function ChatPage() {
  const {
    messages,
    isStreaming,
    isThinking,
    streamingContent,
    loading,
    sourcesMap,
    followUpSuggestions,
    lastResponseMissing,
    lastUserQuery,
    loadThreads,
    sendMessage,
  } = useChatStore();

  const { userName } = useAppStore();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inline capture state
  const [showCapture, setShowCapture] = useState(false);
  const [captureContent, setCaptureContent] = useState("");
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureSaved, setCaptureSaved] = useState(false);

  // Memory drawer state
  const [drawerRecord, setDrawerRecord] = useState<MemoryRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  useEffect(() => {
    loadThreads();
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isThinking, showCapture]);

  // Reset capture UI when a new message starts streaming
  useEffect(() => {
    if (isStreaming) {
      setShowCapture(false);
      setCaptureContent("");
      setCaptureSaved(false);
    }
  }, [isStreaming]);

  // Close drawer on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && drawerRecord) setDrawerRecord(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerRecord]);

  async function handleSourceClick(recordId: string) {
    setDrawerLoading(true);
    try {
      const record = await getRecord(recordId);
      setDrawerRecord(record);
    } catch (e) {
      console.error("[chat] Failed to load memory:", e);
    }
    setDrawerLoading(false);
  }

  async function handleCaptureSave() {
    if (!captureContent.trim()) return;
    setCaptureSaving(true);
    try {
      await captureText(captureContent.trim(), "chat");
      setCaptureSaved(true);
      setShowCapture(false);
      setCaptureContent("");
    } catch (e) {
      console.error("[chat] Failed to capture:", e);
    }
    setCaptureSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasMessages = messages.length > 0 || isStreaming;
  const showFollowUps = !isStreaming && followUpSuggestions.length > 0;
  const showMissingCTA = !isStreaming && lastResponseMissing;

  return (
    <div className="flex h-full relative">
      {/* ── Main chat column ───────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Halo gradient background — only on empty state */}
        {!hasMessages && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-pink-300/15 via-violet-400/15 to-indigo-400/10 blur-3xl" />
            <div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-violet-400/10 to-fuchsia-300/10 blur-3xl" />
          </div>
        )}

        {!hasMessages ? (
          /* ── Empty state / welcome ──────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
            <div className="w-full max-w-[640px] space-y-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/15 to-indigo-500/15 flex items-center justify-center mx-auto mb-4 ring-1 ring-violet-500/10">
                  <img src="/logo.svg" alt="Reattend" className="w-8 h-8 dark:invert" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 via-violet-600 to-indigo-600 bg-clip-text text-transparent">
                  Hello, {userName || "there"}
                </h1>
                <p className="text-lg text-muted-foreground">
                  How can I assist you today?
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.title}
                    onClick={() => sendMessage(action.prompt)}
                    disabled={isStreaming}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 text-left hover:bg-violet-50 dark:hover:bg-violet-500/5 hover:border-violet-200 dark:hover:border-violet-500/20 transition-all"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/10 group-hover:bg-violet-200 dark:group-hover:bg-violet-500/15 transition-colors">
                      <action.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "What decisions did I make this week?",
                  "Summarize my recent meetings",
                  "What action items are pending?",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={isStreaming}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border/50 bg-card/60 backdrop-blur-sm text-xs text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-500/5 hover:text-foreground hover:border-violet-200 dark:hover:border-violet-500/20 transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-violet-400" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Messages ─────────────────────────────────────── */
          <ScrollArea className="flex-1">
            <div className="max-w-[720px] mx-auto px-4 py-6 space-y-4">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  sources={sourcesMap[msg.id]}
                  onSourceClick={handleSourceClick}
                />
              ))}

              {isThinking && !streamingContent && <ThinkingIndicator />}

              {isStreaming && streamingContent && (
                <ChatMessage role="assistant" content={streamingContent} isStreaming />
              )}

              {showFollowUps && (
                <div className="flex flex-wrap gap-2 ml-11 pt-1">
                  {followUpSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/15 bg-violet-500/5 text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/25 transition-all"
                    >
                      <Sparkles className="w-3 h-3 text-violet-400" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {showMissingCTA && (
                <div className="ml-11 mt-1 space-y-2">
                  {captureSaved ? (
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-sm text-emerald-700 dark:text-emerald-300">
                      <Check className="w-4 h-4" />
                      Saved! It'll be processed and added to your memory.
                    </div>
                  ) : showCapture ? (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 max-w-[500px]">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        What would you like to remember
                        {lastUserQuery
                          ? ` about "${lastUserQuery.length > 40 ? lastUserQuery.slice(0, 37) + "..." : lastUserQuery}"?`
                          : "?"}
                      </p>
                      <textarea
                        value={captureContent}
                        onChange={(e) => setCaptureContent(e.target.value)}
                        placeholder="Type what you'd like to save..."
                        className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/30 placeholder:text-muted-foreground/40"
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCaptureSave(); }
                          if (e.key === "Escape") setShowCapture(false);
                        }}
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setShowCapture(false)} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                        <button
                          onClick={handleCaptureSave}
                          disabled={!captureContent.trim() || captureSaving}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40 transition-colors"
                        >
                          {captureSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Save Memory
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCapture(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-violet-500/25 bg-violet-500/5 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/40 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Save a memory about this
                    </button>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        )}

        <ChatInput onSend={sendMessage} disabled={isStreaming} placeholder="Ask me anything..." />
      </div>

      {/* ── Memory preview drawer ──────────────────────────────── */}
      {(drawerRecord || drawerLoading) && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={() => setDrawerRecord(null)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[90vw] bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {drawerLoading && !drawerRecord ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : drawerRecord ? (
              <MemoryDrawerContent
                record={drawerRecord}
                onClose={() => setDrawerRecord(null)}
                onOpenFull={() => {
                  navigate(`/memories/${drawerRecord.id}`);
                  setDrawerRecord(null);
                }}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function MemoryDrawerContent({
  record,
  onClose,
  onOpenFull,
}: {
  record: MemoryRecord;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const tm = TYPE_META[record.type] || TYPE_META.note;
  const Icon = tm.icon;
  const tags = parseTags(record.tags);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tm.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${tm.color}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {tm.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenFull}
            title="Open full page"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-5 space-y-5">
          {/* Title */}
          <h2 className="text-lg font-semibold leading-snug">{record.title}</h2>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(record.created_at)}
          </div>

          {/* Summary */}
          {record.summary && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Summary
              </p>
              <p className="text-sm leading-relaxed text-foreground/80">
                {record.summary}
              </p>
            </div>
          )}

          {/* Content */}
          {record.content && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Full Content
              </p>
              <div className="text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap bg-muted/30 rounded-lg px-4 py-3 border border-border/30">
                {record.content}
              </div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md text-[11px] bg-violet-500/5 border border-violet-500/10 text-violet-700 dark:text-violet-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence */}
          {record.confidence != null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Confidence:</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${Math.round(record.confidence * 100)}%` }}
                />
              </div>
              <span className="font-medium">{Math.round(record.confidence * 100)}%</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
