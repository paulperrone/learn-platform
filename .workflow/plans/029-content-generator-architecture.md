# Plan 029: Content Generator Architecture

> **Created:** 2026-03-14T17:03:41Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build a bespoke generator function for every topic that produces mathematically/factually correct content with full provenance. For math (PoC): TypeScript functions compute correct answers, then LLM wraps in pedagogy. For interpretive disciplines: structured prompt templates constrain LLM output with rubrics and fact-grounding. All 705 math topics get generators, all hand-authored content is regenerated. Concludes with vertical slice lesson authoring (from 028 P5) and simulation/audit updates (from 028 P6).

**Motivation:** Content review of fractions (66 topics) and expressions-equations (55 topics) found 56 error-level findings. The dominant issue: answer fields contradicting their own solutions (23 wrong answers across the two strands). These are LLM authoring mistakes that a deterministic generator would prevent entirely. Secondary issues (unsimplified answers, drafting artifacts in answer fields, inconsistent difficulty ordering) are also eliminated when code produces the content.

**Architecture:**

```
Deterministic (math, CS, grammar):
  Generator function → { question, answer, solution }  // code-guaranteed correct
       ↓
  LLM post-processing → { hints[], explanation sugar, word-problem wrappers }

Interpretive (history, ELA, philosophy):
  Prompt template → { topic context, depth level, question type, fact anchors }
       ↓
  LLM generation → { question, rubric-scored answer, explanation }
       ↓
  LLM review pass → verify against rubric, check prerequisite assumptions
```

**Key decisions:**
1. **One generator per topic** — bespoke, not parameterized. Cheap to generate, provides direct provenance.
2. **Generators live in learn-content** — alongside the content they produce. `learn-content/math/generators/<topic-id>.ts`.
3. **All existing hand-authored content will be regenerated** — generators are the single source of truth going forward.
4. **Existing `tools/generators/` (143 topics)** are the starting point — refactored into per-topic files in learn-content.

**Depends on:** Plan 028 Phases 1-4 (for Phases 6-7 of this plan, which need lesson types, pipeline, engine, and frontend)

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Generator Architecture & Types

**Goal:** Define the generator interface, registry, output pipeline, and the "generate → verify → commit" workflow. Establish the per-topic generator file convention.

### Context for Execution

The existing `tools/generators/` directory has 143 generators across 6 files organized by strand (`k5-arithmetic.ts`, `k5-fractions.ts`, `k5-numbers.ts`, `middle-algebra.ts`, `middle-geometry.ts`, `middle-rational.ts`). Each file exports multiple `Generator` objects with a `generate(difficulty, index, rng) => Problem` signature. The `tools/generate-problems.ts` runner iterates the registry and writes to `problems-generated/`.

The new architecture moves generators to `learn-content/math/generators/<topic-id>.ts` (one file per topic) and extends them to produce examples alongside problems. The runner produces `problems/<topic-id>.json` and `examples/<topic-id>.json` directly (replacing the `problems-generated/` intermediate directory).

**Key design questions to resolve:**
- Generator output: should generators produce the full Problem/Example JSON, or a reduced format that a post-processing step enriches with hints/explanations?
- LLM post-processing: when and how does the LLM add pedagogical sugar (hints, word-problem contexts, engaging phrasing)?
- Verification: how does the runner verify generated content before writing? (Answer self-check, format validation, duplicate detection)

### Steps

1. [ ] [RSH] Analyze existing `tools/generators/` to extract the common patterns and identify what works well vs. what's missing:
   - Review `types.ts` (Generator, Problem, SeededRng interfaces)
   - Review 2-3 generator files to understand the pattern
   - Identify gaps: no example generation, no hint generation, no cognitive demand variation, all labeled `source: "generated"` with `cognitiveDemand: "procedural"`
   - Document findings for the new architecture design

2. [ ] [IMP] Define the new generator types in `learn-content/math/generators/types.ts`:
   - `TopicGenerator` interface: `{ topicId: string; generate: (config: GenerateConfig) => GeneratedContent }`
   - `GenerateConfig`: `{ problemCount: number; exampleCount: number; rng: SeededRng; difficulty?: never /* eliminated per 028 */ }`
   - `GeneratedContent`: `{ problems: Problem[]; examples: WorkedExample[] }`
   - `PromptTemplateGenerator` interface (for interpretive disciplines): `{ topicId: string; discipline: string; template: PromptTemplate; postProcess: (llmOutput: string) => GeneratedContent }`
   - `PromptTemplate`: `{ systemPrompt: string; factAnchors: string[]; depthConstraints: Record<ContentDepth, string>; rubric?: string[] }`
   - Export `SeededRng` and `createRng` (port from existing `tools/generators/types.ts`)

3. [ ] [IMP] Create the generator registry and runner at `learn-content/math/generators/index.ts`:
   - Auto-discover generator files: scan `learn-content/math/generators/*.ts` (excluding `types.ts`, `index.ts`, `utils.ts`)
   - Each file exports a default `TopicGenerator`
   - Registry maps `topicId → generator`
   - Runner: `generateForTopic(topicId, config) → GeneratedContent`
   - Batch runner: `generateAll(config) → Map<topicId, GeneratedContent>`

4. [ ] [IMP] Create the generate-and-write pipeline at `learn-content/math/generators/run.ts`:
   - CLI: `npx tsx learn-content/math/generators/run.ts [--topic <id>] [--count 15] [--seed 42] [--verify] [--dry-run]`
   - For each topic: run generator → verify output (format, answer self-check) → write `problems/<topic-id>.json` and `examples/<topic-id>.json`
   - Verification step: validate all required fields present, hints array non-empty, solution non-empty, answer non-empty
   - `--verify` flag: run `just validate-content` after generation
   - `--dry-run` flag: generate and verify without writing files
   - Output summary: topics generated, problems/examples per topic, verification results

5. [ ] [IMP] Create a math utility library at `learn-content/math/generators/math-utils.ts`:
   - Port existing `tools/generators/math-utils.ts` (gcd, lcm, simplifyFraction, fractionToString, roundTo)
   - Add: `formatAnswer(value: number | string, format: "fraction" | "decimal" | "integer" | "mixed-number"): string`
   - Add: `verifyAnswer(question: string, statedAnswer: string, computedAnswer: string): boolean` — basic self-check
   - Add: `generateHints(question: string, answer: string, solution: string, steps: number): string[]` — template-based hint generation for math (progressive, not revealing answer)

6. [ ] [IMP] Port one existing generator as a reference implementation:
   - Choose `equivalent-fractions-3` (simple, well-understood, existing generator in `k5-fractions.ts`)
   - Create `learn-content/math/generators/equivalent-fractions-3.ts` as the canonical example
   - Should produce 15 problems (no difficulty field) + 2 worked examples
   - Problems should include varied `cognitiveDemand` (not all procedural)
   - Run the pipeline, verify output matches expected format
   - Compare quality against existing hand-authored content

7. [ ] [DOC] Document the generator architecture at `docs/generator-architecture.md`:
   - Architecture overview (deterministic vs prompt-template)
   - Per-topic generator file convention
   - How to write a new generator (step-by-step guide)
   - The generate → verify → commit workflow
   - Prompt-template spec for interpretive disciplines (design, not implementation — detailed in Phase 5)
   - How generators interact with `/generate-content` slash command
   - Migration plan: existing content → generated content

8. [ ] [IMP] Update `/generate-content` slash command (`.workflow/commands/generate-content.md`):
   - Add generator-first workflow: check if a generator exists for the topic before LLM-authoring
   - For topics with generators: run the generator, then optionally LLM-enrich hints/explanations
   - For topics without generators: write a generator first (using Claude Code), then run it
   - Update the "How content is created" section in CLAUDE.md

**Validation:** Reference generator (`equivalent-fractions-3`) produces valid content that passes `just validate-content`. Runner CLI works end-to-end. Generator architecture documented. Types compile.

---

## Phase 2: Math Generators — K-5 Strands

**Goal:** Write bespoke generators for ~200 K-5 math topics covering counting-cardinality, arithmetic, numbers, fractions, and measurement. Port existing bulk generators into per-topic files.

### Context for Execution

The existing `tools/generators/` has generators for many K-5 topics but they're organized by strand in bulk files. This phase ports them into per-topic files and fills gaps. The content review found these K-5 strands are generally high quality (mostly A/B grades) but have systemic issues:
- Unsimplified answer fields across ~15 fraction topics
- Missing prerequisite listings (mixed-number conversion assumed but not listed)
- Difficulty ordering issues in a few topics

Generators fix all of these by construction.

**Strand coverage targets:**
- counting-cardinality: ~15 topics (grade K)
- addition-subtraction: ~30 topics (grades K-2)
- multiplication-division: ~25 topics (grades 3-4)
- place-value: ~20 topics (grades K-4)
- fractions: ~66 topics (grades 3-5) — reviewed, 19 errors found
- measurement: ~25 topics (grades K-5)
- data-statistics-k5: ~15 topics (grades K-5)

### Steps

1. [ ] [IMP] Port existing `tools/generators/k5-arithmetic.ts` generators into per-topic files under `learn-content/math/generators/`:
   - One file per topic, each exporting a default `TopicGenerator`
   - Extend each to produce 2 worked examples (existing generators only produce problems)
   - Update hint generation to use progressive hints (not single-hint pattern)
   - Add `cognitiveDemand` variation (not all procedural)

2. [ ] [IMP] Port existing `tools/generators/k5-numbers.ts` and `k5-fractions.ts` generators:
   - Same per-topic refactoring as step 1
   - For fractions: specifically address the 19 error findings from the content review (wrong answers in fraction-number-sense, fraction-decimal-percent; unsimplified answer patterns; missing prerequisite assumptions in hard problems)

3. [ ] [IMP] Write new generators for K-5 topics without existing generators:
   - Identify uncovered topics by diffing the generator registry against `graph.json` topics with gradeLevel ≤ 5
   - Write generators for each uncovered topic
   - Focus on: counting-cardinality (all 15), measurement, data-statistics (these strands have no existing generators)

4. [ ] [VAL] Run full generation and validation for K-5:
   - `npx tsx learn-content/math/generators/run.ts --seed 42` (generate all K-5)
   - `just validate-content` — 0 errors
   - Spot-check 10 topics across strands for content quality
   - Run `/content-review math --strand counting-cardinality` on generated content — expect all A/B grades

**Validation:** All K-5 math topics have generators. Generated content passes validation. Spot-check confirms quality improvement over hand-authored content.

---

## Phase 3: Math Generators — 6-8 Strands

**Goal:** Complete generators for remaining ~500 grade 6-8 math topics covering ratios, geometry, statistics, expressions-equations, and functions.

### Context for Execution

The content review found significantly more issues in the 6-8 content (expressions-equations had 37 error findings vs 19 for fractions). The dominant issue was wrong answer fields — answer/solution mismatches where the solution was correct but the answer field had stale/wrong values. Generators eliminate this entirely since the answer is computed, not copy-pasted.

**Strand coverage targets:**
- expressions-equations: ~55 topics — reviewed, 37 errors found (most critical)
- ratios-proportions: ~30 topics
- geometry: ~50 topics
- statistics-probability: ~30 topics
- number-system: ~25 topics
- functions: ~15 topics

### Steps

1. [ ] [IMP] Port existing `tools/generators/middle-algebra.ts`, `middle-geometry.ts`, `middle-rational.ts` into per-topic files:
   - Same pattern as Phase 2 step 1
   - For expressions-equations: specifically address the 37 error findings (wrong answer fields in equations-variables-both-sides, multi-step-equations-combining, combining-exponent-rules, etc.)

2. [ ] [IMP] Write new generators for 6-8 topics without existing generators:
   - Prioritize expressions-equations strand (most errors found)
   - Then ratios-proportions, geometry, statistics, number-system, functions
   - For topics involving symbolic algebra: generators produce the equation/expression structure, compute the answer, then template the question text

3. [ ] [VAL] Run full generation and validation for 6-8:
   - Generate all 6-8 topics
   - `just validate-content` — 0 errors
   - Run `/content-review math --strand expressions-equations` on generated content
   - Compare error count: should be 0 answer-correctness errors (was 19)

**Validation:** All 6-8 math topics have generators. Generated content passes validation. Content review shows zero answer-correctness errors in expressions-equations (was 19).

---

## Phase 4: Full Regeneration & Validation

**Goal:** Regenerate ALL math content from generators, run comprehensive content review, establish quality baselines.

### Steps

1. [ ] [IMP] Full regeneration:
   - `npx tsx learn-content/math/generators/run.ts --seed 42 --verify` — generate all 705 topics
   - `just validate-content` — 0 errors, 0 warnings
   - Commit all regenerated content with clear provenance: "feat(content): regenerate all math content from generators"

2. [ ] [VAL] Run content review on 3+ strands to validate quality:
   - `/content-review math --strand fractions` — compare against pre-generator review
   - `/content-review math --strand expressions-equations` — compare against pre-generator review
   - `/content-review math --strand geometry` — new strand, establish baseline
   - Target: 0 answer-correctness errors, <5% C-grade topics, 0 D/F topics

3. [ ] [IMP] Remove legacy `tools/generators/` directory:
   - All generators now live in `learn-content/math/generators/`
   - Remove `tools/generators/*.ts`
   - Update `tools/generate-problems.ts` to delegate to the new runner (or remove if fully replaced)
   - Update justfile recipes (`just generate-problems` → `just generate-content`)
   - Remove `problems-generated/` directory pattern — generators write directly to `problems/`

4. [ ] [DOC] Record the migration in DECISIONS.md:
   - Decision: all content is generator-produced, hand-authoring is deprecated
   - Rationale: content review found 56 errors in 121 topics (46% error rate), mostly wrong answer fields
   - Impact: generators guarantee answer correctness by construction

**Validation:** All 705 math topics have generator-produced content. Content review shows dramatic quality improvement. Legacy generator code removed. Decision documented.

---

## Phase 5: Prompt-Template Spec for Interpretive Disciplines

**Goal:** Design and document the prompt-template generator pattern for non-deterministic disciplines (history, ELA, philosophy, vocabulary). Build one PoC.

### Context for Execution

Interpretive disciplines can't use deterministic generators — there's no code that computes "the correct interpretation of the American Revolution." But the generator concept still applies: a structured prompt template constrains the LLM's output, ensuring:
- Questions are grounded in declared facts/sources (not hallucinated)
- Answer rubrics are explicit and consistent
- Depth levels are respected (survey vs analytical vs synthesis)
- Prerequisite assumptions are honored

### Steps

1. [ ] [RSH] Study the content-system.md rules for context-layered and flexible disciplines:
   - How depth levels work (survey/contextual/analytical/synthesis)
   - How presentation levels interact with depth for interpretive content
   - What "rubric-based scoring" means for the platform's grading

2. [ ] [IMP] Define the prompt-template generator types (already sketched in Phase 1 types):
   - Flesh out `PromptTemplate` with concrete fields for fact anchoring, source requirements, perspective count targets
   - Define `FactAnchor = { claim: string; source: string; confidence: "established" | "debated" | "interpretive" }`
   - Define `DepthConstraint` per depth level: what the LLM must/must not include
   - Define the review pass: how the generator self-checks its output against the template constraints

3. [ ] [IMP] Build one PoC prompt-template generator:
   - Choose a discipline (e.g., a small history or ELA topic)
   - Write the template with fact anchors, depth constraints, and rubric
   - Run it to produce problems + examples
   - Validate output quality manually

4. [ ] [DOC] Complete the prompt-template section of `docs/generator-architecture.md`:
   - Full specification with examples
   - How prompt templates interact with `/generate-content`
   - Quality gates for prompt-template-generated content
   - Comparison table: deterministic vs prompt-template generators

**Validation:** Prompt-template generator spec is complete and documented. One PoC discipline has a working prompt-template generator. The pattern is ready for future discipline buildout.

---

## Phase 6: Vertical Slice — Lesson Authoring (was 028 Phase 5)

**Goal:** Author lessons for the counting-cardinality strand (~15 topics) using generators, flatten difficulty fields, validate the full lesson pipeline end-to-end.

**Depends on:** Plan 028 Phases 1-4 complete (lesson types, pipeline, engine, frontend).

### Steps

1. [ ] [IMP] Extend generators to produce lesson content:
   - Update `GeneratedContent` type to include `lessons: Lesson[]`
   - Update counting-cardinality generators to produce 1 lesson per topic (3-5 sections: explanation → worked-example → practice)
   - Lesson explanation sections teach the core concept concisely
   - Worked-example sections reuse the generator's example output
   - Practice sections embed 2-3 problems from the generator's problem output

2. [ ] [IMP] Generate lessons for all 15 counting-cardinality topics:
   - Run generators with lesson output enabled
   - Write to `../learn-content/math/lessons/<topic-id>.json`
   - `just validate-content` — passes with lessons

3. [ ] [IMP] Flatten difficulty field on counting-cardinality problems:
   - Remove `difficulty` from generated output (generators don't produce it per 028 design)
   - Verify all problems test the same core skill per topic
   - Document any topics that seem too broad (candidates for future splitting)

4. [ ] [VAL] End-to-end dev test:
   - `just import-content` + `just dev`
   - Start a session → lesson renders for first new topic
   - Complete lesson → guided practice within lesson works
   - Return for review → problem only, "Show Lesson" button works
   - Test scaffolding: open lesson during review → guided mode
   - `just typecheck && just test` — all pass

5. [ ] [DOC] Update content review rubric (`audit/content/review-rubric.md`):
   - Add criterion 8: Lesson Quality
   - Modify criterion 3: Difficulty Calibration → Problem Equivalence
   - Update `/content-review` context assembler to include lessons

**Validation:** All 15 counting-cardinality topics have generated lessons. Full pipeline works end-to-end. A user can experience lesson → practice → review flow in the browser. Rubric updated.

---

## Phase 7: Simulation & Audit Updates (was 028 Phase 6)

**Goal:** Update simulation runner, evaluation system, and audit infrastructure for the simplified learning loop. Establish new baselines.

**Depends on:** Plan 028 Phases 1-4 complete (new phase model in engine) + Phase 6 complete (content available).

### Steps

1. [ ] [IMP] Update simulation runner for simplified phase model:
   - In `runner.ts`: handle `type: "lesson"` session items — simulate viewing all sections and completing practice
   - Remove phase-specific logic for `pretest`, `instruction`, `guided`, `independent`
   - Update `StateSnapshot` to remove phase-specific fields

2. [ ] [IMP] Update evaluation targets and baselines:
   - Review `targets.json` — remove/update targets referencing old phases or difficulty distribution
   - Run `just simulate-all 30 42` to generate new data
   - Run `just evaluate` to establish performance
   - Save new baselines

3. [ ] [IMP] Update audit orchestrator for lesson coverage:
   - Add lesson counts to Content Quality section
   - Add "X/Y topics have lessons (Z%)" metric
   - Update `render.ts` and `types.ts`

4. [ ] [TST] Run full test and regression suite:
   - `just typecheck && just test` — pass
   - `just regression` — pass (may need new baseline)
   - Analyze changes: learning loop simplification changes convergence patterns

5. [ ] [DOC] Document the learning loop change:
   - Update CLAUDE.md: learning loop phases, content conventions
   - Update `docs/content-system.md`: lesson content type, simplified phases
   - Update DECISIONS.md: learning loop simplification rationale
   - Update LEARNINGS.md with any gotchas

**Validation:** `just regression` passes with updated baselines. `just audit` reports lesson coverage. All tests pass. Documentation reflects new model.

---

## Design Notes

### Why one generator per topic (not parameterized)

Parameterized generators (e.g., one "fraction arithmetic" generator for 30 topics) seem efficient but create maintenance problems: changing the generator for one topic risks breaking others. Per-topic generators are:
- **Independently modifiable** — fix one topic without touching others
- **Self-documenting** — the generator IS the specification for that topic's content
- **Cheap to produce** — Claude Code can write a generator in seconds
- **Directly traceable** — `problems/add-fractions.json` was produced by `generators/add-fractions.ts`

### Why generators live in learn-content (not learn-platform)

Content and its generators are co-located for the same reason source code and tests are co-located: they describe the same thing. A generator is the executable specification of a topic's content. When you modify a topic's graph entry (prerequisites, description), you update its generator in the same commit.

### Why regenerate all existing content

The content review found a 46% error rate (56 errors in 121 topics) in hand-authored content. The errors are systemic: answer/solution mismatches, drafting artifacts, unsimplified answers. Selectively fixing these would require reviewing all 705 topics. Regenerating from generators fixes them all and establishes a quality floor going forward.

### Prompt-template generators vs deterministic generators

| | Deterministic | Prompt-Template |
|---|---|---|
| Disciplines | math, CS, grammar | history, ELA, philosophy, vocabulary |
| Answer source | Computed by code | Grounded in fact anchors |
| Correctness guarantee | Mathematical proof | Rubric + fact-checking |
| Variation | Seeded RNG for number/context variation | LLM creativity within constraints |
| Review needed | Format only | Content + factual accuracy |
| Example | `1/2 + 1/3 = 5/6` (code computes) | "What caused WWI?" (template constrains) |
