// ── Types matching Rust backend (db.rs + commands.rs) ─────────────────────

export interface Record {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  content: string | null;
  confidence: number | null;
  tags: string | null; // JSON array string
  source: string | null;
  meta: string | null; // JSON string
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  kind: string;
  name: string;
  normalized: string;
  mention_count: number;
  created_at: string;
}

export interface RecordLink {
  id: string;
  from_record_id: string;
  to_record_id: string;
  kind: string;
  weight: number | null;
  explanation: string | null;
  created_at: string;
}

export interface RawItem {
  id: string;
  content: string;
  content_type: string | null;
  source_type: string;
  metadata: string | null;
  status: string;
  triage_result: string | null;
  created_at: string;
}

export interface ChatThread {
  id: string;
  title: string;
  context: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  metadata: string | null;
  created_at: string;
}

export interface BoardData {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardNode {
  id: string;
  board_id: string;
  node_type: string;
  record_id: string | null;
  content: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  color: string | null;
  data: string | null;
  style: string | null;
}

export interface BoardEdge {
  id: string;
  board_id: string;
  from_node_id: string;
  to_node_id: string;
  kind: string;
  label: string | null;
  style: string | null;
  data: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  object_type: string | null;
  object_id: string | null;
  status: string;
  created_at: string;
}

export interface RawItemsCount {
  total: number;
  pending: number;
  triaged: number;
  ignored: number;
}

export interface JobQueueItem {
  id: string;
  job_type: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface TypeCount {
  record_type: string;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface DashboardStats {
  total_records: number;
  total_decisions: number;
  total_meetings: number;
  total_insights: number;
  total_ideas: number;
  total_entities: number;
  total_links: number;
  records_today: number;
  records_this_week: number;
  daily_activity: DailyActivity[];
  type_counts: TypeCount[];
  top_tags: TagCount[];
}

export interface TodayBriefing {
  decisions: Record[];
  tasks: Record[];
  transcripts: Record[];
  meetings: Record[];
  insights: Record[];
  other: Record[];
  pending_notifications: number;
  total_recent: number;
}

export interface GraphNode {
  id: string;
  record_type: string;
  title: string;
  summary: string | null;
  tags: string | null;
  created_at: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight: number | null;
}

export interface AppConfig {
  ai_provider: string;    // "server" | "groq" | "ollama"
  groq_api_key: string;
  ollama_url: string;
  ollama_model: string;
  theme: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FullBoardData {
  board: BoardData;
  nodes: BoardNode[];
  edges: BoardEdge[];
}

// Record types for type-safe filtering
export type RecordType =
  | "decision"
  | "insight"
  | "meeting"
  | "transcript"
  | "idea"
  | "context"
  | "tasklike"
  | "note";

export const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: "decision", label: "Decision" },
  { value: "insight", label: "Insight" },
  { value: "meeting", label: "Meeting" },
  { value: "transcript", label: "Transcript" },
  { value: "idea", label: "Idea" },
  { value: "context", label: "Context" },
  { value: "tasklike", label: "Task" },
  { value: "note", label: "Note" },
];

// Helper to parse JSON tags
export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}
