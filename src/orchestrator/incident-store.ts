/**
 * Incident Store — shared types and state for incident tracking.
 *
 * This module is the single source of truth for the activeIncidents Map.
 * It exists to prevent circular imports between agent-core and future
 * agent modules (monitor, execution, reporting).
 *
 * IMPORTANT: This module must NOT import from agent modules or agent-registry.
 */

import type { RunbookStep } from "./llm";
import type { AgentDid, AgentHandoffRecord, IncidentReportSummary } from "../agents/types";

// ---------------------------------------------------------------------------
// Alert — the raw webhook/alert payload entering the system
// ---------------------------------------------------------------------------
export interface Alert {
    id: string;
    severity: string;
    service: string;
    triggeredAt: string;
    errorRate: number;
    p99Latency: number;
    logs: string[];
    onCallEngineerDID: string;
    codeOwnerDID: string;
}

// ---------------------------------------------------------------------------
// IncidentState — full tracked state for a single incident
// ---------------------------------------------------------------------------
export interface IncidentState {
    alert: Alert;
    status: string;
    severity: string;
    logs: string[];
    rootCause?: string;
    patch?: string;
    prUrl?: string;
    prNumber?: number;
    branch?: string;
    mergeCommit?: string;
    revertCommit?: string;
    logsReadTime?: number;
    prCreatedTime?: number;
    mergedTime?: number;
    resolvedTime?: number;
    rolledBackTime?: number;
    triggeredTime?: number;
    patchScore?: number;
    autoMode?: boolean;
    triggerType?: "manual" | "webhook" | "auto-traffic" | "github-cve" | "pagerduty" | "cloudwatch";
    patchConfidence?: number;
    canaryResults?: Array<{ timestamp: number; errorRate: number; latency: number; pass: boolean }>;
    runbookSteps?: RunbookStep[];
    costSaving?: number;
    session?: unknown; // T3Session — typed as unknown to avoid circular import

    // --- Phase 1 agent identity fields ---
    activeAgent?: AgentDid;
    agentHandoffLog?: AgentHandoffRecord[];
    report?: IncidentReportSummary;
    pipelineState?: "idle" | "running" | "completed" | "failed";
}

// ---------------------------------------------------------------------------
// activeIncidents — the global Map shared across all handlers
// ---------------------------------------------------------------------------
export const activeIncidents = new Map<string, IncidentState>();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Retrieve an incident by ID. Returns undefined if not found.
 */
export function getIncident(incidentId: string): IncidentState | undefined {
    return activeIncidents.get(incidentId);
}

/**
 * Update an incident's status and optionally merge additional fields.
 */
export function updateIncident(
    incidentId: string,
    status: string,
    fields?: Partial<IncidentState>
): void {
    const incident = activeIncidents.get(incidentId);
    if (!incident) return;

    incident.status = status;
    if (fields) {
        Object.assign(incident, fields);
    }
}
