/**
 * Tag existing problems with cognitive demand type.
 *
 * Rule-based classification:
 * - procedural: "compute", "solve", "what is X + Y", "find", "simplify", direct computation
 * - application: word problem framing (names, scenarios, "how many", real-world context)
 * - conceptual: "explain", "why", "show two ways", "what does X mean", properties
 * - reasoning: "without computing", "which is bigger", "compare", "estimate", "predict"
 * - error_analysis: "what went wrong", "find the mistake", "correct the error"
 *
 * Usage: npx tsx tools/tag-cognitive-demand.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { readFileSync as readGraphFile } from "fs";

type CognitiveDemand = "procedural" | "conceptual" | "application" | "reasoning" | "error_analysis";

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  question: string;
  answer: string;
  hints: string[];
  solution: string;
  cognitiveDemand?: CognitiveDemand;
  [key: string]: unknown;
};

type TopicInfo = {
  id: string;
  gradeLevel: number;
};

const PROBLEMS_DIR = join(__dirname, "../content/math-foundations/problems");
const GRAPH_PATH = join(__dirname, "../content/math-foundations/graph.json");

// Load topic grade levels
function loadTopicGrades(): Map<string, number> {
  const graph = JSON.parse(readGraphFile(GRAPH_PATH, "utf-8"));
  const map = new Map<string, number>();
  for (const t of graph.topics as TopicInfo[]) {
    map.set(t.id, t.gradeLevel);
  }
  return map;
}

// Classification patterns (checked in order — first match wins)
const ERROR_ANALYSIS_PATTERNS = [
  /what\s+(went\s+wrong|is\s+(the\s+)?(error|mistake))/i,
  /find\s+(the\s+)?(error|mistake)/i,
  /correct\s+(the\s+)?(error|mistake)/i,
  /what\s+did\s+\w+\s+do\s+wrong/i,
  /where\s+is\s+the\s+(error|mistake)/i,
  /says?\s+\d.*\.\s*what\s+(went\s+wrong|is\s+(wrong|the\s+error))/i,
];

const REASONING_PATTERNS = [
  /without\s+(computing|calculating|solving)/i,
  /which\s+is\s+(bigger|larger|smaller|greater|less)/i,
  /compare\b/i,
  /estimate\b/i,
  /predict\b/i,
  /true\s+or\s+false/i,
  /always,?\s+sometimes,?\s+or\s+never/i,
  /is\s+it\s+possible/i,
  /could\s+the\s+answer\s+be/i,
  /will\s+(the\s+)?(result|answer|sum|product|difference)\s+be/i,
  /how\s+do\s+you\s+know\s+(without|if)/i,
];

const CONCEPTUAL_PATTERNS = [
  /\bexplain\b/i,
  /\bwhy\b.*\?/i,
  /what\s+does\s+.*mean/i,
  /show\s+(two|another|a\s+different)\s+way/i,
  /what\s+property/i,
  /what\s+is\s+the\s+(rule|pattern|relationship)/i,
  /how\s+are\s+.*related/i,
  /describe\s+(the|a)\s+(pattern|relationship|connection)/i,
  /what\s+happens\s+(when|if|to)/i,
  /in\s+your\s+own\s+words/i,
];

// Application: word problems with real-world context
const APPLICATION_PATTERNS = [
  // Names followed by context (Sara has, Tom ate, etc.)
  /\b[A-Z][a-z]+\s+(has|had|ate|bought|sold|gave|earned|spent|found|picked|made|collected|saved|lost|shared|needs|wants)/i,
  // "how many" in context
  /how\s+many\s+\w+\s+(does|do|did|will|are|is|were|would)/i,
  // Real objects in quantity context
  /\b(apples?|cookies?|marbles?|stickers?|books?|pencils?|crayons?|toys?|cards?|coins?|flowers?|candies?|balls?|stars?|pizzas?|cakes?|pies?|oranges?|bananas?|dogs?|cats?|birds?|fish|blocks?|beads?|shells?|rocks?|miles?|feet|inches|gallons?|pounds?|dollars?|cents?|minutes?|hours?|days?|weeks?|months?|years?|slices?|pieces?|groups?|boxes?|bags?|cups?|liters?|meters?|pages?|tickets?|points?)\b.*\b(more|less|total|left|altogether|each|remaining|in\s+all|combined)\b/i,
  // Scenario framing
  /\b(store|garden|library|classroom|school|park|kitchen|party|zoo|farm|market|bakery|shop)\b/i,
  // "you have/get" framing
  /you\s+(have|had|get|got|earn|buy|find|start\s+with|begin\s+with)/i,
  // Money/measurement context
  /\$\d/,
  /\b\d+\s*(cm|m|km|ft|in|lb|kg|oz|ml|L|gal|mph|hr|min)\b/i,
];

function classifyProblem(problem: Problem, gradeLevel: number): CognitiveDemand {
  const q = problem.question;

  // Check error_analysis first (most specific)
  for (const pat of ERROR_ANALYSIS_PATTERNS) {
    if (pat.test(q)) return "error_analysis";
  }

  // Check reasoning
  for (const pat of REASONING_PATTERNS) {
    if (pat.test(q)) return "reasoning";
  }

  // Check conceptual
  for (const pat of CONCEPTUAL_PATTERNS) {
    if (pat.test(q)) return "conceptual";
  }

  // Check application (word problems)
  for (const pat of APPLICATION_PATTERNS) {
    if (pat.test(q)) return "application";
  }

  // Default: procedural
  return "procedural";
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const topicGrades = loadTopicGrades();
  const files = readdirSync(PROBLEMS_DIR).filter((f) => f.endsWith(".json"));

  const stats: Record<CognitiveDemand, number> = {
    procedural: 0,
    application: 0,
    conceptual: 0,
    reasoning: 0,
    error_analysis: 0,
  };

  // Grade-level × demand breakdown
  const gradeStats: Record<number, Record<CognitiveDemand, number>> = {};

  let totalProblems = 0;
  let filesModified = 0;

  for (const file of files) {
    const filePath = join(PROBLEMS_DIR, file);
    const problems: Problem[] = JSON.parse(readFileSync(filePath, "utf-8"));
    let modified = false;

    for (const p of problems) {
      const grade = topicGrades.get(p.topicId) ?? 0;
      const demand = classifyProblem(p, grade);

      if (p.cognitiveDemand !== demand) {
        p.cognitiveDemand = demand;
        modified = true;
      }

      stats[demand]++;
      totalProblems++;

      if (!gradeStats[grade]) {
        gradeStats[grade] = { procedural: 0, application: 0, conceptual: 0, reasoning: 0, error_analysis: 0 };
      }
      gradeStats[grade][demand]++;
    }

    if (modified && !dryRun) {
      writeFileSync(filePath, JSON.stringify(problems, null, 2) + "\n");
      filesModified++;
    } else if (modified) {
      filesModified++;
    }
  }

  console.log(`\n=== Cognitive Demand Tagging Results ===\n`);
  console.log(`Total problems: ${totalProblems}`);
  console.log(`Files modified: ${filesModified}/${files.length}`);
  console.log(dryRun ? "(DRY RUN — no files written)\n" : "\n");

  console.log("Overall distribution:");
  for (const [demand, count] of Object.entries(stats)) {
    const pct = ((count / totalProblems) * 100).toFixed(1);
    console.log(`  ${demand.padEnd(16)} ${String(count).padStart(4)}  (${pct}%)`);
  }

  console.log("\nBy grade level:");
  for (const grade of Object.keys(gradeStats).map(Number).sort()) {
    const gs = gradeStats[grade];
    const total = Object.values(gs).reduce((a, b) => a + b, 0);
    const parts = Object.entries(gs)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    console.log(`  G${grade} (${total} problems): ${parts}`);
  }
}

main();
