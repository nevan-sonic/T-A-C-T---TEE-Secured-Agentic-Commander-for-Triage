const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Persona keys lookup mapping
const PERSONA_KEYS = {
    alice: process.env.ALICE_PRIVATE_KEY || ethers.keccak256(ethers.toUtf8Bytes("alice")),
    bob: process.env.BOB_PRIVATE_KEY || ethers.keccak256(ethers.toUtf8Bytes("bob")),
    charlie: process.env.CHARLIE_PRIVATE_KEY || ethers.keccak256(ethers.toUtf8Bytes("charlie")),
    agent: process.env.T3_PRIVATE_KEY || process.env.T3N_API_KEY
};

const DEFAULT_PRIVATE_KEY = process.env.T3_PRIVATE_KEY || process.env.T3N_API_KEY || ethers.Wallet.createRandom().privateKey;
const defaultWallet = new ethers.Wallet(DEFAULT_PRIVATE_KEY);
const defaultAliceAddress = defaultWallet.address.toLowerCase();
let aliceDID = `did:t3n:${defaultAliceAddress.startsWith("0x") ? defaultAliceAddress.substring(2) : defaultAliceAddress}`;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, method = "GET", body = null) {
    const opts = {
        method,
        headers: { "Content-Type": "application/json" }
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }
    
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(`${BASE_URL}${path}`, opts);
            if (!res.ok) {
                throw new Error(`Request to ${path} failed with status ${res.status}: ${await res.text()}`);
            }
            return await res.json();
        } catch (err) {
            lastError = err;
            console.warn(`[Test Runner] Request to ${path} attempt ${attempt} failed: ${err.message}. Retrying in 500ms...`);
            await sleep(500);
        }
    }
    throw lastError;
}

let personasGlobal = null;

async function signAndApprovePending() {
    console.log("[Test Runner] Querying pending approvals...");
    const approvals = await request("/api/approvals");
    if (approvals.length === 0) {
        console.log("[Test Runner] No pending approvals.");
        return false;
    }

    for (const app of approvals) {
        console.log(`[Test Runner] Signing approval ID: ${app.id} for approver ${app.approverDID} (scope: ${app.scope})...`);
        const matches = app.approverDID.match(/did:t3n:([0-9a-fA-F]+)/) || app.approverDID.match(/simulatedFallbackDid:\w+:([0-9a-fA-F]+)/) || app.approverDID.match(/did:t3:user:([0-9a-fA-F]+)/);
        const approverAddr = matches ? matches[1].toLowerCase() : "";

        // Find the matching private key using personas mapping first
        let signingWallet = defaultWallet;
        let foundPersona = null;
        if (personasGlobal) {
            for (const [name, did] of Object.entries(personasGlobal)) {
                if (did && did.toLowerCase() === app.approverDID.toLowerCase()) {
                    foundPersona = name;
                    break;
                }
            }
        }

        if (foundPersona && PERSONA_KEYS[foundPersona]) {
            signingWallet = new ethers.Wallet(PERSONA_KEYS[foundPersona]);
            console.log(`[Test Runner] Resolved approverDID '${app.approverDID}' to persona '${foundPersona}' (${signingWallet.address})`);
        } else {
            // Fallback: match by address hex
            for (const [name, key] of Object.entries(PERSONA_KEYS)) {
                if (key) {
                    const w = new ethers.Wallet(key);
                    if (w.address.toLowerCase().replace("0x", "") === approverAddr) {
                        signingWallet = w;
                        console.log(`[Test Runner] Resolved approverDID '${app.approverDID}' by address matching to persona '${name}': ${w.address}`);
                        break;
                    }
                }
            }
        }

        const matches = app.approverDID.match(/did:t3n:([0-9a-fA-F]+)/) || app.approverDID.match(/simulatedFallbackDid:\w+:([0-9a-fA-F]+)/) || app.approverDID.match(/did:t3:user:([0-9a-fA-F]+)/);
        const tid = matches ? matches[1].toLowerCase() : signingWallet.address.toLowerCase().replace("0x", "");
        
        // Construct the standard message
        const message = `T3 Agent Authorization Grant\nAgent DID: did:t3:agent:department-of-incidents\nContract: z:${tid}:incident-contracts\nFunction: ${app.scope}\nOutbound Hosts: api.github.com\nApproval ID: ${app.id}`;
        
        // Fallback message (friend's format)
        const fallbackMessage = `T3 Agent Authorization Grant\nAgent DID: did:t3:agent:department-of-incidents\nContract: z:system:incident-contracts\nFunction: incident-${app.id}\nApproval ID: ${app.id}`;
        
        let msgToSign = message;
        if (app.scope.startsWith("incident-")) {
            msgToSign = fallbackMessage;
        }

        const signature = await signingWallet.signMessage(msgToSign);
        console.log(`[Test Runner] Signature generated: ${signature.substring(0, 25)}...`);

        const approveResult = await request("/api/approve", "POST", { id: app.id, signature });
        console.log(`[Test Runner] Approve API result:`, approveResult);
    }
    return true;
}

async function run() {
    try {
        console.log("[Test Runner] Polling /api/personas for dynamically resolved DIDs...");
        let personas = null;
        for (let attempt = 1; attempt <= 30; attempt++) {
            try {
                personas = await request("/api/personas");
                if (personas && personas.alice) {
                    console.log("[Test Runner] Dynamic personas retrieved successfully:", personas);
                    break;
                }
            } catch (err) {
                // ignore and retry
            }
            await sleep(1000);
        }

        if (!personas || !personas.alice) {
            throw new Error("Failed to load personas from control plane after 30 seconds.");
        }

        personasGlobal = personas;
        aliceDID = personas.alice;
        console.log("[Test Runner] Initializing developer DID on control plane...");
        await request("/api/register-active-did", "POST", { did: aliceDID });
        console.log(`[Test Runner] Active browser DID registered: ${aliceDID}`);

        // ==========================================
        // Test 1: CVE Webhook
        // ==========================================
        console.log("\n==========================================");
        console.log("[Test Runner] Triggering CVE Webhook...");
        console.log("==========================================");
        const cveResult = await request("/api/github-webhook", "POST", {
            type: "cve_manual",
            cveId: "CVE-2024-29041",
            severity: "high",
            package: "express",
            currentVersion: "4.18.2",
            fixedVersion: "4.19.2",
            affectedFile: "package.json",
            description: "Express.js open redirect vulnerability allows attackers to redirect users to malicious sites via crafted URL parameters."
        });
        console.log("[Test Runner] Webhook response:", cveResult);

        // Wait for it to analyze logs, validate, PR, and require approvals
        for (let i = 0; i < 15; i++) {
            await sleep(1000);
            const approvalsSigned = await signAndApprovePending();
            if (approvalsSigned) {
                break;
            }
        }
        await sleep(2000); // Wait for merge execution

        // ==========================================
        // Test 2: Runbook Webhook
        // ==========================================
        console.log("\n==========================================");
        console.log("[Test Runner] Triggering Runbook Webhook...");
        console.log("==========================================");
        const runbookResult = await request("/api/pagerduty-webhook", "POST", {
            type: "runbook_manual",
            incidentId: "RB-TEST-001",
            title: "High database memory on db-replica-02",
            severity: "high",
            service: "database-service",
            runbookSteps: [
                "Check current memory usage: free -h",
                "Identify top memory consumers: ps aux --sort=-%mem | head -20",
                "Restart PostgreSQL replica: sudo systemctl restart postgresql-replica",
                "Verify replication lag: psql -c 'SELECT now() - pg_last_xact_replay_timestamp()'",
                "Check connection pool status: ss -s"
            ]
        });
        console.log("[Test Runner] Webhook response:", runbookResult);

        // Runbooks have step-by-step sequential approvals for modification/restart steps.
        // We poll and sign until no more approvals are found.
        console.log("[Test Runner] Polling and signing runbook steps...");
        for (let i = 0; i < 30; i++) {
            await sleep(1000);
            await signAndApprovePending();
            
            // Check current status
            const incidents = await request("/api/incidents");
            const rbInc = incidents.find(inc => inc.id === "RB-TEST-001");
            if (rbInc && (rbInc.status === "Runbook Completed" || rbInc.status.startsWith("Failed"))) {
                console.log(`[Test Runner] Runbook completed with status: ${rbInc.status}`);
                break;
            }
        }

        // ==========================================
        // Test 3: Cost Anomaly Webhook
        // ==========================================
        console.log("\n==========================================");
        console.log("[Test Runner] Triggering Cost Anomaly Webhook...");
        console.log("==========================================");
        const costResult = await request("/api/cloudwatch-webhook", "POST", {
            type: "cost_anomaly",
            alarmName: "DailyCostAnomaly",
            currentSpend: 2847,
            threshold: 1200,
            percentageIncrease: 137,
            currency: "USD",
            topResourceBySpend: [
                { service: "Amazon EC2", cost: 1840, resourceId: "i-0abc123def456789" },
                { service: "Amazon RDS", cost: 680, resourceId: "db-instance-prod-01" },
                { service: "Amazon S3", cost: 327, resourceId: "bucket-ml-training-data" }
            ]
        });
        console.log("[Test Runner] Webhook response:", costResult);

        console.log("[Test Runner] Polling and signing cost anomaly remediations...");
        for (let i = 0; i < 20; i++) {
            await sleep(1000);
            await signAndApprovePending();
            
            const incidents = await request("/api/incidents");
            const costInc = incidents.find(inc => inc.id.startsWith("COST-"));
            if (costInc && (costInc.status === "Cost Anomaly Resolved" || costInc.status.startsWith("Failed"))) {
                console.log(`[Test Runner] Cost incident resolved with status: ${costInc.status}`);
                break;
            }
        }

        // ==========================================
        // Verify final incidents list and ledger
        // ==========================================
        console.log("\n==========================================");
        console.log("[Test Runner] Final Results Verification");
        console.log("==========================================");
        
        const incidents = await request("/api/incidents");
        console.log("\nIncidents:");
        incidents.forEach(inc => {
            console.log(`- ${inc.id}: status='${inc.status}', severity='${inc.severity}', triggerType='${inc.triggerType}', costSaving='${inc.costSaving || 0}', runbookStepsCount='${inc.runbookStepsCount || 0}'`);
        });

        const ledger = await request("/api/ledger");
        console.log("\nT3 Ledger Entries (first 10):");
        ledger.slice(0, 15).forEach(entry => {
            console.log(`- [${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.action} by ${entry.actor}`);
        });

        console.log("\n[Test Runner] ✅ All tests completed!");

    } catch (e) {
        console.error("[Test Runner] Test failed:", e);
    }
}

run();
