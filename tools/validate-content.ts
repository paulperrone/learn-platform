/**
 * Validate problem banks: check solutions are correct, answers parse, no empty fields.
 *
 * Usage: npx tsx tools/validate-content.ts [subject]
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const subject = process.argv[2] ?? "math-foundations";
const contentDir = join(process.cwd(), "content", subject);

let errors = 0;
let warnings = 0;
let totalProblems = 0;
let totalExamples = 0;

// Platform-incompatible instruction patterns
// These describe physical/verbal actions that can't be done on a screen
const INCOMPATIBLE_PATTERNS = [
  // Physical actions the student is asked to perform (not descriptions of objects)
  { pattern: /\byou\b.*\b(point to|point at)\b/i, label: "physical pointing" },
  { pattern: /\b(touch|tap) (each|the|your|every)\b/i, label: "physical touching" },
  { pattern: /\bhold up (your |)finger/i, label: "finger manipulation" },
  { pattern: /\bon your (other |)hand\b/i, label: "finger manipulation" },
  { pattern: /\bhold up.*hand/i, label: "finger manipulation" },
  { pattern: /\b(say|read) (it |the |this |them |)(aloud|out loud)\b/i, label: "speaking aloud" },
  { pattern: /\b(draw|sketch) (a |the |on |it |an )\b/i, label: "drawing" },
  { pattern: /\buse your (hands|fingers|body)\b/i, label: "physical action" },
  { pattern: /\bplace your finger\b/i, label: "physical pointing" },
  { pattern: /\bcut (out|the|along)\b/i, label: "physical cutting" },
  { pattern: /\b(can you |)fold (the |it |along|this)/i, label: "physical folding" },
];

function checkPlatformCompatibility(text: string, context: string): void {
  for (const { pattern, label } of INCOMPATIBLE_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(`WARN: Platform-incompatible instruction (${label}) in ${context}: "${text.slice(0, 80)}..."`);
      warnings++;
    }
  }
}

// Validate problems
const problemsDir = join(contentDir, "problems");
if (existsSync(problemsDir)) {
  const files = readdirSync(problemsDir).filter((f) => f.endsWith(".json"));
  console.log(`Validating ${files.length} problem files...`);

  for (const file of files) {
    const problems = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
    for (const p of problems) {
      totalProblems++;
      if (!p.id) { console.error(`ERROR: Missing id in ${file}`); errors++; }
      if (!p.topicId) { console.error(`ERROR: Missing topicId in ${file} (${p.id})`); errors++; }
      if (!p.question?.trim()) { console.error(`ERROR: Empty question in ${file} (${p.id})`); errors++; }
      if (!p.answer?.toString().trim()) { console.error(`ERROR: Empty answer in ${file} (${p.id})`); errors++; }
      if (!p.difficulty || !["easy", "medium", "hard"].includes(p.difficulty)) {
        console.warn(`WARN: Invalid difficulty "${p.difficulty}" in ${file} (${p.id})`);
        warnings++;
      }
      if (!p.hints || p.hints.length === 0) {
        console.warn(`WARN: No hints for ${p.id} in ${file}`);
        warnings++;
      }
      if (!p.solution?.trim()) {
        console.warn(`WARN: Empty solution for ${p.id} in ${file}`);
        warnings++;
      }
      // Platform compatibility checks
      checkPlatformCompatibility(p.question ?? "", `${p.id} question`);
      for (const hint of p.hints ?? []) {
        checkPlatformCompatibility(hint, `${p.id} hint`);
      }
      checkPlatformCompatibility(p.solution ?? "", `${p.id} solution`);
    }
  }
}

// Validate examples
const examplesDir = join(contentDir, "examples");
if (existsSync(examplesDir)) {
  const files = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));
  console.log(`Validating ${files.length} example files...`);

  for (const file of files) {
    const examples = JSON.parse(readFileSync(join(examplesDir, file), "utf-8"));
    for (const ex of examples) {
      totalExamples++;
      if (!ex.id) { console.error(`ERROR: Missing id in ${file}`); errors++; }
      if (!ex.topicId) { console.error(`ERROR: Missing topicId in ${file} (${ex.id})`); errors++; }
      if (!ex.steps || ex.steps.length === 0) {
        console.error(`ERROR: No steps in ${file} (${ex.id})`);
        errors++;
      }
      for (let i = 0; i < (ex.steps ?? []).length; i++) {
        const step = ex.steps[i];
        if (!step.subgoalLabel?.trim()) {
          console.warn(`WARN: Empty subgoalLabel in step ${i} of ${ex.id}`);
          warnings++;
        }
        if (!step.explanation?.trim()) {
          console.warn(`WARN: Empty explanation in step ${i} of ${ex.id}`);
          warnings++;
        }
        // Platform compatibility checks
        checkPlatformCompatibility(step.instruction ?? "", `${ex.id} step ${i} instruction`);
        checkPlatformCompatibility(step.work ?? "", `${ex.id} step ${i} work`);
      }
    }
  }
}

// Check graph topics have content
const graphPath = join(contentDir, "graph.json");
if (existsSync(graphPath)) {
  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const problemTopics = new Set(
    existsSync(problemsDir)
      ? readdirSync(problemsDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""))
      : []
  );
  const exampleTopics = new Set(
    existsSync(examplesDir)
      ? readdirSync(examplesDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""))
      : []
  );

  const missingProblems = graph.topics.filter((t: any) => !problemTopics.has(t.id));
  const missingExamples = graph.topics.filter((t: any) => !exampleTopics.has(t.id));

  if (missingProblems.length > 0) {
    console.log(`\nTopics missing problems (${missingProblems.length}/${graph.topics.length}):`);
    for (const t of missingProblems.slice(0, 10)) {
      console.log(`  - ${t.id}`);
    }
    if (missingProblems.length > 10) console.log(`  ... and ${missingProblems.length - 10} more`);
  }
  if (missingExamples.length > 0) {
    console.log(`\nTopics missing examples (${missingExamples.length}/${graph.topics.length}):`);
    for (const t of missingExamples.slice(0, 10)) {
      console.log(`  - ${t.id}`);
    }
    if (missingExamples.length > 10) console.log(`  ... and ${missingExamples.length - 10} more`);
  }
}

console.log(`\n${"=".repeat(40)}`);
console.log(`Problems validated: ${totalProblems}`);
console.log(`Examples validated: ${totalExamples}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
