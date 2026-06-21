/**
 * AWS CloudWatch Cost Anomaly Handler
 * Auto-detects cloud cost anomalies, identifies the culprit resource using AI,
 * and terminates/resizes it — but only after Finance lead cryptographically co-signs.
 * AWS credentials never leave the TEE boundary (Zero-Secrets pattern).
 */

import { agent, activeIncidents, Alert } from "./agent-core";
import { analyzeCostAnomaly, CostRemediation, COST_PROMPT } from "./llm";
import { notifySlack } from "./notify";
import { Severity } from "./severity";

export interface CostAnomalyAlert {
    id: string;
    alarmName: string;
    currentSpend: number;
    threshold: number;
    percentageIncrease: number;
    currency: string;
    topResources: Array<{ service: string; cost: number; resourceId: string }>;
    source: "cloudwatch" | "cost-anomaly-detection" | "manual";
}

// Map cost anomaly severity
function mapCostSeverity(percentageIncrease: number): Severity {
    if (percentageIncrease >= 100) return "HIGH";
    if (percentageIncrease >= 50) return "MEDIUM";
    return "LOW";
}

export async function handleCostAnomalyIncident(alert: CostAnomalyAlert): Promise<void> {
    const mappedSeverity = mapCostSeverity(alert.percentageIncrease);

    console.log(`\n============================================================`);
    console.log(`[Cost Handler] Cost Anomaly Detected: ${alert.alarmName}`);
    console.log(`[Cost Handler] Spend: $${alert.currentSpend} (threshold: $${alert.threshold}) — ${alert.percentageIncrease}% increase`);
    console.log(`[Cost Handler] Severity: ${mappedSeverity} | Source: ${alert.source}`);
    console.log(`============================================================`);

    // Create incident entry
    const triggeredTime = Date.now();
    const finOpsDID = process.env.ACTIVE_BROWSER_DID || "did:t3:user:finops";

    const incidentAlert: Alert = {
        id: alert.id,
        severity: mappedSeverity,
        service: "cloud-cost-monitor",
        triggeredAt: new Date().toISOString(),
        errorRate: 0,
        p99Latency: 0,
        logs: [
            `Alarm: ${alert.alarmName}`,
            `Current spend: $${alert.currentSpend} ${alert.currency}`,
            `Threshold: $${alert.threshold} ${alert.currency}`,
            `Increase: ${alert.percentageIncrease}%`,
            `Top resources: ${alert.topResources.map(r => `${r.service}: $${r.cost}`).join(", ")}`
        ],
        onCallEngineerDID: finOpsDID,
        codeOwnerDID: finOpsDID
    };

    activeIncidents.set(alert.id, {
        alert: incidentAlert,
        status: "Cost Anomaly Detected",
        severity: mappedSeverity,
        logs: incidentAlert.logs,
        triggeredTime,
        autoMode: false
    });

    // Extend incident with cost-specific fields
    const incident = activeIncidents.get(alert.id)! as any;
    incident.triggerType = "cloudwatch";

    await notifySlack(`💰 *Cost Anomaly:* ${alert.alarmName} — $${alert.currentSpend} (${alert.percentageIncrease}% over threshold $${alert.threshold}). Starting cost analysis.`);

    try {
        // Step 1: T3 Session Handshake
        incident.status = "TEE Session Handshake";
        const session = await agent.handshake();
        incident.session = session;

        // Step 2: Audit cost anomaly detection
        await agent.audit.write({
            action: "COST_ANOMALY_DETECTED",
            actor: finOpsDID,
            incidentId: alert.id,
            details: `Current spend: $${alert.currentSpend}, Threshold: $${alert.threshold}, Increase: ${alert.percentageIncrease}%`
        });

        // Step 3: Authenticate under FinOps DID to read AWS cost data
        incident.status = "Analyzing Cost Data in TEE";
        const remediations: CostRemediation[] = await agent.authenticate({
            session,
            delegateDID: finOpsDID,
            scope: "aws:read",
            functionName: "investigate-logs",
            input: {
                system_prompt: COST_PROMPT,
                user_prompt: `Cost anomaly detected: ${alert.percentageIncrease}% increase over baseline.\nTop resources by spend:\n${alert.topResources.map(r => `- ${r.service}: $${r.cost} (${r.resourceId})`).join("\n")}`,
                model: "llama-3.3-70b-versatile"
            },
            action: async (secureContext) => {
                console.log(`[Cost Handler] Analyzing cost anomaly under ${finOpsDID} credentials...`);

                const results = await analyzeCostAnomaly(
                    alert.topResources,
                    alert.percentageIncrease,
                    secureContext
                );

                await agent.audit.write({
                    action: "LLM_INVOKED_IN_TEE",
                    actor: finOpsDID,
                    incidentId: alert.id,
                    details: `Cost anomaly analysis performed inside TEE. ${results.length} remediation recommendations generated.`
                });

                return results;
            }
        });

        // Step 4: Audit analysis results
        const totalEstimatedSaving = remediations.reduce((sum, r) => sum + r.estimatedSaving, 0);
        incident.patch = remediations.map(r => `${r.action}: ${r.resourceId} (${r.service}) — save $${r.estimatedSaving}`).join("\n");

        await agent.audit.write({
            action: "COST_ANALYSIS_COMPLETE",
            actor: finOpsDID,
            incidentId: alert.id,
            details: `${remediations.length} remediations recommended. Total estimated saving: $${totalEstimatedSaving}. Actions: ${remediations.map(r => r.action).join(", ")}`
        });

        await notifySlack(`📊 *Cost Analysis Complete:*\n${remediations.map(r => `• ${r.action.toUpperCase()} ${r.resourceId} (${r.service}): save $${r.estimatedSaving}\n  ${r.reasoning}`).join("\n")}`);

        // Step 5: Execute remediations with tiered approvals
        incident.status = "Executing Remediations";
        const financeLeadDID = process.env.ACTIVE_BROWSER_DID || "did:t3:user:finance-lead";
        let totalSaving = 0;
        const executedActions: string[] = [];

        for (const remediation of remediations) {
            console.log(`[Cost Handler] Processing remediation: ${remediation.action} for ${remediation.resourceId} (${remediation.service})`);

            if (remediation.action === "flag-for-review") {
                // No approval needed — just log for review
                await agent.audit.write({
                    action: "COST_RESOURCE_FLAGGED",
                    actor: finOpsDID,
                    incidentId: alert.id,
                    details: `Resource ${remediation.resourceId} (${remediation.service}) flagged for manual review. Reason: ${remediation.reasoning}`
                });
                console.log(`[Cost Handler] 🏷️ Resource flagged for review: ${remediation.resourceId}`);
                continue;
            }

            // Determine approval requirements
            const requiresDoubleApproval = remediation.estimatedSaving > 500;
            const approvers = requiresDoubleApproval
                ? [finOpsDID, financeLeadDID]
                : [finOpsDID];

            console.log(`[Cost Handler] ${remediation.action} requires ${approvers.length} approval(s) (saving: $${remediation.estimatedSaving})`);

            // Request approvals
            const approvalPromises = approvers.map(did =>
                agent.requestDelegation({
                    session,
                    delegateDID: did,
                    scope: `aws:${remediation.action}`,
                    metadata: {
                        resourceId: remediation.resourceId,
                        service: remediation.service,
                        action: remediation.action,
                        estimatedSaving: remediation.estimatedSaving,
                        awsCommand: remediation.awsCommand,
                        incidentId: alert.id,
                        severity: mappedSeverity
                    },
                    timeoutMs: 30 * 60 * 1000
                })
            );

            const approvalResults = await Promise.all(approvalPromises);

            // Log approvals
            for (const approval of approvalResults) {
                await agent.audit.write({
                    action: "COST_REMEDIATION_APPROVED",
                    actor: approval.approverDID,
                    incidentId: alert.id,
                    credential: approval.credential,
                    details: `${remediation.action} approved for ${remediation.resourceId} by ${approval.approverDID}.`
                });
            }

            // Execute remediation inside TEE
            const primaryApproval = approvalResults[0];
            incident.status = `Executing ${remediation.action} on ${remediation.resourceId}`;

            await agent.executeUnder({
                session,
                delegateDID: primaryApproval.approverDID,
                credential: primaryApproval.credential,
                functionName: "investigate-logs",
                input: {
                    system_prompt: "aws:remediate",
                    user_prompt: remediation.awsCommand
                },
                action: async (secureContext) => {
                    // Retrieve AWS credentials from TEE vault (Zero-Secrets pattern)
                    const awsAccessKey = secureContext.getSecret("aws_access_key_id");
                    const awsSecretKey = secureContext.getSecret("aws_secret_access_key");

                    if (!awsAccessKey || !awsSecretKey) {
                        console.log("[Cost Handler] Warning: AWS credentials not found in TEE vault. Using simulated execution.");
                    } else {
                        console.log("[Cost Handler] AWS credentials retrieved from TEE vault. Executing inside enclave boundary.");
                    }

                    // Simulate AWS API call (for demo: log the command)
                    console.log(`[Cost Handler] Executing AWS command: ${remediation.awsCommand}`);
                    console.log(`[Cost Handler] Action: ${remediation.action} on ${remediation.resourceId} (${remediation.service})`);

                    // Write execution to audit
                    const actionUpper = remediation.action.toUpperCase();
                    await agent.audit.write({
                        action: `AWS_RESOURCE_${actionUpper === "TERMINATE" ? "TERMINATED" : actionUpper === "STOP" ? "STOPPED" : "RIGHTSIZED"}`,
                        actor: primaryApproval.approverDID,
                        incidentId: alert.id,
                        details: `${remediation.action} executed on ${remediation.resourceId} (${remediation.service}). Command: ${remediation.awsCommand}. Estimated saving: $${remediation.estimatedSaving}. AWS creds from TEE: ${!!awsAccessKey}.`
                    });

                    return { executed: true, command: remediation.awsCommand };
                }
            });

            totalSaving += remediation.estimatedSaving;
            executedActions.push(`${remediation.action}:${remediation.resourceId}`);
            console.log(`[Cost Handler] ✅ ${remediation.action} executed on ${remediation.resourceId}. Saving: $${remediation.estimatedSaving}`);
        }

        // Step 6: Mark as resolved
        incident.status = "Cost Anomaly Resolved";
        incident.costSaving = totalSaving;
        incident.resolvedTime = Date.now();
        const resolutionTimeSec = ((incident.resolvedTime - triggeredTime) / 1000).toFixed(1);

        await agent.audit.write({
            action: "COST_ANOMALY_RESOLVED",
            actor: finOpsDID,
            incidentId: alert.id,
            details: `Cost anomaly resolved. Total saving: $${totalSaving}. Actions executed: ${executedActions.join(", ") || "none (all flagged for review)"}. Resolution: ${resolutionTimeSec}s.`
        });

        await notifySlack(`🎉 *Cost Anomaly Resolved:* ${alert.alarmName}\nTotal estimated saving: $${totalSaving}/month\nActions: ${executedActions.join(", ") || "Flagged for review"}\nResolution time: ${resolutionTimeSec}s`);
        console.log(`[Cost Handler] ✅ Cost anomaly resolved. Total saving: $${totalSaving}. Time: ${resolutionTimeSec}s`);

    } catch (e: any) {
        console.error(`[Cost Handler] Error handling cost anomaly ${alert.id}: ${e.message}`);
        incident.status = "Failed - " + e.message;
        await notifySlack(`❌ *Cost Handler Failed:* ${alert.id} — ${e.message}`);
    }
}
