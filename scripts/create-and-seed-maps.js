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

        const contractId = 371; // Registered contract ID from previous step

        console.log("Creating private 'secrets' map...");
        try {
            const res = await tenant.maps.create({
                tail: "secrets",
                visibility: "private",
                writers: { only: [contractId] },
                readers: { only: [contractId] }
            });
            console.log("Map create result:", res);
        } catch (e) {
            console.log("Map create note/error (maybe already exists):", e.message || e);
        }

        console.log("Seeding secrets...");
        const secrets = {
            github_token: process.env.GITHUB_TOKEN || "mock_token_12345",
            groq_api_key: process.env.GROQ_API_KEY || "",
            aws_access_key_id: process.env.AWS_ACCESS_KEY_ID || "AKIAIOSFODNN7EXAMPLE",
            aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        };

        for (const [key, val] of Object.entries(secrets)) {
            console.log(`Seeding secret '${key}' (length: ${val.length})...`);
            const res = await tenant.executeControl("map-entry-set", {
                map_name: tenant.canonicalName("secrets"),
                key: key,
                value: val
            });
            console.log(`Seed result for ${key}:`, res);
        }

        console.log("Sealing audit-ledger map...");
        try {
            // Note: the contract writes step execution logs to a z:<tid>:audit-ledger public map.
            // Let's create it. The contract writes to it, so writers: { only: [contractId] }
            // and readers: "all" (public readable)
            const res = await tenant.maps.create({
                tail: "audit-ledger",
                visibility: "public",
                writers: { only: [contractId] },
                readers: "all" // Public readable
            });
            console.log("Audit ledger map create result:", res);
        } catch (e) {
            console.log("Audit ledger map create note/error (maybe already exists):", e.message || e);
        }

    } catch (err) {
        console.error("Map creation / seeding failed:", err);
    }
}

main();
