# Plan: Content Generation Pipeline

> **Created:** 2026-03-05T21:00:00Z
> **Updated:** 2026-03-07T00:00:00Z — Rewritten to reflect Claude Code as primary authoring tool (see DECISIONS.md 2026-03-07)
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

The production system for creating content at scale. All text content — knowledge graphs, problems, worked examples, hints, translations — is authored in **Claude Code sessions**. Claude Code is the workhorse: it can read the full graph, reason about prerequisites and encompassings, check cross-topic consistency, enforce platform constraints, and validate — all in one session.

**OpenRouter is NOT used for content generation.** It's reserved for in-app runtime LLM features (tutoring, grading, self-explanation). See DECISIONS.md 2026-03-07.

**Non-text content** (visuals, audio, video, interactive) uses separate pipelines when needed — these are the only parts that may involve external generation services.

PhysicsGraph's biggest multiplier was investing in content tooling (2 days/topic down to 1.14 days). This plan is that investment — but the "tooling" is Claude Code workflows, validation scripts, and visualization tools, not an OpenRouter pipeline.

**Depends on:**
- Plan 007 Phase 1 (content model — `instructional_content` and `assessment_content` tables)
- Plan 008 Phase 1 (content strategy — what to generate and in what order)
- Plan 013 Phase 4 (encompassing methodology documentation)

**Research basis:** [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md) — Content Velocity, Content Pipeline Tooling, ReviewBot, Question Type Diversity sections.

**Content authoring model:**
```
Claude Code session (primary)
  ├── Graph design: topics, prerequisites, encompassings → graph.json
  ├── Problem authoring: 5-30 problems/topic → problems/*.json
  ├── Example authoring: 2+ worked examples/topic → examples/*.json
  ├── Content review: validate, fix platform-incompatible instructions
  └── Encompassing analysis: audit, calibrate weights, verify multi-hop chains

Validation & import (tooling)
  ├── just validate-content — DAG integrity, platform constraints
  ├── just import-content — load into local D1
  ├── just visualize — inspect graph structure
  └── tools/export-sql.ts — deploy to production D1

Non-text pipelines (future, separate from this plan)
  ├── Programmatic SVG — number lines, fraction bars, arrays (code-generated)
  ├── Image generation — themed illustrations for flavored content
  ├── Audio — TTS narration for lessons
  └── Video — Manim animations for concept explanations
```

**Content Dimension Matrix:**
```
Topic (graph node)
  x Flavor       (classic, adventure, nature, space, cooking, sports, creative, stories)
  x Locale       (en, es, ja, ar, ...)
  x Presentation (primary, intermediate, standard, advanced)
  x Content Depth (survey, contextual, analytical, synthesis)
  x Version      (v1, v2... refinement over time)
= Content Matrix
```

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 0

---

## Phase 0: Content System Research & Design
**Goal:** Research and design the content health infrastructure — simulation testing, gap analysis, analytics reporting — so we know exactly what tooling to build before building it. This phase may add or adjust later phases based on findings.

**Why this comes first:** We have 355 tagged problems, a cognitive demand system, and session/SRS machinery — but no way to stress-test the content *as a system*. Before expanding pools (Phase 2) or adding flavors (Phase 4), we need to understand: Does the current content actually produce good learning sessions? Where are the gaps? What does "good" look like in measurable terms?

### Research Questions

1. **Simulated learner testing:**
   - What learner archetypes should we simulate? (e.g., strong-at-grade, one-grade-behind, gifted-but-gaps, struggling-with-prerequisites)
   - How do we model "answer correctly/incorrectly" per archetype per topic? (probability by difficulty + archetype skill level, not random)
   - Can we drive the session service programmatically (DB operations + service function calls, no browser) to run a simulated learner through pretest → instruction → guided → independent → review → remediation?
   - What metrics do we capture per simulated session? (problems seen, demand variety, phase transitions, SRS state changes, mastered/not-mastered, time-to-mastery estimate)
   - How many simulated sessions per archetype to get meaningful signal? (enough to see SRS scheduling effects, not just one-shot)

2. **Content gap analysis:**
   - What constitutes a "healthy" topic? (minimum problem count, difficulty spread, demand diversity per grade expectations from plan 014, worked example coverage)
   - How do we detect problems that are functionally duplicates? (same numbers, same structure, just rephrased)
   - Can we score topic health as a single number for easy sorting? (composite of problem count, difficulty balance, demand coverage, example count)
   - What's the right output format for Claude Code consumption? (structured markdown report that fits in context, not raw JSON dumps)

3. **Analytics-to-remediation pipeline:**
   - What does the CLI report look like that a developer pastes into Claude Code to say "fix these gaps"? Design the report format.
   - Should we have `just content-health` (static analysis of JSON files) vs `just content-analytics` (runtime data from review_log)? Or one unified tool?
   - How does simulation data feed back into content improvement? (simulate → identify weak spots → generate targeted content → re-simulate → compare)
   - What thresholds trigger warnings vs errors? (e.g., topic with 3 problems = warning, topic with 0 application problems at G3+ = warning, simulated learner stuck in remediation loop = error)

4. **Integration with existing tooling:**
   - How does this relate to the admin content matrix route (`/api/admin/content-matrix`) already in the codebase?
   - Can `tools/content-status.ts` (Phase 1 step 3) and this simulation/analytics work share a data model?
   - Should simulation be a vitest test suite (like `__tests__/simulation/`) or a standalone tool (`tools/simulate-learners.ts`)?

### Steps

1. [ ] [RSH] Investigate the current session service API surface for programmatic driving:
   - Map the function call chain for a full learning session (select topic → get problem → submit answer → advance phase → repeat)
   - Identify what can be called directly as service functions vs what requires HTTP round-trips
   - Determine if the session state machine can be driven in a test harness with a seeded D1 database
   - Document the minimum viable "simulated session" — the smallest set of calls that exercises the full learning loop

2. [ ] [RSH] Design the learner simulation framework:
   - Define 4-6 learner archetypes with answer probability models (e.g., "G2 student on G2 content: 85% correct on easy, 65% medium, 40% hard; on G3 content: 50%/30%/10%")
   - Design how archetypes interact with cognitive demand (procedural vs conceptual accuracy may differ)
   - Spec the simulation runner: inputs (archetype, subject, number of sessions), outputs (per-session metrics, aggregate stats)
   - Decide: vitest integration test vs standalone CLI tool vs both

3. [ ] [RSH] Design the content health report:
   - Define "topic health score" — composite metric covering problem count, difficulty balance, demand diversity (vs grade-level targets from plan 014), example count, near-duplicate detection
   - Design the CLI output format: optimized for pasting into Claude Code (structured markdown, not tables wider than 100 chars, actionable next-steps section)
   - Design the simulation results report: per-archetype metrics, topics where simulated learners get stuck, demand variety experienced per session
   - Mock up example reports for current math-foundations content

4. [ ] [RSH] Evaluate whether findings change later phases:
   - Does the simulation reveal that Phase 2 (pool expansion) should prioritize differently than "topics with < 15 problems"?
   - Should Phase 6 (content quality analytics) be pulled earlier or merged with this tooling?
   - Are there new phases needed? (e.g., "near-duplicate deduplication pass", "difficulty recalibration based on simulation")
   - Document adjustments in this plan file and in DECISIONS.md

**Outputs:**
- Design doc (can live in `docs/content-testing.md`) covering simulation framework, health scoring, report formats
- Possibly a proof-of-concept simulation test for 1 archetype on 5 topics to validate the approach
- Updated phase list for this plan if research reveals needed changes

**Validation:** Research questions are answered with concrete designs. The team (or a future Claude Code session) can pick up Phase 1 knowing exactly what content health tooling to build alongside the authoring workflow.

---

## Phase 1: Content Authoring Workflow & Validation Tooling
**Goal:** Establish the repeatable Claude Code workflow for creating content for any subject, with validation and quality gates.

1. [ ] [DOC] Document the end-to-end content authoring workflow in `docs/content-authoring.md`:
   - **Graph design session:** How to design a knowledge graph in Claude Code — start with standards/curriculum, decompose into atomic topics, define prerequisites, add encompassings (reference `docs/content-system.md` encompassing methodology from plan 013 Phase 4). Expected output: `content/<subject>/graph.json`.
   - **Problem authoring session:** How to generate problems — read the graph, understand prerequisites, generate 5 problems/topic at easy/medium/hard, follow platform-medium constraints (screen + text input only), validate with `just validate-content`. Expected output: `content/<subject>/problems/<topic-id>.json`.
   - **Example authoring session:** How to generate worked examples — read the graph, understand prerequisite chain, generate 2 step-by-step examples/topic with subgoals, follow platform-medium constraints. Expected output: `content/<subject>/examples/<topic-id>.json`.
   - **Review & iteration session:** How to review content quality — run validation, fix issues, spot-check, iterate on weak topics.
   - **Quality checklist** per content type (problems: difficulty spread, no platform-incompatible instructions, answer correctness; examples: step-by-step clarity, prerequisite coverage).

2. [ ] [IMP] Enhance `tools/validate-content.ts` to be the comprehensive quality gate:
   - Verify every topic in graph.json has a corresponding problems file and examples file
   - Check problem count per topic (warn if < 5, error if 0)
   - Check difficulty distribution (warn if all same difficulty)
   - Check for duplicate or near-duplicate problems within a topic
   - Verify worked example steps reference concepts from the topic and its prerequisites
   - Platform-medium constraint scanning (already exists — ensure comprehensive)
   - Output a summary: "X topics complete, Y need more problems, Z have validation warnings"

3. [ ] [IMP] Build `tools/content-status.ts` — a content matrix status tool:
   - For each topic: count of problems by difficulty, count of examples, validation status
   - Highlight gaps: topics with < 5 problems, topics with 0 examples, topics with validation errors
   - Output as terminal table and optionally as JSON for programmatic use
   - Add `just content-status` recipe to justfile

4. [ ] [TST] Run the full workflow for 5 pilot topics (create graph entries → problems → examples → validate → import → visualize). Verify the documented workflow is smooth and produces quality content.

**Validation:** A documented, repeatable workflow exists. A Claude Code session can follow the docs and produce a complete subject from scratch. Validation tooling catches quality issues before import.

---

## Phase 2: Assessment Pool Expansion
**Goal:** Expand math-foundations from 5 problems/topic to 15-30+ problems/topic. This is the first production-scale use of the Claude Code authoring workflow.

1. [ ] [IMP] Audit current problem pools: run `tools/content-status.ts` to identify topics with < 15 problems. Prioritize by: topics students encounter most (high-traffic from learning sessions), topics with narrow difficulty spread, topics where diagnostic needs more questions.

2. [ ] [IMP] Generate additional problems in Claude Code sessions. Work in batches of 5-10 topics per session. For each topic:
   - Read existing problems to understand style and avoid duplicates
   - Read prerequisites and encompassing edges to understand what skills to exercise
   - Generate 10-25 new problems across easy/medium/hard
   - Diversify surface forms: different number choices, different word problem contexts, different visual representations
   - Follow platform-medium constraints
   - Validate after each batch: `just validate-content`

3. [ ] [IMP] Add question type diversity beyond text-qa:
   - **Numerical input:** Answer is a number, graded by numeric comparison (already supported by grading service)
   - **Multi-step:** Chained sub-problems where each step's answer feeds the next
   - **Matching:** Pair items (e.g., match fraction to position on number line)
   - Assess which types require schema changes vs. can fit in existing `assessment_content` structure

4. [ ] [IMP] Import expanded pools and verify: `just import-content`, spot-check in the app.

5. [ ] [TST] Every math-foundations topic has 15+ problems. Difficulty distribution is balanced (roughly 30% easy, 40% medium, 30% hard). `just validate-content` passes. Diagnostic has enough variety to avoid question repetition.

**Validation:** Problem pools reach 15-30+ per topic. Difficulty spread is balanced. New question types add variety. Diagnostic doesn't repeat questions within a session.

---

## Phase 3: Content Translation & Localization
**Goal:** Create localized content for pilot locale (Spanish first), adapting for cultural context, not just translating.

1. [ ] [RSH] Define localization requirements: which dimensions change per locale (names, currency, measurement units, cultural references, number formatting, reading direction)? What stays the same (mathematical structure, answer, difficulty)? Document in `docs/content-authoring.md`.

2. [ ] [IMP] Author Spanish translations in Claude Code sessions. Work topic-by-topic:
   - Read English problem, translate with cultural adaptation (names, contexts, units)
   - Verify numerical answers are IDENTICAL to English version
   - Adapt worked examples: same math, culturally appropriate framing
   - Platform-medium constraints still apply

3. [ ] [IMP] Enhance validation to check translation integrity:
   - For each locale file, verify a corresponding en file exists
   - For assessment content, verify answer field matches between locales
   - Flag locale-specific platform-incompatible instructions

4. [ ] [TST] Spanish content covers all 71 topics (at minimum: 5 problems + 2 examples each). Answers match English. `just validate-content` passes for es locale.

**Validation:** Complete Spanish content set for math-foundations. Answers verified identical. Culturally adapted, not just translated.

---

## Phase 4: Flavored Content
**Goal:** Create thematic content variants (adventure, space, nature) that wrap the same math in engaging narratives.

1. [ ] [RSH] Define 2-3 pilot flavors. For each:
   - Character names, setting, narrative style
   - How math problems are framed within the theme
   - What stays the same (mathematical structure, difficulty, answer)
   - What changes (surface text, context, character names, scenario)
   - Age-appropriate engagement patterns per grade range

2. [ ] [IMP] Author pilot flavor content in Claude Code sessions. Start with 10 high-traffic topics:
   - Read classic/en problems and examples
   - Re-wrap in flavor's narrative context
   - Verify mathematical content is identical
   - Generate flavor-specific worked examples with thematic step descriptions

3. [ ] [IMP] Content selection logic: ensure the session/learning service can select content by flavor preference. Verify fallback: if a topic doesn't have the requested flavor, fall back to classic.

4. [ ] [TST] Pilot flavors cover 10+ topics each. Math is identical to classic. Narrative is engaging and age-appropriate. Fallback to classic works when flavored content isn't available.

**Validation:** Students can select a flavor and see thematically wrapped content. Math correctness preserved. Fallback works seamlessly.

---

## Phase 5: Visual Content Generation
**Goal:** Add programmatic visual aids (SVG diagrams) to problems and worked examples where visuals significantly aid understanding.

1. [ ] [RSH] Identify topics where visuals are critical: counting (arrays), fractions (fraction bars, number lines), place value (base-ten blocks), geometry (shapes, angles), measurement (rulers, grids). Categorize by visual type.

2. [ ] [IMP] Build programmatic SVG generators for each visual type:
   - `NumberLine` — configurable range, tick marks, labeled points
   - `FractionBar` — partitioned rectangle with shaded portions
   - `ArrayGrid` — rows x columns of objects
   - `BaseTenBlocks` — hundreds squares, tens sticks, ones cubes
   - `PlaceValueChart` — labeled columns
   - Generators take parameters (numbers from the specific problem) and produce accurate SVG

3. [ ] [IMP] Add visual parameters to content files: extend problem/example JSON to include `visuals` array with generator type + parameters. Update import to store in `assetsJson`. Update frontend ProblemView/WorkedExample to render SVGs.

4. [ ] [IMP] Author visual parameters in Claude Code sessions: for each visual-critical topic, add visual definitions to existing problems and examples.

5. [ ] [TST] Visuals render correctly in the app. SVGs are accessible (alt text). Visual parameters produce accurate diagrams for the specific numbers in each problem.

**Validation:** High-impact topics (counting, fractions, place value, geometry) have visual aids. SVGs render in the app. Accuracy verified.

---

## Phase 6: Content Quality Analytics & Iteration
**Goal:** Use runtime data to identify weak content and improve it. Close the feedback loop. (May be adjusted or pulled earlier based on Phase 0 findings.)

1. [ ] [IMP] Track per-problem analytics: accuracy rate, hint usage rate, average time, skip rate. Store in a `content_analytics` table or compute from `review_log`.

2. [ ] [IMP] Build `tools/content-analytics.ts` — identify underperforming content:
   - Problems with < 30% accuracy (too hard or poorly worded)
   - Problems with > 95% accuracy (too easy, not testing the skill)
   - Problems with > 50% hint usage (hints needed too often — problem is unclear)
   - Worked examples where students still fail the subsequent problem (example didn't teach effectively)

3. [ ] [IMP] Use analytics to guide Claude Code improvement sessions:
   - Read the underperforming problem + its analytics
   - Diagnose the issue (ambiguous wording, difficulty mismatch, missing prerequisite)
   - Author improved version (v2) or replacement
   - Version tracking: link v2 to v1 in content files

4. [ ] [TST] Analytics identify known-weak content accurately. Improvement iterations measurably improve accuracy/hint-usage rates.

**Validation:** Feedback loop is closed. Weak content is identified automatically. Improvement sessions produce measurably better content over time.

---

## Phase 7: New Subject Onboarding
**Goal:** Use the established workflow to add a second subject. Proves the pipeline generalizes beyond math-foundations.

1. [ ] [RSH] Select second subject based on: demand, graph structure clarity, assessment objectivity. Candidates: introductory CS (computational thinking, algorithms — mastery-gated), elementary science (context-layered), US history (context-layered). Each tests different graph patterns.

2. [ ] [IMP] Author the complete subject in Claude Code sessions following `docs/content-authoring.md`:
   - Design knowledge graph (topics, prerequisites, encompassings using methodology from docs/content-system.md)
   - Validate and visualize: `just validate-content`, `just visualize <subject>`
   - Author problems (5+ per topic) and worked examples (2+ per topic)
   - Import and verify in the app

3. [ ] [IMP] Iterate on documentation: if the workflow docs from Phase 1 have gaps, update them based on the experience of creating a second subject.

4. [ ] [TST] Second subject is complete and functional in the app. Diagnostic works. Learning sessions work. FIRe compression works (if mastery-gated). Documentation is sufficient for creating a third subject without additional guidance.

**Validation:** A second subject exists end-to-end. The authoring workflow documentation is validated by actual use. The platform generalizes beyond math.
