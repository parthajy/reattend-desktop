use std::sync::{Arc, Mutex, atomic::Ordering};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

use crate::db::{self, Database};
use crate::ai;
use crate::audio::MeetingState;

// ── Config commands ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub ai_provider: String,    // "server", "groq", or "ollama"
    pub groq_api_key: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub theme: String,
}

#[tauri::command]
pub async fn get_config(db: State<'_, Arc<Database>>) -> Result<AppConfig, String> {
    let ai_provider = db.get_config("ai_provider").unwrap_or_else(|| "server".to_string());
    let groq_api_key = db.get_config("groq_api_key").unwrap_or_default();
    let ollama_url = db.get_config("ollama_url").unwrap_or_else(|| "http://localhost:11434".to_string());
    let ollama_model = db.get_config("ollama_model").unwrap_or_else(|| "llama3.2:3b".to_string());
    let theme = db.get_config("theme").unwrap_or_else(|| "light".to_string());
    Ok(AppConfig { ai_provider, groq_api_key, ollama_url, ollama_model, theme })
}

#[tauri::command]
pub async fn save_config(db: State<'_, Arc<Database>>, config: AppConfig) -> Result<(), String> {
    db.set_config("ai_provider", &config.ai_provider).map_err(|e| e.to_string())?;
    db.set_config("groq_api_key", &config.groq_api_key).map_err(|e| e.to_string())?;
    db.set_config("ollama_url", &config.ollama_url).map_err(|e| e.to_string())?;
    db.set_config("ollama_model", &config.ollama_model).map_err(|e| e.to_string())?;
    db.set_config("theme", &config.theme).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_config_value(db: State<'_, Arc<Database>>, key: String) -> Result<Option<String>, String> {
    Ok(db.get_config(&key))
}

#[tauri::command]
pub async fn set_config_value(db: State<'_, Arc<Database>>, key: String, value: String) -> Result<(), String> {
    db.set_config(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_usage_stats(db: State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let server_url = db.get_config("server_url")
        .unwrap_or_else(|| "https://www.reattend.com".to_string());
    let device_id = db.get_config("device_id").unwrap_or_default();
    let auth_token = db.get_config("auth_token").unwrap_or_default();

    let client = reqwest::Client::new();
    let mut req = client.get(format!("{}/api/tray/proxy/usage", server_url))
        .header("X-Device-Id", &device_id);
    if !auth_token.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", auth_token));
    }

    let res = req.timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch usage: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Usage API error: {}", res.status()));
    }

    res.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse usage: {}", e))
}

/// Validate a pasted API token against the server and save it if valid.
/// Returns the user info (email, name, tier) on success.
#[tauri::command]
pub async fn connect_token(db: State<'_, Arc<Database>>, token: String) -> Result<serde_json::Value, String> {
    let token = token.trim().to_string();
    if !token.starts_with("rat_") {
        return Err("Invalid token format. Token should start with rat_".to_string());
    }

    let server_url = db.get_config("server_url")
        .unwrap_or_else(|| "https://www.reattend.com".to_string());
    let device_id = db.get_config("device_id").unwrap_or_default();

    // Validate by calling usage endpoint with the token
    let client = reqwest::Client::new();
    let res = client.get(format!("{}/api/tray/proxy/usage", server_url))
        .header("X-Device-Id", &device_id)
        .header("Authorization", format!("Bearer {}", token))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Could not reach server: {}", e))?;

    if !res.status().is_success() {
        return Err("Token is invalid or expired. Please generate a new one.".to_string());
    }

    let usage: serde_json::Value = res.json().await
        .map_err(|e| format!("Invalid response: {}", e))?;

    // Token is valid — save it
    db.set_config("auth_token", &token).map_err(|e| e.to_string())?;

    // Extract tier info
    let tier = usage.get("tier").and_then(|v| v.as_str()).unwrap_or("registered");

    Ok(serde_json::json!({
        "tier": tier,
        "used": usage.get("used"),
        "limit": usage.get("limit"),
    }))
}

/// Helper: create AiClient from current config (for LLM calls only — embeddings are local)
fn make_ai_client(db: &Database) -> ai::AiClient {
    let provider = db.get_config("ai_provider").unwrap_or_else(|| "server".to_string());

    // Default: route through server proxy (no API keys on client)
    if provider == "server" {
        let server_url = db.get_config("server_url")
            .unwrap_or_else(|| "https://www.reattend.com".to_string());
        let device_id = db.get_config("device_id").unwrap_or_default();
        let auth_token = db.get_config("auth_token").unwrap_or_default();
        return ai::AiClient::new_server(&server_url, &device_id, &auth_token);
    }

    // Legacy: direct Groq (for development/self-hosted)
    if provider == "groq" {
        let groq_key = db.get_config("groq_api_key").unwrap_or_default();
        if !groq_key.is_empty() {
            return ai::AiClient::new_groq(&groq_key);
        }
    }

    // Fallback: Ollama (local LLM)
    let url = db.get_config("ollama_url").unwrap_or_else(|| "http://localhost:11434".to_string());
    let model = db.get_config("ollama_model").unwrap_or_else(|| "llama3.2:3b".to_string());
    ai::AiClient::new_ollama(&url, &model)
}

// ── Record commands ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GetRecordsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub type_filter: Option<String>,
}

#[tauri::command]
pub async fn get_records(db: State<'_, Arc<Database>>, params: GetRecordsParams) -> Result<Vec<db::Record>, String> {
    db.get_records(
        params.limit.unwrap_or(50),
        params.offset.unwrap_or(0),
        params.type_filter.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_record(db: State<'_, Arc<Database>>, id: String) -> Result<db::Record, String> {
    db.get_record(&id).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateRecordParams {
    pub record_type: Option<String>,
    pub title: String,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub tags: Option<String>,
    pub source: Option<String>,
}

#[tauri::command]
pub async fn create_record(db: State<'_, Arc<Database>>, params: CreateRecordParams) -> Result<String, String> {
    let record_id = db.insert_record(
        params.record_type.as_deref().unwrap_or("note"),
        &params.title,
        params.summary.as_deref(),
        params.content.as_deref(),
        None,
        params.tags.as_deref(),
        params.source.as_deref(),
        None,
        None,
    ).map_err(|e| e.to_string())?;

    // Queue AI enrichment (entity extraction, tags, confidence, summary)
    let enrich_payload = serde_json::json!({ "record_id": record_id }).to_string();
    let _ = db.queue_job("enrich", &enrich_payload);

    // Queue embedding generation
    let embed_payload = serde_json::json!({ "record_id": record_id }).to_string();
    let _ = db.queue_job("embed", &embed_payload);

    Ok(record_id)
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecordParams {
    pub id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub tags: Option<String>,
}

#[tauri::command]
pub async fn update_record(db: State<'_, Arc<Database>>, params: UpdateRecordParams) -> Result<(), String> {
    db.update_record(
        &params.id,
        params.title.as_deref(),
        params.summary.as_deref(),
        params.content.as_deref(),
        params.tags.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_record(db: State<'_, Arc<Database>>, id: String) -> Result<(), String> {
    db.delete_record(&id).map_err(|e| e.to_string())
}

// ── Search ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn search_records(db: State<'_, Arc<Database>>, query: String) -> Result<Vec<db::Record>, String> {
    db.search_records(&query, 20).map_err(|e| e.to_string())
}

// ── Entities ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_entities(db: State<'_, Arc<Database>>) -> Result<Vec<db::Entity>, String> {
    db.get_entities(100).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_record_entities(db: State<'_, Arc<Database>>, record_id: String) -> Result<Vec<db::Entity>, String> {
    db.get_record_entities(&record_id).map_err(|e| e.to_string())
}

// ── Record Links ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_record_links(db: State<'_, Arc<Database>>, record_id: String) -> Result<Vec<(db::RecordLink, db::Record)>, String> {
    db.get_record_links(&record_id).map_err(|e| e.to_string())
}

// ── Graph ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GraphData {
    pub nodes: Vec<db::GraphNode>,
    pub edges: Vec<db::GraphEdge>,
}

#[tauri::command]
pub async fn get_graph_data(db: State<'_, Arc<Database>>) -> Result<GraphData, String> {
    let (nodes, edges) = db.get_graph_data().map_err(|e| e.to_string())?;
    Ok(GraphData { nodes, edges })
}

// ── Board ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FullBoardData {
    pub board: db::BoardData,
    pub nodes: Vec<db::BoardNode>,
    pub edges: Vec<db::BoardEdge>,
}

#[tauri::command]
pub async fn get_board(db: State<'_, Arc<Database>>) -> Result<FullBoardData, String> {
    let board = db.get_or_create_default_board().map_err(|e| e.to_string())?;
    let nodes = db.get_board_nodes(&board.id).map_err(|e| e.to_string())?;
    let edges = db.get_board_edges(&board.id).map_err(|e| e.to_string())?;
    Ok(FullBoardData { board, nodes, edges })
}

#[derive(Debug, Deserialize)]
pub struct SaveBoardParams {
    pub board_id: String,
    pub nodes: String,  // JSON array
    pub edges: String,  // JSON array
}

#[tauri::command]
pub async fn save_board(db: State<'_, Arc<Database>>, params: SaveBoardParams) -> Result<(), String> {
    db.save_board_state(&params.board_id, &params.nodes, &params.edges)
        .map_err(|e| e.to_string())
}

// ── Chat ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_chat_threads(db: State<'_, Arc<Database>>) -> Result<Vec<db::ChatThread>, String> {
    db.get_chat_threads().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_chat_thread(db: State<'_, Arc<Database>>, title: String) -> Result<db::ChatThread, String> {
    db.create_chat_thread(&title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_chat_messages(db: State<'_, Arc<Database>>, thread_id: String) -> Result<Vec<db::ChatMessage>, String> {
    db.get_chat_messages(&thread_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_message(db: State<'_, Arc<Database>>, thread_id: String, content: String) -> Result<db::ChatMessage, String> {
    let id = db.insert_chat_message(&thread_id, "user", &content).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    Ok(db::ChatMessage {
        id,
        thread_id,
        role: "user".to_string(),
        content,
        metadata: None,
        created_at: now,
    })
}

// ── Dashboard ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_dashboard_stats(db: State<'_, Arc<Database>>) -> Result<db::DashboardStats, String> {
    db.get_dashboard_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_today_briefing(db: State<'_, Arc<Database>>) -> Result<db::TodayBriefing, String> {
    db.get_today_briefing().map_err(|e| e.to_string())
}

// ── Capture (local pipeline) ──────────────────────────────────────────────

#[tauri::command]
pub async fn capture_text(
    db: State<'_, Arc<Database>>,
    text: String,
    source: String,
    metadata: Option<String>,
) -> Result<String, String> {
    let raw_id = db.insert_raw_item(&text, &source, None, metadata.as_deref())
        .map_err(|e| e.to_string())?;

    // Queue triage job
    let payload = serde_json::json!({ "raw_item_id": raw_id }).to_string();
    db.queue_job("triage", &payload).map_err(|e| e.to_string())?;

    Ok(raw_id)
}

// ── Ambient snooze ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn snooze_ambient(minutes: u64) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    crate::SNOOZE_UNTIL.store(now + (minutes as i64 * 60), std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

// ── OCR ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_ocr_capture(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    crate::platform::platform_capture_screen_ocr(&app).await
}

// ── AI Chat ──────────────────────────────────────────────────────────────

/// Non-streaming ask AI — returns complete response
#[tauri::command]
pub async fn ask_ai(
    db: State<'_, Arc<Database>>,
    question: String,
    thread_id: Option<String>,
) -> Result<AskAiResponse, String> {
    // Get or create thread
    let thread = match thread_id {
        Some(ref tid) => db.get_chat_threads()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|t| t.id == *tid)
            .ok_or_else(|| "Thread not found".to_string())?,
        None => {
            let title = if question.len() > 50 {
                format!("{}...", &question[..47])
            } else {
                question.clone()
            };
            db.create_chat_thread(&title).map_err(|e| e.to_string())?
        }
    };

    // Save user message
    db.insert_chat_message(&thread.id, "user", &question)
        .map_err(|e| e.to_string())?;

    // Build AI client from config
    let client = make_ai_client(&db);

    // Find relevant context via semantic search
    let context = find_relevant_context(&db, &client, &question).await;

    // Extract sources
    let sources: Vec<AskAiSource> = context.iter()
        .map(|(id, title, _, _, _)| AskAiSource { record_id: id.clone(), title: title.clone() })
        .collect();

    // Convert to 4-tuple for prompt builder (title, summary, content, type)
    let prompt_context: Vec<(String, String, String, String)> = context.iter()
        .map(|(_, title, summary, content, rtype)| (title.clone(), summary.clone(), content.clone(), rtype.clone()))
        .collect();

    // Check AI provider availability
    if !client.is_available().await {
        let fallback = "I'm unable to connect to the AI provider right now. Please check your settings and try again.".to_string();
        let msg_id = db.insert_chat_message(&thread.id, "assistant", &fallback)
            .map_err(|e| e.to_string())?;
        return Ok(AskAiResponse {
            thread_id: thread.id,
            message_id: msg_id,
            content: fallback,
            sources: vec![],
        });
    }

    let answer = ai::run_ask(&client, &question, &prompt_context).await?;

    // Save AI response
    let msg_id = db.insert_chat_message(&thread.id, "assistant", &answer)
        .map_err(|e| e.to_string())?;

    Ok(AskAiResponse {
        thread_id: thread.id,
        message_id: msg_id,
        content: answer,
        sources,
    })
}

#[derive(Debug, Serialize, Clone)]
pub struct AskAiSource {
    pub record_id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct AskAiResponse {
    pub thread_id: String,
    pub message_id: String,
    pub content: String,
    pub sources: Vec<AskAiSource>,
}

/// Streaming ask AI — emits ai_stream_chunk events, returns thread info
#[tauri::command]
pub async fn ask_ai_stream(
    app: tauri::AppHandle,
    question: String,
    thread_id: Option<String>,
) -> Result<AskAiStreamResult, String> {
    let db = app.state::<Arc<Database>>();

    // Get or create thread
    let thread = match thread_id {
        Some(ref tid) => db.get_chat_threads()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|t| t.id == *tid)
            .ok_or_else(|| "Thread not found".to_string())?,
        None => {
            let title = if question.len() > 50 {
                format!("{}...", &question[..47])
            } else {
                question.clone()
            };
            db.create_chat_thread(&title).map_err(|e| e.to_string())?
        }
    };

    // Save user message
    db.insert_chat_message(&thread.id, "user", &question)
        .map_err(|e| e.to_string())?;

    // Load conversation history (last 10 messages, excluding the one we just saved)
    let all_messages = db.get_chat_messages(&thread.id).unwrap_or_default();
    let history: Vec<&db::ChatMessage> = if all_messages.len() > 1 {
        all_messages.iter()
            .rev()
            .skip(1) // skip the user message we just inserted
            .take(10)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    } else {
        vec![]
    };

    // Build AI client from config
    let client = make_ai_client(&db);

    // Build a context-aware search query using conversation history
    // This ensures "Anything to follow up on this?" searches based on what
    // was previously discussed, not just the vague follow-up question.
    let search_query = if history.is_empty() {
        question.clone()
    } else {
        let mut parts: Vec<String> = Vec::new();
        // Take last 2 user messages for context (they define the topic)
        for msg in history.iter().rev() {
            if msg.role == "user" && parts.len() < 2 {
                parts.push(msg.content.clone());
            }
        }
        parts.reverse();
        parts.push(question.clone());
        let combined = parts.join(" ");
        if combined.len() > 500 { combined[..500].to_string() } else { combined }
    };

    // Find relevant context using conversation-aware query
    let context = find_relevant_context(&db, &client, &search_query).await;

    // Extract sources
    let sources: Vec<AskAiSource> = context.iter()
        .map(|(id, title, _, _, _)| AskAiSource { record_id: id.clone(), title: title.clone() })
        .collect();

    if !client.is_available().await {
        let fallback = "I'm unable to connect to the AI provider right now. Please check your settings.";
        let msg_id = db.insert_chat_message(&thread.id, "assistant", fallback)
            .map_err(|e| e.to_string())?;
        let _ = app.emit("ai_stream_chunk", serde_json::json!({
            "thread_id": &thread.id,
            "content": fallback,
            "done": true,
            "sources": [],
        }));
        return Ok(AskAiStreamResult {
            thread_id: thread.id,
            message_id: msg_id,
        });
    }

    // Build memories context string for the system prompt
    let memories_str: String = context.iter().enumerate()
        .map(|(i, (_, title, summary, content, rtype))| {
            let content_str = if content.is_empty() { String::new() } else { format!("\nDetails: {}", content) };
            format!("Memory {} — \"{}\" ({})\nSummary: {}{}\n", i + 1, title, rtype, summary, content_str)
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Build proper multi-turn messages array
    let system_content = format!(
        "You are a helpful personal memory assistant. The user stores their thoughts, decisions, meetings, \
         and notes in Reattend. Answer their questions using the memories provided below.\n\n\
         Rules:\n\
         - Answer naturally and conversationally, like a knowledgeable assistant.\n\
         - Do NOT use bracket references like [1] or [2] in your response.\n\
         - Instead, mention specific details naturally (names, dates, topics) so the user knows which memory you're referring to.\n\
         - Be concise: 2-4 sentences unless more detail is needed.\n\
         - If none of the memories are relevant, say \"I don't have that in your memories yet.\"\n\
         - Never make up information that isn't in the memories.\n\n\
         User's memories:\n{}",
        if memories_str.is_empty() { "(No relevant memories found)".to_string() } else { memories_str }
    );

    let mut chat_messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "system", "content": system_content }),
    ];

    // Add conversation history so the AI understands context (e.g. what "this" refers to)
    for msg in &history {
        chat_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    // Add the current user question
    chat_messages.push(serde_json::json!({
        "role": "user",
        "content": question,
    }));

    // Start streaming with full conversation context
    let response = match client.generate_chat_stream(&chat_messages).await {
        Ok(r) => r,
        Err(e) if e.starts_with("429:") => {
            // Rate limited — emit event and return friendly message
            let _ = app.emit("usage_limit_reached", serde_json::json!({
                "error": e,
            }));
            let limit_msg = "You've reached your daily AI usage limit. Create a free account or upgrade to continue.";
            let msg_id = db.insert_chat_message(&thread.id, "assistant", limit_msg)
                .map_err(|e| e.to_string())?;
            let _ = app.emit("ai_stream_chunk", serde_json::json!({
                "thread_id": &thread.id,
                "content": limit_msg,
                "done": true,
                "sources": [],
            }));
            return Ok(AskAiStreamResult {
                thread_id: thread.id,
                message_id: msg_id,
            });
        }
        Err(e) => return Err(e),
    };
    let thread_id_clone = thread.id.clone();
    let is_groq = *client.provider() == ai::AiProvider::Groq || *client.provider() == ai::AiProvider::Server;

    // Stream chunks to frontend
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut full_response = String::new();
    let mut line_buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AI Stream] Error: {}", e);
                break;
            }
        };

        let text = String::from_utf8_lossy(&chunk);
        line_buffer.push_str(&text);

        // Process complete lines
        while let Some(newline_pos) = line_buffer.find('\n') {
            let line = line_buffer[..newline_pos].trim().to_string();
            line_buffer = line_buffer[newline_pos + 1..].to_string();

            if line.is_empty() { continue; }

            if is_groq {
                // Groq SSE format: "data: {json}" or "data: [DONE]"
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" { break; }
                    if let Ok(parsed) = serde_json::from_str::<ai::GroqStreamChunk>(data) {
                        for choice in &parsed.choices {
                            if let Some(content) = &choice.delta.content {
                                full_response.push_str(content);
                                let _ = app.emit("ai_stream_chunk", serde_json::json!({
                                    "thread_id": &thread_id_clone,
                                    "content": content,
                                    "done": false,
                                }));
                            }
                        }
                    }
                }
            } else {
                // Ollama NDJSON format
                if let Ok(parsed) = serde_json::from_str::<ai::OllamaStreamChunk>(&line) {
                    if let Some(msg) = &parsed.message {
                        if let Some(content) = &msg.content {
                            full_response.push_str(content);
                            let _ = app.emit("ai_stream_chunk", serde_json::json!({
                                "thread_id": &thread_id_clone,
                                "content": content,
                                "done": false,
                            }));
                        }
                    }
                    if parsed.done.unwrap_or(false) {
                        break;
                    }
                }
            }
        }
    }

    // Save complete AI response
    let msg_id = db.insert_chat_message(&thread.id, "assistant", &full_response)
        .map_err(|e| e.to_string())?;

    // Emit done signal with sources
    let _ = app.emit("ai_stream_chunk", serde_json::json!({
        "thread_id": &thread.id,
        "content": "",
        "done": true,
        "sources": sources,
    }));

    Ok(AskAiStreamResult {
        thread_id: thread.id,
        message_id: msg_id,
    })
}

#[derive(Debug, Serialize)]
pub struct AskAiStreamResult {
    pub thread_id: String,
    pub message_id: String,
}

/// Find relevant memory context for an AI question using embeddings + text search
/// Returns (record_id, title, summary, content, record_type)
async fn find_relevant_context(
    db: &Database,
    client: &ai::AiClient,
    question: &str,
) -> Vec<(String, String, String, String, String)> {
    let mut context: Vec<(String, String, String, String, String)> = Vec::new();

    // 1. Text search — keyword-based LIKE query
    match db.search_records(question, 5) {
        Ok(results) => {
            println!("[Ask] Text search found {} results for: {}", results.len(),
                if question.len() > 60 { &question[..60] } else { question });
            for r in results {
                context.push((
                    r.id.clone(),
                    r.title,
                    r.summary.unwrap_or_default(),
                    r.content.unwrap_or_default(),
                    r.record_type,
                ));
            }
        }
        Err(e) => {
            eprintln!("[Ask] Text search failed: {}", e);
        }
    }

    // 2. Semantic search — embed question locally, compare with stored vectors
    match client.embed_for_query(question).await {
        Ok(query_embedding) => {
            match db.get_all_embeddings() {
                Ok(all_embeddings) => {
                    println!("[Ask] Semantic search: {} embeddings in DB, query vector len={}",
                        all_embeddings.len(), query_embedding.len());
                    let mut similarities: Vec<(String, f64)> = all_embeddings.iter()
                        .map(|(id, vec)| (id.clone(), ai::cosine_similarity(&query_embedding, vec)))
                        .filter(|(_, sim)| *sim > 0.3)
                        .collect();
                    similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

                    let sem_count_before = context.len();
                    for (record_id, score) in similarities.iter().take(5) {
                        if let Ok(rec) = db.get_record(record_id) {
                            if !context.iter().any(|(_, t, _, _, _)| t == &rec.title) {
                                println!("[Ask] Semantic match: \"{}\" (score={:.3})", rec.title, score);
                                context.push((
                                    rec.id.clone(),
                                    rec.title,
                                    rec.summary.unwrap_or_default(),
                                    rec.content.unwrap_or_default(),
                                    rec.record_type,
                                ));
                            }
                        }
                    }
                    println!("[Ask] Semantic search added {} results", context.len() - sem_count_before);
                }
                Err(e) => {
                    eprintln!("[Ask] Failed to load embeddings from DB: {}", e);
                }
            }
        }
        Err(e) => {
            eprintln!("[Ask] Embedding failed (semantic search skipped): {}", e);
        }
    }

    println!("[Ask] Total context: {} memories for question", context.len());
    context.truncate(5);
    context
}

// ── Projects ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_projects(db: State<'_, Arc<Database>>) -> Result<Vec<db::Project>, String> {
    db.get_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(db: State<'_, Arc<Database>>, id: String) -> Result<db::Project, String> {
    db.get_project(&id).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectParams {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn create_project(db: State<'_, Arc<Database>>, params: CreateProjectParams) -> Result<String, String> {
    db.create_project(
        &params.name,
        params.description.as_deref(),
        params.color.as_deref().unwrap_or("#6366f1"),
    ).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectParams {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn update_project(db: State<'_, Arc<Database>>, params: UpdateProjectParams) -> Result<(), String> {
    db.update_project(
        &params.id,
        &params.name,
        params.description.as_deref(),
        params.color.as_deref().unwrap_or("#6366f1"),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project(db: State<'_, Arc<Database>>, id: String) -> Result<(), String> {
    db.delete_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project_records(db: State<'_, Arc<Database>>, project_id: String) -> Result<Vec<db::Record>, String> {
    db.get_project_records(&project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_record_to_project(
    db: State<'_, Arc<Database>>,
    project_id: String,
    record_id: String,
) -> Result<(), String> {
    db.add_record_to_project(&project_id, &record_id, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_record_from_project(
    db: State<'_, Arc<Database>>,
    project_id: String,
    record_id: String,
) -> Result<(), String> {
    db.remove_record_from_project(&project_id, &record_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_record_project(
    db: State<'_, Arc<Database>>,
    record_id: String,
) -> Result<Option<db::Project>, String> {
    db.get_record_project(&record_id).map_err(|e| e.to_string())
}

// ── Inbox / Raw Items ────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_raw_items(
    db: State<'_, Arc<Database>>,
    limit: Option<i64>,
    status_filter: Option<String>,
) -> Result<Vec<db::RawItem>, String> {
    db.get_all_raw_items(
        limit.unwrap_or(100),
        status_filter.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_raw_items_count(db: State<'_, Arc<Database>>) -> Result<db::RawItemsCount, String> {
    db.get_raw_items_count().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_raw_item_status(
    db: State<'_, Arc<Database>>,
    id: String,
    status: String,
) -> Result<(), String> {
    db.update_raw_item_status(&id, &status, None).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_triage_on_item(
    db: State<'_, Arc<Database>>,
    raw_item_id: String,
) -> Result<(), String> {
    // Queue a triage job for this specific raw item
    let payload = serde_json::json!({ "raw_item_id": raw_item_id }).to_string();
    db.queue_job("triage", &payload).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn run_triage_all_pending(db: State<'_, Arc<Database>>) -> Result<i64, String> {
    let items = db.get_all_raw_items(500, Some("pending")).map_err(|e| e.to_string())?;
    let mut queued = 0i64;
    for item in &items {
        let payload = serde_json::json!({ "raw_item_id": item.id }).to_string();
        if db.queue_job("triage", &payload).is_ok() {
            queued += 1;
        }
    }
    Ok(queued)
}

// ── Notifications ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_notifications(
    db: State<'_, Arc<Database>>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<db::Notification>, String> {
    db.get_notifications(status.as_deref(), limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_notification_count(db: State<'_, Arc<Database>>) -> Result<i64, String> {
    db.get_unread_notification_count().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_notification_done(db: State<'_, Arc<Database>>, id: String) -> Result<(), String> {
    db.update_notification_status(&id, "done").map_err(|e| e.to_string())
}

// ── Agent Tools ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_recent_jobs(db: State<'_, Arc<Database>>, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<db::JobQueueItem>, String> {
    db.get_recent_jobs(limit.unwrap_or(50), offset.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_job_counts(db: State<'_, Arc<Database>>) -> Result<(i64, i64, i64, i64), String> {
    db.get_job_counts().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_manual_relink(db: State<'_, Arc<Database>>) -> Result<i64, String> {
    let records = db.get_records(500, 0, None).map_err(|e| e.to_string())?;
    let mut queued = 0i64;
    for r in &records {
        let payload = serde_json::json!({ "record_id": r.id }).to_string();
        if db.queue_job("link", &payload).is_ok() {
            queued += 1;
        }
    }
    Ok(queued)
}

#[tauri::command]
pub async fn run_rebuild_embeddings(db: State<'_, Arc<Database>>) -> Result<i64, String> {
    let records = db.get_records(500, 0, None).map_err(|e| e.to_string())?;
    let existing_embeddings = db.get_all_embeddings().map_err(|e| e.to_string())?;
    let embedded_ids: std::collections::HashSet<String> = existing_embeddings.into_iter().map(|(id, _)| id).collect();

    let mut queued = 0i64;
    for r in &records {
        // Skip records that already have embeddings
        if embedded_ids.contains(&r.id) {
            continue;
        }
        let payload = serde_json::json!({ "record_id": r.id }).to_string();
        if db.queue_job("embed", &payload).is_ok() {
            queued += 1;
        }
    }
    Ok(queued)
}

#[tauri::command]
pub async fn test_ai_connection(db: State<'_, Arc<Database>>) -> Result<bool, String> {
    let client = make_ai_client(&db);
    Ok(client.is_available().await)
}

// ── Delete Chat Thread ───────────────────────────────────────────────────

#[tauri::command]
pub async fn delete_chat_thread(db: State<'_, Arc<Database>>, id: String) -> Result<(), String> {
    db.delete_chat_thread(&id).map_err(|e| e.to_string())
}

// ── Screen Permission Check ─────────────────────────────────────────────

#[tauri::command]
pub async fn check_screen_permission(_app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::platform::platform_check_screen_permission())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
pub async fn open_privacy_settings(setting: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        match setting.as_str() {
            "screen" => {
                // Request access first — this adds Reattend to the list if not already there
                crate::platform::platform_request_screen_permission();
                // Small delay to let the system register the app before opening settings
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                crate::platform::platform_open_screen_settings();
            }
            "mic" => crate::platform::platform_open_mic_settings(),
            _ => return Err(format!("Unknown setting: {}", setting)),
        }
    }
    Ok(())
}

// ── Meeting Mode ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct StartMeetingResult {
    pub recording_id: String,
}

#[derive(Debug, Serialize)]
pub struct StopMeetingResult {
    pub recording_id: String,
    pub duration_secs: u64,
    pub raw_item_id: String,
}

#[derive(Debug, Serialize)]
pub struct MeetingStatus {
    pub is_recording: bool,
    pub recording_id: Option<String>,
    pub elapsed_secs: Option<u64>,
}

#[tauri::command]
pub async fn start_meeting(
    app: tauri::AppHandle,
    meeting_state: State<'_, Arc<Mutex<MeetingState>>>,
    metadata: Option<String>,
) -> Result<StartMeetingResult, String> {
    let mut state = meeting_state.lock().map_err(|e| format!("Lock error: {}", e))?;
    if state.is_recording {
        return Err("Already recording a meeting".to_string());
    }

    // Use app data dir for storing WAV files
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("No data dir: {}", e))?;

    let (recording_id, wav_path, stop_flag) = crate::audio::start_recording(&data_dir)?;

    state.is_recording = true;
    state.recording_id = Some(recording_id.clone());
    state.start_time = Some(std::time::Instant::now());
    state.audio_path = Some(wav_path);
    state.stop_flag = Some(stop_flag);

    println!("[Meeting] Started recording: {}", recording_id);
    let _ = app.emit("meeting_started", serde_json::json!({
        "recording_id": recording_id,
        "metadata": metadata,
    }));

    Ok(StartMeetingResult { recording_id })
}

#[tauri::command]
pub async fn stop_meeting(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    meeting_state: State<'_, Arc<Mutex<MeetingState>>>,
) -> Result<StopMeetingResult, String> {
    let (recording_id, duration_secs, audio_path) = {
        let mut state = meeting_state.lock().map_err(|e| format!("Lock error: {}", e))?;
        if !state.is_recording {
            return Err("Not currently recording".to_string());
        }

        // Signal stop
        if let Some(flag) = state.stop_flag.take() {
            flag.store(true, Ordering::Relaxed);
        }

        let duration = state.start_time
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0);

        let recording_id = state.recording_id.clone().unwrap_or_default();
        let audio_path = state.audio_path.clone().unwrap_or_default();

        // Reset state
        state.is_recording = false;
        state.recording_id = None;
        state.start_time = None;
        state.audio_path = None;

        (recording_id, duration, audio_path)
    };

    // Small delay for WAV finalization
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Insert raw item for the recording
    let meta = serde_json::json!({
        "capture_type": "meeting",
        "recording_id": recording_id,
        "audio_path": audio_path.to_string_lossy(),
        "duration_secs": duration_secs,
    });

    let raw_id = db.insert_raw_item(
        &format!("Meeting recording ({} seconds)", duration_secs),
        "meeting",
        Some("audio"),
        Some(&meta.to_string()),
    ).map_err(|e| format!("Failed to insert raw item: {}", e))?;

    // Queue transcription job
    let payload = serde_json::json!({
        "raw_item_id": raw_id,
        "audio_path": audio_path.to_string_lossy(),
        "recording_id": recording_id,
    }).to_string();
    db.queue_job("transcribe", &payload).map_err(|e| format!("Failed to queue transcribe job: {}", e))?;

    println!("[Meeting] Stopped recording: {} ({}s) → raw_item {}", recording_id, duration_secs, raw_id);
    let _ = app.emit("meeting_stopped", serde_json::json!({
        "recording_id": recording_id,
        "duration_secs": duration_secs,
        "raw_item_id": raw_id,
    }));

    Ok(StopMeetingResult {
        recording_id,
        duration_secs,
        raw_item_id: raw_id,
    })
}

#[tauri::command]
pub async fn get_meeting_status(
    meeting_state: State<'_, Arc<Mutex<MeetingState>>>,
) -> Result<MeetingStatus, String> {
    let state = meeting_state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(MeetingStatus {
        is_recording: state.is_recording,
        recording_id: state.recording_id.clone(),
        elapsed_secs: state.start_time.map(|t| t.elapsed().as_secs()),
    })
}

#[tauri::command]
pub async fn check_mic_permission() -> Result<bool, String> {
    Ok(crate::audio::check_mic_available())
}

// ── Update commands ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
}

/// Returns cached update info from the Rust-side startup check
#[tauri::command]
pub async fn get_update_info() -> Result<UpdateInfo, String> {
    let info = crate::UPDATE_INFO.lock().unwrap();
    match info.as_ref() {
        Some((version, notes)) => Ok(UpdateInfo {
            available: true,
            version: Some(version.clone()),
            notes: Some(notes.clone()),
        }),
        None => Ok(UpdateInfo {
            available: false,
            version: None,
            notes: None,
        }),
    }
}

// ── Capture health ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureHealth {
    pub status: String,           // "healthy", "broken", "unknown"
    pub fail_count: u32,
    pub success_count: u32,
    pub has_permission: bool,
}

#[tauri::command]
pub async fn get_capture_health() -> Result<CaptureHealth, String> {
    let fail_count = crate::CAPTURE_FAIL_COUNT.load(Ordering::Relaxed);
    let success_count = crate::CAPTURE_SUCCESS_COUNT.load(Ordering::Relaxed);
    let has_permission = {
        #[cfg(target_os = "macos")]
        { crate::platform::platform_check_screen_permission() }
        #[cfg(not(target_os = "macos"))]
        { true }
    };
    let status = if !has_permission {
        "broken"
    } else if fail_count >= 5 {
        "broken"
    } else if success_count > 0 {
        "healthy"
    } else {
        "unknown"
    };
    Ok(CaptureHealth {
        status: status.to_string(),
        fail_count,
        success_count,
        has_permission,
    })
}

#[tauri::command]
pub async fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::platform::platform_open_screen_settings();
    }
    Ok(())
}

/// Trigger update download + install from the Rust side
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| format!("Updater error: {}", e))?;
    let update = updater.check().await.map_err(|e| format!("Check error: {}", e))?;
    match update {
        Some(u) => {
            let version = u.version.clone();
            u.download_and_install(|_, _| {}, || {}).await
                .map_err(|e| format!("Install error: {}", e))?;
            Ok(format!("Installed v{}", version))
        }
        None => Err("No update available".to_string()),
    }
}
