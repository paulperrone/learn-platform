/**
 * Validate a knowledge graph: DAG check, cycle detection, orphan detection.
 *
 * Usage: npx tsx tools/validate-graph.ts [subject]
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const subject = process.argv[2] ?? "math-foundations";
const graphPath = join(process.cwd(), "content", subject, "graph.json");

if (!existsSync(graphPath)) {
  console.error(`graph.json not found at ${graphPath}`);
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
const topicIds = new Set<string>(graph.topics.map((t: any) => t.id));

// Build cross-subject topic index for resolving "subject:topic-id" references
const crossSubjectTopics = new Set<string>();
const contentDir = join(process.cwd(), "content");
if (existsSync(contentDir)) {
  for (const dir of readdirSync(contentDir)) {
    if (dir === subject) continue;
    const otherGraphPath = join(contentDir, dir, "graph.json");
    if (existsSync(otherGraphPath)) {
      const otherGraph = JSON.parse(readFileSync(otherGraphPath, "utf-8"));
      for (const t of otherGraph.topics ?? []) {
        crossSubjectTopics.add(`${dir}:${t.id}`);
      }
    }
  }
}

let errors = 0;
let warnings = 0;

console.log(`Validating graph: ${graph.subjectName}`);
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
  const fromIsCrossSubject = p.from.includes(":");
  if (fromIsCrossSubject) {
    if (!crossSubjectTopics.has(p.from)) {
      console.error(`ERROR: Cross-subject prerequisite from unknown topic "${p.from}"`);
      errors++;
    }
  } else if (!topicIds.has(p.from)) {
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

// Summary
console.log(`\n${"=".repeat(40)}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
