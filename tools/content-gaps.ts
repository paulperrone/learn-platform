/**
 * Content gap detection — cross-references content availability matrix against priority signals
 * from simulation data and grade-level targets. Ranks gaps by estimated impact.
 *
 * Usage: npx tsx tools/content-gaps.ts [subject] [--json]
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// --- Types ---

type Gap = {
  topicId: string;
  name: string;
  gradeLevel: number;
  gapType: string;
  description: string;
  impact: number; // 0-100
  priority: "critical" | "high" | "medium" | "low";
};

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  cognitiveDemand?: string;
  presentation?: string;
};

type Example = {
  id: string;
  topicId: string;
  presentation?: string;
};

type Topic = {
  id: string;
  name: string;
  gradeLevel: number;
};

type Graph = {
  subjectId: string;
  subjectName: string;
  topics: Topic[];
  prerequisites: { from: string; to: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

// --- Config ---

// Demand targets by grade (from docs/content-system.md §16)
const DEMAND_TARGETS: Record<string, string[]> = {
  "0-1": ["procedural", "application"],
  "2-3": ["procedural", "application", "conceptual"],
  "4-5": ["procedural", "application", "conceptual", "reasoning", "error_analysis"],
};

function getExpectedDemands(gradeLevel: number): string[] {
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

const graphPath = join(contentDir, "graph.json");
if (!existsSync(graphPath)) {
  console.error(`Graph not found: ${graphPath}`);
  process.exit(1);
}

const graph: Graph = JSON.parse(readFileSync(graphPath, "utf-8"));

// --- Load content ---

const problemsDir = join(contentDir, "problems");
const problemsByTopic = new Map<string, Problem[]>();
if (existsSync(problemsDir)) {
  for (const file of readdirSync(problemsDir).filter(f => f.endsWith(".json"))) {
    const problems: Problem[] = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
    for (const p of problems) {
      if (!problemsByTopic.has(p.topicId)) problemsByTopic.set(p.topicId, []);
      problemsByTopic.get(p.topicId)!.push(p);
    }
  }
}

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

// --- Load simulation data ---

const baselinePath = join(process.cwd(), "simulations", "baseline.json");
let simAccuracy: Record<string, number> = {};
let tooHardTopics: string[] = [];
let tooEasyTopics: string[] = [];
if (existsSync(baselinePath)) {
  const simData = JSON.parse(readFileSync(baselinePath, "utf-8"));
  simAccuracy = simData.contentQuality?.perTopicAccuracy ?? {};
  tooHardTopics = simData.contentQuality?.tooHard ?? [];
  tooEasyTopics = simData.contentQuality?.tooEasy ?? [];
}

// Count downstream dependents for each topic (more dependents = higher impact)
const dependentCount = new Map<string, number>();
for (const topic of graph.topics) dependentCount.set(topic.id, 0);
for (const edge of graph.prerequisites) {
  dependentCount.set(edge.from, (dependentCount.get(edge.from) ?? 0) + 1);
}

// --- Detect gaps ---

const gaps: Gap[] = [];

for (const topic of graph.topics) {
  const problems = problemsByTopic.get(topic.id) ?? [];
  const examples = examplesByTopic.get(topic.id) ?? [];
  const deps = dependentCount.get(topic.id) ?? 0;
  const baseImpact = Math.min(30, deps * 5); // topics with more dependents are higher impact

  // Gap: No problems at all
  if (problems.length === 0) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "no-problems",
      description: "Topic has zero problems",
      impact: 95 + baseImpact,
      priority: "critical",
    });
    continue; // other gaps are moot
  }

  // Gap: Below minimum problems (< 5)
  if (problems.length < 5) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "low-problem-count",
      description: `Only ${problems.length} problems (minimum 5)`,
      impact: 80 + baseImpact,
      priority: "critical",
    });
  }

  // Gap: Below target problems (< 20)
  if (problems.length >= 5 && problems.length < 20) {
    const simBoost = tooHardTopics.includes(topic.id) ? 15 : 0;
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "below-target-problems",
      description: `${problems.length} problems (target 20)`,
      impact: 40 + baseImpact + simBoost,
      priority: "medium",
    });
  }

  // Gap: No examples
  if (examples.length === 0) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "no-examples",
      description: "Topic has zero worked examples",
      impact: 70 + baseImpact,
      priority: "high",
    });
  } else if (examples.length < 2) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "low-example-count",
      description: `Only ${examples.length} worked example (target 2)`,
      impact: 35 + baseImpact,
      priority: "medium",
    });
  }

  // Gap: Missing difficulty levels
  const diffs = new Set(problems.map(p => p.difficulty));
  const missingDiffs = ["easy", "medium", "hard"].filter(d => !diffs.has(d));
  if (missingDiffs.length > 0) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "missing-difficulty",
      description: `Missing difficulty levels: ${missingDiffs.join(", ")}`,
      impact: 55 + baseImpact,
      priority: "high",
    });
  }

  // Gap: Missing cognitive demands for grade level
  const expectedDemands = getExpectedDemands(topic.gradeLevel);
  const presentDemands = new Set(problems.map(p => p.cognitiveDemand ?? "procedural"));
  const missingDemands = expectedDemands.filter(d => !presentDemands.has(d));
  if (missingDemands.length > 0) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "missing-demands",
      description: `Missing cognitive demands: ${missingDemands.join(", ")}`,
      impact: 45 + baseImpact,
      priority: "medium",
    });
  }

  // Gap: Missing primary presentation for K-2 topics
  if (topic.gradeLevel <= 2) {
    const hasPrimary = problems.some(p => p.presentation === "primary") ||
      examples.some(e => e.presentation === "primary");
    if (!hasPrimary) {
      gaps.push({
        topicId: topic.id,
        name: topic.name,
        gradeLevel: topic.gradeLevel,
        gapType: "missing-presentation",
        description: "K-2 topic missing primary presentation level",
        impact: 50 + baseImpact,
        priority: "medium",
      });
    }
  }

  // Gap: Simulation flags topic as too hard
  if (tooHardTopics.includes(topic.id)) {
    const acc = simAccuracy[topic.id];
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "sim-too-hard",
      description: `Strong profiles score ${acc ? (acc * 100).toFixed(0) + "%" : "low"} — review content difficulty`,
      impact: 60 + baseImpact,
      priority: "high",
    });
  }

  // Gap: Simulation flags as too easy
  if (tooEasyTopics.includes(topic.id)) {
    gaps.push({
      topicId: topic.id,
      name: topic.name,
      gradeLevel: topic.gradeLevel,
      gapType: "sim-too-easy",
      description: "All profiles score >95% — no learning signal",
      impact: 30 + baseImpact,
      priority: "low",
    });
  }
}

// Sort by impact descending
gaps.sort((a, b) => b.impact - a.impact);

// --- Output ---

if (jsonOutput) {
  const summary = {
    subject: graph.subjectId,
    subjectName: graph.subjectName,
    totalGaps: gaps.length,
    byPriority: {
      critical: gaps.filter(g => g.priority === "critical").length,
      high: gaps.filter(g => g.priority === "high").length,
      medium: gaps.filter(g => g.priority === "medium").length,
      low: gaps.filter(g => g.priority === "low").length,
    },
    byType: Object.fromEntries(
      [...new Set(gaps.map(g => g.gapType))].map(t => [t, gaps.filter(g => g.gapType === t).length])
    ),
    simDataAvailable: Object.keys(simAccuracy).length > 0,
    gaps,
  };
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`\n🔍 Content Gaps: ${graph.subjectName} (${graph.subjectId})`);
  console.log(`${"=".repeat(90)}`);

  const byPriority = {
    critical: gaps.filter(g => g.priority === "critical"),
    high: gaps.filter(g => g.priority === "high"),
    medium: gaps.filter(g => g.priority === "medium"),
    low: gaps.filter(g => g.priority === "low"),
  };

  console.log(`Total gaps: ${gaps.length} (${byPriority.critical.length} critical, ${byPriority.high.length} high, ${byPriority.medium.length} medium, ${byPriority.low.length} low)`);
  console.log(`Simulation data: ${Object.keys(simAccuracy).length > 0 ? "integrated" : "not available"}`);
  console.log();

  // Top 20 gaps
  const topGaps = gaps.slice(0, 20);
  console.log("Top 20 Content Gaps (by impact):");
  console.log("-".repeat(110));
  console.log("Pri".padEnd(5) + "Impact".padEnd(8) + "Topic".padEnd(35) + "G".padEnd(3) + "Type".padEnd(25) + "Description");
  console.log("-".repeat(110));

  const priSymbol: Record<string, string> = { critical: "!!!", high: "!! ", medium: "!  ", low: "   " };

  for (const g of topGaps) {
    console.log(
      `${(priSymbol[g.priority] ?? "   ").padEnd(5)}${String(g.impact).padEnd(8)}${g.topicId.padEnd(35)}${String(g.gradeLevel).padEnd(3)}${g.gapType.padEnd(25)}${g.description}`
    );
  }

  if (gaps.length > 20) {
    console.log(`\n... and ${gaps.length - 20} more gaps. Use --json for full list.`);
  }

  // Summary by gap type
  console.log("\nGap Summary by Type:");
  const byType = new Map<string, number>();
  for (const g of gaps) byType.set(g.gapType, (byType.get(g.gapType) ?? 0) + 1);
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count} topics`);
  }

  // Actionable recommendations
  console.log("\nRecommendations:");
  if (byPriority.critical.length > 0) {
    console.log(`  1. Fix ${byPriority.critical.length} critical gaps first (missing/insufficient problems)`);
  }
  if (byType.get("sim-too-hard")) {
    console.log(`  2. Review ${byType.get("sim-too-hard")} sim-flagged too-hard topics (rewrite or relabel difficulty)`);
  }
  if (byType.get("missing-demands")) {
    console.log(`  3. Add missing cognitive demands for ${byType.get("missing-demands")} topics`);
  }
  if (byType.get("missing-presentation")) {
    console.log(`  4. Add primary presentation for ${byType.get("missing-presentation")} K-2 topics`);
  }
  if (byType.get("below-target-problems")) {
    console.log(`  5. Expand ${byType.get("below-target-problems")} topics from 5 to 20+ problems (generators or hand-authored)`);
  }
}
