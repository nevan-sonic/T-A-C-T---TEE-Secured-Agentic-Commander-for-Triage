/**
 * T3N Client Singleton — Backend-only Terminal3 testnet integration.
 *
 * This module creates a single reusable T3N connection that:
 *   1. Reads T3N_API_KEY only from environment variables (never hardcoded).
 *   2. Runs handshake() + authenticate() via the real @terminal3/t3n-sdk.
 *   3. Exposes getT3nTenantClient() and getT3nTenantDid() for downstream use.
 *   4. Never logs API keys, wallet addresses, raw auth responses, or secrets.
 *
 * IMPORTANT: This module must never be imported from frontend/browser code.
 */

// SDK types (imported dynamically at runtime for ESM compat in CommonJS)
type T3nClient = any;
type TenantClient = any;

interface T3nConnection {
    t3n: T3nClient;
    tenant: TenantClient;
    tenantDid: string;
}

// Singleton promise — ensures only one connection is ever created
let connectionPromise: Promise<T3nConnection> | null = null;

// Cached SDK reference (loaded once via dynamic import)
let sdk: any = null;

/**
 * Detect whether an error is a billing or network issue (non-fatal for our purposes).
 */
function isBillingOrNetworkException(err: any): boolean {
    const msg = (err?.message || String(err)).toLowerCase();
    return (
        msg.includes("insufficientcredit") ||
        msg.includes("insufficient") ||
        msg.includes("billing") ||
        msg.includes("credit") ||
        msg.includes("econnrefused") ||
        msg.includes("enotfound") ||
        msg.includes("etimedout") ||
        msg.includes("fetch failed")
    );
}

/**
 * Establish the T3N connection (handshake → authenticate → TenantClient).
 * Called internally; external callers should use getT3nConnection().
 */
async function establishConnection(): Promise<T3nConnection> {
    const apiKey = process.env.T3N_API_KEY;

    if (!apiKey) {
        throw new Error(
            "T3N_API_KEY is missing. Add it only to your local .env file and never commit it."
        );
    }

    const environment = process.env.T3N_ENVIRONMENT ?? "testnet";

    if (environment !== "testnet" && environment !== "production") {
        throw new Error(
            `Invalid T3N_ENVIRONMENT: ${environment}. Use "testnet" or "production".`
        );
    }

    // Dynamically import the ESM SDK from CommonJS context
    if (!sdk) {
        sdk = await (0, eval)('import("@terminal3/t3n-sdk")');
    }

    sdk.setEnvironment(environment);

    const wasmComponent = await sdk.loadWasmComponent();
    const address = sdk.eth_get_address(apiKey);

    const t3n = new sdk.T3nClient({
        wasmComponent,
        handlers: {
            EthSign: sdk.metamask_sign(address, undefined, apiKey),
        },
    });

    await t3n.handshake();

    const did = await t3n.authenticate(sdk.createEthAuthInput(address));
    const tenantDid: string = did.value;

    if (!tenantDid || !tenantDid.startsWith("did:t3n:")) {
        throw new Error(
            "T3N authentication succeeded but did not return a valid tenant DID."
        );
    }

    const tenant = new sdk.TenantClient({
        t3n,
        baseUrl: sdk.getNodeUrl(),
        tenantDid,
    });

    return { t3n, tenant, tenantDid };
}

/**
 * Get (or create) the singleton T3N connection.
 * Safe to call multiple times — the connection is created only once.
 */
export async function getT3nConnection(): Promise<T3nConnection> {
    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = establishConnection();

    try {
        return await connectionPromise;
    } catch (error) {
        // Reset on failure so the next call can retry
        connectionPromise = null;
        throw error;
    }
}

/**
 * Returns only the TenantClient (most common use-case for downstream services).
 */
export async function getT3nTenantClient(): Promise<TenantClient> {
    const { tenant } = await getT3nConnection();
    return tenant;
}

/**
 * Returns only the tenant DID string.
 */
export async function getT3nTenantDid(): Promise<string> {
    const { tenantDid } = await getT3nConnection();
    return tenantDid;
}

/**
 * Health check — proves authentication without exposing secrets.
 * Returns a safe JSON-serializable object for API responses.
 */
export async function getT3nHealthStatus(): Promise<{
    connected: boolean;
    environment: string;
    tenantDid?: string;
    error?: string;
}> {
    const environment = process.env.T3N_ENVIRONMENT ?? "testnet";

    try {
        const tenantDid = await getT3nTenantDid();
        return {
            connected: true,
            environment,
            tenantDid,
        };
    } catch (err: any) {
        // Return a safe error message — never expose stack traces or raw SDK errors
        const message = err?.message || "Unknown error";
        const safeMessage = isBillingOrNetworkException(err)
            ? "T3N testnet connection failed: insufficient credits or network issue. Check your T3N_API_KEY."
            : message.length > 200
              ? "T3N connection failed (error details redacted for security)."
              : `T3N connection failed: ${message}`;

        return {
            connected: false,
            environment,
            error: safeMessage,
        };
    }
}
