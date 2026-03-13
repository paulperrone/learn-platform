/**
 * Validate a knowledge graph: DAG check, cycle detection, orphan detection.
 *
 * Usage: npx tsx tools/validate-graph.ts [subject]
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";

const subject = process.argv[2] ?? "math";
const contentRoot = getContentDir();
const graphPath = join(contentRoot, subject, "graph.json");

if (!existsSync(graphPath)) {
  console.error(`graph.json not found at ${graphPath}`);
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
const topicIds = new Set<string>(graph.topics.map((t: any) => t.id));

let errors = 0;
let warnings = 0;

console.log(`Validating graph: ${graph.name ?? graph.subjectName}`);
console.log(`Topics: ${graph.topics.length}`);
console.log(`Prerequisites: ${graph.prerequisites.length}`);
console.log(`Encompassings: ${graph.encompassings?.length ?? 0}`);
console.log("");

// Check for duplicate topic IDs
const idCounts = new Map<string, number>();
for (const t of graph.topics) {
  idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
}
for (const [id, count] of idCounts) {
  if (count > 1) {
    console.error(`ERROR: Duplicate topic ID "${id}" (${count} times)`);
    errors++;
  }
}

// Check prerequisites reference valid topics
for (const p of graph.prerequisites) {
  if (p.from.includes(":")) {
    // Cross-discipline edges should be in cross-discipline-edges.json, not inline
    console.error(`ERROR: Stale inline cross-discipline edge: "${p.from}" → "${p.to}". Move to cross-discipline-edges.json.`);
    errors++;
    continue;
  }
  if (!topicIds.has(p.from)) {
    console.error(`ERROR: Prerequisite from unknown topic "${p.from}"`);
    errors++;
  }
  if (!topicIds.has(p.to)) {
    console.error(`ERROR: Prerequisite to unknown topic "${p.to}"`);
    errors++;
  }
  if (p.from === p.to) {
    console.error(`ERROR: Self-referencing prerequisite "${p.from}"`);
    errors++;
  }
  if (p.strength < 0 || p.strength > 1) {
    console.warn(`WARN: Prerequisite strength out of range: ${p.from} → ${p.to} (${p.strength})`);
    warnings++;
  }
}

// Check encompassings
if (graph.encompassings) {
  for (const e of graph.encompassings) {
    if (!topicIds.has(e.parent)) {
      console.error(`ERROR: Encompassing parent unknown: "${e.parent}"`);
      errors++;
    }
    if (!topicIds.has(e.child)) {
      console.error(`ERROR: Encompassing child unknown: "${e.child}"`);
      errors++;
    }
  }
}

// DAG validation (Kahn's algorithm)
const adjacency = new Map<string, string[]>();
const inDegree = new Map<string, number>();
for (const id of topicIds) {
  adjacency.set(id, []);
  inDegree.set(id, 0);
}
for (const p of graph.prerequisites) {
  // Skip cross-subject edges for DAG analysis (they reference other graphs)
  if (p.from.includes(":")) continue;
  if (topicIds.has(p.from) && topicIds.has(p.to)) {
    adjacency.get(p.from)!.push(p.to);
    inDegree.set(p.to, (inDegree.get(p.to) ?? 0) + 1);
  }
}

const queue: string[] = [];
for (const [id, deg] of inDegree) {
  if (deg === 0) queue.push(id);
}

let processed = 0;
while (queue.length > 0) {
  const node = queue.shift()!;
  processed++;
  for (const neighbor of adjacency.get(node) ?? []) {
    const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
    inDegree.set(neighbor, newDeg);
    if (newDeg === 0) queue.push(neighbor);
  }
}

if (processed !== topicIds.size) {
  const cycleNodes = [...inDegree.entries()]
    .filter(([, deg]) => deg > 0)
    .map(([id]) => id);
  console.error(`ERROR: Graph has cycles! ${cycleNodes.length} topics involved:`);
  for (const id of cycleNodes.slice(0, 10)) {
    console.error(`  - ${id}`);
  }
  errors++;
} else {
  console.log("DAG validation: PASSED (no cycles)");
}

// Check for orphan topics (no prereqs and not a prereq for anything)
const hasIncoming = new Set<string>();
const hasOutgoing = new Set<string>();
for (const p of graph.prerequisites) {
  if (!p.from.includes(":")) hasOutgoing.add(p.from);
  hasIncoming.add(p.to);
}
const orphans = graph.topics.filter(
  (t: any) => !hasIncoming.has(t.id) && !hasOutgoing.has(t.id)
);
if (orphans.length > 0) {
  console.warn(`WARN: ${orphans.length} orphan topics (no connections):`);
  for (const t of orphans) {
    console.warn(`  - ${t.id}: ${t.name}`);
  }
  warnings += orphans.length;
}

// Root topics (no prerequisites)
const roots = graph.topics.filter((t: any) => !hasIncoming.has(t.id));
console.log(`\nRoot topics (${roots.length}):`);
for (const t of roots) {
  console.log(`  - ${t.id}: ${t.name} (grade ${t.gradeLevel})`);
}

// --- Density and granularity guardrails (per content-system.md §13) ---

const disciplineId = graph.disciplineId ?? subject;

// Detect progression model
const PROGRESSION_MODELS: Record<string, string> = {
  math: "mastery-gated",
  ela: "mastery-gated",
  history: "context-layered",
  philosophy: "context-layered",
};
const progressionModel = graph.progressionModel ?? PROGRESSION_MODELS[disciplineId] ?? "mastery-gated";

// Density targets from content-system.md §13
const DENSITY_TARGETS: Record<string, {
  minProblemsPerTopic: number;
  targetProblemsPerTopic: [number, number];
  prereqDensity: [number, number];
  encompassingDensity: [number, number];
  maxDepth: [number, number];
  requiredEdgePct: [number, number]; // acceptable range
}> = {
  "mastery-gated": {
    minProblemsPerTopic: 15,
    targetProblemsPerTopic: [20, 30],
    prereqDensity: [1.5, 3.0],
    encompassingDensity: [1.0, 2.0],
    maxDepth: [10, 15],
    requiredEdgePct: [90, 100],
  },
  "context-layered": {
    minProblemsPerTopic: 6,
    targetProblemsPerTopic: [8, 15],
    prereqDensity: [0.5, 1.0],
    encompassingDensity: [0.5, 1.0],
    maxDepth: [3, 5],
    requiredEdgePct: [5, 10],
  },
  "flexible": {
    minProblemsPerTopic: 5,
    targetProblemsPerTopic: [8, 12],
    prereqDensity: [0.0, 0.5],
    encompassingDensity: [0.0, 0.5],
    maxDepth: [1, 2],
    requiredEdgePct: [0, 0],
  },
};

const targets = DENSITY_TARGETS[progressionModel] ?? DENSITY_TARGETS["mastery-gated"];
const topicCount = graph.topics.length;
const localPrereqs = graph.prerequisites.filter((p: any) => !p.from.includes(":"));
const encompassings = graph.encompassings ?? [];

console.log(`\n--- Density guardrails (${progressionModel}) ---`);

// 1. Prerequisite density
const prereqDensity = topicCount > 0 ? localPrereqs.length / topicCount : 0;
console.log(`  Prereq density: ${prereqDensity.toFixed(2)} edges/topic (target: ${targets.prereqDensity[0]}-${targets.prereqDensity[1]})`);
if (prereqDensity < targets.prereqDensity[0]) {
  console.warn(`  WARN: Prereq density ${prereqDensity.toFixed(2)} below minimum ${targets.prereqDensity[0]} for ${progressionModel}`);
  warnings++;
}

// 2. Encompassing density
const encompDensity = topicCount > 0 ? encompassings.length / topicCount : 0;
console.log(`  Encompassing density: ${encompDensity.toFixed(2)} edges/topic (target: ${targets.encompassingDensity[0]}-${targets.encompassingDensity[1]})`);
if (encompDensity < targets.encompassingDensity[0]) {
  console.warn(`  WARN: Encompassing density ${encompDensity.toFixed(2)} below minimum ${targets.encompassingDensity[0]} for ${progressionModel}`);
  warnings++;
}

// 3. Max depth check (compute via BFS)
const depthMap = new Map<string, number>();
const bfsQueue: string[] = [];
for (const t of graph.topics) {
  if (!hasIncoming.has(t.id)) {
    depthMap.set(t.id, 0);
    bfsQueue.push(t.id);
  }
}
while (bfsQueue.length > 0) {
  const node = bfsQueue.shift()!;
  const nodeDepth = depthMap.get(node) ?? 0;
  for (const neighbor of adjacency.get(node) ?? []) {
    const newDepth = nodeDepth + 1;
    if (!depthMap.has(neighbor) || depthMap.get(neighbor)! < newDepth) {
      depthMap.set(neighbor, newDepth);
    }
    bfsQueue.push(neighbor);
  }
}
const maxDepth = depthMap.size > 0 ? Math.max(...depthMap.values()) : 0;
console.log(`  Max depth: ${maxDepth} (target: ${targets.maxDepth[0]}-${targets.maxDepth[1]})`);
if (maxDepth > targets.maxDepth[1] * 2) {
  console.warn(`  WARN: Max depth ${maxDepth} significantly exceeds target ${targets.maxDepth[1]} for ${progressionModel}`);
  warnings++;
}

// 4. Edge type distribution
const requiredCount = localPrereqs.filter((p: any) => p.type === "required").length;
const recommendedCount = localPrereqs.filter((p: any) => p.type === "recommended").length;
const enrichingCount = localPrereqs.filter((p: any) => p.type === "enriching").length;
const totalLocal = localPrereqs.length;
const requiredPct = totalLocal > 0 ? Math.round(100 * requiredCount / totalLocal) : 0;
const recommendedPct = totalLocal > 0 ? Math.round(100 * recommendedCount / totalLocal) : 0;
const enrichingPct = totalLocal > 0 ? Math.round(100 * enrichingCount / totalLocal) : 0;
console.log(`  Edge types: ${requiredCount} required (${requiredPct}%), ${recommendedCount} recommended (${recommendedPct}%), ${enrichingCount} enriching (${enrichingPct}%)`);

if (progressionModel === "context-layered") {
  if (totalLocal > 0 && requiredPct > 30) {
    console.warn(`  WARN: Context-layered discipline has >30% required edges (${requiredPct}%). Most edges should be recommended or enriching.`);
    warnings++;
  }
  if (totalLocal > 0 && (recommendedCount + enrichingCount) / totalLocal < 0.5) {
    console.warn(`  WARN: Context-layered discipline has <50% recommended+enriching edges.`);
    warnings++;
  }
} else if (progressionModel === "mastery-gated") {
  if (totalLocal > 0 && requiredPct < 80) {
    console.warn(`  WARN: Mastery-gated discipline has <80% required edges (${requiredPct}%). Expected mostly required prerequisites.`);
    warnings++;
  }
} else if (progressionModel === "flexible") {
  if (totalLocal > 0 && requiredPct > 5) {
    console.warn(`  WARN: Flexible discipline has >${requiredPct}% required edges. Expected mostly enriching.`);
    warnings++;
  }
}

// 5. Bottleneck check — no single topic is sole prereq for >8 downstream
const childCount = new Map<string, number>();
for (const p of localPrereqs) {
  childCount.set(p.from, (childCount.get(p.from) ?? 0) + 1);
}
const bottlenecks = [...childCount.entries()].filter(([, count]) => count > 8);
if (bottlenecks.length > 0) {
  console.warn(`  WARN: ${bottlenecks.length} bottleneck topics (sole prereq for >8 downstream):`);
  for (const [id, count] of bottlenecks) {
    console.warn(`    - ${id}: ${count} downstream`);
  }
  warnings += bottlenecks.length;
}

// 6. Encompassing weight distribution
if (encompassings.length > 0) {
  const weights = encompassings.map((e: any) => e.weight);
  const belowMin = weights.filter((w: number) => w < 0.3);
  if (belowMin.length > 0) {
    console.warn(`  WARN: ${belowMin.length} encompassing edges with weight < 0.3 (too low to be useful)`);
    warnings++;
  }
}

// 7. Leaf coverage — every leaf topic should be encompassed by at least one parent
const leafTopics = graph.topics.filter((t: any) => {
  return !localPrereqs.some((p: any) => p.from === t.id);
});
const encompassedChildren = new Set(encompassings.map((e: any) => e.child));
const uncoveredLeaves = leafTopics.filter((t: any) => !encompassedChildren.has(t.id));
if (uncoveredLeaves.length > 0 && progressionModel !== "flexible") {
  console.warn(`  WARN: ${uncoveredLeaves.length}/${leafTopics.length} leaf topics not encompassed by any parent:`);
  for (const t of uncoveredLeaves.slice(0, 5)) {
    console.warn(`    - ${t.id}`);
  }
  if (uncoveredLeaves.length > 5) console.warn(`    ... and ${uncoveredLeaves.length - 5} more`);
  warnings++;
}

// 8. Mastery-gated capstone check — strands should have capstone encompassing structure
if (progressionModel === "mastery-gated") {
  const strands = new Map<string, string[]>();
  for (const t of graph.topics) {
    if (t.strand) {
      if (!strands.has(t.strand)) strands.set(t.strand, []);
      strands.get(t.strand)!.push(t.id);
    }
  }
  const encompassingParents = new Set(encompassings.map((e: any) => e.parent));
  const strandsWithoutCapstone: string[] = [];
  for (const [strand, topics] of strands) {
    if (topics.length < 3) continue; // too small to need capstone
    const hasCapstone = topics.some(id => encompassingParents.has(id));
    if (!hasCapstone) strandsWithoutCapstone.push(strand);
  }
  if (strandsWithoutCapstone.length > 0) {
    console.warn(`  WARN: ${strandsWithoutCapstone.length} strand(s) with no capstone encompassing structure:`);
    for (const s of strandsWithoutCapstone) {
      console.warn(`    - ${s} (${strands.get(s)!.length} topics)`);
    }
    warnings++;
  }
}

// --- Encompassing quality heuristics (FIRe effectiveness) ---
// Density alone doesn't make FIRe work. These checks assess whether
// encompassings are distributed well enough for set-cover and virtual
// credit to reduce redundant reviews.

if (encompassings.length > 0 && progressionModel === "mastery-gated") {
  console.log(`\n--- Encompassing quality (FIRe effectiveness) ---`);

  // Build encompassing adjacency for analysis
  const encParentToChildren = new Map<string, { child: string; weight: number }[]>();
  const encChildToParents = new Map<string, string[]>();
  for (const e of encompassings) {
    if (!encParentToChildren.has(e.parent)) encParentToChildren.set(e.parent, []);
    encParentToChildren.get(e.parent)!.push({ child: e.child, weight: e.weight });
    if (!encChildToParents.has(e.child)) encChildToParents.set(e.child, []);
    encChildToParents.get(e.child)!.push(e.parent);
  }

  const topicsAsParent = encParentToChildren.size;
  const topicsAsChild = encChildToParents.size;
  const parentPct = Math.round(100 * topicsAsParent / topicCount);
  const childPct = Math.round(100 * topicsAsChild / topicCount);
  console.log(`  Coverage: ${topicsAsParent} parents (${parentPct}%), ${topicsAsChild} children (${childPct}%)`);

  // H1: Parent concentration — edges shouldn't cluster on a few parent topics.
  // If top 10% of parents hold >50% of edges, FIRe's set-cover can't spread credit.
  const parentEdgeCounts = [...encParentToChildren.entries()].map(([, children]) => children.length).sort((a, b) => b - a);
  const top10Pct = Math.max(1, Math.ceil(topicsAsParent * 0.1));
  const top10PctEdges = parentEdgeCounts.slice(0, top10Pct).reduce((s, c) => s + c, 0);
  const concentrationRatio = encompassings.length > 0 ? top10PctEdges / encompassings.length : 0;
  console.log(`  Parent concentration: top ${top10Pct} parents hold ${Math.round(100 * concentrationRatio)}% of edges`);
  if (concentrationRatio > 0.5) {
    console.warn(`  WARN: Encompassing edges are concentrated on a few parents (${Math.round(100 * concentrationRatio)}% in top 10%). Spread encompassings across more topics for better FIRe coverage.`);
    warnings++;
  }

  // H2: Cross-strand edges — these provide the most FIRe value because
  // one review covers skills from multiple strands.
  const strandMap = new Map<string, string>();
  for (const t of graph.topics) {
    if (t.strand) strandMap.set(t.id, t.strand);
  }
  let crossStrandCount = 0;
  let withinStrandCount = 0;
  for (const e of encompassings) {
    const parentStrand = strandMap.get(e.parent);
    const childStrand = strandMap.get(e.child);
    if (parentStrand && childStrand) {
      if (parentStrand !== childStrand) crossStrandCount++;
      else withinStrandCount++;
    }
  }
  const crossStrandPct = encompassings.length > 0 ? Math.round(100 * crossStrandCount / encompassings.length) : 0;
  console.log(`  Cross-strand edges: ${crossStrandCount}/${encompassings.length} (${crossStrandPct}%)`);
  if (crossStrandPct < 15 && topicCount > 50) {
    console.warn(`  WARN: Only ${crossStrandPct}% of encompassing edges cross strands. Cross-strand edges provide the most FIRe value — target ≥15%.`);
    warnings++;
  }

  // H3: Multi-hop chain depth — FIRe credit propagates 3 hops.
  // Check that chains of depth ≥2 exist (parent → child → grandchild).
  let maxChainDepth = 0;
  let chainsDepth2Plus = 0;
  for (const parentId of encParentToChildren.keys()) {
    // BFS from this parent
    const visited = new Set<string>();
    const bfs: { id: string; depth: number }[] = [{ id: parentId, depth: 0 }];
    let localMax = 0;
    while (bfs.length > 0) {
      const { id, depth } = bfs.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      localMax = Math.max(localMax, depth);
      const children = encParentToChildren.get(id);
      if (children && depth < 3) {
        for (const c of children) {
          if (!visited.has(c.child)) {
            bfs.push({ id: c.child, depth: depth + 1 });
          }
        }
      }
    }
    if (localMax >= 2) chainsDepth2Plus++;
    maxChainDepth = Math.max(maxChainDepth, localMax);
  }
  console.log(`  Multi-hop chains: max depth ${maxChainDepth}, ${chainsDepth2Plus} parents with depth ≥2`);
  if (maxChainDepth < 2 && topicCount > 50) {
    console.warn(`  WARN: No multi-hop encompassing chains (max depth ${maxChainDepth}). FIRe credit propagates 3 hops — add chains where advanced skills build on intermediate skills that build on foundations.`);
    warnings++;
  }

  // H4: Strand coverage — each strand with 5+ topics should participate
  // in encompassings (either as parent or child).
  const strands = new Map<string, string[]>();
  for (const t of graph.topics) {
    if (t.strand) {
      if (!strands.has(t.strand)) strands.set(t.strand, []);
      strands.get(t.strand)!.push(t.id);
    }
  }
  const allEncTopics = new Set([...encParentToChildren.keys(), ...encChildToParents.keys()]);
  const strandsWithoutEnc: string[] = [];
  for (const [strand, topics] of strands) {
    if (topics.length < 5) continue;
    const hasEnc = topics.some(id => allEncTopics.has(id));
    if (!hasEnc) strandsWithoutEnc.push(strand);
  }
  if (strandsWithoutEnc.length > 0) {
    console.warn(`  WARN: ${strandsWithoutEnc.length} strand(s) with 5+ topics have zero encompassing edges:`);
    for (const s of strandsWithoutEnc) {
      console.warn(`    - ${s} (${strands.get(s)!.length} topics)`);
    }
    console.warn(`  Add within-strand chains (successor encompasses predecessor, weight 0.6-0.8).`);
    warnings++;
  }

  // Summary assessment
  const issues: string[] = [];
  if (encompDensity < 1.5) issues.push(`density ${encompDensity.toFixed(2)} below 1.5 target`);
  if (concentrationRatio > 0.5) issues.push(`edges concentrated on few parents`);
  if (crossStrandPct < 15) issues.push(`only ${crossStrandPct}% cross-strand`);
  if (maxChainDepth < 2) issues.push(`no multi-hop chains`);
  if (strandsWithoutEnc.length > 0) issues.push(`${strandsWithoutEnc.length} strands unconnected`);

  if (issues.length === 0) {
    console.log(`  FIRe readiness: GOOD — density and distribution support effective FIRe credit`);
  } else if (issues.length <= 2) {
    console.log(`  FIRe readiness: PARTIAL — ${issues.join("; ")}`);
  } else {
    console.log(`  FIRe readiness: LOW — ${issues.join("; ")}`);
    console.log(`  Action: Expand encompassing edges before expecting positive FIRe efficiency.`);
    console.log(`  Priority: within-strand chains first, then cross-strand bridges, then multi-hop depth.`);
  }
}

// 9. Problems-per-topic check
const problemsDirs = [join(contentRoot, subject, "problems"), join(contentRoot, subject, "problems-generated")];
const topicProblemCounts = new Map<string, number>();
for (const dir of problemsDirs) {
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f: string) => f.endsWith(".json"))) {
      const topicId = file.replace(".json", "");
      const problems = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      topicProblemCounts.set(topicId, (topicProblemCounts.get(topicId) ?? 0) + problems.length);
    }
  }
}
if (topicProblemCounts.size > 0) {
  const belowMinimum = [...topicProblemCounts.entries()].filter(([, count]) => count < targets.minProblemsPerTopic);
  const avgProblems = [...topicProblemCounts.values()].reduce((a, b) => a + b, 0) / topicProblemCounts.size;
  console.log(`  Problems/topic: avg ${avgProblems.toFixed(1)}, min target ${targets.minProblemsPerTopic}`);
  if (belowMinimum.length > 0) {
    console.warn(`  WARN: ${belowMinimum.length} topics below minimum ${targets.minProblemsPerTopic} problems:`);
    for (const [id, count] of belowMinimum.slice(0, 5)) {
      console.warn(`    - ${id}: ${count} problems`);
    }
    if (belowMinimum.length > 5) console.warn(`    ... and ${belowMinimum.length - 5} more`);
    warnings++;
  }
}

// 10. Collection validation
if (graph.collections && graph.collections.length > 0) {
  const graphTopicSet = new Set(graph.topics.map((t: any) => t.id));
  const allCollTopics = new Set<string>();

  for (const c of graph.collections) {
    const tids = c.topicIds ?? [];
    for (const tid of tids) allCollTopics.add(tid);

    // Empty collection
    if (tids.length === 0) {
      console.warn(`  WARN: Collection "${c.id}" has no topics`);
      warnings++;
    }

    // Grade range coherence check
    if (c.gradeRange && tids.length > 0) {
      const match = c.gradeRange.match(/^(\d+)-(\d+)$/);
      if (match) {
        const [, lo, hi] = match;
        const outOfRange = tids.filter((tid: string) => {
          const topic = graph.topics.find((t: any) => t.id === tid);
          return topic && (topic.gradeLevel < Number(lo) || topic.gradeLevel > Number(hi));
        });
        if (outOfRange.length > 0) {
          console.warn(`  WARN: Collection "${c.id}" (${c.gradeRange}) has ${outOfRange.length} topics outside grade range`);
          warnings++;
        }
      }
    }
  }

  // Topics not in any collection
  const uncoveredByCollection = graph.topics.filter((t: any) => !allCollTopics.has(t.id));
  if (uncoveredByCollection.length > 0) {
    console.warn(`  WARN: ${uncoveredByCollection.length} topics not in any collection`);
    warnings++;
  }
}

// 11. Context-layered content depth coverage
if (progressionModel === "context-layered") {
  console.log("\n--- Context-layered depth checks ---");
  const problemsDir = join(contentRoot, subject, "problems");
  if (existsSync(problemsDir)) {
    const depthCounts = new Map<string, Set<string>>();
    for (const file of readdirSync(problemsDir).filter((f: string) => f.endsWith(".json"))) {
      const topicId = file.replace(".json", "");
      const problems = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
      const depths = new Set<string>();
      for (const p of problems) {
        depths.add(p.contentDepth ?? "survey");
      }
      depthCounts.set(topicId, depths);
    }
    const multiDepthTopics = [...depthCounts.entries()].filter(([, depths]) => depths.size > 1);
    const surveyOnlyTopics = [...depthCounts.entries()].filter(([, depths]) => depths.size === 1 && depths.has("survey"));
    console.log(`  Content depth: ${multiDepthTopics.length} topics with multi-depth content, ${surveyOnlyTopics.length} survey-only`);
    if (multiDepthTopics.length === 0 && graph.topics.length > 5) {
      console.warn(`  WARN: No topics have multi-depth content. Context-layered disciplines should have contextual/analytical depth for anchor topics.`);
      warnings++;
    }
  }
}

// Summary
console.log(`\n${"=".repeat(40)}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
