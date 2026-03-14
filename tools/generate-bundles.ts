/**
 * Generate R2 content bundles from learn-content source files.
 *
 * For each topic in each discipline, produces:
 *   - manifest.json  (version metadata, content hashes, item counts)
 *   - problems.json  (all problems with dimension defaults applied)
 *   - examples.json  (all worked examples with dimension defaults applied)
 *
 * Usage:
 *   npx tsx tools/generate-bundles.ts [--discipline <name>] [--dry-run] [--out <dir>] [--lenient]
 *
 * Modes:
 *   --strict   (default) Warn when dimension defaults are applied. Exit non-zero if any defaults needed.
 *   --lenient  Apply defaults silently without warnings or failure. Use during migration only.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { getContentDir } from "./content-dir.js";

// ── Types ──

type GraphTopic = {
  id: string;
  name: string;
  description: string;
  gradeLevel: number;
  standardCode: string | null;
  strand?: string;
};

type GraphDefinition = {
  disciplineId: string;
  name: string;
  topics: GraphTopic[];
};

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  question: string;
  answer: string;
  hints: string[];
  solution: string;
  type?: string;
  typeProperties?: Record<string, unknown>;
  visuals?: unknown[];
  keyPrerequisiteId?: string;
  cognitiveDemand?: string;
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
  source?: string;
};

type WorkedExample = {
  id: string;
  topicId: string;
  title: string;
  steps: { subgoalLabel: string; instruction: string; work: string; explanation: string }[];
  visuals?: unknown[];
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
};

type Lesson = {
  id: string;
  topicId: string;
  title: string;
  sections: unknown[];
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
};

type Manifest = {
  version: number;
  contentHash: string;
  topicId: string;
  discipline: string;
  generatedAt: string;
  items: {
    problems: {
      count: number;
      hash: string;
      difficulties: Record<string, number>;
      types: Record<string, number>;
      demands: Record<string, number>;
    };
    examples: {
      count: number;
      hash: string;
    };
    lessons: {
      count: number;
      hash: string;
    };
    media: unknown[];
  };
  dimensions: {
    presentations: string[];
    depths: string[];
    locales: string[];
    flavors: string[];
  };
};

// ── Helpers ──

function sha256(data: string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

let totalDefaultsApplied = 0;
let lenientMode = false; // set by parseArgs()

function applyProblemDefaults(problem: Problem): Problem {
  const result = { ...problem };
  const missing: string[] = [];
  if (!result.flavor) { result.flavor = "classic"; missing.push("flavor"); }
  if (!result.locale) { result.locale = "en"; missing.push("locale"); }
  if (!result.presentation) { result.presentation = "standard"; missing.push("presentation"); }
  if (!result.contentDepth) { result.contentDepth = "survey"; missing.push("contentDepth"); }
  if (!result.source) { result.source = "hand-authored"; missing.push("source"); }
  if (missing.length > 0) {
    totalDefaultsApplied += missing.length;
    if (!lenientMode) {
      for (const field of missing) {
        console.warn(`WARN: ${problem.id} missing ${field}, defaulting to ${(result as Record<string, unknown>)[field]}`);
      }
    }
  }
  return result;
}

function applyExampleDefaults(example: WorkedExample): WorkedExample {
  const result = { ...example };
  const missing: string[] = [];
  if (!result.flavor) { result.flavor = "classic"; missing.push("flavor"); }
  if (!result.locale) { result.locale = "en"; missing.push("locale"); }
  if (!result.presentation) { result.presentation = "standard"; missing.push("presentation"); }
  if (!result.contentDepth) { result.contentDepth = "survey"; missing.push("contentDepth"); }
  if (missing.length > 0) {
    totalDefaultsApplied += missing.length;
    if (!lenientMode) {
      for (const field of missing) {
        console.warn(`WARN: ${example.id} missing ${field}, defaulting to ${(result as Record<string, unknown>)[field]}`);
      }
    }
  }
  return result;
}

function applyLessonDefaults(lesson: Lesson): Lesson {
  const result = { ...lesson };
  const missing: string[] = [];
  if (!result.flavor) { result.flavor = "classic"; missing.push("flavor"); }
  if (!result.locale) { result.locale = "en"; missing.push("locale"); }
  if (!result.presentation) { result.presentation = "standard"; missing.push("presentation"); }
  if (!result.contentDepth) { result.contentDepth = "survey"; missing.push("contentDepth"); }
  if (missing.length > 0) {
    totalDefaultsApplied += missing.length;
    if (!lenientMode) {
      for (const field of missing) {
        console.warn(`WARN: ${lesson.id} missing ${field}, defaulting to ${(result as Record<string, unknown>)[field]}`);
      }
    }
  }
  return result;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function unique(items: (string | undefined)[]): string[] {
  return [...new Set(items.filter((x): x is string => x !== undefined))].sort();
}

// ── Main ──

function parseArgs(): { discipline?: string; dryRun: boolean; outDir: string; strict: boolean } {
  const args = process.argv.slice(2);
  let discipline: string | undefined;
  let dryRun = false;
  let outDir = "/tmp/learn-content-bundles";
  let strict = true; // default is strict

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--discipline" && args[i + 1]) {
      discipline = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = args[++i];
    } else if (args[i] === "--lenient") {
      strict = false;
      lenientMode = true;
    } else if (args[i] === "--strict") {
      strict = true;
      lenientMode = false;
    }
  }

  return { discipline, dryRun, outDir, strict };
}

function processDiscipline(
  contentDir: string,
  disciplineId: string,
  outDir: string,
  dryRun: boolean
): { topics: number; problems: number; examples: number; lessons: number; bytes: number } {
  const graphPath = join(contentDir, disciplineId, "graph.json");
  if (!existsSync(graphPath)) {
    console.error(`  No graph.json found for ${disciplineId}, skipping.`);
    return { topics: 0, problems: 0, examples: 0, lessons: 0, bytes: 0 };
  }

  const graph: GraphDefinition = JSON.parse(readFileSync(graphPath, "utf-8"));
  const problemsDir = join(contentDir, disciplineId, "problems");
  const examplesDir = join(contentDir, disciplineId, "examples");
  const lessonsDir = join(contentDir, disciplineId, "lessons");

  let totalProblems = 0;
  let totalExamples = 0;
  let totalLessons = 0;
  let totalBytes = 0;
  let topicsProcessed = 0;

  for (const topic of graph.topics) {
    const topicOutDir = join(outDir, disciplineId, topic.id);

    // Read problems (hand-authored + generated)
    const problemsPath = join(problemsDir, `${topic.id}.json`);
    const problemsGeneratedDir = join(contentDir, disciplineId, "problems-generated");
    const problemsGeneratedPath = join(problemsGeneratedDir, `${topic.id}.json`);
    let problems: Problem[] = [];
    if (existsSync(problemsPath)) {
      const raw: Problem[] = JSON.parse(readFileSync(problemsPath, "utf-8"));
      problems = raw.map(applyProblemDefaults);
    }
    if (existsSync(problemsGeneratedPath)) {
      const raw: Problem[] = JSON.parse(readFileSync(problemsGeneratedPath, "utf-8"));
      problems = problems.concat(raw.map(applyProblemDefaults));
    }

    // Read examples
    const examplesPath = join(examplesDir, `${topic.id}.json`);
    let examples: WorkedExample[] = [];
    if (existsSync(examplesPath)) {
      const raw: WorkedExample[] = JSON.parse(readFileSync(examplesPath, "utf-8"));
      examples = raw.map(applyExampleDefaults);
    }

    // Read lessons
    const lessonsPath = join(lessonsDir, `${topic.id}.json`);
    let lessons: Lesson[] = [];
    if (existsSync(lessonsPath)) {
      const raw: Lesson[] = JSON.parse(readFileSync(lessonsPath, "utf-8"));
      lessons = raw.map(applyLessonDefaults);
    }

    // Skip topics with no content
    if (problems.length === 0 && examples.length === 0 && lessons.length === 0) {
      continue;
    }

    const problemsJson = JSON.stringify(problems, null, 2);
    const examplesJson = JSON.stringify(examples, null, 2);
    const lessonsJson = JSON.stringify(lessons, null, 2);
    const problemsHash = sha256(problemsJson);
    const examplesHash = sha256(examplesJson);
    const lessonsHash = sha256(lessonsJson);
    const contentHash = sha256(problemsJson + examplesJson + lessonsJson);

    const manifest: Manifest = {
      version: 1,
      contentHash,
      topicId: topic.id,
      discipline: disciplineId,
      generatedAt: new Date().toISOString(),
      items: {
        problems: {
          count: problems.length,
          hash: problemsHash,
          difficulties: countBy(problems, (p) => p.difficulty),
          types: countBy(problems, (p) => p.type ?? "text-qa"),
          demands: countBy(problems, (p) => p.cognitiveDemand ?? "procedural"),
        },
        examples: {
          count: examples.length,
          hash: examplesHash,
        },
        lessons: {
          count: lessons.length,
          hash: lessonsHash,
        },
        media: [],
      },
      dimensions: {
        presentations: unique(
          [...problems.map((p) => p.presentation), ...examples.map((e) => e.presentation), ...lessons.map((l) => l.presentation)]
        ),
        depths: unique(
          [...problems.map((p) => p.contentDepth), ...examples.map((e) => e.contentDepth), ...lessons.map((l) => l.contentDepth)]
        ),
        locales: unique(
          [...problems.map((p) => p.locale), ...examples.map((e) => e.locale), ...lessons.map((l) => l.locale)]
        ),
        flavors: unique(
          [...problems.map((p) => p.flavor), ...examples.map((e) => e.flavor), ...lessons.map((l) => l.flavor)]
        ),
      },
    };

    const manifestJson = JSON.stringify(manifest, null, 2);

    if (!dryRun) {
      mkdirSync(topicOutDir, { recursive: true });
      writeFileSync(join(topicOutDir, "manifest.json"), manifestJson);
      writeFileSync(join(topicOutDir, "problems.json"), problemsJson);
      writeFileSync(join(topicOutDir, "examples.json"), examplesJson);
      if (lessons.length > 0) {
        writeFileSync(join(topicOutDir, "lessons.json"), lessonsJson);
      }
    }

    const bundleBytes = manifestJson.length + problemsJson.length + examplesJson.length + (lessons.length > 0 ? lessonsJson.length : 0);
    totalBytes += bundleBytes;
    totalProblems += problems.length;
    totalExamples += examples.length;
    totalLessons += lessons.length;
    topicsProcessed++;
  }

  return { topics: topicsProcessed, problems: totalProblems, examples: totalExamples, lessons: totalLessons, bytes: totalBytes };
}

function main() {
  const { discipline, dryRun, outDir, strict } = parseArgs();
  const contentDir = getContentDir();

  console.log(`Content dir: ${contentDir}`);
  console.log(`Output dir:  ${outDir}`);
  console.log(`Mode: ${strict ? "strict" : "lenient"}`);
  if (dryRun) console.log("(dry run — no files written)");
  console.log();

  // Discover disciplines
  const disciplines: string[] = [];
  if (discipline) {
    disciplines.push(discipline);
  } else {
    for (const entry of readdirSync(contentDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(contentDir, entry.name, "graph.json"))) {
        disciplines.push(entry.name);
      }
    }
  }

  let grandTotalTopics = 0;
  let grandTotalProblems = 0;
  let grandTotalExamples = 0;
  let grandTotalLessons = 0;
  let grandTotalBytes = 0;

  for (const disc of disciplines) {
    console.log(`--- ${disc} ---`);
    const stats = processDiscipline(contentDir, disc, outDir, dryRun);
    console.log(`  Topics: ${stats.topics}, Problems: ${stats.problems}, Examples: ${stats.examples}, Lessons: ${stats.lessons}, Size: ${(stats.bytes / 1024).toFixed(0)} KB`);
    grandTotalTopics += stats.topics;
    grandTotalProblems += stats.problems;
    grandTotalExamples += stats.examples;
    grandTotalLessons += stats.lessons;
    grandTotalBytes += stats.bytes;
  }

  console.log();
  console.log("=== Summary ===");
  console.log(`Disciplines: ${disciplines.length}`);
  console.log(`Topics:      ${grandTotalTopics}`);
  console.log(`Problems:    ${grandTotalProblems}`);
  console.log(`Examples:    ${grandTotalExamples}`);
  console.log(`Lessons:     ${grandTotalLessons}`);
  console.log(`Total size:  ${(grandTotalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (totalDefaultsApplied > 0) {
    console.log(`\nDefaults applied: ${totalDefaultsApplied} (use --lenient to suppress warnings)`);
    if (strict) {
      console.error(`\nERROR: ${totalDefaultsApplied} dimension defaults were applied in strict mode.`);
      console.error("Run validate-content --strict to identify missing fields, then backfill before bundling.");
      process.exit(1);
    }
  } else {
    console.log("Defaults applied: 0 — all content is fully specified");
  }
}

main();
