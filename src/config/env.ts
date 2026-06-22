/**
 * Environment variable helper — server-only.
 *
 * Never throws at module import time. Throws only when an operation
 * requiring the secret actually begins.
 */

/**
 * Retrieve a required environment variable. Throws a clear error if missing.
 * Use this instead of `process.env.X || "hardcoded-fallback"`.
 */
export function requireEnvironment(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `[Config] Required environment variable ${name} is not set. ` +
            `Add it to your local .env file and never commit it.`
        );
    }
    return value;
}

/**
 * Retrieve an optional environment variable with a safe default.
 * Only use for non-secret configuration values.
 */
export function optionalEnvironment(name: string, defaultValue: string): string {
    return process.env[name] || defaultValue;
}
