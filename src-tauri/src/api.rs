use serde_json::json;

/// Capture text as a new memory via the Reattend API
pub async fn capture(
    api_url: &str,
    token: &str,
    text: &str,
    source: &str,
    metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    let mut body = json!({
        "text": text,
        "source": source,
    });
    if let Some(meta) = metadata {
        body["metadata"] = meta;
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/tray/capture", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["id"].as_str().unwrap_or("").to_string())
}

/// Search memories via the Reattend API
pub async fn search(api_url: &str, token: &str, query: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tray/search", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("q", query), ("limit", "5")])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    resp.json().await.map_err(|e| e.to_string())
}

/// Ask AI a question about memories
pub async fn ask(api_url: &str, token: &str, question: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/tray/ask", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "question": question }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    resp.text().await.map_err(|e| e.to_string())
}

/// Analyze screen text for ambient suggestions
pub async fn analyze(
    api_url: &str,
    token: &str,
    screen_text: &str,
    app_name: &str,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/tray/analyze", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "screen_text": screen_text,
            "app_name": app_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    resp.json().await.map_err(|e| e.to_string())
}
