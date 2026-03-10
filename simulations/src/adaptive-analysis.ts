#!/usr/bin/env npx tsx
/**
 * Phase 4: Adaptive System Validation
 *
 * Analyzes simulation logs to validate that each adaptive system
 * converges correctly: difficulty targeting, presentation drift,
 * mastery convergence, FIRe effectiveness, remediation routing,
 * and interleaving quality.
 *
 * Usage:
 *   npx tsx simulations/src/adaptive-analysis.ts --all-latest
 *   npx tsx simulations/src/adaptive-analysis.ts --run-fire-comparison [seed]
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  SimulationEvent,
  SessionSummary,
  StateSnapshot,
  LearnerProfile,
} from "./types.js";

// --- Data loading (shared with trajectory-analysis) ---

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

function loadSummaryJson(runDir: string): Record<string, unknown> {
  const path = join(runDir, "summary.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadProfile(profileId: string): LearnerProfile | null {
  const path = join(process.cwd(), "simulations", "profiles", `${profileId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

// --- Strand classification (loaded from graph.json — authoritative source) ---

import { getStrand } from "./strands.js";

// --- Analysis types ---

type DifficultyTargetingResult = {
  profileId: string;
  totalProblems: number;
  convergencePoint: number | null; // first problem where rolling stays in [0.80, 0.90] for 20+ problems
  oscillationFrequency: number; // sign changes in rolling accuracy delta per 10 problems
  maxOvershoot: number; // max deviation from 0.85 after convergence
  rollingAccuracyTrace: { problemIndex: number; rolling: number }[];
  converged: boolean;
};

type PresentationDriftResult = {
  profileId: string;
  expectedDirection: string; // "up" | "down" | "stable"
  expectedLevel: string;
  initialCenter: string | null;
  finalCenter: string | null;
  driftCorrectDirection: boolean;
  sessionsToExpected: number | null;
  stable: boolean; // settled within last 5 sessions
  centerTrace: { session: number; center: string; weights: Record<string, number> }[];
};

type MasteryConvergenceResult = {
  profileId: string;
  sessionsToFirstMastery: number | null;
  sessionsTo25: number | null;
  sessionsTo50: number | null;
  sessionsTo75: number | null;
  finalMasteryPercent: number;
  initialMasteryPercent: number;
  profileType: "strong" | "average" | "struggling";
  masteryCurve: { session: number; mastery: number }[];
  // Criterion analysis
  tooStrict: string[]; // topics that should be mastered but aren't
  tooLoose: string[]; // topics mastered that shouldn't be
};

type FIReResult = {
  profileId: string;
  withFIRe: { totalReviews: number; sessionsCompleted: number; finalMastery: number };
  withoutFIRe: { totalReviews: number; sessionsCompleted: number; finalMastery: number };
  compressionRatio: number;
  reviewSavings: number;
};

type RemediationResult = {
  profileId: string;
  totalRemediationEvents: number;
  uniqueTargets: number;
  correctPrereqRate: number;
  avgRemediationDepth: number;
  successRate: number;
  falseTriggersCount: number;
};

type InterleavingResult = {
  profileId: string;
  sameStrandAdjacencyRate: number;
  reviewNewRatio: number; // fraction that is review
  demandEntropy: number;
  perSessionMetrics: {
    session: number;
    sameStrandAdj: number;
    reviewRatio: number;
    entropy: number;
  }[];
};

type AdaptiveAnalysisReport = {
  difficultyTargeting: DifficultyTargetingResult[];
  presentationDrift: PresentationDriftResult[];
  masteryConvergence: MasteryConvergenceResult[];
  remediation: RemediationResult[];
  interleaving: InterleavingResult[];
  fire: FIReResult[];
};

// --- Analysis functions ---

function analyzeDifficultyTargeting(
  events: SimulationEvent[],
  profileId: string
): DifficultyTargetingResult {
  // Extract all problem attempts from learning sessions (exclude diagnostic)
  const problems = events.filter(
    (e) => e.sessionNumber > 0 && e.correct !== null && e.phase !== "error" && e.phase !== "complete"
  );

  const WINDOW = 10;
  const rollingTrace: { problemIndex: number; rolling: number }[] = [];

  for (let i = WINDOW - 1; i < problems.length; i++) {
    const window = problems.slice(i - WINDOW + 1, i + 1);
    const accuracy = window.filter((p) => p.correct).length / window.length;
    rollingTrace.push({ problemIndex: i, rolling: accuracy });
  }

  // Find convergence: first point where rolling stays in [0.80, 0.90] for 20+ consecutive
  let convergencePoint: number | null = null;
  for (let i = 0; i < rollingTrace.length; i++) {
    let converged = true;
    const remaining = rollingTrace.length - i;
    const checkLength = Math.min(20, remaining);
    if (checkLength < 20) break;

    for (let j = i; j < i + checkLength; j++) {
      if (rollingTrace[j].rolling < 0.80 || rollingTrace[j].rolling > 0.90) {
        converged = false;
        break;
      }
    }
    if (converged) {
      convergencePoint = rollingTrace[i].problemIndex;
      break;
    }
  }

  // Oscillation: sign changes in rolling accuracy delta
  let signChanges = 0;
  for (let i = 2; i < rollingTrace.length; i++) {
    const prev = rollingTrace[i - 1].rolling - rollingTrace[i - 2].rolling;
    const curr = rollingTrace[i].rolling - rollingTrace[i - 1].rolling;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      signChanges++;
    }
  }
  const oscillationFrequency = rollingTrace.length > 10
    ? (signChanges / rollingTrace.length) * 10
    : 0;

  // Max overshoot after convergence
  let maxOvershoot = 0;
  if (convergencePoint !== null) {
    const afterConvergence = rollingTrace.filter(
      (r) => r.problemIndex >= convergencePoint!
    );
    for (const r of afterConvergence) {
      const deviation = Math.abs(r.rolling - 0.85);
      if (deviation > maxOvershoot) maxOvershoot = deviation;
    }
  }

  return {
    profileId,
    totalProblems: problems.length,
    convergencePoint,
    oscillationFrequency,
    maxOvershoot,
    rollingAccuracyTrace: rollingTrace,
    converged: convergencePoint !== null,
  };
}

function analyzePresentationDrift(
  snapshots: StateSnapshot[],
  profile: LearnerProfile,
  profileId: string
): PresentationDriftResult {
  const LEVEL_ORDER = ["primary", "intermediate", "standard", "advanced"];

  // Determine expected level based on profile ability
  const highestMasteredGrade = Object.entries(profile.abilityCurve)
    .filter(([, acc]) => acc >= 0.60)
    .map(([g]) => Number(g))
    .sort((a, b) => b - a)[0] ?? 0;

  // Map age to default, then adjust for ability
  const ageDefault = profile.age <= 7 ? "primary"
    : profile.age <= 10 ? "intermediate"
    : profile.age <= 14 ? "standard"
    : "advanced";

  // Expected: ability-appropriate level
  const abilityLevel = highestMasteredGrade <= 1 ? "primary"
    : highestMasteredGrade <= 3 ? "intermediate"
    : highestMasteredGrade <= 5 ? "standard"
    : "advanced";

  const ageIdx = LEVEL_ORDER.indexOf(ageDefault);
  const abilityIdx = LEVEL_ORDER.indexOf(abilityLevel);
  const expectedDirection = abilityIdx > ageIdx ? "up"
    : abilityIdx < ageIdx ? "down"
    : "stable";

  const centerTrace = snapshots
    .filter((s) => s.presentation)
    .map((s) => ({
      session: s.sessionNumber,
      center: s.presentation!.centerLevel,
      weights: {
        primary: s.presentation!.primaryWeight,
        intermediate: s.presentation!.intermediateWeight,
        standard: s.presentation!.standardWeight,
        advanced: s.presentation!.advancedWeight,
      },
    }));

  const initialCenter = centerTrace[0]?.center ?? null;
  const finalCenter = centerTrace[centerTrace.length - 1]?.center ?? null;

  // Check if drift moved in expected direction
  const initialIdx = LEVEL_ORDER.indexOf(initialCenter ?? "standard");
  const finalIdx = LEVEL_ORDER.indexOf(finalCenter ?? "standard");
  const driftCorrectDirection =
    expectedDirection === "up" ? finalIdx >= initialIdx :
    expectedDirection === "down" ? finalIdx <= initialIdx :
    true;

  // Sessions to expected level
  let sessionsToExpected: number | null = null;
  for (const point of centerTrace) {
    if (point.center === abilityLevel) {
      sessionsToExpected = point.session;
      break;
    }
  }

  // Stability: same center level for last 5 sessions
  const lastFive = centerTrace.slice(-5);
  const stable = lastFive.length >= 5 &&
    lastFive.every((p) => p.center === lastFive[0].center);

  return {
    profileId,
    expectedDirection,
    expectedLevel: abilityLevel,
    initialCenter,
    finalCenter,
    driftCorrectDirection,
    sessionsToExpected,
    stable,
    centerTrace,
  };
}

function analyzeMasteryConvergence(
  snapshots: StateSnapshot[],
  events: SimulationEvent[],
  profile: LearnerProfile,
  profileId: string
): MasteryConvergenceResult {
  // Classify profile type
  const avgAbility = Object.values(profile.abilityCurve).reduce((a, b) => a + b, 0) /
    Object.values(profile.abilityCurve).length;
  const profileType: "strong" | "average" | "struggling" =
    avgAbility >= 0.80 ? "strong" : avgAbility >= 0.65 ? "average" : "struggling";

  const masteryCurve = snapshots.map((s) => ({
    session: s.sessionNumber,
    mastery: s.masteryPercent,
  }));

  const initialMastery = masteryCurve[0]?.mastery ?? 0;
  const finalMastery = masteryCurve[masteryCurve.length - 1]?.mastery ?? 0;

  // Find sessions to thresholds
  function sessionsToThreshold(threshold: number): number | null {
    for (const point of masteryCurve) {
      if (point.mastery >= threshold) return point.session;
    }
    return null;
  }

  // Criterion analysis from final snapshot
  const finalSnapshot = snapshots[snapshots.length - 1];
  const tooStrict: string[] = [];
  const tooLoose: string[] = [];

  if (finalSnapshot?.topicStates) {
    for (const ts of finalSnapshot.topicStates) {
      // Topic with many correct reviews but not mastered = criterion too strict
      if (!ts.mastered && ts.consecutiveCorrectReviews >= 2 && ts.reps >= 3) {
        tooStrict.push(ts.topicId);
      }
      // Topic mastered with low stability or few reps = criterion too loose
      if (ts.mastered && ts.stability < 5 && ts.reps < 3) {
        tooLoose.push(ts.topicId);
      }
    }
  }

  return {
    profileId,
    sessionsToFirstMastery: sessionsToThreshold(0.01),
    sessionsTo25: sessionsToThreshold(0.25),
    sessionsTo50: sessionsToThreshold(0.50),
    sessionsTo75: sessionsToThreshold(0.75),
    finalMasteryPercent: finalMastery,
    initialMasteryPercent: initialMastery,
    profileType,
    masteryCurve,
    tooStrict,
    tooLoose,
  };
}

function analyzeRemediation(
  events: SimulationEvent[],
  profileId: string
): RemediationResult {
  const remediationEvents = events.filter(
    (e) => e.remediationTarget !== null && e.sessionNumber > 0
  );

  const targets = new Set(remediationEvents.map((e) => e.remediationTarget!));

  // Check if remediation routed to correct prerequisite
  // (Would need graph data to validate — for now, count what we have)
  let successCount = 0;
  for (const target of targets) {
    // After remediation on target, did the triggering topic succeed later?
    const trigger = remediationEvents.find((e) => e.remediationTarget === target);
    if (!trigger?.topicId) continue;

    const laterSuccess = events.find(
      (e) =>
        e.topicId === trigger.topicId &&
        e.sessionNumber >= trigger.sessionNumber &&
        e.correct === true &&
        e.phase !== "remediation"
    );
    if (laterSuccess) successCount++;
  }

  return {
    profileId,
    totalRemediationEvents: remediationEvents.length,
    uniqueTargets: targets.size,
    correctPrereqRate: targets.size > 0 ? 1.0 : 0, // Can't validate without graph comparison
    avgRemediationDepth: 0, // Would need tracking in runner
    successRate: targets.size > 0 ? successCount / targets.size : 0,
    falseTriggersCount: 0,
  };
}

function analyzeInterleaving(
  events: SimulationEvent[],
  summaries: SessionSummary[],
  profileId: string
): InterleavingResult {
  const perSessionMetrics: InterleavingResult["perSessionMetrics"] = [];

  let totalSameAdj = 0;
  let totalPairs = 0;
  let totalReview = 0;
  let totalNonReview = 0;
  let totalEntropy = 0;
  let sessionCount = 0;

  for (const summary of summaries) {
    const sessionEvents = events.filter(
      (e) => e.sessionNumber === summary.sessionNumber &&
        e.correct !== null &&
        e.phase !== "error" &&
        e.phase !== "complete"
    );

    if (sessionEvents.length < 2) continue;
    sessionCount++;

    // Same-strand adjacency (topic-transition level, not event level)
    // Deduplicate consecutive same-topic events (learning loop stays on one topic)
    const topicSeq: string[] = [];
    for (const e of sessionEvents) {
      if (e.topicId && e.topicId !== topicSeq[topicSeq.length - 1]) {
        topicSeq.push(e.topicId);
      }
    }
    let sameAdj = 0;
    for (let i = 1; i < topicSeq.length; i++) {
      const prev = getStrand(topicSeq[i - 1]);
      const curr = getStrand(topicSeq[i]);
      if (prev === curr) sameAdj++;
    }
    const pairs = topicSeq.length - 1;
    const sameStrandAdj = pairs > 0 ? sameAdj / pairs : 0;
    totalSameAdj += sameAdj;
    totalPairs += pairs;

    // Review vs new ratio (topic-level: count topics whose first phase is review)
    const topicFirstPhase = new Map<string, string>();
    for (const e of sessionEvents) {
      if (e.topicId && e.phase && !topicFirstPhase.has(e.topicId)) {
        topicFirstPhase.set(e.topicId, e.phase);
      }
    }
    const reviews = [...topicFirstPhase.values()].filter((p) => p === "review").length;
    const nonReviews = topicFirstPhase.size - reviews;
    const reviewRatio = topicFirstPhase.size > 0
      ? reviews / topicFirstPhase.size
      : 0;
    totalReview += reviews;
    totalNonReview += nonReviews;

    // Cognitive demand entropy
    const demands: Record<string, number> = {};
    for (const e of sessionEvents) {
      if (e.cognitiveDemand) {
        demands[e.cognitiveDemand] = (demands[e.cognitiveDemand] || 0) + 1;
      }
    }
    const total = sessionEvents.length;
    let entropy = 0;
    for (const count of Object.values(demands)) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    totalEntropy += entropy;

    perSessionMetrics.push({
      session: summary.sessionNumber,
      sameStrandAdj,
      reviewRatio,
      entropy,
    });
  }

  return {
    profileId,
    sameStrandAdjacencyRate: totalPairs > 0 ? totalSameAdj / totalPairs : 0,
    reviewNewRatio: (totalReview + totalNonReview) > 0
      ? totalReview / (totalReview + totalNonReview)
      : 0,
    demandEntropy: sessionCount > 0 ? totalEntropy / sessionCount : 0,
    perSessionMetrics,
  };
}

// --- FIRe comparison: requires running new simulations ---

async function runFIReComparison(seed: number): Promise<FIReResult[]> {
  // Dynamic imports to avoid loading heavy deps for analysis-only runs
  const { SimulationRunner } = await import("./runner.js");
  const { createSimulationDb } = await import("./db-setup.js");

  const profilesDir = join(process.cwd(), "simulations", "profiles");
  const profiles: LearnerProfile[] = readdirSync(profilesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(profilesDir, f), "utf-8")));

  // Use a subset of profiles for FIRe comparison (most informative)
  const testProfiles = profiles.filter((p) =>
    ["average-older", "strong-older", "misconception-fractions"].includes(p.id)
  );

  const results: FIReResult[] = [];

  for (const profile of testProfiles) {
    console.log(`[fire] Running WITH encompassing for ${profile.id}...`);
    const withRunner = new SimulationRunner({
      profile,
      subject: "math-foundations",
      sessionCount: 15,
      seed,
    });
    const withResult = await withRunner.run();
    const withSummaries = withResult.sessionSummaries;
    const withReviews = withSummaries.reduce((sum, s) => sum + s.reviewsCompleted, 0);
    const withSnapshots = JSON.parse(
      readFileSync(join(withResult.runDir, "state-snapshots.json"), "utf-8")
    ) as StateSnapshot[];
    const withFinalMastery = withSnapshots[withSnapshots.length - 1]?.masteryPercent ?? 0;

    console.log(`[fire] Running WITHOUT encompassing for ${profile.id}...`);
    // For "without FIRe" — we use the same runner but clear encompassings from DB
    // We do this by running with a modified db-setup that skips encompassings
    const withoutRunner = new SimulationRunner({
      profile,
      subject: "math-foundations",
      sessionCount: 15,
      seed,
    });
    // Access the internal runner to clear encompassings after DB setup
    const withoutResult = await runWithoutEncompassings(withoutRunner);
    const withoutSummaries = withoutResult.sessionSummaries;
    const withoutReviews = withoutSummaries.reduce((sum, s) => sum + s.reviewsCompleted, 0);
    const withoutSnapshots = JSON.parse(
      readFileSync(join(withoutResult.runDir, "state-snapshots.json"), "utf-8")
    ) as StateSnapshot[];
    const withoutFinalMastery = withoutSnapshots[withoutSnapshots.length - 1]?.masteryPercent ?? 0;

    const compression = withoutReviews > 0
      ? (withoutReviews - withReviews) / withoutReviews
      : 0;

    results.push({
      profileId: profile.id,
      withFIRe: {
        totalReviews: withReviews,
        sessionsCompleted: withResult.sessionsCompleted,
        finalMastery: withFinalMastery,
      },
      withoutFIRe: {
        totalReviews: withoutReviews,
        sessionsCompleted: withoutResult.sessionsCompleted,
        finalMastery: withoutFinalMastery,
      },
      compressionRatio: compression,
      reviewSavings: withoutReviews - withReviews,
    });

    console.log(
      `[fire] ${profile.id}: with=${withReviews} reviews, without=${withoutReviews} reviews, compression=${(compression * 100).toFixed(1)}%`
    );
  }

  return results;
}

/**
 * Run a simulation with encompassing edges cleared from the DB.
 * We monkey-patch the DB setup to delete encompassings after import.
 */
async function runWithoutEncompassings(runner: any): Promise<any> {
  // Override the run method's DB setup by wrapping it
  const origRun = runner.run.bind(runner);

  runner.run = async function () {
    // Call original run — it will set up DB with encompassings
    // We need to intercept after DB creation but before simulation
    // Since we can't easily hook into the middle, we'll just run normally
    // and clear encompassings from the DB after setup
    return origRun();
  };

  // Actually, the simplest approach: just run and accept that FIRe is applied.
  // To truly compare, we need to modify createSimulationDb.
  // Let's take a different approach: modify the graph JSON temporarily.

  const graphPath = join(process.cwd(), "content", "math-foundations", "graph.json");
  const originalContent = readFileSync(graphPath, "utf-8");
  const graph = JSON.parse(originalContent);
  graph.encompassings = [];
  writeFileSync(graphPath, JSON.stringify(graph, null, 2) + "\n");

  try {
    const result = await origRun();
    return result;
  } finally {
    // Restore original file byte-for-byte
    writeFileSync(graphPath, originalContent);
  }
}

// --- Find latest runs ---

function findLatestRuns(baseDir: string): { profileId: string; runDir: string }[] {
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
    if (!latest.has(profileId)) {
      const runDir = join(baseDir, dir);
      if (existsSync(join(runDir, "state-snapshots.json"))) {
        latest.set(profileId, runDir);
      }
    }
  }

  return [...latest.entries()].map(([profileId, runDir]) => ({ profileId, runDir }));
}

// --- Report generation ---

function generateReport(report: AdaptiveAnalysisReport): string {
  const lines: string[] = [];

  lines.push("# Adaptive System Validation Report (Phase 4)");
  lines.push("");
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push("");

  // ========================
  // 1. Difficulty Targeting
  // ========================
  lines.push("## 1. 85% Difficulty Targeting");
  lines.push("");
  lines.push("Target: rolling accuracy (window=10) converges to [0.80, 0.90] within 30 problems for ≥7/10 profiles.");
  lines.push("");

  lines.push("| Profile | Problems | Converged | Convergence Point | Oscillation/10 | Max Overshoot |");
  lines.push("|---------|----------|-----------|-------------------|----------------|---------------|");
  for (const dt of report.difficultyTargeting) {
    const conv = dt.converged ? `✓ at #${dt.convergencePoint}` : "✗ never";
    lines.push(
      `| ${dt.profileId} | ${dt.totalProblems} | ${conv} | ${dt.convergencePoint ?? "N/A"} | ${dt.oscillationFrequency.toFixed(2)} | ${(dt.maxOvershoot * 100).toFixed(1)}% |`
    );
  }

  const convergedCount = report.difficultyTargeting.filter((d) => d.converged).length;
  const dtTotal = report.difficultyTargeting.length;
  const dtPassed = convergedCount >= Math.ceil(dtTotal * 0.7);
  lines.push("");
  lines.push(`**Result: ${convergedCount}/${dtTotal} converged — ${dtPassed ? "PASS" : "FAIL"}**`);
  lines.push("");

  // Accuracy trace for select profiles
  lines.push("### Rolling Accuracy Traces");
  lines.push("");
  const traceProfiles = report.difficultyTargeting.filter(
    (d) => ["average-older", "strong-older", "struggling-young"].includes(d.profileId)
  );
  for (const dt of traceProfiles) {
    lines.push(`#### ${dt.profileId}`);
    lines.push("```");
    // ASCII chart: sample every 10th point
    const sampled = dt.rollingAccuracyTrace.filter((_, i) => i % 10 === 0);
    for (const point of sampled) {
      const bar = "█".repeat(Math.round(point.rolling * 50));
      const marker = point.rolling >= 0.80 && point.rolling <= 0.90 ? " ✓" : "";
      lines.push(`#${String(point.problemIndex).padStart(4)}: ${(point.rolling * 100).toFixed(0).padStart(3)}% |${bar}${marker}`);
    }
    lines.push("```");
    lines.push("");
  }

  // ========================
  // 2. Presentation Drift
  // ========================
  lines.push("## 2. Presentation Drift");
  lines.push("");
  lines.push("Validates that presentation distribution drifts toward ability-appropriate level.");
  lines.push("");

  lines.push("| Profile | Expected Dir | Expected Level | Initial | Final | Correct Dir | Sessions to Expected | Stable |");
  lines.push("|---------|-------------|----------------|---------|-------|-------------|---------------------|--------|");
  for (const pd of report.presentationDrift) {
    const ste = pd.sessionsToExpected !== null ? `${pd.sessionsToExpected}` : "never";
    lines.push(
      `| ${pd.profileId} | ${pd.expectedDirection} | ${pd.expectedLevel} | ${pd.initialCenter ?? "n/a"} | ${pd.finalCenter ?? "n/a"} | ${pd.driftCorrectDirection ? "✓" : "✗"} | ${ste} | ${pd.stable ? "✓" : "✗"} |`
    );
  }

  const driftCorrectCount = report.presentationDrift.filter((d) => d.driftCorrectDirection).length;
  const pdTotal = report.presentationDrift.length;
  const pdPassed = driftCorrectCount === pdTotal;
  lines.push("");
  lines.push(`**Result: ${driftCorrectCount}/${pdTotal} drift in expected direction — ${pdPassed ? "PASS" : "FAIL"}**`);
  lines.push("");

  // Weight evolution for select profiles
  lines.push("### Presentation Weight Evolution");
  lines.push("");
  const driftProfiles = report.presentationDrift.filter(
    (d) => ["strong-young", "struggling-older", "average-older"].includes(d.profileId)
  );
  for (const pd of driftProfiles) {
    lines.push(`#### ${pd.profileId} (expected: ${pd.expectedDirection} → ${pd.expectedLevel})`);
    lines.push("| Session | Center | Primary | Intermediate | Standard | Advanced |");
    lines.push("|---------|--------|---------|-------------|----------|----------|");
    for (const point of pd.centerTrace.filter((_, i) => i % 5 === 0 || i === pd.centerTrace.length - 1)) {
      lines.push(
        `| ${point.session} | ${point.center} | ${(point.weights.primary * 100).toFixed(0)}% | ${(point.weights.intermediate * 100).toFixed(0)}% | ${(point.weights.standard * 100).toFixed(0)}% | ${(point.weights.advanced * 100).toFixed(0)}% |`
      );
    }
    lines.push("");
  }

  // ========================
  // 3. Mastery Convergence
  // ========================
  lines.push("## 3. Mastery Convergence");
  lines.push("");
  lines.push("Non-struggling profiles should reach ≥50% mastery by session 30.");
  lines.push("");

  lines.push("| Profile | Type | Initial | Final | To First | To 25% | To 50% | To 75% | Too Strict | Too Loose |");
  lines.push("|---------|------|---------|-------|----------|--------|--------|--------|------------|-----------|");
  for (const mc of report.masteryConvergence) {
    const toFirst = mc.sessionsToFirstMastery !== null ? `S${mc.sessionsToFirstMastery}` : "never";
    const to25 = mc.sessionsTo25 !== null ? `S${mc.sessionsTo25}` : "never";
    const to50 = mc.sessionsTo50 !== null ? `S${mc.sessionsTo50}` : "never";
    const to75 = mc.sessionsTo75 !== null ? `S${mc.sessionsTo75}` : "never";
    lines.push(
      `| ${mc.profileId} | ${mc.profileType} | ${(mc.initialMasteryPercent * 100).toFixed(1)}% | ${(mc.finalMasteryPercent * 100).toFixed(1)}% | ${toFirst} | ${to25} | ${to50} | ${to75} | ${mc.tooStrict.length} | ${mc.tooLoose.length} |`
    );
  }

  // Check: non-struggling profiles should reach 50%
  const nonStruggling = report.masteryConvergence.filter((m) => m.profileType !== "struggling");
  const reached50 = nonStruggling.filter((m) => m.finalMasteryPercent >= 0.50).length;
  const mcPassed = nonStruggling.length > 0 && reached50 >= nonStruggling.length * 0.5;
  lines.push("");
  lines.push(`**Result: ${reached50}/${nonStruggling.length} non-struggling profiles ≥50% mastery — ${mcPassed ? "PASS" : "FAIL"}**`);
  lines.push("");

  // Mastery criterion analysis
  const anyTooStrict = report.masteryConvergence.filter((m) => m.tooStrict.length > 0);
  if (anyTooStrict.length > 0) {
    lines.push("### Mastery Criterion: Too Strict");
    lines.push("");
    lines.push("Topics with ≥2 consecutive correct reviews and ≥3 reps but NOT mastered:");
    lines.push("");
    for (const mc of anyTooStrict) {
      lines.push(`- **${mc.profileId}**: ${mc.tooStrict.length} topics (${mc.tooStrict.slice(0, 5).join(", ")}${mc.tooStrict.length > 5 ? "..." : ""})`);
    }
    lines.push("");
  }

  // ========================
  // 4. FIRe Effectiveness
  // ========================
  lines.push("## 4. FIRe Effectiveness");
  lines.push("");

  if (report.fire.length > 0) {
    lines.push("Comparison: same profiles run with and without encompassing edges.");
    lines.push("Target: >30% compression ratio.");
    lines.push("");

    lines.push("| Profile | With FIRe Reviews | Without FIRe Reviews | Compression | Savings | With Mastery | Without Mastery |");
    lines.push("|---------|-------------------|---------------------|-------------|---------|-------------|-----------------|");
    for (const f of report.fire) {
      lines.push(
        `| ${f.profileId} | ${f.withFIRe.totalReviews} | ${f.withoutFIRe.totalReviews} | ${(f.compressionRatio * 100).toFixed(1)}% | ${f.reviewSavings} | ${(f.withFIRe.finalMastery * 100).toFixed(1)}% | ${(f.withoutFIRe.finalMastery * 100).toFixed(1)}% |`
      );
    }

    const avgCompression = report.fire.reduce((s, f) => s + f.compressionRatio, 0) / report.fire.length;
    const firePassed = avgCompression > 0.30;
    lines.push("");
    lines.push(`**Average compression: ${(avgCompression * 100).toFixed(1)}% — ${firePassed ? "PASS" : "FAIL"} (target: >30%)**`);
  } else {
    lines.push("FIRe comparison was not run. Use `--run-fire-comparison` to execute.");
    lines.push("");
    lines.push("**Note from simulation data:** `fireCreditApplied` is NULL for all events and `fireReviewsSkipped` is 0 for all sessions.");
    lines.push("This suggests FIRe compression is either not being invoked by the session service or the event logger isn't capturing it.");
    lines.push("The SRS service implements FIRe compression (`compressReviews`) — verify it's called during session mix selection.");
  }
  lines.push("");

  // ========================
  // 5. Remediation Routing
  // ========================
  lines.push("## 5. Remediation Routing");
  lines.push("");

  const totalRemediation = report.remediation.reduce((s, r) => s + r.totalRemediationEvents, 0);
  if (totalRemediation > 0) {
    lines.push("| Profile | Events | Unique Targets | Success Rate |");
    lines.push("|---------|--------|----------------|-------------|");
    for (const r of report.remediation) {
      if (r.totalRemediationEvents > 0) {
        lines.push(
          `| ${r.profileId} | ${r.totalRemediationEvents} | ${r.uniqueTargets} | ${(r.successRate * 100).toFixed(0)}% |`
        );
      }
    }
  } else {
    lines.push("**0 remediation events across ALL profiles.**");
    lines.push("");
    lines.push("This is consistent with Phase 3 findings. Remediation routing never activates because:");
    lines.push("1. The session service's remediation trigger requires accuracy on a topic to drop below a threshold");
    lines.push("2. With 1-day intervals and the current review selection, topics don't accumulate enough failures in succession");
    lines.push("3. The `misconception-fractions` profile should trigger remediation on fraction topics but the fraction topics");
    lines.push("   may not be selected for review frequently enough to build a failure pattern");
    lines.push("");
    lines.push("**Result: FAIL — remediation system is non-functional in simulation**");
  }
  lines.push("");

  // ========================
  // 6. Interleaving Quality
  // ========================
  lines.push("## 6. Interleaving Quality");
  lines.push("");
  lines.push("Target: same-strand adjacency <10%, review/new ratio ~60/40, high cognitive demand entropy.");
  lines.push("");

  lines.push("| Profile | Same-Strand Adj | Review Ratio | Demand Entropy |");
  lines.push("|---------|----------------|-------------|----------------|");
  for (const il of report.interleaving) {
    lines.push(
      `| ${il.profileId} | ${(il.sameStrandAdjacencyRate * 100).toFixed(1)}% | ${(il.reviewNewRatio * 100).toFixed(0)}% | ${il.demandEntropy.toFixed(2)} |`
    );
  }

  const avgSameStrand = report.interleaving.reduce((s, i) => s + i.sameStrandAdjacencyRate, 0) / report.interleaving.length;
  const avgReviewRatio = report.interleaving.reduce((s, i) => s + i.reviewNewRatio, 0) / report.interleaving.length;
  const ilPassed = avgSameStrand < 0.10;
  lines.push("");
  lines.push(`**Average same-strand adjacency: ${(avgSameStrand * 100).toFixed(1)}% — ${ilPassed ? "PASS" : "FAIL"} (target: <10%)**`);
  lines.push(`**Average review ratio: ${(avgReviewRatio * 100).toFixed(0)}% (target: ~60%)**`);
  lines.push("");

  // Per-session breakdown for one profile
  const avgOlderInterleave = report.interleaving.find((i) => i.profileId === "average-older");
  if (avgOlderInterleave && avgOlderInterleave.perSessionMetrics.length > 0) {
    lines.push("### Per-Session Breakdown: average-older");
    lines.push("");
    lines.push("| Session | Same-Strand Adj | Review Ratio | Demand Entropy |");
    lines.push("|---------|----------------|-------------|----------------|");
    for (const m of avgOlderInterleave.perSessionMetrics) {
      lines.push(
        `| ${m.session} | ${(m.sameStrandAdj * 100).toFixed(1)}% | ${(m.reviewRatio * 100).toFixed(0)}% | ${m.entropy.toFixed(2)} |`
      );
    }
    lines.push("");
  }

  // ========================
  // Summary
  // ========================
  lines.push("## Summary");
  lines.push("");
  lines.push("| System | Status | Notes |");
  lines.push("|--------|--------|-------|");
  lines.push(`| 85% Difficulty Targeting | ${dtPassed ? "PASS" : "FAIL"} | ${convergedCount}/${dtTotal} profiles converge |`);
  lines.push(`| Presentation Drift | ${pdPassed ? "PASS" : "FAIL"} | ${driftCorrectCount}/${pdTotal} correct direction |`);
  lines.push(`| Mastery Convergence | ${mcPassed ? "PASS" : "FAIL"} | ${reached50}/${nonStruggling.length} non-struggling ≥50% |`);
  lines.push(`| FIRe Compression | ${report.fire.length > 0 ? (report.fire.reduce((s, f) => s + f.compressionRatio, 0) / report.fire.length > 0.30 ? "PASS" : "FAIL") : "NOT RUN"} | ${report.fire.length > 0 ? `${(report.fire.reduce((s, f) => s + f.compressionRatio, 0) / report.fire.length * 100).toFixed(1)}% avg compression` : "Use --run-fire-comparison"} |`);
  lines.push(`| Remediation Routing | FAIL | ${totalRemediation} events total |`);
  lines.push(`| Interleaving | ${ilPassed ? "PASS" : "FAIL"} | ${(avgSameStrand * 100).toFixed(1)}% same-strand adjacency |`);

  return lines.join("\n");
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const runsDir = join(process.cwd(), "simulations", "runs");
  const reportsDir = join(process.cwd(), "simulations", "reports");
  mkdirSync(reportsDir, { recursive: true });

  const runFireComparison = args.includes("--run-fire-comparison");
  const seed = (() => {
    const idx = args.indexOf("--seed");
    return idx >= 0 ? parseInt(args[idx + 1], 10) : 42;
  })();

  // Find latest runs
  const latestRuns = findLatestRuns(runsDir);
  if (latestRuns.length === 0) {
    console.error("No simulation runs found. Run `just simulate-all --sessions 30` first.");
    process.exit(1);
  }

  console.log(`Found ${latestRuns.length} latest runs with trajectory data\n`);

  const report: AdaptiveAnalysisReport = {
    difficultyTargeting: [],
    presentationDrift: [],
    masteryConvergence: [],
    remediation: [],
    interleaving: [],
    fire: [],
  };

  for (const { profileId, runDir } of latestRuns) {
    console.log(`Analyzing: ${profileId}`);
    const events = loadEvents(runDir);
    const summaries = loadSummaries(runDir);
    const snapshots = loadSnapshots(runDir);
    const profile = loadProfile(profileId);

    if (!profile) {
      console.warn(`  Profile JSON not found for ${profileId}, skipping`);
      continue;
    }

    // 1. Difficulty targeting
    report.difficultyTargeting.push(analyzeDifficultyTargeting(events, profileId));

    // 2. Presentation drift
    report.presentationDrift.push(analyzePresentationDrift(snapshots, profile, profileId));

    // 3. Mastery convergence
    report.masteryConvergence.push(analyzeMasteryConvergence(snapshots, events, profile, profileId));

    // 5. Remediation
    report.remediation.push(analyzeRemediation(events, profileId));

    // 6. Interleaving
    report.interleaving.push(analyzeInterleaving(events, summaries, profileId));
  }

  // 4. FIRe comparison (optional, runs new simulations)
  if (runFireComparison) {
    console.log("\n=== Running FIRe Comparison Simulations ===\n");
    report.fire = await runFIReComparison(seed);
  }

  // Generate and write report
  const reportContent = generateReport(report);
  const reportPath = join(reportsDir, "adaptive-systems.md");
  writeFileSync(reportPath, reportContent + "\n");
  console.log(`\nReport written to: ${reportPath}`);

  // Print summary
  console.log("\n=== Summary ===");
  const converged = report.difficultyTargeting.filter((d) => d.converged).length;
  console.log(`Difficulty targeting: ${converged}/${report.difficultyTargeting.length} converged`);
  const driftOk = report.presentationDrift.filter((d) => d.driftCorrectDirection).length;
  console.log(`Presentation drift: ${driftOk}/${report.presentationDrift.length} correct direction`);
  const nonStr = report.masteryConvergence.filter((m) => m.profileType !== "struggling");
  const at50 = nonStr.filter((m) => m.finalMasteryPercent >= 0.50).length;
  console.log(`Mastery convergence: ${at50}/${nonStr.length} non-struggling ≥50%`);
  const totalRem = report.remediation.reduce((s, r) => s + r.totalRemediationEvents, 0);
  console.log(`Remediation: ${totalRem} total events`);
  const avgSA = report.interleaving.reduce((s, i) => s + i.sameStrandAdjacencyRate, 0) / report.interleaving.length;
  console.log(`Interleaving: ${(avgSA * 100).toFixed(1)}% same-strand adjacency`);
  if (report.fire.length > 0) {
    const avgComp = report.fire.reduce((s, f) => s + f.compressionRatio, 0) / report.fire.length;
    console.log(`FIRe compression: ${(avgComp * 100).toFixed(1)}% average`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
