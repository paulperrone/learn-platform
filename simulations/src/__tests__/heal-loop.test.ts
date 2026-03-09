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
} from "../heal-loop.js";
import type {
  HealEpoch,
  HealingHistory,
  HealingReport,
  SystemEvaluationResult,
  ConvergenceState,
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

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
