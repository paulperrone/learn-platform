#!/usr/bin/env npx tsx
/**
 * Evaluation Engine — compares simulation runs against targets.json.
 *
 * Pipeline: loadTargets() → loadLatestRuns() → computeSystemMetrics() →
 *           compareAgainstTargets() → generateReport()
 *
 * Usage:
 *   npx tsx simulations/src/evaluate.ts                              # evaluate latest runs
 *   npx tsx simulations/src/evaluate.ts --runs-dir <dir>             # evaluate specific directory
 *   npx tsx simulations/src/evaluate.ts --profiles average-older,strong-older
 *   npx tsx simulations/src/evaluate.ts --json                       # JSON-only output
 *   npx tsx simulations/src/evaluate.ts --run-fire                   # include FIRe comparison (slow)
 */
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { loadTargets } from "./load-targets.js";
import type {
  SimulationEvent,
  SessionSummary,
  StateSnapshot,
  DiagnosticRunResult,
  LearnerProfile,
  TargetFile,
  TargetDefinition,
  ProfileExpectation,
  EvaluationStatus,
  SystemEvaluationResult,
  ProfileEvaluationResult,
  ContentQualityResult,
  HealingReport,
} from "./types.js";

// ── Data loading ──────────────────────────────────────────────────────

function loadEvents(runDir: string): SimulationEvent[] {
  const path = join(runDir, "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadSummaries(runDir: string): SessionSummary[] {
  const path = join(runDir, "session-summaries.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadSnapshots(runDir: string): StateSnapshot[] {
  const path = join(runDir, "state-snapshots.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadDiagnosticResult(runDir: string): DiagnosticRunResult | null {
  const path = join(runDir, "diagnostic-result.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadProfile(profileId: string): LearnerProfile | null {
  const path = join(process.cwd(), "simulations", "profiles", `${profileId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ── Run discovery ─────────────────────────────────────────────────────

type ProfileRun = {
  profileId: string;
  runDir: string;
  events: SimulationEvent[];
  summaries: SessionSummary[];
  snapshots: StateSnapshot[];
  diagnostic: DiagnosticRunResult | null;
  profile: LearnerProfile;
};

function findLatestRuns(
  baseDir: string,
  filterProfiles?: string[]
): { profileId: string; runDir: string }[] {
  if (!existsSync(baseDir)) return [];

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  const latest = new Map<string, string>();
  for (const dir of dirs) {
    const match = dir.match(/^(.+?)-\d{4}-\d{2}-\d{2}T/);
    if (!match) continue;
    const profileId = match[1];
    if (filterProfiles && !filterProfiles.includes(profileId)) continue;
    if (!latest.has(profileId)) {
      const runDir = join(baseDir, dir);
      if (existsSync(join(runDir, "state-snapshots.json"))) {
        latest.set(profileId, runDir);
      }
    }
  }

  return [...latest.entries()].map(([profileId, runDir]) => ({ profileId, runDir }));
}

function loadRuns(runsDir: string, filterProfiles?: string[]): ProfileRun[] {
  const latestRuns = findLatestRuns(runsDir, filterProfiles);
  const runs: ProfileRun[] = [];

  for (const { profileId, runDir } of latestRuns) {
    const profile = loadProfile(profileId);
    if (!profile) {
      console.warn(`Profile file not found for ${profileId}, skipping`);
      continue;
    }
    runs.push({
      profileId,
      runDir,
      events: loadEvents(runDir),
      summaries: loadSummaries(runDir),
      snapshots: loadSnapshots(runDir),
      diagnostic: loadDiagnosticResult(runDir),
      profile,
    });
  }

  return runs;
}

// ── Strand classification (loaded from graph.json — authoritative source) ──

import { getStrand } from "./strands.js";

// ── Helper: resolve profiles for a target ─────────────────────────────

const STRUGGLING_PROFILES = ["struggling-young", "struggling-older", "struggling-middle", "adult-remedial", "slow-steady"];

function resolveProfiles(
  evalProfiles: string[],
  availableRuns: ProfileRun[]
): ProfileRun[] {
  if (evalProfiles.includes("all")) return availableRuns;
  return availableRuns.filter((r) => evalProfiles.includes(r.profileId));
}

// ── Metric computations ───────────────────────────────────────────────

function computeMasteryConvergence(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  // Count non-struggling profiles with ≥50% mastery at final snapshot
  const nonStruggling = runs.filter((r) => !STRUGGLING_PROFILES.includes(r.profileId));
  let passCount = 0;
  const contributing: string[] = [];

  for (const run of nonStruggling) {
    const finalSnapshot = run.snapshots[run.snapshots.length - 1];
    if (finalSnapshot && finalSnapshot.masteryPercent >= 0.50) {
      passCount++;
    } else {
      contributing.push(run.profileId);
    }
  }

  return { actual: passCount, contributing };
}

function computeMasteryPreservation(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  // Max mastery loss from session 0 → session 1 across all profiles
  // Uses materializedMasteryCount (earned mastery in SRS) rather than total
  // masteryCount (which includes implicit diagnostic estimates that naturally
  // decrease as topics move from implicit → materialized with mastered=false)
  let maxLoss = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    if (run.snapshots.length < 2) continue;
    const session0 = run.snapshots.find((s) => s.sessionNumber === 0);
    const session1 = run.snapshots.find((s) => s.sessionNumber === 1);
    if (!session0 || !session1) continue;

    const s0Mastery = (session0.materializedMasteryCount ?? session0.masteryCount) / session0.totalTopics;
    const s1Mastery = (session1.materializedMasteryCount ?? session1.masteryCount) / session1.totalTopics;
    const loss = (s0Mastery - s1Mastery) * 100;
    if (loss > maxLoss) {
      maxLoss = loss;
    }
    if (loss > 10) {
      contributing.push(run.profileId);
    }
  }

  return { actual: maxLoss, contributing };
}

function computeDifficultyTargeting(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  let convergedCount = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    const problems = run.events.filter(
      (e) => e.sessionNumber > 0 && e.correct !== null && e.phase !== "error" && e.phase !== "complete"
    );

    const WINDOW = 10;
    const rollingTrace: number[] = [];
    for (let i = WINDOW - 1; i < problems.length; i++) {
      const window = problems.slice(i - WINDOW + 1, i + 1);
      rollingTrace.push(window.filter((p) => p.correct).length / window.length);
    }

    // Check for 20+ consecutive in [0.80, 0.90]
    let converged = false;
    for (let i = 0; i <= rollingTrace.length - 20; i++) {
      const slice = rollingTrace.slice(i, i + 20);
      if (slice.every((r) => r >= 0.80 && r <= 0.90)) {
        converged = true;
        break;
      }
    }

    if (converged) {
      convergedCount++;
    } else {
      contributing.push(run.profileId);
    }
  }

  return { actual: convergedCount, contributing };
}

function computeReviewNewBalance(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  // Average review ratio across profiles, sessions 2+
  let totalReview = 0;
  let totalTopics = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    const relevantSessions = run.summaries.filter((s) => s.sessionNumber >= 2);
    if (relevantSessions.length === 0) continue;

    let profileReview = 0;
    let profileTotal = 0;
    for (const s of relevantSessions) {
      profileReview += s.reviewsCompleted;
      profileTotal += s.reviewsCompleted + s.newTopicsIntroduced;
    }

    const ratio = profileTotal > 0 ? profileReview / profileTotal : 0;
    if (ratio < 0.50 || ratio > 0.70) {
      contributing.push(run.profileId);
    }
    totalReview += profileReview;
    totalTopics += profileTotal;
  }

  const avgRatio = totalTopics > 0 ? totalReview / totalTopics : 0;
  return { actual: avgRatio, contributing };
}

function computeInterleaving(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  let totalSameAdj = 0;
  let totalPairs = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    // Exclude remediation events: remediation intentionally focuses on a
    // single strand's prerequisite chain. Measuring strand diversity during
    // remediation penalizes correct pedagogical behavior.
    const sessionEvents = run.events.filter(
      (e) => e.sessionNumber > 0 && e.correct !== null
        && e.phase !== "error" && e.phase !== "complete"
        && e.phase !== "remediation"
    );

    // Group events by session — measure adjacency WITHIN sessions only.
    // Inter-session transitions are not controlled by the interleaving algorithm.
    const sessionMap = new Map<number, typeof sessionEvents>();
    for (const e of sessionEvents) {
      const list = sessionMap.get(e.sessionNumber) ?? [];
      list.push(e);
      sessionMap.set(e.sessionNumber, list);
    }

    let runSameAdj = 0;
    let runPairs = 0;

    for (const [, events] of sessionMap) {
      // Topic-transition level adjacency (deduplicate consecutive same-topic)
      const topicSeq: string[] = [];
      for (const e of events) {
        if (e.topicId && e.topicId !== topicSeq[topicSeq.length - 1]) {
          topicSeq.push(e.topicId);
        }
      }

      for (let i = 1; i < topicSeq.length; i++) {
        if (getStrand(topicSeq[i - 1]) === getStrand(topicSeq[i])) runSameAdj++;
      }
      runPairs += topicSeq.length - 1;
    }

    totalSameAdj += runSameAdj;
    totalPairs += runPairs;

    const rate = runPairs > 0 ? runSameAdj / runPairs : 0;
    if (rate > 0.10) {
      contributing.push(run.profileId);
    }
  }

  const avgRate = totalPairs > 0 ? totalSameAdj / totalPairs : 0;
  return { actual: avgRate, contributing };
}

function computeRemediationRouting(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  // Count remediation events for misconception profiles across 15 sessions
  let totalRemediation = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    const remEvents = run.events.filter(
      (e) => e.remediationTarget !== null && e.sessionNumber > 0
    );
    totalRemediation += remEvents.length;
    if (remEvents.length < 5) {
      contributing.push(run.profileId);
    }
  }

  return { actual: totalRemediation, contributing };
}

function computePresentationDrift(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  const LEVEL_ORDER = ["primary", "intermediate", "standard", "advanced"];
  let correctCount = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    const profile = run.profile;

    // Expected direction based on ability vs age
    const highestMasteredGrade = Object.entries(profile.abilityCurve)
      .filter(([, acc]) => acc >= 0.60)
      .map(([g]) => Number(g))
      .sort((a, b) => b - a)[0] ?? 0;

    const ageDefault = profile.age <= 7 ? "primary"
      : profile.age <= 10 ? "intermediate"
      : profile.age <= 14 ? "standard"
      : "advanced";

    const abilityLevel = highestMasteredGrade <= 1 ? "primary"
      : highestMasteredGrade <= 3 ? "intermediate"
      : highestMasteredGrade <= 5 ? "standard"
      : "advanced";

    const ageIdx = LEVEL_ORDER.indexOf(ageDefault);
    const abilityIdx = LEVEL_ORDER.indexOf(abilityLevel);
    const expectedDirection = abilityIdx > ageIdx ? "up"
      : abilityIdx < ageIdx ? "down"
      : "stable";

    const centerTrace = run.snapshots
      .filter((s) => s.presentation)
      .map((s) => s.presentation!.centerLevel);

    if (centerTrace.length < 2) continue;

    const initialIdx = LEVEL_ORDER.indexOf(centerTrace[0]);
    const finalIdx = LEVEL_ORDER.indexOf(centerTrace[centerTrace.length - 1]);

    const correctDirection =
      expectedDirection === "up" ? finalIdx >= initialIdx :
      expectedDirection === "down" ? finalIdx <= initialIdx :
      true;

    // Stability: same center for last 5 sessions
    const lastFive = centerTrace.slice(-5);
    const stable = lastFive.length >= 5 && lastFive.every((c) => c === lastFive[0]);

    if (correctDirection && stable) {
      correctCount++;
    } else {
      contributing.push(run.profileId);
    }
  }

  return { actual: correctCount, contributing };
}

function computeDiagnosticPlacement(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  let accurateCount = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    if (!run.diagnostic) continue;

    const expectedFrontier = getExpectedFrontierGrade(run.profile);
    const actualMidpoint = (run.diagnostic.searchLow + run.diagnostic.searchHigh) / 2;
    const error = Math.abs(expectedFrontier - actualMidpoint);

    if (error <= 1) {
      accurateCount++;
    } else {
      contributing.push(run.profileId);
    }
  }

  return { actual: accurateCount, contributing };
}

function computeCognitiveDemandEntropy(runs: ProfileRun[]): {
  actual: number;
  contributing: string[];
} {
  let totalEntropy = 0;
  let profileCount = 0;
  const contributing: string[] = [];

  for (const run of runs) {
    const sessionEvents = run.events.filter(
      (e) => e.sessionNumber > 0 && e.cognitiveDemand
    );
    if (sessionEvents.length === 0) continue;

    const demands: Record<string, number> = {};
    for (const e of sessionEvents) {
      demands[e.cognitiveDemand!] = (demands[e.cognitiveDemand!] || 0) + 1;
    }

    const total = sessionEvents.length;
    let entropy = 0;
    for (const count of Object.values(demands)) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    totalEntropy += entropy;
    profileCount++;

    if (entropy < 0.90) {
      contributing.push(run.profileId);
    }
  }

  const avgEntropy = profileCount > 0 ? totalEntropy / profileCount : 0;
  return { actual: avgEntropy, contributing };
}

function getExpectedFrontierGrade(profile: LearnerProfile): number {
  const curve = profile.abilityCurve;
  const grades = Object.keys(curve).map(Number).sort((a, b) => a - b);
  for (const g of grades) {
    if (curve[g] < 0.6) return Math.max(0, g - 1);
  }
  return grades[grades.length - 1];
}

// ── System evaluation ─────────────────────────────────────────────────

type MetricComputer = (
  runs: ProfileRun[],
  target: TargetDefinition
) => { actual: number; contributing: string[] };

const METRIC_COMPUTERS: Record<string, MetricComputer> = {
  mastery_convergence: (runs) => computeMasteryConvergence(runs),
  mastery_preservation: (runs) => computeMasteryPreservation(runs),
  difficulty_targeting: (runs) => computeDifficultyTargeting(runs),
  review_new_balance: (runs) => computeReviewNewBalance(runs),
  interleaving: (runs) => computeInterleaving(runs),
  fire_compression: () => ({
    actual: 0,
    contributing: ["requires paired FIRe simulation — use --run-fire flag"],
  }),
  remediation_routing: (runs) => computeRemediationRouting(runs),
  presentation_drift: (runs) => computePresentationDrift(runs),
  diagnostic_placement: (runs) => computeDiagnosticPlacement(runs),
  cognitive_demand_entropy: (runs) => computeCognitiveDemandEntropy(runs),
};

function classifyResult(
  actual: number,
  target: TargetDefinition
): EvaluationStatus {
  const { direction, tolerance } = target;

  if (direction === "higher_better") {
    if (actual >= target.target) return "PASS";
    if (actual >= target.target - tolerance) return "WARN";
    return "FAIL";
  }

  if (direction === "lower_better") {
    if (actual <= target.target) return "PASS";
    if (actual <= target.target + tolerance) return "WARN";
    return "FAIL";
  }

  // in_range
  const min = target.range_min!;
  const max = target.range_max!;
  if (actual >= min && actual <= max) return "PASS";
  if (actual >= min - tolerance && actual <= max + tolerance) return "WARN";
  return "FAIL";
}

// ── Investigation area mapper ─────────────────────────────────────────

const INVESTIGATION_MAP: Record<string, {
  files: string[];
  functions: string[];
  relevantEvents: string[];
}> = {
  mastery_convergence: {
    files: ["packages/api/src/services/srs.ts", "packages/api/src/services/session.ts"],
    functions: ["processReview()", "getSessionMix()", "checkMasteryCriterion()"],
    relevantEvents: ["Check stability threshold, consecutive correct counter, mastery preservation OR clause"],
  },
  mastery_preservation: {
    files: ["packages/api/src/services/srs.ts"],
    functions: ["processReview()", "checkMasteryCriterion() — hysteresis logic"],
    relevantEvents: ["Compare session 0 vs session 1 mastery counts per profile"],
  },
  difficulty_targeting: {
    files: ["packages/api/src/services/session.ts", "packages/api/src/services/srs.ts"],
    functions: ["getSessionMix() — difficulty selection", "adaptive difficulty adjustment"],
    relevantEvents: ["Rolling accuracy trace diverging from [0.80, 0.90] zone"],
  },
  review_new_balance: {
    files: ["packages/api/src/services/session.ts"],
    functions: ["getSessionMix() — slot allocation", "review cap logic"],
    relevantEvents: ["Review queue dominance, minimum new-topic guarantee"],
  },
  interleaving: {
    files: ["packages/api/src/services/session.ts"],
    functions: ["getSessionMix() — topic ordering, strand-aware shuffle"],
    relevantEvents: ["Consecutive same-strand topics in session events"],
  },
  fire_compression: {
    files: ["packages/api/src/services/srs.ts", "packages/api/src/services/diagnostic.ts"],
    functions: ["applyFIReCredit()", "compressReviews()", "materializeMastery()"],
    relevantEvents: ["Review count with vs without FIRe, diagnostic materialization count"],
  },
  remediation_routing: {
    files: ["packages/api/src/services/session.ts"],
    functions: ["remediation trigger conditions", "accumulated failure tracking"],
    relevantEvents: ["Events with remediationTarget set, failure count before trigger"],
  },
  presentation_drift: {
    files: ["packages/api/src/services/content.ts"],
    functions: ["nudgeDistribution()", "DRIFT_RATES", "EMA + hysteresis logic"],
    relevantEvents: ["Presentation center trace across sessions, failure vs accuracy signal"],
  },
  diagnostic_placement: {
    files: ["packages/api/src/services/diagnostic.ts"],
    functions: ["adaptive binary search bounds", "convergence gate", "computeFrontier()"],
    relevantEvents: ["Search bound trace, question count, placement vs expected grade"],
  },
  cognitive_demand_entropy: {
    files: ["packages/api/src/services/session.ts"],
    functions: ["Problem selection — demand-aware selection"],
    relevantEvents: ["Cognitive demand distribution skew toward one type"],
  },
};

// ── System metrics evaluation ─────────────────────────────────────────

function evaluateSystems(
  runs: ProfileRun[],
  targets: TargetFile
): SystemEvaluationResult[] {
  const results: SystemEvaluationResult[] = [];

  for (const [systemId, target] of Object.entries(targets.systems)) {
    const relevantRuns = resolveProfiles(target.evaluation_profiles, runs);
    const computer = METRIC_COMPUTERS[systemId];

    if (!computer) {
      console.warn(`No metric computer for system: ${systemId}`);
      continue;
    }

    const { actual, contributing } = computer(relevantRuns, target);
    const status = classifyResult(actual, target);
    const delta = target.direction === "lower_better"
      ? target.target - actual
      : target.direction === "in_range"
        ? actual < target.range_min! ? actual - target.range_min!
          : actual > target.range_max! ? actual - target.range_max!
          : 0
        : actual - target.target;

    results.push({
      systemId,
      name: target.name,
      priority: target.priority,
      status,
      actual,
      target: target.target,
      tolerance: target.tolerance,
      delta,
      direction: target.direction,
      unit: target.unit,
      contributingProfiles: contributing,
      investigationArea: INVESTIGATION_MAP[systemId],
    });
  }

  return results;
}

// ── Profile evaluation ────────────────────────────────────────────────

function evaluateProfiles(
  runs: ProfileRun[],
  expectations: Record<string, ProfileExpectation>
): ProfileEvaluationResult[] {
  const results: ProfileEvaluationResult[] = [];

  for (const run of runs) {
    const exp = expectations[run.profileId];
    if (!exp) continue;

    const metrics: ProfileEvaluationResult["metrics"] = {};
    const notes: string[] = [];

    // Final mastery
    const finalMastery = run.snapshots[run.snapshots.length - 1]?.masteryPercent ?? 0;
    const masteryInRange = finalMastery >= exp.min_final_mastery && finalMastery <= exp.max_final_mastery;
    metrics["final_mastery"] = {
      actual: finalMastery,
      expected: (exp.min_final_mastery + exp.max_final_mastery) / 2,
      tolerance: (exp.max_final_mastery - exp.min_final_mastery) / 2,
      status: masteryInRange ? "PASS" : finalMastery < exp.min_final_mastery ? "FAIL" : "WARN",
    };

    // Diagnostic placement
    if (run.diagnostic) {
      const actualMid = (run.diagnostic.searchLow + run.diagnostic.searchHigh) / 2;
      const placementError = Math.abs(exp.expected_frontier_grade - actualMid);
      metrics["diagnostic_placement"] = {
        actual: actualMid,
        expected: exp.expected_frontier_grade,
        tolerance: 1,
        status: placementError <= 1 ? "PASS" : "FAIL",
      };
    }

    // Presentation center
    const finalPresentation = run.snapshots[run.snapshots.length - 1]?.presentation?.centerLevel;
    if (finalPresentation) {
      const match = finalPresentation === exp.expected_presentation_center;
      metrics["presentation_center"] = {
        actual: ["primary", "intermediate", "standard", "advanced"].indexOf(finalPresentation),
        expected: ["primary", "intermediate", "standard", "advanced"].indexOf(exp.expected_presentation_center),
        tolerance: 1,
        status: match ? "PASS" : "WARN",
      };
      if (!match) {
        notes.push(`Presentation: expected ${exp.expected_presentation_center}, got ${finalPresentation}`);
      }
    }

    // Remediation expectation
    const remEvents = run.events.filter((e) => e.remediationTarget !== null && e.sessionNumber > 0);
    const remCount = remEvents.length;
    const remRanges: Record<string, [number, number]> = {
      none: [0, 0], low: [1, 3], moderate: [4, 8], high: [9, Infinity],
    };
    const [remMin, remMax] = remRanges[exp.expected_remediation_events] ?? [0, 0];
    const remInRange = remCount >= remMin && remCount <= remMax;
    metrics["remediation_events"] = {
      actual: remCount,
      expected: (remMin + Math.min(remMax, 20)) / 2,
      tolerance: Math.max(3, (Math.min(remMax, 20) - remMin) / 2),
      status: remInRange ? "PASS" : "WARN",
    };

    const behavioralMatch = Object.values(metrics).every((m) => m.status !== "FAIL");
    results.push({ profileId: run.profileId, metrics, behavioralMatch, notes });
  }

  return results;
}

// ── Content quality evaluation ────────────────────────────────────────

function evaluateContentQuality(
  runs: ProfileRun[],
  targets: TargetFile
): ContentQualityResult {
  const cq = targets.content_quality;
  const topicStats: Record<string, { correct: number; total: number; perProfile: Record<string, { correct: number; total: number }> }> = {};

  // Collect per-topic accuracy across profiles
  for (const run of runs) {
    for (const e of run.events) {
      if (!e.topicId || e.correct === null || e.sessionNumber === 0) continue;
      if (!topicStats[e.topicId]) {
        topicStats[e.topicId] = { correct: 0, total: 0, perProfile: {} };
      }
      topicStats[e.topicId].total++;
      if (e.correct) topicStats[e.topicId].correct++;

      if (!topicStats[e.topicId].perProfile[run.profileId]) {
        topicStats[e.topicId].perProfile[run.profileId] = { correct: 0, total: 0 };
      }
      topicStats[e.topicId].perProfile[run.profileId].total++;
      if (e.correct) topicStats[e.topicId].perProfile[run.profileId].correct++;
    }
  }

  const strongProfiles = runs.filter(
    (r) => r.profileId.startsWith("strong-") || r.profileId === "misconception-fractions"
  ).map((r) => r.profileId);

  const tooHard: ContentQualityResult["tooHard"] = [];
  const tooEasy: ContentQualityResult["tooEasy"] = [];
  const miscalibrated: ContentQualityResult["miscalibrated"] = [];

  for (const [topicId, stats] of Object.entries(topicStats)) {
    const allAccuracy = stats.total > 0 ? stats.correct / stats.total : 0;

    // Too hard: strong profiles < threshold
    for (const strongId of strongProfiles) {
      const profileStats = stats.perProfile[strongId];
      if (profileStats && profileStats.total >= cq.too_hard_threshold.min_attempts) {
        const accuracy = profileStats.correct / profileStats.total;
        if (accuracy < cq.too_hard_threshold.strong_profile_min_accuracy) {
          tooHard.push({ topicId, strongAccuracy: accuracy, allAccuracy });
        }
      }
    }

    // Too easy: all profiles > threshold
    if (stats.total >= cq.too_easy_threshold.min_attempts) {
      const allHigh = Object.values(stats.perProfile).every((p) =>
        p.total < 3 || (p.correct / p.total) > cq.too_easy_threshold.all_profile_max_accuracy
      );
      if (allHigh && allAccuracy > cq.too_easy_threshold.all_profile_max_accuracy) {
        tooEasy.push({ topicId, accuracy: allAccuracy });
      }
    }

    // Difficulty miscalibration: check per-difficulty accuracy bands
    for (const run of runs) {
      const topicEvents = run.events.filter(
        (e) => e.topicId === topicId && e.correct !== null && e.difficulty && e.sessionNumber > 0
      );
      const byDifficulty: Record<string, { correct: number; total: number }> = {};
      for (const e of topicEvents) {
        if (!byDifficulty[e.difficulty!]) byDifficulty[e.difficulty!] = { correct: 0, total: 0 };
        byDifficulty[e.difficulty!].total++;
        if (e.correct) byDifficulty[e.difficulty!].correct++;
      }

      for (const [diff, dStats] of Object.entries(byDifficulty)) {
        if (dStats.total < 3) continue;
        const accuracy = dStats.correct / dStats.total;
        const cal = cq.difficulty_calibration[diff];
        if (cal && (accuracy < cal.expected_min || accuracy > cal.expected_max)) {
          // Only add once per topic-difficulty combo
          if (!miscalibrated.some((m) => m.topicId === topicId && m.difficulty === diff)) {
            miscalibrated.push({
              topicId,
              difficulty: diff,
              expectedRange: [cal.expected_min, cal.expected_max],
              actual: accuracy,
            });
          }
        }
      }
    }
  }

  return { tooHard, tooEasy, miscalibrated };
}

// ── FIRe compression (requires running simulations) ───────────────────

async function computeFIReCompression(
  seed: number = 42
): Promise<{ actual: number; contributing: string[] }> {
  const { SimulationRunner } = await import("./runner.js");
  const profilesDir = join(process.cwd(), "simulations", "profiles");
  // Profiles that exercise FIRe credit: moderate ability (topics stay in Review
  // state long enough for virtual reviews), not too strong (topics mastered too
  // quickly → FIRe skips → butterfly effect noise dominates the measurement).
  const testProfileIds = ["average-older", "misconception-fractions", "fast-learner"];
  const sessionCount = 15;

  const results: { profileId: string; compression: number }[] = [];

  for (const profileId of testProfileIds) {
    const profilePath = join(profilesDir, `${profileId}.json`);
    if (!existsSync(profilePath)) continue;
    const profile: LearnerProfile = JSON.parse(readFileSync(profilePath, "utf-8"));

    console.log(`  [fire] ${profileId} with encompassing (${sessionCount} sessions)...`);
    const withRunner = new SimulationRunner({ profile, subject: "math-foundations", sessionCount, seed });
    const withResult = await withRunner.run();
    const withReviews = withResult.sessionSummaries.reduce((s, sm) => s + sm.reviewsCompleted, 0);

    console.log(`  [fire] ${profileId} without encompassing (${sessionCount} sessions)...`);
    // Clear encompassing edges temporarily
    const graphPath = join(process.cwd(), "content", "math-foundations", "graph.json");
    const originalContent = readFileSync(graphPath, "utf-8");
    const graph = JSON.parse(originalContent);
    graph.encompassings = [];
    writeFileSync(graphPath, JSON.stringify(graph, null, 2) + "\n");

    try {
      const withoutRunner = new SimulationRunner({ profile, subject: "math-foundations", sessionCount, seed });
      const withoutResult = await withoutRunner.run();
      const withoutReviews = withoutResult.sessionSummaries.reduce((s, sm) => s + sm.reviewsCompleted, 0);

      const compression = withoutReviews > 0 ? (withoutReviews - withReviews) / withoutReviews : 0;
      results.push({ profileId, compression });
      console.log(`  [fire] ${profileId}: with=${withReviews}, without=${withoutReviews}, compression=${(compression * 100).toFixed(1)}%`);
    } finally {
      writeFileSync(graphPath, originalContent);
    }
  }

  const avgCompression = results.length > 0
    ? results.reduce((s, r) => s + r.compression, 0) / results.length
    : 0;

  const contributing = results.filter((r) => r.compression < 0.20).map((r) => r.profileId);
  return { actual: avgCompression, contributing };
}

// ── Report generation ─────────────────────────────────────────────────

function buildHealingReport(
  systems: SystemEvaluationResult[],
  profiles: ProfileEvaluationResult[],
  contentQuality: ContentQualityResult,
  targetVersion: number
): HealingReport {
  const passCount = systems.filter((s) => s.status === "PASS").length;
  const warnCount = systems.filter((s) => s.status === "WARN").length;
  const failCount = systems.filter((s) => s.status === "FAIL").length;

  const overallStatus: EvaluationStatus =
    failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS";

  return {
    timestamp: new Date().toISOString(),
    targetVersion,
    systems,
    profiles,
    contentQuality,
    summary: { passCount, warnCount, failCount, overallStatus },
  };
}

function generateMarkdownReport(report: HealingReport): string {
  const lines: string[] = [];

  // Executive summary
  lines.push("# Evaluation Report");
  lines.push("");
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Target Version:** ${report.targetVersion}`);
  lines.push(`**Overall Status:** ${statusEmoji(report.summary.overallStatus)} ${report.summary.overallStatus}`);
  lines.push(`**Systems:** ${report.summary.passCount} PASS, ${report.summary.warnCount} WARN, ${report.summary.failCount} FAIL`);
  lines.push("");

  // System-level table
  lines.push("## System Results");
  lines.push("");
  lines.push("| Priority | System | Status | Actual | Target | Delta | Unit |");
  lines.push("|----------|--------|--------|--------|--------|-------|------|");

  const sorted = [...report.systems].sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2 };
    const statusOrder: Record<EvaluationStatus, number> = { FAIL: 0, WARN: 1, PASS: 2 };
    return (priorityOrder[a.priority] - priorityOrder[b.priority]) ||
      (statusOrder[a.status] - statusOrder[b.status]);
  });

  for (const s of sorted) {
    const actualStr = formatMetric(s.actual, s.unit);
    const targetStr = formatMetric(s.target, s.unit);
    const deltaStr = s.delta >= 0 ? `+${formatMetric(s.delta, s.unit)}` : formatMetric(s.delta, s.unit);
    lines.push(
      `| ${s.priority} | ${s.name} | ${statusEmoji(s.status)} ${s.status} | ${actualStr} | ${targetStr} | ${deltaStr} | ${s.unit} |`
    );
  }
  lines.push("");

  // Failures with investigation areas
  const failures = report.systems.filter((s) => s.status === "FAIL" || s.status === "WARN");
  if (failures.length > 0) {
    lines.push("## Investigation Areas");
    lines.push("");
    for (const f of failures) {
      lines.push(`### ${f.name} (${f.status})`);
      lines.push("");
      if (f.contributingProfiles.length > 0) {
        lines.push(`**Contributing profiles:** ${f.contributingProfiles.join(", ")}`);
      }
      if (f.investigationArea) {
        lines.push(`**Files to examine:**`);
        for (const file of f.investigationArea.files) {
          lines.push(`  - \`${file}\``);
        }
        lines.push(`**Functions:** ${f.investigationArea.functions.join(", ")}`);
        lines.push(`**Look for:** ${f.investigationArea.relevantEvents.join("; ")}`);
      }
      lines.push("");
    }
  }

  // Profile behavioral comparison
  lines.push("## Profile Results");
  lines.push("");
  lines.push("| Profile | Final Mastery | Placement | Presentation | Remediation | Match |");
  lines.push("|---------|--------------|-----------|--------------|-------------|-------|");

  for (const p of report.profiles) {
    const fm = p.metrics["final_mastery"];
    const dp = p.metrics["diagnostic_placement"];
    const pc = p.metrics["presentation_center"];
    const re = p.metrics["remediation_events"];
    lines.push(
      `| ${p.profileId} | ${fm ? `${statusEmoji(fm.status)} ${(fm.actual * 100).toFixed(0)}%` : "—"} | ${dp ? `${statusEmoji(dp.status)} ${dp.actual.toFixed(1)}` : "—"} | ${pc ? statusEmoji(pc.status) : "—"} | ${re ? `${statusEmoji(re.status)} ${re.actual}` : "—"} | ${p.behavioralMatch ? "YES" : "NO"} |`
    );
  }
  lines.push("");

  // Content quality
  if (report.contentQuality.tooHard.length > 0 || report.contentQuality.tooEasy.length > 0) {
    lines.push("## Content Quality Flags");
    lines.push("");
    if (report.contentQuality.tooHard.length > 0) {
      lines.push(`**Too Hard (${report.contentQuality.tooHard.length} topics):** ${report.contentQuality.tooHard.map((t) => t.topicId).join(", ")}`);
    }
    if (report.contentQuality.tooEasy.length > 0) {
      lines.push(`**Too Easy (${report.contentQuality.tooEasy.length} topics):** ${report.contentQuality.tooEasy.map((t) => t.topicId).join(", ")}`);
    }
    if (report.contentQuality.miscalibrated.length > 0) {
      lines.push(`**Miscalibrated (${report.contentQuality.miscalibrated.length} topic-difficulty combos):** ${report.contentQuality.miscalibrated.slice(0, 10).map((t) => `${t.topicId}/${t.difficulty}`).join(", ")}`);
    }
    lines.push("");
  }

  // Notes from profile evaluations
  const allNotes = report.profiles.flatMap((p) => p.notes.map((n) => `- **${p.profileId}:** ${n}`));
  if (allNotes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    lines.push(...allNotes);
    lines.push("");
  }

  return lines.join("\n");
}

function statusEmoji(status: EvaluationStatus): string {
  return status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
}

function formatMetric(value: number, unit: string): string {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio") return value.toFixed(3);
  if (unit === "bits") return `${value.toFixed(2)} bits`;
  if (unit === "count") return `${Math.round(value)}`;
  if (unit === "grade_levels") return value.toFixed(1);
  return value.toFixed(2);
}

// ── Console output ────────────────────────────────────────────────────

function printConsoleReport(report: HealingReport): void {
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";

  const statusColor = (s: EvaluationStatus) =>
    s === "PASS" ? GREEN : s === "WARN" ? YELLOW : RED;

  console.log("");
  console.log(`${BOLD}Evaluation Report${RESET} (targets v${report.targetVersion})`);
  console.log("");

  // Overall status
  const { passCount, warnCount, failCount, overallStatus } = report.summary;
  console.log(
    `  ${statusColor(overallStatus)}${overallStatus}${RESET}: ` +
    `${GREEN}${passCount} PASS${RESET}  ${YELLOW}${warnCount} WARN${RESET}  ${RED}${failCount} FAIL${RESET}`
  );
  console.log("");

  // System table
  const header = "  " +
    "Priority".padEnd(10) +
    "System".padEnd(30) +
    "Status".padEnd(8) +
    "Actual".padEnd(12) +
    "Target".padEnd(12) +
    "Delta".padEnd(12);
  console.log(header);
  console.log("  " + "─".repeat(84));

  const sorted = [...report.systems].sort((a, b) => {
    const po = { P0: 0, P1: 1, P2: 2 };
    const so: Record<EvaluationStatus, number> = { FAIL: 0, WARN: 1, PASS: 2 };
    return (po[a.priority] - po[b.priority]) || (so[a.status] - so[b.status]);
  });

  for (const s of sorted) {
    const color = statusColor(s.status);
    const actualStr = formatMetric(s.actual, s.unit);
    const targetStr = formatMetric(s.target, s.unit);
    const deltaStr = s.delta >= 0 ? `+${formatMetric(s.delta, s.unit)}` : formatMetric(s.delta, s.unit);

    console.log(
      "  " +
      s.priority.padEnd(10) +
      s.name.padEnd(30) +
      `${color}${s.status}${RESET}`.padEnd(8 + color.length + RESET.length) +
      actualStr.padEnd(12) +
      targetStr.padEnd(12) +
      deltaStr.padEnd(12)
    );
  }

  console.log("");

  // Show failures
  const failures = report.systems.filter((s) => s.status === "FAIL");
  if (failures.length > 0) {
    console.log(`${RED}${BOLD}Failing systems:${RESET}`);
    for (const f of failures) {
      console.log(`  ${RED}${f.priority}${RESET} ${f.name}: ${f.contributingProfiles.join(", ")}`);
    }
    console.log("");
  }

  // Profile summary
  console.log(`${BOLD}Profiles:${RESET} ${report.profiles.filter((p) => p.behavioralMatch).length}/${report.profiles.length} behavioral match`);
  console.log("");
}

// ── CLI ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const runFire = args.includes("--run-fire");

  const runsDirIdx = args.indexOf("--runs-dir");
  const runsDir = runsDirIdx >= 0
    ? args[runsDirIdx + 1]
    : join(process.cwd(), "simulations", "runs");

  const profilesIdx = args.indexOf("--profiles");
  const filterProfiles = profilesIdx >= 0
    ? args[profilesIdx + 1].split(",")
    : undefined;

  // Load targets
  const { targets, errors } = loadTargets();
  if (errors.length > 0) {
    console.error("Target validation errors:");
    for (const err of errors) {
      console.error(`  ${err.field}: ${err.message}`);
    }
    process.exit(1);
  }

  // Load runs
  if (!jsonOnly) console.log("Loading simulation runs...");
  const runs = loadRuns(runsDir, filterProfiles);
  if (runs.length === 0) {
    console.error("No simulation runs found. Run `just simulate-all` first.");
    process.exit(1);
  }
  if (!jsonOnly) console.log(`Loaded ${runs.length} profile runs`);

  // Evaluate systems
  if (!jsonOnly) console.log("Evaluating systems...");
  const systemResults = evaluateSystems(runs, targets);

  // FIRe compression (optional, requires running simulations)
  if (runFire) {
    if (!jsonOnly) console.log("Running FIRe comparison (this takes a few minutes)...");
    const fireResult = await computeFIReCompression();
    const fireTarget = targets.systems["fire_compression"];
    if (fireTarget) {
      const fireIdx = systemResults.findIndex((s) => s.systemId === "fire_compression");
      if (fireIdx >= 0) {
        const status = classifyResult(fireResult.actual, fireTarget);
        systemResults[fireIdx] = {
          ...systemResults[fireIdx],
          actual: fireResult.actual,
          status,
          delta: fireResult.actual - fireTarget.target,
          contributingProfiles: fireResult.contributing,
        };
      }
    }
  }

  // Evaluate profiles
  const profileResults = evaluateProfiles(runs, targets.profile_expectations);

  // Evaluate content quality
  const contentQuality = evaluateContentQuality(runs, targets);

  // Build report
  const report = buildHealingReport(
    systemResults,
    profileResults,
    contentQuality,
    targets.version
  );

  // Output
  const reportsDir = join(process.cwd(), "simulations", "reports");
  mkdirSync(reportsDir, { recursive: true });

  // JSON output
  writeFileSync(
    join(reportsDir, "evaluation.json"),
    JSON.stringify(report, null, 2) + "\n"
  );

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Markdown output
  const markdown = generateMarkdownReport(report);
  writeFileSync(join(reportsDir, "evaluation.md"), markdown + "\n");

  // Console output
  printConsoleReport(report);

  console.log(`Reports written to:`);
  console.log(`  ${join(reportsDir, "evaluation.json")}`);
  console.log(`  ${join(reportsDir, "evaluation.md")}`);

  // Exit with failure code if any P0 system fails
  const p0Failures = systemResults.filter((s) => s.priority === "P0" && s.status === "FAIL");
  if (p0Failures.length > 0) {
    process.exit(1);
  }
}

// Run CLI only when executed directly
if (process.argv[1]?.endsWith("evaluate.ts") || process.argv[1]?.endsWith("evaluate.js")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

// ── Exports for use by heal-loop.ts ───────────────────────────────────

export {
  loadRuns,
  evaluateSystems,
  evaluateProfiles,
  evaluateContentQuality,
  buildHealingReport,
  generateMarkdownReport,
  printConsoleReport,
  computeFIReCompression,
  classifyResult,
  findLatestRuns,
  type ProfileRun,
};
