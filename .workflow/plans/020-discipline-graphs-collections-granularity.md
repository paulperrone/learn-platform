# Plan 020: Discipline Graphs, Collections, and Content Granularity v2

> **Created:** 2026-03-11T16:46:19Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Replace the current `discipline -> subject -> topic` ownership model with `discipline -> topic` ownership plus `collections` for user-facing packaging. At the same time, establish stronger content granularity guardrails so graphs are authored at the skill level rather than the standards/unit level. This removes artificial runtime boundaries inside a discipline, lets diagnostics and FIRe operate on a single connected graph, and gives content generation a concrete target for topic density and packaging.

**This plan is the prerequisite for the remaining incomplete work in Plan 019.** Problem-density expansion, L3/L4/L5 re-baselining, and long-horizon FIRe decisions should run on the new topology, not the current subject-split graph.

**Depends on:**
- Plan 018 ✅ (multi-subject content pipeline, current graph/content set)
- Plan 019 Phase 4.5A ✅ (diagnostic credit calibration; establishes current baseline before topology change)

**Unblocks:**
- Plan 019 Phases 4.5B-6

## Progress

**Completed:** —
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Architecture Decision & Guardrail Spec
**Goal:** Lock the target model and replace the stale graph-authoring guidance before implementation work starts.

**Decision to codify:**
- Topics belong directly to disciplines, not subjects
- `subjects` are removed as a graph/runtime boundary
- `collections` become the user-facing packaging layer
- Diagnostic, session planning, progress, and presentation drift scope to discipline
- Collections may package topics by grade band, exam prep, remediation strand, or thematic path

1. [ ] [DOC] Add a decision record in `DECISIONS.md`:
   - Replace subject-owned topics with discipline-owned topics + collections
   - Record why `subject` became the wrong abstraction: it conflates graph scope, content organization, and UI packaging
   - Record migration posture: invasive but worthwhile; no permanent compatibility requirement

2. [ ] [DOC] Update `docs/content-system.md` hierarchy section:
   - Change hierarchy from `discipline -> subject -> topic -> content` to `discipline -> topic -> content`, with collections as packaging views
   - Remove language that encourages same-discipline cross-subject prerequisite edges
   - Define collections and their role clearly

3. [ ] [DOC] Replace stale granularity targets from Plan 016:
   - Current guidance (`~50-100 topics per subject`) is too coarse for mastery-gated disciplines
   - Add discipline-specific guidance:
     - Mastery-gated math: use Math Academy-style density as the benchmark; target roughly 4-6x finer than standards-level decomposition
     - Other mastery-gated disciplines: use math-style skill granularity, but derive counts from prerequisite depth and independent failure modes rather than copying raw math ratios
     - Context-layered disciplines: target narrower analytical units than current broad-topic guidance, but still coarser than math
     - Flexible disciplines: target small independent recall units

4. [ ] [DOC] Add topic split heuristics:
   - Split when learners can pass one part and fail another
   - Split when remediation would naturally point to an intermediate step
   - Split when a topic hides an internal prerequisite chain
   - Keep combined only when the skill is genuinely atomic for placement, instruction, and review

5. [ ] [VAL] Define content density guardrails to enforce in tooling:
   - Minimum/target problems per topic by discipline type
   - Minimum/target prerequisite density
   - Minimum/target encompassing density
   - Required capstone coverage for mastery-gated strands

**Validation:** A reader can answer three questions unambiguously from docs alone: what owns topics, what collections are for, and how granular a new graph should be.

---

## Phase 2: Schema and Runtime Migration Design
**Goal:** Design the data migration before editing code so the cutover is coherent and testable.

1. [ ] [RSH] Design schema changes in detail:
   - Add `topics.disciplineId`
   - Remove `topics.subjectId`
   - Replace `user_subject_presentation` with `user_discipline_presentation`
   - Add `collections` table: `id, disciplineId, name, description, kind, gradeRange, displayOrder, visibility`
   - Add `collection_topics` join table with `sortOrder`

2. [ ] [RSH] Inventory all runtime uses of `subjectId`:
   - Diagnostic scope
   - Session start and frontier computation
   - Public/explore APIs
   - Progress aggregation
   - Presentation drift
   - Simulation subject loading
   - Frontend routes and onboarding
   - Record per-callsite replacement: discipline scope, collection scope, or both

3. [ ] [RSH] Define the new API shape:
   - Discipline endpoints for engine/runtime state
   - Collection endpoints for browsing and onboarding
   - Topic detail endpoints return `disciplineId` plus collection memberships
   - Decide whether to keep temporary `subjectId` aliases for one migration window or cut directly

4. [ ] [RSH] Define migration semantics for existing data:
   - `math-foundations` + `math-middle` fold into discipline `math`
   - `ela-k5` folds into `ela`
   - `us-history` folds into `history`
   - Existing subject metadata becomes initial collection metadata where useful

5. [ ] [DOC] Write the migration design into this plan and `DECISIONS.md` before implementation begins.

**Validation:** There is a concrete mapping for every existing `subjectId` usage: removed, renamed to `disciplineId`, or replaced by `collectionId`.

---

## Phase 3: Backend Schema and Service Migration
**Goal:** Implement the new ownership model in the DB, services, routes, and tests.

1. [ ] [IMP] Update Drizzle schema and migrations:
   - Add `disciplineId` to `topics`
   - Add `collections` and `collection_topics`
   - Add `user_discipline_presentation` and any needed drift-log rename/FK updates
   - Remove or deprecate `subjects` and `user_subject_presentation` after migration path is in place

2. [ ] [IMP] Update content import pipeline:
   - Import topics against disciplines
   - Import collections and memberships
   - Remove same-discipline cross-subject prerequisite parsing/hacks
   - Preserve cross-discipline prerequisite support

3. [ ] [IMP] Update core services:
   - Diagnostic scopes by discipline, not subject
   - Session planning/frontier queries operate on the whole discipline graph
   - Presentation resolution and drift store per-discipline distributions
   - Graph service exposes discipline graph plus collection views

4. [ ] [IMP] Update API routes:
   - Replace subject-scoped runtime endpoints with discipline-scoped equivalents
   - Add collection browse/list/detail endpoints
   - Keep public graph/export routes coherent with the new model

5. [ ] [TST] Update test helpers and service/route tests:
   - Seed disciplines + collections instead of subjects
   - Remove tests that assert subject-scoped behavior inside a discipline
   - Add tests for collection membership, discipline-scoped diagnostic, and presentation drift

**Validation:** `just test` passes with no remaining runtime dependence on subject ownership.

---

## Phase 4: Math Graph Flattening and Collection Packaging
**Goal:** Move math onto one connected discipline graph and expose intelligible user-facing entry points.

1. [ ] [IMP] Merge `content/math-foundations` and `content/math-middle` into `content/math`:
   - One `graph.json`
   - No same-discipline prefixed prerequisite edges
   - Unified topic ID namespace if collisions exist

2. [ ] [IMP] Create initial math collections:
   - `math-grade-k`
   - `math-grade-1` through `math-grade-8`
   - `math-fractions`
   - `math-ratios-proportions`
   - `math-prealgebra-bridge`
   - Optional `math-sat-prep` placeholder collection for later cross-grade packaging

3. [ ] [IMP] Map legacy subject metadata into collections:
   - `math-foundations` becomes a broad archival/import collection if still useful
   - `math-middle` becomes a broad archival/import collection if still useful
   - Prefer grade-band and strand collections in the UI

4. [ ] [VAL] Validate the new math graph:
   - `just validate-content`
   - `just visualize math`
   - Confirm frontier naturally crosses grade-5/grade-6 boundaries without special logic

5. [ ] [DOC] Record the packaging principle:
   - Graph identity lives at the discipline level
   - Collections are views, not ownership containers
   - A topic may appear in multiple collections

**Validation:** Math has one connected graph under discipline `math`, and the UI can present multiple intelligible collection views without duplicating topics.

---

## Phase 5: Validation Tooling for Granularity and Packaging
**Goal:** Prevent future graphs from drifting back to coarse standards-level units.

1. [ ] [IMP] Extend `just validate-content` with warnings/errors for:
   - Topic counts far below discipline-specific density targets
   - Problems-per-topic below minimum thresholds
   - Topics with overly broad descriptions or standards-level smell
   - Mastery-gated strands with no capstone/encompassing structure
   - Collections with empty membership or incoherent grade ranges

2. [ ] [IMP] Add authoring diagnostics/reporting:
   - Per-discipline density summary
   - Per-strand chain depth
   - Problems-per-topic histogram
   - Encompassing coverage report
   - Collection coverage report

3. [ ] [DOC] Add a reusable graph-authoring checklist:
   - Generate graph
   - Run density/coverage validation
   - Inspect visualization
   - Confirm remediation paths are specific
   - Confirm packaging collections are intelligible to end users

4. [ ] [VAL] Prove the guardrails catch the current coarse-graph failure mode on a fixture or reduced sample.

**Validation:** The content pipeline emits actionable warnings before a sparse graph can be imported as “done.”

---

## Phase 6: Frontend and Product Surface Migration
**Goal:** Make the product speak in collections while the engine works at the discipline level.

1. [ ] [IMP] Update onboarding and explore flows:
   - Browse by collection, not subject
   - Start diagnostic against a discipline
   - Optionally choose a starting collection for intent/navigation only

2. [ ] [IMP] Update routes and API composables:
   - Replace `/diagnostic/:subjectId`, `/explore/:subjectId`, `/teach/:subjectId/:topicId`
   - Introduce discipline and collection routes as needed
   - Preserve topic detail/shareability

3. [ ] [IMP] Update progress surfaces:
   - Progress aggregates by discipline for the engine view
   - Collections provide user-facing slices such as Grade 3 Math or Fractions

4. [ ] [VAL] Verify UX coherence:
   - A learner can understand where to start
   - A parent can browse recognizable units
   - The same topic can appear in multiple relevant collections without confusion

**Validation:** The UI no longer exposes the internal subject split, and the packaging layer is intelligible to a normal user.

---

## Phase 7: Rebaseline Simulations and Unblock Plan 019
**Goal:** Re-run the critical simulation baselines on the new topology, then resume Plan 019 from a meaningful content architecture.

1. [ ] [VAL] Re-import content and run:
   - `just validate-content`
   - `just import-content`
   - `just test`
   - `just evaluate-l2`

2. [ ] [RSH] Compare against pre-020 baselines:
   - Implicit diagnostic credit behavior across the unified math graph
   - Sessions-to-plateau for strong and average profiles
   - Review/new balance at L2
   - FIRe behavior with the flatter discipline graph

3. [ ] [DOC] Record go-forward decision:
   - If topology is stable, explicitly unblock Plan 019 Phases 4.5B-6
   - If content is still too coarse, continue into graph expansion before any more problem-density work

4. [ ] [DOC] Update Plan 019 references after completion:
   - Mark 020 dependency satisfied
   - Resume with problem density expansion on the discipline-owned graph

**Validation:** Plan 020 ends with a clear decision and a clean handoff back to Plan 019.
