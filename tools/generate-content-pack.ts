/**
 * Generate a downloadable content pack for a subject.
 * Bundles graph, problems, and worked examples into a single versioned JSON file.
 *
 * Usage: npx tsx tools/generate-content-pack.ts [subject]
 * Default subject: math-foundations
 *
 * Output: content/[subject]/content-pack.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";

const subject = process.argv[2] || "math-foundations";
const contentDir = join(process.cwd(), "content", subject);

if (!existsSync(contentDir)) {
  console.error(`Content directory not found: ${contentDir}`);
  process.exit(1);
}

const graphPath = join(contentDir, "graph.json");
if (!existsSync(graphPath)) {
  console.error(`graph.json not found in ${contentDir}`);
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, "utf-8"));

// Load all problems
const problemsDir = join(contentDir, "problems");
const problems: Record<string, unknown[]> = {};
let totalProblems = 0;
if (existsSync(problemsDir)) {
  for (const file of readdirSync(problemsDir).filter((f) => f.endsWith(".json"))) {
    const topicId = basename(file, ".json");
    const data = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
    problems[topicId] = data;
    totalProblems += data.length;
  }
}

// Load all worked examples
const examplesDir = join(contentDir, "examples");
const examples: Record<string, unknown[]> = {};
let totalExamples = 0;
if (existsSync(examplesDir)) {
  for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
    const topicId = basename(file, ".json");
    const data = JSON.parse(readFileSync(join(examplesDir, file), "utf-8"));
    examples[topicId] = data;
    totalExamples += data.length;
  }
}

const pack = {
  meta: {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    subject: {
      id: graph.subjectId,
      name: graph.subjectName,
      description: graph.description,
      gradeRange: graph.gradeRange,
    },
    counts: {
      topics: graph.topics.length,
      problems: totalProblems,
      workedExamples: totalExamples,
      prerequisites: graph.prerequisites.length,
      encompassings: (graph.encompassings || []).length,
    },
    license: {
      type: "CC-BY-4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Learn Platform (https://github.com/paulperrone/learn-platform)",
    },
  },
  graph: {
    topics: graph.topics,
    prerequisites: graph.prerequisites,
    encompassings: graph.encompassings || [],
  },
  problems,
  workedExamples: examples,
};

const outPath = join(contentDir, "content-pack.json");
writeFileSync(outPath, JSON.stringify(pack, null, 2));

const sizeKB = Math.round(readFileSync(outPath).length / 1024);
console.log(`Content pack generated: ${outPath}`);
console.log(`  Subject: ${graph.subjectName}`);
console.log(`  Topics: ${graph.topics.length}`);
console.log(`  Problems: ${totalProblems}`);
console.log(`  Worked Examples: ${totalExamples}`);
console.log(`  Prerequisites: ${graph.prerequisites.length}`);
console.log(`  Encompassings: ${(graph.encompassings || []).length}`);
console.log(`  Size: ${sizeKB} KB`);
