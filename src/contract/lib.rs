wit_bindgen::generate!({
    world: "department-of-incidents",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

use crate::host::tenant::tenant_context::tenant_did;
use crate::host::interfaces::logging::info;
use crate::host::interfaces::kv_store::get;
use crate::host::interfaces::http;
use crate::exports::z::department_of_incidents::contracts::{Guest, GenericInput};

struct Component;

// Helper to retrieve namespaced secret from z:<tid>:secrets
fn get_secret_key(key: &str) -> Result<String, String> {
    let tid = tenant_did();
    let map_name = format!("z:{}:secrets", hex::encode(&tid));
    
    info(&format!("Contract reading from private KV map: {}", map_name));
    
    let bytes = get(&map_name, key.as_bytes())
        .map_err(|e| format!("KV Read Error: {}", e))?
        .ok_or_else(|| format!("Key '{}' not found in {}", key, map_name))?;
        
    String::from_utf8(bytes).map_err(|e| format!("Encoding Error: {}", e))
}

// Dependency-free Base64 Encoder
fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(data.len() * 4 / 3 + 4);
    let mut buffer = 0u32;
    let mut bits = 0;
    for &byte in data {
        buffer = (buffer << 8) | byte as u32;
        bits += 8;
        while bits >= 6 {
            bits -= 6;
            let index = ((buffer >> bits) & 0x3F) as usize;
            result.push(CHARSET[index] as char);
        }
    }
    if bits > 0 {
        buffer <<= 6 - bits;
        let index = (buffer & 0x3F) as usize;
        result.push(CHARSET[index] as char);
    }
    while result.len() % 4 != 0 {
        result.push('=');
    }
    result
}

// Helper to make an HTTP request
fn http_request(
    method: http::Verb,
    url: &str,
    headers: Option<Vec<(String, String)>>,
    payload: Option<Vec<u8>>,
) -> Result<http::Response, String> {
    let req = http::Request {
        method,
        url: url.to_string(),
        headers,
        payload,
    };
    http::call(&req)
}

fn github_headers(token: &str) -> Vec<(String, String)> {
    vec![
        ("Authorization".to_string(), format!("token {}", token)),
        ("User-Agent".to_string(), "Terminal3-ADK-Guest".to_string()),
        ("Accept".to_string(), "application/vnd.github.v3+json".to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
    ]
}

fn aws_placeholder_call() -> Result<String, String> {
    use crate::host::interfaces::http_with_placeholders;

    let url = "https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances";
    let headers = vec![
        ("X-Aws-Access-Key".to_string(), "{{profile.aws_access_key_id}}".to_string()),
        ("X-Aws-Secret-Key".to_string(), "{{profile.aws_secret_access_key}}".to_string()),
        ("Content-Type".to_string(), "application/xml".to_string()),
    ];
    let req = http_with_placeholders::Request {
        method: "GET".to_string(),
        url: url.to_string(),
        headers: Some(headers),
        body: None,
    };
    match http_with_placeholders::call(&req) {
        Ok(resp) => Ok(format!("AWS HTTP code: {}", resp.code)),
        Err(e) => Err(format!("{:?}", e)),
    }
}

impl Guest for Component {
    fn investigate_logs(req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: investigate-logs");
        let input_bytes = req.input.ok_or_else(|| "Missing input".to_string())?;
        let input_json: serde_json::Value = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Invalid JSON input: {}", e))?;

        // Extract system prompt, user prompt, and model from input
        let system_prompt = input_json["system_prompt"].as_str().unwrap_or("");
        let user_prompt = input_json["user_prompt"].as_str().unwrap_or("");
        let model = input_json["model"].as_str().unwrap_or("llama-3.3-70b-versatile");

        if system_prompt == "aws:remediate" {
            info("[TEE Enclave] Executing cost anomaly remediation in enclave via placeholder injection...");
            match aws_placeholder_call() {
                Ok(msg) => info(&format!("[TEE Enclave] {}", msg)),
                Err(e) => info(&format!("[TEE Enclave] AWS Placeholder HTTP failed: {}", e)),
            }
            let res = serde_json::json!({ "executed": true, "command": user_prompt });
            return serde_json::to_vec(&res).map_err(|e| e.to_string());
        }

        // Try to read Groq API Key
        let groq_key = get_secret_key("groq_api_key").unwrap_or_default();

        // Check if we should use mock fallback (for demo safety or insufficient credentials)
        if groq_key.is_empty() || groq_key.starts_with("gsk_mock") {
            info("[TEE Enclave] Warning: No real Groq key. Using enclave simulation fallback.");
            
            // Check context to return the correct mock JSON format
            let mock_res = if system_prompt.contains("systems engineer") {
                serde_json::json!({
                    "rootCause": "Database Connection Pool Exhaustion found",
                    "patch": "// Production Gateway Database Connection Pool Init\nconst { Pool } = require(\"pg\");\n\nconst poolConfig = {\n  host: \"localhost\",\n  port: 5432,\n  database: \"production_db\",\n  // Database connection limit\n  max: 50,\n  idleTimeoutMillis: 10000,\n  connectionTimeoutMillis: 2000,\n};\n\nconst dbPool = new Pool(poolConfig);\n\nmodule.exports = { dbPool, poolConfig };\n",
                    "explanation": "Connection pool exhausted (max=20, active=20) at baseline: 800 req/min. Upgraded connection limit to 50."
                })
            } else if system_prompt.contains("security engineer") {
                serde_json::json!({
                    "rootCause": "Express open redirect vulnerability allows parameter injection",
                    "patch": "# Upgrade express to version 4.19.2",
                    "explanation": "Semver upgrade express from 4.18.2 to 4.19.2 is safe.",
                    "upgradeCommand": "npm install express@4.19.2"
                })
            } else if system_prompt.contains("runbook parser") {
                serde_json::json!({
                    "steps": [
                        { "index": 1, "description": "Check current memory usage: free -h", "type": "diagnostic", "requiresApproval": false },
                        { "index": 2, "description": "Identify top memory consumers: ps aux --sort=-%mem | head -20", "type": "diagnostic", "requiresApproval": false },
                        { "index": 3, "description": "Restart PostgreSQL replica: sudo systemctl restart postgresql-replica", "type": "restart", "requiresApproval": true },
                        { "index": 4, "description": "Verify replication lag: psql -c 'SELECT now() - pg_last_xact_replay_timestamp()'", "type": "verification", "requiresApproval": false },
                        { "index": 5, "description": "Check connection pool status: ss -s", "type": "verification", "requiresApproval": false }
                    ]
                })
            } else {
                // Cost analyst
                serde_json::json!({
                    "remediations": [
                        {
                            "resourceId": "i-0abc123def456789",
                            "service": "Amazon EC2",
                            "action": "rightsize",
                            "estimatedSaving": 736,
                            "reasoning": "Instance showing very low CPU usage but high cost. Rightsizing recommended.",
                            "awsCommand": "aws ec2 modify-instance-attribute --instance-id i-0abc123def456789 --instance-type t3.medium"
                        }
                    ]
                })
            };
            return serde_json::to_vec(&mock_res).map_err(|e| e.to_string());
        }

        // Real Groq API execution inside enclave
        info("[TEE Enclave] Querying Groq API directly from enclave...");
        let groq_url = "https://api.groq.com/openai/v1/chat/completions";
        let headers = vec![
            ("Authorization".to_string(), format!("Bearer {}", groq_key)),
            ("Content-Type".to_string(), "application/json".to_string()),
        ];
        
        let request_body = serde_json::json!({
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "model": model,
            "response_format": { "type": "json_object" }
        });
        
        let payload = serde_json::to_vec(&request_body).map_err(|e| e.to_string())?;
        
        let resp = http_request(http::Verb::Post, groq_url, Some(headers), Some(payload))?;
        
        if resp.code != 200 {
            return Err(format!("Groq API failed with HTTP {}: {}", resp.code, String::from_utf8_lossy(&resp.payload)));
        }
        
        let res_json: serde_json::Value = serde_json::from_slice(&resp.payload)
            .map_err(|e| format!("Invalid Groq JSON response: {}", e))?;
            
        let content_str = res_json["choices"][0]["message"]["content"].as_str()
            .ok_or_else(|| "Empty choices content from Groq response".to_string())?;
            
        Ok(content_str.as_bytes().to_vec())
    }

    fn create_fix_pr(req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: create-fix-pr");
        let input_bytes = req.input.ok_or_else(|| "Missing input".to_string())?;
        let input_json: serde_json::Value = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Invalid JSON input: {}", e))?;

        let repo = input_json["repo"].as_str().ok_or_else(|| "Missing repo parameter".to_string())?;
        let branch = input_json["branch"].as_str().ok_or_else(|| "Missing branch parameter".to_string())?;
        let patch = input_json["patch"].as_str().ok_or_else(|| "Missing patch parameter".to_string())?;
        let sha = input_json["sha"].as_str().ok_or_else(|| "Missing base sha parameter".to_string())?;
        let path = input_json["path"].as_str().unwrap_or("app_service.js");

        let token = get_secret_key("github_token").unwrap_or_default();

        if token.is_empty() || token.starts_with("ghp_mock") {
            info("[TEE Enclave] Warning: No real GitHub token. Simulating PR creation.");
            let pr_number = 100 + (sha.as_bytes().iter().map(|&b| b as u64).sum::<u64>() % 900);
            let mock_res = serde_json::json!({
                "status": "pr_created",
                "pr_url": format!("https://github.com/{}/pull/{}", repo, pr_number),
                "pr_number": pr_number,
                "branch": branch.to_string(),
                "token_status": "mocked"
            });
            return serde_json::to_vec(&mock_res).map_err(|e| e.to_string());
        }

        info("[TEE Enclave] Creating Pull Request on GitHub directly from enclave...");
        let gh_headers = github_headers(&token);

        // Step 1: Create the branch ref
        let ref_url = format!("https://api.github.com/repos/{}/git/refs", repo);
        let ref_body = serde_json::json!({
            "ref": format!("refs/heads/{}", branch),
            "sha": sha
        });
        let ref_resp = http_request(http::Verb::Post, &ref_url, Some(gh_headers.clone()), Some(serde_json::to_vec(&ref_body).unwrap()))?;
        if ref_resp.code != 201 {
            info(&format!("[TEE Warning] Branch creation code: {} (likely already exists). Proceeding.", ref_resp.code));
        }

        // Step 2: Write/Commit the patched file contents
        let contents_url = format!("https://api.github.com/repos/{}/contents/{}", repo, path);
        // Get the current file's blob SHA first if it exists
        let mut file_sha = String::new();
        let get_url = format!("{}?ref=main", contents_url);
        if let Ok(get_resp) = http_request(http::Verb::Get, &get_url, Some(gh_headers.clone()), None) {
            if get_resp.code == 200 {
                if let Ok(get_val) = serde_json::from_slice::<serde_json::Value>(&get_resp.payload) {
                    if let Some(s) = get_val["sha"].as_str() {
                        file_sha = s.to_string();
                    }
                }
            }
        }

        let commit_body = serde_json::json!({
            "message": "fix: apply automated security remediation patch",
            "content": base64_encode(patch.as_bytes()),
            "branch": branch,
            "sha": if file_sha.is_empty() { None } else { Some(file_sha) }
        });
        let commit_resp = http_request(http::Verb::Put, &contents_url, Some(gh_headers.clone()), Some(serde_json::to_vec(&commit_body).unwrap()))?;
        if commit_resp.code != 200 && commit_resp.code != 201 {
            return Err(format!("Failed to commit patched file: HTTP {}: {}", commit_resp.code, String::from_utf8_lossy(&commit_resp.payload)));
        }

        // Step 3: Open Pull Request
        let pr_url = format!("https://api.github.com/repos/{}/pulls", repo);
        let pr_body = serde_json::json!({
            "title": format!("fix: increase connection pool limit on {}", path),
            "head": branch,
            "base": "main",
            "body": "Automatically created by TEE-secured Department of Incidents Commander."
        });
        let pr_resp = http_request(http::Verb::Post, &pr_url, Some(gh_headers.clone()), Some(serde_json::to_vec(&pr_body).unwrap()))?;
        if pr_resp.code != 201 {
            return Err(format!("Failed to create GitHub PR: HTTP {}: {}", pr_resp.code, String::from_utf8_lossy(&pr_resp.payload)));
        }

        let pr_val: serde_json::Value = serde_json::from_slice(&pr_resp.payload)
            .map_err(|e| format!("Failed to parse PR response: {}", e))?;

        let res = serde_json::json!({
            "status": "pr_created",
            "pr_url": pr_val["html_url"].as_str().unwrap_or(""),
            "pr_number": pr_val["number"].as_u64().unwrap_or(0),
            "branch": branch.to_string(),
            "token_status": "real"
        });

        serde_json::to_vec(&res).map_err(|e| e.to_string())
    }

    fn merge_fix(req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: merge-fix");
        let input_bytes = req.input.ok_or_else(|| "Missing input".to_string())?;
        let input_json: serde_json::Value = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Invalid JSON input: {}", e))?;

        let repo = input_json["repo"].as_str().ok_or_else(|| "Missing repo parameter".to_string())?;
        let pr_number = input_json["pr_number"].as_u64().ok_or_else(|| "Missing pr_number parameter".to_string())?;

        let token = get_secret_key("github_token").unwrap_or_default();

        if token.is_empty() || token.starts_with("ghp_mock") {
            info("[TEE Enclave] Warning: No real GitHub token. Simulating PR merge.");
            let mock_sha = format!("{:040x}", pr_number);
            let mock_res = serde_json::json!({
                "status": "success",
                "sha": mock_sha,
                "token_status": "mocked"
            });
            return serde_json::to_vec(&mock_res).map_err(|e| e.to_string());
        }

        info("[TEE Enclave] Merging Pull Request directly from enclave...");
        let gh_headers = github_headers(&token);

        let merge_url = format!("https://api.github.com/repos/{}/pulls/{}/merge", repo, pr_number);
        let merge_body = serde_json::json!({
            "merge_method": "merge"
        });

        let merge_resp = http_request(http::Verb::Put, &merge_url, Some(gh_headers), Some(serde_json::to_vec(&merge_body).unwrap()))?;
        if merge_resp.code != 200 {
            return Err(format!("Failed to merge PR on GitHub: HTTP {}: {}", merge_resp.code, String::from_utf8_lossy(&merge_resp.payload)));
        }

        let merge_val: serde_json::Value = serde_json::from_slice(&merge_resp.payload)
            .map_err(|e| format!("Failed to parse merge response: {}", e))?;

        let res = serde_json::json!({
            "status": "success",
            "sha": merge_val["sha"].as_str().unwrap_or(""),
            "token_status": "real"
        });

        serde_json::to_vec(&res).map_err(|e| e.to_string())
    }

    fn revert_commit(req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: revert-commit");
        let input_bytes = req.input.ok_or_else(|| "Missing input".to_string())?;
        let input_json: serde_json::Value = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Invalid JSON input: {}", e))?;

        let repo = input_json["repo"].as_str().ok_or_else(|| "Missing repo parameter".to_string())?;
        let revert_file_content = input_json["revert_file_content"].as_str().ok_or_else(|| "Missing revert_file_content parameter".to_string())?;
        let path = input_json["path"].as_str().unwrap_or("app_service.js");

        let token = get_secret_key("github_token").unwrap_or_default();

        if token.is_empty() || token.starts_with("ghp_mock") {
            info("[TEE Enclave] Warning: No real GitHub token. Simulating revert commit.");
            let mock_sha = format!("{:040x}", revert_file_content.len());
            let mock_res = serde_json::json!({
                "status": "reverted",
                "revert_sha": mock_sha
            });
            return serde_json::to_vec(&mock_res).map_err(|e| e.to_string());
        }

        info("[TEE Enclave] Reverting main branch directly via GitHub contents API...");
        let gh_headers = github_headers(&token);

        let contents_url = format!("https://api.github.com/repos/{}/contents/{}", repo, path);
        // Get the current file's blob SHA on main
        let mut file_sha = String::new();
        let get_url = format!("{}?ref=main", contents_url);
        let get_resp = http_request(http::Verb::Get, &get_url, Some(gh_headers.clone()), None)?;
        if get_resp.code == 200 {
            if let Ok(get_val) = serde_json::from_slice::<serde_json::Value>(&get_resp.payload) {
                if let Some(s) = get_val["sha"].as_str() {
                    file_sha = s.to_string();
                }
            }
        }

        if file_sha.is_empty() {
            return Err("Cannot revert file: app_service.js does not exist on main branch".to_string());
        }

        let commit_body = serde_json::json!({
            "message": "revert: rollback automated database pool patch due to canary regression",
            "content": base64_encode(revert_file_content.as_bytes()),
            "branch": "main",
            "sha": file_sha
        });

        let commit_resp = http_request(http::Verb::Put, &contents_url, Some(gh_headers), Some(serde_json::to_vec(&commit_body).unwrap()))?;
        if commit_resp.code != 200 {
            return Err(format!("Failed to revert commit: HTTP {}: {}", commit_resp.code, String::from_utf8_lossy(&commit_resp.payload)));
        }

        let commit_val: serde_json::Value = serde_json::from_slice(&commit_resp.payload)
            .map_err(|e| format!("Failed to parse revert commit response: {}", e))?;

        let res = serde_json::json!({
            "status": "reverted",
            "revert_sha": commit_val["commit"]["sha"].as_str().unwrap_or("")
        });

        serde_json::to_vec(&res).map_err(|e| e.to_string())
    }
}

export!(Component);
