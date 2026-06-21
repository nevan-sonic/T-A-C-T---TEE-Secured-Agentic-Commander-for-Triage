import Groq from "groq-sdk";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Shared Interfaces (used by handlers and agent-core)
// ============================================================

export interface LogAnalysisResult {
    rootCause: string;
    patch: string;
    explanation: string;
}

export interface CVEAnalysisResult {
    rootCause: string;
    patch: string;
    explanation: string;
    upgradeCommand: string;
}

export interface RunbookStep {
    index: number;
    description: string;
    type: "diagnostic" | "modification" | "restart" | "verification";
    requiresApproval: boolean;
    status: "pending" | "approved" | "executed" | "failed" | "skipped";
    approvalId?: string;
    result?: string;
    executedAt?: number;
    approvedBy?: string;
}

export interface CostRemediation {
    resourceId: string;
    service: string;
    action: "terminate" | "rightsize" | "stop" | "flag-for-review";
    estimatedSaving: number;
    reasoning: string;
    awsCommand: string;
}

// ============================================================
// Prompt Templates
// ============================================================

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

const CVE_PROMPT = `
You are a security engineer. Analyze this CVE and generate a minimal safe fix.

Respond with JSON only:
{
  "rootCause": "one sentence describing the root cause of the vulnerability",
  "patch": "complete corrected file content OR npm/yarn upgrade command as a comment block",
  "explanation": "two sentences on what changed and why it is safe",
  "upgradeCommand": "npm install package@fixedVersion"
}
Do NOT include markdown markup outside the JSON.
`;

const RUNBOOK_PROMPT = `
You are an SRE runbook parser. Parse the given runbook text into structured steps.
Classify each step as one of: "diagnostic", "modification", "restart", or "verification".
Mark requiresApproval=true for "modification" and "restart" types only.
Mark requiresApproval=false for "diagnostic" and "verification" types.

Your response MUST be a JSON object containing:
{
  "steps": [
    {
      "index": 1,
      "description": "the step description",
      "type": "diagnostic",
      "requiresApproval": false
    }
  ]
}
Do NOT include markdown markup outside the JSON.
`;

const COST_PROMPT = `
You are a FinOps cloud cost analyst. Analyze the given AWS cost anomaly and recommend remediation actions.

Your response MUST be a JSON object containing:
{
  "remediations": [
    {
      "resourceId": "the AWS resource ID",
      "service": "the AWS service name",
      "action": "terminate" | "rightsize" | "stop" | "flag-for-review",
      "estimatedSaving": 1000,
      "reasoning": "brief explanation of why this action is recommended",
      "awsCommand": "the AWS CLI command to execute this action"
    }
  ]
}
Do NOT include markdown markup outside the JSON.
`;

// ============================================================
// Helper: Get API key from secureContext or env
// ============================================================

function resolveApiKey(secureContext?: { getSecret: (key: string) => string | null }): string | undefined {
    if (secureContext) {
        const secretKey = secureContext.getSecret("groq_api_key");
        if (secretKey) return secretKey;
    }
    return process.env.GROQ_API_KEY;
}

function isValidApiKey(apiKey: string | undefined): apiKey is string {
    return !!apiKey && !apiKey.startsWith("gsk_mock") && apiKey !== "";
}

// ============================================================
// Function 1: analyzeLogs (existing, enhanced with secureContext)
// ============================================================

export async function analyzeLogs(logs: string[], secureContext?: { getSecret: (key: string) => string | null }): Promise<LogAnalysisResult> {
    const apiKey = resolveApiKey(secureContext);

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

    if (!isValidApiKey(apiKey)) {
        console.log("[Groq LLM] Warning: No valid GROQ_API_KEY found. Falling back to local diagnostic engine.");
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
        if (!content) throw new Error("Empty response from Groq");

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

// ============================================================
// Function 2: analyzeCVE (new)
// ============================================================

export async function analyzeCVE(
    cveAlert: {
        cveId: string;
        packageName: string;
        currentVersion?: string;
        fixedVersion?: string;
        description: string;
        vulnerableCode?: string;
        affectedFile?: string;
    },
    secureContext?: { getSecret: (key: string) => string | null }
): Promise<CVEAnalysisResult> {
    const apiKey = resolveApiKey(secureContext);

    const fallback: CVEAnalysisResult = {
        rootCause: `Vulnerability ${cveAlert.cveId} in ${cveAlert.packageName} allows exploitation due to outdated version.`,
        patch: `# Upgrade ${cveAlert.packageName} to fix ${cveAlert.cveId}\n# npm install ${cveAlert.packageName}@${cveAlert.fixedVersion || "latest"}`,
        explanation: `Upgrading ${cveAlert.packageName} from ${cveAlert.currentVersion || "current"} to ${cveAlert.fixedVersion || "latest"} patches the vulnerability. This is a safe semver-compatible upgrade.`,
        upgradeCommand: `npm install ${cveAlert.packageName}@${cveAlert.fixedVersion || "latest"}`
    };

    if (!isValidApiKey(apiKey)) {
        console.log("[Groq LLM] Warning: No valid GROQ_API_KEY. Using fallback CVE analysis.");
        return fallback;
    }

    try {
        console.log(`[Groq LLM] Analyzing CVE: ${cveAlert.cveId} for package ${cveAlert.packageName}...`);
        const groq = new Groq({ apiKey });

        const userContent = `CVE: ${cveAlert.cveId}
Package: ${cveAlert.packageName} ${cveAlert.currentVersion || "unknown"} → fix to ${cveAlert.fixedVersion || "latest"}
Description: ${cveAlert.description}
Affected file: ${cveAlert.affectedFile || "not specified"}
Affected file content: ${cveAlert.vulnerableCode || "not provided"}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: CVE_PROMPT },
                { role: "user", content: userContent }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty response from Groq");

        const parsed = JSON.parse(content) as CVEAnalysisResult;
        console.log(`[Groq LLM] CVE analysis complete for ${cveAlert.cveId}.`);
        return parsed;
    } catch (e: any) {
        console.error(`[Groq LLM] CVE analysis error: ${e.message}. Using fallback.`);
        return fallback;
    }
}

// ============================================================
// Function 3: parseRunbook (new)
// ============================================================

export async function parseRunbook(
    incidentTitle: string,
    runbookContent: string,
    secureContext?: { getSecret: (key: string) => string | null }
): Promise<RunbookStep[]> {
    const apiKey = resolveApiKey(secureContext);

    const fallbackSteps: RunbookStep[] = [
        { index: 1, description: "Check current system status and resource usage", type: "diagnostic", requiresApproval: false, status: "pending" },
        { index: 2, description: "Identify top resource consumers and bottlenecks", type: "diagnostic", requiresApproval: false, status: "pending" },
        { index: 3, description: "Restart affected service to clear state", type: "restart", requiresApproval: true, status: "pending" },
        { index: 4, description: "Verify service recovery and replication status", type: "verification", requiresApproval: false, status: "pending" },
        { index: 5, description: "Check connection pool and network status", type: "verification", requiresApproval: false, status: "pending" }
    ];

    if (!isValidApiKey(apiKey)) {
        console.log("[Groq LLM] Warning: No valid GROQ_API_KEY. Using fallback runbook steps.");
        return fallbackSteps;
    }

    try {
        console.log(`[Groq LLM] Parsing runbook for incident: ${incidentTitle}...`);
        const groq = new Groq({ apiKey });

        const userContent = `Incident: ${incidentTitle}
Runbook content:
${runbookContent}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: RUNBOOK_PROMPT },
                { role: "user", content: userContent }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty response from Groq");

        const parsed = JSON.parse(content);
        const steps: RunbookStep[] = (parsed.steps || fallbackSteps).map((s: any, i: number) => ({
            index: s.index || i + 1,
            description: s.description || `Step ${i + 1}`,
            type: s.type || "diagnostic",
            requiresApproval: s.requiresApproval || false,
            status: "pending" as const
        }));

        console.log(`[Groq LLM] Runbook parsed into ${steps.length} steps.`);
        return steps;
    } catch (e: any) {
        console.error(`[Groq LLM] Runbook parsing error: ${e.message}. Using fallback steps.`);
        return fallbackSteps;
    }
}

// ============================================================
// Function 4: analyzeCostAnomaly (new)
// ============================================================

export async function analyzeCostAnomaly(
    topResources: Array<{ service: string; cost: number; resourceId: string }>,
    percentageIncrease: number,
    secureContext?: { getSecret: (key: string) => string | null }
): Promise<CostRemediation[]> {
    const apiKey = resolveApiKey(secureContext);

    const fallback: CostRemediation[] = topResources.map(r => ({
        resourceId: r.resourceId,
        service: r.service,
        action: r.cost > 1000 ? "terminate" as const : "flag-for-review" as const,
        estimatedSaving: Math.round(r.cost * 0.7),
        reasoning: `${r.service} resource ${r.resourceId} is the top cost contributor at $${r.cost}. Recommended for ${r.cost > 1000 ? "termination" : "review"}.`,
        awsCommand: r.cost > 1000
            ? `aws ec2 terminate-instances --instance-ids ${r.resourceId}`
            : `aws ce get-cost-and-usage --filter '{"Dimensions":{"Key":"SERVICE","Values":["${r.service}"]}}'`
    }));

    if (!isValidApiKey(apiKey)) {
        console.log("[Groq LLM] Warning: No valid GROQ_API_KEY. Using fallback cost analysis.");
        return fallback;
    }

    try {
        console.log(`[Groq LLM] Analyzing cost anomaly (${percentageIncrease}% increase)...`);
        const groq = new Groq({ apiKey });

        const userContent = `Cost anomaly detected: ${percentageIncrease}% increase over baseline.
Top resources by spend:
${topResources.map(r => `- ${r.service}: $${r.cost} (${r.resourceId})`).join("\n")}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: COST_PROMPT },
                { role: "user", content: userContent }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty response from Groq");

        const parsed = JSON.parse(content);
        const remediations: CostRemediation[] = (parsed.remediations || fallback).map((r: any) => ({
            resourceId: r.resourceId || "unknown",
            service: r.service || "unknown",
            action: r.action || "flag-for-review",
            estimatedSaving: r.estimatedSaving || 0,
            reasoning: r.reasoning || "AI-recommended remediation action.",
            awsCommand: r.awsCommand || "aws ce get-cost-and-usage"
        }));

        console.log(`[Groq LLM] Cost analysis complete: ${remediations.length} remediation recommendations.`);
        return remediations;
    } catch (e: any) {
        console.error(`[Groq LLM] Cost analysis error: ${e.message}. Using fallback.`);
        return fallback;
    }
}
