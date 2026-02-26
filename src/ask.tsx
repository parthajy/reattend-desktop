import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Search, X, Loader2, Brain } from "lucide-react";

interface SearchResult {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  score: number;
}

export function AskWindow() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aiAnswer, setAiAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearchResults([]);
    setAiAnswer("");

    try {
      if (mode === "search") {
        const result = await invoke<{ results: SearchResult[] }>("search_memories", {
          query: query.trim(),
        });
        setSearchResults(result.results || []);
      } else {
        const answer = await invoke<string>("ask_ai", { question: query.trim() });
        setAiAnswer(answer);
      }
    } catch (err) {
      console.error(err);
      setAiAnswer("Failed to get a response. Check your connection and token.");
    }
    setLoading(false);
  }

  function handleClose() {
    getCurrentWindow().close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") handleClose();
  }

  const typeColors: Record<string, string> = {
    decision: "bg-amber-100 text-amber-700",
    meeting: "bg-blue-100 text-blue-700",
    idea: "bg-purple-100 text-purple-700",
    insight: "bg-emerald-100 text-emerald-700",
    context: "bg-gray-100 text-gray-700",
    tasklike: "bg-rose-100 text-rose-700",
    note: "bg-indigo-100 text-indigo-700",
  };

  return (
    <div
      className="h-screen bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100"
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
          <span className="text-[13px] font-semibold text-gray-700">Ask Reattend</span>
        </div>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode toggle + Search */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 text-[12px] font-medium py-1.5 rounded-md transition-all ${
              mode === "search" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setMode("ask")}
            className={`flex-1 text-[12px] font-medium py-1.5 rounded-md transition-all ${
              mode === "ask" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            Ask AI
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder={mode === "search" ? "Search memories..." : "Ask about your memories..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-[13px]">{mode === "search" ? "Searching..." : "Thinking..."}</span>
          </div>
        )}

        {!loading && mode === "search" && searchResults.length > 0 && (
          searchResults.map((r) => (
            <div key={r.id} className="bg-gray-50 rounded-xl px-3.5 py-2.5 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${typeColors[r.type] || "bg-gray-100 text-gray-600"}`}>
                  {r.type}
                </span>
                <span className="text-[13px] font-semibold text-gray-800 truncate">{r.title}</span>
              </div>
              {r.summary && (
                <p className="text-[12px] text-gray-500 line-clamp-2">{r.summary}</p>
              )}
            </div>
          ))
        )}

        {!loading && mode === "search" && searchResults.length === 0 && query && (
          <div className="text-center py-8 text-[13px] text-gray-400">
            No memories found. Try a different query.
          </div>
        )}

        {!loading && mode === "ask" && aiAnswer && (
          <div className="bg-[#4F46E5]/5 rounded-xl px-4 py-3 border border-[#4F46E5]/10">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3.5 h-3.5 text-[#4F46E5]" />
              <span className="text-[11px] font-semibold text-[#4F46E5]">AI Answer</span>
            </div>
            <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 text-center">
        Esc to close · Enter to {mode === "search" ? "search" : "ask"}
      </div>
    </div>
  );
}
