// Ask page — desktop's home surface. The previous chat-thread UI (sidebar
// list of past conversations, multi-turn history, branching threads) is
// gone with the local DB strip. Chat history lives on the web app at
// reattend.com/app/ask now. The desktop's job is the **fast question**:
// open the app or hit ⌘⇧A, type, hit enter, get an answer.

import { useState, useRef, useEffect, FormEvent } from "react";
import { Loader2, Sparkles, ArrowUp, ExternalLink, Database } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { askServer, type AskAnswer } from "@/lib/server-api";

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askServer(q);
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ask Reattend
        </span>
      </div>

      {/* Empty state / answer */}
      <div className="flex-1 overflow-y-auto pb-6">
        {!answer && !loading && !error && (
          <div className="text-muted-foreground text-sm leading-relaxed space-y-3">
            <p>Ask a question across everything you've captured. Answers cite the original memories.</p>
            <p className="text-xs">
              Tip: <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">⌘⇧A</kbd> opens the Spotlight-style ask popup from anywhere.
            </p>
            <button
              type="button"
              onClick={() => openExternal("https://reattend.com/app/ask").catch(() => {})}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-3"
            >
              See full chat history on the web <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {answer && (
          <div className="space-y-4">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {answer.text}
            </div>

            {answer.sources.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Sources
                </div>
                <div className="space-y-1.5">
                  {answer.sources.map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() =>
                        openExternal(`https://reattend.com/app/memories/${src.id}`).catch(() => {})
                      }
                      className="w-full text-left flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Database className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="flex-1">{src.title}</span>
                      <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask box */}
      <form onSubmit={onAsk} className="border-t pt-4">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onAsk(e as unknown as FormEvent);
              }
            }}
            placeholder="Ask anything across your memory…"
            rows={2}
            disabled={loading}
            className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="absolute right-2 bottom-2 h-7 w-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Ask"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
