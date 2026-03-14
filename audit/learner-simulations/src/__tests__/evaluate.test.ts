#!/usr/bin/env npx tsx
/**
 * Tests for the evaluation engine code (metric classification, direction
 * handling, system evaluation). This is a CODE TEST — it validates that
 * the evaluation tool works correctly, not that the system meets targets.
 *
 * Usage: npx tsx audit/learner-simulations/src/__tests__/evaluate.test.ts
 */
import {
  classifyResult,
  loadRuns,
  evaluateSystems,
  evaluateProfiles,
  evaluateContentQuality,
  buildHealingReport,
} from "../evaluate.js";
import { loadTargets } from "../load-targets.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TargetDefinition } from "../types.js";

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

// ── Test: classifyResult — higher_better ──────────────────────────────

console.log("\n1. classifyResult — higher_better");
{
  const target: TargetDefinition = {
    name: "Test",
    description: "Test",
    priority: "P0",
    metric: "test",
    target: 6,
    tolerance: 1,
    unit: "count",
    direction: "higher_better",
    science_ref: "test",
    rationale: "test",
    source_files: ["test.ts"],
    evaluation_profiles: ["all"],
  };

  assertEqual(classifyResult(7, target), "PASS", "Above target = PASS");
  assertEqual(classifyResult(6, target), "PASS", "At target = PASS");
  assertEqual(classifyResult(5, target), "WARN", "Within tolerance = WARN");
  assertEqual(classifyResult(4, target), "FAIL", "Below tolerance = FAIL");
}

// ── Test: classifyResult — lower_better ───────────────────────────────

console.log("\n2. classifyResult — lower_better");
{
  const target: TargetDefinition = {
    name: "Test",
    description: "Test",
    priority: "P0",
    metric: "test",
    target: 10,
    tolerance: 2,
    unit: "percent",
    direction: "lower_better",
    science_ref: "test",
    rationale: "test",
    source_files: ["test.ts"],
    evaluation_profiles: ["all"],
  };

  assertEqual(classifyResult(8, target), "PASS", "Below target = PASS");
  assertEqual(classifyResult(10, target), "PASS", "At target = PASS");
  assertEqual(classifyResult(11, target), "WARN", "Within tolerance = WARN");
  assertEqual(classifyResult(13, target), "FAIL", "Above tolerance = FAIL");
}

// ── Test: classifyResult — in_range ───────────────────────────────────

console.log("\n3. classifyResult — in_range");
{
  const target: TargetDefinition = {
    name: "Test",
    description: "Test",
    priority: "P1",
    metric: "test",
    target: 0.60,
    tolerance: 0.05,
    unit: "ratio",
    direction: "in_range",
    range_min: 0.50,
    range_max: 0.70,
    science_ref: "test",
    rationale: "test",
    source_files: ["test.ts"],
    evaluation_profiles: ["all"],
  };

  assertEqual(classifyResult(0.60, target), "PASS", "In range = PASS");
  assertEqual(classifyResult(0.50, target), "PASS", "At range_min = PASS");
  assertEqual(classifyResult(0.70, target), "PASS", "At range_max = PASS");
  assertEqual(classifyResult(0.47, target), "WARN", "Below range but within tolerance = WARN");
  assertEqual(classifyResult(0.74, target), "WARN", "Above range but within tolerance = WARN");
  assertEqual(classifyResult(0.40, target), "FAIL", "Below tolerance = FAIL");
  assertEqual(classifyResult(0.80, target), "FAIL", "Above tolerance = FAIL");
}

// ── Test: real targets.json has all required systems ──────────────────

console.log("\n4. All 10 system targets produce valid classification");
{
  const { targets, errors } = loadTargets();
  assertEqual(errors.length, 0, "targets.json loads cleanly");

  const expectedSystems = [
    "mastery_convergence",
    "mastery_preservation",
    "difficulty_targeting",
    "review_new_balance",
    "interleaving",
    "fire_compression",
    "remediation_routing",
    "presentation_drift",
    "diagnostic_placement",
    "cognitive_demand_entropy",
  ];

  for (const sysId of expectedSystems) {
    const target = targets.systems[sysId];
    assert(!!target, `System ${sysId} exists`);
    if (target) {
      const result = classifyResult(target.target, target);
      assertEqual(result, "PASS", `${sysId} at target value = PASS`);
    }
  }
}

// ── Test: evaluate runs against existing data ─────────────────────────

console.log("\n5. Evaluate runs against existing simulation data");
{
  const runsDir = join(process.cwd(), "audit", "learner-simulations", "runs");
  if (existsSync(runsDir)) {
    const { targets } = loadTargets();

    const runs = loadRuns(runsDir);
    assert(runs.length > 0, `Found ${runs.length} profile runs`);

    const systemResults = evaluateSystems(runs, targets);
    assertEqual(systemResults.length, 10, "10 system evaluations produced");

    for (const r of systemResults) {
      assert(!!r.systemId, `${r.systemId} has systemId`);
      assert(["PASS", "WARN", "FAIL"].includes(r.status), `${r.systemId} has valid status`);
      assert(typeof r.actual === "number", `${r.systemId} has numeric actual`);
      assert(typeof r.delta === "number", `${r.systemId} has numeric delta`);
    }

    // Profile evaluation
    const profileResults = evaluateProfiles(runs, targets.profile_expectations);
    assert(profileResults.length > 0, `${profileResults.length} profile evaluations produced`);
    for (const p of profileResults) {
      assert(!!p.profileId, `Profile ${p.profileId} has profileId`);
      assert(typeof p.behavioralMatch === "boolean", `Profile ${p.profileId} has behavioralMatch`);
    }

    // Content quality
    const contentQuality = evaluateContentQuality(runs, targets);
    assert(Array.isArray(contentQuality.tooHard), "Content quality has tooHard array");
    assert(Array.isArray(contentQuality.tooEasy), "Content quality has tooEasy array");
    assert(Array.isArray(contentQuality.miscalibrated), "Content quality has miscalibrated array");

    // Build full report
    const report = buildHealingReport(systemResults, profileResults, contentQuality, targets.version);
    assert(!!report.timestamp, "Report has timestamp");
    assert(report.targetVersion >= 1, `Report target version is valid (v${report.targetVersion})`);
    assert(
      report.summary.passCount + report.summary.warnCount + report.summary.failCount === 10,
      "Summary counts add up to 10"
    );
  } else {
    console.log("  (skipped — no simulation runs available)");
  }
}

// ── Test: graceful handling of missing data ───────────────────────────

console.log("\n6. Graceful handling of missing runs directory");
{
  const runs = loadRuns("/nonexistent/path");
  assertEqual(runs.length, 0, "Empty result for missing directory");
}

// ── Test: JSON output format ──────────────────────────────────────────

console.log("\n7. Report JSON is parseable");
{
  const jsonPath = join(process.cwd(), "audit", "reports", "evaluation.json");
  if (existsSync(jsonPath)) {
    const raw = readFileSync(jsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    assert(!!parsed.timestamp, "JSON report has timestamp");
    assert(Array.isArray(parsed.systems), "JSON report has systems array");
    assert(Array.isArray(parsed.profiles), "JSON report has profiles array");
    assert(!!parsed.contentQuality, "JSON report has contentQuality");
    assert(!!parsed.summary, "JSON report has summary");
  } else {
    console.log("  (skipped — run `just evaluate` first to generate JSON)");
  }
}

// ── Test: Markdown output renders ─────────────────────────────────────

console.log("\n8. Markdown report generates correctly");
{
  const mdPath = join(process.cwd(), "audit", "reports", "evaluation.md");
  if (existsSync(mdPath)) {
    const content = readFileSync(mdPath, "utf-8");
    assert(content.includes("# Evaluation Report"), "Has title");
    assert(content.includes("## System Results"), "Has system results section");
    assert(content.includes("## Profile Results"), "Has profile results section");
    assert(content.includes("PASS") || content.includes("FAIL") || content.includes("WARN"),
      "Contains status indicators");
  } else {
    console.log("  (skipped — run `just evaluate` first to generate markdown)");
  }
}

// ── Summary ──────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
