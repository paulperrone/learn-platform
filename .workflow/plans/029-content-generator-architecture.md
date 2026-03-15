# Plan 029: Content Generator Architecture

> **Created:** 2026-03-14T17:03:41Z
> **Updated:** 2026-03-15
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Audit and expand the math knowledge graph to proper atomic granularity using MathAcademy's K-8 topology as reference, then build a bespoke generator function for every topic that produces mathematically correct content (problems, worked examples, and lessons) with full provenance. Generators are small and focused — they produce the mathematical core (question, answer, solution steps), while a shared utility layer handles formatting, hints, cognitive demand variation, worked example assembly, and lesson composition. All existing hand-authored content is regenerated. Concludes with difficulty field removal and legacy cleanup.

**Phase ordering:** Phases 0-2 are architecture/design (Opus). Phases 3-7 are bulk generator writing and cleanup (Sonnet via `/workflow-run`). Simulation/audit updates are merged into Plan 030 Phase 5.

**Motivation:** Content review of fractions (66 topics) and expressions-equations (55 topics) found 56 error-level findings. The dominant issue: answer fields contradicting their own solutions (23 wrong answers across the two strands). These are LLM authoring mistakes that a deterministic generator would prevent entirely. Secondary issues (unsimplified answers, drafting artifacts in answer fields, inconsistent difficulty ordering) are also eliminated when code produces the content.

**Architecture:**

```
Per-Topic Generator (small, focused on math correctness):
  generate(rng) → { question, answer, solution, steps[] }

     ↓  shared utilities handle everything else

ProblemBuilder (shared):
  → applies dimension defaults from graph.json topic metadata
  → generates progressive hints from solution steps
  → assigns cognitiveDemand variation per DEMAND_PROFILES
  → assigns assessment type (text-qa, numerical-input, etc.)
  → produces fully-formed Problem[]

ExampleBuilder (shared):
  → selects representative problems, converts to WorkedExampleStep format
  → generates subgoalLabel, instruction, work, explanation per step
  → produces fully-formed WorkedExample[]

LessonBuilder (shared):
  → assembles explanation section (from topic description + concept text)
  → embeds worked example section (from ExampleBuilder output)
  → embeds practice section (subset of ProblemBuilder output)
  → produces fully-formed Lesson[]

OutputWriter (shared):
  → validates all output against schema before writing
  → writes problems.json, examples.json, lessons.json per topic
  → runs self-check (answer verification, format compliance, dedup)
```

**Key decisions:**
1. **One generator per topic** — bespoke, not parameterized. Cheap to generate, provides direct provenance.
2. **Generators are minimal** — they produce raw math (question, answer, solution steps). Shared utilities handle formatting, hints, demand, dimensions, lessons.
3. **Shared utilities protect against spec drift** — changing the Problem type, adding a new required field, or adjusting hint generation happens in one place, not per-generator.
4. **Generators live in learn-content** — alongside the content they produce. `learn-content/math/generators/<topic-id>.ts`.
5. **All existing hand-authored content will be regenerated** — generators are the single source of truth.
6. **Graph expansion before generators** — no point writing generators for topics that are too broad and will be split.
7. **Lessons are first-class generator output** — every generator produces problems + examples + lessons, not just problems.

**Depends on:** Plan 028 complete (lesson types, pipeline, engine, frontend). ✓ Completed 2026-03-14.

**Reference data:** MathAcademy graph at `~/source/mathacademy-graph/` — 3,688 topics, 5,622 edges. K-8 equivalent: ~955 unique topics across 4th Grade, 5th Grade, Prealgebra, Mathematical Foundations I-II. Our current graph: 705 topics, 1,001 prerequisite edges, 711 encompassing edges.

## Progress

**Completed:** Phase 0 (Graph Audit & Expansion), Phase 1 (Generator Architecture & Shared Utilities), Phase 2 (Prompt-Template Spec), Phase 3 (K-2 Generators), Phase 4 (3-5 Generators)
**In Progress:** —
**Next:** Phase 5

**Model assignments:**
- Phases 0-2: Opus (architecture, research, design)
- Phases 3-7: Sonnet (bulk generator writing, cleanup)

---

## Phase 0: Graph Audit & Expansion ✓

**Goal:** Audit our 705-topic K-8 math graph against MathAcademy's topology. Identify topics that are too broad (violate the split heuristics), split them, add missing topics, and validate the expanded graph. Target: ~800-1,000 topics with proper atomic granularity.

### Context for Execution

The graph was expanded from 207 → 705 topics in plan 021 using the expansion-map (`docs/archive/expansion-map.md`). That expansion applied the 5 split heuristics to Wave 1 strands (counting, operations). Remaining strands (fractions, geometry, algebra) may still have topics that are too coarse.

**MathAcademy K-8 reference:**
- `~/source/mathacademy-graph/mathacademy.db` — SQLite with 3,688 topics, 5,622 edges
- K-8 equivalent courses: 4th Grade (137 topics), 5th Grade (132), Prealgebra (205), MF1 (352), MF2 (357)
- ~955 unique topics across those courses (but includes some beyond grade 8: logarithms, quadratic functions, etc.)
- Our 705 topics is in the right ballpark but may lack granularity in specific strands

**Split heuristics (from expansion-map.md):**
1. **Testable-in-isolation:** Can a student pass A and fail B?
2. **Distinct cognitive demand:** Requires meaningfully different strategy?
3. **Platform-compatible:** Screen + text input only?
4. **Grade-boundary natural:** Naturally at a different grade level?
5. **Remediation-useful:** Would splitting help pinpoint where students are stuck?

**When to skip an MA topic:**
- Model-based variants where the model is the same skill with a visual aid
- Word problem variants that don't add cognitive demand beyond the procedural topic
- Digit-count progressions beyond 3 levels (2-digit, 3-digit, multi-digit is enough)

### Steps

1. [x] [RSH] Extract MA's K-8 topic set and build a comparison map:
   - Queried `mathacademy.db` for 955 unique topics across courses 75, 30, 99, 113, 111
   - Filtered ~134 topics beyond grade 8 (trig, calculus, complex numbers, etc.)
   - Built strand-level comparison: our topics vs MA equivalent coverage by unit

2. [x] [RSH] Identify split candidates per strand:
   - Compared topic counts per strand; identified compound topics violating testable-in-isolation
   - 7 compound topics split (add-subtract-rationals, multiply-divide-rationals, compare-order-integers, compare-order-rationals, add-subtract-polynomials, add-subtract-radicals, gcf-lcm-applications)
   - 60 missing topics identified across statistics, geometry, division, measurement, multiplication, ratios, equations, linear functions, counting, algebra thinking, polynomials, probability

3. [x] [IMP] Execute graph expansion — K-2 strands:
   - Added: count-forward-from, count-by-twos, count-by-fives (counting); multiply-repeated-addition (multiplication)
   - Added: units-of-length, units-of-volume-capacity (measurement)

4. [x] [IMP] Execute graph expansion — 3-5 strands:
   - Added: multiply-place-value, multiply-ending-zeros (multiplication)
   - Added: interpreting-remainders, division-area-model, division-partial-quotients, divide-by-two-digit, divide-larger-numbers (division)
   - Added: convert-customary-length, convert-metric-length, convert-units-mass, convert-units-volume, convert-units-time, convert-units-area (measurement)
   - Added: generating-patterns, graphing-patterns, represent-comparisons-equations (algebra thinking)
   - Added: larger-exponents, exponents-whole-expressions (exponents)
   - Added: divisibility-rules-3-6-9, fractions-as-division, reciprocals-intro (number/fractions)

5. [x] [IMP] Execute graph expansion — 6-8 strands:
   - Split: 7 compound topics into 14 atomic topics (rational numbers, polynomials, radicals, etc.)
   - Added: quartiles-iqr, compare-data-center, compare-data-spread, symmetry-skew-data, dot-plot-measures, variance-std-dev, sample-spaces-events, experimental-probability-data, complement-events, venn-diagrams-probability (statistics/probability)
   - Added: segment-bisectors, congruent-segments, congruent-angles, midpoints, midpoints-coordinate, triangle-inequality-theorem, exterior-angles-triangles, collinear-points, segment-addition-postulate, nets-polyhedrons, faces-vertices-edges (geometry-advanced)
   - Added: equations-unknown-coefficients, equations-clearing-fractions, interval-notation, equations-trial-error (expressions-equations)
   - Added: modeling-linear-equations, consistency-dependency-systems, two-variable-equations-solutions (linear functions)
   - Added: equivalent-ratios-advanced, graphing-ratios, find-original-from-percent-increase, find-original-from-percent-decrease (ratios)
   - Added: natural-integers-rationals, polynomial-expressions (number system, polynomials)

6. [x] [VAL] Validate expanded graph:
   - `just validate-content` — 0 errors ✓
   - `just visualize math` — 772 topics, proper DAG structure ✓
   - Metrics: prereq density 1.46/topic (≥1.4 ✓), encompassing density 0.96/topic
   - `just import-content` — D1 import succeeds, no cycles ✓

7. [x] [DOC] Update expansion-map.md and CLAUDE.md:
   - Documented all splits with heuristic justification in expansion-map.md
   - Updated CLAUDE.md graph stats: 772 topics, 1.46 prereq density, 0.96 encompassing density
   - Expansion script preserved at `tools/expand-graph.py`

**Validation:** Expanded graph passes `just validate-content`. Topic count is ~800-1,000. Prerequisite density ≥1.4/topic. Visual inspection shows proper DAG structure. D1 import succeeds. Expansion documented.

---

## Phase 1: Generator Architecture & Shared Utilities ✓

**Goal:** Define the generator interface, shared utility stack (ProblemBuilder, ExampleBuilder, LessonBuilder), registry, output pipeline, and the "generate → verify → commit" workflow. The shared utilities are the backbone — they handle formatting, dimensions, hints, demand, and lesson assembly so that per-topic generators stay small and focused on mathematical correctness.

### Context for Execution

The existing `tools/generators/` directory has 47 generators across 6 files organized by strand (`k5-arithmetic.ts`, `k5-fractions.ts`, `k5-numbers.ts`, `middle-algebra.ts`, `middle-geometry.ts`, `middle-rational.ts`). Each file exports multiple `Generator` objects with a `generate(difficulty, index, rng) => Problem` signature. The `tools/generate-problems.ts` runner iterates the registry and writes to `problems-generated/`.

**Problems with the current approach:**
- Generators produce fully-formed `Problem` objects — every generator manually constructs id, topicId, difficulty, hints, cognitiveDemand, source
- No example generation, no lesson generation
- All labeled `cognitiveDemand: "procedural"` — no variation
- Difficulty-based (easy/medium/hard) — eliminated per plan 028
- Single-hint pattern (`["Start with X and count up Y more."]`) — not progressive
- No self-check: generated answer isn't verified against a recomputation

**Design principle:** Generators should be as small as possible. A generator for `add-two-digit-regroup` should be ~20 lines that produce `{ question: "47 + 35 = ?", answer: 82, solution: "Add ones: 7+5=12, carry 1. Add tens: 4+3+1=8. Answer: 82.", steps: [...] }`. Everything else (hints, demand, dimensions, type, id, worked examples, lessons) is the shared utility's job.

**Shared utility stack:**

```
TopicGenerator (per-topic, ~20 lines)
  exports: generate(rng: SeededRng) → RawProblem
  RawProblem = { question: string; answer: string | number; solution: string; steps?: string[]; variant?: string }

ProblemBuilder (shared)
  buildProblems(generator, topicMeta, config) → Problem[]
  - Runs generator N times with different seeds
  - Deduplicates (by answer or question text)
  - Assigns IDs: `${topicId}-${index}`
  - Applies dimension defaults from graph.json topic metadata (presentation, contentDepth, locale, flavor)
  - Generates progressive hints from solution/steps (template-based, 2-3 per problem)
  - Assigns cognitiveDemand variation per DEMAND_PROFILES for the topic's presentation level
  - Assigns assessment type (numerical-input for numeric answers, text-qa otherwise)
  - Sets source: "generated"
  - Omits difficulty field entirely (per 028)

ExampleBuilder (shared)
  buildExamples(problems, topicMeta) → WorkedExample[]
  - Selects 2 representative problems (different variants if available)
  - Converts each into WorkedExampleStep[] format:
    - subgoalLabel from step description or auto-generated
    - instruction from solution steps
    - work showing the computation
    - explanation from the "why" of each step
  - Applies dimension defaults

LessonBuilder (shared)
  buildLesson(topicMeta, examples, practiceProblems) → Lesson
  - Generates explanation section from topic metadata (name, description, prerequisites context)
  - Embeds first worked example as worked-example section
  - Embeds 2-3 problems as practice section
  - Applies dimension defaults
  - Follows section ordering rules (explanation → worked-example → practice)

OutputWriter (shared)
  writeTopicContent(topicId, { problems, examples, lessons }) → void
  - Validates all output against schema before writing
  - Runs answer self-check (re-parse question, verify answer matches)
  - Writes problems/<topic-id>.json, examples/<topic-id>.json, lessons/<topic-id>.json
  - Reports any validation failures
```

**Why this design matters for maintainability:**
- Adding a new required field to Problem? Change ProblemBuilder once, not 800+ generators.
- Changing hint generation strategy? Change ProblemBuilder once.
- Changing lesson section ordering? Change LessonBuilder once.
- Changing demand profiles? Change ProblemBuilder's demand assignment once.
- Each per-topic generator is ~20-50 lines of pure math — easy to audit, easy to regenerate.

### Steps

1. [x] [RSH] Analyze existing `tools/generators/` to extract common patterns and identify what works well vs. what's missing:
   - Review `types.ts` (Generator, Problem, SeededRng interfaces)
   - Review 2-3 generator files to understand the pattern (k5-arithmetic.ts, k5-fractions.ts, middle-algebra.ts)
   - Identify gaps: no example generation, no lesson generation, no hint generation, no cognitive demand variation, all labeled `source: "generated"` with `cognitiveDemand: "procedural"`, difficulty-based
   - Document findings for the new architecture design
   - Catalog which math-utils functions to preserve vs replace

2. [x] [IMP] Define the new generator types in `learn-content/math/generators/types.ts`:
   - `RawProblem`: `{ question: string; answer: string | number; solution: string; steps?: string[]; variant?: string }`
   - `TopicGenerator`: `{ topicId: string; generate: (rng: SeededRng) => RawProblem; conceptText?: string }`
   - `TopicMeta`: `{ id, name, description, gradeLevel, strand, defaultPresentation, contentDepth }` (loaded from graph.json)
   - `GenerateConfig`: `{ problemCount: number; exampleCount: number; seed: number }`
   - `GeneratedContent`: `{ problems: Problem[]; examples: WorkedExample[]; lessons: Lesson[] }`
   - `PromptTemplateGenerator` interface (for interpretive disciplines, initial sketch): `{ topicId: string; discipline: string; template: PromptTemplate; postProcess: (llmOutput: string) => GeneratedContent }` — later refined in Phase 2: removed `postProcess`, added `conceptText`, `reviewChecklist`, `Perspective`, `RubricDimension` types
   - `PromptTemplate`: `{ systemPrompt: string; factAnchors: string[]; depthConstraints: Record<ContentDepthLevel, string>; rubric?: string[] }` — later extended in Phase 2 with `perspectives`, `rubricDimensions`, `sourceRequirements`
   - Export `SeededRng` and `createRng` (port from existing `tools/generators/types.ts`)
   - `defineGenerator(config: { topicId: string; generate: (rng: SeededRng) => RawProblem; conceptText?: string }): TopicGenerator` — convenience factory

3. [x] [IMP] Build the shared utility stack at `learn-content/math/generators/builders/`:
   - `builders/problem-builder.ts`: `buildProblems(generator, meta, config) → Problem[]` — runs generator N times, deduplicates, applies dimensions/hints/demand/type/IDs
   - `builders/example-builder.ts`: `buildExamples(problems, meta, count) → WorkedExample[]` — selects representative problems, converts to step-by-step format
   - `builders/lesson-builder.ts`: `buildLesson(meta, examples, problems) → Lesson` — assembles explanation + example + practice sections
   - `builders/output-writer.ts`: `writeTopicContent(topicId, content, outputDir) → void` — validates and writes all JSON files
   - `builders/hint-generator.ts`: `generateHints(question, answer, solution, steps?) → string[]` — template-based progressive hints
   - `builders/answer-verifier.ts`: `verifyAnswer(raw: RawProblem) → { valid, issue? }` — re-parses answers, checks for NaN/Infinity, validates non-empty

4. [x] [IMP] Create the generator registry and runner:
   - `index.ts`: Static registry — each generator file exports a `TopicGenerator`, `index.ts` imports them explicitly into `Record<string, TopicGenerator>`. Type-safe, no dynamic imports.
   - `run.ts`: CLI runner — `npx tsx learn-content/math/generators/run.ts [--topic <id>] [--strand <name>] [--grade <n>] [--count 15] [--seed 42] [--verify] [--dry-run]`
   - For each topic: `ProblemBuilder → ExampleBuilder → LessonBuilder → OutputWriter`
   - Output summary: topics generated, problems/examples/lessons per topic, verification results

5. [x] [IMP] Port math utility library to `learn-content/math/generators/math-utils.ts`:
   - Port from existing `tools/generators/math-utils.ts`: gcd, lcm, simplifyFraction, fractionToString, isPrime, primeFactors, allFactors, randomFraction, randomProperFraction, roundTo
   - Add: `formatAnswer(value, format: "fraction" | "decimal" | "integer" | "mixed-number"): string`
   - Add: `mixedNumberToString(whole, num, den): string`
   - Add: `evaluateExpression(expr: string): number` — basic arithmetic expression evaluator for self-check

6. [x] [IMP] Port one existing generator as a reference implementation:
   - Choose `equivalent-fractions-3` (simple, well-understood, existing generator in `k5-fractions.ts`)
   - Create `learn-content/math/generators/equivalent-fractions-3.ts` as the canonical example
   - Generator should be ~30 lines: produce `{ question, answer, solution, steps }` only
   - Shared utilities produce the full 15 problems + 2 examples + 1 lesson
   - Run the pipeline, verify output matches expected format
   - Compare quality against existing hand-authored content

7. [x] [DOC] Document the generator architecture at `docs/generator-architecture.md`:
   - Architecture overview: per-topic generators + shared utility stack
   - The `RawProblem` → `Problem` → `WorkedExample` → `Lesson` flow
   - Per-topic generator file convention and `defineGenerator` usage
   - How to write a new generator (step-by-step guide with example)
   - Shared utility API reference (ProblemBuilder, ExampleBuilder, LessonBuilder)
   - The generate → verify → commit workflow
   - How generators interact with `/generate-content` slash command
   - Prompt-template spec for interpretive disciplines (initial sketch — completed in Phase 2)
   - Migration plan: existing content → generated content

8. [x] [IMP] Update `/generate-content` slash command (`.workflow/commands/generate-content.md`):
   - Add generator-first workflow: check if a generator exists for the topic before LLM-authoring
   - For topics with generators: run the generator pipeline (shared utilities handle everything)
   - For topics without generators: write a generator first (using Claude Code), then run it
   - Remove difficulty distribution targets ("30% easy / 40% medium / 30% hard") — difficulty eliminated
   - Update the "How content is created" section in CLAUDE.md

**Validation:** Reference generator (`equivalent-fractions-3`) produces valid content that passes `just validate-content`. Generated output includes 15 problems + 2 worked examples + 1 lesson. Runner CLI works end-to-end. Shared utilities correctly apply dimensions, hints, demand, and lesson assembly. Generator architecture documented. Types compile.

---

## Phase 2: Prompt-Template Spec for Interpretive Disciplines ✓

**Goal:** Design and document the prompt-template generator pattern for non-deterministic disciplines (history, ELA, philosophy, vocabulary). Build one PoC. This completes the architecture design work before bulk generator writing begins.

### Context for Execution

Interpretive disciplines can't use deterministic generators — there's no code that computes "the correct interpretation of the American Revolution." But the generator concept still applies: a structured prompt template constrains the LLM's output, ensuring:
- Questions are grounded in declared facts/sources (not hallucinated)
- Answer rubrics are explicit and consistent
- Depth levels are respected (survey vs analytical vs synthesis)
- Prerequisite assumptions are honored

### Steps

1. [x] [RSH] Study the content-system.md rules for context-layered and flexible disciplines:
   - Studied §3 (progression models), §5 (depth levels), §9 (context-layered), §11 (flexible), §16 (cognitive demand)
   - Context-layered: spiral curriculum, 4 depth levels, mostly `recommended` edges, rubric-based scoring at contextual+
   - Flexible: `enriching` edges, recall-based, mainly survey depth
   - Assessment scales from binary (survey) → rubric partial credit (contextual) → multi-dimensional rubric (analytical) → holistic rubric (synthesis)
   - Presentation and depth are independent dimensions — a 14-year-old gets standard presentation at survey depth

2. [x] [IMP] Define the prompt-template generator types (already sketched in Phase 1 types):
   - Fleshed out `PromptTemplate` with: `perspectives[]`, `rubricDimensions[]`, `sourceRequirements[]`
   - Added `Perspective` type: `{ label, description, sourceExcerpt? }` for multi-viewpoint questions
   - Added `RubricDimension` type: `{ name, description, levels[] }` for structured non-binary scoring
   - Extended `DepthConstraint` with: `assessmentGuidance`, `minPerspectives` (0 for survey, 2+ for analytical)
   - Added `definePromptTemplate()` convenience factory (parallel to `defineGenerator()`)
   - Added `reviewChecklist` to `PromptTemplateGenerator` for post-generation quality checks
   - Removed `postProcess` callback — prompt templates guide Claude Code sessions, not automated LLM calls

3. [x] [IMP] Build one PoC prompt-template generator:
   - Chose history topic `causes-of-revolution` (Grade 4, D2.His.14.3-5)
   - Created `../learn-content/history/generators/causes-of-revolution.ts` with 9 fact anchors, 3 perspectives, 4 depth constraints, 3 rubric dimensions
   - Created `../learn-content/history/generators/prompt-builder.ts` — shared utility rendering templates into structured prompts
   - Created `../learn-content/history/generators/render-prompt.ts` — CLI for rendering prompts at specific depth/presentation
   - Tested: `npx tsx history/generators/render-prompt.ts causes-of-revolution survey` ✓
   - Tested: `npx tsx history/generators/render-prompt.ts causes-of-revolution analytical --presentation advanced` ✓

4. [x] [DOC] Complete the prompt-template section of `docs/generator-architecture.md`:
   - Full architecture overview (PromptTemplateGenerator → PromptBuilder → Claude Code session)
   - Complete type reference with all new types
   - Step-by-step "writing a prompt-template generator" guide with code example
   - Depth-assessment mapping table (survey → binary, contextual → rubric, etc.)
   - Comparison table: deterministic vs prompt-template generators
   - File layout for prompt-template generators
   - Updated migration plan to show Phase 2 complete

**Validation:** Prompt-template generator spec is complete and documented. History `causes-of-revolution` has a working PoC that renders structured prompts at all 4 depth levels. The pattern is ready for future discipline buildout.

---

## Phase 3: Math Generators — K-2 Strands (counting, arithmetic, place-value) ✓

**Goal:** Write bespoke generators for all K-2 math topics (topic count determined by Phase 0 expansion — currently ~85, may grow). Port existing bulk generators into per-topic files. Each generator produces problems + examples + lessons via the shared utility stack.

**Note:** This is the first Sonnet phase. The architecture, types, shared utilities, reference implementation, and prompt-template spec are all complete from Phases 0-2. From here through Phase 7, execution is formulaic: write per-topic generators using `defineGenerator` and the shared utility stack.

### Context for Execution

**⚠️ READ FIRST — Before writing any generators, read these files to understand the pattern:**
1. `../learn-content/math/generators/equivalent-fractions-3.ts` — **Reference generator.** This is the canonical example of how every generator should look: `defineGenerator({ topicId, generate(rng) → RawProblem, conceptText })`. ~40 lines. Study this first.
2. `../learn-content/math/generators/types.ts` — `RawProblem`, `TopicGenerator`, `defineGenerator`, `SeededRng` types.
3. `../learn-content/math/generators/builders/` — Shared builders. Do NOT duplicate their work in generators. Generators produce `{ question, answer, solution, steps?, variant? }` only.
4. `../learn-content/math/generators/math-utils.ts` — Shared math functions (gcd, lcm, simplifyFraction, etc.). Import from here, don't rewrite.
5. `docs/generator-architecture.md` — Full architecture reference.

**Key rules for writing generators:**
- Each generator is one file: `../learn-content/math/generators/<topic-id>.ts`
- Default export via `defineGenerator({ topicId, generate, conceptText? })`
- `generate(rng)` returns `RawProblem` only — NO IDs, NO hints, NO dimensions, NO cognitiveDemand, NO source
- Include `conceptText` (2-4 sentences explaining the concept) — this becomes the lesson's explanation section. Without it, the lesson falls back to the bare topic description from graph.json, which is too terse.
- Use `rng.int()`, `rng.pick()`, `rng.shuffle()`, `rng.chance()` for randomization — never `Math.random()`
- Provide `steps[]` (2-4 strings) for good hint generation and worked example quality
- Provide `variant` when a generator has meaningfully different question shapes (e.g., "find-equivalent" vs "find-missing")
- **After writing each generator file, add its import to `../learn-content/math/generators/index.ts`** — unregistered generators won't be found by the runner

**Running generators (from learn-content/ directory):**
```bash
cd ../learn-content
npx tsx math/generators/run.ts --topic <topic-id>          # single topic
npx tsx math/generators/run.ts --strand counting-cardinality  # all topics in strand
npx tsx math/generators/run.ts --grade 0                    # all grade K topics
npx tsx math/generators/run.ts --seed 42                    # all registered generators
```

The existing `tools/generators/` has generators for many K-5 topics but they're organized by strand in bulk files. This phase ports them into per-topic files and fills gaps. Execute per-strand, validating after each.

**Strand coverage targets (current counts, may change after Phase 0):**
- counting-cardinality: ~15 topics (grade K) — no existing generators
- operations-addition: ~25 topics (grades K-2) — existing generators in k5-arithmetic.ts
- operations-subtraction: ~20 topics (grades K-2) — existing generators in k5-arithmetic.ts
- number-base (K-2 subset): ~25 topics (grades K-2) — existing generators in k5-numbers.ts

### Steps

1. [x] [IMP] Write generators for counting-cardinality (all topics in strand):
   - One file per topic under `../learn-content/math/generators/`, each using `defineGenerator`
   - Add each generator's import to `../learn-content/math/generators/index.ts` registry
   - No existing generators for this strand — write from scratch
   - Generator produces `{ question, answer, solution, steps }` only — shared utilities do the rest
   - Include `conceptText` for each (2-4 sentences explaining the concept for the lesson)
   - Each produces 15 problems + 2 worked examples + 1 lesson (via shared stack)
   - Run: `cd ../learn-content && npx tsx math/generators/run.ts --strand counting-cardinality`
   - Validate: `just validate-content`

2. [x] [IMP] Port `tools/generators/k5-arithmetic.ts` into per-topic files for addition + subtraction:
   - One file per topic under `../learn-content/math/generators/`
   - Add each to `../learn-content/math/generators/index.ts` registry
   - Strip difficulty logic — generators no longer differentiate easy/medium/hard
   - Strip hint generation, ID generation, dimension fields, cognitiveDemand — shared stack handles all
   - What remains: the pure math (number ranges, operation logic, solution step text)
   - Add `conceptText` for each generator
   - Validate: `just validate-content`

3. [x] [IMP] Port `tools/generators/k5-numbers.ts` place-value generators into per-topic files:
   - Same refactoring pattern: strip everything except math, let shared utilities handle the rest
   - Add each to `../learn-content/math/generators/index.ts` registry, include `conceptText`
   - Validate: `just validate-content`

4. [x] [VAL] Run generation and validation for K-2:
   - `cd ../learn-content && npx tsx math/generators/run.ts --grade 0 --seed 42 && npx tsx math/generators/run.ts --grade 1 --seed 42 && npx tsx math/generators/run.ts --grade 2 --seed 42`
   - `just validate-content` — 0 errors
   - Spot-check 5 topics across strands: verify problems are correct, examples make sense, lessons are coherent
   - Verify lesson pipeline: `just generate-bundles --discipline math --lenient` includes lessons

**Validation:** All K-2 math topics have generators. Generated content (problems + examples + lessons) passes validation. Lessons render correctly in the lesson pipeline.

---

## Phase 4: Math Generators — 3-5 Strands (fractions, measurement, data) ✓

**Goal:** Write bespoke generators for all grade 3-5 math topics. Port existing fraction and arithmetic generators, fill gaps in measurement and data-statistics.

### Context for Execution

**Same generator pattern as Phase 3.** Read the Phase 3 "Context for Execution" section if resuming from here — it has the full reference file list, key rules, and CLI instructions. All generators use `defineGenerator`, include `conceptText`, and are registered in `../learn-content/math/generators/index.ts`.

The content review found fractions have 19 error findings (unsimplified answers, wrong answer fields). Generators fix these by construction — the shared ProblemBuilder uses `simplifyFraction` from math-utils, and the answer verifier catches any remaining issues.

**Strand coverage targets (current counts, may change after Phase 0):**
- fractions: ~66 topics (grades 3-5) — reviewed, 19 errors found. Existing generators in k5-fractions.ts.
- operations-multiplication: ~30 topics (grades 3-4) — existing generators in k5-arithmetic.ts
- operations-division: ~25 topics (grades 3-4) — existing generators in k5-arithmetic.ts
- number-base (3-5 subset): remaining topics — existing generators in k5-numbers.ts
- measurement-data: ~35 topics (grades K-5) — no existing generators
- algebra-thinking: ~26 topics (grades 3-5) — no existing generators

### Steps

1. [x] [IMP] Port `tools/generators/k5-fractions.ts` into per-topic files (all fraction topics):
   - One file per topic in `../learn-content/math/generators/`, register each in `index.ts`
   - Specifically address the 19 error findings (wrong answers in fraction-number-sense, fraction-decimal-percent; unsimplified answer patterns; missing prerequisite assumptions)
   - Strip difficulty/hint/dimension logic — shared utilities handle these
   - Fraction generators should use math-utils `simplifyFraction` for all answers
   - Include `conceptText` for each generator
   - Validate: `just validate-content`

2. [x] [IMP] Port remaining `k5-arithmetic.ts` generators for multiplication-division:
   - Same per-topic refactoring pattern: strip to pure math, let shared stack handle the rest
   - Register each in `../learn-content/math/generators/index.ts`, include `conceptText`
   - Validate: `just validate-content`

3. [x] [IMP] Write new generators for measurement-data (~35 topics) and algebra-thinking (~26 topics):
   - No existing generators for these strands — write from scratch
   - Measurement: unit conversion, perimeter, area, volume, time, money
   - Algebra thinking: patterns, equations, unknowns (pre-algebra concepts)
   - Register each in `../learn-content/math/generators/index.ts`, include `conceptText`
   - Validate: `just validate-content`

4. [x] [VAL] Run generation and validation for 3-5:
   - `cd ../learn-content && npx tsx math/generators/run.ts --grade 3 --seed 42 && npx tsx math/generators/run.ts --grade 4 --seed 42 && npx tsx math/generators/run.ts --grade 5 --seed 42`
   - `just validate-content` — 0 errors
   - Spot-check 10 topics across strands (prioritize fractions)
   - Run `/content-review math --strand fractions` on generated content — expect all A/B grades, 0 answer-correctness errors

**Validation:** All 3-5 math topics have generators. Generated content passes validation. Fractions content review shows zero answer-correctness errors (was 19). Spot-check confirms quality improvement over hand-authored content.

---

## Phase 5: Math Generators — 6-8 Algebra & Equations

**Goal:** Write generators for expressions-equations, ratios-proportions, and rational-numbers topics. These are the highest-error strands.

### Context for Execution

**Same generator pattern as Phase 3.** Read the Phase 3 "Context for Execution" section if resuming from here — it has the full reference file list, key rules, and CLI instructions.

The content review found expressions-equations had 37 error findings (most critical). The dominant issue was wrong answer fields — answer/solution mismatches where the solution was correct but the answer field had stale/wrong values. Generators eliminate this entirely since the answer is computed, not copy-pasted.

**Strand coverage targets (current counts, may change after Phase 0):**
- expressions-equations: ~55 topics (grades 6-8) — reviewed, 37 errors found
- ratios-proportions: ~47 topics (grades 6-7)
- rational-numbers: ~51 topics (grades 6-7) — existing generators in middle-rational.ts

### Steps

1. [ ] [IMP] Port `tools/generators/middle-algebra.ts` and `middle-rational.ts` into per-topic files:
   - One file per topic in `../learn-content/math/generators/`, register each in `index.ts`
   - Specifically address the 37 error findings (wrong answer fields in equations-variables-both-sides, multi-step-equations-combining, combining-exponent-rules, etc.)
   - For topics involving symbolic algebra: generators produce the equation/expression structure, compute the answer, then template the question text
   - Strip difficulty/hint/dimension logic — shared utilities handle these
   - Include `conceptText` for each generator
   - Validate: `just validate-content`

2. [ ] [IMP] Write generators for ratios-proportions:
   - Port existing generators where available, write new ones for gaps
   - Register each in `../learn-content/math/generators/index.ts`, include `conceptText`
   - Validate: `just validate-content`

3. [ ] [VAL] Run generation and validation:
   - `cd ../learn-content && npx tsx math/generators/run.ts --strand expressions-equations --seed 42 && npx tsx math/generators/run.ts --strand ratios-proportions --seed 42 && npx tsx math/generators/run.ts --strand rational-numbers --seed 42`
   - `just validate-content` — 0 errors
   - Run `/content-review math --strand expressions-equations` on generated content
   - Compare error count: should be 0 answer-correctness errors (was 19 across the strand)

**Validation:** All expressions-equations, rational-numbers, and ratios-proportions topics have generators. Content review shows zero answer-correctness errors.

---

## Phase 6: Math Generators — 6-8 Geometry, Stats, Functions

**Goal:** Complete generators for remaining grade 6-8 math topics.

### Context for Execution

**Same generator pattern as Phase 3.** Read the Phase 3 "Context for Execution" section if resuming from here — it has the full reference file list, key rules, and CLI instructions.

**Strand coverage targets (current counts, may change after Phase 0):**
- geometry: ~51 topics — existing generators in middle-geometry.ts
- geometry-advanced: ~55 topics (grade 8)
- statistics-probability: ~47 topics — no existing generators
- exponents-radicals: ~35 topics
- polynomials-intro: ~20 topics (grade 8)
- linear-functions: ~47 topics (grades 7-8)

### Steps

1. [ ] [IMP] Port `tools/generators/middle-geometry.ts` into per-topic files for geometry + geometry-advanced:
   - One file per topic in `../learn-content/math/generators/`, register each in `index.ts`
   - Same per-topic refactoring pattern: `defineGenerator`, `conceptText`, `steps[]`, `variant`
   - Geometry generators may need additional math-utils: area formulas, Pythagorean theorem, trig ratios — add to `../learn-content/math/generators/math-utils.ts`
   - Validate: `just validate-content`

2. [ ] [IMP] Write generators for statistics-probability, exponents-radicals, polynomials-intro, linear-functions:
   - Port existing generators where available, write new ones for gaps
   - Register each in `../learn-content/math/generators/index.ts`, include `conceptText`
   - Statistics: mean, median, mode, range, probability, data representation
   - Exponents: rules of exponents, scientific notation, radicals
   - Polynomials: basic polynomial operations, factoring
   - Linear functions: slope, intercept, graphing, systems
   - Validate after each strand: `just validate-content`

3. [ ] [VAL] Run generation and validation for all 6-8:
   - `cd ../learn-content && npx tsx math/generators/run.ts --grade 6 --seed 42 && npx tsx math/generators/run.ts --grade 7 --seed 42 && npx tsx math/generators/run.ts --grade 8 --seed 42`
   - `just validate-content` — 0 errors
   - Spot-check 10 topics across strands

**Validation:** All 6-8 math topics have generators. Generated content passes validation.

---

## Phase 7: Full Regeneration, Difficulty Removal & Cleanup

**Goal:** Regenerate ALL math content from generators. Remove the difficulty field entirely from the type system, validation, pipeline, and analytics. Remove legacy generator infrastructure. Establish quality baselines.

### Context for Execution

After Phases 3-6, every math topic has a generator. This phase runs them all at once, validates comprehensively, and performs the full cleanup of deprecated patterns.

**Difficulty removal scope:**
- `packages/shared/src/types.ts`: Remove `ProblemDifficulty` type, remove `difficulty` from `Problem`, remove `@deprecated` JSDoc
- `tools/validate-content.ts`: Remove difficulty validation (lines 162-166 warning on missing/invalid difficulty)
- `tools/generate-bundles.ts`: Remove `difficulties` from manifest `items.problems` (line 91, 297)
- `packages/api/src/services/analytics.ts`: Set `difficulty` blob to empty string in `ProblemAttemptEvent` (backward-compatible)
- `.workflow/commands/generate-content.md`: Remove "Difficulty distribution: 30% easy / 40% medium / 30% hard"

### Steps

1. [ ] [IMP] Full regeneration:
   - `cd ../learn-content && npx tsx math/generators/run.ts --seed 42 --verify` — generate all topics
   - `just validate-content` — 0 errors, 0 warnings
   - Commit all regenerated content: "feat(content): regenerate all math from generators (problems + examples + lessons)"

2. [ ] [VAL] Run content review on 3+ strands to validate quality:
   - `/content-review math --strand fractions` — compare against pre-generator review
   - `/content-review math --strand expressions-equations` — compare against pre-generator review
   - `/content-review math --strand geometry` — new strand, establish baseline
   - Target: 0 answer-correctness errors, <5% C-grade topics, 0 D/F topics

3. [ ] [IMP] Remove difficulty field from type system and pipeline:
   - Remove `ProblemDifficulty` type from `packages/shared/src/types.ts`
   - Remove `difficulty` field from `Problem` type entirely
   - Remove difficulty validation from `tools/validate-content.ts`
   - Remove `difficulties` from manifest type and computation in `tools/generate-bundles.ts`
   - Set analytics `difficulty` blob to `""` — backward-compatible
   - Note: difficulty distribution targets already removed from `/generate-content` command (done in Phase 1)
   - Run `just typecheck && just test` — fix any type errors or test references

4. [ ] [IMP] Remove legacy `tools/generators/` directory:
   - All generators now live in `../learn-content/math/generators/`
   - Remove `tools/generators/*.ts` (all 9 files)
   - Remove `tools/generate-problems.ts` (legacy runner)
   - Update justfile recipes: remove `just generate-problems`, ensure `just generate-content` delegates to new runner
   - Remove `problems-generated/` directory from learn-content (generators write directly to `problems/`)

5. [ ] [DOC] Record the migration in DECISIONS.md:
   - Note: the architecture decision (generator-produced content, hand-authoring deprecated) was already recorded in Phase 1 (2026-03-14)
   - Record: difficulty field removed from Problem type
   - Rationale: per-topic difficulty is a graph decomposition smell; all problems within a properly atomic topic test the same skill
   - Record: legacy `tools/generators/` removed, `learn-content/math/generators/` is sole source
   - Update CLAUDE.md generator references if needed

**Validation:** All math topics have generator-produced content (problems + examples + lessons). Content review shows dramatic quality improvement. Difficulty field fully removed. Legacy generator code removed. `just typecheck && just test` pass. Decisions documented.



> **Note:** Simulation & audit updates (previously Phase 8) have been merged into Plan 030 Phase 5 for a single unified pass across both generator and assessment changes.

---

## Design Notes

### Why one generator per topic (not parameterized)

Parameterized generators (e.g., one "fraction arithmetic" generator for 30 topics) seem efficient but create maintenance problems: changing the generator for one topic risks breaking others. Per-topic generators are:
- **Independently modifiable** — fix one topic without touching others
- **Self-documenting** — the generator IS the specification for that topic's content
- **Cheap to produce** — Claude Code can write a generator in seconds
- **Directly traceable** — `problems/add-fractions.json` was produced by `generators/add-fractions.ts`

### Why generators are small and shared utilities handle formatting

Per-topic generators should be ~20-50 lines of pure math logic. The shared utility stack (ProblemBuilder, ExampleBuilder, LessonBuilder) handles everything else: IDs, dimensions, hints, demand variation, assessment types, worked examples, and lessons.

**Benefits:**
- **Spec changes propagate automatically** — adding a required field to Problem changes ProblemBuilder once, not 800+ generators
- **Hint strategy is centralized** — change progressive hint templates in one place
- **Lesson composition is consistent** — every lesson follows the same structure
- **Cognitive demand mixing is uniform** — DEMAND_PROFILES applied consistently
- **Generators are auditable** — 20 lines of math is easy to verify; 200 lines of formatting + math is not

### Why generators live in learn-content (not learn-platform)

Content and its generators are co-located for the same reason source code and tests are co-located: they describe the same thing. A generator is the executable specification of a topic's content.

### Why regenerate all existing content

The content review found a 46% error rate (56 errors in 121 topics) in hand-authored content. The errors are systemic. Regenerating from generators fixes them all and establishes a quality floor going forward.

### Why graph expansion comes first

Writing a generator for a too-broad topic is wasted work. If `add-within-100` splits into 4 topics, the single generator gets thrown away. Expanding the graph first means each generator is written once for a properly atomic topic.

### Prompt-template generators vs deterministic generators

| | Deterministic | Prompt-Template |
|---|---|---|
| Disciplines | math, CS, grammar | history, ELA, philosophy, vocabulary |
| Answer source | Computed by code | Grounded in fact anchors |
| Correctness guarantee | Mathematical proof | Rubric + fact-checking |
| Variation | Seeded RNG for number/context variation | LLM creativity within constraints |
| Review needed | Format only | Content + factual accuracy |
| Example | `1/2 + 1/3 = 5/6` (code computes) | "What caused WWI?" (template constrains) |
