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

        console.log("Reading WASM component...");
        const wasmBytes = fs.readFileSync("target/wasm32-wasip2/release/department_of_incidents_contract.wasm");
        console.log(`WASM size: ${wasmBytes.length} bytes`);

        const result = await tenant.contracts.register({
            tail: "incident-contracts",
            version: "0.1.9",
            wasm: wasmBytes
        });
        console.log("Registration Result:", result);

        if (result && result.contract_id) {
            const contractId = result.contract_id;
            console.log(`Saving contract ID ${contractId} to .env...`);
            const envPath = path.resolve(__dirname, "../.env");
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
            if (envContent.includes("T3N_CONTRACT_ID=")) {
                envContent = envContent.replace(/T3N_CONTRACT_ID=\d+/, `T3N_CONTRACT_ID=${contractId}`);
            } else {
                envContent += `\nT3N_CONTRACT_ID=${contractId}\n`;
            }
            fs.writeFileSync(envPath, envContent, "utf-8");
            console.log(".env updated successfully with T3N_CONTRACT_ID!");
        }

    } catch (err) {
        console.error("Registration failed:", err);
    }
}

main();
