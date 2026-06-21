/**
 * T3 Attested Patch Confidence Score (Enhanced)
 * Validates LLM-generated patches inside the enclave before applying.
 * Context-aware: db-pool, cve, or general patches.
 * Detects malicious code patterns and rejects them immediately.
 */

export interface PatchValidationChecks {
    hasSyntax: boolean;
    hasExpectedPattern: boolean;
    valueInSafeRange: boolean;
    noMaliciousPatterns: boolean;
}

export interface PatchValidationResult {
    score: number;
    safe: boolean;
    reason: string;
    checks: PatchValidationChecks;
}

// Patterns that indicate potentially malicious code
const MALICIOUS_PATTERNS = [
    /eval\s*\(/,
    /require\s*\(\s*["']child_process["']\s*\)/,
    /require\s*\(\s*["']vm["']\s*\)/,
    /\bexec\s*\(/,
    /\bexecSync\s*\(/,
    /\bspawn\s*\(/,
    /\bspawnSync\s*\(/,
    /fs\.unlink/,
    /fs\.rm\b/,
    /fs\.rmdir/,
    /process\.exit/,
    /process\.kill/,
    /global\.process/,
    /__proto__/,
    /constructor\s*\[\s*["']prototype["']\s*\]/,
    /Function\s*\(/,
    /import\s*\(\s*["']child_process["']\s*\)/,
];

function detectMaliciousPatterns(patch: string): { clean: boolean; detected: string[] } {
    const detected: string[] = [];
    for (const pattern of MALICIOUS_PATTERNS) {
        if (pattern.test(patch)) {
            detected.push(pattern.source);
        }
    }
    return { clean: detected.length === 0, detected };
}

function checkSyntax(patch: string): boolean {
    try {
        new Function(patch);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate a patch with context-aware rules.
 * @param patch - The patch content to validate
 * @param context - The type of patch: "db-pool", "cve", or "general"
 */
export function validatePatch(
    patch: string,
    context: "db-pool" | "cve" | "general" = "general"
): PatchValidationResult {
    if (!patch || patch.trim().length === 0) {
        return {
            score: 0,
            safe: false,
            reason: "Empty patch provided",
            checks: { hasSyntax: false, hasExpectedPattern: false, valueInSafeRange: false, noMaliciousPatterns: true }
        };
    }

    // Check 1: Malicious pattern detection (immediate reject if found)
    const maliciousCheck = detectMaliciousPatterns(patch);
    if (!maliciousCheck.clean) {
        console.log(`[Validate] ⚠ Malicious patterns detected: ${maliciousCheck.detected.join(", ")}`);
        return {
            score: 0,
            safe: false,
            reason: `Malicious code patterns detected: ${maliciousCheck.detected.join(", ")}. Patch rejected.`,
            checks: { hasSyntax: true, hasExpectedPattern: false, valueInSafeRange: false, noMaliciousPatterns: false }
        };
    }

    // Check 2: Syntax validation
    const hasSyntax = checkSyntax(patch);

    // Check 3 & 4: Context-specific checks
    let hasExpectedPattern = false;
    let valueInSafeRange = true;
    let contextReason = "";

    switch (context) {
        case "db-pool": {
            // Must contain Pool constructor
            hasExpectedPattern = patch.includes("Pool");
            const maxMatch = patch.match(/max:\s*(\d+)/);
            if (maxMatch) {
                const maxVal = parseInt(maxMatch[1]);
                valueInSafeRange = maxVal >= 30 && maxVal <= 100;
                contextReason = `Pool size ${maxVal} ${valueInSafeRange ? "is within safe bounds" : "outside safe range (30–100)"}.`;
            } else {
                valueInSafeRange = false;
                contextReason = "No max value found in pool configuration.";
            }
            break;
        }
        case "cve": {
            // Must contain version change or package reference
            const hasVersionChange = /["']\d+\.\d+\.\d+["']/.test(patch) || /npm install|yarn add/.test(patch) || /version/i.test(patch);
            const hasPackageRef = /require\s*\(|import\s|package/.test(patch);
            hasExpectedPattern = hasVersionChange || hasPackageRef;
            contextReason = hasExpectedPattern
                ? "Package version or upgrade command detected."
                : "No version change or package reference found in patch.";
            break;
        }
        case "general":
        default: {
            // For general patches, just check it has some meaningful content
            hasExpectedPattern = patch.length > 20;
            contextReason = hasExpectedPattern ? "Patch has meaningful content." : "Patch appears too short to be valid.";
            break;
        }
    }

    // Score calculation: 25 points per passing check
    let score = 0;
    if (hasSyntax) score += 25;
    if (hasExpectedPattern) score += 25;
    if (valueInSafeRange) score += 25;
    if (maliciousCheck.clean) score += 25;

    const safe = score >= 70;

    // Build reason string
    let reason = "";
    if (context === "db-pool") {
        reason = contextReason + (hasSyntax ? " Syntax OK." : " Syntax ERROR.");
    } else if (context === "cve") {
        reason = contextReason + (hasSyntax ? " Syntax OK." : " Syntax ERROR.");
    } else {
        reason = (hasExpectedPattern ? "Valid patch structure. " : "Invalid patch structure. ") + (hasSyntax ? "Syntax OK." : "Syntax ERROR.");
    }

    console.log(`[Validate] Score: ${score}/100 | Safe: ${safe} | Context: ${context} | ${reason}`);

    return { score, safe, reason, checks: { hasSyntax, hasExpectedPattern, valueInSafeRange, noMaliciousPatterns: maliciousCheck.clean } };
}
