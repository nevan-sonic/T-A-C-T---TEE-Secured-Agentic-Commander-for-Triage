const dotenv = require("dotenv");
dotenv.config();

async function main() {
    const sdk = await import("@terminal3/t3n-sdk");
    console.log("SDK Keys:", Object.keys(sdk));
    if (sdk.T3nClient) {
        console.log("T3nClient prototype methods:", Object.getOwnPropertyNames(sdk.T3nClient.prototype));
    }
}
main();
