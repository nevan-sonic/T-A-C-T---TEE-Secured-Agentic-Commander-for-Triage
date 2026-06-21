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

        const userClient = new T3nClient({
            wasmComponent,
            handlers: {
                EthSign: metamask_sign(address, undefined, privateKey)
            }
        });

        await userClient.handshake();
        const did = await userClient.authenticate(createEthAuthInput(address));
        const userDid = did.value;

        const TENANT_SCRIPT = `z:${userDid.slice("did:t3n:".length)}:incident-contracts`;
        const scriptVersion = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);
        console.log(`Tenant script: ${TENANT_SCRIPT}, Version: ${scriptVersion}`);

        const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");
        console.log(`User contract version: ${userContractVersion}`);

        const agentDid = process.env.T3_AGENT_DID || "did:t3:agent:department-of-incidents";

        // Granting to both user self-DID and the Agent DID
        console.log(`Executing agent-auth-update for agent ${agentDid} and self ${userDid}...`);
        const inputPayload = {
            agents: [
                {
                    agentDid: userDid, // Self-grant for direct calls
                    scripts: [{
                        scriptName: TENANT_SCRIPT,
                        versionReq: scriptVersion,
                        functions: ["investigate-logs", "create-fix-pr", "merge-fix", "revert-commit"],
                        allowedHosts: ["api.github.com", "api.groq.com"]
                    }]
                },
                {
                    agentDid: agentDid, // Agent delegation
                    scripts: [{
                        scriptName: TENANT_SCRIPT,
                        versionReq: scriptVersion,
                        functions: ["investigate-logs", "create-fix-pr", "merge-fix", "revert-commit"],
                        allowedHosts: ["api.github.com", "api.groq.com"]
                    }]
                }
            ]
        };

        const result = await userClient.execute({
            script_name: "tee:user/contracts",
            script_version: userContractVersion,
            function_name: "agent-auth-update",
            input: inputPayload
        });
        console.log("agent-auth-update Result:", result);

        // Now let's try calling "investigate-logs"
        console.log("Calling investigate-logs function...");
        const executionResult = await userClient.executeAndDecode({
            script_name: TENANT_SCRIPT,
            script_version: scriptVersion,
            function_name: "investigate-logs",
            input: {
                logs: "Connection pool exhausted (max=20, active=20)"
            }
        });
        console.log("Execution Result:", executionResult);

    } catch (err) {
        console.error("Self grant / execution failed:", err);
    }
}

main();
