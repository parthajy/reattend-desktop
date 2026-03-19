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
        "transcribe" => handle_transcribe(db, client, &job.payload).await,
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

async fn handle_transcribe(db: &Database, client: &AiClient, payload: &str) -> Result<(), String> {
    let payload: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid transcribe payload: {}", e))?;
    let raw_item_id = payload["raw_item_id"].as_str()
        .ok_or("Missing raw_item_id in transcribe payload")?;
    let audio_path = payload["audio_path"].as_str()
        .ok_or("Missing audio_path in transcribe payload")?;

    // Downsample WAV to mono 16kHz (what Whisper expects, ~6x smaller)
    let audio_bytes = downsample_wav(audio_path)?;
    let file_size_mb = audio_bytes.len() as f64 / (1024.0 * 1024.0);
    // Scale timeout: 120s base + 30s per MB (a 7-min recording ≈ 3MB after downsample → 210s)
    let timeout_secs = 120 + (file_size_mb * 30.0) as u64;
    println!("[Worker] Transcribing: {} ({:.1} MB after downsample, timeout {}s)", audio_path, file_size_mb, timeout_secs);

    // Build multipart form for server proxy
    let file_part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name("recording.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to build multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("audio", file_part);

    let url = format!("{}/api/tray/proxy/transcribe", client.server_url());
    let res = client.http_client()
        .post(&url)
        .headers(client.auth_headers())
        .multipart(form)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .send()
        .await
        .map_err(|e| format!("Transcribe request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        if status == 429 || body.contains("trial_expired") {
            return Err(format!("429: {}", body));
        }
        return Err(format!("Transcribe API error ({}): {}", status, body));
    }

    let data: serde_json::Value = res.json().await
        .map_err(|e| format!("Failed to parse transcribe response: {}", e))?;

    let raw_transcript = data["text"].as_str().unwrap_or("").to_string();
    let duration = data["duration"].as_f64().unwrap_or(0.0);

    if raw_transcript.is_empty() {
        println!("[Worker] Transcription returned empty text — skipping triage");
        db.update_raw_item_status(raw_item_id, "ignored", Some("{\"reason\": \"empty_transcript\"}"))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Polish transcript with LLM — fix grammar, punctuation, filler words, structure
    let transcript = polish_transcript(client, &raw_transcript).await
        .unwrap_or_else(|e| {
            eprintln!("[Worker] Transcript polish failed (using raw): {}", e);
            raw_transcript.clone()
        });

    // Update raw item content with the polished transcript
    db.update_raw_item_content(raw_item_id, &transcript)
        .map_err(|e| format!("Failed to update raw item content: {}", e))?;

    // Update metadata with transcript info
    let raw_item = db.get_raw_item_by_id(raw_item_id)
        .map_err(|e| format!("Raw item not found: {}", e))?;
    let mut meta: serde_json::Value = raw_item.metadata
        .as_deref()
        .and_then(|m| serde_json::from_str(m).ok())
        .unwrap_or(serde_json::json!({}));
    meta["transcript_duration"] = serde_json::json!(duration);
    meta["transcript_words"] = serde_json::json!(transcript.split_whitespace().count());
    db.update_raw_item_status(raw_item_id, "pending", Some(&meta.to_string()))
        .map_err(|e| e.to_string())?;

    // Queue triage job — triage will extract meeting notes, decisions, action items
    let triage_payload = serde_json::json!({ "raw_item_id": raw_item_id }).to_string();
    db.queue_job("triage", &triage_payload).map_err(|e| e.to_string())?;

    // Clean up WAV file after successful transcription
    if let Err(e) = std::fs::remove_file(audio_path) {
        eprintln!("[Worker] Warning: failed to delete WAV file: {}", e);
    }

    println!("[Worker] Transcribed: {} words in {:.0}s → queued triage", transcript.split_whitespace().count(), duration);

    Ok(())
}

/// Polish a raw Whisper transcript using the LLM.
/// Fixes grammar, punctuation, removes filler words, and structures into paragraphs.
async fn polish_transcript(client: &AiClient, raw: &str) -> Result<String, String> {
    let word_count = raw.split_whitespace().count();
    // Skip polishing for very short transcripts (not worth the API call)
    if word_count < 20 {
        return Ok(raw.to_string());
    }

    let system = "You are a transcript editor. Clean up this raw speech-to-text transcript. \
        Fix grammar and punctuation. Remove filler words (um, uh, like, you know). \
        Remove repeated words/phrases from speech disfluency. \
        Break into natural paragraphs by topic. \
        Do NOT add information that wasn't said. Do NOT summarize — keep all substantive content. \
        Return ONLY the cleaned transcript text, nothing else.";

    // For very long transcripts, truncate to avoid token limits
    let input = if word_count > 3000 {
        let truncated: String = raw.split_whitespace().take(3000).collect::<Vec<_>>().join(" ");
        format!("{}\n\n[transcript continues...]", truncated)
    } else {
        raw.to_string()
    };

    let polished = client.generate_text(system, &input).await?;

    // Sanity check: polished should be at least 30% of original length
    if polished.split_whitespace().count() < word_count / 3 {
        eprintln!("[Worker] Polish output suspiciously short ({} vs {} words), using raw",
            polished.split_whitespace().count(), word_count);
        return Ok(raw.to_string());
    }

    println!("[Worker] Polished transcript: {} → {} words", word_count, polished.split_whitespace().count());
    Ok(polished)
}

/// Downsample a WAV file to mono 16kHz 16-bit (what Whisper expects).
/// Processes in chunks to avoid loading the entire file into memory.
fn downsample_wav(path: &str) -> Result<Vec<u8>, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open WAV {}: {}", path, e))?;

    let spec = reader.spec();
    let src_rate = spec.sample_rate;
    let src_channels = spec.channels as usize;
    let target_rate: u32 = 16000;
    let original_mb = std::fs::metadata(path).map(|m| m.len() as f64 / (1024.0 * 1024.0)).unwrap_or(0.0);

    // Estimate output size for pre-allocation (avoid repeated reallocs)
    let total_samples = reader.len() as usize;
    let mono_samples = total_samples / src_channels;
    let out_samples = if src_rate != target_rate {
        (mono_samples as f64 * target_rate as f64 / src_rate as f64) as usize
    } else {
        mono_samples
    };
    // Output WAV bytes: header (44) + samples * 2 bytes each
    let estimated_bytes = 44 + out_samples * 2;

    let out_spec = hound::WavSpec {
        channels: 1,
        sample_rate: target_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut buf = std::io::Cursor::new(Vec::with_capacity(estimated_bytes));
    let mut writer = hound::WavWriter::new(&mut buf, out_spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    // Process in chunks: read raw samples, mix to mono, resample, write — one chunk at a time
    // Chunk size: 1 second of source audio (keeps peak memory to ~200KB per chunk)
    let chunk_frames = src_rate as usize; // 1 second worth of frames
    let chunk_samples = chunk_frames * src_channels;

    // Resample state: carry fractional position across chunks
    let ratio = if src_rate != target_rate { src_rate as f64 / target_rate as f64 } else { 1.0 };
    let needs_resample = src_rate != target_rate;
    let mut resample_pos: f64 = 0.0; // fractional position into current mono chunk
    let mut prev_sample: i16 = 0; // last sample from previous chunk for interpolation

    // Read samples as i16 iterator
    let all_samples: Vec<i16> = match spec.sample_format {
        hound::SampleFormat::Int => {
            reader.into_samples::<i16>().filter_map(|s| s.ok()).collect()
        }
        hound::SampleFormat::Float => {
            reader.into_samples::<f32>()
                .filter_map(|s| s.ok())
                .map(|s| (s * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16)
                .collect()
        }
    };

    // Process in chunks to avoid creating multiple full-size buffers
    for raw_chunk in all_samples.chunks(chunk_samples) {
        // Mix to mono in-place (no separate allocation)
        let mono_len = raw_chunk.len() / src_channels;
        if needs_resample {
            // Resample with linear interpolation, streaming across chunks
            while resample_pos < mono_len as f64 {
                let idx = resample_pos as usize;
                let frac = resample_pos - idx as f64;
                let s0 = if idx == 0 && resample_pos < 1.0 {
                    // Use prev_sample from last chunk for continuity
                    let current = mono_sample(raw_chunk, 0, src_channels);
                    ((prev_sample as f64) + frac * (current as f64 - prev_sample as f64)) as i16
                } else {
                    let a = mono_sample(raw_chunk, idx.min(mono_len - 1), src_channels) as f64;
                    let b = mono_sample(raw_chunk, (idx + 1).min(mono_len - 1), src_channels) as f64;
                    (a + frac * (b - a)) as i16
                };
                let _ = writer.write_sample(s0);
                resample_pos += ratio;
            }
            resample_pos -= mono_len as f64; // carry remainder to next chunk
            if mono_len > 0 {
                prev_sample = mono_sample(raw_chunk, mono_len - 1, src_channels);
            }
        } else {
            // No resampling needed, just write mono samples
            for i in 0..mono_len {
                let _ = writer.write_sample(mono_sample(raw_chunk, i, src_channels));
            }
        }
    }

    writer.finalize().map_err(|e| format!("WAV finalize error: {}", e))?;

    let new_mb = buf.get_ref().len() as f64 / (1024.0 * 1024.0);
    println!("[Worker] Downsampled WAV: {:.1} MB → {:.1} MB (mono 16kHz)", original_mb, new_mb);

    Ok(buf.into_inner())
}

/// Get a mono sample from interleaved multi-channel data at frame index `i`.
#[inline]
fn mono_sample(data: &[i16], frame: usize, channels: usize) -> i16 {
    if channels == 1 {
        data[frame]
    } else {
        let start = frame * channels;
        let end = (start + channels).min(data.len());
        let sum: i32 = data[start..end].iter().map(|&s| s as i32).sum();
        (sum / channels as i32) as i16
    }
}
