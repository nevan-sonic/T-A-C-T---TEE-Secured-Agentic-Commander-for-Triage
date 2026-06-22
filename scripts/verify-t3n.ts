/**
 * T3N Connection Verification Script
 *
 * Verifies that the T3N testnet connection works correctly by:
 *   1. Loading environment variables from .env
 *   2. Calling getT3nTenantDid() from the singleton service
 *   3. Printing only the tenant DID (no secrets, no addresses)
 *
 * Usage: npm run verify:t3n
 * Exit code 0 = success, non-zero = failure
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Resolve .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
    try {
        // Dynamic import of the compiled service (dist/ output — exists after `npm run compile`)
        // @ts-ignore — resolved at runtime from compiled output
        const { getT3nTenantDid } = await import("../dist/services/t3nClient.js");

        const tenantDid = await getT3nTenantDid();

        console.log("T3N authentication successful");
        console.log(`Tenant DID: ${tenantDid}`);

        process.exit(0);
    } catch (err: any) {
        const message = err?.message || "Unknown error";

        // Never print API keys, wallet addresses, or stack traces
        if (message.includes("T3N_API_KEY is missing")) {
            console.error("ERROR: T3N_API_KEY is not set in your .env file.");
            console.error("Create a .env file at the project root with:");
            console.error("  T3N_API_KEY=<your-key>");
            console.error("  T3N_ENVIRONMENT=testnet");
        } else {
            console.error(`ERROR: T3N verification failed: ${message}`);
        }

        process.exit(1);
    }
}

main();
