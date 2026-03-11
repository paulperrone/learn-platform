/**
 * Content density and coverage report for authoring diagnostics.
 *
 * Prints per-discipline summaries: topic density, strand depth, problems-per-topic
 * histogram, encompassing coverage, and collection coverage.
 *
 * Usage: npx tsx tools/content-report.ts [discipline]
 *        npx tsx tools/content-report.ts           # all disciplines
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const targetDiscipline = process.argv[2];
const contentDir = join(process.cwd(), "content");

const PROGRESSION_MODELS: Record<string, string> = {
  math: "mastery-gated",
  ela: "mastery-gated",
  history: "context-layered",
  philosophy: "context-layered",
};

function reportDiscipline(discipline: string): void {
  const graphPath = join(contentDir, discipline, "graph.json");
  if (!existsSync(graphPath)) {
    console.log(`Skipping ${discipline} — no graph.json`);
    return;
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topics: any[] = graph.topics ?? [];
  const localPrereqs = (graph.prerequisites ?? []).filter((p: any) => !p.from.includes(":"));
  const encompassings: any[] = graph.encompassings ?? [];
  const collections: any[] = graph.collections ?? [];
  const model = graph.progressionModel ?? PROGRESSION_MODELS[discipline] ?? "unknown";

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${graph.name ?? discipline} (${discipline}) — ${model}`);
  console.log(`${"═".repeat(60)}`);

  // --- Density summary ---
  console.log(`\n  Topics: ${topics.length}`);
  console.log(`  Prerequisites: ${localPrereqs.length} (${topics.length > 0 ? (localPrereqs.length / topics.length).toFixed(2) : "0"}/topic)`);
  console.log(`  Encompassings: ${encompassings.length} (${topics.length > 0 ? (encompassings.length / topics.length).toFixed(2) : "0"}/topic)`);

  // --- Edge type distribution ---
  const requiredCount = localPrereqs.filter((p: any) => p.type === "required").length;
  const recommendedCount = localPrereqs.filter((p: any) => p.type === "recommended").length;
  const enrichingCount = localPrereqs.filter((p: any) => p.type === "enriching").length;
  const total = localPrereqs.length;
  console.log(`  Edge types: ${requiredCount} required (${total > 0 ? Math.round(100 * requiredCount / total) : 0}%) | ${recommendedCount} recommended (${total > 0 ? Math.round(100 * recommendedCount / total) : 0}%) | ${enrichingCount} enriching (${total > 0 ? Math.round(100 * enrichingCount / total) : 0}%)`);

  // --- Strand analysis ---
  const strands = new Map<string, any[]>();
  for (const t of topics) {
    const strand = t.strand ?? "(no strand)";
    if (!strands.has(strand)) strands.set(strand, []);
    strands.get(strand)!.push(t);
  }

  // Compute topic depths via BFS
  const topicIds = new Set(topics.map((t: any) => t.id));
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

  console.log(`\n  Strands (${strands.size}):`);
  for (const [strand, strandTopics] of [...strands.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const depths = strandTopics.map(t => depthMap.get(t.id) ?? 0);
    const maxD = Math.max(...depths);
    const minD = Math.min(...depths);
    console.log(`    ${strand}: ${strandTopics.length} topics, depth ${minD}-${maxD}`);
  }

  // --- Problems-per-topic histogram ---
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

  if (topicProbCounts.size > 0) {
    const counts = [...topicProbCounts.values()].sort((a, b) => a - b);
    const min = counts[0];
    const max = counts[counts.length - 1];
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const median = counts[Math.floor(counts.length / 2)];

    console.log(`\n  Problems/topic: min=${min}, max=${max}, avg=${avg.toFixed(1)}, median=${median}`);
    console.log(`  Coverage: ${topicProbCounts.size}/${topics.length} topics have problems`);

    // Histogram buckets
    const buckets = [
      { label: "0-4", min: 0, max: 4 },
      { label: "5-9", min: 5, max: 9 },
      { label: "10-14", min: 10, max: 14 },
      { label: "15-19", min: 15, max: 19 },
      { label: "20-29", min: 20, max: 29 },
      { label: "30-49", min: 30, max: 49 },
      { label: "50+", min: 50, max: Infinity },
    ];
    console.log(`\n  Problems histogram:`);
    for (const b of buckets) {
      const count = counts.filter(c => c >= b.min && c <= b.max).length;
      if (count > 0) {
        const bar = "█".repeat(Math.ceil(count / Math.max(1, Math.ceil(counts.length / 40))));
        console.log(`    ${b.label.padStart(5)}: ${bar} ${count}`);
      }
    }
  } else {
    console.log(`\n  Problems: NONE`);
  }

  // --- Encompassing coverage ---
  const encompassedChildren = new Set(encompassings.map((e: any) => e.child));
  const encompassingParents = new Set(encompassings.map((e: any) => e.parent));
  const leafTopics = topics.filter(t => !localPrereqs.some((p: any) => p.from === t.id));
  const uncoveredLeaves = leafTopics.filter(t => !encompassedChildren.has(t.id));

  console.log(`\n  Encompassing coverage:`);
  console.log(`    Topics as parent: ${encompassingParents.size}/${topics.length}`);
  console.log(`    Topics as child: ${encompassedChildren.size}/${topics.length}`);
  console.log(`    Leaf topics: ${leafTopics.length}, uncovered: ${uncoveredLeaves.length}`);

  if (encompassings.length > 0) {
    const weights = encompassings.map((e: any) => e.weight);
    const avgW = weights.reduce((a: number, b: number) => a + b, 0) / weights.length;
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    console.log(`    Weight: avg=${avgW.toFixed(2)}, min=${minW.toFixed(2)}, max=${maxW.toFixed(2)}`);
  }

  // --- Collection coverage ---
  if (collections.length > 0) {
    console.log(`\n  Collections (${collections.length}):`);
    const allCollTopics = new Set<string>();
    for (const c of collections) {
      const tids = c.topicIds ?? [];
      for (const tid of tids) allCollTopics.add(tid);
      console.log(`    ${c.id}: ${tids.length} topics, grade ${c.gradeRange ?? "?"}, ${c.kind ?? "grade-band"}`);

      // Cross-discipline check
      const foreignTopics = tids.filter((tid: string) => !topicIds.has(tid));
      if (foreignTopics.length > 0) {
        console.log(`      ↳ ${foreignTopics.length} cross-discipline topics`);
      }
    }
    const uncoveredByCollection = topics.filter(t => !allCollTopics.has(t.id));
    if (uncoveredByCollection.length > 0) {
      console.log(`    ⚠ ${uncoveredByCollection.length} topics not in any collection`);
    }
  } else {
    console.log(`\n  Collections: NONE`);
  }

  // --- Depth distribution ---
  if (depthMap.size > 0) {
    const maxDepth = Math.max(...depthMap.values());
    console.log(`\n  Depth distribution (max: ${maxDepth}):`);
    for (let d = 0; d <= maxDepth; d++) {
      const count = [...depthMap.values()].filter(v => v === d).length;
      if (count > 0) {
        const bar = "█".repeat(Math.ceil(count / Math.max(1, Math.ceil(topics.length / 40))));
        console.log(`    ${String(d).padStart(3)}: ${bar} ${count}`);
      }
    }
  }
}

// Main
if (!existsSync(contentDir)) {
  console.error("content/ directory not found");
  process.exit(1);
}

const disciplines = targetDiscipline
  ? [targetDiscipline]
  : readdirSync(contentDir).filter(d => existsSync(join(contentDir, d, "graph.json")));

for (const disc of disciplines) {
  reportDiscipline(disc);
}

console.log(`\n${"═".repeat(60)}`);
console.log(`Report complete for ${disciplines.length} discipline(s).`);
