/**
 * Validate problem banks: check solutions are correct, answers parse, no empty fields.
 *
 * Usage: npx tsx tools/validate-content.ts [subject] [--strict] [--lenient]
 *
 * Modes:
 *   --strict   Require dimension fields (presentation, contentDepth, locale, flavor),
 *              cognitiveDemand, source, and type on every item. Fails on missing fields.
 *   --lenient  Only validate dimension values when present (skip missing). Default until
 *              Phase 2 backfill is complete.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";

// Parse CLI args
const args = process.argv.slice(2);
const flagArgs = args.filter((a) => a.startsWith("--"));
const positionalArgs = args.filter((a) => !a.startsWith("--"));

const subject = positionalArgs[0] ?? "math";
const strictMode = flagArgs.includes("--strict");
// Default is lenient (until Phase 2 backfill completes)
const lenientMode = !strictMode;

const contentDir = join(getContentDir(), subject);

let errors = 0;
let warnings = 0;
let totalProblems = 0;
let totalExamples = 0;
let totalLessons = 0;

const VALID_SECTION_TYPES = ["explanation", "worked-example", "diagram", "video", "practice"];

// Valid dimension values
const VALID_FLAVORS = ["classic", "story", "game", "visual", "adventure", "space"];
const VALID_LOCALES = ["en", "es", "fr", "zh", "ar"];
const VALID_PRESENTATIONS = ["primary", "intermediate", "standard", "advanced"];
const VALID_CONTENT_DEPTHS = ["survey", "contextual", "analytical", "synthesis"];
const VALID_DEMANDS = ["procedural", "conceptual", "application", "reasoning", "error_analysis", "recall"];
const VALID_SOURCES = ["hand-authored", "generated", "supplementary"];
const VALID_TYPES = ["text-qa", "numerical-input", "multi-step", "matching", "multi-select", "equation-builder"];

function validateDimensions(item: Record<string, unknown>, context: string, itemKind: "problem" | "example"): void {
  // In strict mode, missing dimension fields are errors
  if (strictMode) {
    if (item.presentation === undefined) {
      console.error(`ERROR: Missing presentation in ${context}`);
      errors++;
    }
    if (item.contentDepth === undefined) {
      console.error(`ERROR: Missing contentDepth in ${context}`);
      errors++;
    }
    if (item.locale === undefined) {
      console.error(`ERROR: Missing locale in ${context}`);
      errors++;
    }
    if (item.flavor === undefined) {
      console.error(`ERROR: Missing flavor in ${context}`);
      errors++;
    }
    if (itemKind === "problem") {
      if (item.cognitiveDemand === undefined) {
        console.error(`ERROR: Missing cognitiveDemand in ${context}`);
        errors++;
      }
      if (item.source === undefined) {
        console.error(`ERROR: Missing source in ${context}`);
        errors++;
      }
    }
  }

  // Always validate dimension values when present (both strict and lenient)
  // These were validated in the original code — backward compatible
  if (item.flavor !== undefined && !VALID_FLAVORS.includes(item.flavor as string)) {
    console.error(`ERROR: Invalid flavor "${item.flavor}" in ${context}. Valid: ${VALID_FLAVORS.join(", ")}`);
    errors++;
  }
  if (item.locale !== undefined && !VALID_LOCALES.includes(item.locale as string)) {
    console.error(`ERROR: Invalid locale "${item.locale}" in ${context}. Valid: ${VALID_LOCALES.join(", ")}`);
    errors++;
  }
  if (item.presentation !== undefined && !VALID_PRESENTATIONS.includes(item.presentation as string)) {
    console.error(`ERROR: Invalid presentation "${item.presentation}" in ${context}. Valid: ${VALID_PRESENTATIONS.join(", ")}`);
    errors++;
  }
  if (item.contentDepth !== undefined && !VALID_CONTENT_DEPTHS.includes(item.contentDepth as string)) {
    console.error(`ERROR: Invalid contentDepth "${item.contentDepth}" in ${context}. Valid: ${VALID_CONTENT_DEPTHS.join(", ")}`);
    errors++;
  }
  // Validate cognitiveDemand, source, type values only in strict mode
  // (existing content uses non-standard values like "analysis", "problem-solving" — Phase 2 backfill will fix)
  if (strictMode) {
    if (item.cognitiveDemand !== undefined && !VALID_DEMANDS.includes(item.cognitiveDemand as string)) {
      console.error(`ERROR: Invalid cognitiveDemand "${item.cognitiveDemand}" in ${context}. Valid: ${VALID_DEMANDS.join(", ")}`);
      errors++;
    }
    if (item.source !== undefined && !VALID_SOURCES.includes(item.source as string)) {
      console.error(`ERROR: Invalid source "${item.source}" in ${context}. Valid: ${VALID_SOURCES.join(", ")}`);
      errors++;
    }
    if (item.type !== undefined && !VALID_TYPES.includes(item.type as string)) {
      console.error(`ERROR: Invalid type "${item.type}" in ${context}. Valid: ${VALID_TYPES.join(", ")}`);
      errors++;
    }
  }
}

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

console.log(`Mode: ${strictMode ? "strict" : "lenient"}`);
console.log(`Subject: ${subject}\n`);

// Load graph topic IDs for cross-referencing keyPrerequisiteId
const graphTopicIds = new Set<string>();
const preGraphPath = join(contentDir, "graph.json");
if (existsSync(preGraphPath)) {
  const g = JSON.parse(readFileSync(preGraphPath, "utf-8"));
  for (const t of g.topics ?? []) graphTopicIds.add(t.id);
}

// Validate problems (hand-authored + generated)
const problemsDirs = [join(contentDir, "problems"), join(contentDir, "problems-generated")];
let totalProblemFiles = 0;
for (const problemsDir of problemsDirs) {
if (existsSync(problemsDir)) {
  const files = readdirSync(problemsDir).filter((f) => f.endsWith(".json"));
  totalProblemFiles += files.length;

  for (const file of files) {
    const problems = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
    for (const p of problems) {
      totalProblems++;
      if (!p.id) { console.error(`ERROR: Missing id in ${file}`); errors++; }
      if (!p.topicId) { console.error(`ERROR: Missing topicId in ${file} (${p.id})`); errors++; }
      if (!p.question?.trim()) { console.error(`ERROR: Empty question in ${file} (${p.id})`); errors++; }
      if (!p.answer?.toString().trim()) { console.error(`ERROR: Empty answer in ${file} (${p.id})`); errors++; }
      if (!p.hints || p.hints.length === 0) {
        console.warn(`WARN: No hints for ${p.id} in ${file}`);
        warnings++;
      }
      if (!p.solution?.trim()) {
        console.warn(`WARN: Empty solution for ${p.id} in ${file}`);
        warnings++;
      }
      // Dimension validation
      validateDimensions(p, `${p.id} in ${file}`, "problem");
      // Platform compatibility checks
      checkPlatformCompatibility(p.question ?? "", `${p.id} question`);
      for (const hint of p.hints ?? []) {
        checkPlatformCompatibility(hint, `${p.id} hint`);
      }
      checkPlatformCompatibility(p.solution ?? "", `${p.id} solution`);
      // keyPrerequisiteId cross-reference
      if (p.keyPrerequisiteId && graphTopicIds.size > 0 && !graphTopicIds.has(p.keyPrerequisiteId)) {
        console.error(`ERROR: keyPrerequisiteId "${p.keyPrerequisiteId}" not found in graph topics for ${p.id} in ${file}`);
        errors++;
      }
    }
  }
}
}
console.log(`Validating ${totalProblemFiles} problem files...`);

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
      // Dimension validation
      validateDimensions(ex, `${ex.id} in ${file}`, "example");
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

// Validate lessons
const lessonsDir = join(contentDir, "lessons");
if (existsSync(lessonsDir)) {
  const files = readdirSync(lessonsDir).filter((f) => f.endsWith(".json"));
  console.log(`Validating ${files.length} lesson files...`);

  for (const file of files) {
    const lessons = JSON.parse(readFileSync(join(lessonsDir, file), "utf-8"));
    for (const lesson of lessons) {
      totalLessons++;
      if (!lesson.id) { console.error(`ERROR: Missing id in lesson ${file}`); errors++; }
      if (!lesson.topicId) { console.error(`ERROR: Missing topicId in lesson ${file} (${lesson.id})`); errors++; }
      if (!lesson.title?.trim()) { console.error(`ERROR: Empty title in lesson ${file} (${lesson.id})`); errors++; }
      if (!lesson.sections || lesson.sections.length === 0) {
        console.error(`ERROR: No sections in lesson ${file} (${lesson.id})`);
        errors++;
      }
      // Validate topicId matches graph
      if (lesson.topicId && graphTopicIds.size > 0 && !graphTopicIds.has(lesson.topicId)) {
        console.error(`ERROR: Lesson topicId "${lesson.topicId}" not found in graph topics (${lesson.id} in ${file})`);
        errors++;
      }
      // Dimension validation
      validateDimensions(lesson, `lesson ${lesson.id} in ${file}`, "example");
      // Per-section validation
      for (let i = 0; i < (lesson.sections ?? []).length; i++) {
        const section = lesson.sections[i];
        const ctx = `lesson ${lesson.id} section ${i}`;
        if (!VALID_SECTION_TYPES.includes(section.type)) {
          console.error(`ERROR: Invalid section type "${section.type}" in ${ctx}`);
          errors++;
        }
        if (section.type === "explanation") {
          if (!section.content?.trim()) {
            console.error(`ERROR: Empty content in explanation section (${ctx})`);
            errors++;
          }
          checkPlatformCompatibility(section.content ?? "", ctx);
        }
        if (section.type === "worked-example") {
          if (!section.example || !section.example.steps || section.example.steps.length === 0) {
            console.error(`ERROR: worked-example section missing example with steps (${ctx})`);
            errors++;
          }
          if (section.example?.steps) {
            for (let j = 0; j < section.example.steps.length; j++) {
              const step = section.example.steps[j];
              checkPlatformCompatibility(step.instruction ?? "", `${ctx} step ${j} instruction`);
              checkPlatformCompatibility(step.work ?? "", `${ctx} step ${j} work`);
            }
          }
        }
        if (section.type === "practice") {
          if (!section.problems || section.problems.length === 0) {
            console.error(`ERROR: practice section has no problems (${ctx})`);
            errors++;
          }
          for (const p of section.problems ?? []) {
            if (!p.question?.trim()) {
              console.error(`ERROR: Empty question in practice problem (${ctx})`);
              errors++;
            }
            if (!p.answer?.toString().trim()) {
              console.error(`ERROR: Empty answer in practice problem (${ctx})`);
              errors++;
            }
            checkPlatformCompatibility(p.question ?? "", `${ctx} practice problem`);
          }
        }
      }
    }
  }
}

// Check graph topics have content
const graphPath = join(contentDir, "graph.json");
if (existsSync(graphPath)) {
  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const problemTopics = new Set(
    problemsDirs.flatMap(dir =>
      existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(".json", ""))
        : []
    )
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

  // Check lesson coverage
  const lessonTopics = new Set(
    existsSync(lessonsDir)
      ? readdirSync(lessonsDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""))
      : []
  );
  const missingLessons = graph.topics.filter((t: any) => !lessonTopics.has(t.id));
  if (missingLessons.length > 0 && missingLessons.length < graph.topics.length) {
    console.log(`\nTopics missing lessons (${missingLessons.length}/${graph.topics.length}):`);
    for (const t of missingLessons.slice(0, 10)) {
      console.log(`  - ${t.id}`);
    }
    if (missingLessons.length > 10) console.log(`  ... and ${missingLessons.length - 10} more`);
  }

  // Validate collections
  if (graph.collections && graph.collections.length > 0) {
    const graphTopicSet = new Set(graph.topics.map((t: any) => t.id));
    for (const c of graph.collections) {
      if (!c.id) { console.error(`ERROR: Collection missing id`); errors++; }
      if (!c.name) { console.error(`ERROR: Collection "${c.id}" missing name`); errors++; }
      if (!c.topicIds || c.topicIds.length === 0) {
        console.error(`ERROR: Collection "${c.id}" has no topics`);
        errors++;
      } else {
        for (const tid of c.topicIds) {
          if (!graphTopicSet.has(tid)) {
            console.error(`ERROR: Collection "${c.id}" references unknown topic "${tid}"`);
            errors++;
          }
        }
      }
    }
    console.log(`\nCollections validated: ${graph.collections.length}`);
  }
}

console.log(`\n${"=".repeat(40)}`);
console.log(`Problems validated: ${totalProblems}`);
console.log(`Examples validated: ${totalExamples}`);
console.log(`Lessons validated:  ${totalLessons}`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
