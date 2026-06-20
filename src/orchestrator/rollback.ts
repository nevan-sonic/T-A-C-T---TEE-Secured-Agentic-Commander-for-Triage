import { agent } from "./agent-core";
import { client } from "../sdk-wrapper/t3-agent";

export async function executeRollback(
    originalApproverDID: string,
    mergeCommitSha: string,
    incidentId: string
): Promise<void> {
    console.log(`[Incident Guard] Rollback triggered! Initiating re-authentication flow for original approver: ${originalApproverDID}`);
    
    // Fresh session — original approver must re-auth (No cached credentials are used)
    const rollbackSession = await agent.handshake();
    
    // Authenticate the rollbackSession as the active session on the agent
    await agent.authenticate({ session: rollbackSession });
    
    console.log("[Incident Guard] Re-authentication verified. Reverting changes inside enclave...");
    
    const tenantDID = await client.tenant.claim();
    const tid = tenantDID.split(":").pop()!;
    const scriptName = `z:${tid}:incident-contracts`;
    
    agent.currentIncidentId = incidentId;
    
    await agent.executeAndDecode({
        script_name: scriptName,
        script_version: "1.0.0",
        function_name: "revert-commit",
        input: JSON.stringify({ commitSha: mergeCommitSha })
    });
    
    await agent.audit.write({
        action: "ROLLBACK_EXECUTED",
        actor: originalApproverDID,
        targetCommit: mergeCommitSha,
        incidentId,
    });
    
    console.log(`[Incident Guard] Revert complete. Incident ${incidentId} rolled back successfully.`);
}
