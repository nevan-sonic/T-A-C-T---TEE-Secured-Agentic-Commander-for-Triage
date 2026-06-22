/**
 * Execution Agent — triage, fix, approval, merge, canary, rollback.
 *
 * Application-level agent DID: did:t3:agent:tact-execution
 * This is NOT a Terminal3-issued tenant DID.
 *
 * Allowed: analyzeLogs, classifySeverity, validatePatch, createPR,
 *          requestApproval, mergePR, executeRollback, writeAudit
 * Forbidden: detectAnomaly, generateReport, readMetrics
 */

import * as path from "path";
import * as fs from "fs";
import { AgentDid, AgentHandoffRecord } from "./types";
import { enforceScope, createValidatedHandoff, recordCompletedIncident } from "./agent-registry";
import { verifyValidatedHandoff } from "./agent-registry";
import { activeIncidents } from "../orchestrator/incident-store";
import { writeAudit } from "../orchestrator/audit";
import {
    T3Session,
    ApprovalResult,
    authenticateUser,
    requestDelegation,
    personas,
} from "../orchestrator/agent-core";
import { analyzeLogs, DIAGNOSIS_PROMPT } from "../orchestrator/llm";
import { classifySeverity, getSeverityConfig, Severity, SEVERITY_PROMPT } from "../orchestrator/severity";
import { validatePatch } from "../orchestrator/validate";
import { createPR, initializeLocalRepo } from "../orchestrator/github";
import { requestApprovals } from "../orchestrator/approvals";
import { executeMerge } from "../orchestrator/execute";
import { executeRollback } from "../orchestrator/rollback";
import { runCanaryWindow } from "../orchestrator/canary";
import { notifySlack } from "../orchestrator/notify";

const EXECUTION_DID: AgentDid = "did:t3:agent:tact-execution";
const REPORTING_DID: AgentDid = "did:t3:agent:tact-reporting";

// Timeout constants
const LLM_TIMEOUT_MS = 30_000;
const GITHUB_TIMEOUT_MS = 45_000;
const TELEMETRY_POLL_TIMEOUT_MS = 5_000;

export type ExecutionFinalStatus = "Resolved" | "Rolled Back" | "Failed";

export interface ExecutionResult {
    incidentId: string;
    finalStatus: ExecutionFinalStatus;
    handoff: AgentHandoffRecord | null;
    error?: string;
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

/**
 * Run the Execution Agent pipeline:
 * 1. Verify incoming monitor → execution handoff
 * 2. Idempotency check
 * 3. Log analysis + severity classification
 * 4. Patch validation
 * 5. Create PR
 * 6. Approval polling (preserved from existing flow)
 * 7. Merge
 * 8. Canary monitoring
 * 9. Rollback if needed
 * 10. Handoff to Reporting Agent
 */
export async function runExecutionAgent(
    incidentId: string,
    session: T3Session,
    monitorHandoff: AgentHandoffRecord,
): Promise<ExecutionResult> {
    // --- Verify handoff from monitor ---
    if (!verifyValidatedHandoff(monitorHandoff)) {
        const error = "Invalid or expired handoff from Monitoring Agent.";
        await writeAudit({ action: "EXECUTION_HANDOFF_REJECTED", actor: EXECUTION_DID, incidentId, details: error });
        return { incidentId, finalStatus: "Failed", handoff: null, error };
    }

    // --- Scope enforcement ---
    enforceScope(EXECUTION_DID, "analyzeLogs", incidentId);

    const incident = activeIncidents.get(incidentId);
    if (!incident) {
        return { incidentId, finalStatus: "Failed", handoff: null, error: "Incident not found in store." };
    }

    // --- Idempotency: if pipeline already running/completed, return existing state ---
    if (incident.pipelineState === "completed") {
        console.log(`[Execution Agent] Incident ${incidentId} already completed. Skipping duplicate pipeline.`);
        const finalStatus: ExecutionFinalStatus =
            incident.status === "Rolled Back" ? "Rolled Back" :
            incident.status === "Resolved" ? "Resolved" : "Resolved";
        return { incidentId, finalStatus, handoff: null };
    }
    if (incident.pipelineState === "running" && incident.prUrl) {
        console.log(`[Execution Agent] Incident ${incidentId} pipeline already running with PR. Returning existing state.`);
        return { incidentId, finalStatus: "Resolved", handoff: null };
    }

    incident.pipelineState = "running";
    incident.activeAgent = EXECUTION_DID;
    const alert = incident.alert;

    try {
        // --- Initialize local repo ---
        initializeLocalRepo();

        await notifySlack(`🤖 *Execution Agent* activated for incident ${incidentId}.`);

        // --- Step 1: Analyze logs (LLM, 30s timeout) ---
        incident.status = "Analyzing Logs in TEE";
        enforceScope(EXECUTION_DID, "writeAudit", incidentId);

        let sourceCode = "";
        try {
            const codePath = path.join(process.cwd(), "app_service.js");
            if (fs.existsSync(codePath)) sourceCode = fs.readFileSync(codePath, "utf-8");
        } catch { /* ignore */ }

        const diagnosis = await withTimeout(
            authenticateUser({
                session,
                delegateDID: alert.onCallEngineerDID,
                scope: "repo:read",
                functionName: "investigate-logs",
                input: {
                    system_prompt: DIAGNOSIS_PROMPT,
                    user_prompt: `Incident logs:\n${alert.logs.join("\n")}\n\nTarget Code File (app_service.js):\n${sourceCode}`,
                    model: "llama-3.3-70b-versatile",
                },
                action: async (secureContext) => {
                    return analyzeLogs(alert.logs, secureContext);
                },
            }),
            LLM_TIMEOUT_MS,
            "LLM log analysis",
        );

        incident.rootCause = diagnosis.rootCause;
        incident.patch = diagnosis.patch;
        incident.logsReadTime = Date.now();

        await writeAudit({ action: "LOG_READ", actor: EXECUTION_DID, incidentId });
        await writeAudit({ action: "LLM_INVOKED_IN_TEE", actor: EXECUTION_DID, incidentId, details: "Groq analysis complete." });

        // --- Step 2: Patch validation ---
        incident.status = "Validating Patch in TEE";
        enforceScope(EXECUTION_DID, "validatePatch", incidentId);

        const validation = validatePatch(diagnosis.patch, "db-pool");
        incident.patchScore = validation.score;
        incident.patchConfidence = validation.score;

        await writeAudit({
            action: "PATCH_VALIDATED",
            actor: EXECUTION_DID,
            incidentId,
            details: `Score: ${validation.score}/100. Safe: ${validation.safe}.`,
        });

        if (!validation.safe) {
            incident.status = "Awaiting Manual Review";
            await notifySlack(`⚠ *Patch Validation Failed:* Score ${validation.score}/100. ${validation.reason}`);
            return { incidentId, finalStatus: "Failed", handoff: null, error: `Patch unsafe: ${validation.reason}` };
        }

        // --- Step 3: Classify severity (LLM, 30s timeout) ---
        incident.status = "Classifying Severity";
        enforceScope(EXECUTION_DID, "classifySeverity", incidentId);

        const severityResult = await withTimeout(
            authenticateUser({
                session,
                delegateDID: alert.onCallEngineerDID,
                scope: "severity:classify",
                functionName: "investigate-logs",
                input: {
                    system_prompt: SEVERITY_PROMPT,
                    user_prompt: `Incident logs:\n${alert.logs.join("\n")}`,
                    model: "llama-3.3-70b-versatile",
                },
                action: async (secureContext) => {
                    const sevStr = await classifySeverity(alert.logs, secureContext);
                    return { severity: sevStr };
                },
            }),
            LLM_TIMEOUT_MS,
            "LLM severity classification",
        );

        const severity = ((severityResult as any)?.severity || severityResult) as Severity;
        incident.severity = severity;
        const config = getSeverityConfig(severity);

        // --- Step 4: Create PR (GitHub, 45s timeout) ---
        incident.status = "Drafting Pull Request";
        enforceScope(EXECUTION_DID, "createPR", incidentId);

        const prDetails = await withTimeout(
            authenticateUser({
                session,
                delegateDID: alert.codeOwnerDID,
                scope: "repo:write",
                functionName: "create-fix-pr",
                input: { repo: process.env.GITHUB_REPO || "Starlight-Local/department-of-incidents" },
                action: async () => createPR(diagnosis.patch, {}),
            }),
            GITHUB_TIMEOUT_MS,
            "GitHub createPR",
        );

        incident.prUrl = prDetails.prUrl;
        incident.prNumber = prDetails.prNumber;
        incident.branch = prDetails.branch;
        incident.prCreatedTime = Date.now();
        incident.status = "Awaiting Approvals";

        await notifySlack(`🔧 *PR Created:* [PR #${prDetails.prNumber}](${prDetails.prUrl})`);

        // --- Step 5: Approval polling (preserved existing mechanism) ---
        let approvalResults: ApprovalResult[] = [];
        if (config.approvalsRequired > 0) {
            enforceScope(EXECUTION_DID, "requestApproval", incidentId);
            const approvers = config.approvalsRequired === 1
                ? [alert.codeOwnerDID]
                : [alert.codeOwnerDID, personas.charlie || "simulatedFallbackDid:charlie:default"];

            await notifySlack(`⏳ *Awaiting ${config.approvalsRequired} cryptographic signature(s)...*`);
            approvalResults = await requestApprovals(session, approvers, incidentId);
        }

        // --- Step 6: Merge (GitHub, 45s timeout) ---
        incident.status = "Merging Fix";
        enforceScope(EXECUTION_DID, "mergePR", incidentId);

        const primaryApproval = approvalResults.length > 0
            ? approvalResults[0]
            : { approverDID: alert.codeOwnerDID, credential: session.authorizedDIDs.get(alert.codeOwnerDID) || "auto_token", signedAt: Date.now() };

        const mergeResult = await withTimeout(
            executeMerge(session, primaryApproval, incident.branch!, incident.prUrl!),
            GITHUB_TIMEOUT_MS,
            "GitHub merge",
        );

        incident.mergeCommit = mergeResult.sha;
        incident.mergedTime = Date.now();
        incident.status = "Monitoring Fix";

        await notifySlack(`✅ *PR Merged:* Commit \`${mergeResult.sha.substring(0, 7)}\``);

        // --- Step 7: Canary window ---
        const port = parseInt(process.env.PORT || "3000");
        const canaryResult = await runCanaryWindow(incidentId, primaryApproval.approverDID, port);
        incident.canaryResults = canaryResult.observations.map(o => ({
            timestamp: o.timestamp, errorRate: o.errorRate, latency: o.latency, pass: o.passed,
        }));

        // --- Step 8: Rollback decision ---
        let finalStatus: ExecutionFinalStatus;
        if (canaryResult.verdict === "Regression Detected") {
            incident.status = "Rolling Back";
            enforceScope(EXECUTION_DID, "executeRollback", incidentId);

            await executeRollback(primaryApproval.approverDID, mergeResult.sha, incidentId);
            incident.status = "Rolled Back";
            incident.rolledBackTime = Date.now();
            finalStatus = "Rolled Back";

            await notifySlack(`↩ *Incident ${incidentId} Rolled Back.*`);
        } else {
            incident.status = "Resolved";
            incident.resolvedTime = Date.now();
            finalStatus = "Resolved";

            const resolutionSec = ((incident.resolvedTime - (incident.triggeredTime || Date.now())) / 1000).toFixed(1);
            await notifySlack(`🎉 *Incident ${incidentId} Resolved* in ${resolutionSec}s.`);
        }

        // Record completed incident for execution agent
        recordCompletedIncident(EXECUTION_DID);

        // --- Step 9: Handoff to Reporting Agent ---
        const handoff = createValidatedHandoff({
            sourceAgentDid: EXECUTION_DID,
            destinationAgentDid: REPORTING_DID,
            incidentId,
            reason: `Execution complete. Final status: ${finalStatus}. Handing off for post-incident report.`,
        });

        incident.activeAgent = REPORTING_DID;
        if (!incident.agentHandoffLog) incident.agentHandoffLog = [];
        incident.agentHandoffLog.push(handoff);
        incident.pipelineState = "completed";

        await writeAudit({ action: "EXECUTION_COMPLETE", actor: EXECUTION_DID, incidentId, details: `Final: ${finalStatus}` });

        return { incidentId, finalStatus, handoff };

    } catch (err: any) {
        console.error(`[Execution Agent] Pipeline error: ${err.message}`);
        incident.status = "Failed - " + err.message;
        incident.pipelineState = "failed";

        await writeAudit({ action: "EXECUTION_FAILED", actor: EXECUTION_DID, incidentId, details: err.message });
        await notifySlack(`❌ *Execution Agent failed:* ${err.message}`).catch(() => {});

        // Still attempt handoff to reporting for post-mortem
        let handoff: AgentHandoffRecord | null = null;
        try {
            handoff = createValidatedHandoff({
                sourceAgentDid: EXECUTION_DID,
                destinationAgentDid: REPORTING_DID,
                incidentId,
                reason: `Execution failed: ${err.message}. Handing off for failure report.`,
            });
            incident.activeAgent = REPORTING_DID;
            if (!incident.agentHandoffLog) incident.agentHandoffLog = [];
            incident.agentHandoffLog.push(handoff);
        } catch { /* handoff creation failed — non-fatal */ }

        return { incidentId, finalStatus: "Failed", handoff, error: err.message };
    }
}
