#!/usr/bin/env npx tsx
/**
 * Fast simulation regression check (~10-15 seconds).
 *
 * Runs 3 key profiles (average-older, misconception-fractions, strong-older)
 * for 5 sessions each, computes metrics, and compares against regression-baseline.json.
 * Exits with code 1 if any metric regresses >10%.
 *
 * Usage:
 *   npx tsx simulations/src/regression.ts [--seed 42]
 *   npx tsx simulations/src/regression.ts --update-baseline   # Create/update regression baseline
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { SimulationRunner } from "./runner.js";
import type { LearnerProfile, SimulationConfig } from "./types.js";
import {
  computeProfileMetrics,
  compareBaselines,
  metricsToBaseline,
  type Baseline,
  type BaselineMetrics,
} from "./analyze.js";

const REGRESSION_PROFILES = [
  "average-older",
  "misconception-fractions",
  "strong-older",
];
const REGRESSION_SESSIONS = 5;

function loadProfile(profileId: string): LearnerProfile {
  const path = join(
    process.cwd(),
    "simulations",
    "profiles",
    `${profileId}.json`
  );
  if (!existsSync(path)) throw new Error(`Profile not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function runProfiles(seed: number) {
  const results: { profileId: string; metrics: BaselineMetrics; runDir: string }[] = [];

  for (const profileId of REGRESSION_PROFILES) {
    const profile = loadProfile(profileId);
    const config: SimulationConfig = {
      profile,
      discipline: "math",
      sessionCount: REGRESSION_SESSIONS,
      seed,
    };

    process.stdout.write(`  ${profileId}...`);
    const runner = new SimulationRunner(config);
    const result = await runner.run();
    const metrics = computeProfileMetrics(profileId, result.runDir, profile);
    const baseMetrics = metricsToBaseline(metrics);
    results.push({ profileId, metrics: baseMetrics, runDir: result.runDir });
    console.log(
      ` done (${result.totalEvents} events, mastery ${(metrics.finalMasteryPercent * 100).toFixed(0)}%)`
    );
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const seed = (() => {
    const idx = args.indexOf("--seed");
    return idx >= 0 ? parseInt(args[idx + 1], 10) : 42;
  })();
  const updateBaseline = args.includes("--update-baseline");

  const baselinePath = join(
    process.cwd(),
    "simulations",
    "regression-baseline.json"
  );

  if (!updateBaseline && !existsSync(baselinePath)) {
    console.log(
      "No regression-baseline.json found. Creating initial baseline...\n"
    );
    // Auto-create baseline on first run
    const start = Date.now();
    console.log(
      `Running ${REGRESSION_PROFILES.length} profiles × ${REGRESSION_SESSIONS} sessions (seed=${seed})\n`
    );
    const results = await runProfiles(seed);

    const baseline: Baseline = {
      generatedAt: new Date().toISOString(),
      seed,
      sessions: REGRESSION_SESSIONS,
      profiles: {},
      contentQuality: { tooHard: [], tooEasy: [], perTopicAccuracy: {} },
    };
    for (const r of results) {
      baseline.profiles[r.profileId] = r.metrics;
    }
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nBaseline created in ${elapsed}s: ${baselinePath}`);
    console.log("Run again to compare against this baseline.");
    return;
  }

  if (updateBaseline) {
    console.log(
      `Updating regression baseline: ${REGRESSION_PROFILES.length} profiles × ${REGRESSION_SESSIONS} sessions (seed=${seed})\n`
    );
    const start = Date.now();
    const results = await runProfiles(seed);

    const baseline: Baseline = {
      generatedAt: new Date().toISOString(),
      seed,
      sessions: REGRESSION_SESSIONS,
      profiles: {},
      contentQuality: { tooHard: [], tooEasy: [], perTopicAccuracy: {} },
    };
    for (const r of results) {
      baseline.profiles[r.profileId] = r.metrics;
    }
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nBaseline updated in ${elapsed}s: ${baselinePath}`);
    return;
  }

  // Normal regression check
  const baseline: Baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));

  console.log(
    `Simulation regression check: ${REGRESSION_PROFILES.length} profiles × ${REGRESSION_SESSIONS} sessions (seed=${seed})\n`
  );

  const start = Date.now();
  const results = await runProfiles(seed);

  const currentMetrics: Record<string, BaselineMetrics> = {};
  for (const r of results) {
    currentMetrics[r.profileId] = r.metrics;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s\n`);

  // Compare
  const comparisons = compareBaselines(baseline, currentMetrics);
  const regressions = comparisons.filter((r) => r.regressed);

  if (regressions.length === 0) {
    console.log("All metrics within baseline tolerance (±10%). PASS");
  } else {
    console.log(`${regressions.length} REGRESSIONS detected:\n`);
    console.log(
      "Profile".padEnd(28) +
        "Metric".padEnd(25) +
        "Baseline".padEnd(12) +
        "Current".padEnd(12) +
        "Delta%".padEnd(10)
    );
    console.log("-".repeat(87));
    for (const r of regressions) {
      console.log(
        r.profileId.padEnd(28) +
          r.metric.padEnd(25) +
          r.baseline.toFixed(4).padEnd(12) +
          r.current.toFixed(4).padEnd(12) +
          `${(r.deltaPercent * 100).toFixed(1)}%`.padEnd(10)
      );
    }
    console.log("\nFAIL — regression detected");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
