// Thin wrapper around fetch() for talking to the Reattend server.
//
// The desktop is a thin client: most "do something with my memory" calls
// hit /api/* on the server, authenticated with the bearer token stored
// in the Tauri config (set by connect_token). Every page in src/app/pages
// imports from here rather than building fetch() calls inline so the
// server URL + auth header live in one place.
//
// All fetches send Authorization: Bearer <rat_...> and X-Device-Id.
// Failures bubble up as plain Error objects with the server's message
// when available.

import { getConfigValue } from "./tauri-api";

let cachedServerUrl: string | null = null;
let cachedToken: string | null = null;
let cachedDeviceId: string | null = null;

async function getServerUrl(): Promise<string> {
  if (cachedServerUrl) return cachedServerUrl;
  const url = await getConfigValue("server_url");
  cachedServerUrl = (url || "https://reattend.com").replace(/\/+$/, "");
  return cachedServerUrl;
}

async function getToken(): Promise<string> {
  if (cachedToken !== null) return cachedToken;
  cachedToken = (await getConfigValue("auth_token")) || "";
  return cachedToken;
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  cachedDeviceId = (await getConfigValue("device_id")) || "";
  return cachedDeviceId;
}

/** Force a refetch on the next call — call after connect_token / logout. */
export function clearServerApiCache() {
  cachedServerUrl = null;
  cachedToken = null;
  cachedDeviceId = null;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const [base, token, deviceId] = await Promise.all([
    getServerUrl(),
    getToken(),
    getDeviceId(),
  ]);
  if (!token) {
    throw new Error("Not signed in. Connect your token in Settings.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Device-Id", deviceId);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

// ── Ask ──────────────────────────────────────────────────────────────────

export interface AskSource {
  id: string;
  title: string;
  type: string;
}

export interface AskAnswer {
  text: string;
  sources: AskSource[];
}

/** Ask a question across the user's memory. Returns the full answer at
 *  once (the server's /api/ask endpoint streams; we collect the stream
 *  here and return the joined text — keeps the desktop UI simple). */
export async function askServer(question: string, signal?: AbortSignal): Promise<AskAnswer> {
  const res = await authedFetch("/api/ask", {
    method: "POST",
    body: JSON.stringify({ question, history: [] }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ask failed (${res.status}): ${body || res.statusText}`);
  }
  // /api/ask streams as plain text. Sources are passed in the X-Sources
  // header as a JSON array.
  const text = await res.text();
  let sources: AskSource[] = [];
  const sourcesHeader = res.headers.get("X-Sources");
  if (sourcesHeader) {
    try {
      const parsed = JSON.parse(sourcesHeader);
      if (Array.isArray(parsed)) sources = parsed;
    } catch { /* keep empty */ }
  }
  return { text, sources };
}

// ── Recent captures ──────────────────────────────────────────────────────

export interface RecentRecord {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

/** Last N records the user can see (current org context applied
 *  server-side). For the desktop's Recent Captures view. */
export async function fetchRecent(limit = 25): Promise<RecentRecord[]> {
  const res = await authedFetch(`/api/tray/recent?limit=${limit}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load recent (${res.status}): ${body || res.statusText}`);
  }
  const data = await res.json() as { memories?: RecentRecord[]; records?: RecentRecord[] };
  return data.memories ?? data.records ?? [];
}
