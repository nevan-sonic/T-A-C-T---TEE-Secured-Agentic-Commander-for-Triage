import { enclaveSimulator, LedgerEntry } from "../sdk-wrapper/enclave-sim";

export function readAuditLedger(): LedgerEntry[] {
    return enclaveSimulator.getLedger();
}

export async function writeAudit(entry: Omit<LedgerEntry, "timestamp">): Promise<void> {
    const timestamp = Date.now();
    
    // 1. Write to local enclave simulator (so local dashboard can query it instantly)
    enclaveSimulator.writeLedger({
        ...entry,
        timestamp
    });

    // 2. Write to the real testnet public audit-ledger map if active tenant is available
    try {
        const { getActiveTenant, getIsBillingFallbackActive, isBillingOrNetworkException, setSimulationMode } = require("./agent-core");
        const tenant = getActiveTenant();
        const fallbackActive = getIsBillingFallbackActive();

        if (tenant && !fallbackActive) {
            try {
                const key = `audit_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
                const value = JSON.stringify({ ...entry, timestamp });
                await tenant.executeControl("map-entry-set", {
                    map_name: tenant.canonicalName("audit-ledger"),
                    key: key,
                    value: value
                });
                console.log(`[Audit SDK] Real testnet audit ledger update successful: ${key}`);
            } catch (err: any) {
                if (isBillingOrNetworkException(err)) {
                    console.warn(`[Audit SDK] Real testnet audit ledger write failed with billing/network exception (${err.message}). Falling back to simulation mode.`);
                    setSimulationMode(true);
                } else {
                    console.error(`[Audit SDK] Real testnet audit ledger write failed: ${err.message}`);
                }
            }
        }
    } catch (e: any) {
        console.warn(`[Audit SDK] Real testnet audit ledger write failed: ${e.message}`);
    }
}
