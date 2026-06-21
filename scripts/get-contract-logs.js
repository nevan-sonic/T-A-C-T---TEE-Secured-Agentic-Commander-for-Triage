const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

async function main() {
    const {
        T3nClient,
        TenantClient,
        setEnvironment,
        loadWasmComponent,
        eth_get_address,
        metamask_sign,
        createEthAuthInput,
        getNodeUrl
    } = await import("@terminal3/t3n-sdk");

    try {
        setEnvironment("testnet");
        const wasmComponent = await loadWasmComponent();

        const privateKey = process.env.T3N_API_KEY;
        const address = eth_get_address(privateKey);

        const t3n = new T3nClient({
            wasmComponent,
            handlers: {
                EthSign: metamask_sign(address, undefined, privateKey)
            }
        });

        await t3n.handshake();
        const did = await t3n.authenticate(createEthAuthInput(address));
        const tenantDid = did.value;

        const tenant = new TenantClient({
            t3n,
            baseUrl: getNodeUrl(),
            tenantDid
        });

        console.log("Fetching logs for 'incident-contracts-v5'...");
        const logRes = await tenant.contracts.logs("incident-contracts-v5", { limit: 50 });
        console.log("Log Entries:");
        logRes.entries.forEach(e => {
            console.log(`[${new Date(e.ts_ms).toISOString()}] [${e.level.toUpperCase()}] ${e.message}`);
        });

    } catch (err) {
        console.error("Failed to fetch logs:", err);
    }
}

main();
