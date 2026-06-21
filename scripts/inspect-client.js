const dotenv = require("dotenv");
dotenv.config();

async function main() {
    const sdk = await import("@terminal3/t3n-sdk");
    if (sdk.TenantClient) {
        console.log("TenantClient prototype methods:", Object.getOwnPropertyNames(sdk.TenantClient.prototype));
        const dummyTenant = new sdk.TenantClient({
            t3n: {},
            baseUrl: "http://dummy",
            tenantDid: "did:t3n:dummy"
        });
        console.log("TenantClient properties:", Object.keys(dummyTenant));
    }
}
main();
