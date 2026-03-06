/**
 * LLM-assisted worked example generation.
 * Creates step-by-step worked examples with subgoal labels.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx tools/generate-examples.ts [subject]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error("Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

const subject = process.argv[2] ?? "math-k5";

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
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0].message.content;
}

async function generateExamples() {
  const graphPath = join(process.cwd(), "content", subject, "graph.json");
  if (!existsSync(graphPath)) {
    console.error(`graph.json not found at ${graphPath}`);
    process.exit(1);
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const outDir = join(process.cwd(), "content", subject, "examples");
  mkdirSync(outDir, { recursive: true });

  const system = `You are an expert math educator creating worked examples for K-5 students. Output valid JSON arrays only, no markdown fences.`;

  let processed = 0;
  for (const topic of graph.topics) {
    const outPath = join(outDir, `${topic.id}.json`);
    if (existsSync(outPath)) {
      console.log(`Skipping ${topic.id} (already exists)`);
      processed++;
      continue;
    }

    console.log(`Generating examples for: ${topic.name} (${topic.id})`);

    const prompt = `Generate 2 worked examples for the topic "${topic.name}" (Grade ${topic.gradeLevel === 0 ? 'K' : topic.gradeLevel}).

Description: ${topic.description}
Standard: ${topic.standardCode}

For each worked example, provide:
- id: "${topic.id}-ex{n}" where n is 1-2
- topicId: "${topic.id}"
- title: descriptive title for the example
- steps: array of step objects, each with:
  - subgoalLabel: short label for this step's purpose (e.g., "Set up the equation", "Simplify")
  - instruction: what the student should do or understand
  - work: the actual mathematical work shown
  - explanation: why this step works (for self-explanation prompts)

Guidelines:
- Use language appropriate for the grade level
- 2-4 steps per example
- Each step should have a clear subgoal label (research shows this aids learning)
- Explanations should highlight WHY, not just WHAT
- Second example should demonstrate a slightly different case or strategy
- For K-2: use concrete objects and visuals (emoji, number lines, arrays of objects on screen)
- For 3-5: bridge concrete to abstract

CRITICAL — Platform medium:
Students learn on a SCREEN (phone, tablet, or computer). All interaction is visual + tap/click + text input. There are no physical manipulatives, no microphone for speaking, and no camera.

DO NOT use instructions that require: holding up fingers, touching physical objects, drawing on paper, speaking aloud, writing on a board, or using hands/body.

INSTEAD, translate those pedagogical intents into screen-native equivalents:
- "Point to each object as you count" → "Tap each star as you count" or "Count each star. Watch as we highlight them one by one: ⭐(1) ⭐(2) ⭐(3)"
- "Hold up fingers" → "Let's use a finger counter on screen: 🖐️ shows 5, ✌️ shows 2" or show a visual tally
- "Draw a number line" → "Look at the number line below" (use the visuals field for SVG number lines)
- "Say the number aloud" → "What number comes next? Type it below" or "Read along: 10, 20, 30..."
- "Sort/arrange objects" → "Drag the numbers into order" or describe the sorting visually step-by-step
- "Circle the answer" → "Which group has more? Look at the two groups below"

The goal is to preserve the SPIRIT of hands-on learning (one-to-one correspondence, counting on, grouping, spatial reasoning) using tappable objects, animated sequences shown in text, visual groupings with emoji, and interactive prompts that work on screen. Make it feel active, not passive — students should DO something on screen at each step, even if it's just "count along" with a highlighted sequence.

For K-2 especially: use large emoji, visual groupings (⭐⭐⭐ | ⭐⭐ = 3 + 2), step-by-step reveals, and number lines. Keep text minimal — the WORK field should carry the visual weight.

Output as a JSON array of worked example objects.`;

    try {
      const result = await callLLM(prompt, system);
      const examples = JSON.parse(result);
      writeFileSync(outPath, JSON.stringify(examples, null, 2));
      console.log(`  ✓ ${examples.length} examples → ${topic.id}.json`);
      processed++;
    } catch (err) {
      console.error(`  ✗ Failed for ${topic.id}: ${err}`);
    }

    // Rate limiting
    if (processed % 5 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nGenerated examples for ${processed}/${graph.topics.length} topics`);
}

generateExamples().catch(console.error);
