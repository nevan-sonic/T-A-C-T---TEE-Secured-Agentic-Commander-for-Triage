/**
 * Data-Driven Canary Window
 * Replaces the hardcoded 5s timeout with actual live telemetry polling.
 * Polls /api/telemetry-metrics 6 times at 5-second intervals (30s total),
 * computing a rolling average error rate to decide rollback vs resolve.
 */

import { agent } from "./agent-core";

interface CanaryObservation {
    round: number;
    errorRate: number;
    latency: number;
    passed: boolean;
    timestamp: number;
}

export interface CanaryResult {
    avgErrorRate: number;
    avgLatency: number;
    passed: number;
    failed: number;
    observations: CanaryObservation[];
    verdict: "Resolved" | "Regression Detected" | "Degraded";
}

const CANARY_ROUNDS = 6;
const CANARY_INTERVAL_MS = 5000;
const HEALTHY_THRESHOLD = 10;  // < 10% error rate = healthy
const REGRESSION_THRESHOLD = 25; // > 25% error rate = regression

export async function runCanaryWindow(
    incidentId: string,
    actorDID: string,
    port: number = 3001
): Promise<CanaryResult> {
    const observations: CanaryObservation[] = [];
    const baseUrl = `http://localhost:${port}`;

    console.log(`[Canary] Starting ${CANARY_ROUNDS}-round telemetry window for incident ${incidentId}...`);

    for (let round = 1; round <= CANARY_ROUNDS; round++) {
        try {
            const response = await fetch(`${baseUrl}/api/telemetry-metrics`);
            const data = await response.json() as { latency: number; errorRate: number };
            
            const passed = data.errorRate < HEALTHY_THRESHOLD;
            const observation: CanaryObservation = {
                round,
                errorRate: data.errorRate,
                latency: data.latency,
                passed,
                timestamp: Date.now()
            };
            observations.push(observation);

            // Write each observation to audit ledger
            const action = passed ? "CANARY_PASS" : "CANARY_FAIL";
            await agent.audit.write({
                action,
                actor: actorDID,
                incidentId,
                details: `Round ${round}/${CANARY_ROUNDS}: errorRate=${data.errorRate}%, latency=${data.latency}ms`
            });

            console.log(`[Canary] Round ${round}/${CANARY_ROUNDS}: ${passed ? "✅ PASS" : "❌ FAIL"} — error=${data.errorRate}%, latency=${data.latency}ms`);

        } catch (e: any) {
            console.error(`[Canary] Round ${round} fetch error: ${e.message}`);
            observations.push({
                round,
                errorRate: 100,
                latency: 0,
                passed: false,
                timestamp: Date.now()
            });

            await agent.audit.write({
                action: "CANARY_FAIL",
                actor: actorDID,
                incidentId,
                details: `Round ${round}/${CANARY_ROUNDS}: Fetch error — ${e.message}`
            });
        }

        // Wait between rounds (skip wait after last round)
        if (round < CANARY_ROUNDS) {
            await new Promise(resolve => setTimeout(resolve, CANARY_INTERVAL_MS));
        }
    }

    // Compute rolling averages
    const avgErrorRate = Math.round(
        observations.reduce((sum, o) => sum + o.errorRate, 0) / observations.length
    );
    const avgLatency = Math.round(
        observations.reduce((sum, o) => sum + o.latency, 0) / observations.length
    );
    const passed = observations.filter(o => o.passed).length;
    const failed = observations.filter(o => !o.passed).length;

    // Decision logic
    let verdict: CanaryResult["verdict"];
    if (avgErrorRate >= REGRESSION_THRESHOLD) {
        verdict = "Regression Detected";
    } else if (avgErrorRate >= HEALTHY_THRESHOLD) {
        verdict = "Degraded";
    } else {
        verdict = "Resolved";
    }

    console.log(`[Canary] Final verdict: ${verdict} — avgError=${avgErrorRate}%, avgLatency=${avgLatency}ms, passed=${passed}/${CANARY_ROUNDS}`);

    return { avgErrorRate, avgLatency, passed, failed, observations, verdict };
}
