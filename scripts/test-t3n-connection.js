const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

async function main() {
    console.log("Importing @terminal3/t3n-sdk using dynamic import()...");
    const sdk = await import("@terminal3/t3n-sdk");
    console.log("SDK keys:", Object.keys(sdk));

    const {
        T3nClient,
        TenantClient,
        setEnvironment,
        loadWasmComponent,
        eth_get_address,
        metamask_sign,
        createEthAuthInput,
        getNodeUrl,
        getScriptVersion
    } = sdk;

    try {
        console.log("Setting environment to testnet...");
        setEnvironment("testnet");
        console.log("Resolved Node URL:", getNodeUrl());

        console.log("Loading WASM component...");
        const wasmComponent = await loadWasmComponent();
        console.log("WASM component loaded successfully!");

        const privateKey = process.env.T3N_API_KEY;
        if (!privateKey) {
            console.error("Missing T3N_API_KEY in .env");
            return;
        }

        const address = eth_get_address(privateKey);
        console.log("Ethereum Address:", address);

        console.log("Initializing T3nClient...");
        const t3n = new T3nClient({
            wasmComponent,
            handlers: {
                EthSign: metamask_sign(address, undefined, privateKey)
            }
        });

        console.log("Executing handshake...");
        const handshakeRes = await t3n.handshake();
        console.log("Handshake Result:", handshakeRes);

        console.log("Authenticating...");
        const did = await t3n.authenticate(createEthAuthInput(address));
        console.log("Authenticated DID:", did.value);
        console.log("Original DID from env:", process.env.T3N_TENANT_DID);

        console.log("Initializing TenantClient...");
        const tenant = new TenantClient({
            t3n,
            baseUrl: getNodeUrl(),
            tenantDid: did.value
        });
        console.log("TenantClient initialized!");

        console.log("Checking me()...");
        const me = await tenant.tenant.me();
        console.log("Tenant info (me):", me);

    } catch (err) {
        console.error("Connection test failed:", err);
    }
}

main();
