/**
 * Content health scoring tool — per-topic analysis of problem count, difficulty balance,
 * cognitive demand diversity, example coverage, presentation levels, and simulation signals.
 *
 * Usage: npx tsx tools/content-status.ts [subject] [--json]
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// --- Types ---

type Difficulty = "easy" | "medium" | "hard";
type CognitiveDemand = "procedural" | "application" | "conceptual" | "reasoning" | "error_analysis";
type Presentation = "primary" | "intermediate" | "standard" | "advanced";

type Problem = {
  id: string;
  topicId: string;
  difficulty: Difficulty;
  cognitiveDemand?: CognitiveDemand;
  presentation?: Presentation;
};

type Example = {
  id: string;
  topicId: string;
  presentation?: Presentation;
};

type Topic = {
  id: string;
  name: string;
  gradeLevel: number;
  standardCode?: string;
};

type Graph = {
  subjectId: string;
  subjectName: string;
  disciplineId: string;
  topics: Topic[];
  prerequisites: { from: string; to: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

type TopicHealth = {
  topicId: string;
  name: string;
  gradeLevel: number;
  problemCount: number;
  exampleCount: number;
  difficulty: { easy: number; medium: number; hard: number };
  difficultyBalance: number; // 0-1, how close to 30/40/30
  demands: Record<string, number>;
  demandDiversity: number; // 0-1, vs grade-level targets
  missingDemands: string[];
  presentations: Record<string, number>;
  presentationCoverage: number; // 0-1
  simAccuracy: number | null;
  simStatus: string | null; // "too-hard" | "too-easy" | null
  difficultyCalibrationIssues: string[];
  healthScore: number; // 0-100 composite
  issues: string[];
};

// --- Config ---

const PROBLEM_TARGET = 20;
const EXAMPLE_TARGET = 2;
const IDEAL_DIFFICULTY = { easy: 0.3, medium: 0.4, hard: 0.3 };

// Grade-level cognitive demand targets (from docs/content-system.md §16)
const DEMAND_TARGETS: Record<string, Record<string, number>> = {
  "0-1": { procedural: 0.6, application: 0.4 },
  "2-3": { procedural: 0.4, application: 0.3, conceptual: 0.3 },
  "4-5": { procedural: 0.3, application: 0.2, conceptual: 0.2, reasoning: 0.2, error_analysis: 0.1 },
};

function getDemandTarget(gradeLevel: number): Record<string, number> {
  if (gradeLevel <= 1) return DEMAND_TARGETS["0-1"];
  if (gradeLevel <= 3) return DEMAND_TARGETS["2-3"];
  return DEMAND_TARGETS["4-5"];
}

// --- Argument parsing ---

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const filteredArgs = args.filter(a => a !== "--json");
const subject = filteredArgs[0] ?? "math-foundations";

const contentDir = join(process.cwd(), "content", subject);

if (!existsSync(contentDir)) {
  console.error(`Content directory not found: ${contentDir}`);
  process.exit(1);
}

// --- Load data ---

const graphPath = join(contentDir, "graph.json");
if (!existsSync(graphPath)) {
  console.error(`Graph not found: ${graphPath}`);
  process.exit(1);
}

const graph: Graph = JSON.parse(readFileSync(graphPath, "utf-8"));

// Load problems (hand-authored + generated)
const problemsDirs = [join(contentDir, "problems"), join(contentDir, "problems-generated")];
const problemsByTopic = new Map<string, Problem[]>();
for (const problemsDir of problemsDirs) {
  if (existsSync(problemsDir)) {
    for (const file of readdirSync(problemsDir).filter(f => f.endsWith(".json"))) {
      const problems: Problem[] = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
      for (const p of problems) {
        if (!problemsByTopic.has(p.topicId)) problemsByTopic.set(p.topicId, []);
        problemsByTopic.get(p.topicId)!.push(p);
      }
    }
  }
}

// Load examples
const examplesDir = join(contentDir, "examples");
const examplesByTopic = new Map<string, Example[]>();
if (existsSync(examplesDir)) {
  for (const file of readdirSync(examplesDir).filter(f => f.endsWith(".json"))) {
    const examples: Example[] = JSON.parse(readFileSync(join(examplesDir, file), "utf-8"));
    for (const ex of examples) {
      if (!examplesByTopic.has(ex.topicId)) examplesByTopic.set(ex.topicId, []);
      examplesByTopic.get(ex.topicId)!.push(ex);
    }
  }
}

// Load simulation data (optional)
const baselinePath = join(process.cwd(), "simulations", "baseline.json");
let simData: {
  contentQuality?: {
    tooHard?: string[];
    tooEasy?: string[];
    perTopicAccuracy?: Record<string, number>;
  };
} | null = null;
if (existsSync(baselinePath)) {
  simData = JSON.parse(readFileSync(baselinePath, "utf-8"));
}

// Load content-quality report for difficulty calibration issues
const contentQualityPath = join(process.cwd(), "simulations", "reports", "content-quality.md");
type CalibrationIssue = { topic: string; difficulty: string; expected: string; actual: string; issue: string };
const calibrationIssues: CalibrationIssue[] = [];
if (existsSync(contentQualityPath)) {
  const lines = readFileSync(contentQualityPath, "utf-8").split("\n");
  let inCalibration = false;
  for (const line of lines) {
    if (line.includes("Difficulty Calibration Issues")) { inCalibration = true; continue; }
    if (inCalibration && line.startsWith("##")) break;
    if (inCalibration && line.startsWith("|") && !line.includes("Topic") && !line.includes("---")) {
      const parts = line.split("|").map(s => s.trim()).filter(Boolean);
      if (parts.length >= 5) {
        calibrationIssues.push({
          topic: parts[0],
          difficulty: parts[1],
          expected: parts[2],
          actual: parts[3],
          issue: parts[4],
        });
      }
    }
  }
}

// --- Compute health per topic ---

function computeDifficultyBalance(problems: Problem[]): number {
  const total = problems.length;
  if (total === 0) return 0;
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const p of problems) counts[p.difficulty] = (counts[p.difficulty] ?? 0) + 1;
  const actual = { easy: counts.easy / total, medium: counts.medium / total, hard: counts.hard / total };
  // 1 - mean absolute deviation from ideal
  const mad = (Math.abs(actual.easy - IDEAL_DIFFICULTY.easy) +
    Math.abs(actual.medium - IDEAL_DIFFICULTY.medium) +
    Math.abs(actual.hard - IDEAL_DIFFICULTY.hard)) / 3;
  return Math.max(0, 1 - mad * 3); // scale so 0.33 MAD = 0
}

function computeDemandDiversity(problems: Problem[], gradeLevel: number): { score: number; missing: string[] } {
  const target = getDemandTarget(gradeLevel);
  const expectedDemands = Object.keys(target);
  const demandCounts: Record<string, number> = {};
  for (const p of problems) {
    const d = p.cognitiveDemand ?? "procedural";
    demandCounts[d] = (demandCounts[d] ?? 0) + 1;
  }
  const missing = expectedDemands.filter(d => !demandCounts[d]);
  if (problems.length === 0) return { score: 0, missing: expectedDemands };

  // Score: proportion of expected demands present, weighted by how close to target distribution
  const presentRatio = (expectedDemands.length - missing.length) / expectedDemands.length;
  const total = problems.length;
  let distributionScore = 0;
  for (const [demand, targetPct] of Object.entries(target)) {
    const actualPct = (demandCounts[demand] ?? 0) / total;
    distributionScore += 1 - Math.min(1, Math.abs(actualPct - targetPct) / targetPct);
  }
  distributionScore /= expectedDemands.length;

  return { score: presentRatio * 0.6 + distributionScore * 0.4, missing };
}

function computePresentationCoverage(problems: Problem[], examples: Example[], gradeLevel: number): { score: number; presentations: Record<string, number> } {
  const presentations: Record<string, number> = {};
  for (const p of problems) {
    const pres = p.presentation ?? "standard";
    presentations[pres] = (presentations[pres] ?? 0) + 1;
  }
  for (const ex of examples) {
    const pres = ex.presentation ?? "standard";
    presentations[pres] = (presentations[pres] ?? 0) + 1;
  }

  // Expected presentations by grade level (mastery-gated math)
  // K-2 should have primary, 3-5 should have intermediate
  const expected: string[] = ["standard"];
  if (gradeLevel <= 2) expected.push("primary");
  if (gradeLevel >= 2 && gradeLevel <= 5) expected.push("intermediate");

  const present = expected.filter(p => presentations[p]);
  return { score: present.length / expected.length, presentations };
}

const topicHealths: TopicHealth[] = [];

for (const topic of graph.topics) {
  const problems = problemsByTopic.get(topic.id) ?? [];
  const examples = examplesByTopic.get(topic.id) ?? [];

  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  const demandCounts: Record<string, number> = {};
  for (const p of problems) {
    diffCounts[p.difficulty] = (diffCounts[p.difficulty] ?? 0) + 1;
    const d = p.cognitiveDemand ?? "procedural";
    demandCounts[d] = (demandCounts[d] ?? 0) + 1;
  }

  const diffBalance = computeDifficultyBalance(problems);
  const { score: demandScore, missing: missingDemands } = computeDemandDiversity(problems, topic.gradeLevel);
  const { score: presCoverage, presentations } = computePresentationCoverage(problems, examples, topic.gradeLevel);

  const simAccuracy = simData?.contentQuality?.perTopicAccuracy?.[topic.id] ?? null;
  const isTooHard = simData?.contentQuality?.tooHard?.includes(topic.id) ?? false;
  const isTooEasy = simData?.contentQuality?.tooEasy?.includes(topic.id) ?? false;
  const topicCalIssues = calibrationIssues
    .filter(c => c.topic === topic.id)
    .map(c => `${c.difficulty}: ${c.issue} (expected ${c.expected}, actual ${c.actual})`);

  // Issues list
  const issues: string[] = [];
  if (problems.length === 0) issues.push("No problems");
  else if (problems.length < 5) issues.push(`Only ${problems.length} problems (min 5)`);
  else if (problems.length < PROBLEM_TARGET) issues.push(`${problems.length} problems (target ${PROBLEM_TARGET})`);
  if (examples.length === 0) issues.push("No examples");
  else if (examples.length < EXAMPLE_TARGET) issues.push(`Only ${examples.length} example(s) (target ${EXAMPLE_TARGET})`);
  if (diffCounts.easy === 0) issues.push("No easy problems");
  if (diffCounts.medium === 0) issues.push("No medium problems");
  if (diffCounts.hard === 0) issues.push("No hard problems");
  if (missingDemands.length > 0) issues.push(`Missing demands: ${missingDemands.join(", ")}`);
  if (isTooHard) issues.push(`Sim: too hard for strong profiles (${(simAccuracy! * 100).toFixed(0)}%)`);
  if (isTooEasy) issues.push("Sim: too easy for all profiles");
  if (topicCalIssues.length > 0) issues.push(`${topicCalIssues.length} difficulty calibration issue(s)`);

  // Composite health score (0-100)
  const problemCountScore = Math.min(1, problems.length / PROBLEM_TARGET);
  const exampleCountScore = Math.min(1, examples.length / EXAMPLE_TARGET);
  const simPenalty = isTooHard ? 0.15 : isTooEasy ? 0.1 : 0;
  const calPenalty = Math.min(0.2, topicCalIssues.length * 0.05);

  const healthScore = Math.round(
    (problemCountScore * 30 +
      diffBalance * 20 +
      demandScore * 20 +
      exampleCountScore * 15 +
      presCoverage * 15) *
    (1 - simPenalty - calPenalty)
  );

  topicHealths.push({
    topicId: topic.id,
    name: topic.name,
    gradeLevel: topic.gradeLevel,
    problemCount: problems.length,
    exampleCount: examples.length,
    difficulty: diffCounts,
    difficultyBalance: Math.round(diffBalance * 100) / 100,
    demands: demandCounts,
    demandDiversity: Math.round(demandScore * 100) / 100,
    missingDemands,
    presentations,
    presentationCoverage: Math.round(presCoverage * 100) / 100,
    simAccuracy,
    simStatus: isTooHard ? "too-hard" : isTooEasy ? "too-easy" : null,
    difficultyCalibrationIssues: topicCalIssues,
    healthScore,
    issues,
  });
}

// --- Output ---

if (jsonOutput) {
  const summary = {
    subject: graph.subjectId,
    subjectName: graph.subjectName,
    topicCount: graph.topics.length,
    totalProblems: Array.from(problemsByTopic.values()).reduce((s, ps) => s + ps.length, 0),
    totalExamples: Array.from(examplesByTopic.values()).reduce((s, es) => s + es.length, 0),
    prerequisiteCount: graph.prerequisites.length,
    encompassingCount: graph.encompassings.length,
    averageHealth: Math.round(topicHealths.reduce((s, t) => s + t.healthScore, 0) / topicHealths.length),
    topicsBelow50: topicHealths.filter(t => t.healthScore < 50).length,
    topicsWithIssues: topicHealths.filter(t => t.issues.length > 0).length,
    simDataAvailable: simData !== null,
    calibrationIssueCount: calibrationIssues.length,
    topics: topicHealths,
  };
  console.log(JSON.stringify(summary, null, 2));
} else {
  // Terminal table output
  console.log(`\n📊 Content Health: ${graph.subjectName} (${graph.subjectId})`);
  console.log(`${"=".repeat(90)}`);
  console.log(`Topics: ${graph.topics.length} | Problems: ${Array.from(problemsByTopic.values()).reduce((s, ps) => s + ps.length, 0)} | Examples: ${Array.from(examplesByTopic.values()).reduce((s, es) => s + es.length, 0)}`);
  console.log(`Prerequisites: ${graph.prerequisites.length} | Encompassings: ${graph.encompassings.length}`);
  console.log(`Simulation data: ${simData ? "available" : "not found"} | Calibration issues: ${calibrationIssues.length}`);
  console.log();

  // Summary stats
  const avgHealth = Math.round(topicHealths.reduce((s, t) => s + t.healthScore, 0) / topicHealths.length);
  const below50 = topicHealths.filter(t => t.healthScore < 50);
  const below70 = topicHealths.filter(t => t.healthScore < 70);

  console.log(`Average health: ${avgHealth}/100`);
  console.log(`Topics below 50: ${below50.length} | Below 70: ${below70.length}`);
  console.log();

  // Table header
  const header = "Topic".padEnd(35) + "G".padEnd(3) + "Prb".padEnd(5) + "Ex".padEnd(4) + "Diff".padEnd(12) + "Dem".padEnd(6) + "Pres".padEnd(6) + "Sim".padEnd(6) + "HP".padEnd(5) + "Issues";
  console.log(header);
  console.log("-".repeat(110));

  // Sort by health score ascending (worst first)
  const sorted = [...topicHealths].sort((a, b) => a.healthScore - b.healthScore);

  for (const t of sorted) {
    const diffStr = `${t.difficulty.easy}/${t.difficulty.medium}/${t.difficulty.hard}`;
    const demStr = `${t.demandDiversity}`;
    const presStr = `${t.presentationCoverage}`;
    const simStr = t.simAccuracy !== null ? `${(t.simAccuracy * 100).toFixed(0)}%` : "-";
    const issueStr = t.issues.length > 0 ? t.issues[0] + (t.issues.length > 1 ? ` (+${t.issues.length - 1})` : "") : "";
    const marker = t.healthScore < 50 ? "!!" : t.healthScore < 70 ? "! " : "  ";

    console.log(
      `${marker}${t.topicId.padEnd(33)}${String(t.gradeLevel).padEnd(3)}${String(t.problemCount).padEnd(5)}${String(t.exampleCount).padEnd(4)}${diffStr.padEnd(12)}${demStr.padEnd(6)}${presStr.padEnd(6)}${simStr.padEnd(6)}${String(t.healthScore).padEnd(5)}${issueStr}`
    );
  }

  console.log();
  console.log(`Legend: G=grade, Prb=problems, Ex=examples, Diff=easy/med/hard, Dem=demand diversity (0-1), Pres=presentation coverage (0-1), Sim=sim accuracy, HP=health (0-100)`);
  console.log(`!! = health < 50, ! = health < 70`);

  // Simulation-flagged topics
  if (simData?.contentQuality?.tooHard?.length) {
    console.log(`\n⚠️  Too hard for strong profiles (${simData.contentQuality.tooHard.length} topics):`);
    for (const id of simData.contentQuality.tooHard) {
      const acc = simData.contentQuality.perTopicAccuracy?.[id];
      console.log(`  - ${id} (${acc ? (acc * 100).toFixed(0) + "%" : "?"})`);
    }
  }

  if (calibrationIssues.length > 0) {
    console.log(`\n⚠️  Difficulty calibration issues (${calibrationIssues.length}):`);
    const byTopic = new Map<string, CalibrationIssue[]>();
    for (const ci of calibrationIssues) {
      if (!byTopic.has(ci.topic)) byTopic.set(ci.topic, []);
      byTopic.get(ci.topic)!.push(ci);
    }
    for (const [topicId, issues] of byTopic) {
      console.log(`  ${topicId}: ${issues.map(i => `${i.difficulty} ${i.issue}`).join(", ")}`);
    }
  }
}
