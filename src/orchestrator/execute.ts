import { T3Session, ApprovalResult, executeUnder } from "./agent-core";
import { mergePR } from "./github";
import { writeAudit } from "./audit";

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
    
    const repo = process.env.GITHUB_REPO || "Starlight-Local/department-of-incidents";
    const prNumber = parseInt(prUrl.split("/").pop() || "42", 10);

    const mergeResult = await executeUnder({
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
    
    await writeAudit({
        action: "MERGE_EXECUTED",
        actor: approvalResult.approverDID,
        prUrl,
        mergeCommit: mergeResult.sha,
    });
    
    return mergeResult as MergeResult;
}
