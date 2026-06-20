import { T3Session, ApprovalResult } from "../sdk-wrapper/t3-agent";
import { enclaveSimulator } from "../sdk-wrapper/enclave-sim";
import { agent } from "./agent-core";

export async function requestApprovals(
    session: T3Session,
    approverDIDs: string[],
    incidentId: string
): Promise<ApprovalResult[]> {
    console.log(`[Incident Guard] Routing approvals for incident ${incidentId} to: ${JSON.stringify(approverDIDs)}`);
    
    const results: ApprovalResult[] = [];
    
    for (const did of approverDIDs) {
        const approvalId = "app_" + Math.random().toString(36).substring(2, 8);
        
        // Scope is merge-fix for regular approvals
        enclaveSimulator.createPendingApproval(
            approvalId,
            did,
            "merge-fix",
            { incidentId, requestedAt: Date.now() }
        );
        
        console.log(`[Incident Guard] Awaiting cryptographic signature from ${did}...`);
        
        const start = Date.now();
        const timeout = 30 * 60 * 1000;
        let signature = "";
        let signedAt = Date.now();
        
        while (true) {
            const approval = enclaveSimulator.getApprovalById(approvalId);
            if (approval && approval.status === "approved" && approval.signature) {
                signature = approval.signature;
                signedAt = approval.signedAt || Date.now();
                session.authorizedDIDs.set(did, signature);
                break;
            }
            if (Date.now() - start > timeout) {
                throw new Error(`Timeout waiting for approval from ${did}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        results.push({
            approverDID: did,
            credential: signature,
            signedAt
        });
    }
    
    // Log each approval to audit ledger
    for (const result of results) {
        await agent.audit.write({
            action: "APPROVAL_GRANTED",
            actor: result.approverDID,
            incidentId,
            credential: result.credential,
        });
    }
    
    return results;
}
