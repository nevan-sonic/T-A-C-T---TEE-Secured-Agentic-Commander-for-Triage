import { enclaveSimulator, LedgerEntry, PendingApproval } from "./enclave-sim";

export interface T3AgentConfig {
    agentDID: string;
    privateKey: string;
    ledgerEndpoint: string;
}

export interface T3Session {
    sessionId: string;
    agentDID: string;
    createdAt: number;
    authorizedDIDs: Map<string, string>; // Maps DID to delegation credential
    expiresAt: number; // [Security] Session TTL
}

export interface AuthenticateConfig<T> {
    session: T3Session;
    delegateDID: string;
    scope: string;
    action: (secureContext?: { getSecret: (key: string) => string | null }) => Promise<T>;
}

export interface RequestDelegationConfig {
    session: T3Session;
    delegateDID: string;
    scope: string;
    metadata: Record<string, unknown>;
    timeoutMs?: number;
}

export interface ApprovalResult {
    approverDID: string;
    credential: string;
    signedAt: number;
}

export interface ExecuteUnderConfig<T> {
    session: T3Session;
    delegateDID: string;
    credential: string;
    action: (secureContext: SecureContext) => Promise<T>;
}

export interface SecureContext {
    tenantDid: string;
    delegateDid: string;
    credential: string;
    getSecret: (key: string) => string | null;
}

// [Security] Session TTL: 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;
// [Security] Maximum delegation timeout
const MAX_DELEGATION_TIMEOUT = 60 * 60 * 1000; // 1 hour

// [Security] DID format validation
function isValidDID(did: string): boolean {
    return /^did:t3[n]?:[a-zA-Z0-9:_\-]+$/.test(did) || /^did:t3:user:[a-zA-Z0-9:_\-]+$/.test(did) || /^did:t3:agent:[a-zA-Z0-9:_\-]+$/.test(did);
}

export class T3Agent {
    private config: T3AgentConfig;
    private tenantContractId: string = "1001"; // Mock deployed TEE contract ID

    public audit = {
        write: async (entry: Omit<LedgerEntry, "timestamp">): Promise<void> => {
            const timestamp = Date.now();
            enclaveSimulator.writeLedger({
                ...entry,
                timestamp
            });
        }
    };

    constructor(config: T3AgentConfig) {
        this.config = config;
        console.log(`[T3 Agent SDK] Initialized agent with DID: ${config.agentDID}`);
    }

    public async handshake(): Promise<T3Session> {
        const sessionId = "sess_" + Math.random().toString(36).substring(2, 8);
        const now = Date.now();
        console.log(`[T3 Agent SDK] Handshake established. Session ID: ${sessionId}`);

        return {
            sessionId,
            agentDID: this.config.agentDID,
            createdAt: now,
            authorizedDIDs: new Map(),
            expiresAt: now + SESSION_TTL_MS
        };
    }

    // [Security] Check if session has expired
    private checkSessionExpiry(session: T3Session): void {
        if (Date.now() > session.expiresAt) {
            throw new Error(`[Security] T3 Session expired. Session created at ${new Date(session.createdAt).toISOString()}, expired at ${new Date(session.expiresAt).toISOString()}. Please call handshake() again.`);
        }
    }

    // [Security] Build secureContext for TEE secret retrieval
    private buildSecureContext(delegateDID: string): SecureContext {
        return {
            tenantDid: this.config.agentDID,
            delegateDid: delegateDID,
            credential: "",
            getSecret: (key: string) => {
                // Validate key is not empty
                if (!key || key.length === 0) {
                    console.log("[Security] Empty secret key requested");
                    return null;
                }

                const matches = delegateDID.match(/did:t3n:([0-9a-fA-F]+)/) || delegateDID.match(/did:t3:user:([0-9a-fA-F]+)/);
                const tid = matches ? matches[1].toLowerCase() : "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec";
                try {
                    const val = enclaveSimulator.getMapEntry(tid, "secrets", key, "1001");
                    if (val) return val;
                } catch (e) {}
                const envTid = ((process.env.T3N_TENANT_DID || "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec").split(":").pop() || "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec").toLowerCase();
                return enclaveSimulator.getMapEntry(envTid, "secrets", key, "1001");
            }
        };
    }

    public async authenticate<T>(config: AuthenticateConfig<T>): Promise<T> {
        // [Security] Validate session and DID
        this.checkSessionExpiry(config.session);
        if (!config.delegateDID || config.delegateDID.length === 0) {
            throw new Error("[Security] Empty delegateDID provided to authenticate()");
        }

        console.log(`[T3 Agent SDK] Authenticating user DID: ${config.delegateDID} with scope '${config.scope}'...`);
        try {
            console.log(`[T3 Agent SDK] Executing task under user DID context: ${config.delegateDID}`);

            // Build secureContext for TEE secret retrieval (Zero-Secrets pattern)
            const secureContext = this.buildSecureContext(config.delegateDID);

            const result = await config.action(secureContext);
            return result;
        } catch (e: any) {
            console.error(`[T3 Agent SDK] Authentication error: ${e.message}`);
            throw e;
        }
    }

    public async requestDelegation(config: RequestDelegationConfig): Promise<ApprovalResult> {
        // [Security] Validate session
        this.checkSessionExpiry(config.session);

        const approvalId = "app_" + Math.random().toString(36).substring(2, 8);

        // Push the pending approval request to the local simulator
        enclaveSimulator.createPendingApproval(
            approvalId,
            config.delegateDID,
            config.scope,
            config.metadata
        );

        console.log(`[T3 Agent SDK] Delegation requested for DID: ${config.delegateDID}. Waiting for approval signature...`);

        // [Security] Cap the timeout at MAX_DELEGATION_TIMEOUT
        const start = Date.now();
        const timeout = Math.min(config.timeoutMs || 30 * 60 * 1000, MAX_DELEGATION_TIMEOUT);

        while (true) {
            const approval = enclaveSimulator.getApprovalById(approvalId);
            if (approval && approval.status === "approved" && approval.signature) {
                // Return delegation result
                const result: ApprovalResult = {
                    approverDID: config.delegateDID,
                    credential: approval.signature,
                    signedAt: approval.signedAt || Date.now()
                };

                // Add credential proof to session cache
                config.session.authorizedDIDs.set(config.delegateDID, approval.signature);
                return result;
            }

            if (Date.now() - start > timeout) {
                throw new Error(`T3 Delegation Timeout: Request ${approvalId} expired after ${timeout}ms.`);
            }

            // Sleep 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    public async executeUnder<T>(config: ExecuteUnderConfig<T>): Promise<T> {
        // [Security] Validate session
        this.checkSessionExpiry(config.session);

        console.log(`[T3 Agent SDK] executeUnder() requested. Caller DID: ${config.delegateDID}`);

        // 1. Verify that the session has the signature credential
        const cachedCred = config.session.authorizedDIDs.get(config.delegateDID);
        if (!cachedCred || cachedCred !== config.credential) {
            throw new Error(`T3 Security Breach: executeUnder denied. Invalid or missing signature credential for DID ${config.delegateDID}`);
        }

        // [Security] Validate credential length
        if (!config.credential || config.credential.length < 10 || config.credential.length > 1000) {
            throw new Error(`[Security] Invalid credential length for executeUnder()`);
        }

        console.log(`[T3 Enclave] Entering hardware enclave for DID: ${config.delegateDID}...`);

        // 2. Build the secureContext container
        const secureContext = this.buildSecureContext(config.delegateDID);
        secureContext.credential = config.credential;

        // 3. Execute the payload closure inside the enclave boundary
        try {
            const result = await config.action(secureContext);
            console.log(`[T3 Enclave] Execution complete. Exiting enclave.`);
            return result;
        } catch (e: any) {
            console.error(`[T3 Enclave] Contract Execution Error: ${e.message}`);
            throw e;
        }
    }
}
