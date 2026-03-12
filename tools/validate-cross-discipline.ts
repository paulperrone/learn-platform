/**
 * Validate cross-discipline edges: referential integrity, unified DAG cycle detection,
 * and granularity heuristics.
 *
 * Usage: npx tsx tools/validate-cross-discipline.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";

type Topic = {
  id: string;
  name: string;
  gradeLevel: number;
  strand?: string;
};

type Prerequisite = {
  from: string;
  to: string;
  type?: string;
  strength: number;
};

type Graph = {
  disciplineId: string;
  name: string;
  topics: Topic[];
  prerequisites: Prerequisite[];
  encompassings?: { parent: string; child: string; weight: number }[];
};

type CrossDisciplineEdge = {
  from: string;
  to: string;
  type: string;
  strength: number;
  rationale: string;
};

type CrossDisciplineFile = {
  description: string;
  edges: CrossDisciplineEdge[];
};

let errors = 0;
let warnings = 0;

const contentRoot = getContentDir();
const crossEdgePath = join(contentRoot, "cross-discipline-edges.json");

if (!existsSync(crossEdgePath)) {
  console.log("No cross-discipline-edges.json found — skipping cross-discipline validation.");
  process.exit(0);
}

// --- Load all discipline graphs ---

const disciplineDirs = readdirSync(contentRoot)
  .filter((d) => {
    const stat = existsSync(join(contentRoot, d, "graph.json"));
    return stat;
  })
  .sort();

const graphs = new Map<string, Graph>();
const allTopics = new Map<string, { discipline: string; topic: Topic }>();

for (const dir of disciplineDirs) {
  const graph: Graph = JSON.parse(readFileSync(join(contentRoot, dir, "graph.json"), "utf-8"));
  graphs.set(dir, graph);
  for (const t of graph.topics) {
    allTopics.set(`${dir}:${t.id}`, { discipline: dir, topic: t });
  }
}

// --- Load cross-discipline edges ---

const crossFile: CrossDisciplineFile = JSON.parse(readFileSync(crossEdgePath, "utf-8"));
const crossEdges = crossFile.edges;

console.log(`Validating cross-discipline edges`);
console.log(`Disciplines loaded: ${disciplineDirs.join(", ")}`);
console.log(`Cross-discipline edges: ${crossEdges.length}`);
console.log("");

// --- 1. Structural validation ---

for (let i = 0; i < crossEdges.length; i++) {
  const edge = crossEdges[i];
  const label = `edge[${i}] ${edge.from} → ${edge.to}`;

  // Both sides must use discipline:topic-id format
  if (!edge.from.includes(":")) {
    console.error(`ERROR: ${label}: 'from' must use discipline:topic-id format`);
    errors++;
  }
  if (!edge.to.includes(":")) {
    console.error(`ERROR: ${label}: 'to' must use discipline:topic-id format`);
    errors++;
  }

  // Parse discipline prefixes
  const [fromDisc] = edge.from.split(":", 2);
  const [toDisc] = edge.to.split(":", 2);

  // Must be cross-discipline (different disciplines)
  if (fromDisc === toDisc) {
    console.error(`ERROR: ${label}: both endpoints are in '${fromDisc}' — this belongs in the per-discipline graph, not cross-discipline-edges.json`);
    errors++;
  }

  // Both topics must exist
  if (!allTopics.has(edge.from)) {
    console.error(`ERROR: ${label}: 'from' topic not found in ${fromDisc}/graph.json`);
    errors++;
  }
  if (!allTopics.has(edge.to)) {
    console.error(`ERROR: ${label}: 'to' topic not found in ${toDisc}/graph.json`);
    errors++;
  }

  // Rationale is required
  if (!edge.rationale || edge.rationale.trim().length === 0) {
    console.error(`ERROR: ${label}: missing 'rationale' field — cross-discipline edges must document why they exist`);
    errors++;
  }

  // Type should almost always be 'required' per CLAUDE.md conventions
  if (edge.type && edge.type !== "required") {
    console.warn(`WARN: ${label}: type is '${edge.type}' — cross-discipline edges should almost always be 'required'. If the dependency is soft enough to be '${edge.type}', consider whether it should be a cross-discipline edge at all.`);
    warnings++;
  }

  // Strength validation
  if (edge.strength < 0 || edge.strength > 1) {
    console.error(`ERROR: ${label}: strength ${edge.strength} out of range [0, 1]`);
    errors++;
  }
}

// Check for duplicates
const edgeKeys = new Set<string>();
for (const edge of crossEdges) {
  const key = `${edge.from}→${edge.to}`;
  if (edgeKeys.has(key)) {
    console.error(`ERROR: Duplicate cross-discipline edge: ${key}`);
    errors++;
  }
  edgeKeys.add(key);
}

// --- 2. Unified DAG cycle detection ---

console.log("--- Unified DAG cycle detection ---");

// Build unified adjacency: nodes are discipline:topic-id
const unifiedAdj = new Map<string, string[]>();
const unifiedInDegree = new Map<string, number>();

// Initialize all nodes
for (const [qualifiedId] of allTopics) {
  unifiedAdj.set(qualifiedId, []);
  unifiedInDegree.set(qualifiedId, 0);
}

// Add intra-discipline edges
for (const [disc, graph] of graphs) {
  for (const p of graph.prerequisites) {
    const from = p.from.includes(":") ? p.from : `${disc}:${p.from}`;
    const to = `${disc}:${p.to}`;
    if (unifiedAdj.has(from) && unifiedAdj.has(to)) {
      unifiedAdj.get(from)!.push(to);
      unifiedInDegree.set(to, (unifiedInDegree.get(to) ?? 0) + 1);
    }
  }
}

// Add cross-discipline edges
for (const edge of crossEdges) {
  if (unifiedAdj.has(edge.from) && unifiedAdj.has(edge.to)) {
    unifiedAdj.get(edge.from)!.push(edge.to);
    unifiedInDegree.set(edge.to, (unifiedInDegree.get(edge.to) ?? 0) + 1);
  }
}

// Kahn's algorithm on unified graph
const queue: string[] = [];
for (const [id, deg] of unifiedInDegree) {
  if (deg === 0) queue.push(id);
}

let processed = 0;
const totalNodes = allTopics.size;

while (queue.length > 0) {
  const node = queue.shift()!;
  processed++;
  for (const neighbor of unifiedAdj.get(node) ?? []) {
    const newDeg = (unifiedInDegree.get(neighbor) ?? 1) - 1;
    unifiedInDegree.set(neighbor, newDeg);
    if (newDeg === 0) queue.push(neighbor);
  }
}

if (processed !== totalNodes) {
  const cycleNodes = [...unifiedInDegree.entries()]
    .filter(([, deg]) => deg > 0)
    .map(([id]) => id);

  // Identify which disciplines are involved
  const involvedDiscs = new Set(cycleNodes.map((id) => id.split(":")[0]));
  const isCrossDisciplineCycle = involvedDiscs.size > 1;

  console.error(
    `ERROR: Unified DAG has cycles! ${cycleNodes.length} topics involved${isCrossDisciplineCycle ? " (CROSS-DISCIPLINE CYCLE)" : " (intra-discipline — check per-discipline validation)"}`
  );
  for (const id of cycleNodes.slice(0, 10)) {
    console.error(`  - ${id}`);
  }
  if (cycleNodes.length > 10) console.error(`  ... and ${cycleNodes.length - 10} more`);
  errors++;
} else {
  console.log(`Unified DAG: PASSED (${totalNodes} topics across ${disciplineDirs.length} disciplines, no cycles)`);
}

// --- 3. Granularity heuristics ---

console.log("\n--- Granularity heuristics ---");

// Build per-discipline parent/child maps for prerequisite chains
const childrenOf = new Map<string, Set<string>>(); // topic -> topics it is prereq OF
const parentsOf = new Map<string, Set<string>>(); // topic -> topics that are prereqs FOR it

for (const [disc, graph] of graphs) {
  for (const p of graph.prerequisites) {
    if (p.from.includes(":")) continue; // skip any stale cross-discipline refs
    const fromQ = `${disc}:${p.from}`;
    const toQ = `${disc}:${p.to}`;
    if (!childrenOf.has(fromQ)) childrenOf.set(fromQ, new Set());
    childrenOf.get(fromQ)!.add(toQ);
    if (!parentsOf.has(toQ)) parentsOf.set(toQ, new Set());
    parentsOf.get(toQ)!.add(fromQ);
  }
}

for (const edge of crossEdges) {
  if (!allTopics.has(edge.from) || !allTopics.has(edge.to)) continue; // already flagged as error

  const fromChildren = childrenOf.get(edge.from);
  const toParents = parentsOf.get(edge.to);

  // "From" specificity: if the from topic has children in its own discipline,
  // a more specific child might be the real prerequisite
  if (fromChildren && fromChildren.size > 0) {
    const fromInfo = allTopics.get(edge.from)!;
    const childList = [...fromChildren].map((c) => allTopics.get(c)?.topic.name ?? c).slice(0, 3);
    console.warn(
      `WARN: ${edge.from} → ${edge.to}: 'from' topic "${fromInfo.topic.name}" has ${fromChildren.size} children in ${fromInfo.discipline}. ` +
        `Review whether a more specific subtopic (e.g., ${childList.join(", ")}) is the actual prerequisite skill needed.`
    );
    warnings++;
  }

  // "To" generality: if the to topic has parents in its own discipline,
  // check if those parents also need the cross-discipline skill
  if (toParents && toParents.size > 0) {
    // Only warn if a parent also lacks any cross-discipline prerequisite from the same source discipline
    const [fromDisc] = edge.from.split(":", 2);
    const parentsWithSameCrossDep = [...toParents].filter((parentQ) =>
      crossEdges.some((e) => e.to === parentQ && e.from.startsWith(fromDisc + ":"))
    );

    if (parentsWithSameCrossDep.length === 0) {
      // No parent has the same cross-discipline dependency — check if they should
      const toInfo = allTopics.get(edge.to)!;
      const parentList = [...toParents]
        .map((p) => {
          const info = allTopics.get(p);
          return info ? `${info.topic.name} (${p})` : p;
        })
        .slice(0, 3);
      console.warn(
        `WARN: ${edge.from} → ${edge.to}: 'to' topic "${toInfo.topic.name}" has ${toParents.size} prerequisite(s) within ${toInfo.discipline}: ${parentList.join(", ")}. ` +
          `Review whether the cross-discipline dependency should target an earlier topic in the chain.`
      );
      warnings++;
    }
  }

  // Redundancy: if A→B and A→C where B is a prereq of C, then A→C is transitively implied
  for (const otherEdge of crossEdges) {
    if (otherEdge === edge) continue;
    if (otherEdge.from !== edge.from) continue;
    // Check if edge.to is a prereq of otherEdge.to (directly or transitively within the same discipline)
    if (isTransitivePrereq(edge.to, otherEdge.to, childrenOf)) {
      console.warn(
        `WARN: Redundant edge: ${edge.from} → ${otherEdge.to} is transitively implied by ${edge.from} → ${edge.to} (since ${edge.to} is a prerequisite of ${otherEdge.to})`
      );
      warnings++;
    }
  }
}

// --- 4. Check for stale inline cross-discipline edges ---

console.log("\n--- Stale inline edge check ---");
let staleCount = 0;
for (const [disc, graph] of graphs) {
  for (const p of graph.prerequisites) {
    if (p.from.includes(":")) {
      console.error(
        `ERROR: ${disc}/graph.json still contains inline cross-discipline edge: ${p.from} → ${p.to}. Move it to cross-discipline-edges.json.`
      );
      errors++;
      staleCount++;
    }
  }
}
if (staleCount === 0) {
  console.log("No stale inline cross-discipline edges found.");
}

// --- Summary ---

console.log(`\n${"=".repeat(60)}`);
console.log(`Cross-discipline validation complete`);
console.log(`Edges: ${crossEdges.length}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);

// --- Helpers ---

function isTransitivePrereq(
  fromQ: string,
  toQ: string,
  children: Map<string, Set<string>>,
  visited = new Set<string>()
): boolean {
  if (visited.has(fromQ)) return false;
  visited.add(fromQ);
  const kids = children.get(fromQ);
  if (!kids) return false;
  if (kids.has(toQ)) return true;
  for (const kid of kids) {
    if (isTransitivePrereq(kid, toQ, children, visited)) return true;
  }
  return false;
}
