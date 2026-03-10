import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { ChatThread, ChatMessage } from "@/types";
import {
  getChatThreads,
  getChatMessages,
  createChatThread,
  sendChatMessage,
  askAiStream,
  deleteChatThread,
  type AskAiSource,
} from "@/lib/tauri-api";

// ── Source filtering ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "from", "have", "been", "were", "they",
  "their", "about", "which", "would", "there", "what", "when", "where",
  "will", "your", "into", "than", "them", "then", "some", "more",
]);

/** Only return sources the AI actually referenced in its response.
 *  Matches significant words from source titles against the AI text. */
function filterRelevantSources(
  sources: AskAiSource[],
  aiResponse: string
): AskAiSource[] {
  const lower = aiResponse.toLowerCase();
  return sources.filter((src) => {
    const words = src.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return false;
    const matches = words.filter((w) => lower.includes(w));
    // Require at least half the significant title words to appear in the response
    const threshold = Math.max(1, Math.ceil(words.length * 0.4));
    return matches.length >= threshold;
  });
}

// ── Response analysis ────────────────────────────────────────────────────

/** Detect when the AI clearly says it doesn't have the info */
function isNotFoundResponse(content: string): boolean {
  const lower = content.toLowerCase();
  const phrases = [
    "i don't have that",
    "i do not have that",
    "i don't have any",
    "i do not have any",
    "no information about",
    "no memories about",
    "not found in your memories",
    "don't have any memories",
    "do not have any memories",
    "couldn't find any",
    "could not find any",
    "no details about",
    "no records about",
    "do not mention",
    "don't mention",
    "not in your memories",
    "nothing about that",
    "no data about",
    "not available in your",
    "i wasn't able to find",
    "i was not able to find",
    "no relevant memories",
  ];
  return phrases.some((p) => lower.includes(p));
}

/** Generate follow-ups only when the AI actually had useful info */
function generateFollowUps(
  content: string,
  sources: AskAiSource[]
): string[] {
  const suggestions: string[] = [];
  const lower = content.toLowerCase();

  // Source-aware: suggest exploring specific found memories
  if (sources.length > 1) {
    suggestions.push("How do these relate to each other?");
  } else if (sources.length === 1) {
    const title = sources[0].title;
    suggestions.push(
      title.length <= 35
        ? `What else relates to "${title}"?`
        : "What else is related to this?"
    );
  }

  // Content-aware: pick ONE topical follow-up
  if (lower.includes("decision") && !lower.includes("no decision")) {
    suggestions.push("What led to this decision?");
  } else if (
    (lower.includes("task") || lower.includes("action item")) &&
    !lower.includes("no task")
  ) {
    suggestions.push("What's the priority here?");
  } else if (lower.includes("meeting") && !lower.includes("no meeting")) {
    suggestions.push("What came out of this meeting?");
  } else if (lower.includes("project") && !lower.includes("no project")) {
    suggestions.push("What's the current status?");
  } else if (lower.includes("idea") && !lower.includes("no idea")) {
    suggestions.push("How could I develop this further?");
  }

  // Fill to 3 with genuinely useful prompts
  const extras = [
    "Show me a timeline of this",
    "What else do you know about this topic?",
    "Summarize everything related",
  ];
  for (const e of extras) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(e)) suggestions.push(e);
  }

  return suggestions.slice(0, 3);
}

// ── Store ────────────────────────────────────────────────────────────────

interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  streamingContent: string;
  loading: boolean;
  sourcesMap: Record<string, AskAiSource[]>;
  followUpSuggestions: string[];
  /** True when the last AI response couldn't find what was asked */
  lastResponseMissing: boolean;
  /** The last question the user asked (for capture CTA context) */
  lastUserQuery: string;

  // Actions
  loadThreads: () => Promise<void>;
  setActiveThread: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  deleteAllThreads: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  messages: [],
  isStreaming: false,
  isThinking: false,
  streamingContent: "",
  loading: true,
  sourcesMap: {},
  followUpSuggestions: [],
  lastResponseMissing: false,
  lastUserQuery: "",

  loadThreads: async () => {
    try {
      const threads = await getChatThreads();
      set({ threads, loading: false });
    } catch (e) {
      console.error("[chat-store] Failed to load threads:", e);
      set({ loading: false });
    }
  },

  setActiveThread: async (id: string) => {
    set({ activeThreadId: id });
    try {
      const messages = await getChatMessages(id);
      // Parse sources from metadata for historical messages
      const sourcesMap: Record<string, AskAiSource[]> = {};
      for (const msg of messages) {
        if (msg.role === "assistant" && msg.metadata) {
          try {
            const meta = JSON.parse(msg.metadata);
            if (Array.isArray(meta.sources) && meta.sources.length > 0) {
              // Only attach sources the AI actually referenced
              if (!isNotFoundResponse(msg.content)) {
                const relevant = filterRelevantSources(meta.sources, msg.content);
                if (relevant.length > 0) {
                  sourcesMap[msg.id] = relevant;
                }
              }
            }
          } catch {
            // metadata isn't JSON or doesn't have sources
          }
        }
      }
      set({
        messages,
        sourcesMap,
        followUpSuggestions: [],
        lastResponseMissing: false,
      });
    } catch (e) {
      console.error("[chat-store] Failed to load messages:", e);
      set({ messages: [], sourcesMap: {} });
    }
  },

  sendMessage: async (content: string) => {
    const { activeThreadId, threads } = get();
    let threadId = activeThreadId;

    // Auto-create thread if none active
    if (!threadId) {
      try {
        const title =
          content.length > 50 ? content.slice(0, 47) + "..." : content;
        const thread = await createChatThread(title);
        threadId = thread.id;
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: thread.id,
          messages: [],
        }));
      } catch (e) {
        console.error("[chat-store] Failed to create thread:", e);
        return;
      }
    }

    // Save user message to backend
    let userMsg: ChatMessage;
    try {
      userMsg = await sendChatMessage(threadId, content);
    } catch (e) {
      console.error("[chat-store] Failed to send message:", e);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        thread_id: threadId!,
        role: "assistant",
        content: `Failed to send message: ${e}`,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      set((s) => ({
        messages: [
          ...s.messages,
          { ...errorMsg, role: "user", content },
          errorMsg,
        ],
      }));
      return;
    }

    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      isThinking: true,
      streamingContent: "",
      followUpSuggestions: [],
      lastResponseMissing: false,
      lastUserQuery: content,
    }));

    // Update thread title if it was generic
    const currentThread = threads.find((t) => t.id === threadId);
    if (
      currentThread?.title === "New Chat" ||
      currentThread?.title === "Ask AI"
    ) {
      const newTitle =
        content.length > 50 ? content.slice(0, 47) + "..." : content;
      set((s) => ({
        threads: s.threads.map((t) =>
          t.id === threadId ? { ...t, title: newTitle } : t
        ),
      }));
    }

    // Set up streaming listener BEFORE calling the API
    const unlisten = await listen<{
      thread_id: string;
      content: string;
      done: boolean;
      sources?: { record_id: string; title: string }[];
    }>("ai_stream_chunk", (event) => {
      const { thread_id, content: chunk, done } = event.payload;
      if (thread_id !== threadId) return;

      if (done) {
        const finalContent = get().streamingContent;
        const sources = event.payload.sources || [];
        if (finalContent) {
          const msgId = crypto.randomUUID();
          const notFound = isNotFoundResponse(finalContent);
          const assistantMsg: ChatMessage = {
            id: msgId,
            thread_id: thread_id,
            role: "assistant",
            content: finalContent,
            metadata:
              sources.length > 0 ? JSON.stringify({ sources }) : null,
            created_at: new Date().toISOString(),
          };
          // Only generate follow-ups and show sources when AI actually found info
          const relevant = notFound
            ? []
            : filterRelevantSources(sources, finalContent);
          const followUps = notFound
            ? []
            : generateFollowUps(finalContent, relevant);
          set((s) => ({
            messages: [...s.messages, assistantMsg],
            isStreaming: false,
            isThinking: false,
            streamingContent: "",
            sourcesMap:
              relevant.length > 0
                ? { ...s.sourcesMap, [msgId]: relevant }
                : s.sourcesMap,
            followUpSuggestions: followUps,
            lastResponseMissing: notFound,
          }));
        } else {
          set({ isStreaming: false, isThinking: false, streamingContent: "" });
        }
        unlisten();
      } else {
        set((s) => ({
          streamingContent: s.streamingContent + chunk,
          isThinking: false,
        }));
      }
    });

    // Call streaming API
    try {
      await askAiStream(content, threadId);
    } catch (e) {
      console.error("[chat-store] askAiStream failed:", e);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        thread_id: threadId!,
        role: "assistant",
        content: `Something went wrong: ${e}`,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, errorMsg],
        isStreaming: false,
        isThinking: false,
        streamingContent: "",
      }));
      unlisten();
    }
  },

  deleteThread: async (id: string) => {
    try {
      await deleteChatThread(id);
    } catch (e) {
      console.error("[chat-store] Failed to delete thread:", e);
    }

    set((s) => {
      const remaining = s.threads.filter((t) => t.id !== id);
      const wasActive = s.activeThreadId === id;
      return {
        threads: remaining,
        activeThreadId: wasActive ? null : s.activeThreadId,
        messages: wasActive ? [] : s.messages,
        sourcesMap: wasActive ? {} : s.sourcesMap,
        followUpSuggestions: wasActive ? [] : s.followUpSuggestions,
        lastResponseMissing: wasActive ? false : s.lastResponseMissing,
      };
    });
  },

  deleteAllThreads: async () => {
    const { threads } = get();
    for (const t of threads) {
      try {
        await deleteChatThread(t.id);
      } catch (e) {
        console.error("[chat-store] Failed to delete thread:", t.id, e);
      }
    }
    set({
      threads: [],
      activeThreadId: null,
      messages: [],
      sourcesMap: {},
      followUpSuggestions: [],
      lastResponseMissing: false,
    });
  },
}));
