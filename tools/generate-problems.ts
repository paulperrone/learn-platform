/**
 * Generate procedural problems for math topics.
 * Usage: npx tsx tools/generate-problems.ts [--count N] [--seed S] [--topic TOPIC] [--verify]
 *
 * Outputs to content/<subject>/problems-generated/<topic-id>.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";
import { generatorRegistry, createRng } from "./generators/index.js";
import type { Difficulty, Problem } from "./generators/index.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 50; // per topic
  let seed = 42;
  let topic: string | null = null;
  let verify = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) { count = parseInt(args[i + 1]); i++; }
    else if (args[i] === "--seed" && args[i + 1]) { seed = parseInt(args[i + 1]); i++; }
    else if (args[i] === "--topic" && args[i + 1]) { topic = args[i + 1]; i++; }
    else if (args[i] === "--verify") { verify = true; }
  }

  return { count, seed, topic, verify };
}

function getSubjectForTopic(topicId: string): string | null {
  const contentDir = getContentDir();
  for (const dir of readdirSync(contentDir)) {
    const graphPath = join(contentDir, dir, "graph.json");
    if (!existsSync(graphPath)) continue;
    const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
    if (graph.topics.some((t: { id: string }) => t.id === topicId)) {
      return dir;
    }
  }
  return null;
}

function distributeCount(total: number): { easy: number; medium: number; hard: number } {
  // 30/40/30 distribution
  const easy = Math.round(total * 0.3);
  const hard = Math.round(total * 0.3);
  const medium = total - easy - hard;
  return { easy, medium, hard };
}

function verifyProblem(p: Problem): string[] {
  const errors: string[] = [];

  if (!p.id || !p.topicId || !p.difficulty || !p.question || !p.answer) {
    errors.push(`${p.id}: missing required fields`);
  }
  if (!p.hints || p.hints.length === 0) {
    errors.push(`${p.id}: no hints`);
  }
  if (!p.solution) {
    errors.push(`${p.id}: no solution`);
  }

  // Verify numeric answers are valid numbers where applicable
  const numAnswer = parseFloat(p.answer.replace(/[$%°,]/g, "").replace(/\s+/g, ""));
  if (!isNaN(numAnswer) && !isFinite(numAnswer)) {
    errors.push(`${p.id}: answer is not finite: ${p.answer}`);
  }

  return errors;
}

function main() {
  const { count, seed, topic, verify } = parseArgs();

  const topicIds = topic
    ? [topic]
    : [...generatorRegistry.keys()];

  if (topic && !generatorRegistry.has(topic)) {
    console.error(`No generator found for topic: ${topic}`);
    console.error(`Available generators: ${[...generatorRegistry.keys()].join(", ")}`);
    process.exit(1);
  }

  const dist = distributeCount(count);
  let totalGenerated = 0;
  let totalErrors = 0;
  const topicsBySubject = new Map<string, string[]>();

  for (const topicId of topicIds) {
    const generator = generatorRegistry.get(topicId)!;
    const subject = getSubjectForTopic(topicId);
    if (!subject) {
      console.warn(`Warning: topic ${topicId} not found in any subject graph, skipping`);
      continue;
    }

    if (!topicsBySubject.has(subject)) topicsBySubject.set(subject, []);
    topicsBySubject.get(subject)!.push(topicId);

    const problems: Problem[] = [];
    const difficulties: Difficulty[] = ["easy", "medium", "hard"];

    for (const diff of difficulties) {
      const n = dist[diff];
      for (let i = 0; i < n; i++) {
        // Unique seed per topic+difficulty+index for reproducibility
        const problemSeed = seed * 1000000 + topicId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 1000 + difficulties.indexOf(diff) * 100 + i;
        const rng = createRng(problemSeed);
        const problem = generator.generate(diff, i, rng);
        problems.push(problem);
      }
    }

    if (verify) {
      for (const p of problems) {
        const errors = verifyProblem(p);
        if (errors.length > 0) {
          errors.forEach(e => console.error(`  ERROR: ${e}`));
          totalErrors += errors.length;
        }
      }
    }

    // Write to problems-generated directory
    const outDir = join(getContentDir(), subject, "problems-generated");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${topicId}.json`);
    writeFileSync(outPath, JSON.stringify(problems, null, 2) + "\n");
    totalGenerated += problems.length;
  }

  // Summary
  console.log(`\n=== Problem Generation Complete ===`);
  console.log(`Seed: ${seed}`);
  console.log(`Count per topic: ${count} (${dist.easy} easy / ${dist.medium} medium / ${dist.hard} hard)`);
  console.log(`Topics with generators: ${topicIds.length}`);
  console.log(`Total problems generated: ${totalGenerated}`);
  for (const [subject, topics] of topicsBySubject) {
    console.log(`  ${subject}: ${topics.length} topics × ${count} = ${topics.length * count} problems`);
  }
  if (verify) {
    console.log(`Verification errors: ${totalErrors}`);
    if (totalErrors > 0) process.exit(1);
  }
}

main();
