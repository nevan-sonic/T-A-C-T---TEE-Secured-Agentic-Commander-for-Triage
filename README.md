<p align="center">
  <img src="./public/banner.svg" alt="T.A.C.T. Banner" width="100%">
</p>

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

[![Terminal 3 Testnet](https://img.shields.io/badge/T3N_Testnet-Active-success?style=for-the-badge&logo=ethereum&color=10B981)](https://docs.terminal3.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge&color=0EA5E9)](https://opensource.org/licenses/MIT)
[![Groq Llama 3.3](https://img.shields.io/badge/AI_Engine-Llama_3.3_70B-purple?style=for-the-badge&logo=meta&color=8B5CF6)](https://groq.com)
[![Rust WebAssembly](https://img.shields.io/badge/TEE_Contract-Rust_WASM-orange?style=for-the-badge&logo=rust&color=F97316)](https://github.com/webassembly)

**T.A.C.T.** is a fully functional, real-time site reliability incident responder designed for next-generation automated infrastructure operations. 

When a production outage alert fires, T.A.C.T. automatically establishes a secure session handshake, triages incident severity, diagnoses logs using **Llama 3.3 (via Groq)**, drafts a patch file, and routes cryptographic EIP-191 approvals to on-call engineers. Merges and rollback actions are securely executed inside a **TEE hardware enclave simulator** and logged permanently onto an **Immutable Cryptographic Audit Ledger**, keeping sensitive keys and PII completely private.

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 📽️ Interactive Web Control Center
T.A.C.T. comes with a premium glassmorphic control center dashboard where you can trigger incidents, sign transactions cryptographically, and inspect live enclave execution logs:
👉 **[http://localhost:3000](http://localhost:3000)**

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 🛠️ System Architecture & Execution Flow

Below is the cryptographic lifecycle of an incident resolution cycle managed by T.A.C.T.:

```mermaid
sequenceDiagram
    autonumber
    participant APM as APM / Alerts
    participant Orchestrator as T.A.C.T. Agent Core
    participant TEE as T3N Secure Enclave
    participant LLM as Groq AI (Llama 3.3)
    participant UI as MetaMask / Web3 Dashboard
    participant Git as GitHub Remote Repo

    APM->>Orchestrator: 1. Trigger Incident Alert (e.g., P1 / P2)
    Orchestrator->>TEE: 2. Establish Session (Handshake)
    Orchestrator->>TEE: 3. Authenticate Logs Read & executeAndDecode(investigate-logs)
    Orchestrator->>LLM: 4. Analyze Logs & Classify Severity (LOW / MEDIUM / HIGH)
    LLM-->>Orchestrator: Root Cause + Configuration Patch Proposal
    Orchestrator->>TEE: 5. Draft PR & Apply Config Patch (executeAndDecode/create-fix-pr)
    Orchestrator->>UI: 6. Await Cryptographic Signatures (EIP-191 Challenge)
    UI->>TEE: 7. Post Recovered signature proof to Enclave
    TEE->>TEE: 8. Cryptographic Identity & ACL Check
    Orchestrator->>TEE: 9. Merge PR (executeAndDecode/merge-fix)
    TEE->>Git: 10. Merge branch & Fetch remote Merge SHA
    TEE->>Orchestrator: PR Merged Successfully
    Orchestrator->>Orchestrator: 11. Run Telemetry Check
    alt Regression Detected (HIGH Severity)
        Orchestrator->>UI: 12. Rollback Approval Challenge (Scope: revert-commit)
        UI->>TEE: 13. Submit signature challenge proof
        Orchestrator->>TEE: 14. Execute Rollback (executeAndDecode/revert-commit)
        TEE->>Git: 15. git revert -m 1 & Push to remote main
    end
```

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 🗝️ Terminal 3 SDK Integration Index

Every secure action in T.A.C.T. translates directly to a Terminal 3 ADK primitive:

### 1. Enclave Handshake
Establishes session keys between the client orchestrator and the TEE hardware sandbox.
* **SDK Wrapper:** [src/sdk-wrapper/t3-agent.ts#L96](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/t3-agent.ts#L96) (`handshake()`)
* **Agent Core:** [src/orchestrator/agent-core.ts#L94](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts#L94) (`const session = await agent.handshake();`)

### 2. Session Authentication
Authenticates the active session keys.
* **SDK Wrapper:** [src/sdk-wrapper/t3-agent.ts#L110](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/t3-agent.ts#L110) (`authenticate()`)
* **Agent Core:** [src/orchestrator/agent-core.ts#L99](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts#L99) (`await agent.authenticate({ session })`)

### 3. Guest WASM Contract Publication
Registers the compiled guest WASM component under the tenant's secure z-namespace.
* **SDK Wrapper:** [src/sdk-wrapper/t3-agent.ts#L32](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/t3-agent.ts#L32) (`client.contracts.publish()`)
* **Agent Core:** [src/orchestrator/agent-core.ts#L20](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts#L20) (`await client.contracts.publish({ script_name, script_version, wasm_binary_path, functions })`)

### 4. Secure Enclave Execution (`executeAndDecode`)
Invokes exported functions (`investigate-logs`, `create-fix-pr`, `merge-fix`, `revert-commit`) inside the isolated WASM guest contract boundary.
* **SDK Wrapper:** [src/sdk-wrapper/t3-agent.ts#L115](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/t3-agent.ts#L115) (`executeAndDecode()`)
* **Agent Core:** [src/orchestrator/agent-core.ts#L105](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts#L105) (`await agent.executeAndDecode({ script_name, script_version, function_name, input })`)

### 5. Tamper-Proof Audit Ledger (`client.maps`)
Permanently appends immutable transaction steps and audit logs to the T3 `client.maps` store structure under the `z:<tid>:audit-ledger` KV namespace.
* **SDK Wrapper:** [src/sdk-wrapper/t3-agent.ts#L57](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/t3-agent.ts#L57) (`client.maps.set()`)
* **Agent Core:** [src/orchestrator/agent-core.ts#L113](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts#L113) (`await agent.audit.write({ action, actor, incidentId })`)

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 📂 Source Code Directory

* [wit/world.wit](file:///c:/Users/Nevan/Desktop/Starlight/wit/world.wit) — Defines the WASI contract interface boundaries (`kv-store`, `logging`, `http`, `tenant-context`).
* [src/contract/lib.rs](file:///c:/Users/Nevan/Desktop/Starlight/src/contract/lib.rs) — The Rust TEE Contract. Exposes core APIs (`investigate-logs`, `create-fix-pr`, `merge-fix`, `revert-commit`).
* [src/sdk-wrapper/enclave-sim.ts](file:///c:/Users/Nevan/Desktop/Starlight/src/sdk-wrapper/enclave-sim.ts) — Simulated Intel TDX enclave running ledger memory, EIP-191 signatures, and z-namespace secret maps.
* [src/orchestrator/agent-core.ts](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/agent-core.ts) — SRE event orchestrator driving alerts, AI diagnostics, delegation, and rollback loops.
* [src/orchestrator/github.ts](file:///c:/Users/Nevan/Desktop/Starlight/src/orchestrator/github.ts) — Real Git / GitHub API integrations (commits, pushes, pull requests, merges, and hard resets).
* [server.js](file:///c:/Users/Nevan/Desktop/Starlight/server.js) — Express REST controller serving APIs for webhook alert dispatching, ledger audits, and approval signatures.
* [public/](file:///c:/Users/Nevan/Desktop/Starlight/public/) — Glassmorphic dashboard control center.

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 🚀 Installation & Quick Start

### Prerequisites
* **Node.js** >= 18
* **Rust** + Cargo with the compilation target `wasm32-wasip2`
* **Git** installed and configured in command prompt PATH.

### 1. Installation & Environment Configuration
Clone the repository, enter the workspace, and install dependencies:
```bash
npm install
```

Configure your `.env` file at the root. A pre-populated example is provided below:
```ini
T3N_API_KEY=0x616355559f3b9880cf878749d4d8b42f5b7c9147552ce03793de353f9d3ef00d
T3N_TENANT_DID=did:t3:tenant:c8eb415587d29e3155bb615149156b0ce5f2ecc5
GROQ_API_KEY=your_groq_api_key
GITHUB_REPO=nevan-sonic/T-A-C-T---TEE-Secured-Agentic-Commander-for-Triage
GITHUB_TOKEN=your_github_personal_access_token
SLACK_WEBHOOK_URL=your_slack_webhook_url
```

### 2. Build & Compile
Compile the TypeScript orchestrator and build the Rust WASM TEE Contract:
```bash
# Compile TypeScript to dist/
npm run compile

# Compile Rust contract WASM component targetting WASI p2
cargo build --target wasm32-wasip2 --release
```

### 3. Launch Dashboard
```bash
npm start
```
Navigate to **[http://localhost:3000](http://localhost:3000)**.

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 📡 Real-World APM Webhook Integration
In a production setting, the webhook endpoint `/api/webhook` is designed to be mapped directly to your live SRE monitoring tools. The server dynamically parses and auto-normalizes incoming payloads from the following formats:

### 1. Prometheus Alertmanager Webhook
Route standard Prometheus firings directly to `/api/webhook`. The system maps labels (e.g. `severity: critical`) and annotations to triaged severity states, extracting error metrics and log context automatically:
```json
{
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "DatabaseConnectionPoolExhausted",
        "severity": "critical",
        "service": "auth-service"
      },
      "annotations": {
        "summary": "Core database connection timeout",
        "description": "Out of memory crash, thread pool deadlock"
      },
      "startsAt": "2026-06-19T21:00:00Z"
    }
  ]
}
```

### 2. Datadog Webhook
Hook standard Datadog monitor notifications. The router extracts the service name from the alert title and translates warning/error status thresholds into equivalent gated enclave approval flows:
```json
{
  "id": "datadog-alert-101",
  "event_type": "query_alert_monitor",
  "alert_title": "Database pool size exhausted on auth-service",
  "body": "FATAL [auth] Out of memory crash, thread pool deadlock",
  "alert_status": "error"
}
```

<p align="center">
  <img src="./public/divider.svg" alt="Divider" width="100%">
</p>

## 🔍 Validation Walkthrough

### Test Case 1: Medium Outage (P2 Incident)
1. Select **DB Connection Pool (P2)** scenario and click **Trigger APM Alert**.
2. Handshake session completes and logs are triaged as `MEDIUM` severity (1 signature required from Bob).
3. Llama 3.3 analyzes the logs and drafts a patch fix to increase database pool size to 50 in `db_config.json`.
4. A branch is pushed, and PR is created on your remote GitHub repository.
5. In **Section 3: Approval Guard**, co-signature is requested.
6. Click **Confirm & Sign** (Metamask EIP-191 signatures are supported, with automatic fallback to secure developer private key).
7. The TEE validates the signature, performs a secure merge, and appends the immutable transaction record to the ledger.

### Test Case 2: Outage with Auto-Regression Rollback (P1 Incident)
1. Select **Gateway Failure (P1)** scenario and click **Trigger APM Alert**.
2. Triaged as `HIGH` severity. Routing rules require 2 signatures (Alice & Charlie).
3. Click **Confirm & Sign** for Alice and Charlie's cards.
4. The fix is merged remotely on GitHub. T.A.C.T. initiates a 5-second health telemetry monitoring phase.
5. Telemetry registers a post-merge latency regression. The orchestrator triggers an automatic rollback.
6. **Re-authentication:** Revert action triggers a fresh session. Alice is prompted for a rollback co-signature.
7. Click **Confirm & Sign**. The TEE executes `git revert` on the merge commit and pushes the reverted state back to remote `main`.

### Test Case 3: Manual Rollback
1. Review the newly added **Section 5: Active System Incidents** tracking board.
2. Select any resolved or merged incident and click **Manual Rollback**.
3. A fresh `repo:revert` delegation challenge instantly registers on the **Section 3: Approval Guard** panel.
4. Sign the challenge. The TEE reverts the configuration state and pushes it to GitHub, keeping your repo synchronized.
