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
  date?: string;
}

export interface AskAnswer {
  text: string;
  sources: AskSource[];
}

function parseSourcesHeader(header: string | null): AskSource[] {
  if (!header) return [];
  // X-Sources is an ASCII-safe JSON string with non-ASCII chars escaped as
  // \uXXXX. Run JSON.parse twice — once via a wrapping JSON string to undo
  // the \u escapes, once on the array itself.
  try {
    const decoded = JSON.parse(`"${header.replace(/"/g, '\\"')}"`);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const parsed = JSON.parse(header);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
}

/** Stream the answer to a question, calling onChunk with each text chunk as
 *  it arrives. Resolves with the joined text + source list when the stream
 *  ends. /api/tray/ask streams plain text and emits source chips in the
 *  X-Sources header. */
export async function askServerStream(
  question: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<AskAnswer> {
  const res = await authedFetch("/api/tray/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ask failed (${res.status}): ${body || res.statusText}`);
  }
  const sources = parseSourcesHeader(res.headers.get("X-Sources"));

  if (!res.body) {
    const text = await res.text();
    onChunk(text);
    return { text, sources };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      full += chunk;
      onChunk(chunk);
    }
  }
  const tail = decoder.decode();
  if (tail) {
    full += tail;
    onChunk(tail);
  }
  return { text: full, sources };
}

// ── Oracle (Deepthink) ───────────────────────────────────────────────────

export interface OracleSource {
  id: string;
  title: string;
  type: string;
  date: string | null;
  passage: string | null;
}

export interface OracleDossier {
  situation: string;
  evidence: string;
  risks: string;
  recommendations: string;
  unknowns: string;
}

export interface OracleResponse {
  question: string;
  dossier: OracleDossier;
  sources: OracleSource[];
  meta: {
    candidatesScanned: number;
    accessibleFiltered: number;
    reranked: number;
    elapsedMs: number;
  };
}

/** Deepthink: structured 5-section dossier (Situation / Evidence / Risks /
 *  Recommendations / Unknowns). Takes 20-40s on real queries — the UI
 *  should show a thinking indicator. */
export async function askOracle(question: string, signal?: AbortSignal): Promise<OracleResponse> {
  const res = await authedFetch("/api/tray/ask/oracle", {
    method: "POST",
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Oracle failed (${res.status}): ${body || res.statusText}`);
  }
  return await res.json() as OracleResponse;
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
