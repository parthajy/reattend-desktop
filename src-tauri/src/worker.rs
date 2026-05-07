use std::sync::Arc;
use crate::ai::{self, AiClient};
use crate::db::Database;

/// Background job processor — polls the job queue and runs AI pipeline:
/// triage → embed → link
/// Note: Embeddings are always local (fastembed). LLM calls go through the configured provider.
pub async fn run_worker_loop(
    db: Arc<Database>,
    app_handle: tauri::AppHandle,
    ai_provider: String,
    server_url: String,
    device_id: String,
    auth_token: String,
    groq_key: String,
    ollama_url: String,
    ollama_model: String,
) {
    let client = if ai_provider == "server" {
        println!("[Worker] Using server proxy for LLM at {}", server_url);
        AiClient::new_server(&server_url, &device_id, &auth_token)
    } else if ai_provider == "groq" && !groq_key.is_empty() {
        println!("[Worker] Using Groq for LLM");
        AiClient::new_groq(&groq_key)
    } else {
        println!("[Worker] Using Ollama for LLM");
        AiClient::new_ollama(&ollama_url, &ollama_model)
    };
    println!("[Worker] Embeddings: local (nomic-embed-text-v1.5 via fastembed)");

    // Wait a bit on startup before starting to process
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Reset any jobs stuck in "running" from a previous crash/restart
    if let Err(e) = db.reset_stuck_jobs() {
        eprintln!("[Worker] Failed to reset stuck jobs: {}", e);
    }

    // Track wall-clock time to detect system sleep/hibernate
    let mut last_loop_time = std::time::SystemTime::now();

    loop {
        // Detect system sleep/hibernate: if wall-clock gap is much larger than expected
        let now = std::time::SystemTime::now();
        if let Ok(elapsed) = now.duration_since(last_loop_time) {
            if elapsed.as_secs() > 60 {
                println!("[Worker] System wake detected! Gap was {}s — resetting stuck jobs", elapsed.as_secs());
                if let Err(e) = db.reset_stuck_jobs() {
                    eprintln!("[Worker] Failed to reset stuck jobs after wake: {}", e);
                }
                // Brief delay to let system settle
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
            }
        }
        last_loop_time = std::time::SystemTime::now();

        // Check if Ollama is available
        if !client.is_available().await {
            // Ollama not running — wait and retry
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            continue;
        }

        match process_next_job(&db, &client, &app_handle).await {
            Ok(true) => {
                // Processed a job — small delay before next
                tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;
            }
            Ok(false) => {
                // No jobs — wait longer before polling again
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            }
            Err(e) => {
                eprintln!("[Worker] Error processing job: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
            }
        }
    }
}

async fn process_next_job(db: &Database, client: &AiClient, app_handle: &tauri::AppHandle) -> Result<bool, String> {
    let job = match db.get_next_job() {
        Ok(Some(j)) => j,
        Ok(None) => return Ok(false),
        Err(e) => return Err(format!("Failed to get next job: {}", e)),
    };

    // Mark as running
    db.mark_job_running(&job.id).map_err(|e| e.to_string())?;

    let result = match job.job_type.as_str() {
        "triage" => handle_triage(db, client, &job.payload, app_handle).await,
        "embed" => handle_embed(db, client, &job.payload).await,
        "link" => handle_link(db, client, &job.payload).await,
        "enrich" => handle_enrich(db, client, &job.payload).await,
        // ("transcribe" arm removed with audio recorder strip — no audio
        // pipeline means no transcribe jobs are ever queued anymore.)
        other => Err(format!("Unknown job type: {}", other)),
    };

    match result {
        Ok(()) => {
            db.mark_job_completed(&job.id).map_err(|e| e.to_string())?;
            println!("[Worker] Completed job {} ({})", job.id, job.job_type);
            Ok(true)
        }
        Err(e) => {
            let is_trial_expired = e.contains("trial_expired") || e.contains("429");
            let is_network = e.contains("fetch failed")
                || e.contains("Connection refused")
                || e.to_lowercase().contains("timeout");

            let is_embedder_not_ready = e.contains("EMBEDDER_NOT_READY");

            if is_embedder_not_ready {
                // Embedder still loading — park job without burning attempts
                let _ = db.park_job(&job.id, "Waiting for embedder to initialize");
                println!("[Worker] Embedder not ready — will retry embed job in 15s");
                tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
            } else if is_trial_expired {
                // Trial expired or rate limited — don't burn retries, pause for a long time
                let _ = db.park_job(&job.id, &e);
                println!("[Worker] Trial expired / rate limited — pausing 5 min");
                tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            } else if is_network {
                db.mark_job_failed(&job.id, &e).map_err(|ee| ee.to_string())?;
                println!("[Worker] Network error on job {}: {}", job.id, e);
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            } else if job.attempts < job.max_attempts - 1 {
                db.mark_job_failed(&job.id, &e).map_err(|ee| ee.to_string())?;
                println!("[Worker] Failed job {} (attempt {}): {}", job.id, job.attempts + 1, e);
            } else {
                // Final attempt — mark permanently failed
                let conn_err = format!("FINAL FAIL: {}", e);
                db.mark_job_failed(&job.id, &conn_err).map_err(|ee| ee.to_string())?;
                println!("[Worker] Permanently failed job {}: {}", job.id, e);
            }
            Ok(true)
        }
    }
}

// ── Triage handler ──────────────────────────────────────────────────────

async fn handle_triage(db: &Database, client: &AiClient, payload: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
    let payload: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid triage payload: {}", e))?;
    let raw_item_id = payload["raw_item_id"].as_str()
        .ok_or("Missing raw_item_id in triage payload")?;

    // Fetch raw item by ID directly (any status)
    let raw_item = db.get_raw_item_by_id(raw_item_id)
        .map_err(|e| format!("Raw item not found {}: {}", raw_item_id, e))?;

    let content = raw_item.content;
    let metadata = raw_item.metadata;
    let source_type = raw_item.source_type;

    let result = ai::run_triage(client, &content, metadata.as_deref()).await?;

    // Update raw item status
    let triage_json = serde_json::to_string(&result).unwrap_or_default();
    let status = if result.should_store { "triaged" } else { "ignored" };
    db.update_raw_item_status(raw_item_id, status, Some(&triage_json))
        .map_err(|e| e.to_string())?;

    if result.should_store {
        // ── Deduplication check ──────────────────────────────
        // Before creating a new record, check if a near-duplicate exists (same title, last 24h)
        if let Ok(Some(existing_id)) = db.find_duplicate_record(&result.title, &result.record_type) {
            // Merge into existing record instead of creating a duplicate
            let _ = db.append_record_content(&existing_id, &content);
            db.update_raw_item_status(raw_item_id, "merged", Some(&serde_json::json!({
                "merged_into": existing_id,
                "original_triage": result.title,
            }).to_string())).map_err(|e| e.to_string())?;
            println!("[Worker] Dedup: merged {} into existing record {}", raw_item_id, existing_id);
            return Ok(());
        }

        // Create record
        let tags_json = serde_json::to_string(&result.tags).unwrap_or_else(|_| "[]".to_string());
        // Build meta JSON with action_items, decisions, key_points (for meetings/transcripts)
        let meta_json = {
            let mut meta = serde_json::Map::new();
            if !result.action_items.is_empty() {
                meta.insert("action_items".to_string(), serde_json::json!(result.action_items));
            }
            if !result.decisions.is_empty() {
                meta.insert("decisions".to_string(), serde_json::json!(result.decisions));
            }
            if !result.key_points.is_empty() {
                meta.insert("key_points".to_string(), serde_json::json!(result.key_points));
            }
            if meta.is_empty() { None } else { Some(serde_json::Value::Object(meta).to_string()) }
        };

        let record_id = db.insert_record(
            &result.record_type,
            &result.title,
            Some(&result.summary),
            Some(&content),
            Some(result.confidence),
            Some(&tags_json),
            Some(&source_type), // source
            meta_json.as_deref(), // meta with action_items, decisions, key_points
            Some(raw_item_id),
        ).map_err(|e| e.to_string())?;

        // Upsert entities + link to record
        for entity in &result.entities {
            if let Ok(entity_id) = db.upsert_entity(&entity.kind, &entity.name) {
                let _ = db.link_record_entity(&record_id, &entity_id);
            }
        }

        // Auto-assign to project if metadata contains project_id
        if let Some(ref meta) = metadata {
            if let Ok(meta_val) = serde_json::from_str::<serde_json::Value>(meta) {
                if let Some(project_id) = meta_val["project_id"].as_str() {
                    let _ = db.add_record_to_project(project_id, &record_id, "auto");
                    println!("[Worker] Auto-assigned to project: {}", project_id);
                }
            }
        }

        // Queue embedding job
        let embed_payload = serde_json::json!({ "record_id": record_id }).to_string();
        db.queue_job("embed", &embed_payload).map_err(|e| e.to_string())?;

        // Create notifications for actionable memories
        let rt = result.record_type.as_str();
        let has_date = result.due_date.as_ref().map(|d| !d.is_empty()).unwrap_or(false);
        let date_str = result.due_date.as_deref().unwrap_or("");

        if rt == "tasklike" {
            let body = if has_date {
                format!("Due: {}", date_str)
            } else {
                result.summary.clone()
            };
            let _ = db.create_notification("todo", &result.title, Some(&body), Some("record"), Some(&record_id));
        } else if rt == "meeting" && has_date {
            let body = format!("Scheduled: {}", date_str);
            let _ = db.create_notification("followup", &result.title, Some(&body), Some("record"), Some(&record_id));
        } else if rt == "decision" {
            let _ = db.create_notification("decision_pending", &result.title, Some(&result.summary), Some("record"), Some(&record_id));
        } else if has_date {
            let body = format!("Due: {}", date_str);
            let _ = db.create_notification("todo", &result.title, Some(&body), Some("record"), Some(&record_id));
        }

        // Show meeting result window only for actual meeting recorder sessions,
        // not for OCR captures that the triage AI classifies as "transcript"
        if source_type == "meeting" {
            use tauri::Emitter;
            let _ = app_handle.emit("meeting_result", serde_json::json!({
                "record_id": record_id,
                "title": result.title,
                "summary": result.summary,
                "content": content,
                "tags": result.tags,
                "entities": result.entities,
                "record_type": result.record_type,
                "action_items": result.action_items,
                "decisions": result.decisions,
                "key_points": result.key_points,
            }));
        }

        println!("[Worker] Triaged: {} → {} ({})", raw_item_id, result.title, result.record_type);
    } else {
        println!("[Worker] Dropped: {} — {}", raw_item_id, result.why_kept_or_dropped);
    }

    Ok(())
}

// ── Embedding handler ───────────────────────────────────────────────────

async fn handle_embed(db: &Database, client: &AiClient, payload: &str) -> Result<(), String> {
    // Wait for the local embedding model to finish loading (can take minutes on first run)
    if !ai::is_embedder_ready() {
        // Return a special error that won't count toward max_attempts
        return Err("EMBEDDER_NOT_READY: Local embedder not initialized yet (model still downloading?)".to_string());
    }

    let payload: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid embed payload: {}", e))?;
    let record_id = payload["record_id"].as_str()
        .ok_or("Missing record_id in embed payload")?;

    let record = db.get_record(record_id).map_err(|e| e.to_string())?;

    // Timeout embedding after 30 seconds — fastembed can hang on very large content
    let embed_future = ai::run_embedding(
        client,
        &record.title,
        record.summary.as_deref().unwrap_or(""),
        record.content.as_deref().unwrap_or(""),
    );
    let vector = match tokio::time::timeout(
        tokio::time::Duration::from_secs(30),
        embed_future,
    ).await {
        Ok(result) => result?,
        Err(_) => return Err(format!("Embedding timed out after 30s for record: {}", record.title)),
    };

    let vector_json = serde_json::to_string(&vector)
        .map_err(|e| format!("Failed to serialize vector: {}", e))?;

    db.insert_embedding(record_id, &vector_json, client.embed_model_name())
        .map_err(|e| e.to_string())?;

    // Queue linking job
    let link_payload = serde_json::json!({ "record_id": record_id }).to_string();
    db.queue_job("link", &link_payload).map_err(|e| e.to_string())?;

    println!("[Worker] Embedded: {} ({}d vector)", record.title, vector.len());

    Ok(())
}

// ── Linking handler ────────────────��────────────────────────────────────

async fn handle_link(db: &Database, client: &AiClient, payload: &str) -> Result<(), String> {
    let payload: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid link payload: {}", e))?;
    let record_id = payload["record_id"].as_str()
        .ok_or("Missing record_id in link payload")?;

    let record = db.get_record(record_id).map_err(|e| e.to_string())?;

    // Get all embeddings
    let all_embeddings = db.get_all_embeddings().map_err(|e| e.to_string())?;

    // Find source embedding
    let source_vector = all_embeddings.iter()
        .find(|(id, _)| id == record_id)
        .map(|(_, v)| v.clone());

    let source_vector = match source_vector {
        Some(v) => v,
        None => return Ok(()), // No embedding yet, skip
    };

    // Calculate similarities
    let mut similarities: Vec<(String, f64)> = Vec::new();
    for (other_id, other_vec) in &all_embeddings {
        if other_id == record_id {
            continue;
        }
        let sim = ai::cosine_similarity(&source_vector, other_vec);
        if sim > 0.3 {
            similarities.push((other_id.clone(), sim));
        }
    }

    similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_candidates: Vec<_> = similarities.into_iter().take(10).collect();

    if top_candidates.is_empty() {
        return Ok(());
    }

    // Fetch candidate records
    let mut candidates: Vec<(String, String, String)> = Vec::new();
    for (cand_id, _) in &top_candidates {
        if let Ok(rec) = db.get_record(cand_id) {
            candidates.push((rec.id, rec.title, rec.summary.unwrap_or_default()));
        }
    }

    // Ask LLM to determine link types
    let result = ai::run_linking(
        client,
        &record.title,
        record.summary.as_deref().unwrap_or(""),
        &candidates,
    ).await;

    match result {
        Ok(linking) => {
            let mut link_count = 0;
            for link in &linking.links {
                if link_count >= 8 { break; }

                // Validate target exists in candidates
                if candidates.iter().any(|(id, _, _)| id == &link.target_id) {
                    if let Ok(_) = db.insert_record_link(
                        record_id,
                        &link.target_id,
                        &link.kind,
                        Some(link.weight),
                        Some(&link.explanation),
                    ) {
                        link_count += 1;
                    }
                }
            }
            println!("[Worker] Linked: {} → {} links", record.title, link_count);
        }
        Err(_) => {
            // Fallback: create links based on similarity alone
            for (cand_id, sim) in top_candidates.iter().take(3) {
                let explanation = format!("Semantic similarity: {}%", (sim * 100.0) as u32);
                let _ = db.insert_record_link(record_id, cand_id, "same_topic", Some(*sim), Some(&explanation));
            }
            println!("[Worker] Linked (fallback): {} → {} similarity-based links", record.title, top_candidates.len().min(3));
        }
    }

    Ok(())
}

// ── Enrich handler (AI enrichment for manually created records) ──────────

async fn handle_enrich(db: &Database, client: &AiClient, payload: &str) -> Result<(), String> {
    let payload: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid enrich payload: {}", e))?;
    let record_id = payload["record_id"].as_str()
        .ok_or("Missing record_id in enrich payload")?;

    let record = db.get_record(record_id).map_err(|e| e.to_string())?;

    // Build the text for AI analysis — use content first, fallback to title + summary
    let text = record.content.as_deref()
        .or(record.summary.as_deref())
        .unwrap_or(&record.title);

    // Run triage on the text to extract entities, tags, confidence, and better summary
    let result = ai::run_triage(client, text, None).await?;

    // Update record with AI-enriched data (only fill in gaps, don't overwrite user input)
    let new_tags = if record.tags.is_none() || record.tags.as_deref() == Some("[]") {
        Some(serde_json::to_string(&result.tags).unwrap_or_else(|_| "[]".to_string()))
    } else {
        // Merge existing + new tags
        let existing: Vec<String> = record.tags.as_deref()
            .and_then(|t| serde_json::from_str(t).ok())
            .unwrap_or_default();
        let mut merged = existing;
        for tag in &result.tags {
            let lower = tag.to_lowercase();
            if !merged.iter().any(|t| t.to_lowercase() == lower) {
                merged.push(tag.clone());
            }
        }
        Some(serde_json::to_string(&merged).unwrap_or_else(|_| "[]".to_string()))
    };

    // Update summary if none exists
    let new_summary = if record.summary.is_none() || record.summary.as_deref() == Some("") {
        Some(result.summary.as_str())
    } else {
        None
    };

    // Set confidence if not already set
    let new_confidence = if record.confidence.is_none() || record.confidence == Some(0.0) {
        Some(result.confidence)
    } else {
        record.confidence
    };

    // Use better record_type if current is generic "note"
    let new_type = if record.record_type == "note" && result.record_type != "note" {
        Some(result.record_type.as_str())
    } else {
        None
    };

    // Apply updates via db method
    db.update_record_enrichment(
        record_id,
        new_tags.as_deref(),
        new_summary,
        new_confidence,
        new_type,
    ).map_err(|e| format!("Failed to update record: {}", e))?;

    // Upsert entities + link to record
    for entity in &result.entities {
        if let Ok(entity_id) = db.upsert_entity(&entity.kind, &entity.name) {
            let _ = db.link_record_entity(record_id, &entity_id);
        }
    }

    println!("[Worker] Enriched: {} — {} entities, {} tags", record.title, result.entities.len(), result.tags.len());

    Ok(())
}

// ── Transcribe handler (Meeting Mode) ────────────────────────────────

// (handle_transcribe + downsample_wav + mono_sample removed 2026-05-07
// with the audio recorder strip. They only existed to convert recorded
// WAV files into transcribed text via the server's
// /api/tray/proxy/transcribe endpoint. No mic recording = no WAVs =
// nothing to transcribe.)
