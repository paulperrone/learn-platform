/**
 * Context assembler for LLM content review — gathers per-topic data
 * that reviewers need to evaluate content against the rubric.
 *
 * Absorbs and generalizes audit/content/atomicity-context.ts (which was
 * hardcoded to math). Parameterized by discipline.
 *
 * Usage:
 *   npx tsx audit/content/review-context.ts [options]
 *
 * Options:
 *   --discipline <name>   Discipline to review (default: all)
 *   --strand <name>       Only include topics in this strand
 *   --topic <id>          Only include a single topic
 *   --output <path>       Output path (default: stdout as JSON)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { getContentDir } from "../../tools/content-dir.js";
import type { TopicContext } from "./review-types.js";

// ── Types matching graph.json ──

type GraphTopic = {
  id: string;
  name: string;
  description: string;
  gradeLevel: number;
  strand: string;
  contentDepth?: string;
  defaultPresentation?: string;
};

type Graph = {
  disciplineId: string;
  progressionModel?: string;
  topics: GraphTopic[];
  prerequisites: { from: string; to: string; type: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

// ── Progression model lookup ──

const PROGRESSION_MODELS: Record<string, string> = {
  math: "mastery-gated",
  ela: "mastery-gated",
  cs: "mastery-gated",
  history: "context-layered",
  philosophy: "context-layered",
  literature: "context-layered",
  vocabulary: "flexible",
  geography: "flexible",
};

// ── Content hash ──

function computeContentHash(problemsPath: string, examplesPath: string): string {
  const h = createHash("sha256");
  if (existsSync(problemsPath)) h.update(readFileSync(problemsPath));
  if (existsSync(examplesPath)) h.update(readFileSync(examplesPath));
  return h.digest("hex").slice(0, 16);
}

// ── Core assembler ──

export function assembleTopicContext(
  topicId: string,
  discipline: string,
  contentDir?: string,
): TopicContext | null {
  const baseDir = contentDir ?? getContentDir();
  const discDir = join(baseDir, discipline);
  const graphPath = join(discDir, "graph.json");
  if (!existsSync(graphPath)) return null;

  const graph: Graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topic = graph.topics.find(t => t.id === topicId);
  if (!topic) return null;

  const topicMap = new Map(graph.topics.map(t => [t.id, t]));

  // Prerequisites (with metadata)
  const prerequisites = graph.prerequisites
    .filter(e => e.to === topicId)
    .map(e => {
      const t = topicMap.get(e.from);
      return {
        id: e.from,
        name: t?.name ?? e.from,
        description: t?.description ?? "",
        type: e.type,
      };
    });

  // Encompassing edges
  const encompassingEdges = [
    ...graph.encompassings.filter(e => e.parent === topicId || e.child === topicId)
      .map(e => ({ parentId: e.parent, childId: e.child, weight: e.weight })),
  ];

  // Load problems and examples
  const problemsPath = join(discDir, "problems", `${topicId}.json`);
  const examplesPath = join(discDir, "examples", `${topicId}.json`);
  const problems = existsSync(problemsPath)
    ? JSON.parse(readFileSync(problemsPath, "utf-8"))
    : [];
  const examples = existsSync(examplesPath)
    ? JSON.parse(readFileSync(examplesPath, "utf-8"))
    : [];

  const progressionModel = graph.progressionModel
    ?? PROGRESSION_MODELS[discipline]
    ?? "flexible";

  return {
    topicId,
    discipline,
    name: topic.name,
    description: topic.description,
    strand: topic.strand,
    gradeLevel: topic.gradeLevel,
    progressionModel,
    prerequisites,
    encompassingEdges,
    problems,
    examples,
    defaultPresentation: topic.defaultPresentation ?? "standard",
    contentDepth: topic.contentDepth ?? "contextual",
    contentHash: computeContentHash(problemsPath, examplesPath),
  };
}

export function assembleReviewBatch(
  discipline: string,
  opts?: { strand?: string; topicIds?: string[] },
  contentDir?: string,
): TopicContext[] {
  const baseDir = contentDir ?? getContentDir();
  const discDir = join(baseDir, discipline);
  const graphPath = join(discDir, "graph.json");
  if (!existsSync(graphPath)) return [];

  const graph: Graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  let topics = graph.topics;

  if (opts?.strand) topics = topics.filter(t => t.strand === opts.strand);
  if (opts?.topicIds) {
    const ids = new Set(opts.topicIds);
    topics = topics.filter(t => ids.has(t.id));
  }

  return topics
    .map(t => assembleTopicContext(t.id, discipline, contentDir))
    .filter((c): c is TopicContext => c !== null);
}

export function listDisciplines(contentDir?: string): string[] {
  const baseDir = contentDir ?? getContentDir();
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(baseDir, d.name, "graph.json")))
    .map(d => d.name);
}

// ── CLI entry point ──

const isCLI = process.argv[1]?.endsWith("review-context.ts") || process.argv[1]?.endsWith("review-context.js");
if (isCLI) {
  const args = process.argv.slice(2);
  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }

  const discipline = getArg("--discipline");
  const strand = getArg("--strand");
  const topicId = getArg("--topic");
  const outputPath = getArg("--output");

  const disciplines = discipline ? [discipline] : listDisciplines();
  const allContexts: TopicContext[] = [];

  for (const disc of disciplines) {
    if (topicId) {
      const ctx = assembleTopicContext(topicId, disc);
      if (ctx) allContexts.push(ctx);
    } else {
      allContexts.push(...assembleReviewBatch(disc, { strand }));
    }
  }

  const output = JSON.stringify(allContexts, null, 2);
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output + "\n");
    console.error(`Wrote ${allContexts.length} topic contexts to ${outputPath}`);
  } else {
    console.log(output);
  }
}
