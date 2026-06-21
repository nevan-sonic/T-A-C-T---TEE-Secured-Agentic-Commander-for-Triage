import { T3Session, ApprovalResult } from "../sdk-wrapper/t3-agent";
import { agent } from "./agent-core";
import { mergePR } from "./github";

export interface MergeResult {
    status: string;
    sha: string;
}

export async function executeMerge(
    session: T3Session,
    approvalResult: ApprovalResult,
    branchName: string,
    prUrl: string
): Promise<MergeResult> {
    console.log(`[Incident Guard] Securely executing merge for PR: ${prUrl} using delegation credential...`);
    
    // T3 injects the approver's GitHub token inside TEE
    // agent code only sees the structured result
    const repo = process.env.GITHUB_REPO || "Starlight-Local/department-of-incidents";
    const prNumber = parseInt(prUrl.split("/").pop() || "42", 10);

    const mergeResult = await agent.executeUnder({
        session,
        delegateDID: approvalResult.approverDID,
        credential: approvalResult.credential,
        functionName: "merge-fix",
        input: {
            repo,
            pr_number: prNumber,
            branch: branchName
        },
        action: async (secureContext) => {
            return mergePR(branchName, secureContext);
        },
    });
    
    await agent.audit.write({
        action: "MERGE_EXECUTED",
        actor: approvalResult.approverDID,
        prUrl,
        mergeCommit: mergeResult.sha,
    });
    
    return mergeResult as MergeResult;
}
