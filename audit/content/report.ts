/**
 * Content density and coverage report for authoring diagnostics.
 *
 * Prints per-discipline summaries: topic density, strand depth, problems-per-topic
 * histogram, encompassing coverage, and collection coverage.
 *
 * Usage: npx tsx audit/content/report.ts [discipline]
 *        npx tsx audit/content/report.ts           # all disciplines
 *
 * Also importable: `import { generateDisciplineReport } from "./content-report.js"`
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "../../tools/content-dir.js";

const PROGRESSION_MODELS: Record<string, string> = {
  math: "mastery-gated",
  ela: "mastery-gated",
  history: "context-layered",
  philosophy: "context-layered",
};

// --- Types ---

export type DisciplineReport = {
  discipline: string;
  name: string;
  progressionModel: string;
  topicCount: number;
  prerequisiteCount: number;
  prereqDensity: number;
  encompassingCount: number;
  encompassingDensity: number;
  edgeTypes: { required: number; recommended: number; enriching: number };
  strands: { name: string; count: number; minDepth: number; maxDepth: number }[];
  problemStats: {
    totalTopicsWithProblems: number;
    min: number;
    max: number;
    avg: number;
    median: number;
  } | null;
  encompassingCoverage: {
    parentsCount: number;
    childrenCount: number;
    leafTopics: number;
    uncoveredLeaves: number;
    weightAvg: number | null;
    weightMin: number | null;
    weightMax: number | null;
  };
  collections: { id: string; topicCount: number; gradeRange: string; kind: string }[];
  uncoveredByCollection: number;
  maxDepth: number;
};

// --- Exported function ---

export function generateDisciplineReport(discipline: string): DisciplineReport | null {
  const contentDir = getContentDir();
  const graphPath = join(contentDir, discipline, "graph.json");
  if (!existsSync(graphPath)) return null;

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topics: any[] = graph.topics ?? [];
  const localPrereqs = (graph.prerequisites ?? []).filter((p: any) => !p.from.includes(":"));
  const encompassings: any[] = graph.encompassings ?? [];
  const collections: any[] = graph.collections ?? [];
  const model = graph.progressionModel ?? PROGRESSION_MODELS[discipline] ?? "unknown";

  const topicIds = new Set(topics.map((t: any) => t.id));

  // Edge types
  const requiredCount = localPrereqs.filter((p: any) => p.type === "required").length;
  const recommendedCount = localPrereqs.filter((p: any) => p.type === "recommended").length;
  const enrichingCount = localPrereqs.filter((p: any) => p.type === "enriching").length;

  // Strands + depth via BFS
  const strands = new Map<string, any[]>();
  for (const t of topics) {
    const strand = t.strand ?? "(no strand)";
    if (!strands.has(strand)) strands.set(strand, []);
    strands.get(strand)!.push(t);
  }

  const adj = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const id of topicIds) adj.set(id, []);
  for (const p of localPrereqs) {
    if (topicIds.has(p.from) && topicIds.has(p.to)) {
      adj.get(p.from)!.push(p.to);
      hasIncoming.add(p.to);
    }
  }

  const depthMap = new Map<string, number>();
  const queue: string[] = [];
  for (const t of topics) {
    if (!hasIncoming.has(t.id)) {
      depthMap.set(t.id, 0);
      queue.push(t.id);
    }
  }
  while (queue.length > 0) {
    const node = queue.shift()!;
    const d = depthMap.get(node) ?? 0;
    for (const neighbor of adj.get(node) ?? []) {
      if (!depthMap.has(neighbor) || depthMap.get(neighbor)! < d + 1) {
        depthMap.set(neighbor, d + 1);
      }
      queue.push(neighbor);
    }
  }

  const strandData = [...strands.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, strandTopics]) => {
      const depths = strandTopics.map(t => depthMap.get(t.id) ?? 0);
      return { name, count: strandTopics.length, minDepth: Math.min(...depths), maxDepth: Math.max(...depths) };
    });

  // Problems stats
  const probDirs = [join(contentDir, discipline, "problems"), join(contentDir, discipline, "problems-generated")];
  const topicProbCounts = new Map<string, number>();
  for (const dir of probDirs) {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
        const tid = file.replace(".json", "");
        const probs = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        topicProbCounts.set(tid, (topicProbCounts.get(tid) ?? 0) + probs.length);
      }
    }
  }

  let problemStats: DisciplineReport["problemStats"] = null;
  if (topicProbCounts.size > 0) {
    const counts = [...topicProbCounts.values()].sort((a, b) => a - b);
    problemStats = {
      totalTopicsWithProblems: topicProbCounts.size,
      min: counts[0],
      max: counts[counts.length - 1],
      avg: Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10,
      median: counts[Math.floor(counts.length / 2)],
    };
  }

  // Encompassing coverage
  const encompassedChildren = new Set(encompassings.map((e: any) => e.child));
  const encompassingParents = new Set(encompassings.map((e: any) => e.parent));
  const leafTopics = topics.filter(t => !localPrereqs.some((p: any) => p.from === t.id));
  const uncoveredLeaves = leafTopics.filter(t => !encompassedChildren.has(t.id));

  let weightAvg: number | null = null;
  let weightMin: number | null = null;
  let weightMax: number | null = null;
  if (encompassings.length > 0) {
    const weights = encompassings.map((e: any) => e.weight);
    weightAvg = Math.round((weights.reduce((a: number, b: number) => a + b, 0) / weights.length) * 100) / 100;
    weightMin = Math.round(Math.min(...weights) * 100) / 100;
    weightMax = Math.round(Math.max(...weights) * 100) / 100;
  }

  // Collections
  const allCollTopics = new Set<string>();
  const collectionData = collections.map((c: any) => {
    const tids = c.topicIds ?? [];
    for (const tid of tids) allCollTopics.add(tid);
    return { id: c.id, topicCount: tids.length, gradeRange: c.gradeRange ?? "?", kind: c.kind ?? "grade-band" };
  });
  const uncoveredByCollection = topics.filter(t => !allCollTopics.has(t.id)).length;

  const maxDepth = depthMap.size > 0 ? Math.max(...depthMap.values()) : 0;

  return {
    discipline,
    name: graph.name ?? discipline,
    progressionModel: model,
    topicCount: topics.length,
    prerequisiteCount: localPrereqs.length,
    prereqDensity: topics.length > 0 ? Math.round((localPrereqs.length / topics.length) * 100) / 100 : 0,
    encompassingCount: encompassings.length,
    encompassingDensity: topics.length > 0 ? Math.round((encompassings.length / topics.length) * 100) / 100 : 0,
    edgeTypes: { required: requiredCount, recommended: recommendedCount, enriching: enrichingCount },
    strands: strandData,
    problemStats,
    encompassingCoverage: {
      parentsCount: encompassingParents.size,
      childrenCount: encompassedChildren.size,
      leafTopics: leafTopics.length,
      uncoveredLeaves: uncoveredLeaves.length,
      weightAvg, weightMin, weightMax,
    },
    collections: collectionData,
    uncoveredByCollection,
    maxDepth,
  };
}

export function listDisciplines(): string[] {
  const contentDir = getContentDir();
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir).filter(d => existsSync(join(contentDir, d, "graph.json")));
}

// --- CLI entry point ---

const isCLI = process.argv[1]?.endsWith("report.ts") || process.argv[1]?.endsWith("report.js");
if (isCLI) {
  const targetDiscipline = process.argv[2];
  const contentDir = getContentDir();

  if (!existsSync(contentDir)) {
    console.error("content/ directory not found");
    process.exit(1);
  }

  const disciplines = targetDiscipline
    ? [targetDiscipline]
    : readdirSync(contentDir).filter(d => existsSync(join(contentDir, d, "graph.json")));

  for (const disc of disciplines) {
    const report = generateDisciplineReport(disc);
    if (!report) {
      console.log(`Skipping ${disc} — no graph.json`);
      continue;
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${report.name} (${disc}) — ${report.progressionModel}`);
    console.log(`${"═".repeat(60)}`);

    console.log(`\n  Topics: ${report.topicCount}`);
    console.log(`  Prerequisites: ${report.prerequisiteCount} (${report.prereqDensity}/topic)`);
    console.log(`  Encompassings: ${report.encompassingCount} (${report.encompassingDensity}/topic)`);

    const total = report.prerequisiteCount;
    const rPct = total > 0 ? Math.round(100 * report.edgeTypes.required / total) : 0;
    const rcPct = total > 0 ? Math.round(100 * report.edgeTypes.recommended / total) : 0;
    const ePct = total > 0 ? Math.round(100 * report.edgeTypes.enriching / total) : 0;
    console.log(`  Edge types: ${report.edgeTypes.required} required (${rPct}%) | ${report.edgeTypes.recommended} recommended (${rcPct}%) | ${report.edgeTypes.enriching} enriching (${ePct}%)`);

    console.log(`\n  Strands (${report.strands.length}):`);
    for (const s of report.strands) {
      console.log(`    ${s.name}: ${s.count} topics, depth ${s.minDepth}-${s.maxDepth}`);
    }

    if (report.problemStats) {
      const ps = report.problemStats;
      console.log(`\n  Problems/topic: min=${ps.min}, max=${ps.max}, avg=${ps.avg}, median=${ps.median}`);
      console.log(`  Coverage: ${ps.totalTopicsWithProblems}/${report.topicCount} topics have problems`);
    } else {
      console.log(`\n  Problems: NONE`);
    }

    const ec = report.encompassingCoverage;
    console.log(`\n  Encompassing coverage:`);
    console.log(`    Topics as parent: ${ec.parentsCount}/${report.topicCount}`);
    console.log(`    Topics as child: ${ec.childrenCount}/${report.topicCount}`);
    console.log(`    Leaf topics: ${ec.leafTopics}, uncovered: ${ec.uncoveredLeaves}`);
    if (ec.weightAvg !== null) {
      console.log(`    Weight: avg=${ec.weightAvg}, min=${ec.weightMin}, max=${ec.weightMax}`);
    }

    if (report.collections.length > 0) {
      console.log(`\n  Collections (${report.collections.length}):`);
      for (const c of report.collections) {
        console.log(`    ${c.id}: ${c.topicCount} topics, grade ${c.gradeRange}, ${c.kind}`);
      }
      if (report.uncoveredByCollection > 0) {
        console.log(`    ⚠ ${report.uncoveredByCollection} topics not in any collection`);
      }
    } else {
      console.log(`\n  Collections: NONE`);
    }

    if (report.maxDepth > 0) {
      console.log(`\n  Max depth: ${report.maxDepth}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Report complete for ${disciplines.length} discipline(s).`);
}
