# Plan 018: Content Generation & Multi-Subject Expansion

> **Created:** 2026-03-05T21:00:00Z
> **Updated:** 2026-03-10T16:24:00Z — Added Phase 3.5 (content pipeline commands & source tracking). Updated Phases 4-6 to use `/generate-content` and `/content-health` commands.
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build content deep and broad enough to validate the adaptive engine across year-long simulations (360+ sessions) and multiple discipline models. Expand math from 71 K-5 topics to ~200-240 K-8 topics with full structural metadata (strands, encompassing edges, depth/presentation). Add ELA K-5 (~50-70 topics, mastery-gated) and US History (~25-40 topics, context-layered) to validate multi-subject routing and the untested context-layered progression model. Build procedural generators for math volume. Total target: ~300+ topics across 3 subjects, 3 discipline models.

**OpenRouter is NOT used for content generation.** It's reserved for in-app runtime LLM features (tutoring, grading, self-explanation). See DECISIONS.md 2026-03-07.

**Depends on:**
- ~~**Plan 017.5 (System Remediation & Retest)**~~ — **UNBLOCKED (2026-03-09).** Phase 7 readiness gate: 5 PASS, 2 WARN, 0 FAIL. See `simulations/reports/system-readiness.md`.
- Plan 007 Phase 1 (content model — `instructional_content` and `assessment_content` tables)
- Plan 008 Phase 1 (content strategy — what to generate and in what order)
- Plan 013 Phase 4 (encompassing methodology documentation in `docs/content-system.md`)
- Plan 014 (cognitive demand tagging)

**Unlocks:** Plan 017.9 Phases 3-5 (maturity levels L3-L5 need 200+ topics to avoid frontier exhaustion)

**Content authoring model:**
```
Claude Code session (primary — conceptual/reasoning/error-analysis content)
  ├── Graph design: topics, prerequisites, encompassings → graph.json
  ├── Problem authoring: conceptual, application, reasoning, error-analysis → problems/*.json
  ├── Example authoring: 2+ worked examples/topic → examples/*.json
  ├── Content review: validate, fix platform-incompatible instructions
  └── Encompassing analysis: audit, calibrate weights, verify multi-hop chains

Parametric generators (procedural math — unlimited volume, provably correct)
  ├── Generator per topic type: addition, subtraction, multiplication, etc.
  ├── Configurable difficulty ranges + number constraints
  ├── Build-time generation: 50-100 problems/topic → validated JSON
  └── Auto-tagged cognitive_demand: "procedural"

Validation & import (tooling)
  ├── just validate-content — DAG integrity, platform constraints
  ├── just import-content — load into local D1
  ├── just content-status — per-topic health scoring
  ├── just content-gaps — cross-reference users × content availability
  ├── just visualize — inspect graph structure
  └── tools/export-sql.ts — deploy to production D1
```

**Content Dimension Matrix:**
```
Topic (graph node)
  x Flavor       (classic only in this plan — flavors deferred to 019+)
  x Locale       (en only in this plan — localization deferred to 019+)
  x Presentation (primary, intermediate, standard, advanced)
  x Content Depth (survey for mastery-gated; survey+contextual for context-layered)
  x Version      (v1)
= Content Matrix
```

**Content priority signals from simulation (Plan 017 Phase 5):**
- 24 topics flagged as too hard for strong profiles (<70% accuracy) — prioritize problem review/rewrite for: coordinate-plane, unit-conversion, multi-digit-multiply, and 21 others (see `simulations/reports/content-quality.md`)
- 47 difficulty calibration mismatches — "easy" problems with 37-49% actual accuracy need relabeling or rewriting
- Procedural generators most urgent for high-volume computation topics (addition, subtraction, multiplication, division strands)
- Presentation fallback frequency data available in simulation logs — prioritize primary-level content for topics where young profiles experience >30% fallbacks

**MathAcademy reference data** (from `/Users/paulperrone/source/mathacademy-graph/`):
- 3,688 topics, 5,622 prerequisite edges across 50 courses (grades 4 through university)
- Grade 4-5: ~130-140 topics per grade; Prealgebra: ~205 topics; Algebra I: ~230 topics
- Our K-8 expansion targets ~200-240 topics — deliberately smaller but sufficient for year-long sim validation
- Key structural insight: MathAcademy has no encompassing edges or content depth — we add these

## Progress

**Completed:** Phase 0 ✓, Phase 1 ✓, Phase 2 ✓, Phase 3 ✓
**In Progress:** —
**Next:** Phase 3.5

---

## Phase 0: Content Health Infrastructure ✓
**Goal:** Build tooling that measures content health using simulation output, static analysis, and (eventually) runtime data. This is the foundation for knowing where to invest content effort.

1. [x] [IMP] Build `tools/content-status.ts` — per-topic health scoring:
   - For each topic: problem count by difficulty, problem count by cognitive demand, example count, validation status
   - Composite health score: weighted sum of problem count (target 20+), difficulty balance (30/40/30 easy/med/hard), demand diversity (vs grade-level targets from Plan 014), example count (target 2+)
   - Highlight gaps: topics below threshold, topics with 0 of a demand type, topics with validation errors
   - Output as terminal table + JSON for programmatic use
   - Add `just content-status` recipe to justfile

2. [x] [IMP] Build presentation-level analytics into content status:
   - For each topic: count content variants by presentation level (primary/intermediate/standard/advanced)
   - Cross-reference with user population data (when available): if X% of users are age 6-8, flag topics with no primary-level content
   - Track fallback frequency from simulation data: parse Plan 017 simulation logs to identify how often content selection falls back to a non-ideal presentation level
   - Output: "These N topics cause >30% presentation fallbacks for young learner profiles"

3. [x] [IMP] Build `tools/content-gaps.ts` — automated content gap detection:
   - Cross-reference content availability matrix (topic × presentation × depth × locale × flavor) against priority matrix from `docs/content-system.md`
   - Rank gaps by impact: (user population affected) × (topic traffic from simulation) × (priority tier)
   - Output actionable report: "Top 20 content gaps to fill, ranked by impact"
   - Add `just content-gaps` recipe to justfile

4. [x] [IMP] Integrate with Plan 017/017.5 simulation output:
   - Parse `simulations/reports/content-quality.md` (24 too-hard topics, 47 difficulty calibration issues — from Plan 017 Phase 5)
   - Parse `simulations/baseline.json` for per-topic accuracy metrics (updated by Plan 017.5 Phase 7)
   - Merge simulation-identified weak topics (strong profiles score <70%) into content status
   - Merge simulation-identified too-easy topics (all profiles >95%) into content status
   - Unified view: content health = static analysis + simulation signals

5. [x] [TST] Run `just content-status` and `just content-gaps` against math-foundations. Verify output is accurate and actionable. Confirm simulation data integration works with Plan 017 output.

**Validation:** `just content-status` produces per-topic health scores. `just content-gaps` produces ranked gap list. Both integrate with simulation output when available.

---

## Phase 1: Math Structural Enrichment ✓
**Goal:** Add missing structural metadata to existing 71 math-foundations topics — strand tags, encompassing edges, depth/presentation fields — so simulation metrics (FIRe compression, interleaving, presentation drift) produce meaningful results. Fix simulation-flagged content quality issues.

**Current state:** 71 topics, 108 prerequisite edges, 133 encompassing edges, strand tags on all topics, depth/presentation metadata on all topics.

1. [x] [IMP] Add strand tags to all 71 topics in `graph.json`. Strands for math-foundations:
   - `counting-cardinality` — count-to-10, count-to-20, count-to-100, compare-numbers-k
   - `operations-addition` — add-within-5 through add-within-1000, add-subtract-word-problems
   - `operations-subtraction` — subtract-within-5 through subtract-within-1000
   - `operations-multiplication` — intro-arrays, multiply-within-100, multi-digit-multiply, properties-of-multiplication
   - `operations-division` — divide-within-100, long-division, divide-multi-digit, division-word-problems
   - `number-base` — teen-numbers, place-value-tens-ones, place-value-hundreds, place-value-rounding, odd-even, skip-count, decimals-intro, place-value-decimals, decimal-operations
   - `fractions` — intro-fractions, fractions-number-line, equivalent-fractions, compare-fractions, add-subtract-fractions, multiply-fractions, divide-fractions
   - `measurement-data` — measure-length, tell-time, money-coins-bills, bar-graphs, line-plots, unit-conversion
   - `geometry` — shapes-2d-k, shapes-3d-k, classify-2d-shapes, angles-intro, area-intro, perimeter, volume, line-symmetry, coordinate-plane
   - `algebra-thinking` — patterns-arithmetic, variables-expressions, order-of-operations, multi-step-word-problems
   - Each topic gets exactly one strand. Update graph.json schema to include `strand` field.

2. [x] [IMP] Add encompassing edges to `graph.json`. Target: 70-140 edges (1.0-2.0 per topic) — **133 edges already exist (1.87/topic)**:
   - **Within-strand chains** (weight 0.6-0.8): `add-within-100` encompasses `add-within-20` encompasses `add-within-10` encompasses `add-within-5`
   - **Cross-strand bridges** (weight 0.3-0.5): `multi-step-word-problems` encompasses basic operations; `order-of-operations` encompasses all four operations
   - **Integration sinks** (weight 0.3-0.5): `decimal-operations` encompasses `decimals-intro` + basic operations; `divide-fractions` encompasses `multiply-fractions`
   - Follow weight rubric from `docs/content-system.md`: 0.8-1.0 = nearly identical skill, 0.5-0.7 = core component, 0.3-0.4 = incidental
   - Verify multi-hop chains exist (3+ depth) for deep strands
   - Run `just visualize math-foundations` to inspect encompassing density

3. [x] [IMP] Add `depth` and `presentation` metadata to graph.json topics:
   - All math-foundations topics: `contentDepth: "survey"` (mastery-gated model — depth encoded in prerequisites, not content)
   - Presentation derived from gradeLevel: K-2 → primary, 3-5 → intermediate (document in graph.json as `defaultPresentation`)

4. [x] [IMP] Fix simulation-flagged content quality issues:
   - Reviewed and fixed 6 worst-accuracy topics (classify-2d-shapes, divide-fractions, factors-multiples, add-subtract-fractions-unlike, angles-intro, line-symmetry) — rewrote ambiguous questions, fixed ungrадable multi-part answers
   - Fixed 17 difficulty calibration mismatches — relabeled 7 too-easy-for-label, fixed 10 too-hard-for-label via relabeling + simplification
   - Fixed 22 platform-incompatible warnings (finger manipulation, drawing, folding → screen-compatible alternatives)
   - `just validate-content`: 0 errors, 0 warnings on content

5. [x] [TST] Run `just simulate-all 30 42` + `just evaluate` with enriched content. Results:
   - P0: all 3 systems PASS (mastery convergence, preservation, remediation)
   - P1: difficulty targeting PASS (24/24 profiles), interleaving now has strand data (0.195), FIRe needs --run-fire
   - P2: all 3 systems PASS (presentation drift, diagnostic placement, cognitive demand)
   - 24/24 profile behavioral match

**Validation:** All 71 topics have strand tags. 70+ encompassing edges with correct weights. FIRe compression is measurable. Interleaving uses strand data. Simulation metrics meaningfully improve.

---

## Phase 2: Math K-8 Graph Expansion ✓
**Goal:** Expand math from 71 K-5 topics to ~200-240 K-8 topics. This provides enough frontier depth that strong learners don't exhaust content by session 30, enabling meaningful L3-L5 simulations (90-360 sessions).

**Reference:** MathAcademy graph — 4th grade (~130 topics), 5th grade (~140 topics), Prealgebra (~205 topics), Algebra I (~230 topics). We target ~200-240 total (not per-course), covering the critical path through pre-algebra and intro algebra/geometry.

**New subject organization:** Split into two subjects under the `math` discipline:
- `math-foundations` (existing, K-5, ~100-120 topics after gap fill)
- `math-middle` (new, grades 6-8, ~100-120 topics)
- Cross-subject prerequisites connect them (e.g., `decimal-operations` → `rational-number-operations`)

1. [x] [RSH] Audit K-5 gaps using MathAcademy reference + Common Core standards. Identify missing topics that should exist before grade 6 content makes sense. Expected gaps:
   - Data analysis (mean, median, mode — grade 5-6 bridge)
   - Ratios and proportional reasoning intro (grade 6)
   - Number theory basics (prime, composite, GCF, LCM — grade 5-6)
   - Coordinate geometry basics beyond current coordinate-plane topic
   - Estimation and mental math strategies
   - Document gap list with priority ranking

2. [x] [IMP] Fill K-5 gaps: add ~20-30 new topics to `math-foundations/graph.json`:
   - Add topics with prerequisite edges connecting to existing graph
   - Add encompassing edges (maintain 1.0-2.0 per topic density)
   - Add strand tags consistent with Phase 1 taxonomy (may need 1-2 new strands)
   - 5 problems + 2 worked examples per new topic
   - Follow platform-medium constraints, cognitive demand targets for grade level
   - Run `just validate-content` and `just visualize math-foundations` after each batch

3. [x] [RSH] Design `math-middle` (grades 6-8) knowledge graph. Use MathAcademy Prealgebra (~205 topics) and Algebra I (~230 topics) as reference for topic granularity and prerequisite structure. Key strands:
   - `rational-numbers` — integers, rational numbers, absolute value, operations on negatives (~15-20 topics)
   - `ratios-proportions` — ratios, rates, proportions, percent, scaling (~15-20 topics)
   - `expressions-equations` — variables, expressions, one-step equations, two-step, multi-step, inequalities (~20-25 topics)
   - `linear-functions` — slope, intercept, graphing lines, systems intro (~15-20 topics)
   - `geometry-advanced` — angle relationships, triangle properties, Pythagorean theorem, transformations, similarity, congruence (~15-20 topics)
   - `statistics-probability` — mean/median/mode, data displays, probability basics, sampling (~10-15 topics)
   - `polynomials-intro` — monomials, basic polynomial operations, factoring intro (~5-10 topics)
   - Document full topic list with prerequisites, encompassing edges, strand assignments, grade levels
   - Target: 100-120 topics total, graph depth 8-12, prerequisite density 1.5-2.5/topic, encompassing density 1.0-2.0/topic

4. [x] [IMP] Create `content/math-middle/graph.json` with full topic graph:
   - All topics with id, name, description, gradeLevel, standardCode, strand
   - Prerequisite edges with types (all `required` — mastery-gated discipline)
   - Encompassing edges with calibrated weights
   - Cross-subject prerequisites from `math-foundations` topics (e.g., `decimal-operations` → `rational-number-operations`)
   - Run `just validate-content` and `just visualize math-middle`

5. [x] [IMP] Author problems and worked examples for math-middle topics. Work in batches of 10-15 topics per session:
   - 5 problems per topic at 3 difficulty levels
   - Cognitive demand distribution: grade 6-8 targets all 5 demands (30/20/20/20/10 procedural/application/conceptual/reasoning/error-analysis)
   - 2 worked examples per topic with step-by-step breakdowns
   - Platform-medium constraints (screen + text input only)
   - Validate after each batch: `just validate-content`

6. [x] [IMP] Update tooling for multi-subject math:
   - `just validate-content` discovers and validates all subject directories under `content/`
   - `just import-content` imports all subjects, handling cross-subject prerequisite edges
   - `just visualize` supports `just visualize math-middle` and combined view
   - Simulation runner supports multi-subject profiles (learner works across both math subjects)

7. [x] [TST] Full validation:
   - `just validate-content` passes for both math subjects
   - Cross-subject prerequisites correctly connect math-foundations → math-middle
   - `just import-content` loads both subjects into D1 without conflicts
   - Run `just simulate-all 30 42` — strong profiles now progress into math-middle content instead of exhausting frontier
   - `just content-status` reports on both subjects
   - Total math topics: 200+ with strand tags, encompassing edges, prerequisite chains

**Validation:** Math content spans K-8 with 200+ topics. Strong simulation profiles don't exhaust frontier by session 30. Cross-subject math prerequisites work. Graph is connected and validated.

---

## Phase 3: Procedural Generators + Assessment Pool Expansion ✓
**Goal:** Build parametric generators for math computation topics and expand all topics to 20+ problems. This prevents question repetition in longer simulations and provides volume for diagnostic variety.

1. [x] [RSH] Audit all math topics (both subjects) and categorize by generator feasibility:
   - **134 fully generatable** (64.7%) — pure computation, parameterized operands
   - **33 partially generatable** (15.9%) — mix of parametric and contextual
   - **40 not generatable** (19.3%) — conceptual/reasoning/visual only
   - Total: 167 topics eligible for procedural generation

2. [x] [IMP] Build generator framework (`tools/generators/`):
   - `types.ts`: Generator interface, SeededRng (Mulberry32 PRNG), Problem type with `source: "generated"`
   - `math-utils.ts`: GCD, LCM, fraction simplification, prime factoring, rounding utilities
   - `index.ts`: Registry mapping topicId → Generator (143 generators registered)
   - Seeded PRNG for reproducibility — verified identical output with same seed

3. [x] [IMP] Implement generators for K-5 computation topics (59 generators):
   - `k5-arithmetic.ts`: 20 generators (addition, subtraction, multiplication, division, estimation, exponents)
   - `k5-numbers.ts`: 11 generators (comparison, skip counting, odd/even, rounding, factors, primes, GCF, LCM, powers of ten)
   - `k5-fractions.ts`: 28 generators (fractions, mixed numbers, decimals, money, unit conversion, mean/median/mode, geometry, order of operations)

4. [x] [IMP] Implement generators for grades 6-8 computation topics (84 generators):
   - `middle-rational.ts`: 15 generators (integers, rationals, absolute value, decimal division)
   - `middle-algebra.ts`: 32 generators (ratios, proportions, percent, equations, inequalities, linear functions, exponent rules, systems)
   - `middle-geometry.ts`: 37 generators (area, volume, surface area, angles, Pythagorean theorem, transformations, circles, polynomials, statistics)

5. [x] [IMP] Build-time generation pipeline:
   - `tools/generate-problems.ts`: CLI with `--count N`, `--seed S`, `--topic TOPIC`, `--verify` flags
   - `just generate-problems` recipe added to justfile
   - Output to `content/<subject>/problems-generated/<topic-id>.json`
   - `import-content.ts` updated to merge both `problems/` and `problems-generated/`
   - `validate-content.ts`, `content-status.ts`, `content-gaps.ts` all updated to read generated problems
   - 30/40/30 easy/medium/hard distribution

6. [x] [IMP] Author non-procedural problems for topics below 20 total:
   - 62 topics (33 math-foundations + 29 math-middle) supplemented with 15 problems each
   - Mix of conceptual, application, reasoning, and error-analysis cognitive demands
   - All platform-compatible (screen + text input only), grade-appropriate
   - 7 platform-incompatible warnings found and fixed in post-generation review

7. [x] [TST] Validation:
   - 143 topics have 50+ generated procedural problems each (target: 80+) ✓
   - 0 verification errors on generated answers ✓
   - All 207 topics have 20+ total problems (0 below threshold) ✓
   - Difficulty distribution: 30/40/30 easy/med/hard ✓
   - `just validate-content`: 0 errors ✓
   - Total: 9,145 problems (3,905 math-foundations + 5,240 math-middle)

**Validation:** All math topics have 20+ problems. Procedural generators cover 143 topics with provably correct answers. `just generate-problems` is reproducible with seed 42. 0 validation errors.

---

## Phase 3.5: Content Pipeline Commands & Source Tracking
**Goal:** Codify the content generation workflow as reusable Claude Code commands (`/generate-content`, `/content-health`) and add problem source provenance to the DB schema. Makes Phases 4-6 faster and more consistent by encoding discipline-specific workflows, quality gates, and verification loops into executable commands.

**Motivation:** Phase 3 took ~40 minutes of ad-hoc authoring. Future phases (ELA, US History) are LLM-heavy with no procedural generator shortcut. Encoding the workflow as commands ensures consistent quality gates, correct discipline-specific rules, and reproducible post-generation verification — regardless of which session executes the phase.

1. [ ] [IMP] Add `source` column to `assessment_content` schema + migration:
   - Add `source TEXT NOT NULL DEFAULT 'hand-authored'` to Drizzle schema
   - Generate migration with `just db-generate`, manually add DEFAULT to SQL if needed (per LEARNINGS.md)
   - Update `import-content.ts` to read `p.source` from JSON, fallback `'hand-authored'` for legacy `problems/`
   - Update `generate-content-pack.ts` to include `problems-generated/` directory
   - Valid values: `procedural` (generators), `supplementary` (LLM-authored gap fill), `hand-authored` (original content)

2. [ ] [IMP] Create `/generate-content` command (`.claude/commands/generate-content.md`):
   - **Arguments:** `/generate-content <subject>` with optional `--graph-only`, `--problems-only`, `--examples-only`, `--dry-run`
   - **Discipline detection:** Read `graph.json` → `progressionModel` to select workflow
   - **Math (mastery-gated, computation-heavy) path:**
     1. Run procedural generators (`just generate-problems`) for topics with registered generators
     2. Identify coverage gaps (topics < 20 problems)
     3. LLM-author supplementary problems for gap topics (15 per topic, `source: "supplementary"`)
     4. Regenerate procedural problems (in case supplementary agents overwrote files — per LEARNINGS.md)
     5. LLM-author worked examples (2+ per topic)
     6. Run `/content-health` verification loop
   - **Non-math (LLM-only) path:**
     1. LLM-author all problems with structured prompt templates (5+ per topic, 3 difficulty levels)
     2. All problems get `source: "hand-authored"`
     3. LLM-author worked examples (2+ per topic)
     4. Run `/content-health` verification loop
   - **Discipline-specific quality gates embedded in command:**
     - Mastery-gated: all prerequisite edges `required`, difficulty distribution 30/40/30, cognitive demand targets by grade
     - Context-layered: mostly `recommended` edges, multiple depth levels, rubric-based scoring where appropriate
     - Flexible: mostly `enriching` edges, recall-based assessment
   - **Platform-medium constraints:** Screen + text input only. Regex patterns from `validate-content.ts` listed as examples of what to avoid.
   - **Post-generation verification loop:** validate → fix warnings → re-validate → report

3. [ ] [IMP] Create `/content-health` command (`.claude/commands/content-health.md`):
   - Wraps `just validate-content`, `just content-status`, `just content-gaps` into single diagnostic
   - **Arguments:** `/content-health [subject]` with optional `--all`, `--fix` (auto-fix common issues)
   - Output: summary table of per-topic health, ranked gap list, validation errors/warnings
   - Actionable: "These N topics need attention" with specific remediation steps
   - References `just visualize <subject>` for graph inspection when structural issues found

4. [ ] [TST] Validate against existing math content:
   - Run `just db-migrate` and `just import-content` — verify `source` column populated (`procedural` for generated, `hand-authored` for originals)
   - Dry-run `/generate-content math-foundations` workflow — verify it describes the same process Phase 3 actually executed
   - Run `/content-health math-foundations` and `/content-health math-middle` — verify output is accurate and actionable
   - Verify `generate-content-pack.ts` includes problems from both directories

**Validation:** Both commands exist in `.claude/commands/` and are invocable as slash commands. `source` column in `assessment_content` is populated after import. `/generate-content` workflow matches the Phase 3 process for math and describes a clear LLM-only path for non-math. `/content-health` produces actionable diagnostic output.

---

## Phase 4: ELA K-5 Subject
**Goal:** Create an English Language Arts subject for grades K-5 (~50-70 topics). Second mastery-gated subject. Validates multi-subject routing, cross-discipline prerequisites, and the content pipeline for non-math content.

**Discipline:** mastery-gated (phonics, grammar, vocabulary are skill-building). Reading comprehension topics use `recommended` edges for ordering flexibility.

**Reference:** `.workflow/plans/reference/011-reading-ela.md` (deferred plan with structural notes, likely outdated on specifics but useful for scope).

**Strands:**
- `phonics-decoding` — letter sounds, blending, digraphs, vowel patterns, multisyllabic words (~10-12 topics)
- `vocabulary` — sight words, context clues, word roots, prefixes/suffixes, grade-level vocab (~8-10 topics)
- `grammar-conventions` — sentence structure, parts of speech, punctuation, capitalization, subject-verb agreement (~10-12 topics)
- `reading-comprehension` — main idea, details, sequence, inference, author's purpose, compare/contrast, text evidence (~10-15 topics)
- `writing-basics` — sentence writing, paragraph structure, opinion writing, informational writing, narrative writing (~8-10 topics)

1. [ ] [RSH] Map Common Core ELA K-5 standards to atomic learning topics. For each strand:
   - Identify prerequisite chains (phonics is strictly sequential; comprehension is more flexible)
   - Identify encompassing relationships (reading comprehension encompasses vocabulary; writing encompasses grammar)
   - Assign grade levels aligned to Common Core
   - Target: 50-70 topics total

2. [ ] [IMP] Create `content/ela-k5/graph.json`:
   - All topics with id, name, description, gradeLevel, standardCode, strand
   - Prerequisite edges: `required` for skill chains (phonics, grammar), `recommended` for comprehension ordering
   - Encompassing edges (target 0.8-1.5 per topic): comprehension → vocabulary, writing → grammar, advanced reading → basic reading
   - `contentDepth: "survey"` for all topics (mastery-gated model)
   - Run `just validate-content` and `just visualize ela-k5`

3. [ ] [IMP] Author problems for all ELA topics using `/generate-content ela-k5 --problems-only` workflow (non-math LLM path):
   - All problems include `source: "hand-authored"` field for DB provenance tracking
   - **Phonics/decoding:** "Which word starts with the /sh/ sound?", "Sound out this word: 'bright'"
   - **Vocabulary:** "What does 'enormous' mean?", context clue questions, word root identification
   - **Grammar:** sentence correction, parts-of-speech identification, punctuation placement
   - **Reading comprehension:** short passages (age-appropriate) + questions on main idea, details, inference, author's purpose
   - **Writing:** sentence combining, paragraph ordering, prompt-based short responses (graded by rubric via LLM)
   - Platform-medium constraints enforced by `/generate-content` quality gates
   - Cognitive demand distribution appropriate per grade level

4. [ ] [IMP] Author worked examples for all ELA topics using `/generate-content ela-k5 --examples-only` workflow:
   - Step-by-step demonstrations: "How to sound out an unfamiliar word", "How to find the main idea"
   - Strategy-based: reading comprehension examples show the thinking process, not just the answer

5. [ ] [IMP] Add cross-discipline prerequisite edges:
   - `ela-k5:reading-comprehension-basic` → `math-foundations:add-subtract-word-problems-1` (type: `required`)
   - `ela-k5:reading-comprehension-inference` → `math-foundations:multi-step-word-problems` (type: `required`)
   - Validate cross-subject DAG: `just validate-content` checks cross-subject edges

6. [ ] [IMP] Update tooling for ELA-specific validation:
   - Passage readability scoring (Flesch-Kincaid grade level check)
   - Verify comprehension questions are answerable from the provided passage text
   - Verify vocabulary words appear in context when testing context clues

7. [ ] [TST] Full validation using `/content-health ela-k5`:
   - `/content-health ela-k5` reports all topics green (no gaps, no validation errors)
   - 50-70 topics with strand tags, prerequisite + encompassing edges
   - Cross-discipline edges correctly connect ELA → math
   - `just import-content` loads ELA alongside math without conflicts — verify `source` column populated
   - Run simulation with ELA-specific profile to verify learning progression
   - Diagnostic places students correctly in ELA graph

**Validation:** ELA K-5 exists as a complete subject with 50-70 topics, 5+ problems and 2+ examples per topic. Cross-discipline prerequisites connect to math. Simulation shows meaningful mastery-gated progression.

---

## Phase 5: US History Subject
**Goal:** Create a US History subject (~25-40 topics). First context-layered discipline. Validates spiral depth progression, recommended/enriching edges, rubric-based grading, and multi-depth content authoring — all untested code paths.

**Discipline:** context-layered — prerequisites are context, not gates. Learners progress breadth-first at each depth, then spiral deeper.

**Eras (topic groups):**
- `colonial-era` — Indigenous peoples, European exploration, colonial life, colonial economies (~4-5 topics)
- `revolution-founding` — causes of revolution, Revolutionary War, Constitution, early republic (~4-5 topics)
- `expansion-conflict` — westward expansion, manifest destiny, slavery, Civil War, Reconstruction (~5-6 topics)
- `industrialization` — Industrial Revolution, immigration, urbanization, Progressive Era (~3-4 topics)
- `world-wars` — WWI, Roaring Twenties, Great Depression, WWII, Cold War (~5-6 topics)
- `modern-era` — Civil Rights, Vietnam, social movements, contemporary America (~4-5 topics)

1. [ ] [RSH] Design the US History knowledge graph:
   - ~25-40 topics covering major eras from pre-colonial through modern
   - Prerequisite edge types: mostly `recommended` (60-75%), rare `required` (5-10% — only for foundational skills like "what is a primary source"), some `enriching` (20-30% — cross-era thematic connections)
   - Encompassing relationships: broad topics encompass era-specific instances (e.g., "causes of conflict" encompasses specific conflict causes)
   - Graph depth: 3-5 (shallow — context-layered is breadth-first)
   - Prerequisite density: 0.5-1.0 edges/topic
   - Document topic list with era assignments, edge types, and depth-layer plans

2. [ ] [IMP] Create `content/us-history/graph.json`:
   - All topics with id, name, description, gradeLevel, standardCode, strand (era)
   - `disciplineId: "history"`, `progressionModel: "context-layered"`
   - Prerequisite edges with types (`required`, `recommended`, `enriching`)
   - Encompassing edges with weights
   - Run `just validate-content` and `just visualize us-history`

3. [ ] [IMP] Author **survey-depth** content using `/generate-content us-history` workflow (non-math LLM path, context-layered discipline):
   - All problems include `source: "hand-authored"` field
   - Survey answers "What happened?" — timelines, key events, notable figures
   - Simple factual questions: dates, people, places, sequence of events
   - Difficulty levels: easy (recall), medium (connect 2 facts), hard (sequence/compare)
   - Worked examples: narrative walkthroughs of key events
   - Two presentation levels: `intermediate` (ages 8-10) and `standard` (ages 11-14)
   - `/generate-content` enforces context-layered quality gates: mostly `recommended` edges, depth-level tagging

4. [ ] [IMP] Author **contextual-depth** content for anchor topics (10-15 key topics, 5+ problems each):
   - Use `/generate-content us-history --problems-only` with depth targeting for contextual layer
   - Contextual answers "Why did it happen?" — causes, effects, connections, multiple perspectives
   - Questions require analysis beyond recall: "Why did colonists oppose the Stamp Act?", "How did the railroad change westward expansion?"
   - Rubric-based scoring: 1-4 scale on comprehension depth (not binary right/wrong)
   - Worked examples: show reasoning process for connecting cause and effect
   - Two presentation levels: `intermediate` and `standard`

5. [ ] [IMP] Add cross-discipline prerequisite edges:
   - `ela-k5:reading-comprehension-basic` → `us-history:primary-sources-intro` (type: `required`)
   - `ela-k5:text-evidence` → `us-history:analyzing-historical-documents` (type: `required`)
   - Validate cross-subject DAG

6. [ ] [IMP] Update tooling for context-layered validation:
   - Verify topics have content at intended depth levels
   - Verify rubric-scored problems have rubric criteria defined
   - Verify presentation levels are appropriate for topic grade level
   - Verify `recommended` and `enriching` edge types are used (not all `required`)

7. [ ] [TST] Full validation using `/content-health us-history`:
   - `/content-health us-history` reports all topics green (no gaps, no validation errors)
   - 25-40 topics with era strands, mixed edge types, encompassing edges
   - Survey depth: all topics have 5+ problems and 2+ examples
   - Contextual depth: 10-15 anchor topics have additional content
   - Cross-discipline edges connect ELA → History
   - Rubric-based problems defined with scoring criteria
   - `just import-content` loads alongside math and ELA — verify `source` column populated
   - Run simulation with context-layered profile to verify breadth-first progression and spiral depth behavior

**Validation:** US History exists as a complete context-layered subject. Survey + contextual depth content authored. Recommended/enriching edges validated. Rubric-based scoring defined. Spiral depth progression visible in simulation.

---

## Phase 6: Cross-Discipline Integration & Simulation Validation
**Goal:** Wire all three subjects together, create multi-subject simulation profiles, and validate the full content set supports year-long simulation testing. This is the gate for returning to Plan 017.9 Phases 3-5.

1. [ ] [IMP] Verify cross-discipline prerequisite graph:
   - Math-foundations → math-middle (cross-subject within discipline)
   - ELA → math word problems (cross-discipline)
   - ELA → US History primary sources (cross-discipline)
   - Run `just validate-content` on full graph — no cycles, all edges valid, cross-subject resolution works
   - Run `just visualize` combined view showing all subjects + cross-discipline edges

2. [ ] [IMP] Create multi-subject simulation profiles in `simulations/profiles/`:
   - `math-only-strong` — existing profile, math subjects only (control)
   - `multi-subject-average` — average ability across math + ELA, daily schedule
   - `multi-subject-strong-math-weak-ela` — tests cross-discipline prerequisite blocking
   - `multi-subject-history-focus` — average ability, context-layered progression focus
   - `multi-subject-all-three` — works across all subjects, tests session mix diversity
   - Each profile specifies which subjects it works on and ability curves per subject

3. [ ] [IMP] Update simulation runner to support multi-subject profiles:
   - Session mix draws from multiple subjects based on profile config
   - Diagnostic spans all specified subjects
   - Mastery tracking per subject
   - Cross-discipline prerequisites respected (can't start history primary sources without ELA reading)

4. [ ] [IMP] Update simulation targets for expanded content:
   - `targets.json` entries for new profiles
   - Adjust existing math-only targets for 200+ topic graph (mastery convergence thresholds, frontier exhaustion expectations)
   - Add context-layered-specific targets (depth progression rate, breadth-first behavior)
   - Run `/heal-update` to propose target adjustments

5. [ ] [VAL] Run `/content-health --all` + L2 simulation (30 sessions) across all subjects and profiles:
   - `/content-health --all` reports green across all 3 subjects
   - All profiles complete without errors
   - Math profiles: frontier not exhausted by session 30 (200+ topics)
   - ELA profiles: mastery-gated progression works
   - History profiles: context-layered breadth-first behavior visible
   - Multi-subject profiles: cross-discipline prerequisites respected
   - `just evaluate` reports meaningful metrics for all subjects

6. [ ] [VAL] Content sufficiency gate for Plan 017.9:
   - Math: 200+ topics, 20+ problems each, encompassing edges, strand tags ✓
   - ELA: 50+ topics, 5+ problems each, cross-discipline edges ✓
   - History: 25+ topics, survey + contextual depth, context-layered model ✓
   - Total: 275+ topics across 3 subjects ✓
   - Strong math profiles don't exhaust frontier before session 90 ✓
   - Multi-subject profiles show meaningful cross-discipline behavior ✓
   - If gate passes: Plan 017.9 Phases 3-5 are unblocked

7. [ ] [DOC] Document content authoring workflow in `docs/content-authoring.md`:
   - Reference `/generate-content` command as the canonical workflow (the command IS the playbook)
   - Supplement with human-readable overview: graph → problems → examples → validate → import
   - Per-discipline guidelines summary (mastery-gated vs context-layered vs flexible)
   - How to add cross-discipline prerequisites
   - How to add procedural generators for new math-like subjects
   - Sufficient for creating a fourth subject: "Run `/generate-content <subject>` and follow the prompts"

**Validation:** All 3 subjects integrated and functional. Cross-discipline prerequisites work. Multi-subject simulation profiles produce meaningful behavior. Content sufficiency gate passes for Plan 017.9 L3-L5 simulations.

---

## Deferred to Plan 019+

The following features from the original 018 plan are deferred. They are polish and engagement features that don't affect core engine validation — the primary goal of this plan. They should be revisited once real users are testing the platform.

### Content Translation & Localization (was Phase 4)
- Spanish-first localization with cultural adaptation (not just translation)
- Locale-specific validation (answer matching, cultural appropriateness)
- Generator locale parameter for word problem templates
- **Why deferred:** Simulation testing is locale-independent. Translation is high-effort, best prioritized after content quality is validated with English-speaking users.

### Flavored Content (was Phase 5)
- Thematic content variants (adventure, space, nature) wrapping same knowledge in engaging narratives
- Content selection by flavor preference with fallback to classic
- **Why deferred:** Flavors don't affect engine behavior — they're engagement features. Simulations don't model flavor preference. Prioritize after user engagement data shows demand.

### Visual Content Generation (was Phase 6)
- Programmatic SVG generators: NumberLine, FractionBar, ArrayGrid, BaseTenBlocks, PlaceValueChart
- Visual parameters in problem/example JSON
- Frontend rendering of embedded SVGs
- **Why deferred:** Visuals significantly improve learning but don't affect simulation metrics. Build when preparing for real user testing, not engine validation.

### Content Quality Analytics from Runtime Data (was Phase 7)
- `tools/content-analytics.ts` analyzing `review_log` data (accuracy, hint usage, response time, skip rate)
- Runtime signals integrated into `just content-status --runtime`
- Closed feedback loop: analytics → diagnose → improve → measure
- **Why deferred:** Requires real user data. Simulation data already drives content improvements via Plan 017. Build when first users generate meaningful review logs.

### Additional Subjects
- **Introductory CS** (mastery-gated) — code output prediction, algorithm tracing
- **Vocabulary** (flexible) — minimal prerequisites, validates flexible progression model
- **Additional history** — World History, European History
- **Science** — Physical, Life, Earth Science
- **Why deferred:** Three subjects (math K-8, ELA K-5, US History) are sufficient to validate all three discipline models. Additional subjects add breadth but not new validation value.
