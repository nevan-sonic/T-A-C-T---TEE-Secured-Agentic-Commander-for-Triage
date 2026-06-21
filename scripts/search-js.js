const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../node_modules/@terminal3/t3n-sdk/dist/index.js");
const content = fs.readFileSync(filePath, "utf-8");

console.log("CommonJS JS file loaded, length:", content.length);

const term = "executeAndDecode";
let idx = content.indexOf(term);
if (idx !== -1) {
    console.log(`Found '${term}' at position ${idx}`);
    console.log("Context:", content.substring(Math.max(0, idx - 100), Math.min(content.length, idx + 200)));
} else {
    console.log(`'${term}' not found.`);
}
