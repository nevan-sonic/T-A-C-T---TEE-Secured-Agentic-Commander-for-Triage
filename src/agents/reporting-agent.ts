/**
 * Reporting Agent — generates post-incident reports.
 *
 * Application-level agent DID: did:t3:agent:tact-reporting
 * This is NOT a Terminal3-issued tenant DID.
 *
 * Allowed: readAuditLedger, generateReport, writeReport, writeAudit
 * Forbidden: createPR, mergePR, executeGit, detectAnomaly, requestApproval
 *
 * IMPORTANT: Reporting never changes the execution result status.
 */

import { AgentDid, AgentHandoffRecord } from "./types";
import { enforceScope, createValidatedHandoff, verifyValidatedHandoff, recordCompletedIncident } from "./agent-registry";
import { activeIncidents } from "../orchestrator/incident-store";
import { writeAudit, readAuditLedger } from "../orchestrator/audit";
import { notifySlack } from "../orchestrator/notify";

const REPORTING_DID: AgentDid = "did:t3:agent:tact-reporting";
const MONITOR_DID: AgentDid = "did:t3:agent:tact-monitor";
const GROQ_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Extended report schema (Phase 2)
// ---------------------------------------------------------------------------
export interface DetailedIncidentReport {
    incidentId: string;
    executiveSummary: string;
    timeline: Array<{ time: number; event: string; agent: string }>;
    rootCause: string;
    fixApplied: string;
    approvalChain: string[];
    duration: number;
    resolutionStatus: string;
    recommendations: string[];
    agentHandoffChain: Array<{ from: string; to: string; reason: string; timestamp: number }>;
    auditLedgerEntryCount: number;
    generatedAt: number;
    generatedByAgent: AgentDid;
}

// In-memory report store for fast API access
const reportStore = new Map<string, DetailedIncidentReport>();

/**
 * Retrieve a stored report by incident ID.
 */
export function getStoredReport(incidentId: string): DetailedIncidentReport | undefined {
    return reportStore.get(incidentId);
}

/**
 * Run the Reporting Agent pipeline:
 * 1. Verify execution → reporting handoff
 * 2. Enforce scope
 * 3. Read incident state + ledger entries
 * 4. Generate report via Groq (or deterministic fallback)
 * 5. Store report in simulator KV + in-memory
 * 6. Ledger-write REPORT_GENERATED
 * 7. Handoff back to monitor
 */
export async function runReportingAgent(
    incidentId: string,
    executionHandoff: AgentHandoffRecord,
): Promise<{ report: DetailedIncidentReport | null; error?: string }> {
    // --- Verify handoff ---
    if (!verifyValidatedHandoff(executionHandoff)) {
        const error = "Invalid or expired handoff from Execution Agent.";
        await writeAudit({ action: "REPORTING_HANDOFF_REJECTED", actor: REPORTING_DID, incidentId, details: error });
        return { report: null, error };
    }

    // --- Scope enforcement ---
    enforceScope(REPORTING_DID, "generateReport", incidentId);
    enforceScope(REPORTING_DID, "readAuditLedger", incidentId);
    enforceScope(REPORTING_DID, "writeAudit", incidentId);

    const incident = activeIncidents.get(incidentId);
    if (!incident) {
        return { report: null, error: "Incident not found in store." };
    }

    incident.activeAgent = REPORTING_DID;

    try {
        // --- Read ledger entries ---
        const allLedger = readAuditLedger();
        const incidentLedger = allLedger.filter(e => e.incidentId === incidentId);

        // --- Build timeline from ledger ---
        const timeline = incidentLedger.map(entry => ({
            time: entry.timestamp,
            event: entry.action,
            agent: entry.actor,
        })).sort((a, b) => a.time - b.time);

        // --- Build handoff chain ---
        const handoffChain = (incident.agentHandoffLog || []).map(h => ({
            from: h.sourceAgentDid,
            to: h.destinationAgentDid,
            reason: h.reason,
            timestamp: h.timestamp,
        }));

        // --- Build approval chain ---
        const approvalChain = incidentLedger
            .filter(e => e.action === "MERGE_EXECUTED" || e.action === "PATCH_VALIDATED")
            .map(e => e.actor);

        // --- Calculate duration ---
        const startTime = incident.triggeredTime || Date.now();
        const endTime = incident.resolvedTime || incident.rolledBackTime || Date.now();
        const duration = endTime - startTime;

        // --- Generate executive summary + recommendations via Groq or fallback ---
        let executiveSummary: string;
        let recommendations: string[];

        const groqAvailable = await checkGroqAvailable();
        if (groqAvailable) {
            try {
                const groqResult = await generateReportWithGroq(incident, incidentLedger);
                executiveSummary = groqResult.executiveSummary;
                recommendations = groqResult.recommendations;
            } catch {
                const fallback = generateDeterministicReport(incident);
                executiveSummary = fallback.executiveSummary;
                recommendations = fallback.recommendations;
            }
        } else {
            const fallback = generateDeterministicReport(incident);
            executiveSummary = fallback.executiveSummary;
            recommendations = fallback.recommendations;
        }

        // --- Assemble report ---
        enforceScope(REPORTING_DID, "writeReport", incidentId);

        const report: DetailedIncidentReport = {
            incidentId,
            executiveSummary,
            timeline,
            rootCause: incident.rootCause || "Unknown",
            fixApplied: incident.patch ? "Patch applied and merged" : "No patch applied",
            approvalChain,
            duration,
            resolutionStatus: incident.status,
            recommendations,
            agentHandoffChain: handoffChain,
            auditLedgerEntryCount: incidentLedger.length,
            generatedAt: Date.now(),
            generatedByAgent: REPORTING_DID,
        };

        // --- Sanitize report: strip any secrets ---
        const sanitized = JSON.stringify(report)
            .replace(/(gsk_|ghp_|AKIA|sk-)[a-zA-Z0-9_\-]{8,}/g, "[REDACTED]")
            .replace(/0x[a-fA-F0-9]{32,}/g, "[REDACTED_KEY]");

        const sanitizedReport = JSON.parse(sanitized) as DetailedIncidentReport;

        // --- Store in simulator KV map ---
        try {
            const { enclaveSimulator } = require("../sdk-wrapper/enclave-sim");
            const tid = "system";
            // Create reports map if absent
            try {
                enclaveSimulator.createMap(tid, "reports", "public", ["1001"], ["*"]);
            } catch { /* map may already exist */ }
            enclaveSimulator.setMapEntry(tid, "reports", `report_${incidentId}`, JSON.stringify(sanitizedReport));
        } catch (kvErr: any) {
            console.warn(`[Reporting Agent] KV store write failed: ${kvErr.message}`);
        }

        // --- Store in memory for fast API access ---
        reportStore.set(incidentId, sanitizedReport);

        // --- Also store in IncidentState for backward compat ---
        incident.report = {
            incidentId,
            title: `Incident ${incidentId}: ${incident.alert.service}`,
            severity: incident.severity,
            rootCause: sanitizedReport.rootCause,
            resolution: sanitizedReport.resolutionStatus,
            timeline: timeline.map(t => ({ timestamp: t.time, event: t.event })),
            generatedAt: sanitizedReport.generatedAt,
            generatedBy: REPORTING_DID,
        };

        // --- Ledger write ---
        await writeAudit({
            action: "REPORT_GENERATED",
            actor: REPORTING_DID,
            incidentId,
            details: `Report generated. Duration: ${(duration / 1000).toFixed(1)}s. Status: ${sanitizedReport.resolutionStatus}.`,
        });

        recordCompletedIncident(REPORTING_DID);

        // --- Handoff back to monitor ---
        try {
            const backHandoff = createValidatedHandoff({
                sourceAgentDid: REPORTING_DID,
                destinationAgentDid: MONITOR_DID,
                incidentId,
                reason: "Report generated. Returning to monitoring state.",
            });
            if (!incident.agentHandoffLog) incident.agentHandoffLog = [];
            incident.agentHandoffLog.push(backHandoff);
            incident.activeAgent = MONITOR_DID;
        } catch { /* non-fatal */ }

        await notifySlack(`📋 *Post-Incident Report* generated for ${incidentId}.`).catch(() => {});

        console.log(`[Reporting Agent] Report generated for incident ${incidentId}.`);
        return { report: sanitizedReport };

    } catch (err: any) {
        console.error(`[Reporting Agent] Error: ${err.message}`);
        await writeAudit({ action: "REPORT_FAILED", actor: REPORTING_DID, incidentId, details: err.message });
        return { report: null, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// Groq helpers
// ---------------------------------------------------------------------------

async function checkGroqAvailable(): Promise<boolean> {
    try {
        require.resolve("groq-sdk");
        const apiKey = process.env.GROQ_API_KEY;
        return !!apiKey && !apiKey.startsWith("gsk_mock") && apiKey !== "";
    } catch {
        return false;
    }
}

async function generateReportWithGroq(
    incident: any,
    ledgerEntries: any[],
): Promise<{ executiveSummary: string; recommendations: string[] }> {
    const Groq = require("groq-sdk");
    const apiKey = process.env.GROQ_API_KEY;
    const groq = new Groq({ apiKey });

    const prompt = `You are a post-incident reporting agent. Generate a concise executive summary and recommendations.

Incident: ${incident.alert.id}
Service: ${incident.alert.service}
Severity: ${incident.severity}
Root Cause: ${incident.rootCause || "Unknown"}
Status: ${incident.status}
Error Rate: ${incident.alert.errorRate}%
Logs analyzed: ${incident.logs?.length || 0} lines
Ledger entries: ${ledgerEntries.length}

Respond with JSON only:
{
  "executiveSummary": "2-3 sentence summary",
  "recommendations": ["rec1", "rec2", "rec3"]
}`;

    const completion = await Promise.race([
        groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a post-incident reporting agent. Respond with JSON only." },
                { role: "user", content: prompt },
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Groq timeout")), GROQ_TIMEOUT_MS)),
    ]);

    const content = (completion as any).choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty Groq response");

    const parsed = JSON.parse(content);
    return {
        executiveSummary: parsed.executiveSummary || "Report generation incomplete.",
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
}

function generateDeterministicReport(incident: any): { executiveSummary: string; recommendations: string[] } {
    const summary = `Incident ${incident.alert?.id || "unknown"} on service ${incident.alert?.service || "unknown"} ` +
        `was ${incident.status || "processed"}. Root cause: ${incident.rootCause || "Under investigation"}. ` +
        `Severity: ${incident.severity || "unknown"}. Error rate at detection: ${incident.alert?.errorRate || 0}%.`;

    const recommendations: string[] = [
        "Review connection pool sizing and auto-scaling thresholds.",
        "Add proactive alerting for resource exhaustion patterns.",
        "Consider implementing circuit breakers for downstream dependencies.",
    ];

    if (incident.status === "Rolled Back") {
        recommendations.push("Investigate why the fix caused regression — review canary metrics thresholds.");
    }

    return { executiveSummary: summary, recommendations };
}
