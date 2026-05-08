// Spotlight-style Ask window.
//
// Two modes, mirroring the dashboard:
//   - Normal     → /api/tray/ask (streams a chat-style answer + source chips)
//   - Deepthink  → /api/tray/ask/oracle (5-section dossier, 20-40s, no stream)
//
// Both go through bearer-token endpoints so the same API key the user
// pasted in Settings authenticates here. Source chips deep-link to the
// memory on the web dashboard via openExternal.
//
// Keyboard:
//   Enter       → submit
//   ⌘D          → toggle Deepthink
//   Esc         → close window

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  Search, X, Loader2, Sparkles, Brain, FileText, AlertTriangle,
  Lightbulb, HelpCircle, ExternalLink,
} from "lucide-react";
import {
  askServerStream, askOracle,
  type AskSource, type OracleResponse,
} from "@/lib/server-api";
import { getConfigValue } from "@/lib/tauri-api";

type Mode = "normal" | "deepthink";

export function AskWindow() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [oracle, setOracle] = useState<OracleResponse | null>(null);
  const [serverUrl, setServerUrl] = useState("https://reattend.com");

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    getConfigValue("server_url").then(u => {
      if (u) setServerUrl(u.replace(/\/+$/, ""));
    });
    return () => abortRef.current?.abort();
  }, []);

  function close() {
    abortRef.current?.abort();
    getCurrentWindow().close();
  }

  function clearResults() {
    setAnswer("");
    setSources([]);
    setOracle(null);
    setError(null);
  }

  async function submit() {
    const q = query.trim();
    if (!q || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    clearResults();
    setLoading(true);

    try {
      if (mode === "deepthink") {
        const res = await askOracle(q, abortRef.current.signal);
        setOracle(res);
      } else {
        const res = await askServerStream(
          q,
          (chunk) => setAnswer((prev) => prev + chunk),
          abortRef.current.signal,
        );
        setSources(res.sources);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setMode((m) => (m === "deepthink" ? "normal" : "deepthink"));
    }
  }

  function openSource(id: string) {
    openExternal(`${serverUrl}/app/memories/${id}`).catch(() => {});
  }

  const hasResults = !!answer || !!oracle || !!error;

  return (
    <div
      className="h-screen bg-white/95 backdrop-blur-xl flex flex-col overflow-hidden font-sans dark:bg-zinc-900/95 dark:text-zinc-100"
      onKeyDown={handleKeyDown}
    >
      {/* Title bar — drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          {mode === "deepthink" ? (
            <Brain className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          )}
          <span className="text-[12.5px] font-semibold">
            {mode === "deepthink" ? "Deepthink" : "Ask Reattend"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} disabled={loading} />
          <button
            type="button"
            onClick={close}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Query box */}
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="px-3.5 pt-3 pb-2 shrink-0"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "deepthink"
                ? "Ask the Oracle a high-stakes question…"
                : "Ask anything about your memory…"
            }
            disabled={loading}
            spellCheck={false}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
          />
        </div>
      </form>

      {/* Results / placeholder */}
      <div className="flex-1 overflow-y-auto px-3.5 pb-3">
        {!hasResults && !loading && <Placeholder mode={mode} />}

        {loading && (
          <div className="flex items-center justify-center py-10 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-[12.5px]">
              {mode === "deepthink" ? "Reading your memory… (~20-40s)" : "Thinking…"}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {mode === "normal" && answer && (
          <NormalAnswer answer={answer} sources={sources} onOpenSource={openSource} />
        )}

        {mode === "deepthink" && oracle && (
          <OracleDossier oracle={oracle} onOpenSource={openSource} />
        )}
      </div>

      {/* Footer */}
      <div className="px-3.5 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[10.5px] text-zinc-500 shrink-0 flex items-center justify-between">
        <span>↵ Ask · ⌘D Deepthink · Esc Close</span>
        <span className="font-mono">
          {mode === "deepthink" ? "deepthink" : "normal"}
        </span>
      </div>
    </div>
  );
}

function ModeToggle({
  mode, onChange, disabled,
}: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  return (
    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 text-[10.5px] font-semibold uppercase tracking-wider">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("normal")}
        className={`px-2 py-0.5 rounded transition-colors ${
          mode === "normal"
            ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
            : "text-zinc-500"
        }`}
      >
        Normal
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("deepthink")}
        className={`px-2 py-0.5 rounded transition-colors ${
          mode === "deepthink"
            ? "bg-white dark:bg-zinc-900 text-violet-600 dark:text-violet-400 shadow-sm"
            : "text-zinc-500"
        }`}
      >
        Deep
      </button>
    </div>
  );
}

function Placeholder({ mode }: { mode: Mode }) {
  const examples = mode === "deepthink"
    ? [
        "What do we know about the BEPS audit risk?",
        "Where are we on the Goodwill onboarding?",
        "What contradictions are in our pricing decisions?",
      ]
    : [
        "What did we decide about the auth migration?",
        "Summarize last week's standups",
        "Draft an email to Mike with the latest numbers",
      ];

  return (
    <div className="pt-6 space-y-2.5">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
        Try asking
      </p>
      <ul className="space-y-1">
        {examples.map((ex) => (
          <li key={ex} className="text-[12.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <span className="text-zinc-400 mr-1.5">›</span>{ex}
          </li>
        ))}
      </ul>
      {mode === "deepthink" && (
        <p className="text-[11.5px] text-violet-700 dark:text-violet-300 mt-3 flex items-start gap-1.5">
          <Brain className="w-3 h-3 mt-0.5 shrink-0" />
          Deepthink runs deeper retrieval (~150 candidates → 30 reranked) and
          returns a 5-section dossier. Slower, but for the questions that matter.
        </p>
      )}
    </div>
  );
}

function NormalAnswer({
  answer, sources, onOpenSource,
}: {
  answer: string;
  sources: AskSource[];
  onOpenSource: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 px-3.5 py-3 text-[13px] text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
        {answer}
      </div>
      {sources.length > 0 && (
        <SourceChips sources={sources.map(s => ({
          id: s.id, title: s.title, type: s.type,
        }))} onOpen={onOpenSource} />
      )}
    </div>
  );
}

function OracleDossier({
  oracle, onOpenSource,
}: {
  oracle: OracleResponse;
  onOpenSource: (id: string) => void;
}) {
  const { dossier, sources, meta } = oracle;
  const sections: Array<{ key: keyof typeof dossier; label: string; icon: any; color: string }> = [
    { key: "situation",       label: "Situation",       icon: FileText,      color: "text-zinc-700 dark:text-zinc-300" },
    { key: "evidence",        label: "Evidence",        icon: Search,        color: "text-blue-700 dark:text-blue-300" },
    { key: "risks",           label: "Risks",           icon: AlertTriangle, color: "text-amber-700 dark:text-amber-300" },
    { key: "recommendations", label: "Recommendations", icon: Lightbulb,     color: "text-emerald-700 dark:text-emerald-300" },
    { key: "unknowns",        label: "Unknowns",        icon: HelpCircle,    color: "text-violet-700 dark:text-violet-300" },
  ];

  return (
    <div className="space-y-3">
      <div className="text-[10.5px] text-zinc-500 font-mono">
        {meta.candidatesScanned} scanned · {meta.accessibleFiltered} accessible · {meta.reranked} reranked · {(meta.elapsedMs/1000).toFixed(1)}s
      </div>
      {sections.map(({ key, label, icon: Icon, color }) => {
        const body = dossier[key];
        if (!body) return null;
        return (
          <div key={key} className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5">
            <div className={`text-[10.5px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5 ${color}`}>
              <Icon className="w-3 h-3" /> {label}
            </div>
            <div className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {body}
            </div>
          </div>
        );
      })}
      {sources.length > 0 && (
        <SourceChips
          sources={sources.map(s => ({ id: s.id, title: s.title, type: s.type }))}
          onOpen={onOpenSource}
        />
      )}
    </div>
  );
}

function SourceChips({
  sources, onOpen,
}: {
  sources: Array<{ id: string; title: string; type: string }>;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
        Sources
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            title={s.title}
            className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] text-zinc-700 dark:text-zinc-200 max-w-[220px]"
          >
            <span className="font-mono text-zinc-400">[{i + 1}]</span>
            <span className="truncate">{s.title}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
