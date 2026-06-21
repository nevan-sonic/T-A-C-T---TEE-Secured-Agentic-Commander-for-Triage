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

        const client = new T3nClient({
            wasmComponent,
            handlers: {
                EthSign: metamask_sign(address, undefined, privateKey)
            }
        });

        await client.handshake();
        const did = await client.authenticate(createEthAuthInput(address));
        const userDid = did.value;

        const tenant = new TenantClient({
            t3n: client,
            baseUrl: getNodeUrl(),
            tenantDid: userDid
        });

        console.log("Checking token usage...");
        const usage = await tenant.token.getUsage();
        console.log("Usage balance:", usage.balance);

    } catch (err) {
        console.error("Failed to check balance:", err);
    }
}

main();
