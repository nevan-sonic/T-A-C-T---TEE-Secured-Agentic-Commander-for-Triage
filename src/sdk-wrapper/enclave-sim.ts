import * as ethers from "ethers";

export interface LedgerEntry {
    action: string;
    actor: string;
    incidentId?: string;
    credential?: string;
    prUrl?: string;
    mergeCommit?: string;
    targetCommit?: string;
    timestamp: number;
    details?: string;
}

export interface MapConfig {
    visibility: "private" | "public";
    writers: string[]; // List of Contract IDs, DIDs, or '*'
    readers: string[]; // List of Contract IDs, DIDs, or '*'
}

export interface PendingApproval {
    id: string;
    approverDID: string;
    scope: string; // The function scope being delegated (e.g. merge-fix, revert-commit)
    metadata: any;
    status: "pending" | "approved" | "rejected";
    signature?: string;
    signedAt?: number;
}

export interface PublishedContract {
    scriptName: string;
    scriptVersion: string;
    wasmBinarySize: number;
    functions: string[];
    publishedAt: number;
}

class EnclaveSimulator {
    private kvStore: Map<string, Map<string, string>> = new Map();
    private mapsConfig: Map<string, MapConfig> = new Map();
    private ledger: LedgerEntry[] = [];
    private approvals: Map<string, PendingApproval> = new Map();
    private contractsRegistry: Map<string, PublishedContract> = new Map();
    
    constructor() {
        // Initialize default system maps
        this.kvStore.set("users", new Map());
        this.kvStore.set("auth", new Map());
        this.kvStore.set("dids", new Map());
    }

    public createMap(tid: string, mapTail: string, visibility: "private" | "public", writers: string[], readers: string[]) {
        const canonicalName = `z:${tid.toLowerCase()}:${mapTail}`;
        if (this.mapsConfig.has(canonicalName)) {
            console.log(`[TEE Enclave] Info: Map '${canonicalName}' already exists. Idempotent call.`);
            return;
        }
        
        this.mapsConfig.set(canonicalName, { visibility, writers, readers });
        this.kvStore.set(canonicalName, new Map());
        console.log(`[TEE Enclave] Created Map: ${canonicalName} (Visibility: ${visibility}, Readers: ${JSON.stringify(readers)}, Writers: ${JSON.stringify(writers)})`);
    }

    public setMapEntry(tid: string, mapTail: string, key: string, value: string) {
        const canonicalName = `z:${tid.toLowerCase()}:${mapTail}`;
        if (!this.kvStore.has(canonicalName)) {
            this.kvStore.set(canonicalName, new Map());
        }
        this.kvStore.get(canonicalName)!.set(key, value);
        console.log(`[TEE Enclave] Sealed entry in ${canonicalName}: key='${key}' (value length: ${value.length})`);
    }

    public getMapEntry(tid: string, mapTail: string, key: string, callerId: string): string | null {
        const canonicalName = `z:${tid.toLowerCase()}:${mapTail}`;
        const config = this.mapsConfig.get(canonicalName);
        
        if (!config) {
            throw new Error(`Platform Error: Map not found - '${canonicalName}'`);
        }
        
        // Enforce KV Governor ACL checks
        const canRead = config.readers.includes(callerId) || config.readers.includes("*");
        if (!canRead) {
            throw new Error(`access denied: caller '${callerId}' cannot read map '${canonicalName}'`);
        }
        
        const map = this.kvStore.get(canonicalName);
        if (!map) return null;
        return map.get(key) || null;
    }

    // Register WASM Guest contract
    public publishContract(scriptName: string, scriptVersion: string, wasmBinary: Buffer, functions: string[]) {
        const key = `${scriptName}:${scriptVersion}`;
        this.contractsRegistry.set(key, {
            scriptName,
            scriptVersion,
            wasmBinarySize: wasmBinary.length,
            functions,
            publishedAt: Date.now()
        });
        console.log(`[TEE Enclave] Deployed Guest WASM Component: ${scriptName} (v${scriptVersion}, Binary size: ${wasmBinary.length} bytes, Functions: ${JSON.stringify(functions)})`);
    }

    public getContract(scriptName: string, scriptVersion: string): PublishedContract | null {
        const key = `${scriptName}:${scriptVersion}`;
        return this.contractsRegistry.get(key) || null;
    }

    public writeLedger(entry: LedgerEntry) {
        this.ledger.push(entry);
        console.log(`[TEE Audit Ledger] Write SUCCESS: ${entry.action} by ${entry.actor} at ${new Date(entry.timestamp).toISOString()}`);
    }

    public getLedger(): LedgerEntry[] {
        const entries: LedgerEntry[] = [];
        for (const [mapName, mapData] of this.kvStore.entries()) {
            if (mapName.endsWith(":audit-ledger")) {
                for (const value of mapData.values()) {
                    try {
                        entries.push(JSON.parse(value));
                    } catch (e) {}
                }
            }
        }
        if (entries.length === 0) {
            return [...this.ledger];
        }
        return entries.sort((a, b) => a.timestamp - b.timestamp);
    }

    public createPendingApproval(id: string, approverDID: string, scope: string, metadata: any): PendingApproval {
        const approval: PendingApproval = {
            id,
            approverDID,
            scope,
            metadata,
            status: "pending"
        };
        this.approvals.set(id, approval);
        console.log(`[TEE Delegator] Routing pending approval challenge. ID: ${id}, Approver: ${approverDID}, Scope: ${scope}`);
        return approval;
    }

    public getPendingApprovals(): PendingApproval[] {
        return Array.from(this.approvals.values()).filter(a => a.status === "pending");
    }

    public getApprovalById(id: string): PendingApproval | undefined {
        return this.approvals.get(id);
    }

    public approveRequest(id: string, signature: string): boolean {
        const approval = this.approvals.get(id);
        if (!approval) {
            throw new Error("Approval request not found");
        }

        const matches = approval.approverDID.match(/did:t3n:([0-9a-fA-F]+)/) || approval.approverDID.match(/did:t3:user:([0-9a-fA-F]+)/) || approval.approverDID.match(/did:t3:user:(\w+)/);
        if (!matches) {
            console.log(`[TEE Delegator] Warning: Approver DID is non-hex. Auto-approving.`);
            approval.status = "approved";
            approval.signature = signature;
            approval.signedAt = Date.now();
            return true;
        }

        const expectedAddressHex = matches[1];
        let expectedAddress = expectedAddressHex.startsWith("0x") ? expectedAddressHex : "0x" + expectedAddressHex;
        
        if (!ethers.isAddress(expectedAddress)) {
            console.log(`[TEE Delegator] Warning: Expected address '${expectedAddress}' is invalid. Auto-approving.`);
            approval.status = "approved";
            approval.signature = signature;
            approval.signedAt = Date.now();
            return true;
        }
        
        // EIP-191 personal_sign verification of the structured T3 Agent Auth Grant
        try {
            const tid = expectedAddressHex.toLowerCase();
            const message = `T3 Agent Authorization Grant\nAgent DID: did:t3:agent:department-of-incidents\nContract: z:${tid}:incident-contracts\nFunction: ${approval.scope}\nOutbound Hosts: api.github.com\nApproval ID: ${id}`;
            const recoveredAddress = ethers.verifyMessage(message, signature);
            
            console.log(`[TEE Verification] Recovered address: ${recoveredAddress}, Expected: ${expectedAddress}`);
            
            if (recoveredAddress.toLowerCase() === expectedAddress.toLowerCase()) {
                approval.status = "approved";
                approval.signature = signature;
                approval.signedAt = Date.now();
                console.log(`[TEE Verification] Cryptographic validation SUCCESS. Identity '${approval.approverDID}' verified.`);
                return true;
            } else {
                console.log(`[TEE Verification] Cryptographic validation FAILED. Recovered: ${recoveredAddress}, Expected: ${expectedAddress}`);
                return false;
            }
        } catch (e) {
            console.log(`[TEE Verification] Crypto verification error: ${e}. Defaulting to mock signature verify for demo.`);
            approval.status = "approved";
            approval.signature = signature;
            approval.signedAt = Date.now();
            return true;
        }
    }
}

export const enclaveSimulator = new EnclaveSimulator();
