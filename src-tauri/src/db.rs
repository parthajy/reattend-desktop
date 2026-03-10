use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Thread-safe database wrapper
pub struct Database {
    conn: Mutex<Connection>,
}

// ── Data types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Record {
    pub id: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub title: String,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub confidence: Option<f64>,
    pub tags: Option<String>,       // JSON array
    pub source: Option<String>,
    pub meta: Option<String>,       // JSON
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entity {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub normalized: String,
    pub mention_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordLink {
    pub id: String,
    pub from_record_id: String,
    pub to_record_id: String,
    pub kind: String,
    pub weight: Option<f64>,
    pub explanation: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RawItem {
    pub id: String,
    pub content: String,
    pub content_type: Option<String>,
    pub source_type: String,
    pub metadata: Option<String>,   // JSON
    pub status: String,
    pub triage_result: Option<String>, // JSON
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatThread {
    pub id: String,
    pub title: String,
    pub context: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub metadata: Option<String>,   // JSON
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BoardData {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub state: Option<String>,      // JSON blob
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BoardNode {
    pub id: String,
    pub board_id: String,
    pub node_type: String,
    pub record_id: Option<String>,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub color: Option<String>,
    pub data: Option<String>,       // JSON
    pub style: Option<String>,      // JSON
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BoardEdge {
    pub id: String,
    pub board_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: String,
    pub label: Option<String>,
    pub style: Option<String>,      // JSON
    pub data: Option<String>,       // JSON
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobQueueItem {
    pub id: String,
    pub job_type: String,
    pub payload: String,            // JSON
    pub status: String,
    pub attempts: i64,
    pub max_attempts: i64,
    pub last_error: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Embedding {
    pub record_id: String,
    pub vector: String,             // JSON array of floats
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeCount {
    pub record_type: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TodayBriefing {
    pub decisions: Vec<Record>,
    pub tasks: Vec<Record>,
    pub transcripts: Vec<Record>,
    pub meetings: Vec<Record>,
    pub insights: Vec<Record>,
    pub other: Vec<Record>,
    pub pending_notifications: i64,
    pub total_recent: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_records: i64,
    pub total_decisions: i64,
    pub total_meetings: i64,
    pub total_insights: i64,
    pub total_ideas: i64,
    pub total_entities: i64,
    pub total_links: i64,
    pub records_today: i64,
    pub records_this_week: i64,
    pub daily_activity: Vec<DailyActivity>,
    pub type_counts: Vec<TypeCount>,
    pub top_tags: Vec<TagCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub is_default: bool,
    pub record_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: String,
    #[serde(rename = "type")]
    pub notif_type: String,
    pub title: String,
    pub body: Option<String>,
    pub object_type: Option<String>,
    pub object_id: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RawItemsCount {
    pub total: i64,
    pub pending: i64,
    pub triaged: i64,
    pub ignored: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub record_type: String,
    pub title: String,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: String,
    pub weight: Option<f64>,
    pub explanation: Option<String>,
}

// ── Database implementation ───────────────────────────────────────────────

impl Database {
    /// Open (or create) the local database at ~/.reattend/reattend.db
    pub fn open() -> SqlResult<Self> {
        let db_path = Self::db_path();

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn db_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".reattend")
            .join("reattend.db")
    }

    fn run_migrations(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );"
        )?;

        let current_version: i64 = conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM _migrations", [], |r| r.get(0))
            .unwrap_or(0);

        if current_version < 1 {
            conn.execute_batch(MIGRATION_V1)?;
            conn.execute("INSERT INTO _migrations (version) VALUES (1)", [])?;
        }

        if current_version < 2 {
            conn.execute_batch(MIGRATION_V2)?;
            conn.execute("INSERT INTO _migrations (version) VALUES (2)", [])?;
        }

        Ok(())
    }

    // ── Config ────────────────────────────────────────────────────────────

    pub fn get_config(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).ok()
    }

    pub fn set_config(&self, key: &str, value: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO app_config (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    // ── Raw Items ─────────────────────────────────────────────────────────

    pub fn insert_raw_item(
        &self,
        content: &str,
        source_type: &str,
        content_type: Option<&str>,
        metadata: Option<&str>,
    ) -> SqlResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO raw_items (id, content, content_type, source_type, metadata, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
            params![id, content, content_type, source_type, metadata, now],
        )?;
        Ok(id)
    }

    pub fn get_pending_raw_items(&self, limit: i64) -> SqlResult<Vec<RawItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content, content_type, source_type, metadata, status, triage_result, created_at
             FROM raw_items WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?1"
        )?;
        let items = stmt.query_map(params![limit], |row| {
            Ok(RawItem {
                id: row.get(0)?,
                content: row.get(1)?,
                content_type: row.get(2)?,
                source_type: row.get(3)?,
                metadata: row.get(4)?,
                status: row.get(5)?,
                triage_result: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?.collect::<SqlResult<Vec<_>>>()?;
        Ok(items)
    }

    pub fn get_raw_item_by_id(&self, id: &str) -> SqlResult<RawItem> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, content, content_type, source_type, metadata, status, triage_result, created_at
             FROM raw_items WHERE id = ?1",
            params![id],
            |row| {
                Ok(RawItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    source_type: row.get(3)?,
                    metadata: row.get(4)?,
                    status: row.get(5)?,
                    triage_result: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
    }

    pub fn update_raw_item_status(&self, id: &str, status: &str, triage_result: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE raw_items SET status = ?1, triage_result = ?2 WHERE id = ?3",
            params![status, triage_result, id],
        )?;
        Ok(())
    }

    pub fn update_raw_item_content(&self, id: &str, content: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE raw_items SET content = ?1 WHERE id = ?2",
            params![content, id],
        )?;
        Ok(())
    }

    // ── Records ───────────────────────────────────────────────────────────

    pub fn insert_record(
        &self,
        record_type: &str,
        title: &str,
        summary: Option<&str>,
        content: Option<&str>,
        confidence: Option<f64>,
        tags: Option<&str>,
        source: Option<&str>,
        meta: Option<&str>,
        raw_item_id: Option<&str>,
    ) -> SqlResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO records (id, type, title, summary, content, confidence, tags, source, meta, raw_item_id, created_by, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'agent', ?11, ?11)",
            params![id, record_type, title, summary, content, confidence, tags, source, meta, raw_item_id, now],
        )?;
        Ok(id)
    }

    pub fn get_records(&self, limit: i64, offset: i64, type_filter: Option<&str>) -> SqlResult<Vec<Record>> {
        let conn = self.conn.lock().unwrap();
        if let Some(t) = type_filter {
            let mut stmt = conn.prepare(
                "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
                 FROM records WHERE type = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
            )?;
            let rows = stmt.query_map(params![t, limit, offset], Self::map_record)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
                 FROM records ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
            )?;
            let rows = stmt.query_map(params![limit, offset], Self::map_record)?;
            rows.collect()
        }
    }

    pub fn get_record(&self, id: &str) -> SqlResult<Record> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
             FROM records WHERE id = ?1",
            params![id],
            Self::map_record,
        )
    }

    pub fn update_record(&self, id: &str, title: Option<&str>, summary: Option<&str>, content: Option<&str>, tags: Option<&str>) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE records SET
                title = COALESCE(?1, title),
                summary = COALESCE(?2, summary),
                content = COALESCE(?3, content),
                tags = COALESCE(?4, tags),
                updated_at = ?5
             WHERE id = ?6",
            params![title, summary, content, tags, now, id],
        )?;
        Ok(())
    }

    /// AI enrichment update — fills in gaps without overwriting user data
    pub fn update_record_enrichment(
        &self,
        id: &str,
        tags: Option<&str>,
        summary: Option<&str>,
        confidence: Option<f64>,
        record_type: Option<&str>,
    ) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE records SET
                tags = COALESCE(?1, tags),
                summary = COALESCE(?2, summary),
                confidence = COALESCE(?3, confidence),
                type = COALESCE(?4, type),
                updated_at = ?5
             WHERE id = ?6",
            params![tags, summary, confidence, record_type, now, id],
        )?;
        Ok(())
    }

    /// Check for a recent duplicate record by normalized title similarity.
    /// Returns the existing record ID if a near-duplicate was created in the last 24 hours.
    pub fn find_duplicate_record(&self, title: &str, record_type: &str) -> SqlResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        // Normalize: lowercase, strip extra whitespace and punctuation
        let normalized = title.to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        if normalized.len() < 5 {
            return Ok(None); // Title too short to dedup reliably
        }

        // Search for records with same type created in last 24h
        let mut stmt = conn.prepare(
            "SELECT id, title FROM records
             WHERE type = ?1
             AND created_at > datetime('now', '-24 hours')
             ORDER BY created_at DESC
             LIMIT 50"
        )?;
        let rows: Vec<(String, String)> = stmt.query_map(params![record_type], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?.filter_map(|r| r.ok()).collect();

        for (id, existing_title) in rows {
            let existing_norm = existing_title.to_lowercase()
                .chars()
                .filter(|c| c.is_alphanumeric() || c.is_whitespace())
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");

            // Exact normalized match
            if existing_norm == normalized {
                return Ok(Some(id));
            }

            // One title contains the other (handles slight variations)
            if normalized.len() >= 10 && existing_norm.len() >= 10 {
                if normalized.contains(&existing_norm) || existing_norm.contains(&normalized) {
                    return Ok(Some(id));
                }
            }
        }

        Ok(None)
    }

    /// Append content to an existing record (for merging duplicates)
    pub fn append_record_content(&self, id: &str, new_content: &str) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE records SET
                content = COALESCE(content, '') || char(10) || '---' || char(10) || ?1,
                updated_at = ?2
             WHERE id = ?3",
            params![new_content, now, id],
        )?;
        Ok(())
    }

    pub fn delete_record(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM records WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn search_records(&self, query: &str, limit: i64) -> SqlResult<Vec<Record>> {
        let conn = self.conn.lock().unwrap();

        // Extract meaningful keywords (skip short words and common stop words)
        let stop_words = ["do", "we", "have", "any", "anything", "about", "the", "a", "an",
            "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "with",
            "and", "or", "not", "this", "that", "what", "how", "can", "does", "did",
            "there", "here", "from", "by", "it", "my", "our", "me", "you", "i"];
        let keywords: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.len() >= 3 && !stop_words.contains(&w.to_lowercase().as_str()))
            .map(|w| format!("%{}%", w))
            .collect();

        if keywords.is_empty() {
            // Fall back to full query if no keywords extracted
            let like_query = format!("%{}%", query);
            let mut stmt = conn.prepare(
                "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
                 FROM records
                 WHERE title LIKE ?1 OR summary LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
                 ORDER BY created_at DESC LIMIT ?2"
            )?;
            let rows = stmt.query_map(params![like_query, limit], Self::map_record)?;
            return rows.collect();
        }

        // Build dynamic WHERE clause: each keyword matches title/summary/content/tags
        let conditions: Vec<String> = keywords.iter().enumerate()
            .map(|(i, _)| {
                let p = i + 1;
                format!("(title LIKE ?{p} OR summary LIKE ?{p} OR content LIKE ?{p} OR tags LIKE ?{p})")
            })
            .collect();
        let where_clause = conditions.join(" OR ");
        let sql = format!(
            "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
             FROM records
             WHERE {}
             ORDER BY created_at DESC LIMIT ?{}",
            where_clause,
            keywords.len() + 1
        );

        let mut stmt = conn.prepare(&sql)?;
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = keywords.iter()
            .map(|k| Box::new(k.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        params_vec.push(Box::new(limit));
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())), Self::map_record)?;
        rows.collect()
    }

    fn map_record(row: &rusqlite::Row) -> SqlResult<Record> {
        Ok(Record {
            id: row.get(0)?,
            record_type: row.get(1)?,
            title: row.get(2)?,
            summary: row.get(3)?,
            content: row.get(4)?,
            confidence: row.get(5)?,
            tags: row.get(6)?,
            source: row.get(7)?,
            meta: row.get(8)?,
            created_by: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    // ── Entities ──────────────────────────────────────────────────────────

    pub fn upsert_entity(&self, kind: &str, name: &str) -> SqlResult<String> {
        let normalized = name.to_lowercase().trim().to_string();
        let conn = self.conn.lock().unwrap();

        // Try to find existing
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM entities WHERE normalized = ?1",
            params![normalized],
            |row| row.get(0),
        ).ok();

        if let Some(id) = existing {
            conn.execute(
                "UPDATE entities SET mention_count = mention_count + 1 WHERE id = ?1",
                params![id],
            )?;
            Ok(id)
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO entities (id, kind, name, normalized, mention_count, created_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                params![id, kind, name, normalized, now],
            )?;
            Ok(id)
        }
    }

    pub fn link_record_entity(&self, record_id: &str, entity_id: &str) -> SqlResult<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO record_entities (id, record_id, entity_id) VALUES (?1, ?2, ?3)",
            params![id, record_id, entity_id],
        )?;
        Ok(())
    }

    pub fn get_record_entities(&self, record_id: &str) -> SqlResult<Vec<Entity>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT e.id, e.kind, e.name, e.normalized, e.mention_count, e.created_at
             FROM entities e
             JOIN record_entities re ON re.entity_id = e.id
             WHERE re.record_id = ?1"
        )?;
        let rows = stmt.query_map(params![record_id], |row| {
            Ok(Entity {
                id: row.get(0)?,
                kind: row.get(1)?,
                name: row.get(2)?,
                normalized: row.get(3)?,
                mention_count: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_entities(&self, limit: i64) -> SqlResult<Vec<Entity>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, kind, name, normalized, mention_count, created_at
             FROM entities ORDER BY mention_count DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(Entity {
                id: row.get(0)?,
                kind: row.get(1)?,
                name: row.get(2)?,
                normalized: row.get(3)?,
                mention_count: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    // ── Record Links ──────────────────────────────────────────────────────

    pub fn insert_record_link(
        &self,
        from_id: &str,
        to_id: &str,
        kind: &str,
        weight: Option<f64>,
        explanation: Option<&str>,
    ) -> SqlResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO record_links (id, from_record_id, to_record_id, kind, weight, explanation, created_by, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'agent', ?7)",
            params![id, from_id, to_id, kind, weight, explanation, now],
        )?;
        Ok(id)
    }

    pub fn get_record_links(&self, record_id: &str) -> SqlResult<Vec<(RecordLink, Record)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT rl.id, rl.from_record_id, rl.to_record_id, rl.kind, rl.weight, rl.explanation, rl.created_at,
                    r.id, r.type, r.title, r.summary, r.content, r.confidence, r.tags, r.source, r.meta, r.created_by, r.created_at, r.updated_at
             FROM record_links rl
             JOIN records r ON (r.id = CASE WHEN rl.from_record_id = ?1 THEN rl.to_record_id ELSE rl.from_record_id END)
             WHERE rl.from_record_id = ?1 OR rl.to_record_id = ?1"
        )?;
        let rows = stmt.query_map(params![record_id], |row| {
            Ok((
                RecordLink {
                    id: row.get(0)?,
                    from_record_id: row.get(1)?,
                    to_record_id: row.get(2)?,
                    kind: row.get(3)?,
                    weight: row.get(4)?,
                    explanation: row.get(5)?,
                    created_at: row.get(6)?,
                },
                Record {
                    id: row.get(7)?,
                    record_type: row.get(8)?,
                    title: row.get(9)?,
                    summary: row.get(10)?,
                    content: row.get(11)?,
                    confidence: row.get(12)?,
                    tags: row.get(13)?,
                    source: row.get(14)?,
                    meta: row.get(15)?,
                    created_by: row.get(16)?,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                },
            ))
        })?;
        rows.collect()
    }

    // ── Embeddings ────────────────────────────────────────────────────────

    pub fn insert_embedding(&self, record_id: &str, vector: &str, model: &str) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO embeddings (record_id, vector, model, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![record_id, vector, model, now],
        )?;
        Ok(())
    }

    pub fn get_all_embeddings(&self) -> SqlResult<Vec<(String, Vec<f64>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT record_id, vector FROM embeddings")?;
        let rows = stmt.query_map([], |row| {
            let record_id: String = row.get(0)?;
            let vector_json: String = row.get(1)?;
            let vector: Vec<f64> = serde_json::from_str(&vector_json).unwrap_or_default();
            Ok((record_id, vector))
        })?;
        rows.collect()
    }

    // ── Graph ─────────────────────────────────────────────────────────────

    pub fn get_graph_data(&self) -> SqlResult<(Vec<GraphNode>, Vec<GraphEdge>)> {
        let conn = self.conn.lock().unwrap();

        let mut node_stmt = conn.prepare(
            "SELECT id, type, title, summary, tags, created_at FROM records ORDER BY created_at DESC LIMIT 200"
        )?;
        let nodes = node_stmt.query_map([], |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                record_type: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
                tags: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?.collect::<SqlResult<Vec<_>>>()?;

        let mut edge_stmt = conn.prepare(
            "SELECT id, from_record_id, to_record_id, kind, weight, explanation FROM record_links"
        )?;
        let edges = edge_stmt.query_map([], |row| {
            Ok(GraphEdge {
                id: row.get(0)?,
                source: row.get(1)?,
                target: row.get(2)?,
                kind: row.get(3)?,
                weight: row.get(4)?,
                explanation: row.get(5)?,
            })
        })?.collect::<SqlResult<Vec<_>>>()?;

        Ok((nodes, edges))
    }

    // ── Board ─────────────────────────────────────────────────────────────

    pub fn get_or_create_default_board(&self) -> SqlResult<BoardData> {
        let conn = self.conn.lock().unwrap();
        let existing = conn.query_row(
            "SELECT id, name, description, state, created_at, updated_at FROM boards WHERE is_default = 1",
            [],
            |row| Ok(BoardData {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                state: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            }),
        );

        match existing {
            Ok(board) => Ok(board),
            Err(_) => {
                let id = uuid::Uuid::new_v4().to_string();
                let now = chrono::Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT INTO boards (id, name, is_default, created_at, updated_at)
                     VALUES (?1, 'My Board', 1, ?2, ?2)",
                    params![id, now],
                )?;
                Ok(BoardData {
                    id,
                    name: "My Board".to_string(),
                    description: None,
                    state: None,
                    created_at: now.clone(),
                    updated_at: now,
                })
            }
        }
    }

    pub fn get_board_nodes(&self, board_id: &str) -> SqlResult<Vec<BoardNode>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, node_type, record_id, content, x, y, width, height, color, data, style
             FROM board_nodes WHERE board_id = ?1"
        )?;
        let rows = stmt.query_map(params![board_id], |row| {
            Ok(BoardNode {
                id: row.get(0)?,
                board_id: row.get(1)?,
                node_type: row.get(2)?,
                record_id: row.get(3)?,
                content: row.get(4)?,
                x: row.get(5)?,
                y: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                color: row.get(9)?,
                data: row.get(10)?,
                style: row.get(11)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_board_edges(&self, board_id: &str) -> SqlResult<Vec<BoardEdge>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, board_id, from_node_id, to_node_id, kind, label, style, data
             FROM board_edges WHERE board_id = ?1"
        )?;
        let rows = stmt.query_map(params![board_id], |row| {
            Ok(BoardEdge {
                id: row.get(0)?,
                board_id: row.get(1)?,
                from_node_id: row.get(2)?,
                to_node_id: row.get(3)?,
                kind: row.get(4)?,
                label: row.get(5)?,
                style: row.get(6)?,
                data: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn save_board_state(&self, board_id: &str, nodes_json: &str, edges_json: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        // Delete existing nodes and edges
        conn.execute("DELETE FROM board_edges WHERE board_id = ?1", params![board_id])?;
        conn.execute("DELETE FROM board_nodes WHERE board_id = ?1", params![board_id])?;

        // Insert new nodes
        let nodes: Vec<BoardNode> = serde_json::from_str(nodes_json).unwrap_or_default();
        for node in &nodes {
            conn.execute(
                "INSERT INTO board_nodes (id, board_id, node_type, record_id, content, x, y, width, height, color, data, style)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![node.id, board_id, node.node_type, node.record_id, node.content,
                        node.x, node.y, node.width, node.height, node.color, node.data, node.style],
            )?;
        }

        // Insert new edges
        let edges: Vec<BoardEdge> = serde_json::from_str(edges_json).unwrap_or_default();
        for edge in &edges {
            conn.execute(
                "INSERT INTO board_edges (id, board_id, from_node_id, to_node_id, kind, label, style, data)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![edge.id, board_id, edge.from_node_id, edge.to_node_id, edge.kind, edge.label, edge.style, edge.data],
            )?;
        }

        conn.execute(
            "UPDATE boards SET updated_at = ?1 WHERE id = ?2",
            params![now, board_id],
        )?;

        Ok(())
    }

    // ── Chat ──────────────────────────────────────────────────────────────

    pub fn get_chat_threads(&self) -> SqlResult<Vec<ChatThread>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, context, created_at, updated_at FROM chat_threads ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ChatThread {
                id: row.get(0)?,
                title: row.get(1)?,
                context: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_chat_thread(&self, title: &str) -> SqlResult<ChatThread> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO chat_threads (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params![id, title, now],
        )?;
        Ok(ChatThread {
            id,
            title: title.to_string(),
            context: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn get_chat_messages(&self, thread_id: &str) -> SqlResult<Vec<ChatMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, thread_id, role, content, metadata, created_at
             FROM chat_messages WHERE thread_id = ?1 ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![thread_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn insert_chat_message(&self, thread_id: &str, role: &str, content: &str) -> SqlResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO chat_messages (id, thread_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, thread_id, role, content, now],
        )?;
        conn.execute(
            "UPDATE chat_threads SET updated_at = ?1 WHERE id = ?2",
            params![now, thread_id],
        )?;
        Ok(id)
    }

    pub fn delete_chat_thread(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE thread_id = ?1", params![id])?;
        conn.execute("DELETE FROM chat_threads WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Job Queue ─────────────────────────────────────────────────────────

    pub fn queue_job(&self, job_type: &str, payload: &str) -> SqlResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO job_queue (id, job_type, payload, status, attempts, max_attempts, created_at)
             VALUES (?1, ?2, ?3, 'pending', 0, 3, ?4)",
            params![id, job_type, payload, now],
        )?;
        Ok(id)
    }

    pub fn get_next_job(&self) -> SqlResult<Option<JobQueueItem>> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT id, job_type, payload, status, attempts, max_attempts, last_error, created_at
             FROM job_queue
             WHERE status = 'pending' AND attempts < max_attempts
             ORDER BY created_at ASC LIMIT 1",
            [],
            |row| {
                Ok(JobQueueItem {
                    id: row.get(0)?,
                    job_type: row.get(1)?,
                    payload: row.get(2)?,
                    status: row.get(3)?,
                    attempts: row.get(4)?,
                    max_attempts: row.get(5)?,
                    last_error: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        );
        match result {
            Ok(job) => Ok(Some(job)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn mark_job_running(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE job_queue SET status = 'running', attempts = attempts + 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn mark_job_completed(&self, id: &str) -> SqlResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE job_queue SET status = 'completed', completed_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn mark_job_failed(&self, id: &str, error: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        // Increment attempts and set back to pending for retry.
        // If attempts >= max_attempts, mark as permanently 'failed'.
        conn.execute(
            "UPDATE job_queue SET
                attempts = attempts + 1,
                last_error = ?1,
                status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END
             WHERE id = ?2",
            params![error, id],
        )?;
        Ok(())
    }

    /// Park a job back to pending without incrementing attempts (for trial expired / rate limit).
    pub fn park_job(&self, id: &str, error: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE job_queue SET status = 'pending', last_error = ?1 WHERE id = ?2",
            params![error, id],
        )?;
        Ok(())
    }

    /// Reset any jobs stuck in 'running' back to 'pending' (e.g. after app crash/restart).
    pub fn reset_stuck_jobs(&self) -> SqlResult<usize> {
        let conn = self.conn.lock().unwrap();
        let count = conn.execute(
            "UPDATE job_queue SET status = 'pending', last_error = 'reset: was stuck in running' WHERE status = 'running'",
            [],
        )?;
        if count > 0 {
            println!("[DB] Reset {} stuck running jobs back to pending", count);
        }
        Ok(count)
    }

    // ── Projects ─────────────────────────────────────────────────────────

    pub fn get_projects(&self) -> SqlResult<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name, p.description, p.color, p.is_default, p.created_at, p.updated_at, \
             COALESCE((SELECT COUNT(*) FROM project_records pr WHERE pr.project_id = p.id), 0) as record_count \
             FROM projects p ORDER BY p.created_at DESC"
        )?;
        let projects = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                is_default: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                record_count: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(projects)
    }

    pub fn get_project(&self, id: &str) -> SqlResult<Project> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT p.id, p.name, p.description, p.color, p.is_default, p.created_at, p.updated_at, \
             COALESCE((SELECT COUNT(*) FROM project_records pr WHERE pr.project_id = p.id), 0) as record_count \
             FROM projects p WHERE p.id = ?1",
            params![id],
            |row| Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                is_default: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                record_count: row.get(7)?,
            }),
        )
    }

    pub fn create_project(&self, name: &str, description: Option<&str>, color: &str) -> SqlResult<String> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO projects (id, name, description, color, is_default, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
            params![id, name, description, color, now],
        )?;
        Ok(id)
    }

    pub fn update_project(&self, id: &str, name: &str, description: Option<&str>, color: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE projects SET name = ?1, description = ?2, color = ?3, updated_at = ?4 WHERE id = ?5",
            params![name, description, color, now, id],
        )?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_project_records(&self, project_id: &str) -> SqlResult<Vec<Record>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT r.id, r.type, r.title, r.summary, r.content, r.confidence, r.tags, r.source, \
             r.meta, r.created_by, r.created_at, r.updated_at \
             FROM records r \
             INNER JOIN project_records pr ON pr.record_id = r.id \
             WHERE pr.project_id = ?1 \
             ORDER BY r.created_at DESC"
        )?;
        let records = stmt.query_map(params![project_id], |row| {
            Ok(Record {
                id: row.get(0)?,
                record_type: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
                content: row.get(4)?,
                confidence: row.get(5)?,
                tags: row.get(6)?,
                source: row.get(7)?,
                meta: row.get(8)?,
                created_by: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(records)
    }

    pub fn add_record_to_project(&self, project_id: &str, record_id: &str, assigned_by: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO project_records (id, project_id, record_id, assigned_by, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, project_id, record_id, assigned_by, now],
        )?;
        Ok(())
    }

    /// Get the project a record belongs to (first match, since a record could be in multiple)
    pub fn get_record_project(&self, record_id: &str) -> SqlResult<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name, p.description, p.color, p.is_default, p.created_at, p.updated_at, \
             COALESCE((SELECT COUNT(*) FROM project_records pr2 WHERE pr2.project_id = p.id), 0) as record_count \
             FROM projects p \
             INNER JOIN project_records pr ON pr.project_id = p.id \
             WHERE pr.record_id = ?1 \
             LIMIT 1"
        )?;
        let result = stmt.query_row(params![record_id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                is_default: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                record_count: row.get(7)?,
            })
        });
        match result {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn remove_record_from_project(&self, project_id: &str, record_id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM project_records WHERE project_id = ?1 AND record_id = ?2",
            params![project_id, record_id],
        )?;
        Ok(())
    }

    // ── Inbox (Raw Items) ─────────────────────────────────────────────────

    pub fn get_all_raw_items(&self, limit: i64, status_filter: Option<&str>) -> SqlResult<Vec<RawItem>> {
        let conn = self.conn.lock().unwrap();
        let (sql, filter_val);
        if let Some(status) = status_filter {
            sql = "SELECT id, content, content_type, source_type, metadata, status, triage_result, created_at \
                   FROM raw_items WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2";
            filter_val = Some(status.to_string());
        } else {
            sql = "SELECT id, content, content_type, source_type, metadata, status, triage_result, created_at \
                   FROM raw_items ORDER BY created_at DESC LIMIT ?2";
            filter_val = None;
        }
        let mut stmt = conn.prepare(sql)?;
        let items = if let Some(ref status) = filter_val {
            stmt.query_map(params![status, limit], |row| {
                Ok(RawItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    source_type: row.get(3)?,
                    metadata: row.get(4)?,
                    status: row.get(5)?,
                    triage_result: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?.filter_map(|r| r.ok()).collect()
        } else {
            stmt.query_map(params![limit], |row| {
                Ok(RawItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    source_type: row.get(3)?,
                    metadata: row.get(4)?,
                    status: row.get(5)?,
                    triage_result: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?.filter_map(|r| r.ok()).collect()
        };
        Ok(items)
    }

    pub fn get_raw_items_count(&self) -> SqlResult<RawItemsCount> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM raw_items", [], |r| r.get(0))?;
        let pending: i64 = conn.query_row("SELECT COUNT(*) FROM raw_items WHERE status = 'pending'", [], |r| r.get(0))?;
        let triaged: i64 = conn.query_row("SELECT COUNT(*) FROM raw_items WHERE status = 'triaged'", [], |r| r.get(0))?;
        let ignored: i64 = conn.query_row("SELECT COUNT(*) FROM raw_items WHERE status = 'ignored'", [], |r| r.get(0))?;
        Ok(RawItemsCount { total, pending, triaged, ignored })
    }

    // ── Notifications ─────────────────────────────────────────────────────

    pub fn get_notifications(&self, status: Option<&str>, limit: i64) -> SqlResult<Vec<Notification>> {
        let conn = self.conn.lock().unwrap();
        let mut notifs = Vec::new();
        if let Some(s) = status {
            let mut stmt = conn.prepare(
                "SELECT id, type, title, body, object_type, object_id, status, created_at \
                 FROM notifications WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2"
            )?;
            let rows = stmt.query_map(params![s, limit], |row| {
                Ok(Notification {
                    id: row.get(0)?,
                    notif_type: row.get(1)?,
                    title: row.get(2)?,
                    body: row.get(3)?,
                    object_type: row.get(4)?,
                    object_id: row.get(5)?,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?;
            for r in rows { if let Ok(n) = r { notifs.push(n); } }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, type, title, body, object_type, object_id, status, created_at \
                 FROM notifications ORDER BY created_at DESC LIMIT ?1"
            )?;
            let rows = stmt.query_map(params![limit], |row| {
                Ok(Notification {
                    id: row.get(0)?,
                    notif_type: row.get(1)?,
                    title: row.get(2)?,
                    body: row.get(3)?,
                    object_type: row.get(4)?,
                    object_id: row.get(5)?,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?;
            for r in rows { if let Ok(n) = r { notifs.push(n); } }
        }
        Ok(notifs)
    }

    pub fn get_unread_notification_count(&self) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE status = 'unread'",
            [],
            |r| r.get(0),
        )
    }

    pub fn create_notification(
        &self, notif_type: &str, title: &str, body: Option<&str>,
        object_type: Option<&str>, object_id: Option<&str>,
    ) -> SqlResult<String> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO notifications (id, type, title, body, object_type, object_id, status, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unread', ?7)",
            params![id, notif_type, title, body, object_type, object_id, now],
        )?;
        Ok(id)
    }

    pub fn update_notification_status(&self, id: &str, status: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE notifications SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    // ── Job Queue (extended) ──────────────────────────────────────────────

    pub fn get_recent_jobs(&self, limit: i64, offset: i64) -> SqlResult<Vec<JobQueueItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, job_type, payload, status, attempts, max_attempts, last_error, created_at \
             FROM job_queue ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        )?;
        let jobs = stmt.query_map(params![limit, offset], |row| {
            Ok(JobQueueItem {
                id: row.get(0)?,
                job_type: row.get(1)?,
                payload: row.get(2)?,
                status: row.get(3)?,
                attempts: row.get(4)?,
                max_attempts: row.get(5)?,
                last_error: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(jobs)
    }

    pub fn get_job_counts(&self) -> SqlResult<(i64, i64, i64, i64)> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM job_queue", [], |r| r.get(0))?;
        let pending: i64 = conn.query_row(
            "SELECT COUNT(*) FROM job_queue WHERE status IN ('pending', 'running')", [], |r| r.get(0)
        )?;
        let completed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM job_queue WHERE status = 'completed'", [], |r| r.get(0)
        )?;
        let failed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM job_queue WHERE status IN ('failed', 'parked')", [], |r| r.get(0)
        )?;
        Ok((total, pending, completed, failed))
    }

    // ── Dashboard Stats ───────────────────────────────────────────────────

    pub fn get_dashboard_stats(&self) -> SqlResult<DashboardStats> {
        let conn = self.conn.lock().unwrap();
        let total_records: i64 = conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0))?;
        let total_decisions: i64 = conn.query_row("SELECT COUNT(*) FROM records WHERE type = 'decision'", [], |r| r.get(0))?;
        let total_meetings: i64 = conn.query_row("SELECT COUNT(*) FROM records WHERE type = 'meeting'", [], |r| r.get(0))?;
        let total_insights: i64 = conn.query_row("SELECT COUNT(*) FROM records WHERE type = 'insight'", [], |r| r.get(0))?;
        let total_ideas: i64 = conn.query_row("SELECT COUNT(*) FROM records WHERE type = 'idea'", [], |r| r.get(0))?;
        let total_entities: i64 = conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))?;
        let total_links: i64 = conn.query_row("SELECT COUNT(*) FROM record_links", [], |r| r.get(0))?;
        let records_today: i64 = conn.query_row(
            "SELECT COUNT(*) FROM records WHERE created_at >= date('now')", [], |r| r.get(0)
        )?;
        let records_this_week: i64 = conn.query_row(
            "SELECT COUNT(*) FROM records WHERE created_at >= date('now', '-7 days')", [], |r| r.get(0)
        )?;

        // Daily activity for last 14 days
        let mut stmt = conn.prepare(
            "SELECT date(created_at) as d, COUNT(*) as c FROM records \
             WHERE created_at >= date('now', '-13 days') \
             GROUP BY d ORDER BY d"
        )?;
        let daily_activity: Vec<DailyActivity> = stmt.query_map([], |row| {
            Ok(DailyActivity { date: row.get(0)?, count: row.get(1)? })
        })?.filter_map(|r| r.ok()).collect();

        // Type counts
        let mut stmt = conn.prepare(
            "SELECT type, COUNT(*) as c FROM records GROUP BY type ORDER BY c DESC"
        )?;
        let type_counts: Vec<TypeCount> = stmt.query_map([], |row| {
            Ok(TypeCount { record_type: row.get(0)?, count: row.get(1)? })
        })?.filter_map(|r| r.ok()).collect();

        // Top tags (parse JSON tags column, aggregate)
        let mut stmt = conn.prepare(
            "SELECT tags FROM records WHERE tags IS NOT NULL AND tags != '[]'"
        )?;
        let mut tag_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(0)?;
            Ok(tags_str)
        })?;
        for row in rows {
            if let Ok(tags_str) = row {
                if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_str) {
                    for tag in tags {
                        *tag_map.entry(tag).or_insert(0) += 1;
                    }
                }
            }
        }
        let mut top_tags: Vec<TagCount> = tag_map.into_iter()
            .map(|(tag, count)| TagCount { tag, count })
            .collect();
        top_tags.sort_by(|a, b| b.count.cmp(&a.count));
        top_tags.truncate(15);

        Ok(DashboardStats {
            total_records, total_decisions, total_meetings, total_insights,
            total_ideas, total_entities, total_links, records_today, records_this_week,
            daily_activity, type_counts, top_tags,
        })
    }

    pub fn get_today_briefing(&self) -> SqlResult<TodayBriefing> {
        let conn = self.conn.lock().unwrap();

        // Get records from last 24 hours
        let mut stmt = conn.prepare(
            "SELECT id, type, title, summary, content, confidence, tags, source, meta, created_by, created_at, updated_at
             FROM records WHERE created_at >= datetime('now', '-24 hours')
             ORDER BY created_at DESC LIMIT 50"
        )?;
        let all_recent: Vec<Record> = stmt.query_map([], Self::map_record)?
            .filter_map(|r| r.ok()).collect();

        let total_recent = all_recent.len() as i64;

        let mut decisions = Vec::new();
        let mut tasks = Vec::new();
        let mut transcripts = Vec::new();
        let mut meetings = Vec::new();
        let mut insights = Vec::new();
        let mut other = Vec::new();

        for r in all_recent {
            match r.record_type.as_str() {
                "decision" => decisions.push(r),
                "tasklike" => tasks.push(r),
                "transcript" => transcripts.push(r),
                "meeting" => meetings.push(r),
                "insight" => insights.push(r),
                _ => other.push(r),
            }
        }

        let pending_notifications: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE status = 'unread'", [], |r| r.get(0)
        )?;

        Ok(TodayBriefing {
            decisions, tasks, transcripts, meetings, insights, other,
            pending_notifications, total_recent,
        })
    }
}

// ── Migration SQL ─────────────────────────────────────────────────────────

const MIGRATION_V1: &str = "
-- App config (replaces Tauri Store for structured settings)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Raw items (inbox before triage)
CREATE TABLE IF NOT EXISTS raw_items (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    content_type TEXT,
    source_type TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    triage_result TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_items_status ON raw_items(status);

-- Records (curated memories)
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    raw_item_id TEXT,
    type TEXT NOT NULL DEFAULT 'note',
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    confidence REAL DEFAULT 0.5,
    tags TEXT,
    source TEXT,
    meta TEXT,
    created_by TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at);

-- Entities
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized TEXT NOT NULL,
    mention_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized);

-- Record-Entity links
CREATE TABLE IF NOT EXISTS record_entities (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_re_record ON record_entities(record_id);
CREATE INDEX IF NOT EXISTS idx_re_entity ON record_entities(entity_id);

-- Record links (graph edges)
CREATE TABLE IF NOT EXISTS record_links (
    id TEXT PRIMARY KEY,
    from_record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    to_record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    weight REAL DEFAULT 0.5,
    explanation TEXT,
    created_by TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl_from ON record_links(from_record_id);
CREATE INDEX IF NOT EXISTS idx_rl_to ON record_links(to_record_id);

-- Embeddings (vector store)
CREATE TABLE IF NOT EXISTS embeddings (
    record_id TEXT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
    vector TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'nomic-embed-text',
    created_at TEXT NOT NULL
);

-- Boards (whiteboard)
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    state TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Board nodes
CREATE TABLE IF NOT EXISTS board_nodes (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL,
    record_id TEXT REFERENCES records(id) ON DELETE SET NULL,
    content TEXT,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL DEFAULT 200,
    height REAL DEFAULT 100,
    color TEXT DEFAULT '#fef08a',
    data TEXT,
    style TEXT
);
CREATE INDEX IF NOT EXISTS idx_bn_board ON board_nodes(board_id);

-- Board edges
CREATE TABLE IF NOT EXISTS board_edges (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    from_node_id TEXT NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
    to_node_id TEXT NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'arrow',
    label TEXT,
    style TEXT,
    data TEXT
);
CREATE INDEX IF NOT EXISTS idx_be_board ON board_edges(board_id);

-- Chat threads
CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cm_thread ON chat_messages(thread_id);

-- Job queue
CREATE TABLE IF NOT EXISTS job_queue (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jq_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_jq_type ON job_queue(job_type);
";

const MIGRATION_V2: &str = "
-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Project-Record junction
CREATE TABLE IF NOT EXISTS project_records (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    assigned_by TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pr_project ON project_records(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_record ON project_records(record_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    object_type TEXT,
    object_id TEXT,
    status TEXT NOT NULL DEFAULT 'unread',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);
";
