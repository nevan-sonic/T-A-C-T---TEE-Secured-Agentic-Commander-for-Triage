import { enclaveSimulator, LedgerEntry } from "./enclave-sim";
import * as fs from "fs";
import * as path from "path";

export interface T3AgentConfig {
    agentDID: string;
    privateKey: string;
    ledgerEndpoint: string;
}

export interface T3Session {
    sessionId: string;
    agentDID: string;
    createdAt: number;
    authorizedDIDs: Map<string, string>; // Maps DID to delegation credential signature
}

export interface ApprovalResult {
    approverDID: string;
    credential: string;
    signedAt: number;
}

// Simulated tenant/contracts client namespaces matching @terminal3/t3n-sdk exports
export const client = {
    tenant: {
        claim: async (): Promise<string> => {
            const envTid = (process.env.T3N_TENANT_DID || "did:t3:tenant:c8eb415587d29e3155bb615149156b0ce5f2ecc5").split(":").pop();
            return `did:t3:tenant:${envTid}`;
        }
    },
    contracts: {
        publish: async (config: {
            script_name: string;
            script_version: string;
            wasm_binary_path: string;
            functions: string[];
        }): Promise<void> => {
            let wasmBinary = Buffer.alloc(0);
            try {
                if (fs.existsSync(config.wasm_binary_path)) {
                    wasmBinary = fs.readFileSync(config.wasm_binary_path);
                } else {
                    wasmBinary = Buffer.from("wasm_dummy_component_binary_content");
                }
            } catch (e) {
                wasmBinary = Buffer.from("wasm_dummy_component_binary_content");
            }
            enclaveSimulator.publishContract(
                config.script_name,
                config.script_version,
                wasmBinary,
                config.functions
            );
        }
    },
    maps: {
        create: async (tid: string, mapTail: string, visibility: "private" | "public", writers: string[], readers: string[]): Promise<void> => {
            enclaveSimulator.createMap(tid, mapTail, visibility, writers, readers);
        },
        set: async (tid: string, mapTail: string, key: string, value: string): Promise<void> => {
            enclaveSimulator.setMapEntry(tid, mapTail, key, value);
        },
        get: async (tid: string, mapTail: string, key: string, callerId: string): Promise<string | null> => {
            return enclaveSimulator.getMapEntry(tid, mapTail, key, callerId);
        }
    }
};

export class T3Agent {
    private config: T3AgentConfig;
    private activeSession: T3Session | null = null;
    public currentIncidentId: string = "";

    public audit = {
        write: async (entry: Omit<LedgerEntry, "timestamp">): Promise<void> => {
            const timestamp = Date.now();
            enclaveSimulator.writeLedger({
                ...entry,
                timestamp
            });
            // Write to z:<tid>:audit-ledger maps also
            const envTid = (this.config.agentDID.split(":").pop() || "c8eb415587d29e3155bb615149156b0ce5f2ecc5").toLowerCase();
            const logKey = `log_${timestamp}_${entry.action}`;
            try {
                enclaveSimulator.setMapEntry(envTid, "audit-ledger", logKey, JSON.stringify({ ...entry, timestamp }));
            } catch (e) {}
        }
    };

    constructor(config: T3AgentConfig) {
        this.config = config;
        console.log(`[T3 Agent SDK] Initialized agent with DID: ${config.agentDID}`);
    }

    public async handshake(): Promise<T3Session> {
        const sessionId = "sess_" + Math.random().toString(36).substring(2, 8);
        console.log(`[T3 Agent SDK] Handshake established. Session ID: ${sessionId}`);
        
        const session: T3Session = {
            sessionId,
            agentDID: this.config.agentDID,
            createdAt: Date.now(),
            authorizedDIDs: new Map()
        };
        this.activeSession = session;
        return session;
    }

    public async authenticate(authInput: { session: T3Session; signatureProof?: string }): Promise<void> {
        console.log(`[T3 Agent SDK] Authenticating session ${authInput.session.sessionId}...`);
        this.activeSession = authInput.session;
    }

    public async executeAndDecode(config: {
        script_name: string;
        script_version: string;
        function_name: string;
        input: any; 
    }): Promise<any> {
        console.log(`[T3 Agent SDK] executeAndDecode() requested: ${config.script_name}/${config.function_name} (v${config.script_version})`);
        
        const matches = config.script_name.match(/z:([0-9a-fA-F]+)/) || config.script_name.match(/:([0-9a-fA-F]+)/) || [null, "c8eb415587d29e3155bb615149156b0ce5f2ecc5"];
        const tid = matches[1].toLowerCase();
        const ownerDID = `did:t3n:${tid}`;
        
        const requiresGrant = config.function_name === "create-fix-pr" || config.function_name === "merge-fix" || config.function_name === "revert-commit";
        
        if (requiresGrant) {
            const session = this.activeSession;
            if (!session) {
                throw new Error("T3 Session Error: Handshake required before calling executeAndDecode");
            }
            
            const hasGrant = session.authorizedDIDs.has(ownerDID);
            if (!hasGrant) {
                const approvalId = "app_" + Math.random().toString(36).substring(2, 8);
                
                enclaveSimulator.createPendingApproval(
                    approvalId,
                    ownerDID,
                    config.function_name,
                    { incidentId: this.currentIncidentId || "AUTO-DETECTION", script: config.script_name }
                );
                
                console.log(`[T3 Agent SDK] Action '${config.function_name}' requires user auth grant. Waiting for EIP-191 Agent Auth signature...`);
                
                const start = Date.now();
                const timeout = 10 * 60 * 1000;
                
                while (true) {
                    const approval = enclaveSimulator.getApprovalById(approvalId);
                    if (approval && approval.status === "approved" && approval.signature) {
                        console.log(`[T3 Agent SDK] Cryptographic Agent Auth Grant verified for function '${config.function_name}'.`);
                        session.authorizedDIDs.set(ownerDID, approval.signature);
                        break;
                    }
                    if (Date.now() - start > timeout) {
                        throw new Error(`T3 Authorization Grant Timeout: Function ${config.function_name} denied.`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        console.log(`[T3 Enclave] Entering hardware enclave for guest WASM function: ${config.function_name}...`);
        
        const secureContext = {
            getSecret: (key: string) => {
                const matches = ownerDID.match(/did:t3n:([0-9a-fA-F]+)/) || ownerDID.match(/:([0-9a-fA-F]+)/) || [null, "c8eb415587d29e3155bb615149156b0ce5f2ecc5"];
                const tid = matches[1].toLowerCase();
                const val = enclaveSimulator.getMapEntry(tid, "secrets", key, "1001");
                if (val) return val;
                
                const envTid = ((process.env.T3N_TENANT_DID || "c8eb415587d29e3155bb615149156b0ce5f2ecc5").split(":").pop() || "c8eb415587d29e3155bb615149156b0ce5f2ecc5").toLowerCase();
                return enclaveSimulator.getMapEntry(envTid, "secrets", key, "1001");
            }
        };

        let result: any = null;
        const { createPR, mergePR, revertCommit } = require("../orchestrator/github");
        
        const payloadStr = config.input.toString();
        let payload: any = {};
        try {
            payload = JSON.parse(payloadStr);
        } catch (e) {
            payload = { patch: payloadStr };
        }

        if (config.function_name === "investigate-logs") {
            result = payload.logs;
        } else if (config.function_name === "create-fix-pr") {
            result = await createPR(payload.patch, secureContext);
        } else if (config.function_name === "merge-fix") {
            result = await mergePR(payload.branchName, secureContext);
        } else if (config.function_name === "revert-commit") {
            result = await revertCommit(payload.commitSha, secureContext);
        }
        
        console.log(`[T3 Enclave] WASM Execution success. Exiting enclave.`);
        return result;
    }
}
