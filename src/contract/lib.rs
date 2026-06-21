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

impl Guest for Component {
    fn investigate_logs(_req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: investigate-logs");
        
        let result_json = serde_json::json!({
            "status": "success",
            "log_summary": "DB Connection Pool Exhaustion found",
            "details": "Connection pool exhausted (max=20, active=20) at baseline: 800 req/min"
        });
        
        serde_json::to_vec(&result_json).map_err(|e| e.to_string())
    }

    fn create_fix_pr(_req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: create-fix-pr");
        
        let token_resolved = match get_secret_key("github_token") {
            Ok(token) => format!("resolved (len: {})", token.len()),
            Err(e) => format!("failed: {}", e)
        };
        info(&format!("GitHub token status: {}", token_resolved));
        
        let response_payload = serde_json::json!({
            "status": "pr_created",
            "pr_url": "https://github.com/Starlight-Local/department-of-incidents/pull/42",
            "pr_number": 42,
            "branch": "fix/db-pool-exhaustion",
            "token_status": token_resolved
        });
        
        serde_json::to_vec(&response_payload).map_err(|e| e.to_string())
    }

    fn merge_fix(_req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: merge-fix");
        
        let token_resolved = match get_secret_key("github_token") {
            Ok(token) => format!("resolved (len: {})", token.len()),
            Err(e) => format!("failed: {}", e)
        };
        info(&format!("GitHub token status for merge: {}", token_resolved));
        
        let response_payload = serde_json::json!({
            "status": "success",
            "sha": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1d0e",
            "token_status": token_resolved
        });
        
        serde_json::to_vec(&response_payload).map_err(|e| e.to_string())
    }

    fn revert_commit(_req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: revert-commit");
        
        let response_payload = serde_json::json!({
            "status": "reverted",
            "revert_sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
        });
        
        serde_json::to_vec(&response_payload).map_err(|e| e.to_string())
    }

    fn get_secret(req: GenericInput) -> Result<Vec<u8>, String> {
        info("TEE executing function: get-secret");
        let key_bytes = req.input.ok_or_else(|| "Missing key input".to_string())?;
        let key = String::from_utf8(key_bytes).map_err(|e| format!("Invalid UTF-8 key: {}", e))?;
        
        let secret = get_secret_key(&key)?;
        Ok(secret.into_bytes())
    }
}

export!(Component);
