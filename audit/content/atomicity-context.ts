/**
 * Atomicity context assembler — gathers topic data for Claude Code to assess.
 *
 * This is the data-gathering half of the atomicity audit. It assembles
 * per-topic context (problems, prereqs, MA matches, neighbors) into a
 * structured JSON file that Claude Code reads and evaluates.
 *
 * Usage: npx tsx audit/content/atomicity-context.ts [options]
 *
 * Options:
 *   --strand <name>     Only include topics in this strand
 *   --topic <id>        Only include a single topic
 *   --output <path>     Output path (default: docs/audits/context.json)
 *   --previous <path>   Previous audit results to mark already-assessed topics
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { getContentDir } from "../../tools/content-dir.js";

// --- Types ---

type GraphTopic = {
  id: string;
  name: string;
  description: string;
  gradeLevel: number;
  strand: string;
};

type Graph = {
  disciplineId: string;
  topics: GraphTopic[];
  prerequisites: { from: string; to: string; type: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  question: string;
  answer: string;
  cognitiveDemand?: string;
};

type MANode = {
  id: number;
  name: string;
  depth: number;
  courses: { course_name: string; unit_name: string }[];
};

// --- Args ---

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const strandFilter = getArg("--strand");
const topicFilter = getArg("--topic");
const outputPath = getArg("--output") ?? "audit/reports/context.json";
const previousPath = getArg("--previous");
const discipline = "math";

// --- Load data ---

const contentDir = join(getContentDir(), discipline);
const graph: Graph = JSON.parse(readFileSync(join(contentDir, "graph.json"), "utf-8"));

// Load problems
const problemsByTopic = new Map<string, Problem[]>();
for (const dir of [join(contentDir, "problems"), join(contentDir, "problems-generated")]) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const problems: Problem[] = JSON.parse(readFileSync(join(dir, file), "utf-8"));
    for (const p of problems) {
      if (!problemsByTopic.has(p.topicId)) problemsByTopic.set(p.topicId, []);
      problemsByTopic.get(p.topicId)!.push(p);
    }
  }
}

// Load MA graph
const maGraphPath = resolve(process.env.HOME ?? "~", "source/mathacademy-graph/export/graph.json");
let maNodes: MANode[] = [];
if (existsSync(maGraphPath)) {
  const ma = JSON.parse(readFileSync(maGraphPath, "utf-8"));
  maNodes = ma.nodes;
  console.error(`Loaded MA graph: ${maNodes.length} topics`);
}

// Load previous audit results
let previousTopicIds = new Set<string>();
if (previousPath && existsSync(previousPath)) {
  const prev = JSON.parse(readFileSync(previousPath, "utf-8"));
  previousTopicIds = new Set(Object.keys(prev.topics ?? {}));
  console.error(`Previous audit: ${previousTopicIds.size} topics already assessed`);
}

// --- MA fuzzy matching ---

function tokenize(s: string): Set<string> {
  const stopwords = new Set(["and", "the", "of", "by", "in", "a", "to", "for", "with", "on", "an", "is", "as", "or"]);
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 1 && !stopwords.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? inter / union : 0;
}

function findMAMatches(name: string, limit = 3) {
  const tokens = tokenize(name);
  return maNodes
    .map(n => ({ name: n.name, depth: n.depth, courses: [...new Set(n.courses.map(c => c.course_name))], similarity: jaccard(tokens, tokenize(n.name)) }))
    .filter(m => m.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// --- Build context ---

let topics = graph.topics;
if (strandFilter) topics = topics.filter(t => t.strand === strandFilter);
if (topicFilter) topics = topics.filter(t => t.id === topicFilter);

const topicMap = new Map(graph.topics.map(t => [t.id, t]));

const contextEntries = topics.map(topic => {
  const problems = problemsByTopic.get(topic.id) ?? [];
  const prereqs = graph.prerequisites.filter(e => e.to === topic.id).map(e => topicMap.get(e.from)?.name ?? e.from);
  const dependents = graph.prerequisites.filter(e => e.from === topic.id).map(e => topicMap.get(e.to)?.name ?? e.to);
  const encParents = graph.encompassings.filter(e => e.child === topic.id).map(e => topicMap.get(e.parent)?.name ?? e.parent);
  const encChildren = graph.encompassings.filter(e => e.parent === topic.id).map(e => topicMap.get(e.child)?.name ?? e.child);
  const strandNeighbors = graph.topics
    .filter(t => t.strand === topic.strand && t.id !== topic.id)
    .sort((a, b) => Math.abs(a.gradeLevel - topic.gradeLevel) - Math.abs(b.gradeLevel - topic.gradeLevel))
    .slice(0, 6)
    .map(t => ({ name: t.name, grade: t.gradeLevel, description: t.description }));

  // Sample problems: 2 per difficulty
  const sampleProblems: { difficulty: string; question: string; answer: string; cognitiveDemand: string }[] = [];
  for (const diff of ["easy", "medium", "hard"]) {
    for (const p of problems.filter(p => p.difficulty === diff).slice(0, 2)) {
      sampleProblems.push({ difficulty: diff, question: p.question, answer: p.answer, cognitiveDemand: p.cognitiveDemand ?? "unspecified" });
    }
  }

  return {
    id: topic.id,
    name: topic.name,
    description: topic.description,
    gradeLevel: topic.gradeLevel,
    strand: topic.strand,
    problemCount: problems.length,
    sampleProblems,
    prerequisites: prereqs,
    dependents,
    encompassingParents: encParents,
    encompassedChildren: encChildren,
    strandNeighbors,
    maMatches: findMAMatches(topic.name),
    previouslyAssessed: previousTopicIds.has(topic.id),
  };
});

// --- Summary stats ---

const strandCounts: Record<string, number> = {};
for (const t of graph.topics) strandCounts[t.strand] = (strandCounts[t.strand] ?? 0) + 1;

const output = {
  metadata: {
    timestamp: new Date().toISOString(),
    discipline,
    totalTopics: graph.topics.length,
    filteredTopics: contextEntries.length,
    newTopics: contextEntries.filter(e => !e.previouslyAssessed).length,
    strandFilter: strandFilter ?? null,
    topicFilter: topicFilter ?? null,
  },
  graphStats: {
    topics: graph.topics.length,
    prerequisites: graph.prerequisites.length,
    encompassings: graph.encompassings.length,
    prereqDensity: +(graph.prerequisites.length / graph.topics.length).toFixed(2),
    encompassingDensity: +(graph.encompassings.length / graph.topics.length).toFixed(2),
    strandCounts,
    maTopics: maNodes.length,
  },
  heuristics: [
    "1. Testable-in-isolation: Can a student pass this topic and fail an adjacent one? Look at the problems — do they all test ONE skill, or do some require a different strategy?",
    "2. Distinct cognitive demand: Does this topic require a meaningfully different strategy than its neighbors? Or is it essentially the same skill with different numbers?",
    "3. Platform-compatible: Can all problems be assessed with screen + text input? No physical manipulatives, drawing, or verbal responses?",
    "4. Grade-boundary natural: Does this topic sit cleanly at one grade level? Or does it span multiple grades' worth of complexity?",
    "5. Remediation-useful: If a student fails this topic, does the failure pinpoint a specific gap? Or could the failure be caused by multiple unrelated skill deficits?",
  ],
  topics: contextEntries,
};

mkdirSync(join(process.cwd(), "docs", "audits"), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.error(`\nWrote ${contextEntries.length} topic contexts to ${outputPath}`);
console.error(`  New (unassessed): ${contextEntries.filter(e => !e.previouslyAssessed).length}`);
console.error(`  Previously assessed: ${contextEntries.filter(e => e.previouslyAssessed).length}`);
