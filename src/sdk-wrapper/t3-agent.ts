import { enclaveSimulator, LedgerEntry, PendingApproval } from "./enclave-sim";
import { Wallet } from "ethers";

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
    expiresAt: number; // Session TTL
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

// Session TTL: 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;
// Maximum delegation timeout
const MAX_DELEGATION_TIMEOUT = 60 * 60 * 1000; // 1 hour

export class T3Agent {
    private config: T3AgentConfig;
    private sdk: any = null;
    private client: any = null;
    private tenant: any = null;
    private userDid: string = "";
    private scriptName: string = "";
    private scriptVersion: string = "";

    public audit = {
        write: async (entry: Omit<LedgerEntry, "timestamp">): Promise<void> => {
            const timestamp = Date.now();
            
            // 1. Write to local enclave simulator (so local dashboard can query it instantly)
            enclaveSimulator.writeLedger({
                ...entry,
                timestamp
            });

            // 2. Write to the real testnet public audit-ledger map if initialized
            if (this.tenant) {
                try {
                    const key = `audit_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
                    const value = JSON.stringify({ ...entry, timestamp });
                    await this.tenant.executeControl("map-entry-set", {
                        map_name: this.tenant.canonicalName("audit-ledger"),
                        key: key,
                        value: value
                    });
                    console.log(`[T3 Agent SDK] Real testnet audit ledger update successful: ${key}`);
                } catch (e: any) {
                    console.warn(`[T3 Agent SDK] Real testnet audit ledger write failed: ${e.message}`);
                }
            }
        }
    };

    constructor(config: T3AgentConfig) {
        this.config = config;
        console.log(`[T3 Agent SDK] Initializing agent with DID: ${config.agentDID}`);
    }

    public async handshake(): Promise<T3Session> {
        const sessionId = "sess_" + Math.random().toString(36).substring(2, 8);
        const now = Date.now();
        console.log(`[T3 Agent SDK] Handshake established. Session ID: ${sessionId}`);

        try {
            if (!this.sdk) {
                console.log("[T3 Agent SDK] Dynamically importing @terminal3/t3n-sdk...");
                this.sdk = await (0, eval)('import("@terminal3/t3n-sdk")');
                this.sdk.setEnvironment("testnet");

                console.log("[T3 Agent SDK] Loading WASM Component...");
                const wasmComponent = await this.sdk.loadWasmComponent();

                const address = this.sdk.eth_get_address(this.config.privateKey);
                console.log(`[T3 Agent SDK] Derived wallet address: ${address}`);

                this.client = new this.sdk.T3nClient({
                    wasmComponent,
                    handlers: {
                        EthSign: this.sdk.metamask_sign(address, undefined, this.config.privateKey)
                    }
                });

                console.log("[T3 Agent SDK] Executing real handshake on testnet...");
                await this.client.handshake();

                console.log("[T3 Agent SDK] Authenticating tenant DID on testnet...");
                const did = await this.client.authenticate(this.sdk.createEthAuthInput(address));
                this.userDid = did.value;
                console.log(`[T3 Agent SDK] Real Authenticated Tenant DID: ${this.userDid}`);

                this.tenant = new this.sdk.TenantClient({
                    t3n: this.client,
                    baseUrl: this.sdk.getNodeUrl(),
                    tenantDid: this.userDid
                });

                // Resolve latest version of z:<tid>:incident-contracts
                const tailName = "incident-contracts";
                this.scriptName = `z:${this.userDid.slice("did:t3n:".length)}:${tailName}`;
                try {
                    this.scriptVersion = await this.sdk.getScriptVersion(this.sdk.getNodeUrl(), this.scriptName);
                    console.log(`[T3 Agent SDK] Resolved script name: ${this.scriptName}, version: ${this.scriptVersion}`);
                } catch (vErr: any) {
                    console.log(`[T3 Agent SDK] Warning: Could not fetch script version (using fallback 0.1.0): ${vErr.message}`);
                    this.scriptVersion = "0.1.0";
                }
            } else {
                // Already handshaked and authenticated, reuse the client
            }
        } catch (err: any) {
            console.error(`[T3 Agent SDK] Real testnet integration handshake failed: ${err.stack || err.message || err}. Running in simulation mode.`);
        }

        return {
            sessionId,
            agentDID: this.config.agentDID,
            createdAt: now,
            authorizedDIDs: new Map(),
            expiresAt: now + SESSION_TTL_MS
        };
    }

    private checkSessionExpiry(session: T3Session): void {
        if (Date.now() > session.expiresAt) {
            throw new Error(`[Security] T3 Session expired. Please call handshake() again.`);
        }
    }

    private buildSecureContext(delegateDID: string): SecureContext {
        return {
            tenantDid: this.config.agentDID,
            delegateDid: delegateDID,
            credential: "",
            getSecret: (key: string) => {
                if (!key || key.length === 0) {
                    return null;
                }

                // 1. First try reading securely from local simulator vault
                const matches = delegateDID.match(/did:t3n:([0-9a-fA-F]+)/) || delegateDID.match(/did:t3:user:([0-9a-fA-F]+)/);
                const tid = matches ? matches[1].toLowerCase() : "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec";
                try {
                    const val = enclaveSimulator.getMapEntry(tid, "secrets", key, "1001");
                    if (val) return val;
                } catch (e) {}

                const envTid = ((process.env.T3N_TENANT_DID || "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec").split(":").pop() || "bccc24bd2926d5c0065cb99f4d032fdc4f2289ec").toLowerCase();
                const simVal = enclaveSimulator.getMapEntry(envTid, "secrets", key, "1001");
                if (simVal) return simVal;

                // 2. Fall back to process.env if not found in simulator maps
                if (key === "github_token" && process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
                if (key === "groq_api_key" && process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
                if (key === "aws_access_key_id" && process.env.AWS_ACCESS_KEY_ID) return process.env.AWS_ACCESS_KEY_ID;
                if (key === "aws_secret_access_key" && process.env.AWS_SECRET_ACCESS_KEY) return process.env.AWS_SECRET_ACCESS_KEY;
                
                return null;
            }
        };
    }

    public async authenticate<T>(config: AuthenticateConfig<T>): Promise<T> {
        this.checkSessionExpiry(config.session);
        if (!config.delegateDID || config.delegateDID.length === 0) {
            throw new Error("[Security] Empty delegateDID provided to authenticate()");
        }

        console.log(`[T3 Agent SDK] Authenticating user DID: ${config.delegateDID} with scope '${config.scope}'...`);

        // Execute real testnet contract call if client is available
        if (this.client) {
            try {
                console.log(`[T3 Agent SDK] Invoking guest contract function 'investigate-logs' on real testnet...`);
                const executionResult = await this.client.executeAndDecode({
                    script_name: this.scriptName,
                    script_version: this.scriptVersion,
                    function_name: "investigate-logs",
                    input: {}
                });
                console.log(`[T3 Agent SDK] Testnet execution SUCCESS:`, executionResult);
            } catch (err: any) {
                console.warn(`[T3 Agent SDK] Real testnet execution failed: ${err.message || err}. Continuing with host execution.`);
            }
        }

        try {
            const secureContext = this.buildSecureContext(config.delegateDID);
            const result = await config.action(secureContext);
            return result;
        } catch (e: any) {
            console.error(`[T3 Agent SDK] Authentication action error: ${e.message}`);
            throw e;
        }
    }

    public async requestDelegation(config: RequestDelegationConfig): Promise<ApprovalResult> {
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

        const start = Date.now();
        const timeout = Math.min(config.timeoutMs || 30 * 60 * 1000, MAX_DELEGATION_TIMEOUT);

        while (true) {
            const approval = enclaveSimulator.getApprovalById(approvalId);
            if (approval && approval.status === "approved" && approval.signature) {
                const result: ApprovalResult = {
                    approverDID: config.delegateDID,
                    credential: approval.signature,
                    signedAt: approval.signedAt || Date.now()
                };

                config.session.authorizedDIDs.set(config.delegateDID, approval.signature);
                return result;
            }

            if (Date.now() - start > timeout) {
                throw new Error(`T3 Delegation Timeout: Request ${approvalId} expired after ${timeout}ms.`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    public async executeUnder<T>(config: ExecuteUnderConfig<T>): Promise<T> {
        this.checkSessionExpiry(config.session);

        console.log(`[T3 Agent SDK] executeUnder() requested. Caller DID: ${config.delegateDID}`);

        const cachedCred = config.session.authorizedDIDs.get(config.delegateDID);
        let isAuthorized = cachedCred === config.credential;
        if (!isAuthorized) {
            isAuthorized = enclaveSimulator.verifyCredential(config.delegateDID, config.credential);
        }

        if (!isAuthorized) {
            throw new Error(`T3 Security Breach: executeUnder denied. Invalid or missing signature credential for DID ${config.delegateDID}`);
        }

        if (!config.credential || config.credential.length < 10 || config.credential.length > 1000) {
            throw new Error(`[Security] Invalid credential length for executeUnder()`);
        }

        // Execute real testnet contract call if client is available
        if (this.client) {
            let funcName = "investigate-logs";
            const actionStr = config.action.toString();
            if (actionStr.includes("merge")) {
                funcName = "merge-fix";
            } else if (actionStr.includes("revert")) {
                funcName = "revert-commit";
            } else if (actionStr.includes("pr") || actionStr.includes("create")) {
                funcName = "create-fix-pr";
            }

            try {
                console.log(`[T3 Agent SDK] Invoking guest contract function '${funcName}' on real testnet...`);
                const executionResult = await this.client.executeAndDecode({
                    script_name: this.scriptName,
                    script_version: this.scriptVersion,
                    function_name: funcName,
                    input: {}
                });
                console.log(`[T3 Agent SDK] Testnet execution '${funcName}' SUCCESS:`, executionResult);
            } catch (err: any) {
                console.warn(`[T3 Agent SDK] Real testnet execution '${funcName}' failed: ${err.message || err}. Continuing with host execution.`);
            }
        }

        console.log(`[T3 Enclave] Entering hardware enclave for DID: ${config.delegateDID}...`);

        const secureContext = this.buildSecureContext(config.delegateDID);
        secureContext.credential = config.credential;

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
