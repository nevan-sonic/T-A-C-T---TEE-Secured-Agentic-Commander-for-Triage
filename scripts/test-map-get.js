const dotenv = require("dotenv");
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

        const canonicalName = tenant.canonicalName("secrets");
        console.log("Canonical secrets map name:", canonicalName);

        console.log("Fetching github_token map entry from testnet...");
        try {
            const res = await tenant.executeControl("map-entry-get", {
                map_name: canonicalName,
                key: "github_token"
            });
            console.log("Result:", res);
        } catch (e) {
            console.error("Fetch map entry failed:", e.message || e);
        }

    } catch (err) {
        console.error("Failed:", err);
    }
}

main();
