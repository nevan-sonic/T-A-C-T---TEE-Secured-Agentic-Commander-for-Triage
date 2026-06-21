const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

async function main() {
    const {
        T3nClient,
        setEnvironment,
        loadWasmComponent,
        eth_get_address,
        metamask_sign,
        createEthAuthInput,
        getNodeUrl,
        getScriptVersion
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

        const TENANT_SCRIPT = `z:${userDid.slice("did:t3n:".length)}:incident-contracts`;
        const scriptVersion = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);
        console.log(`Script: ${TENANT_SCRIPT}, Version: ${scriptVersion}`);

        // Try Variant 1: With pii_did
        console.log("\n--- Variant 1: With pii_did ---");
        try {
            const res = await client.executeAndDecode({
                script_name: TENANT_SCRIPT,
                script_version: scriptVersion,
                function_name: "investigate-logs",
                pii_did: userDid,
                input: {
                    logs: "Connection pool exhausted"
                }
            });
            console.log("Success:", res);
        } catch (e) {
            console.error("Failed:", e.message || e);
        }

        // Try Variant 2: String input
        console.log("\n--- Variant 2: String input ---");
        try {
            const res = await client.executeAndDecode({
                script_name: TENANT_SCRIPT,
                script_version: scriptVersion,
                function_name: "investigate-logs",
                input: "Connection pool exhausted"
            });
            console.log("Success:", res);
        } catch (e) {
            console.error("Failed:", e.message || e);
        }

        // Try Variant 3: Empty input
        console.log("\n--- Variant 3: Empty input ---");
        try {
            const res = await client.executeAndDecode({
                script_name: TENANT_SCRIPT,
                script_version: scriptVersion,
                function_name: "investigate-logs",
                input: {}
            });
            console.log("Success:", res);
        } catch (e) {
            console.error("Failed:", e.message || e);
        }

    } catch (err) {
        console.error("General error:", err);
    }
}

main();
