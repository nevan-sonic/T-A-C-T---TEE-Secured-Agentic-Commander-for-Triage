import { handshakeSession, requestDelegation, executeUnder } from "./agent-core";
import { revertCommit } from "./github";
import { writeAudit } from "./audit";

export async function executeRollback(
    originalApproverDID: string,
    mergeCommitSha: string,
    incidentId: string
): Promise<void> {
    console.log(`[Incident Guard] Rollback triggered! Initiating re-authentication flow for original approver: ${originalApproverDID}`);
    
    // Fresh session — original approver must re-auth (No cached credentials are used)
    const rollbackSession = await handshakeSession();
    
    const reauth = await requestDelegation({
        session: rollbackSession,
        delegateDID: originalApproverDID,
        scope: "repo:revert",
        metadata: { reason: "rollback", targetCommit: mergeCommitSha, severity: "HIGH" },
    });
    
    console.log("[Incident Guard] Re-authentication verified. Reverting changes inside enclave...");
    
    const repo = process.env.GITHUB_REPO || "Starlight-Local/department-of-incidents";
    const defaultAppService = `// Production Gateway Database Connection Pool Init
const { Pool } = require("pg");

const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  // Database connection limit
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 2000,
};

const dbPool = new Pool(poolConfig);

module.exports = { dbPool, poolConfig };
`;

    await executeUnder({
        session: rollbackSession,
        delegateDID: reauth.approverDID,
        credential: reauth.credential,
        functionName: "revert-commit",
        input: {
            repo,
            revert_file_content: defaultAppService,
            path: "app_service.js"
        },
        action: async (ctx) => revertCommit(mergeCommitSha, ctx),
    });
    
    await writeAudit({
        action: "ROLLBACK_EXECUTED",
        actor: originalApproverDID,
        targetCommit: mergeCommitSha,
        incidentId,
    });
    
    console.log(`[Incident Guard] Revert complete. Incident ${incidentId} rolled back successfully.`);
}
