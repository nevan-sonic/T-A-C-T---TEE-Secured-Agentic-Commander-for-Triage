const fs = require("fs");
const path = require("path");

const wasmPath = path.join(__dirname, "../target/wasm32-wasip2/release/department_of_incidents_contract.wasm");
const buf = fs.readFileSync(wasmPath);

// Extract ASCII printables of length >= 4
let current = [];
const strings = [];
for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c <= 126) {
        current.push(String.fromCharCode(c));
    } else {
        if (current.length >= 4) {
            strings.push(current.join(""));
        }
        current = [];
    }
}
if (current.length >= 4) {
    strings.push(current.join(""));
}

console.log("Extracted strings containing namespaces / imports:");
strings.forEach(s => {
    if (s.includes("logging") || s.includes("kv") || s.includes("http") || s.includes("tenant") || s.includes("interface")) {
        console.log(" -", s);
    }
});
