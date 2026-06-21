const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Disable HTTP caching for all routes
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// [Security] Simple rate limiting per IP (60 requests per minute)
const rateLimitMap = new Map();
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const window = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
    if (now > window.resetAt) {
        window.count = 0;
        window.resetAt = now + 60000;
    }
    window.count++;
    rateLimitMap.set(ip, window);
    if (window.count > 60) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in 60 seconds." });
    }
    next();
});

// Initialize T3N Enclave Simulator entries on startup
// We must load this from the compiled dist folder
let enclaveSimulator;
let handleIncident;
let activeIncidents;
let readAuditLedger;
let handleCVEIncident;
let handleRunbookIncident;
let handleCostAnomalyIncident;

try {
    const simModule = require("./dist/sdk-wrapper/enclave-sim");
    enclaveSimulator = simModule.enclaveSimulator;
    
    const coreModule = require("./dist/orchestrator/agent-core");
    handleIncident = coreModule.handleIncident;
    activeIncidents = coreModule.activeIncidents;
    
    const auditModule = require("./dist/orchestrator/audit");
    readAuditLedger = auditModule.readAuditLedger;

    // Import new trigger handlers
    try {
        const cveModule = require("./dist/orchestrator/cve-handler");
        handleCVEIncident = cveModule.handleCVEIncident;
        console.log("[Control Plane] CVE Handler loaded.");
    } catch (e) { console.log("[Control Plane] Warning: CVE Handler not found."); }

    try {
        const runbookModule = require("./dist/orchestrator/runbook-handler");
        handleRunbookIncident = runbookModule.handleRunbookIncident;
        console.log("[Control Plane] Runbook Handler loaded.");
    } catch (e) { console.log("[Control Plane] Warning: Runbook Handler not found."); }

    try {
        const costModule = require("./dist/orchestrator/cost-handler");
        handleCostAnomalyIncident = costModule.handleCostAnomalyIncident;
        console.log("[Control Plane] Cost Handler loaded.");
    } catch (e) { console.log("[Control Plane] Warning: Cost Handler not found."); }
    
    // Seed credentials on startup (mimics tenant control plane execution)
    const envTid = process.env.T3N_TENANT_DID ? process.env.T3N_TENANT_DID.split(":").pop() : "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec";
    enclaveSimulator.createMap(envTid, "secrets", "private", ["1001"], ["1001"]);
    enclaveSimulator.setMapEntry(envTid, "secrets", "github_token", process.env.GITHUB_TOKEN || process.env.T3_PRIVATE_KEY || "0x518112b612270210c5a6b6354f8292979d559fe8075bb045930ddedd34749f4d");
    // Zero-Secrets LLM Proxy: Seed Groq API key into TEE vault
    enclaveSimulator.setMapEntry(envTid, "secrets", "groq_api_key", process.env.GROQ_API_KEY || "");
    // Zero-Secrets AWS: Seed AWS credentials into TEE vault
    enclaveSimulator.setMapEntry(envTid, "secrets", "aws_access_key_id", process.env.AWS_ACCESS_KEY_ID || "AKIAIOSFODNN7EXAMPLE");
    enclaveSimulator.setMapEntry(envTid, "secrets", "aws_secret_access_key", process.env.AWS_SECRET_ACCESS_KEY || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

    const fallbackKey = process.env.T3N_API_KEY || process.env.T3_PRIVATE_KEY || "0x518112b612270210c5a6b6354f8292979d559fe8075bb045930ddedd34749f4d";
    const derivedTid = new ethers.Wallet(fallbackKey).address.toLowerCase();
    if (envTid.toLowerCase() !== derivedTid) {
        enclaveSimulator.createMap(derivedTid, "secrets", "private", ["1001"], ["1001"]);
        enclaveSimulator.setMapEntry(derivedTid, "secrets", "github_token", process.env.GITHUB_TOKEN || process.env.T3_PRIVATE_KEY || "0x518112b612270210c5a6b6354f8292979d559fe8075bb045930ddedd34749f4d");
    }

    // Seed default ONCALL_ENGINEER_DID on startup if different
    const defaultDid = process.env.ONCALL_ENGINEER_DID;
    if (defaultDid) {
        const matches = defaultDid.match(/did:t3n:([0-9a-fA-F]+)/) || defaultDid.match(/did:t3:user:([0-9a-fA-F]+)/);
        if (matches) {
            const defaultTid = matches[1].toLowerCase();
            if (envTid.toLowerCase() !== defaultTid && derivedTid !== defaultTid) {
                enclaveSimulator.createMap(defaultTid, "secrets", "private", ["1001"], ["1001"]);
                enclaveSimulator.setMapEntry(defaultTid, "secrets", "github_token", process.env.GITHUB_TOKEN || process.env.T3_PRIVATE_KEY || "0x518112b612270210c5a6b6354f8292979d559fe8075bb045930ddedd34749f4d");
            }
        }
    }
    
    console.log("[Control Plane] Enclave simulator loaded and private z-namespace secrets seeded.");
    console.log("[Control Plane] Contract published: department-of-incidents v0.1.0 (functions: investigate-logs, create-fix-pr, merge-fix, revert-commit)");
    console.log("[Control Plane] Contract registered at z:system:incident-contracts (Contract ID: 1001)");
} catch (e) {
    console.error("[Control Plane] Warning: Compiled modules not found. Run 'npm run compile' first to generate JS outputs.");
}

// Track the latest active DID from the browser dashboard
let activeBrowserDID = process.env.ONCALL_ENGINEER_DID || "did:t3n:1dc692077cbf6d404b619c8d9b6648849c74802c";

app.post("/api/register-active-did", (req, res) => {
    const { did } = req.body;
    if (did && (did.startsWith("did:t3n:") || did.startsWith("did:t3:"))) {
        activeBrowserDID = did;
        console.log(`[Control Plane] Registered active browser DID: ${activeBrowserDID}`);
        
        // Seed z-namespace secrets for this DID
        const matches = did.match(/did:t3n:([0-9a-fA-F]+)/) || did.match(/did:t3:user:([0-9a-fA-F]+)/);
        if (matches && enclaveSimulator) {
            const tid = matches[1].toLowerCase();
            enclaveSimulator.createMap(tid, "secrets", "private", ["1001"], ["1001"]);
            enclaveSimulator.setMapEntry(tid, "secrets", "github_token", process.env.GITHUB_TOKEN || process.env.T3_PRIVATE_KEY || "0x518112b612270210c5a6b6354f8292979d559fe8075bb045930ddedd34749f4d");
        }
        
        return res.json({ status: "registered", did: activeBrowserDID });
    }
    res.status(400).json({ error: "Invalid DID format" });
});

// REST Endpoints
app.post("/api/webhook", async (req, res) => {
    let rawAlert = req.body;
    let alert = null;
    
    if (!rawAlert) {
        return res.status(400).json({ error: "Empty request body" });
    }

    // 1. Detect Prometheus Alertmanager Webhook Payload
    if (rawAlert.alerts && Array.isArray(rawAlert.alerts) && rawAlert.alerts.length > 0) {
        console.log("[Webhook Router] Detected Prometheus Alertmanager payload.");
        const promAlert = rawAlert.alerts[0];
        const labels = promAlert.labels || {};
        const annotations = promAlert.annotations || {};
        
        const timestampSuffix = Math.random().toString(36).substring(2, 5);
        alert = {
            id: (labels.alertname || "PROM-ALERT") + "-" + timestampSuffix.toUpperCase(),
            severity: labels.severity === "critical" || labels.severity === "page" ? "HIGH" : "MEDIUM",
            service: labels.service || labels.job || "api-gateway",
            triggeredAt: promAlert.startsAt || new Date().toISOString(),
            errorRate: labels.severity === "critical" ? 95 : 60,
            p99Latency: labels.severity === "critical" ? 25000 : 5000,
            logs: [
                annotations.summary || "Prometheus firing alert: " + (labels.alertname || ""),
                annotations.description || "Alert description not specified.",
                `Instance: ${labels.instance || "unknown"}`,
                `GeneratorURL: ${promAlert.generatorURL || "N/A"}`
            ],
            onCallEngineerDID: activeBrowserDID, // Fallback Alice address / active browser DID
            codeOwnerDID: activeBrowserDID
        };
    } 
    // 2. Detect Datadog Webhook Payload
    else if (rawAlert.event_type || rawAlert.alert_type || rawAlert.alert_title) {
        console.log("[Webhook Router] Detected Datadog Webhook payload.");
        const timestampSuffix = Math.random().toString(36).substring(2, 5);
        
        let extractedService = "api-gateway";
        const title = rawAlert.alert_title || rawAlert.title || "";
        const serviceMatch = title.match(/on\s+(\S+)/) || title.match(/service:(\S+)/);
        if (serviceMatch && serviceMatch[1]) {
            extractedService = serviceMatch[1].replace(/[^\w-]/g, "");
        }
        
        const isCritical = rawAlert.alert_type === "error" || rawAlert.alert_severity === "error" || rawAlert.alert_status === "error";
        
        alert = {
            id: "DD-" + (rawAlert.id || timestampSuffix.toUpperCase()),
            severity: isCritical ? "HIGH" : "MEDIUM",
            service: extractedService,
            triggeredAt: new Date().toISOString(),
            errorRate: isCritical ? 98 : 70,
            p99Latency: isCritical ? 28000 : 12000,
            logs: [
                title,
                rawAlert.body || rawAlert.alert_msg || "Datadog monitor alert triggered.",
                `Event Type: ${rawAlert.event_type || "N/A"}`,
                `Monitor Status: ${rawAlert.alert_status || "N/A"}`
            ],
            onCallEngineerDID: activeBrowserDID,
            codeOwnerDID: activeBrowserDID
        };
    } 
    // 3. Fallback to Standard T.A.C.T format
    else if (rawAlert.id) {
        alert = rawAlert;
    }

    if (!alert) {
        return res.status(400).json({ error: "Could not parse payload. Supported formats: Datadog Webhook, Prometheus Alertmanager, or standard T.A.C.T Alert." });
    }
    
    if (!handleIncident) {
        return res.status(500).json({ error: "Server modules not compiled. Please run npm run compile first." });
    }

    // Trigger incident handling asynchronously
    console.log(`[Webhook Router] Triggering triage for alert ${alert.id} (Service: ${alert.service}, Severity: ${alert.severity})`);
    handleIncident(alert).catch(err => {
        console.error(`[Webhook Async Error] ${err.message}`);
    });
    
    res.json({ status: "incident_triage_started", id: alert.id });
});

// Live target SRE service simulation (Fully Functional & Real-Time)
const fs = require("fs");
const requestHistory = [];
const WINDOW_SIZE = 30; // 15 seconds of history at 500ms intervals

let activeConnections = 0;
let connectionLogs = [];

setInterval(async () => {
    const startTime = Date.now();
    let isError = false;
    
    try {
        // Read pool_size from app_service.js dynamically
        const appServicePath = path.join(__dirname, "app_service.js");
        let poolSize = 20;
        if (fs.existsSync(appServicePath)) {
            const content = fs.readFileSync(appServicePath, "utf-8");
            const match = content.match(/max:\s*(\d+)/);
            if (match) {
                poolSize = parseInt(match[1], 10);
            }
        }
        
        if (poolSize < 30) {
            // Pool size is exhausted (20) -> High latency and error spikes
            const delay = 1000 + Math.random() * 1500; // 1.0s - 2.5s
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // 85% error rate
            if (Math.random() < 0.85) {
                isError = true;
            }
        } else {
            // Pool size is resolved (50) -> Normal fast responses
            const delay = 35 + Math.random() * 45; // 35ms - 80ms
            await new Promise(resolve => setTimeout(resolve, delay));
            isError = false;
        }
    } catch (e) {
        isError = true;
    }
    
    const latency = Date.now() - startTime;
    requestHistory.push({ latency, isError });
    if (requestHistory.length > WINDOW_SIZE) {
        requestHistory.shift();
    }
}, 500);

// GET /api/service: Mock Database Endpoint for Live Traffic Testing (Postman)
app.get("/api/service", async (req, res) => {
    const startTime = Date.now();
    let isError = false;
    let poolSize = 20;

    try {
        const appServicePath = path.join(__dirname, "app_service.js");
        if (fs.existsSync(appServicePath)) {
            const content = fs.readFileSync(appServicePath, "utf-8");
            const match = content.match(/max:\s*(\d+)/);
            if (match) {
                poolSize = parseInt(match[1], 10);
            }
        }
    } catch (e) {
        console.error("[Service API] Error reading app_service.js config:", e);
    }

    if (activeConnections >= poolSize) {
        isError = true;
        const latency = 800 + Math.random() * 400; // timeout latency
        await new Promise(resolve => setTimeout(resolve, latency));

        const errorMsg = `ERROR [pool] Connection pool exhausted (max=${poolSize}, active=${activeConnections})`;
        console.log(`[Service API] ${errorMsg}`);
        connectionLogs.push(`[${new Date().toISOString()}] ${errorMsg}`);

        const actualLatency = Date.now() - startTime;
        requestHistory.push({ latency: actualLatency, isError: true });
        if (requestHistory.length > WINDOW_SIZE) requestHistory.shift();

        return res.status(500).json({
            status: "error",
            message: "Database connection pool exhausted",
            max: poolSize,
            active: activeConnections
        });
    }

    // Process connection (with mock query delay of 150ms)
    activeConnections++;
    const queryTime = 120 + Math.round(Math.random() * 40); 
    await new Promise(resolve => setTimeout(resolve, queryTime));
    activeConnections--;

    const actualLatency = Date.now() - startTime;
    requestHistory.push({ latency: actualLatency, isError: false });
    if (requestHistory.length > WINDOW_SIZE) requestHistory.shift();

    return res.json({
        status: "success",
        queryTimeMs: actualLatency,
        activeConnections
    });
});

// Feature 1: Concurrent Connection Flood Trigger (Postman-native)
// Single POST request instantly overwhelms pool and triggers auto-monitor within 4 seconds
app.post("/api/stress", (req, res) => {
    const { connections = 10, holdMs = 2000 } = req.body;
    const count = Math.min(connections, 50); // safety cap
    activeConnections += count;
    setTimeout(() => { activeConnections = Math.max(0, activeConnections - count); }, holdMs);
    console.log(`[Stress] Simulating ${count} concurrent connections for ${holdMs}ms (total active: ${activeConnections})`);
    res.json({ message: `Simulating ${count} concurrent connections for ${holdMs}ms`, activeConnections });
});

// ============================================================
// NEW TRIGGER 1: GitHub CVE / PR Webhook Auto-Patch
// POST /api/github-webhook — handles Dependabot, Security Advisory, and manual CVE payloads
// ============================================================
app.post("/api/github-webhook", (req, res) => {
    if (!handleCVEIncident) {
        return res.status(500).json({ error: "CVE Handler not loaded. Run 'npm run compile' first." });
    }

    const body = req.body;
    let cveAlert = null;

    // Format A: GitHub Dependabot alert
    if (body.alert && body.alert.security_advisory) {
        console.log("[GitHub Webhook] Detected Dependabot alert format.");
        const alert = body.alert;
        const advisory = alert.security_advisory;
        const vuln = alert.security_vulnerability || {};
        cveAlert = {
            id: `CVE-DEP-${alert.number || Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            cveId: advisory.ghsa_id || `GHSA-${Math.random().toString(36).substring(2, 8)}`,
            ghsaId: advisory.ghsa_id,
            severity: advisory.severity || vuln.severity || "medium",
            cvssScore: advisory.cvss ? advisory.cvss.score : undefined,
            packageName: alert.dependency ? alert.dependency.package.name : "unknown",
            currentVersion: vuln.vulnerable_version_ranges ? vuln.vulnerable_version_ranges[0] : undefined,
            fixedVersion: vuln.first_patched_version ? vuln.first_patched_version.identifier : undefined,
            description: advisory.summary || "Dependabot security alert",
            repository: body.repository ? body.repository.full_name : undefined
        };
    }
    // Format B: GitHub Security Advisory webhook
    else if (body.security_advisory && body.action === "published") {
        console.log("[GitHub Webhook] Detected Security Advisory format.");
        const advisory = body.security_advisory;
        cveAlert = {
            id: `CVE-SA-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            cveId: advisory.ghsa_id || `GHSA-${Math.random().toString(36).substring(2, 8)}`,
            ghsaId: advisory.ghsa_id,
            severity: advisory.severity || "medium",
            cvssScore: advisory.cvss ? advisory.cvss.score : undefined,
            packageName: body.affected_file || "unknown",
            affectedFile: body.affected_file,
            vulnerableCode: body.vulnerable_code,
            description: advisory.summary || "Security advisory",
            repository: undefined
        };
    }
    // Format C: Manual CVE test (Postman)
    else if (body.type === "cve_manual") {
        console.log("[GitHub Webhook] Detected manual CVE test format.");
        cveAlert = {
            id: `CVE-${body.cveId || Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            cveId: body.cveId || "CVE-UNKNOWN",
            severity: body.severity || "medium",
            packageName: body.package || "unknown",
            currentVersion: body.currentVersion,
            fixedVersion: body.fixedVersion,
            affectedFile: body.affectedFile,
            description: body.description || "Manual CVE test",
            repository: undefined
        };
    }

    if (!cveAlert) {
        return res.status(400).json({ error: "Unrecognized payload format. Supported: Dependabot alert, Security Advisory, or manual CVE test (type: 'cve_manual')." });
    }

    console.log(`[GitHub Webhook] Triggering CVE remediation: ${cveAlert.cveId} (${cveAlert.severity})`);
    handleCVEIncident(cveAlert).catch(err => {
        console.error(`[GitHub Webhook Async Error] ${err.message}`);
    });

    res.json({ status: "cve_remediation_started", id: cveAlert.id, cveId: cveAlert.cveId });
});

// ============================================================
// NEW TRIGGER 2: PagerDuty / Opsgenie Runbook Execution
// POST /api/pagerduty-webhook — handles PagerDuty, Opsgenie, and manual runbook payloads
// ============================================================
app.post("/api/pagerduty-webhook", (req, res) => {
    if (!handleRunbookIncident) {
        return res.status(500).json({ error: "Runbook Handler not loaded. Run 'npm run compile' first." });
    }

    const body = req.body;
    let runbookAlert = null;

    // Format A: PagerDuty
    if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
        console.log("[PagerDuty Webhook] Detected PagerDuty incident format.");
        const msg = body.messages[0];
        const incident = msg.incident || {};
        runbookAlert = {
            id: incident.id || `PD-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: incident.title || "PagerDuty Incident",
            severity: incident.severity || "high",
            service: incident.service ? incident.service.name : "unknown",
            details: incident.body ? incident.body.details : undefined,
            runbookUrl: incident.runbook_url,
            source: "pagerduty"
        };
    }
    // Format B: Opsgenie
    else if (body.action === "Create" && body.alert) {
        console.log("[PagerDuty Webhook] Detected Opsgenie alert format.");
        const alert = body.alert;
        runbookAlert = {
            id: alert.alertId || `OG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: alert.message || "Opsgenie Alert",
            severity: alert.priority || "P2",
            service: alert.details ? alert.details.service : "unknown",
            details: `Host: ${alert.details ? alert.details.host : "N/A"}. Tags: ${(alert.tags || []).join(", ")}`,
            runbookUrl: body.runbookUrl,
            source: "opsgenie"
        };
    }
    // Format C: Manual runbook test (Postman)
    else if (body.type === "runbook_manual") {
        console.log("[PagerDuty Webhook] Detected manual runbook test format.");
        runbookAlert = {
            id: body.incidentId || `RB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: body.title || "Manual Runbook Test",
            severity: body.severity || "high",
            service: body.service || "unknown",
            runbookSteps: body.runbookSteps,
            source: "manual"
        };
    }

    if (!runbookAlert) {
        return res.status(400).json({ error: "Unrecognized payload format. Supported: PagerDuty incident, Opsgenie alert, or manual runbook (type: 'runbook_manual')." });
    }

    console.log(`[PagerDuty Webhook] Triggering runbook execution: ${runbookAlert.id} (${runbookAlert.title})`);
    handleRunbookIncident(runbookAlert).catch(err => {
        console.error(`[PagerDuty Webhook Async Error] ${err.message}`);
    });

    res.json({ status: "runbook_execution_started", id: runbookAlert.id });
});

// ============================================================
// NEW TRIGGER 3: AWS CloudWatch Cost Anomaly
// POST /api/cloudwatch-webhook — handles SNS/CloudWatch, Cost Anomaly Detection, and manual payloads
// ============================================================
app.post("/api/cloudwatch-webhook", (req, res) => {
    if (!handleCostAnomalyIncident) {
        return res.status(500).json({ error: "Cost Handler not loaded. Run 'npm run compile' first." });
    }

    const body = req.body;
    let costAlert = null;

    // Format A: AWS SNS/CloudWatch alarm
    if (body.Type === "Notification" && body.Message) {
        console.log("[CloudWatch Webhook] Detected AWS SNS/CloudWatch alarm format.");
        try {
            const msg = JSON.parse(body.Message);
            const trigger = msg.Trigger || {};
            const reasonMatch = (msg.NewStateReason || "").match(/\$(\d+).*?\$(\d+).*?(\d+)%/);
            costAlert = {
                id: `CW-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                alarmName: msg.AlarmName || "CloudWatchAlarm",
                currentSpend: reasonMatch ? parseInt(reasonMatch[1]) : 0,
                threshold: reasonMatch ? parseInt(reasonMatch[2]) : 0,
                percentageIncrease: reasonMatch ? parseInt(reasonMatch[3]) : 0,
                currency: "USD",
                topResources: [],
                source: "cloudwatch"
            };
        } catch (e) {
            console.error(`[CloudWatch Webhook] Failed to parse SNS message: ${e.message}`);
            return res.status(400).json({ error: "Failed to parse SNS message." });
        }
    }
    // Format B: Manual cost anomaly test (Postman)
    else if (body.type === "cost_anomaly") {
        console.log("[CloudWatch Webhook] Detected manual cost anomaly test format.");
        costAlert = {
            id: `COST-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            alarmName: body.alarmName || "ManualCostAnomaly",
            currentSpend: body.currentSpend || 0,
            threshold: body.threshold || 0,
            percentageIncrease: body.percentageIncrease || 0,
            currency: body.currency || "USD",
            topResources: body.topResourceBySpend || [],
            source: "manual"
        };
    }
    // Format C: AWS Cost Anomaly Detection webhook
    else if (body.anomalyId) {
        console.log("[CloudWatch Webhook] Detected AWS Cost Anomaly Detection format.");
        const impact = body.totalImpact || {};
        costAlert = {
            id: `CAD-${body.anomalyId || Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            alarmName: body.monitorName || "CostAnomalyDetection",
            currentSpend: parseFloat(impact.totalActualSpend || "0"),
            threshold: parseFloat(impact.totalExpectedSpend || "0"),
            percentageIncrease: parseFloat(impact.totalImpactPercentage || "0"),
            currency: "USD",
            topResources: [{
                service: body.monitorName || "AWS Service",
                cost: parseFloat((body.maxImpact || {}).maxAmount || "0"),
                resourceId: body.dimensionValue || "unknown"
            }],
            source: "cost-anomaly-detection"
        };
    }

    if (!costAlert) {
        return res.status(400).json({ error: "Unrecognized payload format. Supported: AWS SNS/CloudWatch alarm, Cost Anomaly Detection webhook, or manual test (type: 'cost_anomaly')." });
    }

    console.log(`[CloudWatch Webhook] Triggering cost anomaly response: ${costAlert.id} ($${costAlert.currentSpend}, ${costAlert.percentageIncrease}% increase)`);
    handleCostAnomalyIncident(costAlert).catch(err => {
        console.error(`[CloudWatch Webhook Async Error] ${err.message}`);
    });

    res.json({ status: "cost_remediation_started", id: costAlert.id });
});

// GET /api/incidents/:id/runbook — return runbook steps for a specific incident
app.get("/api/incidents/:id/runbook", (req, res) => {
    if (!activeIncidents) {
        return res.status(500).json({ error: "Modules not loaded." });
    }
    const incident = activeIncidents.get(req.params.id);
    if (!incident) {
        return res.status(404).json({ error: "Incident not found." });
    }
    const inc = incident;
    res.json({
        incidentId: req.params.id,
        status: inc.status,
        runbookSteps: inc.runbookSteps || [],
        triggerType: inc.triggerType || "unknown"
    });
});

// Auto-triage background monitor
setInterval(() => {
    if (requestHistory.length < 10) return;

    const errorCount = requestHistory.filter(r => r.isError).length;
    const errorRate = Math.round((errorCount / requestHistory.length) * 100);

    if (errorRate >= 45) {
        let hasActiveIncident = false;
        if (activeIncidents) {
            activeIncidents.forEach((value) => {
                if (value.status !== "Resolved" && value.status !== "Rolled Back" && !value.status.startsWith("Failed")) {
                    hasActiveIncident = true;
                }
            });
        }

        if (!hasActiveIncident && handleIncident) {
            const autoIncidentId = "AUTO-TRAFFIC-BOTTLENECK-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            console.log(`\n[Monitor Alert] Live error rate spiked to ${errorRate}%. Auto-triggering SRE incident triage: ${autoIncidentId}`);

            const dynamicLogs = [
                `ERROR [pool] Connection pool exhausted, high concurrent traffic spike.`,
                `WARN  [db] Timeout acquiring connection after 5000ms`,
                `ERROR [api] Request failed: TimeoutError: getConnection()`,
                ...connectionLogs.slice(-5)
            ];

            const alertPayload = {
                id: autoIncidentId,
                severity: "MEDIUM",
                service: "api-gateway",
                triggeredAt: new Date().toISOString(),
                errorRate,
                p99Latency: 12000,
                logs: dynamicLogs,
                onCallEngineerDID: activeBrowserDID,
                codeOwnerDID: activeBrowserDID
            };

            connectionLogs = [];

            handleIncident(alertPayload, true).catch(err => {
                console.error(`[Monitor Async Error] ${err.message}`);
            });
        }
    }
}, 4000);

app.get("/api/telemetry-metrics", (req, res) => {
    if (requestHistory.length === 0) {
        return res.json({ latency: 80, errorRate: 0 });
    }
    
    const totalLatency = requestHistory.reduce((sum, r) => sum + r.latency, 0);
    const avgLatency = Math.round(totalLatency / requestHistory.length);
    
    const errorCount = requestHistory.filter(r => r.isError).length;
    const errorRate = Math.round((errorCount / requestHistory.length) * 100);
    
    res.json({ latency: avgLatency, errorRate });
});

app.get("/api/incidents", (req, res) => {
    if (!activeIncidents) {
        return res.json([]);
    }
    const list = [];
    activeIncidents.forEach((value, key) => {
        list.push({
            id: key,
            service: value.alert.service,
            status: value.status,
            severity: value.severity,
            errorRate: value.alert.errorRate,
            p99Latency: value.alert.p99Latency,
            rootCause: value.rootCause || null,
            patch: value.patch || null,
            prUrl: value.prUrl || null,
            prNumber: value.prNumber || null,
            branch: value.branch || null,
            mergeCommit: value.mergeCommit || null,
            revertCommit: value.revertCommit || null,
            logsReadTime: value.logsReadTime || null,
            prCreatedTime: value.prCreatedTime || null,
            mergedTime: value.mergedTime || null,
            rolledBackTime: value.rolledBackTime || null,
            resolvedTime: value.resolvedTime || null,
            triggeredTime: value.triggeredTime || null,
            autoMode: value.autoMode || false,
            patchScore: value.patchScore || null,
            triggerType: value.triggerType || "unknown",
            runbookStepsCount: value.runbookSteps ? value.runbookSteps.length : null,
            costSaving: value.costSaving || null,
            patchConfidence: value.patchConfidence || null
        });
    });
    res.json(list);
});

app.get("/api/ledger", (req, res) => {
    if (!readAuditLedger) {
        return res.json([]);
    }
    res.json(readAuditLedger());
});

app.get("/api/approvals", (req, res) => {
    if (!enclaveSimulator) {
        return res.json([]);
    }
    res.json(enclaveSimulator.getPendingApprovals());
});

app.post("/api/approve", (req, res) => {
    const { id, signature } = req.body;
    if (!id || !signature) {
        return res.status(400).json({ error: "Missing approval ID or signature" });
    }
    
    if (!enclaveSimulator) {
        return res.status(500).json({ error: "Simulator not loaded" });
    }
    
    try {
        const success = enclaveSimulator.approveRequest(id, signature);
        if (success) {
            res.json({ status: "approved" });
        } else {
            res.status(401).json({ error: "Invalid signature proof. Address recovery failed." });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/incidents/:id/rollback", async (req, res) => {
    const { id } = req.params;
    if (!activeIncidents) {
        return res.status(500).json({ error: "Modules not loaded" });
    }
    
    const incident = activeIncidents.get(id);
    if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
    }
    
    if (!incident.mergeCommit) {
        return res.status(400).json({ error: "Incident does not have a merge commit to rollback." });
    }
    
    try {
        const { executeRollback } = require("./dist/orchestrator/rollback");
        
        console.log(`[Manual Rollback API] Initiating manual rollback for incident: ${id}`);
        // Run rollback asynchronously
        incident.status = "Rolling Back";
        executeRollback(incident.alert.codeOwnerDID, incident.mergeCommit, id)
            .then(() => {
                incident.status = "Rolled Back";
                incident.rolledBackTime = Date.now();
            })
            .catch(err => {
                console.error(`[Manual Rollback Error] ${err.message}`);
                incident.status = "Failed Rollback: " + err.message;
            });
            
        res.json({ status: "rollback_initiated", id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback HTML router
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(`[Starlight Engine] Control Plane Dashboard running at: http://localhost:${PORT}`);
    console.log(`============================================================\n`);
});
