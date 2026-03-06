/**
 * Rewrite platform-incompatible content using LLM.
 * Scans examples and problems for physical/verbal instructions
 * and rewrites them as screen-native interactions.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx tools/rewrite-content.ts [subject] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const subject = process.argv.find((a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1]) ?? "math-k5";
const dryRun = process.argv.includes("--dry-run");

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY && !dryRun) {
  console.error("Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

async function callLLM(prompt: string, system: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0].message.content;
}

const INCOMPATIBLE_PATTERNS = [
  /\byou\b.*\b(point to|point at)\b/i,
  /\b(touch|tap) (each|the|your|every)\b/i,
  /\bhold up (your |)finger/i,
  /\bon your (other |)hand\b/i,
  /\bhold up.*hand/i,
  /\b(say|read) (it |the |this |them |)(aloud|out loud)\b/i,
  /\b(draw|sketch) (a |the |on |it |an )\b/i,
  /\buse your (hands|fingers|body)\b/i,
  /\bplace your finger\b/i,
  /\bcut (out|the|along)\b/i,
  /\b(can you |)fold (the |it |along|this)/i,
];

function hasIncompatibleContent(text: string): boolean {
  return INCOMPATIBLE_PATTERNS.some((p) => p.test(text));
}

function exampleNeedsRewrite(example: any): boolean {
  for (const step of example.steps ?? []) {
    if (hasIncompatibleContent(step.instruction ?? "")) return true;
    if (hasIncompatibleContent(step.work ?? "")) return true;
  }
  return false;
}

function problemNeedsRewrite(problem: any): boolean {
  if (hasIncompatibleContent(problem.question ?? "")) return true;
  for (const hint of problem.hints ?? []) {
    if (hasIncompatibleContent(hint)) return true;
  }
  if (hasIncompatibleContent(problem.solution ?? "")) return true;
  return false;
}

const REWRITE_SYSTEM = `You are an expert math educator adapting content for a digital learning platform.

Students learn on a SCREEN (phone, tablet, or computer). Interaction is visual + tap/click + text input only. No physical objects, no microphone, no camera.

Your job: rewrite instructions that assume physical actions into screen-native equivalents that preserve the pedagogical intent.

Translation guide:
- "Point to/touch each object" → "Count each [object] one by one" with highlighted sequence like ⭐(1) ⭐(2)
- "Hold up fingers" → Use visual finger/hand emoji: 🖐️ = 5, ✌️ = 2, or "Use the picture to count"
- "Draw a number line/shape" → "Look at the number line below" or describe it visually in text
- "Say aloud / read aloud" → "What comes next?" or "Read along: ..."
- "Fold the shape" → "Imagine folding..." or "If we fold this shape, both sides would match"
- "Cut out" → "Look at the shape" or "Imagine cutting along the line"

Preserve: the mathematical content, difficulty level, pedagogical scaffolding, emoji usage, and JSON structure exactly. Only change the instruction text that references physical actions.

Output valid JSON only, no markdown fences. Return the COMPLETE object with all fields preserved.`;

async function rewriteExamples() {
  const dir = join(process.cwd(), "content", subject, "examples");
  if (!existsSync(dir)) return;

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let rewritten = 0;

  for (const file of files) {
    const path = join(dir, file);
    const examples = JSON.parse(readFileSync(path, "utf-8"));
    const needsRewrite = examples.some(exampleNeedsRewrite);

    if (!needsRewrite) continue;

    console.log(`Rewriting examples: ${file}`);

    if (dryRun) {
      for (const ex of examples) {
        if (exampleNeedsRewrite(ex)) {
          for (const step of ex.steps) {
            if (hasIncompatibleContent(step.instruction) || hasIncompatibleContent(step.work)) {
              console.log(`  ${ex.id} step "${step.subgoalLabel}": "${step.instruction.slice(0, 60)}..."`);
            }
          }
        }
      }
      continue;
    }

    try {
      const prompt = `Rewrite these worked examples to remove physical/verbal instructions. Keep everything else identical.

Current content:
${JSON.stringify(examples, null, 2)}

Return the full JSON array with ONLY the incompatible instructions rewritten. Preserve all ids, topicIds, visuals, explanations, and mathematical content exactly.`;

      const result = await callLLM(prompt, REWRITE_SYSTEM);
      const cleaned = result.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "");
      const rewrittenExamples = JSON.parse(cleaned);

      // Sanity check: same number of examples and steps
      if (rewrittenExamples.length !== examples.length) {
        console.error(`  Skipping ${file}: example count mismatch (${rewrittenExamples.length} vs ${examples.length})`);
        continue;
      }

      for (let i = 0; i < examples.length; i++) {
        if (rewrittenExamples[i].id !== examples[i].id) {
          console.error(`  Skipping ${file}: id mismatch at index ${i}`);
          continue;
        }
        if (rewrittenExamples[i].steps.length !== examples[i].steps.length) {
          console.error(`  Skipping ${file}: step count mismatch for ${examples[i].id}`);
          continue;
        }
      }

      writeFileSync(path, JSON.stringify(rewrittenExamples, null, 2) + "\n");
      console.log(`  Wrote ${file}`);
      rewritten++;
    } catch (err) {
      console.error(`  Failed: ${err}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nExamples rewritten: ${rewritten} files`);
}

async function rewriteProblems() {
  const dir = join(process.cwd(), "content", subject, "problems");
  if (!existsSync(dir)) return;

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let rewritten = 0;

  for (const file of files) {
    const path = join(dir, file);
    const problems = JSON.parse(readFileSync(path, "utf-8"));
    const needsRewrite = problems.some(problemNeedsRewrite);

    if (!needsRewrite) continue;

    console.log(`Rewriting problems: ${file}`);

    if (dryRun) {
      for (const p of problems) {
        if (problemNeedsRewrite(p)) {
          console.log(`  ${p.id}: question/hints/solution has incompatible content`);
        }
      }
      continue;
    }

    try {
      const prompt = `Rewrite these practice problems to remove physical/verbal instructions from questions, hints, and solutions. Keep everything else identical — same answers, same difficulty, same ids.

Current content:
${JSON.stringify(problems, null, 2)}

Return the full JSON array with ONLY the incompatible text rewritten.`;

      const result = await callLLM(prompt, REWRITE_SYSTEM);
      const cleaned = result.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "");
      const rewrittenProblems = JSON.parse(cleaned);

      if (rewrittenProblems.length !== problems.length) {
        console.error(`  Skipping ${file}: problem count mismatch`);
        continue;
      }

      for (let i = 0; i < problems.length; i++) {
        if (rewrittenProblems[i].id !== problems[i].id) {
          console.error(`  Skipping ${file}: id mismatch at index ${i}`);
          continue;
        }
        if (rewrittenProblems[i].answer !== problems[i].answer) {
          console.error(`  Skipping ${file}: answer changed for ${problems[i].id} ("${problems[i].answer}" → "${rewrittenProblems[i].answer}")`);
          continue;
        }
      }

      writeFileSync(path, JSON.stringify(rewrittenProblems, null, 2) + "\n");
      console.log(`  Wrote ${file}`);
      rewritten++;
    } catch (err) {
      console.error(`  Failed: ${err}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nProblems rewritten: ${rewritten} files`);
}

async function main() {
  console.log(`Rewriting platform-incompatible content in content/${subject}/`);
  if (dryRun) console.log("(DRY RUN — no files will be modified)\n");

  await rewriteExamples();
  await rewriteProblems();

  console.log("\nDone. Run 'npx tsx tools/validate-content.ts' to verify.");
}

main().catch(console.error);
