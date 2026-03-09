#!/usr/bin/env npx tsx
/**
 * Phase 5: Simulation Analysis & Regression Tooling
 *
 * Reads JSONL logs from run directories, produces summary reports with key metrics,
 * generates HTML charts, snapshots baselines, and analyzes content quality.
 *
 * Usage:
 *   npx tsx simulations/src/analyze.ts [run-dir]           # Analyze specific run
 *   npx tsx simulations/src/analyze.ts --all-latest         # Analyze latest run per profile
 *   npx tsx simulations/src/analyze.ts --baseline           # Snapshot metrics to baseline.json
 *   npx tsx simulations/src/analyze.ts --compare <baseline> # Compare current vs baseline
 *   npx tsx simulations/src/analyze.ts --content-quality    # Content quality signals
 *   npx tsx simulations/src/analyze.ts --report             # Full combined report
 */
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type {
  SimulationEvent,
  SessionSummary,
  StateSnapshot,
  LearnerProfile,
  DiagnosticRunResult,
} from "./types.js";

// --- Data loading ---

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

function loadSummaryJson(
  runDir: string
): Record<string, unknown> & { sessionSummaries?: SessionSummary[] } {
  const path = join(runDir, "summary.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadDiagnosticResult(runDir: string): DiagnosticRunResult | null {
  const path = join(runDir, "diagnostic-result.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadProfile(profileId: string): LearnerProfile | null {
  const path = join(
    process.cwd(),
    "simulations",
    "profiles",
    `${profileId}.json`
  );
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function findLatestRuns(
  baseDir: string
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
    if (!latest.has(profileId)) {
      const runDir = join(baseDir, dir);
      if (existsSync(join(runDir, "events.jsonl"))) {
        latest.set(profileId, runDir);
      }
    }
  }
  return [...latest.entries()].map(([profileId, runDir]) => ({
    profileId,
    runDir,
  }));
}

// --- Strand classification ---

const STRAND_PATTERNS: [string, RegExp][] = [
  ["counting", /^count|^teen-numbers|^skip-count/],
  ["addition", /^add-/],
  ["subtraction", /^subtract-/],
  [
    "place-value",
    /^place-value|^compare-(?:two|numbers)|^odd-even/,
  ],
  [
    "multiplication",
    /^multiply|^intro-arrays|^properties-of-mult|^multi-digit-multiply/,
  ],
  [
    "division",
    /^divid|^long-division|^factors-multiples/,
  ],
  [
    "fractions",
    /^fract|^equivalent-fract|^compare-fract|^add-subtract-fract|^multiply-fract|^decimal/,
  ],
  [
    "geometry",
    /^shapes|^classify|^perimeter|^area|^angles|^coordinate|^line-symmetry/,
  ],
  ["measurement", /^measure|^tell-time|^money|^unit-conv/],
  ["data", /^bar-graph|^line-plot/],
  [
    "word-problems",
    /^add-subtract-word|^multi-step-word|^division-word|^multiply-word/,
  ],
  ["algebra", /^variables|^order-of-op|^patterns/],
];

function getStrand(topicId: string): string {
  for (const [strand, pattern] of STRAND_PATTERNS) {
    if (pattern.test(topicId)) return strand;
  }
  return "other";
}

// --- Profile Metrics ---

type ProfileMetrics = {
  profileId: string;
  sessionsCompleted: number;
  totalEvents: number;
  // Diagnostic
  placementAccuracy: number; // |expected - actual|
  diagnosticQuestions: number;
  // Mastery
  initialMasteryPercent: number;
  finalMasteryPercent: number;
  sessionsTo25Mastery: number | null;
  sessionsTo50Mastery: number | null;
  sessionsTo75Mastery: number | null;
  masteryCurve: { session: number; mastery: number }[];
  // Difficulty targeting
  difficultyConvergencePoint: number | null;
  difficultyConverged: boolean;
  rollingAccuracyTrace: { problemIndex: number; rolling: number }[];
  // Presentation
  presentationDriftDirection: string;
  presentationStable: boolean;
  presentationTrace: {
    session: number;
    center: string;
    weights: Record<string, number>;
  }[];
  // FIRe (from logged data)
  fireReviewsSkipped: number;
  // Remediation
  remediationEvents: number;
  // Interleaving
  sameStrandAdjacencyRate: number;
  reviewNewRatio: number;
  demandEntropy: number;
  // Review burden
  reviewsPerSession: number[];
  // Content quality per-topic
  topicAccuracies: Record<string, { correct: number; total: number }>;
};

function computeProfileMetrics(
  profileId: string,
  runDir: string,
  profile: LearnerProfile
): ProfileMetrics {
  const events = loadEvents(runDir);
  const snapshots = loadSnapshots(runDir);
  const summaryJson = loadSummaryJson(runDir);
  const summaries: SessionSummary[] =
    summaryJson.sessionSummaries ??
    loadSummaries(runDir);
  const diag = loadDiagnosticResult(runDir);

  // --- Placement accuracy ---
  const expectedFrontier = getExpectedFrontierGrade(profile);
  const actualFrontier = diag ? (diag.searchLow + diag.searchHigh) / 2 : 0;
  const placementAccuracy = Math.abs(expectedFrontier - actualFrontier);
  const diagnosticQuestions = diag?.questionsAsked ?? 0;

  // --- Mastery curve ---
  const masteryCurve = snapshots.map((s) => ({
    session: s.sessionNumber,
    mastery: s.masteryPercent,
  }));
  const initialMastery = masteryCurve.length > 0 ? masteryCurve[0].mastery : 0;
  const finalMastery =
    masteryCurve.length > 0 ? masteryCurve[masteryCurve.length - 1].mastery : 0;

  function sessionsToThreshold(threshold: number): number | null {
    for (const point of masteryCurve) {
      if (point.mastery >= threshold) return point.session;
    }
    return null;
  }

  // --- Difficulty targeting ---
  const learningEvents = events.filter(
    (e) => e.sessionNumber > 0 && e.correct !== null
  );
  const windowSize = 10;
  const rollingAccuracyTrace: { problemIndex: number; rolling: number }[] = [];
  let convergencePoint: number | null = null;

  for (let i = windowSize - 1; i < learningEvents.length; i++) {
    const window = learningEvents.slice(i - windowSize + 1, i + 1);
    const rolling = window.filter((e) => e.correct).length / windowSize;
    rollingAccuracyTrace.push({ problemIndex: i, rolling });
  }

  // Find convergence: stays in [0.80, 0.90] for 20+ consecutive
  for (let i = 0; i <= rollingAccuracyTrace.length - 20; i++) {
    const window = rollingAccuracyTrace.slice(i, i + 20);
    if (window.every((p) => p.rolling >= 0.8 && p.rolling <= 0.9)) {
      convergencePoint = rollingAccuracyTrace[i].problemIndex;
      break;
    }
  }

  // --- Presentation drift ---
  const presentationTrace = snapshots
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

  const initialCenter =
    presentationTrace.length > 0 ? presentationTrace[0].center : null;
  const finalCenter =
    presentationTrace.length > 0
      ? presentationTrace[presentationTrace.length - 1].center
      : null;
  const last5 = presentationTrace.slice(-5);
  const stable =
    last5.length >= 5 && last5.every((p) => p.center === last5[0].center);

  const expectedLevel = getExpectedPresentationLevel(profile);
  let driftDirection = "stable";
  if (initialCenter && finalCenter) {
    const levels = ["primary", "intermediate", "standard", "advanced"];
    const initialIdx = levels.indexOf(initialCenter);
    const finalIdx = levels.indexOf(finalCenter);
    if (finalIdx > initialIdx) driftDirection = "up";
    else if (finalIdx < initialIdx) driftDirection = "down";
  }

  // --- Interleaving ---
  let sameStrandAdj = 0;
  let totalAdj = 0;
  let reviewCount = 0;
  let totalPhaseCount = 0;

  const sessionEvents = events.filter((e) => e.sessionNumber > 0 && e.topicId);
  for (let i = 1; i < sessionEvents.length; i++) {
    if (sessionEvents[i].sessionNumber !== sessionEvents[i - 1].sessionNumber)
      continue;
    const s1 = getStrand(sessionEvents[i - 1].topicId!);
    const s2 = getStrand(sessionEvents[i].topicId!);
    if (s1 === s2) sameStrandAdj++;
    totalAdj++;
  }

  for (const e of sessionEvents) {
    if (e.phase === "review") reviewCount++;
    totalPhaseCount++;
  }

  // Demand entropy
  const demandCounts: Record<string, number> = {};
  for (const e of sessionEvents) {
    if (e.cognitiveDemand) {
      demandCounts[e.cognitiveDemand] =
        (demandCounts[e.cognitiveDemand] ?? 0) + 1;
    }
  }
  const demandTotal = Object.values(demandCounts).reduce((a, b) => a + b, 0);
  let entropy = 0;
  for (const count of Object.values(demandCounts)) {
    const p = count / demandTotal;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // --- FIRe / Remediation ---
  const fireSkipped = summaries.reduce(
    (s, sm) => s + sm.fireReviewsSkipped,
    0
  );
  const remediationCount = events.filter(
    (e) => e.phase === "remediation"
  ).length;

  // --- Reviews per session ---
  const reviewsPerSession = summaries.map((s) => s.reviewsCompleted);

  // --- Per-topic accuracy ---
  const topicAccuracies: Record<string, { correct: number; total: number }> =
    {};
  for (const e of events) {
    if (e.topicId && e.correct !== null && e.sessionNumber > 0) {
      if (!topicAccuracies[e.topicId]) {
        topicAccuracies[e.topicId] = { correct: 0, total: 0 };
      }
      topicAccuracies[e.topicId].total++;
      if (e.correct) topicAccuracies[e.topicId].correct++;
    }
  }

  return {
    profileId,
    sessionsCompleted: summaries.length,
    totalEvents: events.length,
    placementAccuracy,
    diagnosticQuestions,
    initialMasteryPercent: initialMastery,
    finalMasteryPercent: finalMastery,
    sessionsTo25Mastery: sessionsToThreshold(0.25),
    sessionsTo50Mastery: sessionsToThreshold(0.5),
    sessionsTo75Mastery: sessionsToThreshold(0.75),
    masteryCurve,
    difficultyConvergencePoint: convergencePoint,
    difficultyConverged: convergencePoint !== null,
    rollingAccuracyTrace,
    presentationDriftDirection: driftDirection,
    presentationStable: stable,
    presentationTrace,
    fireReviewsSkipped: fireSkipped,
    remediationEvents: remediationCount,
    sameStrandAdjacencyRate: totalAdj > 0 ? sameStrandAdj / totalAdj : 0,
    reviewNewRatio: totalPhaseCount > 0 ? reviewCount / totalPhaseCount : 0,
    demandEntropy: entropy,
    reviewsPerSession,
    topicAccuracies,
  };
}

function getExpectedFrontierGrade(profile: LearnerProfile): number {
  const curve = profile.abilityCurve;
  const grades = Object.keys(curve)
    .map(Number)
    .sort((a, b) => a - b);
  for (const g of grades) {
    if (curve[g] < 0.6) return Math.max(0, g - 1);
  }
  return grades[grades.length - 1];
}

function getExpectedPresentationLevel(profile: LearnerProfile): string {
  if (profile.age <= 7) return "primary";
  if (profile.age <= 10) return "intermediate";
  if (profile.age <= 14) return "standard";
  return "advanced";
}

// --- Baseline types ---

type BaselineMetrics = {
  placementAccuracy: number;
  finalMasteryPercent: number;
  sessionsTo50Mastery: number | null;
  difficultyConvergencePoint: number | null;
  sameStrandAdjacencyRate: number;
  reviewNewRatio: number;
  demandEntropy: number;
  remediationEvents: number;
  fireReviewsSkipped: number;
};

type Baseline = {
  generatedAt: string;
  seed: number;
  sessions: number;
  profiles: Record<string, BaselineMetrics>;
  contentQuality: {
    tooHard: string[]; // topics where strong profiles <70%
    tooEasy: string[]; // topics where all profiles >95%
    perTopicAccuracy: Record<string, number>; // aggregate accuracy
  };
};

function metricsToBaseline(m: ProfileMetrics): BaselineMetrics {
  return {
    placementAccuracy: m.placementAccuracy,
    finalMasteryPercent: m.finalMasteryPercent,
    sessionsTo50Mastery: m.sessionsTo50Mastery,
    difficultyConvergencePoint: m.difficultyConvergencePoint,
    sameStrandAdjacencyRate: m.sameStrandAdjacencyRate,
    reviewNewRatio: m.reviewNewRatio,
    demandEntropy: m.demandEntropy,
    remediationEvents: m.remediationEvents,
    fireReviewsSkipped: m.fireReviewsSkipped,
  };
}

// --- Content quality ---

type ContentQualityReport = {
  tooHard: { topicId: string; strongAccuracy: number; allAccuracy: number }[];
  tooEasy: { topicId: string; accuracy: number }[];
  fallbackRate: Record<string, number>; // from difficulty mismatch
  perTopicAccuracy: Record<string, number>;
  difficultyCalibration: {
    topicId: string;
    difficulty: string;
    expectedAccuracy: number;
    actualAccuracy: number;
    mislabeled: boolean;
  }[];
};

function analyzeContentQuality(
  allMetrics: ProfileMetrics[]
): ContentQualityReport {
  // Aggregate per-topic accuracy across all profiles
  const topicAgg: Record<string, { correct: number; total: number }> = {};
  const strongProfiles = ["strong-older", "strong-young"];
  const strugglingProfiles = [
    "struggling-young",
    "struggling-older",
  ];

  // Per-profile-type per-topic accuracy
  const strongTopicAcc: Record<string, { correct: number; total: number }> = {};
  const strugglingTopicAcc: Record<string, { correct: number; total: number }> =
    {};

  for (const m of allMetrics) {
    const isStrong = strongProfiles.includes(m.profileId);
    const isStruggling = strugglingProfiles.includes(m.profileId);

    for (const [topicId, acc] of Object.entries(m.topicAccuracies)) {
      // Overall
      if (!topicAgg[topicId])
        topicAgg[topicId] = { correct: 0, total: 0 };
      topicAgg[topicId].correct += acc.correct;
      topicAgg[topicId].total += acc.total;

      // Strong
      if (isStrong) {
        if (!strongTopicAcc[topicId])
          strongTopicAcc[topicId] = { correct: 0, total: 0 };
        strongTopicAcc[topicId].correct += acc.correct;
        strongTopicAcc[topicId].total += acc.total;
      }

      // Struggling
      if (isStruggling) {
        if (!strugglingTopicAcc[topicId])
          strugglingTopicAcc[topicId] = { correct: 0, total: 0 };
        strugglingTopicAcc[topicId].correct += acc.correct;
        strugglingTopicAcc[topicId].total += acc.total;
      }
    }
  }

  const perTopicAccuracy: Record<string, number> = {};
  for (const [topicId, acc] of Object.entries(topicAgg)) {
    perTopicAccuracy[topicId] = acc.total > 0 ? acc.correct / acc.total : 0;
  }

  // Too hard: strong profiles <70%
  const tooHard: ContentQualityReport["tooHard"] = [];
  for (const [topicId, acc] of Object.entries(strongTopicAcc)) {
    const strongAcc = acc.total > 0 ? acc.correct / acc.total : 1;
    if (strongAcc < 0.7 && acc.total >= 3) {
      tooHard.push({
        topicId,
        strongAccuracy: strongAcc,
        allAccuracy: perTopicAccuracy[topicId],
      });
    }
  }

  // Too easy: all profiles >95%
  const tooEasy: ContentQualityReport["tooEasy"] = [];
  for (const [topicId, acc] of Object.entries(topicAgg)) {
    const accuracy = acc.total > 0 ? acc.correct / acc.total : 0;
    if (accuracy > 0.95 && acc.total >= 10) {
      // Also check struggling profiles
      const sAcc = strugglingTopicAcc[topicId];
      if (sAcc && sAcc.total > 0 && sAcc.correct / sAcc.total > 0.95) {
        tooEasy.push({ topicId, accuracy });
      }
    }
  }

  // Difficulty calibration: check if easy/medium/hard labels match observed accuracy
  const diffCalibration: ContentQualityReport["difficultyCalibration"] = [];
  const diffTopicAcc: Record<
    string,
    Record<string, { correct: number; total: number }>
  > = {};

  for (const m of allMetrics) {
    // Need to re-read events for difficulty breakdown
    // Reuse topicAccuracies which don't have difficulty breakdown
    // We'll compute from the profile's run data
  }

  // For difficulty calibration, aggregate across all runs
  for (const m of allMetrics) {
    // We don't have per-difficulty data in ProfileMetrics, so skip for now
    // This would require re-reading events with difficulty info
  }

  return {
    tooHard: tooHard.sort((a, b) => a.strongAccuracy - b.strongAccuracy),
    tooEasy: tooEasy.sort((a, b) => b.accuracy - a.accuracy),
    fallbackRate: {},
    perTopicAccuracy,
    difficultyCalibration: diffCalibration,
  };
}

// Enriched content quality with difficulty calibration from raw events
function analyzeContentQualityFromEvents(
  allRuns: { profileId: string; runDir: string }[],
  allMetrics: ProfileMetrics[]
): ContentQualityReport {
  const base = analyzeContentQuality(allMetrics);

  // Difficulty calibration from raw events
  const diffAcc: Record<
    string,
    Record<string, { correct: number; total: number }>
  > = {};

  for (const { runDir } of allRuns) {
    const events = loadEvents(runDir);
    for (const e of events) {
      if (!e.topicId || e.correct === null || !e.difficulty) continue;
      if (e.sessionNumber === 0) continue; // skip diagnostic
      const key = e.topicId;
      if (!diffAcc[key]) diffAcc[key] = {};
      if (!diffAcc[key][e.difficulty])
        diffAcc[key][e.difficulty] = { correct: 0, total: 0 };
      diffAcc[key][e.difficulty].total++;
      if (e.correct) diffAcc[key][e.difficulty].correct++;
    }
  }

  // Check calibration
  const expectedRanges: Record<string, [number, number]> = {
    easy: [0.7, 1.0],
    medium: [0.5, 0.9],
    hard: [0.3, 0.8],
  };

  for (const [topicId, diffs] of Object.entries(diffAcc)) {
    for (const [difficulty, acc] of Object.entries(diffs)) {
      if (acc.total < 3) continue;
      const actual = acc.correct / acc.total;
      const range = expectedRanges[difficulty];
      if (!range) continue;

      const mislabeled = actual < range[0] || actual > range[1];
      if (mislabeled) {
        base.difficultyCalibration.push({
          topicId,
          difficulty,
          expectedAccuracy: (range[0] + range[1]) / 2,
          actualAccuracy: actual,
          mislabeled: true,
        });
      }
    }
  }

  base.difficultyCalibration.sort(
    (a, b) =>
      Math.abs(b.actualAccuracy - b.expectedAccuracy) -
      Math.abs(a.actualAccuracy - a.expectedAccuracy)
  );

  return base;
}

// --- HTML Chart Generation ---

function generateCharts(allMetrics: ProfileMetrics[]): string {
  const profileColors: Record<string, string> = {
    "strong-older": "#2563eb",
    "strong-young": "#3b82f6",
    "average-older": "#16a34a",
    "average-young": "#22c55e",
    "struggling-older": "#dc2626",
    "struggling-young": "#ef4444",
    "overconfident": "#d97706",
    "underconfident": "#7c3aed",
    "misconception-fractions": "#db2777",
    "fast-learner": "#0891b2",
  };

  const getColor = (id: string) => profileColors[id] ?? "#6b7280";

  // Mastery curves data
  const masteryDatasets = allMetrics.map((m) => ({
    label: m.profileId,
    data: m.masteryCurve.map((p) => ({
      x: p.session,
      y: +(p.mastery * 100).toFixed(1),
    })),
    borderColor: getColor(m.profileId),
    fill: false,
    tension: 0.2,
  }));

  // Rolling accuracy data (sample every 5th point for readability)
  const accuracyDatasets = allMetrics
    .filter((m) => m.rollingAccuracyTrace.length > 0)
    .map((m) => ({
      label: m.profileId,
      data: m.rollingAccuracyTrace
        .filter((_, i) => i % 5 === 0)
        .map((p) => ({
          x: p.problemIndex,
          y: +(p.rolling * 100).toFixed(1),
        })),
      borderColor: getColor(m.profileId),
      fill: false,
      tension: 0.2,
      pointRadius: 0,
      borderWidth: 1.5,
    }));

  // Reviews per session
  const reviewDatasets = allMetrics
    .filter((m) => m.reviewsPerSession.length > 0)
    .map((m) => ({
      label: m.profileId,
      data: m.reviewsPerSession.map((r, i) => ({ x: i + 1, y: r })),
      borderColor: getColor(m.profileId),
      fill: false,
      tension: 0.2,
    }));

  // Presentation weight evolution (average-older as representative)
  const presProfile =
    allMetrics.find((m) => m.profileId === "average-older") ?? allMetrics[0];
  const presDatasets = presProfile
    ? [
        {
          label: "Primary",
          data: presProfile.presentationTrace.map((p) => ({
            x: p.session,
            y: +((p.weights.primary ?? 0) * 100).toFixed(0),
          })),
          borderColor: "#ef4444",
          fill: false,
        },
        {
          label: "Intermediate",
          data: presProfile.presentationTrace.map((p) => ({
            x: p.session,
            y: +((p.weights.intermediate ?? 0) * 100).toFixed(0),
          })),
          borderColor: "#f59e0b",
          fill: false,
        },
        {
          label: "Standard",
          data: presProfile.presentationTrace.map((p) => ({
            x: p.session,
            y: +((p.weights.standard ?? 0) * 100).toFixed(0),
          })),
          borderColor: "#22c55e",
          fill: false,
        },
        {
          label: "Advanced",
          data: presProfile.presentationTrace.map((p) => ({
            x: p.session,
            y: +((p.weights.advanced ?? 0) * 100).toFixed(0),
          })),
          borderColor: "#3b82f6",
          fill: false,
        },
      ]
    : [];

  // Demand distribution heatmap data
  const demandProfiles = allMetrics.map((m) => {
    const demands: Record<string, number> = {};
    // Compute from events would be ideal but we have entropy; use summaries
    return { profileId: m.profileId, entropy: m.demandEntropy };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulation Analysis Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    h2 { font-size: 1.2rem; margin: 2rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; }
    .chart-container { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-container canvas { max-height: 350px; }
    .full-width { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.85rem; }
    th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; font-weight: 600; }
    .pass { color: #16a34a; } .fail { color: #dc2626; } .warn { color: #d97706; }
    .metric { font-size: 1.5rem; font-weight: 700; }
    .metric-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
    .metrics-row { display: flex; gap: 2rem; margin: 1rem 0; }
    .metric-card { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex: 1; text-align: center; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Simulation Analysis Report</h1>
  <p style="color:#64748b;margin-bottom:1rem;">Generated: ${new Date().toISOString()} | ${allMetrics.length} profiles</p>

  <div class="metrics-row">
    <div class="metric-card">
      <div class="metric">${allMetrics.filter((m) => m.difficultyConverged).length}/${allMetrics.length}</div>
      <div class="metric-label">Difficulty Converged</div>
    </div>
    <div class="metric-card">
      <div class="metric">${(allMetrics.reduce((s, m) => s + m.finalMasteryPercent, 0) / allMetrics.length * 100).toFixed(1)}%</div>
      <div class="metric-label">Avg Final Mastery</div>
    </div>
    <div class="metric-card">
      <div class="metric">${(allMetrics.reduce((s, m) => s + m.sameStrandAdjacencyRate, 0) / allMetrics.length * 100).toFixed(1)}%</div>
      <div class="metric-label">Same-Strand Adjacency</div>
    </div>
    <div class="metric-card">
      <div class="metric">${allMetrics.reduce((s, m) => s + m.remediationEvents, 0)}</div>
      <div class="metric-label">Remediation Events</div>
    </div>
  </div>

  <h2>Summary Table</h2>
  <table>
    <tr>
      <th>Profile</th><th>Sessions</th><th>Placement Δ</th><th>Init Mastery</th><th>Final Mastery</th>
      <th>Diff Conv</th><th>Pres Drift</th><th>Strand Adj</th><th>Review Ratio</th><th>Entropy</th>
    </tr>
    ${allMetrics
      .map(
        (m) => `<tr>
      <td>${m.profileId}</td>
      <td>${m.sessionsCompleted}</td>
      <td>${m.placementAccuracy.toFixed(1)}</td>
      <td>${(m.initialMasteryPercent * 100).toFixed(1)}%</td>
      <td>${(m.finalMasteryPercent * 100).toFixed(1)}%</td>
      <td class="${m.difficultyConverged ? "pass" : "fail"}">${m.difficultyConverged ? `#${m.difficultyConvergencePoint}` : "no"}</td>
      <td>${m.presentationDriftDirection}${m.presentationStable ? " ✓" : ""}</td>
      <td class="${m.sameStrandAdjacencyRate < 0.1 ? "pass" : "fail"}">${(m.sameStrandAdjacencyRate * 100).toFixed(1)}%</td>
      <td class="${m.reviewNewRatio > 0.5 && m.reviewNewRatio < 0.7 ? "pass" : "warn"}">${(m.reviewNewRatio * 100).toFixed(0)}%</td>
      <td>${m.demandEntropy.toFixed(2)}</td>
    </tr>`
      )
      .join("\n")}
  </table>

  <div class="grid">
    <div class="chart-container full-width">
      <canvas id="masteryChart"></canvas>
    </div>
    <div class="chart-container full-width">
      <canvas id="accuracyChart"></canvas>
    </div>
    <div class="chart-container">
      <canvas id="reviewChart"></canvas>
    </div>
    <div class="chart-container">
      <canvas id="presentationChart"></canvas>
    </div>
  </div>

  <script>
    const masteryCtx = document.getElementById('masteryChart');
    new Chart(masteryCtx, {
      type: 'line',
      data: { datasets: ${JSON.stringify(masteryDatasets)} },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Mastery Curve Over Sessions (%)' } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Session' } },
          y: { min: 0, max: 100, title: { display: true, text: 'Mastery %' } }
        }
      }
    });

    const accCtx = document.getElementById('accuracyChart');
    new Chart(accCtx, {
      type: 'line',
      data: { datasets: ${JSON.stringify(accuracyDatasets)} },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Rolling Accuracy (window=10) with 85% Target' },
          annotation: undefined
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Problem Index' } },
          y: { min: 0, max: 100, title: { display: true, text: 'Accuracy %' } }
        }
      }
    });
    // Add 85% target line manually
    const accChart = Chart.getChart(accCtx);
    if (accChart) {
      accChart.data.datasets.push({
        label: '85% Target',
        data: [{ x: 0, y: 85 }, { x: 3000, y: 85 }],
        borderColor: '#94a3b8',
        borderDash: [6, 3],
        pointRadius: 0,
        borderWidth: 1
      });
      accChart.update();
    }

    const revCtx = document.getElementById('reviewChart');
    new Chart(revCtx, {
      type: 'line',
      data: { datasets: ${JSON.stringify(reviewDatasets)} },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Reviews Per Session' } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Session' } },
          y: { min: 0, title: { display: true, text: 'Reviews' } }
        }
      }
    });

    const presCtx = document.getElementById('presentationChart');
    new Chart(presCtx, {
      type: 'line',
      data: { datasets: ${JSON.stringify(presDatasets)} },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Presentation Weights: ${presProfile?.profileId ?? "N/A"} (%)' } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Session' } },
          y: { min: 0, max: 100, title: { display: true, text: 'Weight %' } }
        }
      }
    });
  </script>
</body>
</html>`;
}

// --- Comparison ---

type ComparisonResult = {
  profileId: string;
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  regressed: boolean;
};

function compareBaselines(
  baseline: Baseline,
  current: Record<string, BaselineMetrics>,
  threshold = 0.1
): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  const numericKeys: (keyof BaselineMetrics)[] = [
    "placementAccuracy",
    "finalMasteryPercent",
    "sameStrandAdjacencyRate",
    "reviewNewRatio",
    "demandEntropy",
    "remediationEvents",
    "fireReviewsSkipped",
  ];

  // Metrics where increase = regression
  const higherIsBad = new Set([
    "placementAccuracy",
    "sameStrandAdjacencyRate",
  ]);
  // Metrics where decrease = regression
  const lowerIsBad = new Set([
    "finalMasteryPercent",
    "demandEntropy",
    "remediationEvents",
    "fireReviewsSkipped",
  ]);

  for (const [profileId, baseMetrics] of Object.entries(baseline.profiles)) {
    const curMetrics = current[profileId];
    if (!curMetrics) continue;

    for (const key of numericKeys) {
      const bVal = baseMetrics[key] as number | null;
      const cVal = curMetrics[key] as number | null;
      if (bVal === null || cVal === null) continue;

      const delta = cVal - bVal;
      const denom = Math.abs(bVal) || 1;
      const deltaPercent = delta / denom;

      let regressed = false;
      if (higherIsBad.has(key) && deltaPercent > threshold) regressed = true;
      if (lowerIsBad.has(key) && deltaPercent < -threshold) regressed = true;

      results.push({
        profileId,
        metric: key,
        baseline: bVal,
        current: cVal,
        delta,
        deltaPercent,
        regressed,
      });
    }
  }

  return results;
}

// --- Content quality report ---

function generateContentQualityReport(cq: ContentQualityReport): string {
  const lines: string[] = [];
  lines.push("# Content Quality Analysis");
  lines.push("");
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Topics That Are Too Hard");
  lines.push("");
  lines.push(
    "Strong profiles (strong-older, strong-young) score <70% — likely a content issue."
  );
  lines.push("");
  if (cq.tooHard.length === 0) {
    lines.push("No topics flagged as too hard.");
  } else {
    lines.push(
      "| Topic | Strong Accuracy | Overall Accuracy | Recommendation |"
    );
    lines.push("|-------|----------------|-----------------|----------------|");
    for (const t of cq.tooHard) {
      lines.push(
        `| ${t.topicId} | ${(t.strongAccuracy * 100).toFixed(0)}% | ${(t.allAccuracy * 100).toFixed(0)}% | Review problem wording/difficulty labels |`
      );
    }
  }
  lines.push("");

  lines.push("## Topics That Are Too Easy");
  lines.push("");
  lines.push("All profiles (including struggling) score >95% — no learning signal.");
  lines.push("");
  if (cq.tooEasy.length === 0) {
    lines.push("No topics flagged as too easy.");
  } else {
    lines.push("| Topic | Overall Accuracy | Recommendation |");
    lines.push("|-------|-----------------|----------------|");
    for (const t of cq.tooEasy) {
      lines.push(
        `| ${t.topicId} | ${(t.accuracy * 100).toFixed(0)}% | Add harder problems or increase cognitive demand |`
      );
    }
  }
  lines.push("");

  lines.push("## Difficulty Calibration Issues");
  lines.push("");
  if (cq.difficultyCalibration.length === 0) {
    lines.push("No difficulty calibration issues detected.");
  } else {
    lines.push(
      "| Topic | Difficulty | Expected Range | Actual Accuracy | Issue |"
    );
    lines.push("|-------|-----------|---------------|----------------|-------|");
    for (const dc of cq.difficultyCalibration.slice(0, 20)) {
      const issue =
        dc.actualAccuracy > dc.expectedAccuracy
          ? "Too easy for label"
          : "Too hard for label";
      lines.push(
        `| ${dc.topicId} | ${dc.difficulty} | ${(dc.expectedAccuracy * 100).toFixed(0)}% | ${(dc.actualAccuracy * 100).toFixed(0)}% | ${issue} |`
      );
    }
  }
  lines.push("");

  // Per-topic accuracy table (sorted)
  lines.push("## Per-Topic Accuracy (All Profiles)");
  lines.push("");
  const sorted = Object.entries(cq.perTopicAccuracy).sort(
    (a, b) => a[1] - b[1]
  );
  lines.push("| Topic | Accuracy | Status |");
  lines.push("|-------|----------|--------|");
  for (const [topicId, acc] of sorted) {
    let status = "OK";
    if (acc < 0.6) status = "Very Hard";
    else if (acc < 0.7) status = "Hard";
    else if (acc > 0.95) status = "Very Easy";
    lines.push(`| ${topicId} | ${(acc * 100).toFixed(0)}% | ${status} |`);
  }

  return lines.join("\n");
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const runsDir = join(process.cwd(), "simulations", "runs");
  const reportsDir = join(process.cwd(), "simulations", "reports");
  const baselinePath = join(process.cwd(), "simulations", "baseline.json");
  mkdirSync(reportsDir, { recursive: true });

  const doBaseline = args.includes("--baseline");
  const doCompare = args.includes("--compare");
  const doContentQuality = args.includes("--content-quality");
  const doReport = args.includes("--report");
  const allLatest = args.includes("--all-latest") || doBaseline || doReport || doContentQuality;

  // Determine runs to analyze
  let runs: { profileId: string; runDir: string }[];

  if (allLatest) {
    runs = findLatestRuns(runsDir);
  } else {
    // Specific run directory
    const runDir = args.find((a) => !a.startsWith("--"));
    if (runDir) {
      const absDir = runDir.startsWith("/") ? runDir : join(process.cwd(), runDir);
      const match = absDir.match(/([^/]+?)-\d{4}-\d{2}-\d{2}T/);
      const profileId = match ? match[1] : "unknown";
      runs = [{ profileId, runDir: absDir }];
    } else {
      runs = findLatestRuns(runsDir);
    }
  }

  if (runs.length === 0) {
    console.error(
      "No simulation runs found. Run `just simulate-all --sessions 30` first."
    );
    process.exit(1);
  }

  console.log(`Analyzing ${runs.length} runs...\n`);

  // Compute metrics for all profiles
  const allMetrics: ProfileMetrics[] = [];
  for (const { profileId, runDir } of runs) {
    const profile = loadProfile(profileId);
    if (!profile) {
      console.warn(`Profile not found: ${profileId}, skipping`);
      continue;
    }
    console.log(`  ${profileId}: ${runDir.split("/").pop()}`);
    allMetrics.push(computeProfileMetrics(profileId, runDir, profile));
  }

  // --- Summary report (always) ---
  console.log("\n=== Profile Summary ===");
  console.log(
    "Profile".padEnd(28) +
      "Sess".padEnd(6) +
      "PlaceΔ".padEnd(8) +
      "Mastery".padEnd(10) +
      "DiffConv".padEnd(10) +
      "StrandAdj".padEnd(10) +
      "Entropy".padEnd(8)
  );
  console.log("-".repeat(80));
  for (const m of allMetrics) {
    console.log(
      m.profileId.padEnd(28) +
        String(m.sessionsCompleted).padEnd(6) +
        m.placementAccuracy.toFixed(1).padEnd(8) +
        `${(m.finalMasteryPercent * 100).toFixed(0)}%`.padEnd(10) +
        (m.difficultyConverged
          ? `#${m.difficultyConvergencePoint}`
          : "no"
        ).padEnd(10) +
        `${(m.sameStrandAdjacencyRate * 100).toFixed(1)}%`.padEnd(10) +
        m.demandEntropy.toFixed(2).padEnd(8)
    );
  }

  // --- Generate charts ---
  const chartPath = join(reportsDir, "simulation-charts.html");
  writeFileSync(chartPath, generateCharts(allMetrics));
  console.log(`\nCharts written to: ${chartPath}`);

  // --- Baseline ---
  if (doBaseline) {
    const cq = analyzeContentQualityFromEvents(runs, allMetrics);
    const baseline: Baseline = {
      generatedAt: new Date().toISOString(),
      seed: 42,
      sessions: Math.max(...allMetrics.map((m) => m.sessionsCompleted)),
      profiles: {},
      contentQuality: {
        tooHard: cq.tooHard.map((t) => t.topicId),
        tooEasy: cq.tooEasy.map((t) => t.topicId),
        perTopicAccuracy: cq.perTopicAccuracy,
      },
    };
    for (const m of allMetrics) {
      baseline.profiles[m.profileId] = metricsToBaseline(m);
    }
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`Baseline written to: ${baselinePath}`);
  }

  // --- Compare ---
  if (doCompare) {
    const compareIdx = args.indexOf("--compare");
    const baselineFile = args[compareIdx + 1] ?? baselinePath;
    if (!existsSync(baselineFile)) {
      console.error(
        `Baseline file not found: ${baselineFile}. Run with --baseline first.`
      );
      process.exit(1);
    }
    const baseline: Baseline = JSON.parse(readFileSync(baselineFile, "utf-8"));
    const currentBaseline: Record<string, BaselineMetrics> = {};
    for (const m of allMetrics) {
      currentBaseline[m.profileId] = metricsToBaseline(m);
    }

    const results = compareBaselines(baseline, currentBaseline);
    const regressions = results.filter((r) => r.regressed);

    console.log("\n=== Baseline Comparison ===");
    console.log(`Baseline from: ${baseline.generatedAt}`);
    console.log(`Comparing ${Object.keys(baseline.profiles).length} profiles\n`);

    if (regressions.length === 0) {
      console.log("No regressions detected (threshold: 10%).");
    } else {
      console.log(`${regressions.length} REGRESSIONS detected:\n`);
      console.log(
        "Profile".padEnd(28) +
          "Metric".padEnd(25) +
          "Baseline".padEnd(12) +
          "Current".padEnd(12) +
          "Delta".padEnd(12)
      );
      console.log("-".repeat(89));
      for (const r of regressions) {
        console.log(
          r.profileId.padEnd(28) +
            r.metric.padEnd(25) +
            r.baseline.toFixed(4).padEnd(12) +
            r.current.toFixed(4).padEnd(12) +
            `${(r.deltaPercent * 100).toFixed(1)}%`.padEnd(12)
        );
      }
      process.exit(1);
    }
  }

  // --- Content Quality ---
  if (doContentQuality || doReport) {
    console.log("\n=== Content Quality Analysis ===");
    const cq = analyzeContentQualityFromEvents(runs, allMetrics);
    const cqReport = generateContentQualityReport(cq);
    const cqPath = join(reportsDir, "content-quality.md");
    writeFileSync(cqPath, cqReport + "\n");
    console.log(`Content quality report: ${cqPath}`);
    console.log(`  Too hard topics: ${cq.tooHard.length}`);
    console.log(`  Too easy topics: ${cq.tooEasy.length}`);
    console.log(`  Difficulty calibration issues: ${cq.difficultyCalibration.length}`);
  }

  // --- Full report mode ---
  if (doReport) {
    console.log("\nFull report complete. See:");
    console.log(`  Charts: ${chartPath}`);
    console.log(`  Content quality: ${join(reportsDir, "content-quality.md")}`);
    if (doBaseline) console.log(`  Baseline: ${baselinePath}`);
  }
}

// Export for use in regression tests
export {
  computeProfileMetrics,
  compareBaselines,
  metricsToBaseline,
  findLatestRuns,
  loadEvents,
  loadSummaries,
  loadSnapshots,
  loadProfile,
  analyzeContentQuality,
  analyzeContentQualityFromEvents,
  type ProfileMetrics,
  type BaselineMetrics,
  type Baseline,
  type ComparisonResult,
  type ContentQualityReport,
};

// Only run main when executed directly (not when imported)
const isDirectExecution =
  process.argv[1]?.endsWith("analyze.ts") ||
  process.argv[1]?.endsWith("analyze.js");

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
