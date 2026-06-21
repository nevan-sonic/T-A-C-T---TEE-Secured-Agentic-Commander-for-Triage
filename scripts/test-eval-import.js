async function main() {
    try {
        console.log("Importing using eval('import(...)')...");
        const sdk = await (0, eval)('import("@terminal3/t3n-sdk")');
        console.log("Success! SDK keys count:", Object.keys(sdk).length);
    } catch (e) {
        console.error("Failed:", e);
    }
}
main();
