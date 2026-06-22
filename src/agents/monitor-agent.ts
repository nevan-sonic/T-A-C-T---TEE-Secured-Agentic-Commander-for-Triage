/**
 * Monitoring Agent — detects anomalies, creates incidents, hands off to Execution.
 *
 * Application-level agent DID: did:t3:agent:tact-monitor
 * This is NOT a Terminal3-issued tenant DID.
 *
 * Allowed actions: detectAnomaly, createIncident, readMetrics, writeAudit
 * Forbidden: createPR, mergePR, invokeLLM, executeGit, generateReport
 */

import { AgentDid, AgentHandoffRecord } from "./types";
import { enforceScope, createValidatedHandoff } from "./agent-registry";
import { Alert, IncidentState, activeIncidents } from "../orchestrator/incident-store";
import { writeAudit } from "../orchestrator/audit";
import { handshakeSession, T3Session } from "../orchestrator/agent-core";

const MONITOR_DID: AgentDid = "did:t3:agent:tact-monitor";
const EXECUTION_DID: AgentDid = "did:t3:agent:tact-execution";

export interface MonitorResult {
    incidentId: string;
    session: T3Session;
    handoff: AgentHandoffRecord;
}

/**
 * Run the Monitoring Agent pipeline:
 * 1. Enforce scope (createIncident, writeAudit)
 * 2. Establish T3 session
 * 3. Create incident state in store
 * 4. Ledger-write MONITOR_AGENT_ACTIVATED and LOG_READ
 * 5. Create validated handoff to Execution Agent
 */
export async function runMonitorAgent(alert: Alert): Promise<MonitorResult> {
    // --- Scope enforcement (deny before any side effect) ---
    enforceScope(MONITOR_DID, "createIncident", alert.id);
    enforceScope(MONITOR_DID, "writeAudit", alert.id);

    // --- T3 session handshake ---
    const session = await handshakeSession();

    // --- Create incident state ---
    const triggeredTime = Date.now();
    const incidentState: IncidentState = {
        alert,
        status: "Monitoring",
        severity: alert.severity,
        logs: alert.logs,
        triggeredTime,
        autoMode: false,
        triggerType: "manual",
        activeAgent: MONITOR_DID,
        agentHandoffLog: [],
        pipelineState: "running",
    };
    activeIncidents.set(alert.id, incidentState);

    // --- Ledger writes ---
    await writeAudit({
        action: "MONITOR_AGENT_ACTIVATED",
        actor: MONITOR_DID,
        incidentId: alert.id,
        details: `Monitoring Agent activated for incident ${alert.id}. Service: ${alert.service}, errorRate: ${alert.errorRate}%.`,
    });

    await writeAudit({
        action: "LOG_READ",
        actor: MONITOR_DID,
        incidentId: alert.id,
        details: `Monitoring Agent read ${alert.logs.length} log lines from ${alert.service}.`,
    });

    // --- Validated handoff to Execution Agent ---
    const handoff = createValidatedHandoff({
        sourceAgentDid: MONITOR_DID,
        destinationAgentDid: EXECUTION_DID,
        incidentId: alert.id,
        reason: `Incident ${alert.id} detected. ${alert.service} error rate ${alert.errorRate}%. Handing off for triage and remediation.`,
    });

    // Update incident state with handoff
    const incident = activeIncidents.get(alert.id);
    if (incident) {
        incident.activeAgent = EXECUTION_DID;
        incident.agentHandoffLog = [handoff];
    }

    console.log(`[Monitor Agent] Incident ${alert.id} created. Handoff ${handoff.handoffId} → Execution Agent.`);
    return { incidentId: alert.id, session, handoff };
}
