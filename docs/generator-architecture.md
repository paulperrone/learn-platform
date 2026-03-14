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

For non-deterministic disciplines (history, ELA, philosophy), generators use structured prompt templates instead of code:

```typescript
type PromptTemplateGenerator = {
  topicId: string;
  discipline: string;
  template: PromptTemplate;
  postProcess: (llmOutput: string) => GeneratedContent;
};

type PromptTemplate = {
  systemPrompt: string;
  factAnchors: FactAnchor[];       // Grounded claims with sources
  depthConstraints: DepthConstraint[];  // What to include/exclude per depth level
  rubric?: string[];               // Grading criteria
};
```

Prompt templates constrain LLM output while allowing creative variation. Fact anchors ground questions in declared sources. Depth constraints ensure survey-level content doesn't require analytical skills.

## Migration Plan

1. **Phase 0** ✓ — Graph expansion (705 → 772 topics)
2. **Phase 1** ✓ — Architecture & shared utilities (this doc)
3. **Phases 3-6** — Write generators for all 772 math topics (Sonnet)
4. **Phase 7** — Full regeneration, difficulty removal, legacy cleanup
