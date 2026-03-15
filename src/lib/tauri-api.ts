import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  Record,
  Entity,
  RecordLink,
  ChatThread,
  ChatMessage,
  DashboardStats,
  TodayBriefing,
  GraphData,
  FullBoardData,
  Project,
  Notification,
  RawItem,
  RawItemsCount,
  JobQueueItem,
} from "@/types";

// ── Config ────────────────────────────────────────────────────────────────

export const getConfig = () => invoke<AppConfig>("get_config");

export const saveConfig = (config: AppConfig) =>
  invoke<void>("save_config", { config });

export const getConfigValue = (key: string) =>
  invoke<string | null>("get_config_value", { key });

export const setConfigValue = (key: string, value: string) =>
  invoke<void>("set_config_value", { key, value });

// ── Records ───────────────────────────────────────────────────────────────

export const getRecords = (params?: {
  limit?: number;
  offset?: number;
  type_filter?: string;
}) =>
  invoke<Record[]>("get_records", {
    params: {
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
      type_filter: params?.type_filter ?? null,
    },
  });

export const getRecord = (id: string) =>
  invoke<Record>("get_record", { id });

export const createRecord = (params: {
  title: string;
  record_type?: string;
  summary?: string;
  content?: string;
  tags?: string;
  source?: string;
}) => invoke<string>("create_record", { params });

export const updateRecord = (params: {
  id: string;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string;
}) => invoke<void>("update_record", { params });

export const deleteRecord = (id: string) =>
  invoke<void>("delete_record", { id });

// ── Search ────────────────────────────────────────────────────────────────

export const searchRecords = (query: string) =>
  invoke<Record[]>("search_records", { query });

// ── Entities ──────────────────────────────────────────────────────────────

export const getEntities = () => invoke<Entity[]>("get_entities");

export const getRecordEntities = (recordId: string) =>
  invoke<Entity[]>("get_record_entities", { recordId });

// ── Links ─────────────────────────────────────────────────────────────────

export const getRecordLinks = (recordId: string) =>
  invoke<[RecordLink, Record][]>("get_record_links", { recordId });

// ── Graph ─────────────────────────────────────────────────────────────────

export const getGraphData = () => invoke<GraphData>("get_graph_data");

// ── Board ─────────────────────────────────────────────────────────────────

export const getBoard = () => invoke<FullBoardData>("get_board");

export const saveBoard = (params: {
  board_id: string;
  nodes: string;
  edges: string;
}) => invoke<void>("save_board", { params });

// ── Chat ──────────────────────────────────────────────────────────────────

export const getChatThreads = () =>
  invoke<ChatThread[]>("get_chat_threads");

export const createChatThread = (title: string) =>
  invoke<ChatThread>("create_chat_thread", { title });

export const getChatMessages = (threadId: string) =>
  invoke<ChatMessage[]>("get_chat_messages", { threadId });

export const sendChatMessage = (threadId: string, content: string) =>
  invoke<ChatMessage>("send_chat_message", { threadId, content });

export interface AskAiSource {
  record_id: string;
  title: string;
}

export interface AskAiResponse {
  thread_id: string;
  message_id: string;
  content: string;
  sources: AskAiSource[];
}

export interface AskAiStreamResult {
  thread_id: string;
  message_id: string;
}

export const askAi = (question: string, threadId?: string) =>
  invoke<AskAiResponse>("ask_ai", { question, threadId: threadId ?? null });

export const askAiStream = (question: string, threadId?: string) =>
  invoke<AskAiStreamResult>("ask_ai_stream", { question, threadId: threadId ?? null });

// ── Dashboard ─────────────────────────────────────────────────────────────

export const getDashboardStats = () =>
  invoke<DashboardStats>("get_dashboard_stats");

export const getTodayBriefing = () =>
  invoke<TodayBriefing>("get_today_briefing");

// ── Capture ───────────────────────────────────────────────────────────────

export const captureText = (
  text: string,
  source: string,
  metadata?: string
) => invoke<string>("capture_text", { text, source, metadata });

// ── Projects ─────────────────────────────────────────────────────────────

export const getProjects = () => invoke<Project[]>("get_projects");

export const getProject = (id: string) =>
  invoke<Project>("get_project", { id });

export const createProject = (params: {
  name: string;
  description?: string;
  color?: string;
}) => invoke<Project>("create_project", { params });

export const updateProject = (params: {
  id: string;
  name?: string;
  description?: string;
  color?: string;
}) => invoke<void>("update_project", { params });

export const deleteProject = (id: string) =>
  invoke<void>("delete_project", { id });

export const getProjectRecords = (projectId: string) =>
  invoke<Record[]>("get_project_records", { projectId });

export const getRecordProject = (recordId: string) =>
  invoke<Project | null>("get_record_project", { recordId });

export const addRecordToProject = (projectId: string, recordId: string) =>
  invoke<void>("add_record_to_project", { projectId, recordId });

export const removeRecordFromProject = (projectId: string, recordId: string) =>
  invoke<void>("remove_record_from_project", { projectId, recordId });

// ── Inbox ────────────────────────────────────────────────────────────────

export const getRawItems = (params?: {
  status?: string;
  limit?: number;
}) =>
  invoke<RawItem[]>("get_raw_items", {
    limit: params?.limit ?? 50,
    statusFilter: params?.status ?? null,
  });

export const getRawItemsCount = () =>
  invoke<RawItemsCount>("get_raw_items_count");

export const updateRawItemStatus = (id: string, status: string) =>
  invoke<void>("update_raw_item_status", { id, status });

export const runTriageOnItem = (rawItemId: string) =>
  invoke<void>("run_triage_on_item", { rawItemId });

export const runTriageAllPending = () =>
  invoke<number>("run_triage_all_pending");

// ── Notifications ────────────────────────────────────────────────────────

export const getNotifications = (status?: string, limit?: number) =>
  invoke<Notification[]>("get_notifications", {
    status: status ?? null,
    limit: limit ?? 50,
  });

export const getNotificationCount = () =>
  invoke<number>("get_notification_count");

export const markNotificationDone = (id: string) =>
  invoke<void>("mark_notification_done", { id });

// ── Agent Tools ──────────────────────────────────────────────────────────

export const getRecentJobs = (limit?: number, offset?: number) =>
  invoke<JobQueueItem[]>("get_recent_jobs", { limit: limit ?? 50, offset: offset ?? 0 });

export const getJobCounts = () =>
  invoke<[number, number, number, number]>("get_job_counts");

export const runManualRelink = () => invoke<number>("run_manual_relink");

export const runRebuildEmbeddings = () =>
  invoke<number>("run_rebuild_embeddings");

export const testAiConnection = () =>
  invoke<boolean>("test_ai_connection");

// ── Chat (extended) ──────────────────────────────────────────────────────

export const deleteChatThread = (threadId: string) =>
  invoke<void>("delete_chat_thread", { id: threadId });

// ── Ambient ──────────────────────────────────────────────────────────────

export const snoozeAmbient = (minutes: number) =>
  invoke<void>("snooze_ambient", { minutes });

// ── Usage / Metering ────────────────────────────────────────────────────

export interface UsageStats {
  tier: "anonymous" | "registered" | "smart";
  used: number;
  limit: number; // -1 = unlimited, 0 = blocked
  remaining: number;
  trialDaysLeft: number;
  trialExpired: boolean;
  date: string;
}

export const getUsageStats = () =>
  invoke<UsageStats>("get_usage_stats");

// ── Auth ────────────────────────────────────────────────────────────────

export interface AuthState {
  isLoggedIn: boolean;
  email: string | null;
  name: string | null;
  tier: "anonymous" | "registered" | "smart";
}

export async function getAuthState(): Promise<AuthState> {
  const [token, email, name] = await Promise.all([
    getConfigValue("auth_token"),
    getConfigValue("user_email"),
    getConfigValue("user_name"),
  ]);
  const isLoggedIn = !!token && token.length > 0;
  let tier: AuthState["tier"] = "anonymous";
  if (isLoggedIn) {
    try {
      const stats = await getUsageStats();
      tier = stats.tier;
    } catch {
      tier = "registered";
    }
  }
  return { isLoggedIn, email: email || null, name: name || null, tier };
}

export async function loginViaBrowser(): Promise<void> {
  const { open } = await import("@tauri-apps/plugin-shell");
  await open("https://www.reattend.com/login/desktop");
}

export async function logout(): Promise<void> {
  await Promise.all([
    setConfigValue("auth_token", ""),
    setConfigValue("user_email", ""),
    setConfigValue("user_name", ""),
  ]);
}

export interface ConnectTokenResult {
  tier: "anonymous" | "registered" | "smart";
  used: number;
  limit: number | "unlimited";
}

export const connectToken = (token: string) =>
  invoke<ConnectTokenResult>("connect_token", { token });

// ── Screen Permission ───────────────────────────────────────────────────

export const checkScreenPermission = () =>
  invoke<boolean>("check_screen_permission");

export const openPrivacySettings = (setting: "screen" | "mic") =>
  invoke<void>("open_privacy_settings", { setting });

// ── Meeting Mode ────────────────────────────────────────────────────

export interface StartMeetingResult {
  recording_id: string;
}

export interface StopMeetingResult {
  recording_id: string;
  duration_secs: number;
  raw_item_id: string;
}

export interface MeetingStatus {
  is_recording: boolean;
  recording_id: string | null;
  elapsed_secs: number | null;
}

export const startMeeting = (metadata?: string) =>
  invoke<StartMeetingResult>("start_meeting", { metadata: metadata ?? null });

export const stopMeeting = () =>
  invoke<StopMeetingResult>("stop_meeting");

export const getMeetingStatus = () =>
  invoke<MeetingStatus>("get_meeting_status");

export const checkMicPermission = () =>
  invoke<boolean>("check_mic_permission");

// ── Sharing ─────────────────────────────────────────────────────────

export interface ShareResult {
  shareUrl: string;
  shareToken: string;
}

export async function sendShareEmail(data: {
  to: string;
  title: string;
  summary?: string;
  shareUrl: string;
  senderName?: string;
}): Promise<void> {
  const serverUrl = await getConfigValue("server_url") || "https://www.reattend.com";
  const deviceId = await getConfigValue("device_id") || "";
  const authToken = await getConfigValue("auth_token") || "";

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${serverUrl}/api/tray/proxy/share/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Email send failed" }));
    throw new Error(err.error || "Failed to send email");
  }
}

export async function createShareLink(data: {
  title: string;
  summary?: string;
  content?: string;
  record_type: string;
  tags?: string[];
  meta?: { [key: string]: unknown };
  entities?: { kind: string; name: string }[];
}): Promise<ShareResult> {
  const serverUrl = await getConfigValue("server_url") || "https://www.reattend.com";
  const deviceId = await getConfigValue("device_id") || "";
  const authToken = await getConfigValue("auth_token") || "";

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${serverUrl}/api/tray/proxy/share`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Share failed" }));
    throw new Error(err.error || "Failed to create share link");
  }

  return res.json();
}

// ── Capture Health ──────────────────────────────────────────────────────

export interface CaptureHealth {
  status: string;
  fail_count: number;
  success_count: number;
  has_permission: boolean;
}

export const getCaptureHealth = () =>
  invoke<CaptureHealth>("get_capture_health");

export const retryCaptureTest = () =>
  invoke<CaptureHealth>("retry_capture");

export const openScreenRecordingSettings = () =>
  invoke<void>("open_screen_recording_settings");
