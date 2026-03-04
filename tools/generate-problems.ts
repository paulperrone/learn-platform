/**
 * LLM-assisted problem bank generation.
 * Generates 5-10 problems per topic at multiple difficulty levels.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx tools/generate-problems.ts [subject]
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
      temperature: 0.5,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0].message.content;
}

async function generateProblems() {
  const graphPath = join(process.cwd(), "content", subject, "graph.json");
  if (!existsSync(graphPath)) {
    console.error(`graph.json not found at ${graphPath}`);
    process.exit(1);
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const outDir = join(process.cwd(), "content", subject, "problems");
  mkdirSync(outDir, { recursive: true });

  const system = `You are an expert math educator creating practice problems for K-5 students. Output valid JSON arrays only, no markdown fences.`;

  let processed = 0;
  for (const topic of graph.topics) {
    const outPath = join(outDir, `${topic.id}.json`);
    if (existsSync(outPath)) {
      console.log(`Skipping ${topic.id} (already exists)`);
      processed++;
      continue;
    }

    console.log(`Generating problems for: ${topic.name} (${topic.id})`);

    const prompt = `Generate 5 practice problems for the topic "${topic.name}" (Grade ${topic.gradeLevel === 0 ? 'K' : topic.gradeLevel}).

Description: ${topic.description}
Standard: ${topic.standardCode}

For each problem, provide:
- id: "${topic.id}-p{n}" where n is 1-5
- topicId: "${topic.id}"
- difficulty: "easy", "medium", or "hard" (mix: 2 easy, 2 medium, 1 hard)
- question: clear, age-appropriate question text
- answer: the correct answer (as a string)
- hints: array of 1-2 progressive hints
- solution: step-by-step solution explanation

Guidelines:
- Use simple, clear language appropriate for the grade level
- For K-2: use emoji/objects for counting, keep numbers small
- For 3-5: use word problems, real-world contexts
- Each problem should test a slightly different aspect of the skill
- Hints should guide without giving away the answer

Output as a JSON array of problem objects.`;

    try {
      const result = await callLLM(prompt, system);
      const problems = JSON.parse(result);
      writeFileSync(outPath, JSON.stringify(problems, null, 2));
      console.log(`  ✓ ${problems.length} problems → ${topic.id}.json`);
      processed++;
    } catch (err) {
      console.error(`  ✗ Failed for ${topic.id}: ${err}`);
    }

    // Rate limiting
    if (processed % 5 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nGenerated problems for ${processed}/${graph.topics.length} topics`);
}

generateProblems().catch(console.error);
