#!/usr/bin/env npx tsx
/**
 * Tests for target loading and validation code (file parsing, schema
 * validation). This is a CODE TEST — it validates that the target
 * loader works correctly, not that targets are met.
 *
 * Usage: npx tsx audit/learner-simulations/src/__tests__/load-targets.test.ts
 */
import { loadTargets } from "../load-targets.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { TargetFile } from "../types.js";

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

// --- Test: Valid targets.json loads without errors ---

console.log("\n1. Valid targets.json loads without errors");
{
  const result = loadTargets();
  assertEqual(result.errors.length, 0, "No validation errors");
  assert(result.targets.version >= 1, `Version is valid (v${result.targets.version})`);
  assert(!!result.targets.lastUpdated, "Has lastUpdated");
  assert(!!result.targets.lastUpdatedReason, "Has lastUpdatedReason");
}

// --- Test: All 10 system targets present ---

console.log("\n2. All 10 system targets present");
{
  const result = loadTargets();
  const systems = Object.keys(result.targets.systems);
  assertEqual(systems.length, 10, "10 system targets");

  const expected = [
    "mastery_convergence", "mastery_preservation", "difficulty_targeting",
    "review_new_balance", "interleaving", "fire_compression",
    "remediation_routing", "presentation_drift", "diagnostic_placement",
    "cognitive_demand_entropy",
  ];
  for (const id of expected) {
    assert(systems.includes(id), `Has system: ${id}`);
  }
}

// --- Test: All 10 profile expectations present ---

console.log("\n3. All 10 profile expectations present");
{
  const result = loadTargets();
  const profiles = Object.keys(result.targets.profile_expectations);
  assertEqual(profiles.length, 10, "10 profile expectations");

  const expected = [
    "average-older", "average-young", "fast-learner", "misconception-fractions",
    "overconfident", "strong-older", "strong-young", "struggling-older",
    "struggling-young", "underconfident",
  ];
  for (const id of expected) {
    assert(profiles.includes(id), `Has profile: ${id}`);
  }
}

// --- Test: Priority distribution ---

console.log("\n4. Priority distribution");
{
  const result = loadTargets();
  const priorities = Object.values(result.targets.systems).map((s) => s.priority);
  const p0 = priorities.filter((p) => p === "P0").length;
  const p1 = priorities.filter((p) => p === "P1").length;
  const p2 = priorities.filter((p) => p === "P2").length;
  assert(p0 >= 2, `At least 2 P0 targets (got ${p0})`);
  assert(p1 >= 3, `At least 3 P1 targets (got ${p1})`);
  assert(p2 >= 2, `At least 2 P2 targets (got ${p2})`);
}

// --- Test: in_range targets have range_min and range_max ---

console.log("\n5. in_range targets have range bounds");
{
  const result = loadTargets();
  for (const [id, sys] of Object.entries(result.targets.systems)) {
    if (sys.direction === "in_range") {
      assert(typeof sys.range_min === "number", `${id} has range_min`);
      assert(typeof sys.range_max === "number", `${id} has range_max`);
      assert(sys.range_min < sys.range_max, `${id} range_min < range_max`);
    }
  }
}

// --- Test: Content quality thresholds present ---

console.log("\n6. Content quality thresholds");
{
  const result = loadTargets();
  const cq = result.targets.content_quality;
  assert(typeof cq.too_hard_threshold.strong_profile_min_accuracy === "number", "too_hard accuracy threshold");
  assert(typeof cq.too_easy_threshold.all_profile_max_accuracy === "number", "too_easy accuracy threshold");
  assert(!!cq.difficulty_calibration.easy, "Has easy calibration");
  assert(!!cq.difficulty_calibration.medium, "Has medium calibration");
  assert(!!cq.difficulty_calibration.hard, "Has hard calibration");
}

// --- Test: Missing required fields caught ---

console.log("\n7. Missing required fields caught");
{
  const tmpDir = join(process.cwd(), "audit", "learner-simulations", "src", "__tests__", "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const invalidTargets = {
    version: 1,
    lastUpdated: "2026-03-09",
    lastUpdatedReason: "test",
    systems: {
      test_system: {
        // Missing name, description, etc.
        priority: "P0",
        metric: "test",
        target: 1,
        tolerance: 0.1,
        unit: "count",
        direction: "higher_better",
        source_files: ["test.ts"],
        evaluation_profiles: ["all"],
      },
    },
    profile_expectations: {
      "nonexistent-profile": {
        // Missing most required fields
        description: "test",
      },
    },
    content_quality: {
      too_hard_threshold: { strong_profile_min_accuracy: 0.7, min_attempts: 3 },
      too_easy_threshold: { all_profile_max_accuracy: 0.95, min_attempts: 10 },
      difficulty_calibration: {},
    },
  };

  const tmpFile = join(tmpDir, "invalid-targets.json");
  writeFileSync(tmpFile, JSON.stringify(invalidTargets));

  const result = loadTargets(tmpFile);
  assert(result.errors.length > 0, `Catches missing fields (found ${result.errors.length} errors)`);

  // Check specific errors
  const errorFields = result.errors.map((e) => e.field);
  assert(errorFields.some((f) => f.includes("name")), "Catches missing name");
  assert(errorFields.some((f) => f.includes("behavioral_signature")), "Catches missing behavioral_signature");

  rmSync(tmpDir, { recursive: true });
}

// --- Test: Invalid profile references caught ---

console.log("\n8. Invalid profile references caught");
{
  const tmpDir = join(process.cwd(), "audit", "learner-simulations", "src", "__tests__", "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const badRefTargets: TargetFile = {
    version: 1,
    lastUpdated: "2026-03-09",
    lastUpdatedReason: "test",
    systems: {
      test_system: {
        name: "Test",
        description: "Test",
        priority: "P0",
        metric: "test",
        target: 1,
        tolerance: 0.1,
        unit: "count",
        direction: "higher_better",
        science_ref: "Test",
        rationale: "Test",
        source_files: ["packages/api/src/services/srs.ts"],
        evaluation_profiles: ["nonexistent-profile-xyz"],
      },
    },
    profile_expectations: {
      "average-older": {
        description: "test",
        behavioral_signature: "test",
        min_final_mastery: 0.5,
        max_final_mastery: 0.8,
        expected_frontier_grade: 3,
        expected_presentation_center: "standard",
        expected_remediation_events: "moderate",
        mastery_growth_rate: 0.02,
        difficulty_convergence_by: 100,
      },
    },
    content_quality: {
      too_hard_threshold: { strong_profile_min_accuracy: 0.7, min_attempts: 3 },
      too_easy_threshold: { all_profile_max_accuracy: 0.95, min_attempts: 10 },
      difficulty_calibration: {},
    },
  };

  const tmpFile = join(tmpDir, "bad-ref-targets.json");
  writeFileSync(tmpFile, JSON.stringify(badRefTargets));

  const result = loadTargets(tmpFile);
  const profileRefErrors = result.errors.filter((e) =>
    e.message.includes("nonexistent-profile-xyz")
  );
  assert(profileRefErrors.length > 0, "Catches invalid profile reference");

  rmSync(tmpDir, { recursive: true });
}

// --- Test: Staleness warning fires ---

console.log("\n9. Staleness detection");
{
  const tmpDir = join(process.cwd(), "audit", "learner-simulations", "src", "__tests__", "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const staleTargets: TargetFile = {
    version: 1,
    lastUpdated: "2025-01-01T00:00:00Z",
    lastUpdatedReason: "old",
    systems: {},
    profile_expectations: {},
    content_quality: {
      too_hard_threshold: { strong_profile_min_accuracy: 0.7, min_attempts: 3 },
      too_easy_threshold: { all_profile_max_accuracy: 0.95, min_attempts: 10 },
      difficulty_calibration: {},
    },
  };

  const tmpFile = join(tmpDir, "stale-targets.json");
  writeFileSync(tmpFile, JSON.stringify(staleTargets));

  const result = loadTargets(tmpFile);
  const stalenessWarnings = result.warnings.filter((w) => w.includes("days ago"));
  assert(stalenessWarnings.length > 0, "Warns about stale targets");

  rmSync(tmpDir, { recursive: true });
}

// --- Test: Profile mastery ranges are valid ---

console.log("\n10. Profile mastery ranges are valid");
{
  const result = loadTargets();
  for (const [id, exp] of Object.entries(result.targets.profile_expectations)) {
    assert(exp.min_final_mastery >= 0, `${id} min_final_mastery >= 0`);
    assert(exp.max_final_mastery <= 1, `${id} max_final_mastery <= 1`);
    assert(exp.min_final_mastery <= exp.max_final_mastery, `${id} min <= max`);
  }
}

// --- Summary ---

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
