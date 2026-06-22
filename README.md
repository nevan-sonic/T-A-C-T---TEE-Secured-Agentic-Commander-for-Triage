<p align="center">
  <img src="./public/banner.svg" alt="T.A.C.T. Banner" width="100%">
</p>



<div align="center">



<!-- Badges Row 1 -->
<p>
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/Rust-WASM-000000?style=for-the-badge&logo=rust&logoColor=white"/>
  <img src="https://img.shields.io/badge/Groq-Llama%203.3%2070B-F55036?style=for-the-badge&logo=meta&logoColor=white"/>
  <img src="https://img.shields.io/badge/Terminal%203-ADK-6C47FF?style=for-the-badge"/>
</p>

<!-- Badges Row 2 -->
<p>
  <img src="https://img.shields.io/badge/GitHub%20API-Octokit-181717?style=for-the-badge&logo=github&logoColor=white"/>
  <img src="https://img.shields.io/badge/EIP--191-Cryptographic%20Signatures-627EEA?style=for-the-badge&logo=ethereum&logoColor=white"/>
  <img src="https://img.shields.io/badge/TEE-Intel%20TDX%20Simulated-0071C5?style=for-the-badge&logo=intel&logoColor=white"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge"/>
</p>

<br/>

> **When production breaks at 3 AM — T.A.C.T. wakes up, not you.**
> 
> An AI-powered, cryptographically-secured SRE incident responder that triages, diagnoses, patches, collects approvals, merges, monitors, and rolls back — entirely inside a Trusted Execution Environment.

<br/>

</div>

---


## 🎥 Demo

<p align="center">
  <a href="https://youtu.be/dJdmmqwgfrY">
    <img src="https://img.youtube.com/vi/dJdmmqwgfrY/maxresdefault.jpg" alt="Demo Video">
  </a>
</p>

Click the thumbnail above to watch the demo.

> **Note to Judges:** The demo video shows execution against the **real Terminal 3 testnet**. If `T3N_API_KEY` is invalid, the contract is unregistered, or testnet fuel is exhausted, the system gracefully falls back to `enclave-sim.ts` (local simulation mode). The system logs clearly indicate `[T3N SDK] ⚠ GRACEFUL FALLBACK` or `Real testnet execution ... failed` when simulation mode activates.

---


## Bug Bounty Submission

See [BUG_REPORT.md](./BUG_REPORT.md) for the full list of bugs, broken links, and documentation gaps found in the Terminal 3 SDK, developer docs, and marketing site, submitted as part of the Terminal 3 Bug Discovery Bounty.

---


## ⚡ What Is T.A.C.T.?

**T.A.C.T.** is an autonomous incident response system that eliminates the gap between *alert fires* and *production healed*. When an outage hits, T.A.C.T. automatically:

- 🔍 **Diagnoses** logs with Llama 3.3 via Groq — inside a hardware enclave
- 🩹 **Drafts & validates** a code fix with malicious-pattern detection
- 🔀 **Creates a GitHub PR** from a clean branch with the patch applied
- ✍️ **Collects EIP-191 cryptographic signatures** from engineers via MetaMask
- 🔒 **Merges securely** inside the TEE after approval quorum is met
- 📊 **Monitors health** through a 30-second canary window
- ↩️ **Auto-rolls back** on regression — with a fresh signed credential

Every action is written to an **immutable audit ledger** on the Terminal 3 testnet — a tamper-proof cryptographic trail of who approved what, when, and what changed.

<p align="center">
  <img src="./public/canary-heartbeat.svg" alt="Canary Telemetry Heartbeat" width="320">
</p>

---


## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        T.A.C.T. SYSTEM                          │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │   FRONTEND   │    │     BACKEND      │    │  TEE / WASM   │  │
│  │              │    │                  │    │               │  │
│  │  React+Vite  │◄──►│  Express.js      │◄──►│  Rust → WASM  │  │
│  │  (Login)     │    │  (REST API)      │    │  (wasm32-     │  │
│  │              │    │                  │    │   wasip2)     │  │
│  │              │    │  Webhook Router  │    │               │  │
│  │  (Dashboard) │    │  Traffic Sim     │    │  Intel TDX    │  │
│  │              │    │                  │    │  Simulator    │  │
│  └──────────────┘    └──────────────────┘    └───────────────┘  │
│         ▲                    ▲                       ▲           │
│         │                   │                       │           │
│    Glassmorphic         Port 3000              KV Secrets       │
│    Control Center       REST API               Never Exposed    │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Role |
|:------|:-----------|:-----|
| 🖥️ **Frontend** | React + Vite · Vanilla JS Dashboard | Glassmorphic control center UI |
| ⚙️ **Backend** | Express.js (Node.js) | REST API server, webhook router, traffic simulator |
| 🔐 **TEE / Contract** | Rust → WASM (`wasm32-wasip2`) | Guest contract executed inside hardware enclave simulator |

---


## 🚀 Boot Sequence

When you run `node server.js`, the system initializes in strict order:

```
  ① Auto-Registration
     └─ Missing T3N_CONTRACT_ID? → deploy Rust WASM to Terminal 3 testnet
        └─ Billing failure? → graceful fallback to local simulation

  ② Module Loading
     └─ Loads compiled TypeScript from dist/
        ├─ Enclave Simulator
        ├─ Agent Core
        ├─ Audit Ledger
        ├─ CVE Handler
        ├─ Runbook Handler
        └─ Cost Handler

  ③ Secret Seeding
     └─ Creates private z-namespace KV store in enclave
        ├─ GitHub Token        ─┐
        ├─ Groq API Key         ├─ Never leave TEE boundary
        └─ AWS Credentials     ─┘

  ④ DID Setup
     └─ Derives canonical approver DID from T3N_API_KEY
        └─ Ethereum wallet address required for all approvals

  ⑤ Traffic Simulator
     └─ setInterval every 500ms → reads app_service.js dynamically
        ├─ pool max:20 → 85% errors + high latency
        └─ pool max:50 → healthy fast responses

  ⑥ Express Server
     └─ Port 3000
        ├─ /          → React login app
        └─ /dashboard → Glassmorphic control center
```

---


## 🎯 The 6 Trigger Types

<table>
<tr>
<td width="50%">

### 1️⃣ Manual APM Alert
`POST /api/webhook`

Auto-detects and normalizes payloads from:
- **Prometheus Alertmanager** — parses `alerts[].labels.severity`
- **Datadog** — parses `alert_title`, `alert_status`  
- **T.A.C.T. format** — direct `id/severity/logs`

All normalized → common `Alert` object → `handleIncident()`

</td>
<td width="50%">

### 2️⃣ Auto-Traffic Detection
*Background Monitor*

- `setInterval` checks error rate every **4 seconds**
- Error rate **> 45%** → auto-generates incident
- Runs in **auto-mode**: bypasses PR + approvals
- Directly patches `app_service.js`

</td>
</tr>
<tr>
<td>

### 3️⃣ GitHub CVE Webhook
`POST /api/github-webhook`

Handled by `cve-handler.ts`. Accepts:
- Dependabot alerts
- GitHub Security Advisory webhooks
- Manual CVE test payloads

</td>
<td>

### 4️⃣ PagerDuty / Opsgenie Runbook
`POST /api/pagerduty-webhook`

Handled by `runbook-handler.ts`. Parses incoming alerts into structured step-by-step runbooks with **per-step approval gating**.

</td>
</tr>
<tr>
<td>

### 5️⃣ AWS CloudWatch Cost Anomaly
`POST /api/cloudwatch-webhook`

Handled by `cost-handler.ts`. Accepts:
- SNS / CloudWatch alarms
- AWS Cost Anomaly Detection webhooks
- Manual test payloads

</td>
<td>

### 6️⃣ Manual Rollback
`POST /api/incidents/:id/rollback`

Any resolved/merged incident can be manually rolled back via the dashboard. Triggers a **fresh delegation challenge** — the approver must re-sign.

</td>
</tr>
</table>

---


## 🔄 The Incident Resolution Pipeline

> **9 steps. Zero human bottlenecks (unless severity requires it).**

<p align="center">
  <img src="./public/eip191-flow.svg" alt="Cryptographic Sign Flow" width="160">
</p>

```
APM Alert ──► Webhook ──► Normalize Payload ──► handleIncident()
                                                       │
                              ┌────────────────────────┘
                              ▼
                    ┌─────────────────┐
            Step 1  │  TEE Handshake  │  T3nClient auth · DID on-chain
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
            Step 2  │ Log Investigation│  Groq → Llama 3.3 inside enclave
                    │   (Inside TEE)  │  Returns: rootCause · patch · explanation
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
            Step 3  │ Patch Validation │  Score 0-100
                    │                 │  ✗ eval/child_process/fs.unlink → REJECT
                    │                 │  ✓ Score ≥ 70 → SAFE
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
            Step 4  │    Severity     │  LOW   → 0 approvals, auto-resolve
                    │ Classification  │  MEDIUM → 1 signature (code owner)
                    │   (via Groq)   │  HIGH  → 2 signatures + rollback ready
                    └────────┬────────┘
                             ▼
                 ┌───────────┴───────────┐
                 ▼                       ▼
         [Auto-Mode]               [Manual-Mode]
              │                         │
              │                ┌────────▼────────┐
              │        Step 5  │   Create PR      │  New branch · push · Octokit
              │                └────────┬────────┘
              │                         ▼
              │                ┌─────────────────┐
              │        Step 6  │ Approval Guard   │  EIP-191 · MetaMask
              │                │                 │  30-min timeout · poll/1s
              │                └────────┬────────┘
              │                         ▼
              │                ┌─────────────────┐
              │        Step 7  │  Secure Merge   │  executeUnder() in TEE
              │                │   (Inside TEE)  │  EIP-191 re-verification
              │                └────────┬────────┘
              │                         │
              └──────────┬──────────────┘
                         ▼
                ┌─────────────────┐
        Step 8  │  Canary Window  │  6 × 5s polls
                │                 │  < 10%  → ✅ Resolved
                │                 │  10-25% → ⚠️ Degraded (ok)
                │                 │  > 25%  → ❌ Regression!
                └────────┬────────┘
                         │
            ┌────────────┴───────────┐
            ▼                        ▼
       ✅ Healthy                ❌ Regression
    Resolve + Audit                  │
                            ┌────────▼────────┐
                    Step 9  │  Auto-Rollback  │  Fresh TEE session
                            │                 │  Re-sign · git revert
                            │                 │  Push to GitHub
                            └─────────────────┘
```
---

## 🔒 Terminal 3 SDK/ADK Deep-Dive Integration

T.A.C.T. is fully integrated with the **Terminal 3 Agent Development Kit (ADK)** and **Software Development Kit (SDK)**, implementing a multi-user delegated topology, secure enclave-isolated credential vaulting, and cryptographically verified action execution.

### 1. SDK Core Architecture & Handshake
At startup, the orchestrator initializes the connection to the Terminal 3 Network using the `@terminal3/t3n-sdk` client. The handshake and authentication flow maps directly to the testnet:

```typescript
import { 
    T3nClient, 
    TenantClient, 
    setEnvironment, 
    loadWasmComponent, 
    eth_get_address, 
    metamask_sign, 
    createEthAuthInput 
} from "@terminal3/t3n-sdk";

// Initialize environment
setEnvironment("testnet");
const wasmComponent = await loadWasmComponent();

// Derive tenant address and DID
const tenantAddress = eth_get_address(process.env.T3N_API_KEY);
const client = new T3nClient({
    wasmComponent,
    handlers: {
        EthSign: metamask_sign(tenantAddress, undefined, process.env.T3N_API_KEY)
    }
});

await client.handshake();
const authResult = await client.authenticate(createEthAuthInput(tenantAddress));
const tenantDID = authResult.value;
```

### 2. Tenant-Delegate Topology
T.A.C.T. utilizes a **single-tenant, multi-delegate topology**:
* **Tenant**: The primary Agent itself registers as the Tenant and maintains the `TenantClient` instance used to configure namespace security boundaries.
* **Delegates (Alice, Bob, Charlie)**: Lightweight user sessions are handshaked and authenticated using `client.authenticate(...)` under the hood to fetch opaque, session-scoped DIDs (`did:t3n:...`), preventing key exposure while proving identity.
* **Address Mapping**: Because testnet DIDs are session-scoped and opaque, the enclave simulator maintains a mapping registry:
  ```typescript
  // Registers the public signing key address matching the opaque session DID
  registerDidAddress(sessionDid, signerAddress);
  ```

### 3. Enclave-Isolated Map Architecture
Two distinct storage layers are created inside the enclave's secure boundary using Terminal 3 KV namespaces:

#### A. Private Secrets Map (`z:<tenant_did>:secrets`)
* **Visibility**: `private` (hidden from the host operating system/Node.js parent process).
* **Access Control List (ACL)**: `Readers: [ContractID]`, `Writers: [ContractID]`.
* **Security Model**: The host process seeds credentials (like `GITHUB_TOKEN` and `GROQ_API_KEY`) into the map on boot. Once stored, only the Rust WASM contract code running inside the TEE guest environment has read/write permissions. Any `getSecret()` call from the host throws a security exception.

#### B. Public Audit Ledger (`z:<tenant_did>:audit-ledger`)
* **Visibility**: `public` (globally readable, write-gated to the contract).
* **Entries**: Logs cryptographic proof of every transaction (outage detection, log analysis, patch scoring, approval signature, Git merge, and auto-rollback).

### 4. Cryptographic Approval Gate Ceremony (`executeUnder`)
For high-risk operations (such as merging code to `main` or reverting commits), the orchestrator blocks execution until the approver signs a delegation challenge.

#### The EIP-191 Signing Format:
The approver signs a standard Ethereum signature challenge:
```text
T3 Agent Authorization Grant
Agent DID: did:t3:agent:department-of-incidents
Contract: z:<tenant_address_hex>:incident-contracts
Function: <scope_type> (e.g. repo:merge, aws:rightsize)
Outbound Hosts: api.github.com
Approval ID: <random_uuid>
```

#### Enclave-Side Verification:
1. The signature and message are sent to the `/api/approve` endpoint.
2. The orchestrator calls `client.executeAndDecode(...)` to invoke the Guest Rust WASM contract inside the TEE.
3. The guest contract performs ECDSA public key recovery (`secp256k1`) inside the enclave to extract the signer's address from the EIP-191 signature.
4. It compares the recovered address to the allowed DIDs.
5. If verified, the TEE securely loads the `GITHUB_TOKEN` from the private secrets map and executes the GitHub API call to merge or revert.

---

## 🦀 The Rust WASM Contract

The core cryptographic and orchestrational logic runs inside the TEE enclave as a compiled WebAssembly component (`wasm32-wasip2`). The component implements the guest contract interfaces defined using the WebAssembly Interface Type (WIT) format.

### 1. WIT Interface Definition (`wit/world.wit`)
The contract specifies standard entrypoints and imports system capability interfaces from the Terminal 3 runtime host:

```wit
package z:department-of-incidents@0.1.0;

interface contracts {
    record generic-input {
        input: option<list<u8>>,
        user-profile: option<list<u8>>,
        context: option<list<u8>>,
    }

    investigate-logs: func(req: generic-input) -> result<list<u8>, string>;
    create-fix-pr: func(req: generic-input) -> result<list<u8>, string>;
    merge-fix: func(req: generic-input) -> result<list<u8>, string>;
    revert-commit: func(req: generic-input) -> result<list<u8>, string>;
}

world department-of-incidents {
    import host:tenant/tenant-context@1.0.0;
    import host:interfaces/logging@2.1.0;
    import host:interfaces/kv-store@2.1.0;
    import host:interfaces/http@2.1.0;
    import host:interfaces/http-with-placeholders@2.1.0;

    export contracts;
}
```

### 2. Guest Contract Functions
The WASM component exports four core functions, reading credentials directly from the private KV store:

| Function | WIT Signature | Enclave Operation |
|:---------|:--------------|:------------------|
| `investigate-logs` | `generic-input -> result<list<u8>, string>` | Reads `groq_api_key` ➔ Calls Groq API ➔ Returns `{ rootCause, patch, explanation }` |
| `create-fix-pr` | `generic-input -> result<list<u8>, string>` | Reads `github_token` ➔ Calls GitHub Contents/Refs API ➔ Creates branch & PR |
| `merge-fix` | `generic-input -> result<list<u8>, string>` | Reads `github_token` ➔ Merges the PR via GitHub Pulls API |
| `revert-commit` | `generic-input -> result<list<u8>, string>` | Reads `github_token` ➔ Reverts/rolls back file contents via GitHub API |

### 3. Secure Secret Retrieval inside Enclave
Within the WASM guest, secrets are retrieved from the private namespace without ever exposing them to the host memory of the Node.js server. The contract dynamically resolves the Tenant DID to query the correct KV store map:

```rust
use crate::host::tenant::tenant_context::tenant_did;
use crate::host::interfaces::kv_store::get;

fn get_secret_key(key: &str) -> Result<String, String> {
    let tid = tenant_did();
    let tid_str = String::from_utf8(tid.clone()).unwrap_or_else(|_| hex::encode(&tid));
    let tid_hex = if tid_str.starts_with("did:t3n:") {
        tid_str["did:t3n:".len()..].to_string()
    } else {
        hex::encode(&tid)
    };
    
    // Target private map z:<tid>:secrets
    let map_name = format!("z:{}:secrets", tid_hex);
    let bytes = get(&map_name, key.as_bytes())
        .map_err(|e| format!("KV Read Error: {}", e))?
        .ok_or_else(|| format!("Key '{}' not found", key))?;
        
    String::from_utf8(bytes).map_err(|e| format!("Encoding Error: {}", e))
}
```

### 4. AWS Placeholder Injection (`http-with-placeholders`)
For cloud remediation actions (such as EC2/RDS rightsizing), the guest contract utilizes **placeholder injection**. Instead of loading raw AWS credentials into memory, it constructs HTTP calls with placeholder patterns:

```rust
let headers = vec![
    ("X-Aws-Access-Key".to_string(), "{{profile.aws_access_key_id}}".to_string()),
    ("X-Aws-Secret-Key".to_string(), "{{profile.aws_secret_access_key}}".to_string()),
];
```

The host runtime interceptor replaces these placeholders with credentials stored securely in the enclave immediately before sending the network request, ensuring the host operating system never sees the plaintext keys.

> [!IMPORTANT]
> Because all private keys are read from `z:<tid>:secrets` inside the enclave, they are **never exposed in host memory** and cannot be read by an attacker who compromises the Node.js process.

---


## 🛡️ Zero-Secrets Security Model

<p align="center">
  <img src="./public/tee-shield.svg" alt="TEE Shield" width="160">
</p>

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY BOUNDARY                            │
│                                                                  │
│  OUTSIDE (TypeScript/Node.js)     │  INSIDE (Rust WASM / TEE)  │
│  ─────────────────────────────    │  ────────────────────────── │
│                                   │                             │
│  ✓ Structured results only  ◄────►│  Groq API Key              │
│  ✗ Never sees raw secrets         │  GitHub Token              │
│  ✗ getSecret() throws if          │  AWS Credentials           │
│    real client is active          │                             │
│                                   │  z:<tid>:secrets (private) │
│                                   │  z:<tid>:audit-ledger (pub) │
└─────────────────────────────────────────────────────────────────┘
```

**How it works:**
1. Secrets seeded into private `z-namespace KV` store at startup
2. Rust contract reads secrets **inside the enclave** for every API call
3. TypeScript orchestrator only receives structured results — never raw credentials
4. On real testnet: `buildSecureContext().getSecret()` **throws** if real client is active
5. Fallback to local simulator only on billing/network errors

---


## 🏛️ Enclave Simulator

Simulates **Intel TDX** hardware with full ACL enforcement:

```
EnclaveSimulator
├── KV Store (ACL-governed maps)
│   ├── z:<tid>:secrets          ← Private · TEE-only access
│   └── z:<tid>:audit-ledger     ← Public · immutable append-only
│
├── Immutable Audit Ledger
│   └── LOG_READ · PATCH_VALIDATED · MERGE_EXECUTED · ROLLBACK_EXECUTED · ...
│
├── Approval System
│   ├── EIP-191 signature verification
│   └── Dual-message format support
│
└── Contract ID Allocation
    └── Map reader/writer ACL enforcement
```

---


## 📡 API Reference

<details>
<summary><b>🔽 Click to expand full API reference</b></summary>

| Method | Endpoint | Purpose |
|:-------|:---------|:--------|
| `POST` | `/api/webhook` | Main APM webhook (Prometheus / Datadog / T.A.C.T.) |
| `POST` | `/api/github-webhook` | CVE / Dependabot / Security Advisory |
| `POST` | `/api/pagerduty-webhook` | PagerDuty / Opsgenie runbook alerts |
| `POST` | `/api/cloudwatch-webhook` | AWS cost anomaly alerts |
| `GET` | `/api/incidents` | List all active incidents |
| `GET` | `/api/incidents/:id/runbook` | Get runbook steps for an incident |
| `POST` | `/api/incidents/:id/rollback` | Manual rollback trigger |
| `GET` | `/api/ledger` | Immutable audit ledger |
| `GET` | `/api/approvals` | Pending approval challenges |
| `POST` | `/api/approve` | Submit EIP-191 signature |
| `GET` | `/api/telemetry-metrics` | Live latency + error rate |
| `GET` | `/api/service` | Mock DB endpoint for traffic testing |
| `POST` | `/api/stress` | Simulate connection flood |
| `POST` | `/api/register-active-did` | Register browser session DID |
| `GET` | `/api/dev-wallet` | Dev-only wallet sync |

</details>

---


## 🔐 Severity Gating Model

```
Severity   Approvals Required    Rollback Policy
─────────────────────────────────────────────────────
   P3      ──── Auto-resolve ────  Standard canary
   P2      ──── 1 sig needed ────  Standard canary
            (code owner)
   P1      ──── 2 sigs needed ─── Auto-rollback armed
            (code owner           Fresh TEE session
             + second approver)   Re-sign required
```

---


## 📊 Patch Validation Scoring

Every AI-generated patch is scored **0–100** before execution:

```
Score Calculation
─────────────────────────────────────────────────────────────────
  Malicious pattern check
  ├── eval()            → IMMEDIATE REJECT (score: 0)
  ├── child_process     → IMMEDIATE REJECT (score: 0)
  ├── fs.unlink         → IMMEDIATE REJECT (score: 0)
  └── other patterns    → IMMEDIATE REJECT (score: 0)

  Syntax validation
  └── new Function(patch) → syntax error → score deduction

  Context-aware checks
  ├── db-pool fix  → verifies pool size is 30–100
  └── CVE fix      → verifies version strings changed

  Result
  ├── Score ≥ 70  → ✅ SAFE · proceed
  └── Score < 70  → ❌ REJECTED
                     ├── Auto-mode: use fallback patch
                     └── Manual-mode: escalate
```

---


## 🗂️ Project Structure

```
tact/
├── server.js                  # Entry point · Express server · boot sequence
├── app_service.js             # Live mock service (patched during SRE incidents)
│
├── src/
│   ├── sdk-wrapper/
│   │   └── enclave-sim.ts     # Intel TDX simulator (seeded KV store, TEE logic)
│   │
│   └── orchestrator/
│       ├── agent-core.ts      # Core orchestrator control loop & state manager
│       ├── approvals.ts       # Sequential approval collector
│       ├── audit.ts           # Append-only public audit ledger manager
│       ├── canary.ts          # Canary health checker
│       ├── cost-handler.ts    # AWS cost anomaly remediator
│       ├── cve-handler.ts     # GitHub CVE & Dependabot auto-patch handler
│       ├── execute.ts         # TEE-scoped PR merger
│       ├── github.ts          # Git engine for local/remote branch operations
│       ├── llm.ts             # Groq Llama-3 client & secure prompts
│       ├── notify.ts          # Slack notification delivery helper
│       ├── rollback.ts        # TEE-scoped revert engine
│       ├── runbook-handler.ts # PagerDuty runbook execution steps runner
│       ├── severity.ts        # Threat severity classifier
│       └── validate.ts        # Context-aware patch safety validator
│
├── src/contract/
│   └── lib.rs                 # WASM contract source (4 TEE target functions)
│
├── scripts/                   # Integration scripts (balance check, manual triggers)
│   └── register-contract.js   # WASM contract publisher script
│
├── workspace/                 # Git runtime workspace for PR operations
├── dist/                      # Compiled TypeScript outputs served at runtime
└── public/                    # Dashboard UI & React login assets
```

---


## ⚙️ Getting Started

### Prerequisites

```bash
node >= 18.x
cargo (Rust toolchain)
wasm-pack or cargo build --target wasm32-wasip2
```

### Installation

```bash
git clone https://github.com/your-org/tact.git
cd tact
npm install
```

### Environment Variables

```env
# Terminal 3
T3N_API_KEY=your_ethereum_private_key
T3N_CONTRACT_ID=                      # Auto-populated on first run

# AI Inference
GROQ_API_KEY=your_groq_api_key

# GitHub Integration
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=your_org
GITHUB_REPO=your_repo

# AWS (optional — for CloudWatch trigger)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
```

### Build & Run

```bash
# Build Rust WASM contract
cd src/contract
cargo build --target wasm32-wasip2 --release

# Compile TypeScript
npm run compile

# Start T.A.C.T.
node server.js
```

Then open `http://localhost:3000` → login → dashboard.

---


## 🧪 Testing an Incident

### Fire a manual APM alert

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "inc-001",
    "severity": "HIGH",
    "logs": "ERROR: Connection pool exhausted. Max connections: 20. Active: 20. Queued: 847."
  }'
```

### Simulate a CVE

```bash
curl -X POST http://localhost:3000/api/github-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "created",
    "alert": {
      "number": 42,
      "security_advisory": { "cve_id": "CVE-2024-1337" },
      "security_vulnerability": {
        "package": { "name": "lodash" },
        "vulnerable_version_range": "< 4.17.21"
      }
    }
  }'
```

### Trigger cost anomaly detection

```bash
curl -X POST http://localhost:3000/api/cloudwatch-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "anomalyDetails": {
      "totalImpact": { "totalActualSpend": 4200, "totalExpectedSpend": 800 }
    }
  }'
```

---


## 🔗 Hackathon Context

Built for the **Terminal 3 hackathon** — demonstrating the full T3 ADK stack:

- **DID-based identity** — canonical approver DID derived from Ethereum wallet
- **TEE contract execution** — Rust WASM deployed to Terminal 3 testnet
- **Private KV secrets** — z-namespace ACL-governed secret store
- **Public audit ledger** — immutable on-chain action log
- **Severity-gated delegation** — EIP-191 credential flow per P1/P2/P3

---


<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0ea5e9,50:8b5cf6,100:ec4899&height=120&section=footer" width="100%"/>

<p>
  <img src="https://img.shields.io/badge/Built%20for-Terminal%203%20Hackathon-6C47FF?style=flat-square"/>
  <img src="https://img.shields.io/badge/AI-Llama%203.3%2070B%20via%20Groq-F55036?style=flat-square"/>
  <img src="https://img.shields.io/badge/Secured%20by-Intel%20TDX%20%2B%20EIP--191-0071C5?style=flat-square"/>
</p>

*Every production incident leaves a cryptographic trail.*  
*T.A.C.T. — triage that doesn't forget.*

</div>
