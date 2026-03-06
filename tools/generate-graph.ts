/**
 * LLM-assisted graph construction tool.
 * Decomposes Common Core standards into atomic topics with prerequisites.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx tools/generate-graph.ts [subject]
 *
 * This generates a draft graph.json that should be reviewed before import.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error("Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

const subject = process.argv[2] ?? "math-foundations";

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
      max_tokens: 8192,
      temperature: 0.2,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.choices[0].message.content;
}

async function generateGraph() {
  console.log(`Generating knowledge graph for: ${subject}`);

  const system = `You are an expert curriculum designer creating a knowledge graph for a mastery-based learning platform. Output valid JSON only, no markdown fences.`;

  const prompt = `Generate a knowledge graph for elementary mathematics (K-5), aligned to Common Core State Standards.

For each topic, provide:
- id: kebab-case unique identifier
- name: human-readable name
- description: 1-2 sentences describing what the student learns
- gradeLevel: 0 for K, 1-5 for grades 1-5
- standardCode: Common Core standard code (e.g., "K.CC.4", "3.NF.1")

For prerequisites, specify which topics must be mastered before another can be started:
- from: prerequisite topic id
- to: dependent topic id
- strength: 0.0-1.0 (1.0 = essential, 0.5 = helpful)

For encompassings (FIRe: practicing a parent topic implicitly practices children):
- parent: the more advanced topic id
- child: the simpler topic id it encompasses
- weight: 0.0-1.0 (how much practicing parent helps child retention)

Target ~70-80 topics covering:
- Counting & Cardinality (K)
- Operations & Algebraic Thinking (K-5)
- Number & Operations in Base Ten (K-5)
- Number & Operations - Fractions (3-5)
- Measurement & Data (K-5)
- Geometry (K-5)

Output as JSON with this structure:
{
  "subjectId": "${subject}",
  "subjectName": "Foundational Mathematics",
  "description": "...",
  "gradeRange": "K-5",
  "topics": [...],
  "prerequisites": [...],
  "encompassings": [...]
}`;

  const result = await callLLM(prompt, system);

  // Parse and validate
  const graph = JSON.parse(result);
  console.log(`Generated ${graph.topics.length} topics, ${graph.prerequisites.length} edges`);

  // Basic validation
  const topicIds = new Set(graph.topics.map((t: any) => t.id));
  let invalidEdges = 0;
  for (const p of graph.prerequisites) {
    if (!topicIds.has(p.from) || !topicIds.has(p.to)) {
      console.warn(`  Invalid edge: ${p.from} → ${p.to}`);
      invalidEdges++;
    }
  }
  if (invalidEdges > 0) {
    console.warn(`${invalidEdges} edges reference unknown topics`);
  }

  // Write output
  const outDir = join(process.cwd(), "content", subject);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "graph-generated.json");
  writeFileSync(outPath, JSON.stringify(graph, null, 2));
  console.log(`Written to: ${outPath}`);
  console.log("Review and rename to graph.json when validated.");
}

generateGraph().catch(console.error);
