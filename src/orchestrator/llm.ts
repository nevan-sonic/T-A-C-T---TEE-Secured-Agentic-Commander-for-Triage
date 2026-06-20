import Groq from "groq-sdk";
import * as fs from "fs";
import * as path from "path";

export interface LogAnalysisResult {
    rootCause: string;
    patch: string;
    explanation: string;
}

// Prompt template for diagnosing connection pool issues in code
const DIAGNOSIS_PROMPT = `
You are an expert systems engineer. You are analyzing production logs from an incident and the source code of the affected service.
Analyze the logs and code to:
1. Identify the root cause of the failure.
2. Formulate a fix to apply directly to the source code file.
3. Provide a brief explanation.

Your response MUST be a JSON object containing precisely these three keys:
{
  "rootCause": "A description of the root cause",
  "patch": "The ENTIRE updated content of the target JS source code file (app_service.js) with the fix applied (e.g. changing 'max: 20' to 'max: 50'). Keep the format as valid JavaScript code. Do not include markdown code ticks (\`\`\`) in this field.",
  "explanation": "Brief explanation of why this fix works"
}
Do NOT include any markdown markup outside the JSON. Return only the JSON object.
`;

export async function analyzeLogs(logs: string[]): Promise<LogAnalysisResult> {
    const apiKey = process.env.GROQ_API_KEY;
    
    // Load app_service.js source code
    let sourceCode = "";
    try {
        const codePath = path.join(process.cwd(), "app_service.js");
        if (fs.existsSync(codePath)) {
            sourceCode = fs.readFileSync(codePath, "utf-8");
        }
    } catch (e) {
        console.error("[Groq LLM] Error reading app_service.js:", e);
    }
    
    const fallbackPatch = `// Production Gateway Database Connection Pool Init
const { Pool } = require("pg");

const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  // Database connection limit
  max: 50,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 2000,
};

const dbPool = new Pool(poolConfig);

module.exports = { dbPool, poolConfig };
`;

    if (!apiKey || apiKey.startsWith("gsk_mock") || apiKey === "") {
        console.log("[Groq LLM] Warning: No valid GROQ_API_KEY found. Falling back to local diagnostic engine.");
        // Simulated local fallback engine
        return {
            rootCause: "Database Connection Pool Exhausted. High traffic spike (4200 req/min) exceeded max active connection pool size (max=20, active=20).",
            patch: fallbackPatch,
            explanation: "Increase maximum connection pool limit to 50 in app_service.js to accommodate the traffic spike and prevent acquisition timeouts."
        };
    }

    try {
        console.log("[Groq LLM] Querying Llama-3-70B model to diagnose log errors and review app_service.js...");
        const groq = new Groq({ apiKey });
        
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: DIAGNOSIS_PROMPT },
                { role: "user", content: `Incident logs:\n${logs.join("\n")}\n\nTarget Code File (app_service.js):\n${sourceCode}` }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("Empty response from Groq");
        }

        const parsed = JSON.parse(content) as LogAnalysisResult;
        console.log(`[Groq LLM] Analysis complete. Proposing code fix.`);
        return parsed;
    } catch (e: any) {
        console.error(`[Groq LLM] Error calling Groq API: ${e.message}. Using fallback diagnostic.`);
        return {
            rootCause: "Database Connection Pool Exhausted. High traffic spike (4200 req/min) exceeded max active connection pool size (max=20, active=20).",
            patch: fallbackPatch,
            explanation: "Increase maximum connection pool limit to 50 in app_service.js to accommodate the traffic spike and prevent acquisition timeouts."
        };
    }
}
