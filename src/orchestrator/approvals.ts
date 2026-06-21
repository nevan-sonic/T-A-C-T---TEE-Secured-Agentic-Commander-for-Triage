import { T3Session, ApprovalResult, requestDelegation, activeIncidents } from "./agent-core";
import { writeAudit } from "./audit";

export async function requestApprovals(
    session: T3Session,
    approverDIDs: string[],
    incidentId: string
): Promise<ApprovalResult[]> {
    console.log(`[Incident Guard] Routing approvals for incident ${incidentId} to: ${JSON.stringify(approverDIDs)}`);
    
    const incident = activeIncidents.get(incidentId);
    const severity = incident ? incident.severity : "MEDIUM";

    const approvalPromises = approverDIDs.map(did =>
        requestDelegation({
            session,
            delegateDID: did,
            scope: "repo:merge",
            metadata: { incidentId, requestedAt: Date.now(), severity },
            // Blocks until engineer approves in UI
            timeoutMs: 30 * 60 * 1000,
        })
    );
    
    // Wait for ALL required approvals (HIGH = both must sign)
    const results = await Promise.all(approvalPromises);
    
    // Log each approval to audit ledger
    for (const result of results) {
        await writeAudit({
            action: "APPROVAL_GRANTED",
            actor: result.approverDID,
            incidentId,
            credential: result.credential,
        });
    }
    
    return results;
}
