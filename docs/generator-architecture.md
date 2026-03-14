# Generator Architecture

Content generators produce mathematically correct problems, worked examples, and lessons for each topic. The architecture separates **math correctness** (per-topic generators) from **formatting and assembly** (shared builders).

## Overview

```
Per-Topic Generator (~20-50 lines, pure math):
  generate(rng) → { question, answer, solution, steps[] }

     ↓  shared builders handle everything else

ProblemBuilder  → Problem[]     (IDs, dimensions, hints, demand, type)
ExampleBuilder  → WorkedExample[] (step-by-step format from representative problems)
LessonBuilder   → Lesson[]      (explanation + worked-example + practice sections)
OutputWriter    → JSON files    (validates, writes problems.json / examples.json / lessons.json)
```

## File Layout

```
learn-content/math/generators/
  types.ts              # RawProblem, TopicGenerator, SeededRng, TopicMeta
  math-utils.ts         # gcd, lcm, simplifyFraction, isPrime, etc.
  index.ts              # Static registry of all generators
  run.ts                # CLI runner
  builders/
    problem-builder.ts  # RawProblem[] → Problem[]
    example-builder.ts  # RawProblem[] → WorkedExample[]
    lesson-builder.ts   # Assembles Lesson from examples + problems
    output-writer.ts    # Validates and writes JSON files
    hint-generator.ts   # Progressive hints from solution steps
    answer-verifier.ts  # Self-check: NaN, empty, division by zero
  equivalent-fractions-3.ts   # Reference generator
  <topic-id>.ts               # One file per topic
```

## Writing a Generator

Each generator is a small file that exports a `TopicGenerator` via `defineGenerator`:

```typescript
import { defineGenerator } from "./types.js";

export default defineGenerator({
  topicId: "add-within-20",

  conceptText:
    "Adding within 20 means finding the sum of two numbers where the result is 20 or less.",

  generate(rng) {
    const a = rng.int(1, 10);
    const b = rng.int(1, 20 - a);
    const sum = a + b;

    return {
      question: `What is ${a} + ${b}?`,
      answer: sum,
      solution: `${a} + ${b} = ${sum}.`,
      steps: [
        `Start with ${a}.`,
        `Count up ${b} more: ${a} + ${b} = ${sum}.`,
      ],
    };
  },
});
```

The generator only produces the mathematical core. Shared builders add:
- **ID**: `${topicId}-${index}` (e.g., `add-within-20-1`)
- **Hints**: Progressive hints from the `steps` array
- **Cognitive demand**: Assigned from `DEMAND_PROFILES[presentation]`
- **Assessment type**: Inferred from answer format (numeric → `numerical-input`, text → `text-qa`)
- **Dimensions**: `presentation`, `contentDepth`, `locale`, `flavor` from graph.json topic metadata
- **Worked examples**: Selects representative problems, converts to step-by-step format
- **Lessons**: Assembles explanation + worked-example + practice sections

## RawProblem → Problem Flow

```
RawProblem (from generator):
  { question, answer, solution, steps?, variant? }

  ↓ ProblemBuilder

Problem (platform type):
  { id, topicId, question, answer, hints[], solution,
    type, cognitiveDemand, source, presentation, contentDepth, locale, flavor }
```

**ProblemBuilder** (`buildProblems`):
1. Runs the generator N times with different seeds
2. Deduplicates by question text
3. Verifies answers (no NaN, no empty, no division by zero)
4. Generates progressive hints from steps/solution
5. Assigns cognitive demand per `DEMAND_PROFILES`
6. Infers assessment type from answer format
7. Applies dimension defaults from graph.json

## Cognitive Demand Profiles

Demand distribution varies by presentation level (from `packages/shared/src/types.ts`):

| Presentation | Procedural | Application | Conceptual | Reasoning | Error Analysis |
|-------------|-----------|------------|-----------|----------|---------------|
| primary | 60% | 40% | — | — | — |
| intermediate | 45% | 30% | 25% | — | — |
| standard | 35% | 25% | 25% | 15% | — |
| advanced | 25% | 20% | 20% | 20% | 15% |

## CLI Runner

```bash
# From learn-content/ directory:
npx tsx math/generators/run.ts                           # all generators
npx tsx math/generators/run.ts --topic add-within-20     # single topic
npx tsx math/generators/run.ts --strand fractions         # all fraction topics
npx tsx math/generators/run.ts --grade 3                  # all grade 3 topics
npx tsx math/generators/run.ts --count 15 --seed 42      # control output
npx tsx math/generators/run.ts --verify --dry-run         # check without writing
```

Output: `math/problems/<topic-id>.json`, `math/examples/<topic-id>.json`, `math/lessons/<topic-id>.json`

## Adding a New Generator

1. Create `learn-content/math/generators/<topic-id>.ts`
2. Export default `defineGenerator({ topicId, generate, conceptText? })`
3. Add the import to `learn-content/math/generators/index.ts`
4. Run: `npx tsx math/generators/run.ts --topic <topic-id>`
5. Validate: `just validate-content`

## Generator Design Principles

- **One generator per topic** — bespoke, not parameterized. Cheap to write, direct provenance.
- **Generators are minimal** — ~20-50 lines of pure math. Shared builders handle formatting.
- **Shared utilities protect against spec drift** — changing the Problem type, hint strategy, or demand profiles happens in one place.
- **Generators live in learn-content** — co-located with the content they produce.
- **Answers are computed, not copy-pasted** — eliminates the #1 error class from hand-authored content.

## Prompt-Template Generators (Interpretive Disciplines)

Interpretive disciplines (history, ELA, philosophy, vocabulary) can't use deterministic generators — there's no code that computes "the correct interpretation of the American Revolution." Instead, they use **prompt-template generators**: structured templates that constrain Claude Code's content generation to ensure fact-grounded, depth-appropriate content.

### Why Prompt Templates?

| Problem | How templates solve it |
|---------|----------------------|
| LLMs hallucinate facts | **Fact anchors** — every claim must come from declared sources |
| Depth-inappropriate questions | **Depth constraints** — survey can't ask for source analysis |
| Inconsistent grading | **Rubric dimensions** — structured scoring criteria per depth |
| Missing perspectives | **Perspective requirements** — minimum viewpoint count per depth |
| No provenance | **Source tracking** — each fact anchor cites its source |

### Architecture

```
PromptTemplateGenerator (per-topic, defines constraints):
  template: { factAnchors, perspectives, depthConstraints, rubricDimensions }

     ↓  prompt-builder renders a structured prompt

PromptBuilder (shared):
  buildPrompt(generator, depth, presentation) → formatted prompt string

     ↓  Claude Code session uses the prompt to generate content

Content Author (Claude Code):
  → reads the prompt, generates problems/examples/lessons
  → reviews output against the template's reviewChecklist
  → output matches platform Problem/WorkedExample/Lesson types
```

Unlike deterministic generators that run automatically, prompt-template generators produce structured prompts that guide Claude Code content generation sessions. The template ensures consistency across sessions and authors.

### Key Types

```typescript
type PromptTemplateGenerator = {
  topicId: string;
  discipline: string;
  template: PromptTemplate;
  conceptText?: string;        // For lesson generation
  reviewChecklist?: string[];  // Post-generation quality checks
};

type PromptTemplate = {
  systemPrompt: string;
  factAnchors: FactAnchor[];           // Grounded claims with provenance
  perspectives?: Perspective[];         // Named viewpoints for multi-perspective questions
  depthConstraints: DepthConstraint[]; // What to include/exclude per depth level
  rubricDimensions?: RubricDimension[];// Multi-dimensional scoring for contextual+ depth
  rubric?: string[];                   // Simple criteria for survey depth
  sourceRequirements?: string[];       // Rules about primary source usage
};

type FactAnchor = {
  claim: string;
  source: string;
  confidence: "established" | "debated" | "interpretive";
};

type Perspective = {
  label: string;
  description: string;
  sourceExcerpt?: string;  // Representative quote or primary source excerpt
};

type DepthConstraint = {
  depth: "survey" | "contextual" | "analytical" | "synthesis";
  must: string[];           // Content requirements
  mustNot: string[];        // Content prohibitions
  assessmentGuidance?: string;
  minPerspectives?: number; // 0 for survey, 2+ for analytical
};

type RubricDimension = {
  name: string;
  description: string;
  levels: { score: number; label: string; criteria: string }[];
};
```

### Writing a Prompt-Template Generator

Each generator is one file per topic, using `definePromptTemplate`:

```typescript
import { definePromptTemplate } from "../../math/generators/types.js";

export default definePromptTemplate({
  topicId: "causes-of-revolution",
  discipline: "history",

  conceptText:
    "The American Revolution didn't happen overnight. Over many years...",

  template: {
    systemPrompt: "You are generating educational content about...",

    factAnchors: [
      {
        claim: "The Stamp Act of 1765 required colonists to pay a tax on printed materials.",
        source: "National Archives; textbook consensus",
        confidence: "established",
      },
      // ... more anchors
    ],

    perspectives: [
      { label: "Patriot colonist", description: "Viewed British taxation as tyranny..." },
      { label: "Loyalist colonist", description: "Believed remaining under British rule..." },
    ],

    depthConstraints: [
      {
        depth: "survey",
        must: ["Ask only about established facts", "Use straightforward recall"],
        mustNot: ["Ask for cause-and-effect analysis", "Require primary sources"],
        assessmentGuidance: "Binary grading — right or wrong.",
        minPerspectives: 0,
      },
      {
        depth: "analytical",
        must: ["Reference primary sources", "Compare perspectives"],
        mustNot: ["Accept simple recall as complete answer"],
        assessmentGuidance: "Multi-dimensional rubric: evidence, argument, sources.",
        minPerspectives: 2,
      },
    ],

    rubricDimensions: [
      {
        name: "Factual Accuracy",
        description: "Are facts correct and grounded?",
        levels: [
          { score: 0, label: "Inaccurate", criteria: "Contains errors" },
          { score: 3, label: "Fully accurate", criteria: "All facts match anchors" },
        ],
      },
    ],
  },

  reviewChecklist: [
    "Every question references only fact anchors",
    "Survey questions are pure recall",
    "Analytical questions reference primary sources",
  ],
});
```

### Rendering Prompts

The prompt builder renders a template into a structured prompt for a specific depth and presentation:

```bash
# From learn-content/ directory:
npx tsx history/generators/render-prompt.ts causes-of-revolution survey
npx tsx history/generators/render-prompt.ts causes-of-revolution analytical --presentation advanced
```

The rendered prompt includes all fact anchors, applicable depth constraints, perspectives (when required by the depth), rubric dimensions, output format specs, and the review checklist.

### Depth-Assessment Mapping

How assessment style changes across depth levels for interpretive disciplines:

| Depth | Assessment | Grading | Perspectives |
|-------|-----------|---------|-------------|
| survey | Recall (who/what/when/where) | Binary — right/wrong | None required |
| contextual | Explanation (why/how, cause-effect) | Rubric — partial credit | 2+ viewpoints |
| analytical | Source analysis, evidence evaluation | Multi-dimensional rubric | 2+ with primary sources |
| synthesis | Original argument from evidence | Holistic rubric | 3+ including counter-arguments |

### Deterministic vs. Prompt-Template Generators

| | Deterministic | Prompt-Template |
|---|---|---|
| **Disciplines** | math, CS, grammar | history, ELA, philosophy, vocabulary |
| **Answer source** | Computed by code | Grounded in fact anchors |
| **Correctness guarantee** | Mathematical proof | Rubric + fact-grounding |
| **Variation** | Seeded RNG | LLM creativity within constraints |
| **Execution** | Automated (run.ts) | Claude Code session with rendered prompt |
| **Review needed** | Format only | Content + factual accuracy |
| **Example** | `1/2 + 1/3 = 5/6` (code computes) | "What caused WWI?" (template constrains) |

### File Layout

```
learn-content/<discipline>/generators/
  <topic-id>.ts          # definePromptTemplate({ ... })
  prompt-builder.ts      # buildPrompt(generator, depth, presentation)
  render-prompt.ts       # CLI to render prompts
```

The prompt-builder and render-prompt utilities are shared across disciplines. Each discipline has its own generators directory with per-topic template files.

## Migration Plan

1. **Phase 0** ✓ — Graph expansion (705 → 772 topics)
2. **Phase 1** ✓ — Architecture & shared utilities (this doc)
3. **Phase 2** ✓ — Prompt-template spec & PoC (history: causes-of-revolution)
4. **Phases 3-6** — Write generators for all 772 math topics (Sonnet)
5. **Phase 7** — Full regeneration, difficulty removal, legacy cleanup
