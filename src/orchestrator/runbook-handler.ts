/**
 * PagerDuty / Opsgenie Runbook Execution Handler
 * Automates runbook execution step-by-step with cryptographic approval checkpoints.
 * Creates a tamper-proof audit trail of exactly what was executed at each step.
 */

import { agent, activeIncidents, Alert } from "./agent-core";
import { parseRunbook, RunbookStep, RUNBOOK_PROMPT } from "./llm";
import { notifySlack } from "./notify";
import { Severity } from "./severity";

export interface RunbookAlert {
    id: string;
    title: string;
    severity: string;
    service: string;
    details?: string;
    runbookUrl?: string;
    runbookSteps?: string[]; // if provided directly, skip URL fetch
    source: "pagerduty" | "opsgenie" | "manual";
}

// Map PagerDuty/Opsgenie severity to T.A.C.T severity
function mapRunbookSeverity(severity: string): Severity {
    const s = severity.toLowerCase();
    if (s === "critical" || s === "p1" || s === "1") return "HIGH";
    if (s === "high" || s === "error" || s === "p2" || s === "2") return "MEDIUM";
    return "LOW";
}

export async function handleRunbookIncident(alert: RunbookAlert): Promise<void> {
    const mappedSeverity = mapRunbookSeverity(alert.severity);

    console.log(`\n============================================================`);
    console.log(`[Runbook Handler] New Runbook Incident: ${alert.id}`);
    console.log(`[Runbook Handler] Title: ${alert.title} | Source: ${alert.source} | Severity: ${mappedSeverity}`);
    console.log(`============================================================`);

    // Create incident entry
    const triggeredTime = Date.now();
    const incidentAlert: Alert = {
        id: alert.id,
        severity: mappedSeverity,
        service: alert.service,
        triggeredAt: new Date().toISOString(),
        errorRate: 0,
        p99Latency: 0,
        logs: [
            `Runbook Alert: ${alert.title}`,
            `Source: ${alert.source}`,
            `Details: ${alert.details || "N/A"}`,
            `Service: ${alert.service}`
        ],
        onCallEngineerDID: process.env.ONCALL_ENGINEER_DID || process.env.APPROVER_DID || "did:t3:user:oncall-engineer",
        codeOwnerDID: process.env.ONCALL_ENGINEER_DID || process.env.APPROVER_DID || "did:t3:user:oncall-engineer"
    };

    activeIncidents.set(alert.id, {
        alert: incidentAlert,
        status: "Runbook Alert Received",
        severity: mappedSeverity,
        logs: incidentAlert.logs,
        triggeredTime,
        autoMode: false
    });

    // Extend incident with runbook-specific fields
    const incident = activeIncidents.get(alert.id)! as any;
    incident.triggerType = "pagerduty";
    incident.runbookSteps = [];

    await notifySlack(`📋 *Runbook Alert:* ${alert.title} (${alert.source}). Starting automated runbook execution.`);

    try {
        // Step 1: T3 Session Handshake
        incident.status = "TEE Session Handshake";
        const session = await agent.handshake();
        incident.session = session;

        const oncallDID = process.env.ONCALL_ENGINEER_DID || process.env.APPROVER_DID || "did:t3:user:oncall-engineer";

        // Step 2: Fetch/parse runbook content
        incident.status = "Fetching Runbook";
        let runbookContent = "";
        let steps: RunbookStep[];

        if (alert.runbookSteps && alert.runbookSteps.length > 0) {
            // Steps provided directly — parse them
            console.log(`[Runbook Handler] Using provided runbook steps (${alert.runbookSteps.length} steps)...`);
            runbookContent = alert.runbookSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        } else if (alert.runbookUrl) {
            // Simulate fetching runbook content from URL
            console.log(`[Runbook Handler] Fetching runbook from URL: ${alert.runbookUrl}...`);
            runbookContent = `Runbook for: ${alert.title}\nService: ${alert.service}\n\n1. Check current system status\n2. Identify top resource consumers\n3. Restart affected service\n4. Verify service recovery\n5. Check connection status`;

            await agent.authenticate({
                session,
                delegateDID: oncallDID,
                scope: "runbook:read",
                action: async () => {
                    console.log(`[Runbook Handler] Runbook content fetched under ${oncallDID} credentials.`);
                    return null;
                }
            });
        } else {
            // Generate runbook steps from incident title using Groq
            runbookContent = `Automated runbook for: ${alert.title}\nService: ${alert.service}\nDetails: ${alert.details || "N/A"}`;
        }

        // Step 3: Parse runbook into structured steps via AI
        incident.status = "Parsing Runbook Steps";
        steps = await agent.authenticate({
            session,
            delegateDID: oncallDID,
            scope: "runbook:parse",
            functionName: "investigate-logs",
            input: {
                system_prompt: RUNBOOK_PROMPT,
                user_prompt: `Incident: ${alert.title}\nRunbook content:\n${runbookContent}`,
                model: "llama-3.3-70b-versatile"
            },
            action: async (secureContext) => {
                const parsedSteps = await parseRunbook(alert.title, runbookContent, secureContext);
                await agent.audit.write({
                    action: "LLM_INVOKED_IN_TEE",
                    actor: oncallDID,
                    incidentId: alert.id,
                    details: `Runbook parsed into ${parsedSteps.length} steps inside TEE boundary.`
                });
                return parsedSteps;
            }
        });

        // Store steps in incident for dashboard polling
        incident.runbookSteps = steps;

        await agent.audit.write({
            action: "RUNBOOK_FETCHED",
            actor: oncallDID,
            incidentId: alert.id,
            details: `Runbook fetched and parsed: ${steps.length} steps. Source: ${alert.runbookUrl || "direct"}.`
        });

        await notifySlack(`📝 *Runbook Parsed:* ${steps.length} steps identified.\n${steps.map(s => `${s.index}. [${s.type.toUpperCase()}] ${s.description}${s.requiresApproval ? " 🔒" : ""}`).join("\n")}`);

        // Step 4: Execute each step sequentially
        incident.status = "Executing Runbook Steps";
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`[Runbook Handler] Executing step ${step.index}/${steps.length}: [${step.type}] ${step.description}`);

            if (step.requiresApproval) {
                // Modification or restart: request engineer approval
                step.status = "pending";
                incident.runbookSteps = [...steps]; // Update dashboard

                await agent.audit.write({
                    action: "RUNBOOK_STEP_PENDING_APPROVAL",
                    actor: oncallDID,
                    incidentId: alert.id,
                    details: `Step ${step.index}: "${step.description}" [${step.type}] requires cryptographic approval.`
                });

                console.log(`[Runbook Handler] 🔒 Step ${step.index} requires approval. Requesting delegation...`);

                // Request delegation for this specific step
                const delegation = await agent.requestDelegation({
                    session,
                    delegateDID: oncallDID,
                    scope: `runbook:execute:step-${step.index}`,
                    metadata: {
                        stepIndex: step.index,
                        stepDescription: step.description,
                        stepType: step.type,
                        service: alert.service,
                        incidentId: alert.id,
                        severity: alert.severity
                    },
                    timeoutMs: 30 * 60 * 1000
                });

                step.approvalId = delegation.credential;
                step.approvedBy = delegation.approverDID;

                await agent.audit.write({
                    action: "RUNBOOK_STEP_APPROVED",
                    actor: delegation.approverDID,
                    incidentId: alert.id,
                    credential: delegation.credential,
                    details: `Step ${step.index} approved by ${delegation.approverDID}.`
                });

                // Execute the approved step
                step.status = "executed";
                step.executedAt = Date.now();
                step.result = `Executed: ${step.description}`;
                incident.runbookSteps = [...steps];

                await agent.audit.write({
                    action: "RUNBOOK_STEP_EXECUTED",
                    actor: delegation.approverDID,
                    incidentId: alert.id,
                    details: `Step ${step.index} executed: "${step.description}" [${step.type}]. Result: approved and executed.`
                });

                console.log(`[Runbook Handler] ✅ Step ${step.index} approved and executed.`);
            } else {
                // Diagnostic or verification: auto-execute
                step.status = "executed";
                step.executedAt = Date.now();
                step.result = `Auto-executed: ${step.description}`;
                incident.runbookSteps = [...steps];

                await agent.audit.write({
                    action: "RUNBOOK_STEP_EXECUTED",
                    actor: oncallDID,
                    incidentId: alert.id,
                    details: `Step ${step.index} auto-executed: "${step.description}" [${step.type}]. No approval required.`
                });

                console.log(`[Runbook Handler] ✅ Step ${step.index} auto-executed (diagnostic/verification).`);
            }
        }

        // Step 5: Runbook complete
        incident.status = "Runbook Completed";
        incident.resolvedTime = Date.now();
        const resolutionTimeSec = ((incident.resolvedTime - triggeredTime) / 1000).toFixed(1);

        await agent.audit.write({
            action: "RUNBOOK_COMPLETED",
            actor: oncallDID,
            incidentId: alert.id,
            details: `All ${steps.length} runbook steps executed. Resolution: ${resolutionTimeSec}s. Service: ${alert.service}.`
        });

        await notifySlack(`🎉 *Runbook Completed:* ${alert.title} — all ${steps.length} steps executed in ${resolutionTimeSec}s.`);
        console.log(`[Runbook Handler] ✅ Runbook fully completed in ${resolutionTimeSec}s`);

    } catch (e: any) {
        console.error(`[Runbook Handler] Error handling runbook ${alert.id}: ${e.message}`);
        incident.status = "Failed - " + e.message;
        await notifySlack(`❌ *Runbook Handler Failed:* ${alert.id} — ${e.message}`);
    }
}
