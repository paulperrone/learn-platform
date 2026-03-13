/**
 * Content gap detection — cross-references content availability matrix against priority signals
 * from simulation data and grade-level targets. Ranks gaps by estimated impact.
 *
 * Usage: npx tsx tools/content-gaps.ts [subject] [--json]
 *
 * Also importable: `import { detectContentGaps } from "./content-gaps.js"`
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";

// --- Types ---

export type Gap = {
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
  disciplineId: string;
  name: string;
  topics: Topic[];
  prerequisites: { from: string; to: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

export type GapResult = {
  discipline: string;
  disciplineName: string;
  totalGaps: number;
  byPriority: { critical: number; high: number; medium: number; low: number };
  byType: Record<string, number>;
  simDataAvailable: boolean;
  gaps: Gap[];
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

// --- Exported function ---

export function detectContentGaps(subject: string): GapResult | null {
  const contentDir = join(getContentDir(), subject);

  if (!existsSync(contentDir)) return null;

  const graphPath = join(contentDir, "graph.json");
  if (!existsSync(graphPath)) return null;

  const graph: Graph = JSON.parse(readFileSync(graphPath, "utf-8"));

  // Load content
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

  // Load simulation data
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

  // Count downstream dependents for each topic
  const dependentCount = new Map<string, number>();
  for (const topic of graph.topics) dependentCount.set(topic.id, 0);
  for (const edge of graph.prerequisites) {
    dependentCount.set(edge.from, (dependentCount.get(edge.from) ?? 0) + 1);
  }

  // Detect gaps
  const gaps: Gap[] = [];

  for (const topic of graph.topics) {
    const problems = problemsByTopic.get(topic.id) ?? [];
    const examples = examplesByTopic.get(topic.id) ?? [];
    const deps = dependentCount.get(topic.id) ?? 0;
    const baseImpact = Math.min(30, deps * 5);

    if (problems.length === 0) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "no-problems", description: "Topic has zero problems",
        impact: 95 + baseImpact, priority: "critical",
      });
      continue;
    }

    if (problems.length < 5) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "low-problem-count", description: `Only ${problems.length} problems (minimum 5)`,
        impact: 80 + baseImpact, priority: "critical",
      });
    }

    if (problems.length >= 5 && problems.length < 20) {
      const simBoost = tooHardTopics.includes(topic.id) ? 15 : 0;
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "below-target-problems", description: `${problems.length} problems (target 20)`,
        impact: 40 + baseImpact + simBoost, priority: "medium",
      });
    }

    if (examples.length === 0) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "no-examples", description: "Topic has zero worked examples",
        impact: 70 + baseImpact, priority: "high",
      });
    } else if (examples.length < 2) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "low-example-count", description: `Only ${examples.length} worked example (target 2)`,
        impact: 35 + baseImpact, priority: "medium",
      });
    }

    const diffs = new Set(problems.map(p => p.difficulty));
    const missingDiffs = ["easy", "medium", "hard"].filter(d => !diffs.has(d));
    if (missingDiffs.length > 0) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "missing-difficulty", description: `Missing difficulty levels: ${missingDiffs.join(", ")}`,
        impact: 55 + baseImpact, priority: "high",
      });
    }

    const expectedDemands = getExpectedDemands(topic.gradeLevel);
    const presentDemands = new Set(problems.map(p => p.cognitiveDemand ?? "procedural"));
    const missingDemands = expectedDemands.filter(d => !presentDemands.has(d));
    if (missingDemands.length > 0) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "missing-demands", description: `Missing cognitive demands: ${missingDemands.join(", ")}`,
        impact: 45 + baseImpact, priority: "medium",
      });
    }

    if (topic.gradeLevel <= 2) {
      const hasPrimary = problems.some(p => p.presentation === "primary") ||
        examples.some(e => e.presentation === "primary");
      if (!hasPrimary) {
        gaps.push({
          topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
          gapType: "missing-presentation", description: "K-2 topic missing primary presentation level",
          impact: 50 + baseImpact, priority: "medium",
        });
      }
    }

    if (tooHardTopics.includes(topic.id)) {
      const acc = simAccuracy[topic.id];
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "sim-too-hard",
        description: `Strong profiles score ${acc ? (acc * 100).toFixed(0) + "%" : "low"} — review content difficulty`,
        impact: 60 + baseImpact, priority: "high",
      });
    }

    if (tooEasyTopics.includes(topic.id)) {
      gaps.push({
        topicId: topic.id, name: topic.name, gradeLevel: topic.gradeLevel,
        gapType: "sim-too-easy", description: "All profiles score >95% — no learning signal",
        impact: 30 + baseImpact, priority: "low",
      });
    }
  }

  gaps.sort((a, b) => b.impact - a.impact);

  const byType: Record<string, number> = {};
  for (const g of gaps) byType[g.gapType] = (byType[g.gapType] ?? 0) + 1;

  return {
    discipline: graph.disciplineId,
    disciplineName: graph.name,
    totalGaps: gaps.length,
    byPriority: {
      critical: gaps.filter(g => g.priority === "critical").length,
      high: gaps.filter(g => g.priority === "high").length,
      medium: gaps.filter(g => g.priority === "medium").length,
      low: gaps.filter(g => g.priority === "low").length,
    },
    byType,
    simDataAvailable: Object.keys(simAccuracy).length > 0,
    gaps,
  };
}

// --- CLI entry point ---

const isCLI = process.argv[1]?.includes("content-gaps");
if (isCLI) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const filteredArgs = args.filter(a => a !== "--json");
  const subject = filteredArgs[0] ?? "math";

  const result = detectContentGaps(subject);
  if (!result) {
    console.error(`Content not found for subject: ${subject}`);
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n🔍 Content Gaps: ${result.disciplineName} (${result.discipline})`);
    console.log(`${"=".repeat(90)}`);
    console.log(`Total gaps: ${result.totalGaps} (${result.byPriority.critical} critical, ${result.byPriority.high} high, ${result.byPriority.medium} medium, ${result.byPriority.low} low)`);
    console.log(`Simulation data: ${result.simDataAvailable ? "integrated" : "not available"}`);
    console.log();

    const topGaps = result.gaps.slice(0, 20);
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

    if (result.gaps.length > 20) {
      console.log(`\n... and ${result.gaps.length - 20} more gaps. Use --json for full list.`);
    }

    console.log("\nGap Summary by Type:");
    for (const [type, count] of Object.entries(result.byType).sort(([, a], [, b]) => b - a)) {
      console.log(`  ${type}: ${count} topics`);
    }

    console.log("\nRecommendations:");
    if (result.byPriority.critical > 0) {
      console.log(`  1. Fix ${result.byPriority.critical} critical gaps first (missing/insufficient problems)`);
    }
    if (result.byType["sim-too-hard"]) {
      console.log(`  2. Review ${result.byType["sim-too-hard"]} sim-flagged too-hard topics (rewrite or relabel difficulty)`);
    }
    if (result.byType["missing-demands"]) {
      console.log(`  3. Add missing cognitive demands for ${result.byType["missing-demands"]} topics`);
    }
    if (result.byType["missing-presentation"]) {
      console.log(`  4. Add primary presentation for ${result.byType["missing-presentation"]} K-2 topics`);
    }
    if (result.byType["below-target-problems"]) {
      console.log(`  5. Expand ${result.byType["below-target-problems"]} topics from 5 to 20+ problems`);
    }
  }
}
