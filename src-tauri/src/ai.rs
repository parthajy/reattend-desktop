use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, Mutex};
use std::path::PathBuf;

// ── Local Embedding Model (fastembed — runs on-device, no API needed) ────

static LOCAL_EMBEDDER: OnceLock<Mutex<fastembed::TextEmbedding>> = OnceLock::new();

/// Initialize the local embedding model (call once at app startup).
/// Downloads ~130MB model on first run, then cached locally.
pub fn init_local_embedder(cache_dir: PathBuf) -> Result<(), String> {
    use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};

    println!("[Embed] Initializing local embedding model (nomic-embed-text-v1.5)...");
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::NomicEmbedTextV15)
            .with_cache_dir(cache_dir)
            .with_show_download_progress(true)
    ).map_err(|e| format!("Failed to init embedding model: {}", e))?;

    LOCAL_EMBEDDER.set(Mutex::new(model))
        .map_err(|_| "Embedder already initialized".to_string())?;

    println!("[Embed] Local embedding model ready");
    Ok(())
}

/// Check if the local embedder is initialized and ready
pub fn is_embedder_ready() -> bool {
    LOCAL_EMBEDDER.get().is_some()
}

/// Generate embedding for a document (memory content for storage).
/// Uses "search_document: " prefix as required by nomic-embed-text.
fn embed_document_sync(text: &str) -> Result<Vec<f64>, String> {
    let embedder = LOCAL_EMBEDDER.get()
        .ok_or("Local embedder not initialized yet (model still downloading?)")?;
    let mut model = embedder.lock()
        .map_err(|e| format!("Embedder lock poisoned: {}", e))?;

    let input = format!("search_document: {}", text);
    let truncated = if input.len() > 8000 { &input[..8000] } else { &input };

    let embeddings = model.embed(vec![truncated], None)
        .map_err(|e| format!("Local embedding failed: {}", e))?;

    embeddings.into_iter().next()
        .map(|v| v.into_iter().map(|f| f as f64).collect())
        .ok_or_else(|| "No embedding returned from local model".to_string())
}

/// Generate embedding for a search query.
/// Uses "search_query: " prefix as required by nomic-embed-text.
fn embed_query_sync(text: &str) -> Result<Vec<f64>, String> {
    let embedder = LOCAL_EMBEDDER.get()
        .ok_or("Local embedder not initialized yet (model still downloading?)")?;
    let mut model = embedder.lock()
        .map_err(|e| format!("Embedder lock poisoned: {}", e))?;

    let input = format!("search_query: {}", text);
    let truncated = if input.len() > 8000 { &input[..8000] } else { &input };

    let embeddings = model.embed(vec![truncated], None)
        .map_err(|e| format!("Local embedding failed: {}", e))?;

    embeddings.into_iter().next()
        .map(|v| v.into_iter().map(|f| f as f64).collect())
        .ok_or_else(|| "No embedding returned from local model".to_string())
}

/// Async wrapper for document embedding (runs on blocking thread)
pub async fn embed_document(text: &str) -> Result<Vec<f64>, String> {
    let text = text.to_string();
    tokio::task::spawn_blocking(move || embed_document_sync(&text))
        .await
        .map_err(|e| format!("Embed task panicked: {}", e))?
}

/// Async wrapper for query embedding (runs on blocking thread)
pub async fn embed_query(text: &str) -> Result<Vec<f64>, String> {
    let text = text.to_string();
    tokio::task::spawn_blocking(move || embed_query_sync(&text))
        .await
        .map_err(|e| format!("Embed task panicked: {}", e))?
}

// ── Ambient synthesis result ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AmbientSynthesis {
    pub show: bool,
    pub insight: String,
    pub sources: Vec<AmbientSource>,
    #[serde(default)]
    pub category: String, // "fact", "contradiction", "context"
    #[serde(default)]
    pub corrections: Vec<WritingCorrection>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WritingCorrection {
    pub original: String,
    pub suggested: String,
    pub reason: String,
    #[serde(rename = "type")]
    pub correction_type: String, // "fact", "contradiction"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AmbientSource {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub record_type: String,
}

// ── AI Provider ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum AiProvider {
    Server, // Proxy through reattend.com server (no API keys on client)
    Groq,
    Ollama,
}

/// Provider-agnostic AI client for LLM calls (triage, link, ask).
/// Embeddings are handled locally via fastembed — see embed_document() / embed_query().
pub struct AiClient {
    provider: AiProvider,
    http: reqwest::Client,
    // Server proxy (default — no API keys on client)
    server_url: String,
    device_id: String,
    auth_token: String, // rat_xxx token (empty if anonymous)
    // Groq (legacy direct mode)
    groq_api_key: String,
    groq_model: String,      // "llama-3.1-8b-instant" for triage/enrich/link
    groq_chat_model: String,  // "llama-3.3-70b-versatile" for Ask AI
    // Ollama fallback
    ollama_url: String,
    ollama_model: String,
}

// ── Triage result (matches web app's triageResultSchema) ────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriageResult {
    pub should_store: bool,
    pub record_type: String,
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub entities: Vec<TriageEntity>,
    pub confidence: f64,
    pub why_kept_or_dropped: String,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub key_points: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriageEntity {
    pub kind: String,
    pub name: String,
}

// ── Linking result ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkingResult {
    pub links: Vec<LinkCandidate>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkCandidate {
    pub target_id: String,
    pub kind: String,
    pub weight: f64,
    pub explanation: String,
}

// ── Ollama API response types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaMessage>,
}

#[derive(Debug, Deserialize)]
struct OllamaMessage {
    content: Option<String>,
}

// ── Ollama streaming response ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct OllamaStreamChunk {
    pub message: Option<OllamaStreamMessage>,
    pub done: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct OllamaStreamMessage {
    pub content: Option<String>,
}

// ── Groq API response types ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GroqChatResponse {
    choices: Vec<GroqChoice>,
}

#[derive(Debug, Deserialize)]
struct GroqChoice {
    message: GroqMessage,
}

#[derive(Debug, Deserialize)]
struct GroqMessage {
    content: Option<String>,
}

// ── Groq streaming response types ──────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GroqStreamChunk {
    pub choices: Vec<GroqStreamChoice>,
}

#[derive(Debug, Deserialize)]
pub struct GroqStreamChoice {
    pub delta: GroqStreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GroqStreamDelta {
    pub content: Option<String>,
}

// ── AiClient implementation ─────────────────────────────────────────────

impl AiClient {
    /// Create a server proxy client (default — keys on server, not client)
    pub fn new_server(server_url: &str, device_id: &str, auth_token: &str) -> Self {
        Self {
            provider: AiProvider::Server,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            server_url: server_url.trim_end_matches('/').to_string(),
            device_id: device_id.to_string(),
            auth_token: auth_token.to_string(),
            groq_api_key: String::new(),
            groq_model: String::new(),
            groq_chat_model: String::new(),
            ollama_url: String::new(),
            ollama_model: String::new(),
        }
    }

    /// Create a Groq cloud client (legacy direct mode — LLM only, embeddings are local)
    pub fn new_groq(groq_api_key: &str) -> Self {
        Self {
            provider: AiProvider::Groq,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            server_url: String::new(),
            device_id: String::new(),
            auth_token: String::new(),
            groq_api_key: groq_api_key.to_string(),
            groq_model: "llama-3.1-8b-instant".to_string(),
            groq_chat_model: "llama-3.3-70b-versatile".to_string(),
            ollama_url: String::new(),
            ollama_model: String::new(),
        }
    }

    /// Create an Ollama local client (fallback — LLM only, embeddings are local via fastembed)
    pub fn new_ollama(base_url: &str, model: &str) -> Self {
        Self {
            provider: AiProvider::Ollama,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_default(),
            server_url: String::new(),
            device_id: String::new(),
            auth_token: String::new(),
            groq_api_key: String::new(),
            groq_model: String::new(),
            groq_chat_model: String::new(),
            ollama_url: base_url.trim_end_matches('/').to_string(),
            ollama_model: model.to_string(),
        }
    }

    pub fn provider(&self) -> &AiProvider {
        &self.provider
    }

    pub fn http_client(&self) -> &reqwest::Client {
        &self.http
    }

    pub fn server_url(&self) -> &str {
        &self.server_url
    }

    /// Build auth headers for server proxy requests (without Content-Type)
    pub fn auth_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-Device-Id", self.device_id.parse().unwrap_or_else(|_| "unknown".parse().unwrap()));
        if !self.auth_token.is_empty() {
            if let Ok(val) = format!("Bearer {}", self.auth_token).parse() {
                headers.insert("Authorization", val);
            }
        }
        headers
    }

    /// Check if the AI provider is reachable
    pub async fn is_available(&self) -> bool {
        match self.provider {
            AiProvider::Server => {
                self.http
                    .get(format!("{}/api/tray/proxy/usage", self.server_url))
                    .header("X-Device-Id", &self.device_id)
                    .timeout(std::time::Duration::from_secs(5))
                    .send()
                    .await
                    .map(|r| r.status().is_success() || r.status().as_u16() == 429)
                    .unwrap_or(false)
            }
            AiProvider::Groq => {
                self.http
                    .get("https://api.groq.com/openai/v1/models")
                    .header("Authorization", format!("Bearer {}", self.groq_api_key))
                    .timeout(std::time::Duration::from_secs(5))
                    .send()
                    .await
                    .is_ok()
            }
            AiProvider::Ollama => {
                self.http
                    .get(&self.ollama_url)
                    .timeout(std::time::Duration::from_secs(3))
                    .send()
                    .await
                    .is_ok()
            }
        }
    }

    /// Build common headers for server proxy requests
    fn server_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-Device-Id", self.device_id.parse().unwrap_or_else(|_| "unknown".parse().unwrap()));
        if !self.auth_token.is_empty() {
            if let Ok(val) = format!("Bearer {}", self.auth_token).parse() {
                headers.insert("Authorization", val);
            }
        }
        headers.insert("Content-Type", "application/json".parse().unwrap());
        headers
    }

    /// Generate JSON (non-streaming) — used by triage, enrich, linking
    pub async fn generate_json(&self, system: &str, prompt: &str) -> Result<String, String> {
        self.generate_json_for(system, prompt, "triage").await
    }

    /// Generate JSON for a specific operation (triage or link) — for proper metering
    pub async fn generate_json_for(&self, system: &str, prompt: &str, operation: &str) -> Result<String, String> {
        match self.provider {
            AiProvider::Server => self.server_json(system, prompt, operation).await,
            AiProvider::Groq => self.groq_chat(system, prompt, true, 0.3, 2048, &self.groq_model).await,
            AiProvider::Ollama => self.ollama_chat(system, prompt, true, 0.3).await,
        }
    }

    /// Generate text (non-streaming) — used by Ask AI (non-stream path)
    pub async fn generate_text(&self, system: &str, prompt: &str) -> Result<String, String> {
        match self.provider {
            AiProvider::Server => {
                // For non-streaming text, use the triage endpoint in non-JSON mode
                // Actually, use chat-stream without streaming by parsing the full response
                let messages = serde_json::json!([
                    { "role": "system", "content": system },
                    { "role": "user", "content": prompt },
                ]);
                let body = serde_json::json!({
                    "messages": messages,
                    "temperature": 0.5,
                    "max_tokens": 512,
                });
                let res = self.http
                    .post(format!("{}/api/tray/proxy/triage", self.server_url))
                    .headers(self.server_headers())
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Server text request failed: {}", e))?;

                let status = res.status();
                if status.as_u16() == 429 {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("429: {}", text));
                }
                if !status.is_success() {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("Server error ({}): {}", status, text));
                }

                let data: GroqChatResponse = res.json().await
                    .map_err(|e| format!("Failed to parse server response: {}", e))?;
                Ok(data.choices.into_iter().next()
                    .and_then(|c| c.message.content)
                    .unwrap_or_default())
            }
            AiProvider::Groq => self.groq_chat(system, prompt, false, 0.5, 512, &self.groq_chat_model).await,
            AiProvider::Ollama => self.ollama_chat(system, prompt, false, 0.5).await,
        }
    }

    /// Generate text stream — returns raw Response for SSE/NDJSON parsing
    pub async fn generate_text_stream(
        &self,
        system: &str,
        prompt: &str,
    ) -> Result<reqwest::Response, String> {
        match self.provider {
            AiProvider::Server => {
                let body = serde_json::json!({
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": prompt },
                    ],
                    "temperature": 0.5,
                    "max_tokens": 512,
                });

                let res = self.http
                    .post(format!("{}/api/tray/proxy/chat-stream", self.server_url))
                    .headers(self.server_headers())
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Server stream request failed: {}", e))?;

                let status = res.status();
                if status.as_u16() == 429 {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("429: {}", text));
                }
                if !status.is_success() {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("Server stream error ({}): {}", status, text));
                }
                Ok(res)
            }
            AiProvider::Groq => {
                let body = serde_json::json!({
                    "model": self.groq_chat_model,
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": prompt },
                    ],
                    "temperature": 0.5,
                    "max_tokens": 512,
                    "stream": true,
                });

                self.http
                    .post("https://api.groq.com/openai/v1/chat/completions")
                    .header("Authorization", format!("Bearer {}", self.groq_api_key))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Groq stream request failed: {}", e))
            }
            AiProvider::Ollama => {
                let body = serde_json::json!({
                    "model": self.ollama_model,
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": prompt },
                    ],
                    "stream": true,
                    "options": { "temperature": 0.5, "num_predict": 512 },
                });

                self.http
                    .post(format!("{}/api/chat", self.ollama_url))
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Ollama stream request failed: {}", e))
            }
        }
    }

    /// Stream a multi-turn chat conversation (includes conversation history)
    pub async fn generate_chat_stream(
        &self,
        messages: &[serde_json::Value],
    ) -> Result<reqwest::Response, String> {
        match self.provider {
            AiProvider::Server => {
                let body = serde_json::json!({
                    "messages": messages,
                    "temperature": 0.5,
                    "max_tokens": 512,
                });

                let res = self.http
                    .post(format!("{}/api/tray/proxy/chat-stream", self.server_url))
                    .headers(self.server_headers())
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Server chat stream request failed: {}", e))?;

                let status = res.status();
                if status.as_u16() == 429 {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("429: {}", text));
                }
                if !status.is_success() {
                    let text = res.text().await.unwrap_or_default();
                    return Err(format!("Server chat stream error ({}): {}", status, text));
                }
                Ok(res)
            }
            AiProvider::Groq => {
                let body = serde_json::json!({
                    "model": self.groq_chat_model,
                    "messages": messages,
                    "temperature": 0.5,
                    "max_tokens": 512,
                    "stream": true,
                });

                self.http
                    .post("https://api.groq.com/openai/v1/chat/completions")
                    .header("Authorization", format!("Bearer {}", self.groq_api_key))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Groq chat stream request failed: {}", e))
            }
            AiProvider::Ollama => {
                let body = serde_json::json!({
                    "model": self.ollama_model,
                    "messages": messages,
                    "stream": true,
                    "options": { "temperature": 0.5, "num_predict": 512 },
                });

                self.http
                    .post(format!("{}/api/chat", self.ollama_url))
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Ollama chat stream request failed: {}", e))
            }
        }
    }

    /// Generate document embedding (for storing records). Uses local fastembed model.
    pub async fn embed(&self, text: &str) -> Result<Vec<f64>, String> {
        embed_document(text).await
    }

    /// Generate query embedding (for searching). Uses local fastembed model.
    pub async fn embed_for_query(&self, text: &str) -> Result<Vec<f64>, String> {
        embed_query(text).await
    }

    pub fn embed_model_name(&self) -> &str {
        "nomic-embed-text-v1.5"
    }

    // ── Internal helpers ────────────────────────────────────────────────

    /// Server proxy JSON generation (for triage/link endpoints)
    async fn server_json(&self, system: &str, prompt: &str, endpoint: &str) -> Result<String, String> {
        let url = format!("{}/api/tray/proxy/{}", self.server_url, endpoint);
        let body = serde_json::json!({
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt },
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        });

        let res = self.http
            .post(&url)
            .headers(self.server_headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Server {} request failed: {}", endpoint, e))?;

        let status = res.status();
        if status.as_u16() == 429 {
            let text = res.text().await.unwrap_or_default();
            return Err(format!("429: {}", text));
        }
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Server {} error ({}): {}", endpoint, status, text));
        }

        let data: GroqChatResponse = res.json().await
            .map_err(|e| format!("Failed to parse server {} response: {}", endpoint, e))?;

        Ok(data.choices.into_iter().next()
            .and_then(|c| c.message.content)
            .unwrap_or_else(|| "{}".to_string()))
    }

    async fn groq_chat(
        &self,
        system: &str,
        prompt: &str,
        json_mode: bool,
        temperature: f64,
        max_tokens: u32,
        model: &str,
    ) -> Result<String, String> {
        let mut body = serde_json::json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt },
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": false,
        });

        if json_mode {
            body.as_object_mut().unwrap().insert(
                "response_format".to_string(),
                serde_json::json!({ "type": "json_object" }),
            );
        }

        let res = self.http
            .post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.groq_api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Groq request failed: {}", e))?;

        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Groq error ({}): {}", status, text));
        }

        let data: GroqChatResponse = res.json().await
            .map_err(|e| format!("Failed to parse Groq response: {}", e))?;

        Ok(data.choices.into_iter().next()
            .and_then(|c| c.message.content)
            .unwrap_or_else(|| "{}".to_string()))
    }

    async fn ollama_chat(
        &self,
        system: &str,
        prompt: &str,
        json_mode: bool,
        temperature: f64,
    ) -> Result<String, String> {
        let mut body = serde_json::json!({
            "model": self.ollama_model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt },
            ],
            "stream": false,
            "options": { "temperature": temperature },
        });

        if json_mode {
            body.as_object_mut().unwrap().insert(
                "format".to_string(),
                serde_json::Value::String("json".to_string()),
            );
        }

        let res = self.http
            .post(format!("{}/api/chat", self.ollama_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Ollama error ({}): {}", status, text));
        }

        let data: OllamaChatResponse = res.json().await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        Ok(data.message
            .and_then(|m| m.content)
            .unwrap_or_else(|| if json_mode { "{}".to_string() } else { String::new() }))
    }

    /// Synthesize an ambient insight from screen context + matched memories.
    /// Returns structured JSON with show/insight/sources, or error.
    pub async fn synthesize_ambient(
        &self,
        screen_text: &str,
        memories: &[(String, String, Option<String>, Option<String>, String)], // (id, title, summary, content, type)
    ) -> Result<AmbientSynthesis, String> {
        let system = r#"You are Reattend, a proactive memory assistant. The user is working on their computer. You can see what's on their screen and you have access to their past memories that are semantically relevant.

Your job: synthesize a SHORT, actionable insight that connects what the user is currently doing with what they already know. Think of yourself as a brilliant executive assistant who whispers exactly the right reminder at the right moment.

Respond ONLY with valid JSON:
{
  "show": true/false,
  "insight": "Your synthesized insight here (2-4 sentences max)",
  "sources": [{"id": "...", "title": "...", "type": "..."}]
}

Rules:
- Set "show": false if the memories are not meaningfully relevant to the current screen content. Don't force connections.
- Set "show": false if the insight would be obvious or trivial (e.g. "you were on Gmail before" — no value).
- When "show": true, write the insight in second person ("You discussed...", "Last time you...").
- Be specific — mention names, dates, decisions, numbers from the memories.
- Focus on what's ACTIONABLE: pending tasks, past decisions that affect current work, people involved, unresolved items.
- Keep it to 2-4 sentences. Concise and punchy.
- sources should list only the memories you actually reference in the insight."#;

        let mut memories_text = String::new();
        for (id, title, summary, content, record_type) in memories {
            memories_text.push_str(&format!("\n--- Memory (id={}, type={}) ---\nTitle: {}\n", id, record_type, title));
            if let Some(s) = summary {
                memories_text.push_str(&format!("Summary: {}\n", s));
            }
            if let Some(c) = content {
                let truncated = if c.len() > 500 { &c[..500] } else { c.as_str() };
                memories_text.push_str(&format!("Content: {}\n", truncated));
            }
        }

        let screen_truncated = if screen_text.len() > 800 { &screen_text[..800] } else { screen_text };
        let prompt = format!(
            "CURRENT SCREEN CONTENT:\n{}\n\nRELATED MEMORIES FROM USER'S HISTORY:\n{}\n\nSynthesize an insight connecting the screen to the memories. Respond with JSON only.",
            screen_truncated, memories_text
        );

        let raw = self.generate_json_for(system, &prompt, "triage").await?;
        let parsed: AmbientSynthesis = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse ambient synthesis: {} — raw: {}", e, &raw[..200.min(raw.len())]))?;
        Ok(parsed)
    }
    /// Writing assist: check if what the user is writing conflicts with or relates to their memories
    pub async fn synthesize_writing_assist(
        &self,
        written_text: &str,
        memories: &[(String, String, Option<String>, Option<String>, String)],
    ) -> Result<AmbientSynthesis, String> {
        let system = r#"You are Reattend, a fact-checking and memory-aware writing assistant. The user is actively typing in an application. You have their related memories from their personal knowledge graph.

Your job: analyze their text for TWO things ONLY (do NOT check grammar or spelling — other tools handle that):
1. **Factual errors** — incorrect facts, wrong data/figures, misattributed quotes, reversed claims (e.g. "the capital of Delhi is India" is backwards). Use your general knowledge.
2. **Memory contradictions** — does their writing contradict past decisions, commitments, or facts stored in their Reattend memories?

Respond ONLY with valid JSON:
{
  "show": true/false,
  "category": "fact" | "contradiction",
  "insight": "Your main feedback (1-3 sentences, be specific and helpful)",
  "corrections": [
    {
      "original": "the exact wrong text",
      "suggested": "the corrected text",
      "reason": "brief explanation",
      "type": "fact" | "contradiction"
    }
  ],
  "sources": [{"id": "...", "title": "...", "type": "..."}]
}

Rules:
- IGNORE grammar, spelling, typos, and phrasing. Those are handled by other tools. Do not flag them.
- Set "show": true ONLY if you find factual errors or memory contradictions.
- "category" = the most important issue type.
- "corrections" array: list each specific fix. Max 3 most important.
- For factual errors: be confident. Only flag things that are clearly, objectively wrong. Not opinions.
- For contradictions: reference the specific memory ("In your Feb 3 meeting, you agreed to X, but you're writing Y").
- Set "show": false if all facts are correct and nothing contradicts their memories.
- Be concise. Use second person."#;

        let mut memories_text = String::new();
        for (id, title, summary, content, record_type) in memories {
            memories_text.push_str(&format!("\n--- Memory (id={}, type={}) ---\nTitle: {}\n", id, record_type, title));
            if let Some(s) = summary { memories_text.push_str(&format!("Summary: {}\n", s)); }
            if let Some(c) = content {
                let truncated = if c.len() > 500 { &c[..500] } else { c.as_str() };
                memories_text.push_str(&format!("Content: {}\n", truncated));
            }
        }

        let text_truncated = if written_text.len() > 800 { &written_text[..800] } else { written_text };
        let prompt = format!(
            "TEXT THE USER IS CURRENTLY WRITING:\n{}\n\nRELATED MEMORIES:\n{}\n\nCheck for factual errors and contradictions with memories ONLY. Ignore grammar/spelling. Respond with JSON only.",
            text_truncated, memories_text
        );

        let raw = self.generate_json_for(system, &prompt, "triage").await?;
        let parsed: AmbientSynthesis = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse writing assist: {} — raw: {}", e, &raw[..200.min(raw.len())]))?;
        Ok(parsed)
    }
}

// ── Triage Agent ────────────────────────────────────────────────────────

pub async fn run_triage(
    client: &AiClient,
    text: &str,
    metadata: Option<&str>,
) -> Result<TriageResult, String> {
    let system = "You are a helpful assistant. Respond ONLY with valid JSON matching the requested schema. No markdown, no code fences, no explanation, just raw JSON.";
    let prompt = build_triage_prompt(text, metadata);

    let raw_json = client.generate_json(system, &prompt).await?;
    let parsed: serde_json::Value = serde_json::from_str(&raw_json)
        .map_err(|e| format!("Invalid JSON from triage: {} — raw: {}", e, &raw_json[..200.min(raw_json.len())]))?;

    let normalized = normalize_triage_output(parsed);

    serde_json::from_value(normalized.clone())
        .map_err(|e| format!("Failed to deserialize triage result: {} — json: {}", e, normalized))
}

// ── Embedding Job ───────────────────────────────────────────────────────

pub async fn run_embedding(
    client: &AiClient,
    title: &str,
    summary: &str,
    content: &str,
) -> Result<Vec<f64>, String> {
    let text_to_embed = format!("{}. {}. {}", title, summary, content);
    client.embed(&text_to_embed).await
}

// ── Linking Agent ───────────────────────────────────────────────────────

pub async fn run_linking(
    client: &AiClient,
    record_title: &str,
    record_summary: &str,
    candidates: &[(String, String, String)], // (id, title, summary)
) -> Result<LinkingResult, String> {
    if candidates.is_empty() {
        return Ok(LinkingResult { links: vec![] });
    }

    let system = "You are a helpful assistant. Respond ONLY with valid JSON. No markdown, no code fences.";
    let prompt = build_linking_prompt(record_title, record_summary, candidates);

    let raw_json = client.generate_json_for(system, &prompt, "link").await?;
    let parsed: serde_json::Value = serde_json::from_str(&raw_json)
        .map_err(|e| format!("Invalid JSON from linking: {}", e))?;

    // Try to parse, fallback to empty
    match serde_json::from_value::<LinkingResult>(parsed) {
        Ok(result) => Ok(result),
        Err(_) => Ok(LinkingResult { links: vec![] }),
    }
}

// ── Ask Agent (Q&A over memories) ───────────────────────────────────────

pub async fn run_ask(
    client: &AiClient,
    question: &str,
    context_records: &[(String, String, String, String)], // (title, summary, content, type)
) -> Result<String, String> {
    let system = "You are a concise memory assistant for the Reattend memory system. Be concise and specific.";
    let prompt = build_ask_prompt(question, context_records);
    client.generate_text(system, &prompt).await
}

// ── Cosine similarity ───────────────────────────────────────────────────

pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let mag_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}

// ── Normalize triage output (port from llm.ts) ─────────────────────────

fn normalize_triage_output(mut raw: serde_json::Value) -> serde_json::Value {
    let obj = match raw.as_object_mut() {
        Some(o) => o,
        None => return raw,
    };

    // Ensure should_store is boolean
    if !obj.contains_key("should_store") {
        obj.insert("should_store".into(), serde_json::Value::Bool(false));
    }

    // Fix entities: handle {"people": [...], "organizations": [...]} format
    if let Some(entities_val) = obj.get("entities") {
        if entities_val.is_object() {
            let kind_map = [
                ("people", "person"), ("persons", "person"), ("person", "person"),
                ("organizations", "org"), ("organisation", "org"), ("orgs", "org"), ("org", "org"),
                ("topics", "topic"), ("topic", "topic"),
                ("products", "product"), ("product", "product"),
                ("projects", "project"), ("project", "project"),
            ];
            let mut new_entities = Vec::new();
            if let Some(entities_obj) = entities_val.as_object() {
                for (key, values) in entities_obj {
                    let kind = kind_map.iter()
                        .find(|(k, _)| k.eq_ignore_ascii_case(key))
                        .map(|(_, v)| *v)
                        .unwrap_or("topic");
                    if let Some(arr) = values.as_array() {
                        for v in arr {
                            if let Some(s) = v.as_str() {
                                new_entities.push(serde_json::json!({ "kind": kind, "name": s }));
                            } else if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                                let k = v.get("kind").and_then(|k| k.as_str()).unwrap_or(kind);
                                new_entities.push(serde_json::json!({ "kind": k, "name": name }));
                            }
                        }
                    }
                }
            }
            obj.insert("entities".into(), serde_json::Value::Array(new_entities));
        } else if entities_val.is_array() {
            let valid_kinds = ["person", "org", "topic", "product", "project", "custom"];
            let fixed: Vec<serde_json::Value> = entities_val.as_array().unwrap().iter().filter_map(|e| {
                if let Some(s) = e.as_str() {
                    Some(serde_json::json!({ "kind": "topic", "name": s }))
                } else if let Some(name) = e.get("name").and_then(|n| n.as_str()) {
                    let kind = e.get("kind").and_then(|k| k.as_str()).unwrap_or("topic");
                    let kind = if valid_kinds.contains(&kind) { kind } else { "topic" };
                    Some(serde_json::json!({ "kind": kind, "name": name }))
                } else {
                    None
                }
            }).collect();
            obj.insert("entities".into(), serde_json::Value::Array(fixed));
        }
    }
    if !obj.contains_key("entities") {
        obj.insert("entities".into(), serde_json::json!([]));
    }

    // Fix record_type: normalize to valid enum values
    if let Some(rt) = obj.get("record_type").and_then(|v| v.as_str()) {
        let lowered = rt.to_lowercase();
        let normalized = match lowered.as_str() {
            "meeting summary" | "meeting_summary" => "meeting",
            "audio transcript" | "audio_transcript" | "voice note" => "transcript",
            "task" | "todo" | "action item" | "action_item" => "tasklike",
            "information" | "info" | "background" => "context",
            "observation" | "learning" | "finding" => "insight",
            other => {
                let valid = ["decision", "insight", "meeting", "transcript", "idea", "context", "tasklike", "note"];
                if valid.contains(&other) { other } else { "note" }
            }
        };
        obj.insert("record_type".into(), serde_json::Value::String(normalized.to_string()));
    }
    if !obj.get("record_type").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("record_type".into(), serde_json::Value::String("note".into()));
    }

    // Ensure tags is array of strings
    if !obj.get("tags").map(|v| v.is_array()).unwrap_or(false) {
        obj.insert("tags".into(), serde_json::json!([]));
    }

    // Ensure confidence is a number
    if !obj.get("confidence").map(|v| v.is_number()).unwrap_or(false) {
        obj.insert("confidence".into(), serde_json::json!(0.7));
    }

    // Ensure title and summary exist (handle null values too)
    if !obj.get("title").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("title".into(), serde_json::Value::String("Untitled".into()));
    }
    if !obj.get("summary").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("summary".into(), serde_json::Value::String("".into()));
    }
    if !obj.get("why_kept_or_dropped").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("why_kept_or_dropped".into(), serde_json::Value::String("".into()));
    }

    // Ensure due_date is string or null
    if let Some(dd) = obj.get("due_date") {
        if !dd.is_string() && !dd.is_null() {
            obj.insert("due_date".into(), serde_json::Value::Null);
        }
    }

    raw
}

// ── Prompt builders (ported from prompts.ts) ────────────────────────────

fn build_triage_prompt(text: &str, metadata: Option<&str>) -> String {
    // Extract capture context from metadata
    let (capture_type, app_name) = if let Some(meta) = metadata {
        let meta_val: serde_json::Value = serde_json::from_str(meta).unwrap_or_default();
        (
            meta_val["capture_type"].as_str().unwrap_or("unknown").to_string(),
            meta_val["app_name"].as_str().unwrap_or("Unknown").to_string(),
        )
    } else {
        ("unknown".to_string(), "Unknown".to_string())
    };

    let context_hint = match capture_type.as_str() {
        "meeting" => "CONTEXT: This is a TRANSCRIPT from a recorded meeting (mic audio → speech-to-text). ALWAYS KEEP. Use record_type \"transcript\". Extract decisions, action items, key discussion points, and participants. You MUST populate \"action_items\" (tasks/follow-ups), \"decisions\" (choices made), and \"key_points\" (important discussion topics) arrays.\n".to_string(),
        "writing" => format!(
            "CONTEXT: This is the user's OWN WRITING in {}. User-authored content is HIGH VALUE. KEEP unless it's just a few words or a URL.\n",
            app_name
        ),
        "clipboard" => format!(
            "CONTEXT: Text copied to clipboard from {}. Copied text is usually intentional and valuable.\n",
            app_name
        ),
        "screen" => {
            let app_hint = match app_name.to_lowercase().as_str() {
                s if s.contains("chrome") || s.contains("safari") || s.contains("firefox") || s.contains("arc") || s.contains("edge") || s.contains("brave") =>
                    "This is from a web browser. Look for: articles, documentation, research content, email (Gmail/Outlook web), chat (Slack web), or meeting content. DROP if it's just a homepage, search results list, social media feed, or shopping page.",
                s if s.contains("slack") || s.contains("discord") || s.contains("teams") =>
                    "This is from a messaging/collaboration app. KEEP messages about decisions, action items, deadlines, project updates, or important discussions. DROP casual chat, emoji reactions, or status updates.",
                s if s.contains("mail") || s.contains("outlook") || s.contains("thunderbird") =>
                    "This is from an email client. KEEP emails with action items, decisions, meeting invites, project updates. DROP newsletters, promotions, automated notifications.",
                s if s.contains("zoom") || s.contains("meet") || s.contains("webex") =>
                    "This is from a video meeting app. KEEP any visible chat messages, shared notes, participant names, meeting topics. This is high-value meeting context.",
                s if s.contains("notion") || s.contains("confluence") || s.contains("docs") || s.contains("pages") =>
                    "This is from a document/wiki app. KEEP document content — it's usually high value knowledge.",
                s if s.contains("figma") || s.contains("miro") =>
                    "This is from a design/whiteboard tool. KEEP any text, comments, or annotations. DROP if it's purely visual with no text content.",
                s if s.contains("calendar") =>
                    "This is from a calendar app. KEEP meeting details, attendees, agendas, and scheduling information.",
                s if s.contains("jira") || s.contains("linear") || s.contains("asana") || s.contains("trello") =>
                    "This is from a project management tool. KEEP task details, status updates, assignments, and sprint information.",
                _ => "This is from the user's screen. Focus on substantive content.",
            };
            format!("CONTEXT: Screen capture from {}. {}\n", app_name, app_hint)
        }
        _ => String::new(),
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    format!(r#"You are a memory triage agent for a "Passive Second Brain." You decide what's worth remembering from the user's screen.

Today's date is {today}.

{context_hint}
KEEP as a memory if it contains ANY of these:
- A DECISION someone made or a choice being discussed
- An ACTION ITEM, task, or assignment
- MEETING NOTES, agendas, or discussion outcomes
- KEY FACTS about people, projects, or relationships
- A meaningful INSIGHT, idea, or learning
- DATES with context (deadlines, launches, follow-ups)
- PROJECT STATUS updates or milestones
- PERSONAL WRITING — emails, messages, documents the user is composing
- KNOWLEDGE — documentation, wiki content, research the user is reading
- CONVERSATIONS — important Slack/Teams/email exchanges

DROP if:
- Fragmented UI text with no coherent meaning (button labels, menu items)
- Login/auth screens, error pages, loading states, or cookie banners
- Navigation breadcrumbs, sidebars, or settings panels without context
- Shopping pages, ads, or social media feed items
- Repetitive log output or data tables without context
- Generic app homepages or dashboards with only navigation

When in doubt, KEEP. It's better to remember too much than miss something important.

INPUT:
Source app: {app_name}
Text: {text}

Respond with this EXACT JSON structure:
{{
  "should_store": true,
  "record_type": "meeting",
  "title": "Short descriptive title",
  "summary": "2-3 sentence summary of key information",
  "tags": ["tag1", "tag2"],
  "entities": [
    {{"kind": "person", "name": "John Smith"}},
    {{"kind": "topic", "name": "Q2 campaigns"}}
  ],
  "confidence": 0.85,
  "why_kept_or_dropped": "Brief reason",
  "due_date": "2026-04-05",
  "action_items": ["Follow up with John on proposal", "Send Q2 report by Friday"],
  "decisions": ["Approved new budget allocation"],
  "key_points": ["Discussed Q2 campaign strategy", "New hire starting next week"]
}}

RULES:
- "record_type" must be one of: "decision", "insight", "meeting", "transcript", "idea", "context", "tasklike", "note"
- "entities" must be array of objects with "kind" (person/org/topic/product/project) and "name"
- "confidence" must be 0.0-1.0 (higher = more certain this is worth keeping)
- Extract every person, organization, and topic you can find
- "due_date": Extract specific dates as YYYY-MM-DD. For relative dates ("tomorrow", "next Monday"), resolve using today ({today}). Use null if none.
- "title": Write a specific, informative title — not generic like "Screen capture" or "Browser content"
- "action_items": Array of action items/tasks/follow-ups extracted from the content. Empty array if none.
- "decisions": Array of decisions made. Empty array if none.
- "key_points": Array of key discussion points or important facts. Empty array if none.

Respond with JSON only:"#,
        today = today,
        context_hint = context_hint,
        app_name = app_name,
        text = text,
    )
}

fn build_linking_prompt(
    title: &str,
    summary: &str,
    candidates: &[(String, String, String)],
) -> String {
    let candidates_str: String = candidates.iter().enumerate()
        .map(|(i, (id, t, s))| format!("{}. [{}] {}: {}", i + 1, id, t, s))
        .collect::<Vec<_>>()
        .join("\n");

    format!(r#"You are a memory linking agent. Given a source record and candidates, determine which are related.

SOURCE RECORD:
Title: {title}
Summary: {summary}

CANDIDATES:
{candidates_str}

Only create meaningful links. Max 8 links.

Link kinds (use exactly these values):
- same_topic
- depends_on
- contradicts
- continuation_of
- same_people
- causes
- temporal

Respond with JSON only. If no candidates are related, return {{"links": []}}:
{{
  "links": [
    {{"target_id": "abc-123", "kind": "same_topic", "weight": 0.85, "explanation": "Both discuss same topic"}}
  ]
}}"#)
}

pub fn build_ask_prompt_public(
    question: &str,
    context_records: &[(String, String, String, String)],
) -> String {
    build_ask_prompt(question, context_records)
}

fn build_ask_prompt(
    question: &str,
    context_records: &[(String, String, String, String)],
) -> String {
    let memories_str: String = context_records.iter().enumerate()
        .map(|(i, (title, summary, content, rtype))| {
            let content_str = if content.is_empty() { String::new() } else { format!(" | {}", content) };
            format!("[{}] ({}) {}: {}{}", i + 1, rtype, title, summary, content_str)
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(r#"You are a concise memory assistant. Answer the question using ONLY the memories below. Be brief and direct — 2-4 sentences max. If no memories are relevant, say "I don't have that in your memories yet."

Question: {question}

Memories:
{memories_str}

Answer briefly:"#)
}
