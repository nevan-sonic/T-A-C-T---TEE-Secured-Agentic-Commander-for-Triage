/**
 * Agent Registry — application-level logical registry for three T.A.C.T agents.
 *
 * IMPORTANT TRUTHFULNESS NOTES:
 * - The DIDs here (did:t3:agent:tact-*) are application-level identifiers,
 *   NOT real Terminal3-issued tenant DIDs.
 * - demoPolicyCredential is a non-secret identifier only.
 * - "Validated handoffs" use crypto.randomUUID(), not cryptographic signing.
 * - Trust scores are demo-policy scores, not cryptographically anchored.
 * - Scope enforcement writes to the existing audit ledger using only
 *   permitted LedgerEntry fields.
 */

import * as crypto from "crypto";
import type {
    AgentRole,
    AgentDid,
    AgentAuditEntry,
    AgentHandoffPayload,
    AgentHandoffRecord,
} from "./types";

// ---------------------------------------------------------------------------
// Agent definition (internal)
// ---------------------------------------------------------------------------
interface AgentDefinition {
    did: AgentDid;
    name: string;
    role: AgentRole;
    scopes: string[];
    allowedActions: ReadonlySet<string>;
    forbiddenActions: ReadonlySet<string>;
    demoPolicyCredential: string; // non-secret identifier, never exposed in API responses
    trustScore: number;
    incidentCount: number;
    lastActiveAt: number;
    auditHistory: AgentAuditEntry[];
}

// ---------------------------------------------------------------------------
// Three agent definitions
// ---------------------------------------------------------------------------
const agents: Map<AgentDid, AgentDefinition> = new Map();

function defineAgent(def: Omit<AgentDefinition, "trustScore" | "incidentCount" | "lastActiveAt" | "auditHistory">): void {
    agents.set(def.did, {
        ...def,
        trustScore: 100,
        incidentCount: 0,
        lastActiveAt: 0,
        auditHistory: [],
    });
}

// 1. Monitoring Agent
defineAgent({
    did: "did:t3:agent:tact-monitor",
    name: "Monitoring Agent",
    role: "monitor",
    scopes: ["read:metrics", "read:logs", "write:alerts"],
    allowedActions: new Set(["detectAnomaly", "createIncident", "readMetrics", "writeAudit"]),
    forbiddenActions: new Set(["createPR", "mergePR", "invokeLLM", "executeGit", "generateReport"]),
    demoPolicyCredential: "cred-monitor-demo-001",
});

// 2. Execution Agent (triage + fix + approval + merge + rollback)
defineAgent({
    did: "did:t3:agent:tact-execution",
    name: "Execution Agent",
    role: "execution",
    scopes: ["read:logs", "invoke:llm", "write:repo", "create:pr", "execute:merge", "execute:rollback"],
    allowedActions: new Set([
        "analyzeLogs", "classifySeverity", "validatePatch",
        "createPR", "requestApproval", "mergePR",
        "executeRollback", "writeAudit",
    ]),
    forbiddenActions: new Set(["detectAnomaly", "generateReport", "readMetrics"]),
    demoPolicyCredential: "cred-execution-demo-002",
});

// 3. Reporting Agent
defineAgent({
    did: "did:t3:agent:tact-reporting",
    name: "Reporting Agent",
    role: "reporting",
    scopes: ["read:audit", "read:incidents", "write:report", "invoke:llm"],
    allowedActions: new Set(["readAuditLedger", "generateReport", "writeReport", "writeAudit"]),
    forbiddenActions: new Set(["createPR", "mergePR", "executeGit", "detectAnomaly", "requestApproval"]),
    demoPolicyCredential: "cred-reporting-demo-003",
});

// ---------------------------------------------------------------------------
// Ledger writer (lazy-loaded to avoid import-time circular deps)
// ---------------------------------------------------------------------------
function writeLedgerEntry(action: string, actor: string, incidentId?: string, details?: string): void {
    try {
        const { enclaveSimulator } = require("../sdk-wrapper/enclave-sim");
        enclaveSimulator.writeLedger({
            action,
            actor,
            incidentId,
            timestamp: Date.now(),
            details,
        });
    } catch {
        // Ledger unavailable — log to console only
        console.log(`[AgentRegistry] Ledger write: ${action} by ${actor}${incidentId ? ` (${incidentId})` : ""}`);
    }
}

// ---------------------------------------------------------------------------
// Scope enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce that an agent is allowed to perform the given action.
 *
 * - Denies actions in the forbidden set AND actions NOT in the allowed set.
 * - On denial: decrements trustScore by 10, records audit history,
 *   writes SCOPE_VIOLATION to the audit ledger, then throws.
 * - On success: records audit history but does NOT increment incidentCount
 *   (that happens only on completed incident participation).
 */
export function enforceScope(agentDid: AgentDid, action: string, incidentId?: string): void {
    const agent = agents.get(agentDid);
    if (!agent) {
        throw new Error(`[AgentRegistry] Unknown agent: ${agentDid}`);
    }

    const isForbidden = agent.forbiddenActions.has(action);
    const isAllowed = agent.allowedActions.has(action);

    if (isForbidden || !isAllowed) {
        // Decrement trust score
        agent.trustScore = Math.max(0, agent.trustScore - 10);
        agent.lastActiveAt = Date.now();

        // Record in agent audit history
        const entry: AgentAuditEntry = {
            timestamp: Date.now(),
            agentDid,
            role: agent.role,
            action,
            incidentId,
            success: false,
            details: `Scope violation: action '${action}' is ${isForbidden ? "forbidden" : "not permitted"} for role '${agent.role}'`,
        };
        agent.auditHistory.push(entry);

        // Write to the existing audit ledger
        writeLedgerEntry(
            "SCOPE_VIOLATION",
            agentDid,
            incidentId,
            `Action '${action}' denied for ${agent.name} (role: ${agent.role}). Trust score: ${agent.trustScore}.`
        );

        throw new Error(
            `[AgentRegistry] Scope violation: ${agent.name} (${agent.role}) is not permitted to perform '${action}'. ` +
            `Trust score reduced to ${agent.trustScore}.`
        );
    }

    // Action is allowed — record audit but do NOT increment incidentCount
    agent.lastActiveAt = Date.now();
    agent.auditHistory.push({
        timestamp: Date.now(),
        agentDid,
        role: agent.role,
        action,
        incidentId,
        success: true,
    });
}

/**
 * Increment the incident count for an agent.
 * Call this ONLY when an agent successfully participates in a completed incident.
 */
export function recordCompletedIncident(agentDid: AgentDid): void {
    const agent = agents.get(agentDid);
    if (!agent) return;
    agent.incidentCount += 1;
    agent.lastActiveAt = Date.now();
}

// ---------------------------------------------------------------------------
// Validated handoffs
// ---------------------------------------------------------------------------

/** Allowed handoff routes (source role → valid destination roles). */
const ALLOWED_HANDOFFS: Record<AgentRole, AgentRole[]> = {
    monitor: ["execution"],
    execution: ["reporting", "monitor"],
    reporting: ["monitor"],
};

/**
 * Create a validated handoff between two agents.
 * Uses crypto.randomUUID() for the handoff ID.
 * Writes AGENT_HANDOFF to the audit ledger.
 */
export function createValidatedHandoff(payload: AgentHandoffPayload): AgentHandoffRecord {
    const source = agents.get(payload.sourceAgentDid);
    const destination = agents.get(payload.destinationAgentDid);

    if (!source) {
        throw new Error(`[AgentRegistry] Unknown source agent: ${payload.sourceAgentDid}`);
    }
    if (!destination) {
        throw new Error(`[AgentRegistry] Unknown destination agent: ${payload.destinationAgentDid}`);
    }

    const allowedTargets = ALLOWED_HANDOFFS[source.role];
    if (!allowedTargets || !allowedTargets.includes(destination.role)) {
        throw new Error(
            `[AgentRegistry] Invalid handoff: ${source.name} (${source.role}) cannot hand off to ${destination.name} (${destination.role}).`
        );
    }

    const record: AgentHandoffRecord = {
        handoffId: crypto.randomUUID(),
        sourceAgentDid: payload.sourceAgentDid,
        destinationAgentDid: payload.destinationAgentDid,
        incidentId: payload.incidentId,
        reason: payload.reason,
        timestamp: Date.now(),
    };

    // Write to audit ledger
    writeLedgerEntry(
        "AGENT_HANDOFF",
        payload.sourceAgentDid,
        payload.incidentId,
        `Handoff ${record.handoffId}: ${source.name} → ${destination.name}. Reason: ${payload.reason}`
    );

    return record;
}

/**
 * Verify a validated handoff is still valid.
 *
 * Checks:
 * - Source DID is a known agent
 * - Destination DID is a known agent
 * - Incident ID is non-empty
 * - Timestamp is within 5 minutes
 * - Handoff ID is non-empty
 */
export function verifyValidatedHandoff(record: AgentHandoffRecord): boolean {
    if (!record.handoffId || record.handoffId.length === 0) {
        console.log("[AgentRegistry] Handoff verification failed: empty handoffId");
        return false;
    }
    if (!record.incidentId || record.incidentId.length === 0) {
        console.log("[AgentRegistry] Handoff verification failed: empty incidentId");
        return false;
    }

    const source = agents.get(record.sourceAgentDid);
    const destination = agents.get(record.destinationAgentDid);
    if (!source || !destination) {
        console.log("[AgentRegistry] Handoff verification failed: unknown agent DID");
        return false;
    }

    const FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const age = Date.now() - record.timestamp;
    if (age < 0 || age > FRESHNESS_WINDOW_MS) {
        console.log(`[AgentRegistry] Handoff verification failed: expired (age: ${Math.round(age / 1000)}s, max: 300s)`);
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/**
 * Return a safe public snapshot for all agents.
 * NEVER returns credentials or secrets.
 */
export function getAgentStatusSnapshot(): Array<{
    did: AgentDid;
    name: string;
    role: AgentRole;
    scopes: string[];
    trustScore: number;
    incidentCount: number;
    lastActiveAt: number;
    recentActions: string[];
}> {
    const snapshots: Array<ReturnType<typeof getAgentStatusSnapshot>[0]> = [];

    for (const agent of agents.values()) {
        const recentActions = agent.auditHistory
            .slice(-10)
            .map(e => `${e.action}${e.success ? "" : " (denied)"}`);

        snapshots.push({
            did: agent.did,
            name: agent.name,
            role: agent.role,
            scopes: [...agent.scopes],
            trustScore: agent.trustScore,
            incidentCount: agent.incidentCount,
            lastActiveAt: agent.lastActiveAt,
            recentActions,
        });
    }

    return snapshots;
}

/**
 * Get a single agent's snapshot by DID.
 */
export function getAgentByDid(agentDid: AgentDid): ReturnType<typeof getAgentStatusSnapshot>[0] | undefined {
    const agent = agents.get(agentDid);
    if (!agent) return undefined;

    const recentActions = agent.auditHistory
        .slice(-10)
        .map(e => `${e.action}${e.success ? "" : " (denied)"}`);

    return {
        did: agent.did,
        name: agent.name,
        role: agent.role,
        scopes: [...agent.scopes],
        trustScore: agent.trustScore,
        incidentCount: agent.incidentCount,
        lastActiveAt: agent.lastActiveAt,
        recentActions,
    };
}
