const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../node_modules/@terminal3/t3n-sdk/dist/index.d.ts");
const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log("Searching for SessionId or Did class...");
lines.forEach((line, idx) => {
    if (line.includes("class SessionId") || line.includes("class Did") || line.includes("interface SessionId") || line.includes("interface Did")) {
        console.log(`[${idx + 1}] ${line.trim()}`);
    }
});
