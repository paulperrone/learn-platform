#!/usr/bin/env npx tsx
/**
 * Tests for the healing loop orchestrator.
 *
 * Usage: npx tsx simulations/src/__tests__/heal-loop.test.ts
 */
import {
  computeDelta,
  detectConvergence,
  generateCheckpointSummary,
  loadHistory,
  saveHistory,
  selectFixTarget,
  isContentConverged,
  detectSoftRegressions,
} from "../heal-loop.js";
import type {
  HealEpoch,
  HealingHistory,
  HealingReport,
  SystemEvaluationResult,
  ConvergenceState,
  SignalSource,
} from "../types.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} (actual: ${actual}, expected: ${expected})`);
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeSystemResult(
  id: string,
  status: "PASS" | "WARN" | "FAIL",
  actual: number,
  target: number
): SystemEvaluationResult {
  return {
    systemId: id,
    name: id,
    priority: "P1",
    status,
    actual,
    target,
    tolerance: 1,
    delta: actual - target,
    direction: "higher_better",
    unit: "count",
    contributingProfiles: [],
  };
}

function makeReport(
  systems: SystemEvaluationResult[],
  passCount?: number,
  warnCount?: number,
  failCount?: number
): HealingReport {
  const p = passCount ?? systems.filter((s) => s.status === "PASS").length;
  const w = warnCount ?? systems.filter((s) => s.status === "WARN").length;
  const f = failCount ?? systems.filter((s) => s.status === "FAIL").length;
  return {
    timestamp: new Date().toISOString(),
    targetVersion: 2,
    systems,
    profiles: [],
    contentQuality: { tooHard: [], tooEasy: [], miscalibrated: [] },
    summary: {
      passCount: p,
      warnCount: w,
      failCount: f,
      overallStatus: f > 0 ? "FAIL" : w > 0 ? "WARN" : "PASS",
    },
  };
}

function makeEpoch(
  epochNumber: number,
  report: HealingReport,
  delta: Record<string, number> = {}
): HealEpoch {
  return {
    epochNumber,
    timestamp: new Date().toISOString(),
    simulationSeed: 42,
    sessions: 30,
    evaluationResult: report,
    systemsPassCount: report.summary.passCount,
    systemsFailCount: report.summary.failCount,
    systemsWarnCount: report.summary.warnCount,
    deltaFromPreviousEpoch: delta,
    fixesApplied: [],
  };
}

// ── Test: computeDelta ───────────────────────────────────────────────

console.log("\n1. computeDelta");
{
  const current = makeReport([
    makeSystemResult("mastery_convergence", "PASS", 7, 6),
    makeSystemResult("interleaving", "PASS", 9, 7),
  ]);

  const previous = makeReport([
    makeSystemResult("mastery_convergence", "PASS", 6, 6),
    makeSystemResult("interleaving", "WARN", 5, 7),
  ]);

  const delta = computeDelta(current, previous);
  assertEqual(delta["mastery_convergence"], 1, "mastery_convergence improved by 1");
  assertEqual(delta["interleaving"], 4, "interleaving improved by 4");

  const deltaFromNull = computeDelta(current, null);
  assertEqual(Object.keys(deltaFromNull).length, 0, "delta from null is empty");
}

// ── Test: detectConvergence — converged ──────────────────────────────

console.log("\n2. detectConvergence — converged");
{
  const report = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "WARN", 5, 7),
  ]);
  const history: HealingHistory = {
    epochs: [makeEpoch(1, report)],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "converged", "status is converged when no FAIL");
}

// ── Test: detectConvergence — running ────────────────────────────────

console.log("\n3. detectConvergence — running with failures");
{
  const report = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "FAIL", 3, 7),
  ]);
  const history: HealingHistory = {
    epochs: [makeEpoch(1, report, { a: 2, b: 1 })],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "running", "status is running with FAIL systems");
}

// ── Test: detectConvergence — regression detected ────────────────────

console.log("\n4. detectConvergence — regression detected");
{
  const report1 = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "PASS", 7, 7),
  ]);
  const report2 = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "FAIL", 4, 7),
  ]);
  const history: HealingHistory = {
    epochs: [
      makeEpoch(1, report1),
      makeEpoch(2, report2, { a: 0, b: -3 }),
    ],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "user_review_needed", "regression triggers user_review_needed");
  assert(convergence.reason.includes("Regression"), "reason mentions regression");
}

// ── Test: detectConvergence — stalled ────────────────────────────────

console.log("\n5. detectConvergence — stalled");
{
  const report = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "FAIL", 4, 7),
  ]);
  const history: HealingHistory = {
    epochs: [
      makeEpoch(1, report, { a: 0, b: 0 }),
      makeEpoch(2, report, { a: 0, b: 0 }),
    ],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "stalled", "no improvement in 2 epochs = stalled");
}

// ── Test: detectConvergence — empty history ──────────────────────────

console.log("\n6. detectConvergence — empty history");
{
  const history: HealingHistory = {
    epochs: [],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "running", "empty history = running");
}

// ── Test: generateCheckpointSummary ──────────────────────────────────

console.log("\n7. generateCheckpointSummary");
{
  const report1 = makeReport([
    makeSystemResult("a", "FAIL", 4, 6),
    makeSystemResult("b", "PASS", 8, 7),
  ]);
  const report2 = makeReport([
    makeSystemResult("a", "PASS", 7, 6),
    makeSystemResult("b", "PASS", 8, 7),
  ]);

  const epochs = [makeEpoch(1, report1), makeEpoch(2, report2)];
  const convergence: ConvergenceState = {
    status: "converged",
    reason: "All systems passing",
    recommendedAction: "System is healthy.",
  };

  const summary = generateCheckpointSummary(1, epochs, convergence);
  assert(summary.includes("Checkpoint 1"), "summary includes checkpoint number");
  assert(summary.includes("converged"), "summary includes status");
  assert(summary.includes("| a |"), "summary includes system table");
  assert(summary.includes("**Improved:** a"), "summary lists improved systems");
  assert(summary.includes("**Unchanged:** b"), "summary lists unchanged systems");
}

// ── Test: computeDelta — system added in current but not previous ────

console.log("\n8. computeDelta — new system in current epoch");
{
  const current = makeReport([
    makeSystemResult("a", "PASS", 7, 6),
    makeSystemResult("new_system", "FAIL", 2, 5),
  ]);
  const previous = makeReport([
    makeSystemResult("a", "PASS", 6, 6),
  ]);

  const delta = computeDelta(current, previous);
  assertEqual(delta["a"], 1, "existing system has delta");
  assertEqual(delta["new_system"], undefined, "new system has no delta (no previous)");
}

// ── Test: convergence not stalled when improvements exist ────────────

console.log("\n9. detectConvergence — not stalled with improvements");
{
  const report = makeReport([
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "FAIL", 4, 7),
  ]);
  const history: HealingHistory = {
    epochs: [
      makeEpoch(1, report, { a: 0, b: 0 }),
      makeEpoch(2, report, { a: 0, b: 2 }),  // b improved
    ],
    startedAt: new Date().toISOString(),
    targetVersion: 2,
    currentStatus: "running",
  };

  const convergence = detectConvergence(history);
  assertEqual(convergence.status, "running", "not stalled when b improved");
}

// ── Test: selectFixTarget — priority ordering ───────────────────────

console.log("\n10. selectFixTarget — priority ordering");
{
  const systems = [
    makeSystemResult("review_new_balance", "FAIL", 0.88, 0.60),
    makeSystemResult("mastery_convergence", "FAIL", 2, 4),
    makeSystemResult("interleaving", "FAIL", 0.14, 0.10),
  ];
  // Override priorities to match real targets
  systems[0].priority = "P1";
  systems[1].priority = "P0";
  systems[2].priority = "P1";

  const sources: Record<string, SignalSource> = {
    review_new_balance: "engine",
    mastery_convergence: "engine",
    interleaving: "engine",
  };

  const result = selectFixTarget(systems, sources, {});
  assertEqual(result?.systemId, "mastery_convergence", "P0 system selected first");
}

// ── Test: selectFixTarget — skips non-engine signal sources ─────────

console.log("\n11. selectFixTarget — skips bridge/content signal sources");
{
  const systems = [
    makeSystemResult("cognitive_demand_entropy", "FAIL", 0.5, 0.9),
    makeSystemResult("review_new_balance", "FAIL", 0.88, 0.60),
  ];
  systems[0].priority = "P2";
  systems[1].priority = "P1";

  const sources: Record<string, SignalSource> = {
    cognitive_demand_entropy: "bridge",
    review_new_balance: "engine",
  };

  const result = selectFixTarget(systems, sources, {});
  assertEqual(result?.systemId, "review_new_balance", "bridge system skipped, engine selected");
}

// ── Test: selectFixTarget — skips exhausted systems ─────────────────

console.log("\n12. selectFixTarget — skips systems with 2+ failed attempts");
{
  const systems = [
    makeSystemResult("mastery_convergence", "FAIL", 2, 4),
    makeSystemResult("interleaving", "FAIL", 0.14, 0.10),
  ];
  systems[0].priority = "P0";
  systems[1].priority = "P1";

  const sources: Record<string, SignalSource> = {
    mastery_convergence: "engine",
    interleaving: "engine",
  };

  const failedApproaches = {
    mastery_convergence: [
      { system: "mastery_convergence", approach: "a", result: "unchanged", epoch: 1 },
      { system: "mastery_convergence", approach: "b", result: "regressed", epoch: 2 },
    ],
  };

  const result = selectFixTarget(systems, sources, failedApproaches);
  assertEqual(result?.systemId, "interleaving", "exhausted P0 skipped, P1 selected");
}

// ── Test: selectFixTarget — returns null when no candidates ─────────

console.log("\n13. selectFixTarget — returns null when all skipped/passing");
{
  const systems = [
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "WARN", 5, 7),
  ];

  const result = selectFixTarget(systems, {}, {});
  assertEqual(result, null, "no FAIL systems = null");
}

// ── Test: selectFixTarget — --target override ───────────────────────

console.log("\n14. selectFixTarget — target system override");
{
  const systems = [
    makeSystemResult("mastery_convergence", "FAIL", 2, 4),
    makeSystemResult("interleaving", "FAIL", 0.14, 0.10),
  ];
  systems[0].priority = "P0";
  systems[1].priority = "P1";

  const result = selectFixTarget(systems, {}, {}, 2, "interleaving");
  assertEqual(result?.systemId, "interleaving", "target override selects specified system");
}

// ── Test: isContentConverged ────────────────────────────────────────

console.log("\n15. isContentConverged");
{
  const systems1 = [
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("cognitive_demand_entropy", "FAIL", 0.5, 0.9),
  ];
  const sources1: Record<string, SignalSource> = {
    a: "engine",
    cognitive_demand_entropy: "bridge",
  };
  assert(isContentConverged(systems1, sources1), "only bridge FAIL = content-converged");

  const systems2 = [
    makeSystemResult("a", "FAIL", 3, 6),
    makeSystemResult("cognitive_demand_entropy", "FAIL", 0.5, 0.9),
  ];
  const sources2: Record<string, SignalSource> = {
    a: "engine",
    cognitive_demand_entropy: "bridge",
  };
  assert(!isContentConverged(systems2, sources2), "engine FAIL present = not content-converged");

  const systems3 = [
    makeSystemResult("a", "PASS", 8, 6),
    makeSystemResult("b", "PASS", 7, 7),
  ];
  assert(!isContentConverged(systems3, {}), "all PASS = not content-converged (just converged)");
}

// ── Test: detectSoftRegressions ─────────────────────────────────────

console.log("\n16. detectSoftRegressions");
{
  const previous = [
    makeSystemResult("a", "FAIL", 3, 6),   // target: 6, tolerance: 1
    makeSystemResult("b", "PASS", 8, 6),   // target: 6, tolerance: 1
  ];
  const current = [
    makeSystemResult("a", "FAIL", 3, 6),   // unchanged
    makeSystemResult("b", "PASS", 7.5, 6), // dropped 8→7.5, delta 0.5 within tolerance of 1
  ];

  const regs = detectSoftRegressions(current, previous, "a");
  assertEqual(regs.length, 0, "no soft regression when within tolerance (fix target excluded)");

  // Now simulate a worse case
  const currentBad = [
    makeSystemResult("a", "FAIL", 3, 6),
    makeSystemResult("b", "PASS", 5, 6),   // dropped 8→5, beyond tolerance of 1
  ];
  const regsBad = detectSoftRegressions(currentBad, previous, "a");
  assertEqual(regsBad.length, 1, "soft regression detected beyond tolerance");
  assertEqual(regsBad[0]?.systemId, "b", "regression on system b");
}

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
