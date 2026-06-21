async function main() {
    const sdk = await import("@terminal3/t3n-sdk");
    const fnStr = sdk.T3nClient.prototype.execute.toString();
    console.log("execute implementation:\n", fnStr);
}
main();
