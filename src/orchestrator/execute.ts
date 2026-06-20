import { T3Session, client } from "../sdk-wrapper/t3-agent";
import { agent } from "./agent-core";

export interface MergeResult {
    status: string;
    sha: string;
}

export async function executeMerge(
    session: T3Session,
    approverDID: string,
    branchName: string,
    prUrl: string
): Promise<MergeResult> {
    console.log(`[Incident Guard] Securely executing merge for PR: ${prUrl} using executeAndDecode...`);
    
    const tenantDID = await client.tenant.claim();
    const tid = tenantDID.split(":").pop()!;
    const scriptName = `z:${tid}:incident-contracts`;

    const mergeResult = await agent.executeAndDecode({
        script_name: scriptName,
        script_version: "1.0.0",
        function_name: "merge-fix",
        input: JSON.stringify({ branchName })
    });
    
    await agent.audit.write({
        action: "MERGE_EXECUTED",
        actor: approverDID,
        prUrl,
        mergeCommit: mergeResult.sha,
    });
    
    return mergeResult as MergeResult;
}
