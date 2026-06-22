   /**
 * Agent Harness — orchestrates the three-agent pipeline:
 *   Monitoring Agent → Execution Agent → Reporting Agent
 *
 * Uses incident-store.ts only for shared state.
 * Updates activeAgent and handoff log.
 * Reporting failure does NOT convert a Resolved/Rolled Back result into Failed.
 * Pipeline failures are ledger-audited safely.
 * Slack notification failure does not fail incident handling.
 */

import { Alert, activeIncidents } from "../orchestrator/incident-store";
import { writeAudit } from "../orchestrator/audit";
import { notifySlack } from "../orchestrator/notify";
import { runMonitorAgent } from "./monitor-agent";
import { runExecutionAgent, ExecutionResult } from "./execution-agent";
import { runReportingAgent } from "./reporting-agent";

/**
 * Run the full three-agent harness for an incident alert.
 *
 * Flow:
 * 1. Monitoring Agent: detect + create incident + handoff
 * 2. Execution Agent: triage + fix + approve + merge + canary + rollback + handoff
 * 3. Reporting Agent: generate post-incident report
 *
 * Reporting failure sets report error but does NOT change execution result.
 */
export async function runAgentHarness(alert: Alert): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Harness] Three-Agent Pipeline starting for incident: ${alert.id}`);
    console.log(`${"=".repeat(60)}`);

    // -----------------------------------------------------------------------
    // Phase 1: Monitoring Agent
    // -----------------------------------------------------------------------
    let monitorResult;
    try {
        monitorResult = await runMonitorAgent(alert);
        console.log(`[Harness] Monitoring Agent complete. Incident ${monitorResult.incidentId} created.`);
    } catch (err: any) {
        console.error(`[Harness] Monitoring Agent failed: ${err.message}`);
        await safeAudit("HARNESS_MONITOR_FAILED", alert.id, err.message);
        await safeNotify(`❌ *Harness:* Monitoring Agent failed for ${alert.id}: ${err.message}`);
        return;
    }

    // -----------------------------------------------------------------------
    // Phase 2: Execution Agent
    // -----------------------------------------------------------------------
    let executionResult: ExecutionResult;
    try {
        executionResult = await runExecutionAgent(
            monitorResult.incidentId,
            monitorResult.session,
            monitorResult.handoff,
        );
        console.log(`[Harness] Execution Agent complete. Status: ${executionResult.finalStatus}`);
    } catch (err: any) {
        console.error(`[Harness] Execution Agent failed: ${err.message}`);
        executionResult = { incidentId: monitorResult.incidentId, finalStatus: "Failed", handoff: null, error: err.message };
        await safeAudit("HARNESS_EXECUTION_FAILED", monitorResult.incidentId, err.message);
        await safeNotify(`❌ *Harness:* Execution Agent failed for ${alert.id}: ${err.message}`);

        // Mark incident as failed
        const incident = activeIncidents.get(monitorResult.incidentId);
        if (incident) {
            incident.status = "Failed - " + err.message;
            incident.pipelineState = "failed";
        }
    }

    // -----------------------------------------------------------------------
    // Phase 3: Reporting Agent
    // -----------------------------------------------------------------------
    if (executionResult.handoff) {
        try {
            const reportResult = await runReportingAgent(
                executionResult.incidentId,
                executionResult.handoff,
            );

            if (reportResult.report) {
                console.log(`[Harness] Reporting Agent complete. Report stored.`);
            } else {
                console.warn(`[Harness] Reporting Agent returned no report: ${reportResult.error || "unknown"}`);
                // Reporting failure does NOT change execution result
                await safeAudit("HARNESS_REPORT_WARNING", executionResult.incidentId, reportResult.error || "No report generated");
            }
        } catch (err: any) {
            console.error(`[Harness] Reporting Agent failed: ${err.message}`);
            // Reporting failure does NOT convert Resolved/Rolled Back into Failed
            await safeAudit("HARNESS_REPORT_FAILED", executionResult.incidentId, err.message);

            const incident = activeIncidents.get(executionResult.incidentId);
            if (incident) {
                // Only update status to note report failure — preserve execution result
                incident.status = incident.status + " (report unavailable)";
            }
        }
    } else {
        console.log(`[Harness] No handoff to Reporting Agent (execution did not produce one).`);
        await safeAudit("HARNESS_NO_REPORT_HANDOFF", executionResult.incidentId, "Execution did not produce a reporting handoff.");
    }

    // -----------------------------------------------------------------------
    // Final summary
    // -----------------------------------------------------------------------
    const finalIncident = activeIncidents.get(executionResult.incidentId);
    console.log(`${"=".repeat(60)}`);
    console.log(`[Harness] Pipeline complete. Incident ${executionResult.incidentId}: ${finalIncident?.status || executionResult.finalStatus}`);
    console.log(`${"=".repeat(60)}\n`);

    await safeNotify(`🏁 *Pipeline complete:* ${executionResult.incidentId} — ${finalIncident?.status || executionResult.finalStatus}`);
}

// ---------------------------------------------------------------------------
// Safe helpers — never throw
// ---------------------------------------------------------------------------

async function safeAudit(action: string, incidentId: string, details: string): Promise<void> {
    try {
        await writeAudit({ action, actor: "did:t3:agent:tact-harness", incidentId, details });
    } catch {
        console.log(`[Harness] Audit write failed: ${action} for ${incidentId}`);
    }
}

async function safeNotify(message: string): Promise<void> {
    try {
        await notifySlack(message);
    } catch {
        // Slack failure must not fail incident handling
    }
}
