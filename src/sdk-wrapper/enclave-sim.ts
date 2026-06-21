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
    metadata?: Record<string, unknown>;
}

export interface MapConfig {
    visibility: "private" | "public";
    writers: string[]; // List of Contract IDs or DID
    readers: string[]; // List of Contract IDs or DID
}

export interface PendingApproval {
    id: string;
    approverDID: string;
    scope: string;
    metadata: any;
    status: "pending" | "approved" | "rejected";
    signature?: string;
    signedAt?: number;
}

// Maximum value length for KV store entries (prevents memory abuse)
const MAX_VALUE_LENGTH = 64 * 1024; // 64 KB
const MAX_KEY_LENGTH = 256;

class EnclaveSimulator {
    private kvStore: Map<string, Map<string, string>> = new Map();
    private mapsConfig: Map<string, MapConfig> = new Map();
    private ledger: LedgerEntry[] = [];
    private approvals: Map<string, PendingApproval> = new Map();

    // Counter for allocating numeric Contract IDs
    private nextContractId: number = 1000;

    constructor() {
        // Initialize default system maps
        this.kvStore.set("users", new Map());
        this.kvStore.set("auth", new Map());
        this.kvStore.set("dids", new Map());
    }

    public allocateContractId(): number {
        this.nextContractId += 1;
        return this.nextContractId;
    }

    // [Security] Input sanitization for map names
    private sanitizeMapName(name: string): string {
        // Only allow alphanumeric, colons, hyphens, underscores, and dots
        return name.replace(/[^a-zA-Z0-9:_\-\.]/g, "");
    }

    // [Security] Input validation for keys and values
    private validateKey(key: string): void {
        if (!key || key.length === 0) {
            throw new Error("[Security] Empty key not allowed");
        }
        if (key.length > MAX_KEY_LENGTH) {
            throw new Error(`[Security] Key exceeds maximum length of ${MAX_KEY_LENGTH}`);
        }
    }

    private validateValue(value: string): void {
        if (value && value.length > MAX_VALUE_LENGTH) {
            throw new Error(`[Security] Value exceeds maximum length of ${MAX_VALUE_LENGTH} bytes`);
        }
    }

    public createMap(tid: string, mapTail: string, visibility: "private" | "public", writers: string[], readers: string[]) {
        const sanitizedTail = this.sanitizeMapName(mapTail);
        const canonicalName = `z:${tid}:${sanitizedTail}`;
        if (this.mapsConfig.has(canonicalName)) {
            console.log(`[TEE Enclave] Info: Map '${canonicalName}' already exists. Idempotent call.`);
            return;
        }

        this.mapsConfig.set(canonicalName, { visibility, writers, readers });
        this.kvStore.set(canonicalName, new Map());
        console.log(`[TEE Enclave] Created Map: ${canonicalName} (Visibility: ${visibility}, Readers: ${JSON.stringify(readers)}, Writers: ${JSON.stringify(writers)})`);
    }

    // Seeding secrets bypasses writers ACL (Control plane call)
    public setMapEntry(tid: string, mapTail: string, key: string, value: string, readerContractIds?: string[]) {
        this.validateKey(key);
        this.validateValue(value);

        const sanitizedTail = this.sanitizeMapName(mapTail);
        const canonicalName = `z:${tid}:${sanitizedTail}`;
        if (!this.kvStore.has(canonicalName)) {
            this.kvStore.set(canonicalName, new Map());
        }
        this.kvStore.get(canonicalName)!.set(key, value);
        console.log(`[TEE Enclave] Sealed entry in ${canonicalName}: key='${key}' (value length: ${value.length})`);
    }

    public getMapEntry(tid: string, mapTail: string, key: string, callerContractId: string): string | null {
        this.validateKey(key);

        const sanitizedTail = this.sanitizeMapName(mapTail);
        const canonicalName = `z:${tid}:${sanitizedTail}`;
        const config = this.mapsConfig.get(canonicalName);

        if (!config) {
            throw new Error(`Platform Error: Map not found - '${canonicalName}'`);
        }

        // Enforce KV Governor ACL checks
        const canRead = config.readers.includes(callerContractId) || config.readers.includes("*");
        if (!canRead) {
            console.log(`[Security] Access denied: contract '${callerContractId}' cannot read map '${canonicalName}'`);
            throw new Error(`access denied: contract '${callerContractId}' cannot read map '${canonicalName}'`);
        }

        const map = this.kvStore.get(canonicalName);
        if (!map) return null;
        return map.get(key) || null;
    }

    public writeLedger(entry: LedgerEntry) {
        this.ledger.push(entry);
        // Also store in z-namespace audit-ledger map for T3N ADK compliance
        if (entry.incidentId) {
            const tid = entry.actor.match(/did:t3n:([0-9a-fA-F]+)/)?.[1]?.toLowerCase() || "system";
            const ledgerKey = `log_${entry.timestamp}_${entry.action}`;
            const ledgerMapName = `z:${tid}:audit-ledger`;
            if (!this.kvStore.has(ledgerMapName)) {
                this.kvStore.set(ledgerMapName, new Map());
                this.mapsConfig.set(ledgerMapName, { visibility: "public", writers: ["1001"], readers: ["*"] });
            }
            this.kvStore.get(ledgerMapName)!.set(ledgerKey, JSON.stringify(entry));
        }
        console.log(`[TEE Audit Ledger] Write SUCCESS: ${entry.action} by ${entry.actor} at ${new Date(entry.timestamp).toISOString()}`);
    }

    public getLedger(): LedgerEntry[] {
        return [...this.ledger];
    }

    // [Security] Validate approval ID format before creating
    public createPendingApproval(id: string, approverDID: string, scope: string, metadata: any): PendingApproval {
        this.validateKey(id);

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

        // [Security] Validate signature is non-empty and reasonable length
        if (!signature || signature.length < 10 || signature.length > 1000) {
            console.log(`[Security] Invalid signature length for approval ${id}`);
            return false;
        }

        // Verify the Ethereum personal sign signature
        // Extract address from DID: did:t3n:<eth_address_hex>
        const matches = approval.approverDID.match(/did:t3n:([0-9a-fA-F]+)/) || approval.approverDID.match(/did:t3:user:([0-9a-fA-F]+)/) || approval.approverDID.match(/did:t3:user:(\w+)/);
        if (!matches) {
            console.log(`[TEE Delegator] Warning: Approver DID is non-hex or custom. Verification skipped, auto-approving.`);
            approval.status = "approved";
            approval.signature = signature;
            approval.signedAt = Date.now();
            return true;
        }

        const expectedAddressHex = matches[1];
        let expectedAddress = expectedAddressHex.startsWith("0x") ? expectedAddressHex : "0x" + expectedAddressHex;

        // Auto-approve if expectedAddress is not a valid Ethereum address
        if (!ethers.isAddress(expectedAddress)) {
            console.log(`[TEE Delegator] Warning: Expected address '${expectedAddress}' is not a valid Ethereum address. Verification skipped, auto-approving.`);
            approval.status = "approved";
            approval.signature = signature;
            approval.signedAt = Date.now();
            return true;
        }

        // Standard EIP-191 personal_sign verification
        try {
            // EIP-191 Structured Authorization Grant (T3N ADK compliant format)
            const message = `T3 Agent Authorization Grant\nAgent DID: did:t3:agent:department-of-incidents\nContract: z:system:incident-contracts\nFunction: incident-${id}\nApproval ID: ${id}`;
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
