# Starlight Control Plane Utility & Test Scripts

This directory houses utility, debugging, and verification scripts developed during the integration of the Terminal 3 Agent Dev Kit (ADK).

## 🚀 Core Scripts

### `register-contract.js`
- **Purpose**: Automates compilation checks and publishes the guest Rust contract WASM (`target/wasm32-wasip2/release/department_of_incidents_contract.wasm`) to the live T3 testnet.
- **Side Effects**: Automatically writes/updates the registered `T3N_CONTRACT_ID` in your `.env` file.

### `verify-triggers.js`
- **Purpose**: Full E2E integration test suite that exercises all 3 alert pipelines (CVE, PagerDuty Runbook, AWS Cost Anomaly). It automatically signs required cryptographic approvals and validates that ledger entries are recorded correctly on-chain.
- **Run**: `node scripts/verify-triggers.js`

---

## 🔧 Diagnostics & Tools

* **`approve-incident.js`**: Helper script to sign and approve a pending delegation request by ID.
* **`check-balance.js`**: Queries the testnet native token balance of the developer's Ethereum address.
* **`create-and-seed-maps.js`**: Re-asserts private `secrets` and public `audit-ledger` KV maps, seeding mock environment keys.
* **`derive.js`**: Key derivation check.
* **`get-contract-logs.js`**: Queries on-chain contract execution logs and events from the testnet.
* **`inspect-client.js` / `inspect-client-keys.js` / `inspect-function.js`**: Debugging utilities to examine active T3nClient metadata, cryptographic signers, and contract ABI interfaces.
* **`inspect-wasm.js`**: Inspects local guest contract WASM shape and details.
* **`read-sdk-code.js`**: Inspects local `@terminal3/t3n-sdk` node package exports.
* **`read-wasm-imports.js`**: Utility to print the WASI imports of the compiled WASM binary (logging, kv-store, http, http-with-placeholders).
* **`search-js.js`**: Scans files.
* **`self-grant.js`**: Tests contract self-authorization delegation chains.

---

## 🧪 Integration Tests

* **`register-and-test.js` / `register-and-test-v2.js` / `register-and-test-v3.js`**: Iterative testnet script versions validating handshake, registration, and KV maps.
* **`test-apm-webhooks.js`**: Sends mock SRE webhooks (Prometheus Alertmanager style) to the local server.
* **`test-eval-import.js`**: Attestation check for dynamic ES Module execution.
* **`test-map-get.js`**: Reads entries directly from specified KV-store maps.
* **`test-p1-flow.js`**: Exercises the high-priority P1 manual approval incident pipeline.
* **`test-t3n-connection.js`**: Performs simple ping and handshake checks to verify testnet node availability.
* **`test-traffic.js`**: Spans high-concurrency requests to trigger auto-mitigation and data-driven canary monitors.
* **`test-variants.js`**: Validates WIT variant schema conversions.
