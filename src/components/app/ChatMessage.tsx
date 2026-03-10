import { useState, useEffect } from "react";
import { User, Brain, ExternalLink, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  record_id: string;
  title: string;
}

interface ChatMessageProps {
  role: "user" | "assistant" | string;
  content: string;
  isStreaming?: boolean;
  sources?: Source[];
  onSourceClick?: (recordId: string) => void;
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  sources,
  onSourceClick,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 ring-1 ring-violet-500/10"
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5" />
        ) : (
          <img src="/logo.svg" alt="Reattend" className="w-4 h-4 dark:invert" />
        )}
      </div>

      <div className="flex flex-col gap-2 max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-md"
              : "bg-muted/60 border border-border/40 rounded-tl-md"
          )}
        >
          <MarkdownContent content={content} />
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current opacity-70 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Sources below assistant messages */}
        {!isUser && sources && sources.length > 0 && !isStreaming && (
          <div className="flex flex-wrap items-center gap-1.5 pl-1">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mr-0.5">
              Sources
            </span>
            {sources.map((src) => (
              <button
                key={src.record_id}
                onClick={() => onSourceClick?.(src.record_id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/5 border border-violet-500/10 text-[11px] text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/20 transition-all group"
              >
                <Brain className="w-3 h-3 text-violet-500/70 group-hover:text-violet-500 transition-colors" />
                <span className="max-w-[160px] truncate">{src.title}</span>
                <ExternalLink className="w-2.5 h-2.5 text-violet-400/50 group-hover:text-violet-400 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Thinking indicator — shown while AI processes before streaming starts */
export function ThinkingIndicator() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 3), 2000);
    return () => clearInterval(id);
  }, []);

  const phases = [
    { text: "Searching memories", Icon: Search },
    { text: "Analyzing context", Icon: Brain },
    { text: "Composing response", Icon: Sparkles },
  ];

  const { text, Icon } = phases[phase];

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br from-violet-500/15 to-indigo-500/15 ring-1 ring-violet-500/10">
        <img src="/logo.svg" alt="" className="w-4 h-4 dark:invert" />
      </div>
      <div className="rounded-2xl px-4 py-3 bg-muted/60 border border-border/40 rounded-tl-md">
        <div className="flex items-center gap-2.5">
          <Icon className="w-3.5 h-3.5 text-violet-500 animate-pulse" />
          <span className="text-sm text-muted-foreground">{text}</span>
          <span className="flex items-center gap-1 ml-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block w-1.5 h-1.5 rounded-full bg-violet-400/70 animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Lightweight markdown-ish renderer (no extra deps) */
function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;

  // Split on code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          // Code block
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim();
          const code = (lang ? lines.slice(1) : lines).join("\n").trim();
          return (
            <pre
              key={i}
              className="bg-background/50 rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono"
            >
              <code>{code}</code>
            </pre>
          );
        }
        // Inline formatting
        return <InlineText key={i} text={part} />;
      })}
    </>
  );
}

function InlineText({ text }: { text: string }) {
  // Process bold, italic, inline code
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return (
            <code
              key={i}
              className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono"
            >
              {seg.slice(1, -1)}
            </code>
          );
        }
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {seg.slice(2, -2)}
            </strong>
          );
        }
        if (seg.startsWith("*") && seg.endsWith("*")) {
          return <em key={i}>{seg.slice(1, -1)}</em>;
        }
        return <span key={i}>{seg}</span>;
      })}
    </>
  );
}
