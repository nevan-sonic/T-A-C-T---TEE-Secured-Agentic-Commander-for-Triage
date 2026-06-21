const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../node_modules/@terminal3/t3n-sdk/dist/index.esm.js");
const content = fs.readFileSync(filePath, "utf-8");

console.log("ESM JS file loaded, length:", content.length);

// Search for executeUserContract
const lines = content.split("\n");
let count = 0;
lines.forEach((line, idx) => {
    if (line.includes("executeUserContract") || line.includes("executeAndDecode")) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
        count++;
        // Print 5 lines before and after
        for (let i = Math.max(0, idx - 5); i < Math.min(lines.length, idx + 10); i++) {
            console.log(`  [${i + 1}] ${lines[i]}`);
        }
        console.log("-----------------------------------------");
    }
});
console.log(`Found ${count} occurrences.`);
