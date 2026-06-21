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

        const tenant = new TenantClient({
            t3n: client,
            baseUrl: getNodeUrl(),
            tenantDid: userDid
        });

        console.log("Reading WASM component...");
        const wasmBytes = fs.readFileSync("target/wasm32-wasip2/release/department_of_incidents_contract.wasm");

        const nextVersion = "0.1.0";
        console.log(`Registering contract at version ${nextVersion}...`);
        const registerRes = await tenant.contracts.register({
            tail: "incident-contracts-v5",
            version: nextVersion,
            wasm: wasmBytes
        });
        console.log("Register result:", registerRes);

        const contractId = registerRes.contract_id;

        console.log("Updating maps to allow contract ID:", contractId);
        try {
            await tenant.maps.update("secrets", {
                writers: { only: [contractId] },
                readers: { only: [contractId] }
            });
            console.log("Map secrets updated!");
        } catch (e) {
            console.log("Map secrets update note:", e.message || e);
        }

        try {
            await tenant.maps.update("audit-ledger", {
                writers: { only: [contractId] },
                readers: "all"
            });
            console.log("Map audit-ledger updated!");
        } catch (e) {
            console.log("Map audit-ledger update note:", e.message || e);
        }

        const TENANT_SCRIPT = `z:${userDid.slice("did:t3n:".length)}:incident-contracts-v5`;
        const scriptVersion = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);
        console.log(`Resolved Script Version: ${scriptVersion}`);

        const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");
        const agentDid = process.env.T3_AGENT_DID || "did:t3:agent:department-of-incidents";

        console.log("Granting auth to agent and self for script version:", scriptVersion);
        const inputPayload = {
            agents: [
                {
                    agentDid: userDid,
                    scripts: [{
                        scriptName: TENANT_SCRIPT,
                        versionReq: scriptVersion,
                        functions: ["investigate-logs", "create-fix-pr", "merge-fix", "revert-commit"],
                        allowedHosts: ["api.github.com", "api.groq.com"]
                    }]
                },
                {
                    agentDid: agentDid,
                    scripts: [{
                        scriptName: TENANT_SCRIPT,
                        versionReq: scriptVersion,
                        functions: ["investigate-logs", "create-fix-pr", "merge-fix", "revert-commit"],
                        allowedHosts: ["api.github.com", "api.groq.com"]
                    }]
                }
            ]
        };

        const grantRes = await client.execute({
            script_name: "tee:user/contracts",
            script_version: userContractVersion,
            function_name: "agent-auth-update",
            input: inputPayload
        });
        console.log("agent-auth-update Result:", grantRes);

        // Now let's try calling "investigate-logs"
        console.log("Invoking investigate-logs on the real T3N testnet...");
        const executionResult = await client.executeAndDecode({
            script_name: TENANT_SCRIPT,
            script_version: scriptVersion,
            function_name: "investigate-logs",
            input: {}
        });
        console.log("Execution SUCCESS! Result:", executionResult);

    } catch (err) {
        console.error("Test execution failed:", err);
    }
}

main();
