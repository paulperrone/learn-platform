/**
 * Atomicity audit — LLM-based analysis of whether each topic represents
 * one independently testable, teachable, and remediable skill.
 *
 * Applies 5 split heuristics, cross-references Math Academy graph,
 * and persists structured results to docs/audits/.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx tools/atomicity-audit.ts [options]
 *
 * Options:
 *   --strand <name>     Audit only topics in this strand
 *   --topic <id>        Audit a single topic
 *   --force             Re-audit topics even if already in latest results
 *   --dry-run           Show what would be audited without calling LLM
 *   --json              Output JSON to stdout
 *   --model <id>        Override model (default: anthropic/claude-sonnet-4-6)
 *   --concurrency <n>   Parallel LLM calls (default: 3)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// --- Types ---

type HeuristicResult = {
  pass: boolean;
  reasoning: string;
};

type SplitProposal = {
  name: string;
  description: string;
  rationale: string;
};

type TopicAuditResult = {
  topicId: string;
  topicName: string;
  strand: string;
  gradeLevel: number;
  verdict: "atomic" | "should-split" | "should-merge" | "review";
  confidence: number;
  heuristics: {
    testable_in_isolation: HeuristicResult;
    distinct_cognitive_demand: HeuristicResult;
    platform_compatible: HeuristicResult;
    grade_boundary_natural: HeuristicResult;
    remediation_useful: HeuristicResult;
  };
  splitRecommendation: {
    proposedTopics: SplitProposal[];
    evidence: string;
  } | null;
  mergeRecommendation: {
    mergeWith: string;
    rationale: string;
  } | null;
  maDensityNote: string | null;
  notes: string;
  fingerprint: string;
};

type AuditResult = {
  metadata: {
    timestamp: string;
    model: string;
    discipline: string;
    topicCount: number;
    auditedCount: number;
    skippedCount: number;
    totalTokensUsed: number;
    estimatedCostUsd: number;
  };
  summary: {
    atomic: number;
    shouldSplit: number;
    shouldMerge: number;
    review: number;
    heuristicFailRates: Record<string, number>;
    averageConfidence: number;
  };
  maDensityComparison: {
    ourTopicsPerStrand: Record<string, number>;
    maMatchedTopics: number;
    maUnmatchedTopics: number;
  };
  topics: Record<string, TopicAuditResult>;
};

type GraphTopic = {
  id: string;
  name: string;
  description: string;
  gradeLevel: number;
  strand: string;
  standardCode?: string;
  contentDepth?: string;
  defaultPresentation?: string;
};

type Graph = {
  disciplineId: string;
  name: string;
  topics: GraphTopic[];
  prerequisites: { from: string; to: string; type: string }[];
  encompassings: { parent: string; child: string; weight: number }[];
};

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  question: string;
  answer: string;
  cognitiveDemand?: string;
};

type MANode = {
  id: number;
  name: string;
  live: number;
  depth: number;
  courses: { course_name: string; unit_name: string }[];
};

type MAGraph = {
  nodes: MANode[];
  edges: { from: number; to: number }[];
};

// --- Argument parsing ---

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const strandFilter = getArg("--strand");
const topicFilter = getArg("--topic");
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const jsonOutput = args.includes("--json");
const modelOverride = getArg("--model");
const concurrency = parseInt(getArg("--concurrency") ?? "3", 10);
const discipline = args.find(a => !a.startsWith("-") && a !== getArg("--strand") && a !== getArg("--topic") && a !== getArg("--model") && a !== getArg("--concurrency")) ?? "math";

const MODEL = modelOverride ?? "anthropic/claude-sonnet-4-6";
const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY && !dryRun) {
  console.error("Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

// --- Load content ---

const contentDir = join(process.cwd(), "content", discipline);
if (!existsSync(contentDir)) {
  console.error(`Content directory not found: ${contentDir}`);
  process.exit(1);
}

const graph: Graph = JSON.parse(readFileSync(join(contentDir, "graph.json"), "utf-8"));

const problemsByTopic = new Map<string, Problem[]>();
for (const dir of [join(contentDir, "problems"), join(contentDir, "problems-generated")]) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const problems: Problem[] = JSON.parse(readFileSync(join(dir, file), "utf-8"));
    for (const p of problems) {
      if (!problemsByTopic.has(p.topicId)) problemsByTopic.set(p.topicId, []);
      problemsByTopic.get(p.topicId)!.push(p);
    }
  }
}

// --- Load MA graph (optional) ---

const maGraphPath = resolve(process.env.HOME ?? "~", "source/mathacademy-graph/export/graph.json");
let maGraph: MAGraph | null = null;
let maNodesByName = new Map<string, MANode>();

if (existsSync(maGraphPath)) {
  maGraph = JSON.parse(readFileSync(maGraphPath, "utf-8"));
  for (const node of maGraph!.nodes) {
    maNodesByName.set(node.name.toLowerCase(), node);
  }
  if (!jsonOutput) console.log(`Loaded MA graph: ${maGraph!.nodes.length} topics`);
} else {
  if (!jsonOutput) console.log("MA graph not found, skipping cross-reference");
}

// --- Load previous audit (for incremental) ---

const auditsDir = join(process.cwd(), "docs", "audits");
mkdirSync(auditsDir, { recursive: true });
const latestPath = join(auditsDir, "atomicity-latest.json");
let previousAudit: AuditResult | null = null;

if (existsSync(latestPath) && !force) {
  previousAudit = JSON.parse(readFileSync(latestPath, "utf-8"));
  if (!jsonOutput) console.log(`Loaded previous audit: ${Object.keys(previousAudit!.topics).length} topics`);
}

// --- MA fuzzy matching ---

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1 && !["and", "the", "of", "by", "in", "a", "to", "for", "with", "on", "an", "is", "as", "or"].includes(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function findMAMatches(topicName: string, limit = 3): { name: string; depth: number; courses: string[]; similarity: number }[] {
  if (!maGraph) return [];
  const tokens = tokenize(topicName);
  const scored = maGraph.nodes
    .map(node => ({
      name: node.name,
      depth: node.depth,
      courses: [...new Set(node.courses.map(c => c.course_name))],
      similarity: jaccardSimilarity(tokens, tokenize(node.name)),
    }))
    .filter(m => m.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return scored;
}

// --- Fingerprinting (for incremental) ---

function fingerprint(topicId: string): string {
  const problems = problemsByTopic.get(topicId) ?? [];
  return `${problems.length}:${problems[0]?.id ?? "none"}:${problems[problems.length - 1]?.id ?? "none"}`;
}

// --- Build topic context ---

function buildTopicContext(topic: GraphTopic): string {
  const problems = problemsByTopic.get(topic.id) ?? [];
  const prereqs = graph.prerequisites
    .filter(e => e.to === topic.id)
    .map(e => graph.topics.find(t => t.id === e.from)?.name ?? e.from);
  const dependents = graph.prerequisites
    .filter(e => e.from === topic.id)
    .map(e => graph.topics.find(t => t.id === e.to)?.name ?? e.to);
  const encParent = graph.encompassings
    .filter(e => e.child === topic.id)
    .map(e => graph.topics.find(t => t.id === e.parent)?.name ?? e.parent);
  const encChildren = graph.encompassings
    .filter(e => e.parent === topic.id)
    .map(e => graph.topics.find(t => t.id === e.child)?.name ?? e.child);
  const strandTopics = graph.topics
    .filter(t => t.strand === topic.strand && t.id !== topic.id)
    .sort((a, b) => Math.abs(a.gradeLevel - topic.gradeLevel) - Math.abs(b.gradeLevel - topic.gradeLevel))
    .slice(0, 8);
  const maMatches = findMAMatches(topic.name);

  // Sample problems: show first 2 of each difficulty
  const sampleProblems: string[] = [];
  for (const diff of ["easy", "medium", "hard"]) {
    const subset = problems.filter(p => p.difficulty === diff).slice(0, 2);
    for (const p of subset) {
      sampleProblems.push(`  [${diff}] Q: ${p.question}\n  A: ${p.answer} (${p.cognitiveDemand ?? "unspecified"})`);
    }
  }

  let ctx = `## Topic
- ID: ${topic.id}
- Name: ${topic.name}
- Description: ${topic.description}
- Grade Level: ${topic.gradeLevel}
- Strand: ${topic.strand}

## Problems (${problems.length} total)
${sampleProblems.length > 0 ? sampleProblems.join("\n\n") : "No problems available."}
${problems.length > 6 ? `\n... and ${problems.length - 6} more problems` : ""}

## Graph Context
- Prerequisites: ${prereqs.length > 0 ? prereqs.join(", ") : "none (entry point)"}
- Dependents: ${dependents.length > 0 ? dependents.join(", ") : "none (leaf)"}
- Encompassing parent: ${encParent.length > 0 ? encParent.join(", ") : "none"}
- Encompassed children: ${encChildren.length > 0 ? encChildren.join(", ") : "none"}

## Neighbor Topics (same strand, nearest by grade)
${strandTopics.map(t => `- ${t.name} (Grade ${t.gradeLevel}): ${t.description}`).join("\n")}
`;

  if (maMatches.length > 0) {
    ctx += `\n## Math Academy Reference
Similar MA topics: ${maMatches.map(m => `${m.name} (depth ${m.depth}, sim ${(m.similarity * 100).toFixed(0)}%)`).join(", ")}
MA courses: ${[...new Set(maMatches.flatMap(m => m.courses))].slice(0, 3).join(", ")}`;
  } else {
    ctx += `\n## Math Academy Reference\nNo close MA matches found.`;
  }

  const strandCount = graph.topics.filter(t => t.strand === topic.strand).length;
  const maStrandMatches = maGraph
    ? strandTopics.reduce((acc, t) => acc + (findMAMatches(t.name, 1).length > 0 ? 1 : 0), 0)
    : 0;
  ctx += `\nOur strand has ${strandCount} topics. ${maGraph ? `MA has ~${maStrandMatches + (maMatches.length > 0 ? 1 : 0)} matched topics in this neighborhood.` : ""}`;

  return ctx;
}

// --- LLM ---

const SYSTEM_PROMPT = `You are a curriculum design expert analyzing topic atomicity for a mastery-learning math platform (grades K-8).

A topic is "atomic" when it represents ONE independently testable, teachable, and remediable skill. Your job is to evaluate each topic against 5 heuristics and recommend whether it should be kept as-is, split, or merged.

Respond with ONLY valid JSON (no markdown fences, no extra text) matching this schema:
{
  "verdict": "atomic" | "should-split" | "should-merge" | "review",
  "confidence": 0.0-1.0,
  "heuristics": {
    "testable_in_isolation": { "pass": true/false, "reasoning": "..." },
    "distinct_cognitive_demand": { "pass": true/false, "reasoning": "..." },
    "platform_compatible": { "pass": true/false, "reasoning": "..." },
    "grade_boundary_natural": { "pass": true/false, "reasoning": "..." },
    "remediation_useful": { "pass": true/false, "reasoning": "..." }
  },
  "split_recommendation": null | {
    "proposed_topics": [{ "name": "...", "description": "...", "rationale": "..." }],
    "evidence": "..."
  },
  "merge_recommendation": null | {
    "merge_with": "topic-id",
    "rationale": "..."
  },
  "ma_density_note": "..." | null,
  "notes": "..."
}

Guidelines:
- "atomic" = all 5 heuristics pass, topic is well-scoped
- "should-split" = topic covers 2+ distinct skills that could be independently tested
- "should-merge" = topic is too granular, nearly identical to a neighbor
- "review" = unclear, needs human judgment
- Be specific in split proposals: name concrete sub-topics with descriptions
- For merge recommendations, specify which topic-id to merge with
- Consider the grade level: K-2 topics can be broader; grade 5+ should be more atomic
- A topic with problems spanning clearly different strategies likely needs splitting
- A topic with very narrow problems identical to a neighbor likely needs merging`;

async function callLLM(prompt: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as any;
  return data.choices[0].message.content;
}

function parseResponse(raw: string): any {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

// --- Concurrency limiter ---

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  });
  await Promise.all(workers);
}

// --- Main ---

async function main() {
  // Filter topics
  let topics = graph.topics;
  if (strandFilter) topics = topics.filter(t => t.strand === strandFilter);
  if (topicFilter) topics = topics.filter(t => t.id === topicFilter);

  if (topics.length === 0) {
    console.error("No topics match the filter");
    process.exit(1);
  }

  // Determine which need auditing
  const toAudit: GraphTopic[] = [];
  const skipped: GraphTopic[] = [];

  for (const topic of topics) {
    const fp = fingerprint(topic.id);
    const prev = previousAudit?.topics[topic.id];
    if (prev && prev.fingerprint === fp && !force) {
      skipped.push(topic);
    } else {
      toAudit.push(topic);
    }
  }

  if (!jsonOutput) {
    console.log(`\nAtomicity Audit: ${discipline}`);
    console.log(`  Total topics: ${topics.length}`);
    console.log(`  To audit: ${toAudit.length}`);
    console.log(`  Skipped (cached): ${skipped.length}`);
    console.log(`  Model: ${MODEL}`);
    console.log(`  Concurrency: ${concurrency}`);
    if (strandFilter) console.log(`  Strand filter: ${strandFilter}`);
    if (topicFilter) console.log(`  Topic filter: ${topicFilter}`);
    console.log();
  }

  if (dryRun) {
    if (!jsonOutput) {
      console.log("Topics that would be audited:");
      for (const t of toAudit) {
        console.log(`  ${t.id} (${t.strand}, Grade ${t.gradeLevel})`);
      }
    }
    return;
  }

  if (toAudit.length === 0) {
    if (!jsonOutput) console.log("All topics already audited. Use --force to re-audit.");
    // Still output the previous results
    if (previousAudit && jsonOutput) {
      console.log(JSON.stringify(previousAudit, null, 2));
    }
    return;
  }

  // Run audit
  const results: Record<string, TopicAuditResult> = {};
  let totalTokens = 0;
  let errors = 0;

  // Copy previous results for skipped topics
  for (const t of skipped) {
    if (previousAudit?.topics[t.id]) {
      results[t.id] = previousAudit.topics[t.id];
    }
  }

  await runWithConcurrency(toAudit, concurrency, async (topic, i) => {
    const ctx = buildTopicContext(topic);
    const prompt = `Evaluate the atomicity of this topic:\n\n${ctx}\n\nApply the 5 split heuristics:\n1. Testable-in-isolation: Can a student pass this topic and fail an adjacent one?\n2. Distinct cognitive demand: Does it require a meaningfully different strategy than neighbors?\n3. Platform-compatible: Can it be assessed with screen + text input?\n4. Grade-boundary natural: Does it sit at a specific grade level?\n5. Remediation-useful: Would splitting help pinpoint where a student is stuck?`;

    try {
      if (!jsonOutput) process.stdout.write(`  [${i + 1}/${toAudit.length}] ${topic.id}...`);
      const raw = await callLLM(prompt);
      const parsed = parseResponse(raw);
      totalTokens += (prompt.length + raw.length) / 4; // rough token estimate

      results[topic.id] = {
        topicId: topic.id,
        topicName: topic.name,
        strand: topic.strand,
        gradeLevel: topic.gradeLevel,
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        heuristics: parsed.heuristics,
        splitRecommendation: parsed.split_recommendation ?? null,
        mergeRecommendation: parsed.merge_recommendation ?? null,
        maDensityNote: parsed.ma_density_note ?? null,
        notes: parsed.notes ?? "",
        fingerprint: fingerprint(topic.id),
      };

      if (!jsonOutput) {
        const v = parsed.verdict;
        const c = (parsed.confidence * 100).toFixed(0);
        const icon = v === "atomic" ? "✓" : v === "should-split" ? "✂" : v === "should-merge" ? "⊕" : "?";
        console.log(` ${icon} ${v} (${c}%)`);
      }
    } catch (err: any) {
      errors++;
      if (!jsonOutput) console.log(` ERROR: ${err.message}`);
      results[topic.id] = {
        topicId: topic.id,
        topicName: topic.name,
        strand: topic.strand,
        gradeLevel: topic.gradeLevel,
        verdict: "review",
        confidence: 0,
        heuristics: {
          testable_in_isolation: { pass: true, reasoning: "Error during audit" },
          distinct_cognitive_demand: { pass: true, reasoning: "Error during audit" },
          platform_compatible: { pass: true, reasoning: "Error during audit" },
          grade_boundary_natural: { pass: true, reasoning: "Error during audit" },
          remediation_useful: { pass: true, reasoning: "Error during audit" },
        },
        splitRecommendation: null,
        mergeRecommendation: null,
        maDensityNote: null,
        notes: `Audit error: ${err.message}`,
        fingerprint: fingerprint(topic.id),
      };
    }
  });

  // Compute summary
  const allResults = Object.values(results);
  const verdictCounts = {
    atomic: allResults.filter(r => r.verdict === "atomic").length,
    shouldSplit: allResults.filter(r => r.verdict === "should-split").length,
    shouldMerge: allResults.filter(r => r.verdict === "should-merge").length,
    review: allResults.filter(r => r.verdict === "review").length,
  };

  const heuristicNames = ["testable_in_isolation", "distinct_cognitive_demand", "platform_compatible", "grade_boundary_natural", "remediation_useful"] as const;
  const failRates: Record<string, number> = {};
  for (const h of heuristicNames) {
    const fails = allResults.filter(r => !r.heuristics[h]?.pass).length;
    failRates[h] = allResults.length > 0 ? (fails / allResults.length) * 100 : 0;
  }

  const strandCounts: Record<string, number> = {};
  for (const t of graph.topics) {
    strandCounts[t.strand] = (strandCounts[t.strand] ?? 0) + 1;
  }

  const maMatchedCount = maGraph
    ? graph.topics.filter(t => findMAMatches(t.name, 1).length > 0).length
    : 0;

  const costPerInputToken = 0.30 / 1_000_000;
  const costPerOutputToken = 1.50 / 1_000_000;
  const estimatedCost = totalTokens * 0.7 * costPerInputToken + totalTokens * 0.3 * costPerOutputToken;

  const audit: AuditResult = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: MODEL,
      discipline,
      topicCount: topics.length,
      auditedCount: toAudit.length,
      skippedCount: skipped.length,
      totalTokensUsed: Math.round(totalTokens),
      estimatedCostUsd: Math.round(estimatedCost * 100) / 100,
    },
    summary: {
      ...verdictCounts,
      heuristicFailRates: failRates,
      averageConfidence: allResults.length > 0
        ? Math.round(allResults.reduce((s, r) => s + r.confidence, 0) / allResults.length * 100) / 100
        : 0,
    },
    maDensityComparison: {
      ourTopicsPerStrand: strandCounts,
      maMatchedTopics: maMatchedCount,
      maUnmatchedTopics: graph.topics.length - maMatchedCount,
    },
    topics: results,
  };

  // Write JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = join(auditsDir, `atomicity-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(audit, null, 2) + "\n");
  writeFileSync(latestPath, JSON.stringify(audit, null, 2) + "\n");

  // Write markdown report
  const mdPath = join(auditsDir, `atomicity-${timestamp}.md`);
  writeFileSync(mdPath, generateMarkdownReport(audit));

  if (jsonOutput) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Atomicity Audit Complete`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Audited: ${toAudit.length} | Cached: ${skipped.length} | Errors: ${errors}`);
    console.log(`  Atomic: ${verdictCounts.atomic} | Split: ${verdictCounts.shouldSplit} | Merge: ${verdictCounts.shouldMerge} | Review: ${verdictCounts.review}`);
    console.log(`  Avg confidence: ${(audit.summary.averageConfidence * 100).toFixed(0)}%`);
    console.log(`  Estimated cost: $${audit.metadata.estimatedCostUsd.toFixed(2)}`);
    console.log();
    console.log(`  Results: ${jsonPath}`);
    console.log(`  Report:  ${mdPath}`);
    console.log(`  Latest:  ${latestPath}`);

    // Print split recommendations
    const splits = allResults.filter(r => r.verdict === "should-split" && r.splitRecommendation);
    if (splits.length > 0) {
      console.log(`\n  Split Recommendations (${splits.length}):`);
      for (const r of splits.sort((a, b) => b.confidence - a.confidence)) {
        console.log(`    ✂ ${r.topicId} (${(r.confidence * 100).toFixed(0)}% confidence)`);
        if (r.splitRecommendation) {
          for (const p of r.splitRecommendation.proposedTopics) {
            console.log(`      → ${p.name}: ${p.description}`);
          }
        }
      }
    }

    // Print merge recommendations
    const merges = allResults.filter(r => r.verdict === "should-merge" && r.mergeRecommendation);
    if (merges.length > 0) {
      console.log(`\n  Merge Recommendations (${merges.length}):`);
      for (const r of merges.sort((a, b) => b.confidence - a.confidence)) {
        console.log(`    ⊕ ${r.topicId} → merge with ${r.mergeRecommendation!.mergeWith}`);
        console.log(`      ${r.mergeRecommendation!.rationale}`);
      }
    }
  }
}

// --- Markdown report ---

function generateMarkdownReport(audit: AuditResult): string {
  const s = audit.summary;
  const m = audit.metadata;
  const allResults = Object.values(audit.topics).sort((a, b) => a.strand.localeCompare(b.strand) || a.gradeLevel - b.gradeLevel);

  let md = `# Atomicity Audit Report

> **Generated:** ${m.timestamp}
> **Model:** ${m.model}
> **Discipline:** ${m.discipline}
> **Topics audited:** ${m.auditedCount} (${m.skippedCount} cached)
> **Estimated cost:** $${m.estimatedCostUsd.toFixed(2)}

## Summary

| Verdict | Count | % |
|---------|------:|--:|
| Atomic | ${s.atomic} | ${((s.atomic / (s.atomic + s.shouldSplit + s.shouldMerge + s.review)) * 100).toFixed(0)}% |
| Should Split | ${s.shouldSplit} | ${((s.shouldSplit / (s.atomic + s.shouldSplit + s.shouldMerge + s.review)) * 100).toFixed(0)}% |
| Should Merge | ${s.shouldMerge} | ${((s.shouldMerge / (s.atomic + s.shouldSplit + s.shouldMerge + s.review)) * 100).toFixed(0)}% |
| Review | ${s.review} | ${((s.review / (s.atomic + s.shouldSplit + s.shouldMerge + s.review)) * 100).toFixed(0)}% |

**Average confidence:** ${(s.averageConfidence * 100).toFixed(0)}%

### Heuristic Failure Rates

| Heuristic | Fail Rate |
|-----------|----------:|
| Testable in Isolation | ${s.heuristicFailRates.testable_in_isolation?.toFixed(1) ?? "0"}% |
| Distinct Cognitive Demand | ${s.heuristicFailRates.distinct_cognitive_demand?.toFixed(1) ?? "0"}% |
| Platform Compatible | ${s.heuristicFailRates.platform_compatible?.toFixed(1) ?? "0"}% |
| Grade Boundary Natural | ${s.heuristicFailRates.grade_boundary_natural?.toFixed(1) ?? "0"}% |
| Remediation Useful | ${s.heuristicFailRates.remediation_useful?.toFixed(1) ?? "0"}% |

## MA Density Comparison

- Our topics with MA matches: ${audit.maDensityComparison.maMatchedTopics}
- Our topics without MA matches: ${audit.maDensityComparison.maUnmatchedTopics}

`;

  // Split recommendations
  const splits = allResults.filter(r => r.verdict === "should-split" && r.splitRecommendation);
  if (splits.length > 0) {
    md += `## Split Recommendations (${splits.length})\n\n`;
    md += `| Topic | Grade | Strand | Confidence | Proposed Splits |\n`;
    md += `|-------|------:|--------|----------:|:----------------|\n`;
    for (const r of splits.sort((a, b) => b.confidence - a.confidence)) {
      const proposed = r.splitRecommendation!.proposedTopics.map(p => p.name).join("; ");
      md += `| ${r.topicName} | ${r.gradeLevel} | ${r.strand} | ${(r.confidence * 100).toFixed(0)}% | ${proposed} |\n`;
    }
    md += "\n### Split Details\n\n";
    for (const r of splits) {
      md += `#### ${r.topicName} (\`${r.topicId}\`)\n\n`;
      md += `**Evidence:** ${r.splitRecommendation!.evidence}\n\n`;
      for (const p of r.splitRecommendation!.proposedTopics) {
        md += `- **${p.name}**: ${p.description}\n  - Rationale: ${p.rationale}\n`;
      }
      md += "\n";
    }
  }

  // Merge recommendations
  const merges = allResults.filter(r => r.verdict === "should-merge" && r.mergeRecommendation);
  if (merges.length > 0) {
    md += `## Merge Recommendations (${merges.length})\n\n`;
    md += `| Topic | Merge With | Confidence | Rationale |\n`;
    md += `|-------|-----------|----------:|:----------|\n`;
    for (const r of merges) {
      md += `| ${r.topicName} | ${r.mergeRecommendation!.mergeWith} | ${(r.confidence * 100).toFixed(0)}% | ${r.mergeRecommendation!.rationale} |\n`;
    }
    md += "\n";
  }

  // Per-strand summary
  md += `## Per-Strand Breakdown\n\n`;
  const strands = [...new Set(allResults.map(r => r.strand))].sort();
  for (const strand of strands) {
    const strandResults = allResults.filter(r => r.strand === strand);
    const atomic = strandResults.filter(r => r.verdict === "atomic").length;
    const split = strandResults.filter(r => r.verdict === "should-split").length;
    const merge = strandResults.filter(r => r.verdict === "should-merge").length;
    const review = strandResults.filter(r => r.verdict === "review").length;
    md += `### ${strand} (${strandResults.length} topics)\n\n`;
    md += `Atomic: ${atomic} | Split: ${split} | Merge: ${merge} | Review: ${review}\n\n`;

    // Show non-atomic topics
    const nonAtomic = strandResults.filter(r => r.verdict !== "atomic");
    if (nonAtomic.length > 0) {
      for (const r of nonAtomic) {
        const failedH = Object.entries(r.heuristics)
          .filter(([_, v]) => !v.pass)
          .map(([k, _]) => k.replace(/_/g, "-"));
        md += `- **${r.topicName}** (${r.verdict}, ${(r.confidence * 100).toFixed(0)}%): failed ${failedH.join(", ") || "none"}\n`;
        if (r.notes) md += `  - ${r.notes}\n`;
      }
      md += "\n";
    }
  }

  return md;
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
