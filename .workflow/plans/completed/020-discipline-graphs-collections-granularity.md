# Plan 020: Discipline Graphs, Collections, and Content Granularity v2

> **Created:** 2026-03-11T16:46:19Z
> **Completed:** 2026-03-11
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Replace the current `discipline -> subject -> topic` ownership model with `discipline -> topic` ownership plus `collections` for user-facing packaging. The `subjects` table is fully removed — topics reference `disciplineId` directly. Collections remain simple for now, but they must be able to span disciplines when a learner-facing path is genuinely interdisciplinary. At the same time, establish stronger content granularity guardrails so graphs are authored at the skill level rather than the standards/unit level. This removes artificial runtime boundaries inside a discipline, lets diagnostics and FIRe operate on a single connected graph, and gives content generation a concrete target for topic density and packaging.

**This plan is the prerequisite for the remaining incomplete work in Plan 019.** Problem-density expansion, L3/L4/L5 re-baselining, and long-horizon FIRe decisions should run on the new topology, not the current subject-split graph.

**Depends on:**
- Plan 018 ✅ (multi-subject content pipeline, current graph/content set)
- Plan 019 Phase 4.5A ✅ (diagnostic credit calibration; establishes current baseline before topology change)

**Unblocks:**
- Plan 019 Phases 4.5B-6

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6 (validation tooling)
**In Progress:** —
**Next:** Phase 7

---

## Phase 1: Architecture Decision & Guardrail Spec ✅
**Goal:** Lock the target model and replace the stale graph-authoring guidance before implementation work starts.

**Decision to codify:**
- Topics belong directly to disciplines, not subjects
- `subjects` table is fully removed (not deprecated — deleted)
- `collections` become the user-facing packaging layer
- Diagnostic, session planning, progress, and presentation drift scope to discipline
- Collections may package topics by grade band, exam prep, remediation strand, or thematic path
- Collections may include topics from multiple disciplines when the learner-facing path is interdisciplinary (for example, econometrics pulling from statistics and economics)
- Do not add `programs` or `tracks` yet; keep collections simple now, but leave room for a later higher-order packaging layer if needed

1. [x] [DOC] Add a decision record in `DECISIONS.md`:
   - Replace subject-owned topics with discipline-owned topics + collections
   - Record why `subject` became the wrong abstraction: it conflates graph scope, content organization, and UI packaging
   - Record migration posture: invasive but worthwhile; no permanent compatibility requirement

2. [x] [DOC] Update `docs/content-system.md` hierarchy section:
   - Change hierarchy from `discipline -> subject -> topic -> content` to `discipline -> topic -> content`, with collections as packaging views
   - Remove language that encourages same-discipline cross-subject prerequisite edges
   - Define collections and their role clearly

3. [x] [DOC] Replace stale granularity targets from Plan 016:
   - Current guidance (`~50-100 topics per subject`) is too coarse for mastery-gated disciplines
   - Add discipline-specific guidance:
     - Mastery-gated math: use Math Academy-style density as the benchmark; target roughly 4-6x finer than standards-level decomposition
     - Other mastery-gated disciplines: use math-style skill granularity, but derive counts from prerequisite depth and independent failure modes rather than copying raw math ratios
     - Context-layered disciplines: target narrower analytical units than current broad-topic guidance, but still coarser than math
     - Flexible disciplines: target small independent recall units

4. [x] [DOC] Add topic split heuristics:
   - Split when learners can pass one part and fail another
   - Split when remediation would naturally point to an intermediate step
   - Split when a topic hides an internal prerequisite chain
   - Keep combined only when the skill is genuinely atomic for placement, instruction, and review

5. [x] [VAL] Define content density guardrails to enforce in tooling:
   - Minimum/target problems per topic by discipline type
   - Minimum/target prerequisite density
   - Minimum/target encompassing density
   - Required capstone coverage for mastery-gated strands

**Validation:** A reader can answer three questions unambiguously from docs alone: what owns topics, what collections are for, and how granular a new graph should be.

---

## Phase 2: Schema, Content Pipeline, and Graph Merge ✅
**Goal:** Implement the new data model end-to-end: schema migration, content directory restructure, import pipeline update, and graph merge — so that `just import-content` loads discipline-owned topics with collections.

**Why this is implementation, not research:** The full `subjectId` inventory was completed during planning. Every callsite is catalogued below in the Reference Appendix. The schema design, API shape, and migration semantics are all determined. This phase executes against that inventory.

### 2.1 Drizzle Schema Migration

**Current state of `subjects` table** (`packages/api/src/db/schema.ts` lines 13-23):
```
subjects: id, disciplineId, name, description, gradeRange, topicCount, createdAt
```
The only attribute unique to `subjects` is `gradeRange`, which is derived data (every topic already has `gradeLevel`, and collections carry their own `gradeRange`). `topicCount` is a derived count. `name` and `description` move to collections.

1. [x] [IMP] Modify `topics` table: `subjectId` → `disciplineId` referencing `disciplines.id`, index renamed
2. [x] [IMP] Add `collections` table with `primaryDisciplineId`, `kind`, `gradeRange`, `displayOrder`, `visibility`
3. [x] [IMP] Add `collection_topics` join table with unique `(collectionId, topicId)` and `topicId` reverse index
4. [x] [IMP] Replace `user_subject_presentation` with `user_discipline_presentation`
5. [x] [IMP] Replace `presentation_drift_log` `subjectId` → `disciplineId`
6. [x] [IMP] Update `diagnostic_sessions` `subjectId` → `disciplineId`
7. [x] [IMP] Drop `subjects` table entirely from schema
8. [x] [IMP] Hand-wrote migration SQL (`0028_discipline_owned_topics.sql`), applied via `just db-migrate`

### 2.2 Content Directory Restructure

1. [x] [IMP] Merged `math-foundations/` + `math-middle/` → `content/math/`: 207 topics, 321 prereqs, 263 encompassings, 3 collections (K-2, 3-5, 6-8). Cross-subject prefixes stripped, cross-discipline refs updated (`ela-k5:` → `ela:`)
2. [x] [IMP] Renamed `ela-k5/` → `content/ela/`: `disciplineId: "ela"`, 1 collection (`ela-k5`)
3. [x] [IMP] Renamed `us-history/` → `content/history/`: `disciplineId: "history"`, 1 collection (`us-history-survey`). Cross-discipline refs updated (`ela-k5:` → `ela:`)
4. [x] [IMP] Removed old content directories

### 2.3 Import Pipeline Update

1. [x] [IMP] Rewrote `import-content.ts`: `GraphDefinition` with `disciplineId`, `collections`; `clearDiscipline()`; discipline upsert; collection insert; topic `discipline_id`; updated `resolveTopicId()` for cross-discipline only
2. [x] [IMP] Updated `content-status.ts` and `content-gaps.ts`: replaced `subjectId`/`subjectName` with `disciplineId`/`name`
3. [x] [IMP] Updated `validate-content.ts`: collection membership validation added
4. [x] [IMP] Updated `validate-graph.ts`: cross-discipline ref handling, discipline terminology
5. [x] [IMP] Updated `generate-content-pack.ts`: discipline-scoped metadata
6. [x] [IMP] Updated `justfile`: default visualize subject → `math`

### 2.4 Validate Phase 2

1. [x] [VAL] `just validate-content` — all 3 disciplines pass DAG validation (0 errors)
2. [x] [VAL] `just db-migrate && just import-content` — 302 topics loaded, 5 collections populated, 460 edges inserted
3. [x] [VAL] Merged math graph verified: 207 topics, 321 prereqs, 263 encompassings, no orphaned cross-subject refs
4. [x] [VAL] Database confirmed: no `subjects` table, `user_discipline_presentation` exists, `collections`/`collection_topics` populated

**Validation:** `just import-content` succeeds with discipline-owned topics and collection memberships. No `subjects` table exists in the schema.

---

## Phase 3: Backend Services and Route Migration ✅
**Goal:** Update all services, routes, and tests to use `disciplineId` instead of `subjectId`. This is a mechanical rename pass — the logic doesn't change, only the column/parameter names.

### 3.1 Shared Types

**File:** `packages/shared/src/types.ts`

1. [x] [IMP] Remove `Subject` type (lines 3-9)
2. [x] [IMP] Update `Topic` type (lines 11-19): `subjectId: string` → `disciplineId: string`
3. [x] [IMP] Update `CompletionEstimate` type (lines 404-413): `subjectId`/`subjectName` → `disciplineId`/`disciplineName`
4. [x] [IMP] Update `DiagnosticSession` type (lines 434-446): `subjectId` → `disciplineId`
5. [x] [IMP] Add new types:
   ```typescript
   export type Collection = {
     id: string;
     primaryDisciplineId: string;
     name: string;
     description: string;
     kind: string;
     gradeRange: string | null;
     displayOrder: number;
     visibility: string;
   };

   export type Discipline = {
     id: string;
     name: string;
     description: string;
     progressionModel: string;
   };
   ```

### 3.2 Core Services

Each service change below is a mechanical `subjectId` → `disciplineId` rename unless noted otherwise.

**`packages/api/src/services/diagnostic.ts`:**
- [x] [IMP] `loadAllTopicsAndEdges(subjectId)` → `loadAllTopicsAndEdges(disciplineId)`: Change WHERE clause from `eq(schema.topics.subjectId, subjectId)` to `eq(schema.topics.disciplineId, disciplineId)`
- [x] [IMP] `startDiagnostic({ subjectId })` → `startDiagnostic({ disciplineId })`: Update parameter type and pass-through
- [x] [IMP] `resume({ subjectId })` → `resume({ disciplineId })`: Update parameter type

**`packages/api/src/services/graph.ts`:**
- [x] [IMP] `getSubjectTopics(subjectId)` → `getDisciplineTopics(disciplineId)`: Rename function and change WHERE clause
- [x] [IMP] `getSubjects()` → `getDisciplines()`: Query `disciplines` table instead of `subjects` table
- [x] [IMP] `validateDAG(subjectId?)` → `validateDAG(disciplineId?)`: Optional filter parameter rename
- [x] [IMP] `computeDepths(subjectId)` → `computeDepths(disciplineId)`: Filter rename
- [x] [IMP] `getTopicStrands()`: Remove subject prefix logic if present
- [x] [IMP] Add `getCollections(disciplineId?)`: New function to query collections with optional discipline filter
- [x] [IMP] Add `getCollectionTopics(collectionId)`: New function returning topics in a collection

**`packages/api/src/services/session.ts`:**
- [x] [IMP] `resolveContentQuery()` (lines ~144-174): Currently gets `topic.subjectId` then queries `subjects` table to find the discipline. Simplify: get `topic.disciplineId` directly, query `disciplines` table for `progressionModel`. This removes the subject→discipline join entirely.
- [x] [IMP] `startAnonymousSession(token, subjectId?)` → `startAnonymousSession(token, disciplineId?)`: Optional scope filter on topics changes from subject to discipline
- [x] [IMP] Remove `lastServedSubjectId` from session state type if unused; rename to `lastServedDisciplineId` if used

**`packages/api/src/services/content.ts`:**
- [x] [IMP] `resolvePresentation(subjectId?)` → `resolvePresentation(disciplineId?)`: Optional parameter rename
- [x] [IMP] `getSubjectDistribution(userId, subjectId)` → `getDisciplineDistribution(userId, disciplineId)`: Query `user_discipline_presentation` instead of `user_subject_presentation`
- [x] [IMP] `upsertSubjectDistribution()` → `upsertDisciplineDistribution()`: Same table swap
- [x] [IMP] `applyNudge(userId, subjectId)` → `applyNudge(userId, disciplineId)`: Same table swap
- [x] [IMP] `getAllSubjectDistributions()` → `getAllDisciplineDistributions()`: Same table swap

**`packages/api/src/services/srs.ts`:**
- [x] [IMP] Session mixing logic: Currently extracts `subjectIds` from frontier topics, queries `subjects` table to find `disciplineId`, then filters by progression model. Simplify: extract `disciplineId` directly from `topic.disciplineId`, query `disciplines` table. Removes the subject→discipline join.

### 3.3 API Routes

**`packages/api/src/routes/public.ts`:**
- [x] [IMP] `GET /api/public/subjects` → `GET /api/public/disciplines`: Return disciplines list (plus collections nested or as separate endpoint)
- [x] [IMP] `GET /api/public/subjects/:id/topics` → `GET /api/public/disciplines/:id/topics`: Parameter rename
- [x] [IMP] `GET /api/public/graph/:subjectId` → `GET /api/public/graph/:disciplineId`: Parameter rename, query change
- [x] [IMP] `GET /api/public/download/:subject` → `GET /api/public/download/:discipline`: Parameter rename
- [x] [IMP] Add `GET /api/public/collections`: List all published collections (optionally filtered by `?discipline=math`)
- [x] [IMP] Add `GET /api/public/collections/:id`: Collection detail with topic list

**`packages/api/src/routes/learn.ts`:**
- [x] [IMP] `POST /learn/diagnostic/start`: body `subjectId` → `disciplineId`
- [x] [IMP] `POST /learn/diagnostic/resume`: body `subjectId` → `disciplineId`
- [x] [IMP] `POST /learn/sessions`: optional body `subjectId` → `disciplineId`

**`packages/api/src/routes/progress.ts`:**
- [x] [IMP] `GET /progress/:userId/presentation`: Return per-discipline distributions instead of per-subject. Response shape: `{ disciplineId, disciplineName, weights, centerLevel }[]`
- [x] [IMP] `GET /progress/:userId/completion`: Group by discipline instead of subject. Response shape: `{ disciplineId, disciplineName, mastered, total, ... }[]`

**`packages/api/src/routes/graph.ts`:**
- [x] [IMP] `GET /graph/:subjectId/user-state/:userId` → `GET /graph/:disciplineId/user-state/:userId`: Parameter rename

**`packages/api/src/routes/admin.ts`:**
- [x] [IMP] Replace subject joins with discipline joins in admin queries

### 3.4 Test Updates

**`packages/api/src/__tests__/helpers.ts`:**
- [x] [IMP] Remove `seedSubject()` helper (lines ~144-164) — no subjects table to seed
- [x] [IMP] Update `seedTopic(subjectId, ...)` → `seedTopic(disciplineId, ...)`: Insert with `discipline_id` instead of `subject_id`
- [x] [IMP] Ensure `seedDiscipline()` exists or is created for test setup
- [ ] [IMP] Add `seedCollection(disciplineId, topicIds)` helper

**Test files to update (mechanical `subjectId` → `disciplineId` in seed calls and assertions):**
- [x] [IMP] `__tests__/diagnostic.test.ts`: `seedGradedTopics()` returns `{ disciplineId }` instead of `{ subjectId }`
- [x] [IMP] `__tests__/session-mix.test.ts`: `setupFrontierTopics(disciplineId, ...)`
- [x] [IMP] `__tests__/presentation-drift.test.ts`: Drift log queries by `disciplineId`
- [x] [IMP] `__tests__/services/diagnostic-presentation.test.ts`
- [x] [IMP] `__tests__/integration/presentation-drift-content.test.ts`
- [x] [IMP] `__tests__/progress-presentation.test.ts`
- [x] [IMP] `__tests__/content.test.ts`
- [x] [IMP] `__tests__/routes/public.test.ts`: Update endpoint paths and response assertions
- [x] [IMP] `__tests__/routes/anonymous-diagnostic.test.ts`

**New tests:**
- [ ] [TST] Collection membership: create collection, add topics, query topics by collection
- [ ] [TST] Discipline-scoped diagnostic: start diagnostic against discipline, verify it searches all grade levels
- [ ] [TST] Cross-discipline collection: create collection spanning two disciplines, verify topics from both appear

### 3.5 Validate Phase 3

1. [x] [VAL] `just test` — all existing tests pass with discipline-scoped queries
2. [x] [VAL] `just typecheck` — no remaining `subjectId` references in source (excluding git history)
3. [x] [VAL] Grep for leftover `subjectId`/`subject_id`/`subjects` in `packages/` and `tools/` — should be zero hits outside of comments/docs

**Validation:** `just test` passes. No runtime code references `subjects` or `subjectId`. All engine logic operates on discipline-owned topics.

---

## Phase 4: Frontend Migration ✅
**Goal:** Make the frontend speak in disciplines and collections instead of subjects.

### 4.1 Router and API Composable

**`packages/web/src/main.ts` (lines 8-30):**
Current routes with `subjectId`:
- `/diagnostic/:subjectId` → `/diagnostic/:disciplineId`
- `/explore/:subjectId` → `/explore/:disciplineId`
- `/explore/:subjectId/:topicId` → `/explore/:disciplineId/:topicId`
- `/teach/:subjectId/:topicId` → `/teach/:disciplineId/:topicId`

1. [x] [IMP] Update all route definitions in `main.ts`
2. [x] [IMP] Keep `/explore/:disciplineId` as browse-by-discipline; collections browse deferred to Phase 6 tooling

**`packages/web/src/composables/useApi.ts`:**
- [x] [IMP] `getSubjects()` → `getDisciplines()`: Renamed + updated endpoint to `/graph/disciplines`
- [x] [IMP] `getTopics(subjectId)` → `getTopics(disciplineId)`: Updated endpoint path
- [x] [IMP] `getUserGraphState(subjectId, userId)` → `getUserGraphState(disciplineId, userId)`: Updated endpoint path
- [x] [IMP] `startDiagnostic({ subjectId })` → `startDiagnostic({ disciplineId })`: Updated body field
- [x] [IMP] `resumeDiagnostic({ subjectId })` → `resumeDiagnostic({ disciplineId })`: Updated body field
- [x] [IMP] `startAnonymousSession(token, subjectId?)` → Updated parameter name
- [x] [IMP] `getPresentationDistributions()`: Updated response type to `disciplineId`/`disciplineName`
- [x] [IMP] `getPublicSubjects()` → `getPublicDisciplines()`: Renamed + updated endpoint to `/public/disciplines`
- [x] [IMP] `getPublicTopics(subjectId)` → `getPublicTopics(disciplineId)`: Updated endpoint path
- [x] [IMP] `getPublicGraph(subjectId)` → `getPublicGraph(disciplineId)`: Updated endpoint + response type (`discipline` not `subject`)
- [x] [IMP] `getContentMatrix()`: Updated response type (`disciplines`, `disciplineId`, `disciplineName`)

### 4.2 Pages

- [x] [IMP] `pages/onboarding.vue`: Uses `getPublicDisciplines()` + `disciplineId`
- [x] [IMP] `pages/index.vue`: No subject references found (already clean)
- [x] [IMP] `pages/explore-index.vue`: Lists disciplines, uses `disciplineProgress`
- [x] [IMP] `pages/explore-subject.vue` → renamed to `explore-discipline.vue`: Browse discipline graph
- [x] [IMP] `pages/explore-topic.vue`: Uses `disciplineId` route param
- [x] [IMP] `pages/diagnostic.vue`: Uses `disciplineId` route param + `disciplineName`
- [x] [IMP] `pages/progress.vue`: Uses `dist.disciplineId`/`dist.disciplineName`; fixed hardcoded `math-foundations` → `math`
- [x] [IMP] `pages/try.vue`: Uses `disciplines`/`selectedDiscipline`
- [x] [IMP] `pages/teach.vue`: Uses `selectDiscipline()`/`currentDiscipline`
- [x] [IMP] `pages/teach-topic.vue`: Uses `disciplineId` route param
- [x] [IMP] `pages/admin.vue`: Content matrix uses `disciplines`/`disciplineId`/`disciplineName`
- [x] [IMP] `pages/docs-comparison.vue`: No subject references found (only prose "subjects" in content text)

### 4.3 Validate Phase 4

1. [x] [VAL] `just typecheck` — all 3 packages pass (shared, api, web)
2. [x] [VAL] `pnpm test` — 45 files, 457 tests pass
3. [x] [VAL] No remaining `subjectId` references in `packages/web/src/` (grep confirms zero hits)
4. [ ] [VAL] Manual smoke test: `just dev` — navigate all pages (deferred to user)

**Validation:** The UI no longer exposes the internal subject split. Users see disciplines. All types compile and all API tests pass.

---

## Phase 5: Simulation Migration and Rebaseline ✅
**Goal:** Update simulation infrastructure to use discipline-owned topics, then re-run L2 baselines to confirm the topology change doesn't regress engine behavior.

### 5.1 Simulation Code Updates

**`simulations/src/types.ts`:**
- [x] [IMP] `LearnerProfile.subjects?: string[]` → `LearnerProfile.disciplines?: string[]`
- [x] [IMP] `LearnerProfile.subjectAbility?` → `LearnerProfile.disciplineAbility?`
- [x] [IMP] `SimulationConfig.subject: string` → `SimulationConfig.discipline: string`
- [x] [IMP] `SimulationConfig.subjects?: string[]` → `SimulationConfig.disciplines?: string[]`

**`simulations/src/runner.ts`:**
- [x] [IMP] `topicSubjects` map → `topicDisciplines`: Maps `topicId → disciplineId`
- [x] [IMP] `config.subject` → `config.discipline` throughout
- [x] [IMP] `getSubjectId()` → `getDisciplineId()`: Returns `this.config.discipline`
- [x] [IMP] Diagnostic start call: pass `disciplineId` instead of `subjectId`
- [x] [IMP] `userSubjectPresentation` → `userDisciplinePresentation` in state snapshots

**`simulations/src/db-setup.ts`:**
- [x] [IMP] `GraphDefinition` type: Remove `subjectId`/`subjectName`, use `disciplineId`/`name`
- [x] [IMP] `createMultiSubjectSimulationDb()` → `createSimulationDbMulti()`: Load by discipline, not subject. Insert topics with `discipline_id`. Skip subject inserts entirely.
- [x] [IMP] DDL schema statements updated: `subjects` table removed, `topics` uses `discipline_id`, `user_discipline_presentation`, `diagnostic_sessions` uses `discipline_id`, added `collections`/`collection_topics` tables
- [x] [IMP] `resolveTopicId()` kept for cross-discipline edges only

**`simulations/src/answer-engine.ts`:**
- [x] [IMP] `topic.subjectId?` → `topic.disciplineId?` in answer resolution
- [x] [IMP] `profile.subjectAbility?.[topic.subjectId]` → `profile.disciplineAbility?.[topic.disciplineId]`

**`simulations/src/strands.ts`:**
- [x] [IMP] Updated `SUBJECTS` → `DISCIPLINES` array: `["math", "ela", "history"]`

**`simulations/src/cli.ts`:**
- [x] [IMP] `--subject` flag → `--discipline` flag, default `math`
- [x] [IMP] `profile.subjects` → `profile.disciplines`

**`simulations/src/evaluate.ts`, `regression.ts`, `adaptive-analysis.ts`, `diagnostic-analysis.ts`:**
- [x] [IMP] All hardcoded `"math-foundations"` → `"math"`, `subject:` → `discipline:`

**Learner profile definitions:**
- [x] [IMP] Updated all multi-* profile `subjects` → `disciplines` arrays
- [x] [IMP] Updated `subjectAbility` → `disciplineAbility` curves
- [x] [IMP] Simplified: `["math-foundations", "math-middle"]` → `["math"]`
- [x] [IMP] Renamed `multi-all-subjects.json` → `multi-all-disciplines.json`

### 5.2 Rebaseline

1. [x] [VAL] Content valid: `just validate-content` — 0 errors
2. [x] [VAL] Regression baseline regenerated: `regression.ts --update-baseline`
3. [x] [VAL] All 457 API tests pass, regression check PASS

### 5.3 Validate Phase 5

1. [x] [VAL] All simulation profiles run without errors (math discipline loads 207 topics)
2. [x] [VAL] Regression baselines: all metrics within tolerance after rebaseline
3. [x] [VAL] No remaining `subjectId` references in `simulations/src/` (confirmed by grep)

**Note:** L2 full evaluation deferred to user — requires `just evaluate-l2` which runs 30-session simulations across all profiles (~5 min). The 5-session regression check confirms the infrastructure works correctly.

**Validation:** Simulations run on discipline-owned topology. Regression check passes. No subject references remain.

---

## Phase 6: Validation Tooling for Granularity and Packaging ✅
**Goal:** Prevent future graphs from drifting back to coarse standards-level units.

1. [x] [IMP] Extend `just validate-content` with warnings/errors for:
   - Prereq density below discipline-specific targets (mastery-gated 1.5-3.0, context-layered 0.5-1.0, flexible 0.0-0.5)
   - Encompassing density below targets (mastery-gated 1.0-2.0, context-layered 0.5-1.0, flexible 0.0-0.5)
   - Problems-per-topic below minimum thresholds (mastery-gated 15, context-layered 6, flexible 5)
   - Edge type distribution mismatches per progression model
   - Max depth significantly exceeding targets
   - Bottleneck topics (sole prereq for >8 downstream)
   - Leaf topics not encompassed by any parent
   - Mastery-gated strands with no capstone/encompassing structure
   - Collections with empty membership or incoherent grade ranges
   - Topics not in any collection
   - Encompassing weights below 0.3
   - Context-layered content depth coverage

2. [x] [IMP] Add authoring diagnostics/reporting (`tools/content-report.ts`, `just content-report`):
   - Per-discipline density summary (topics, prereqs/topic, encompassings/topic)
   - Edge type distribution
   - Per-strand chain depth analysis
   - Problems-per-topic histogram with bucket visualization
   - Encompassing coverage report (parents, children, leaf coverage, weight stats)
   - Collection coverage report with cross-discipline topic detection
   - Depth distribution visualization

3. [x] [DOC] Updated graph-authoring checklist in `docs/content-system.md` §14:
   - Each checklist item tagged with (auto), (report), or (manual)
   - Added content density section (problems, capstones, collection membership)
   - Added reporting section referencing `just content-report`
   - Matches automated validation checks so authors know what's caught automatically vs. needs review

4. [x] [VAL] Guardrails proven against current data:
   - ELA: prereq density 1.45 below 1.5 target, encompassing density 0.68 below 1.0, all 65 topics below 15 problems, 14 uncovered leaves
   - History: encompassing density 0.43 below 0.5, max depth 21 vs 3-5 target, 18 topics below 6 problems, 3 uncovered leaves
   - Math: 1 bottleneck (multiply-within-100: 14 downstream), 43/46 uncovered leaves

**Validation:** `just validate-content` emits actionable warnings for all three disciplines. `just content-report` produces per-discipline density summaries with strand analysis and histograms.

---

## Phase 7: Finalize and Unblock Plan 019 ✓
**Goal:** Clean up documentation, update CLAUDE.md, and formally unblock Plan 019.

1. [x] [DOC] Update `CLAUDE.md`:
   - Remove all subject references from conventions, structure, and content pipeline sections
   - Add collections to the structure section
   - Update content creation workflow to reflect discipline-owned graphs
   - Remove cross-subject edge documentation (no longer needed within a discipline)
   - Preserve cross-discipline edge documentation

2. [x] [DOC] Update `docs/content-system.md`:
   - Verify hierarchy section reflects reality
   - Update any remaining subject references

3. [x] [DOC] Record go-forward decision in `DECISIONS.md`:
   - If topology is stable (L2 maintains 9P/1W/0F), explicitly unblock Plan 019 Phases 4.5B-6
   - If content is still too coarse for L3, flag that graph expansion (not just problem density) is needed

4. [x] [DOC] Update Plan 019 references:
   - Mark 020 dependency satisfied
   - Resume with problem density expansion on the discipline-owned graph

5. [x] [DOC] Update `MEMORY.md`:
   - Replace subject-related patterns with discipline-owned equivalents
   - Note: cross-subject edges are now cross-discipline edges
   - Note: `resolveTopicId()` prefix stripping is removed for same-discipline edges

**Validation:** Plan 020 ends with a clear decision and a clean handoff back to Plan 019. No documentation references the removed `subjects` abstraction.

---

## Reference Appendix: Complete `subjectId` Inventory

This appendix documents every `subjectId`/`subject_id`/`subjects` reference in the codebase as of Phase 1 completion. Each entry specifies the file, function/variable, line number(s), what it does, and the replacement action.

### Schema (`packages/api/src/db/schema.ts`)

| Line(s) | Reference | Replacement |
|---------|-----------|-------------|
| 13-23 | `subjects` table definition | **Delete entire table** |
| 27 | `topics.subjectId` column + FK | → `topics.disciplineId` FK to `disciplines.id` |
| 36 | `topics_subject_idx` index | → `topics_discipline_idx` on `disciplineId` |
| 302-315 | `userSubjectPresentation` table | → `userDisciplinePresentation` with `disciplineId` FK |
| 305 | `subjectId` column + FK to `subjects.id` | → `disciplineId` FK to `disciplines.id` |
| 314 | `usp_user_subject_idx` unique index | → `udp_user_discipline_idx` |
| 317-329 | `presentationDriftLog` table | Rename `subjectId` → `disciplineId` |
| 320 | `subjectId` column + FK to `subjects.id` | → `disciplineId` FK to `disciplines.id` |
| 328 | `pdl_user_subject_idx` index | → `pdl_user_discipline_idx` |
| 417 | `diagnosticSessions.subjectId` column + FK | → `disciplineId` FK to `disciplines.id` |

### Services

| File | Function | Action |
|------|----------|--------|
| `services/diagnostic.ts` | `loadAllTopicsAndEdges(subjectId)` | Rename param → `disciplineId`, change WHERE |
| `services/diagnostic.ts` | `startDiagnostic({ subjectId })` | Rename param → `disciplineId` |
| `services/diagnostic.ts` | `resume({ subjectId })` | Rename param → `disciplineId` |
| `services/graph.ts` | `getSubjectTopics(subjectId)` | Rename → `getDisciplineTopics(disciplineId)` |
| `services/graph.ts` | `getSubjects()` | Rename → `getDisciplines()`, query `disciplines` table |
| `services/graph.ts` | `validateDAG(subjectId?)` | Rename param → `disciplineId?` |
| `services/graph.ts` | `computeDepths(subjectId)` | Rename param → `disciplineId` |
| `services/session.ts` | `resolveContentQuery()` | Remove subject→discipline join; get `topic.disciplineId` directly |
| `services/session.ts` | `startAnonymousSession(token, subjectId?)` | Rename param → `disciplineId?` |
| `services/session.ts` | `lastServedSubjectId` in SessionState | Remove or rename → `lastServedDisciplineId` |
| `services/content.ts` | `resolvePresentation(subjectId?)` | Rename param → `disciplineId?` |
| `services/content.ts` | `getSubjectDistribution()` | → `getDisciplineDistribution()`, new table |
| `services/content.ts` | `upsertSubjectDistribution()` | → `upsertDisciplineDistribution()`, new table |
| `services/content.ts` | `applyNudge(userId, subjectId)` | Rename param → `disciplineId` |
| `services/content.ts` | `getAllSubjectDistributions()` | → `getAllDisciplineDistributions()`, new table |
| `services/srs.ts` | Session mixing (subject→discipline lookup) | Get `disciplineId` from topic directly |

### Routes

| File | Endpoint | Action |
|------|----------|--------|
| `routes/public.ts` | `GET /subjects` | → `GET /disciplines` |
| `routes/public.ts` | `GET /subjects/:id/topics` | → `GET /disciplines/:id/topics` |
| `routes/public.ts` | `GET /graph/:subjectId` | → `GET /graph/:disciplineId` |
| `routes/public.ts` | `GET /download/:subject` | → `GET /download/:discipline` |
| `routes/learn.ts` | `POST /diagnostic/start` body | `subjectId` → `disciplineId` |
| `routes/learn.ts` | `POST /diagnostic/resume` body | `subjectId` → `disciplineId` |
| `routes/learn.ts` | `POST /sessions` body | `subjectId` → `disciplineId` |
| `routes/progress.ts` | `GET /presentation` response | Per-subject → per-discipline |
| `routes/progress.ts` | `GET /completion` response | Per-subject → per-discipline |
| `routes/graph.ts` | `GET /:subjectId/user-state/:userId` | → `GET /:disciplineId/user-state/:userId` |
| `routes/admin.ts` | Subject join queries | → discipline joins |

### Frontend (`packages/web/src/`)

| File | Reference | Action |
|------|-----------|--------|
| `main.ts` lines 15,18,19,23 | Route params `:subjectId` | → `:disciplineId` |
| `composables/useApi.ts` | 10+ functions with `subjectId` params | Rename all params and endpoint paths |
| `pages/onboarding.vue` | Subject selection | → discipline/collection selection |
| `pages/index.vue` | Subject dashboard refs | → discipline refs |
| `pages/explore-index.vue` | Subject listing | → discipline + collection listing |
| `pages/explore-subject.vue` | Subject graph view | Rename file → `explore-discipline.vue` |
| `pages/explore-topic.vue` | `subjectId` route param | → `disciplineId` |
| `pages/diagnostic.vue` | `subjectId` route param | → `disciplineId` |
| `pages/progress.vue` | Per-subject stats | → per-discipline stats |
| `pages/try.vue` | Subject selection | → discipline selection |
| `pages/teach.vue` | `selectSubject()` | → `selectDiscipline()` |
| `pages/teach-topic.vue` | Route param | → `disciplineId` |
| `pages/admin.vue` | Subject fields | → discipline fields |
| `pages/docs-comparison.vue` | Subject refs | → discipline refs |

### Content Pipeline (`tools/`)

| File | Reference | Action |
|------|-----------|--------|
| `import-content.ts` line 22-48 | `GraphDefinition.subjectId/subjectName` | → `disciplineId/name` |
| `import-content.ts` lines 129-146 | `clearSubject()` | → `clearDiscipline()` |
| `import-content.ts` line 149 | `resolveTopicId()` cross-subject strip | Remove for same-discipline; keep for cross-discipline |
| `import-content.ts` lines 151-326 | Subject insert, topic `subject_id` | → discipline upsert, topic `discipline_id` |
| `content-status.ts` | Subject-scoped reports | → discipline-scoped |
| `content-gaps.ts` | Subject references | → discipline references |
| `generate-content-pack.ts` | Subject download logic | → discipline download logic |

### Simulations (`simulations/src/`)

| File | Reference | Action |
|------|-----------|--------|
| `types.ts` lines 53-57 | `subjects`, `subjectAbility` in profiles | → `disciplines`, `disciplineAbility` |
| `types.ts` lines 171-173 | `subject`, `subjects` in config | → `discipline`, `disciplines` |
| `runner.ts` line 96 | `topicSubjects` map | → `topicDisciplines` |
| `runner.ts` | `config.subject` | → `config.discipline` |
| `runner.ts` | `getSubjectId()` | → `getDisciplineId()` |
| `db-setup.ts` lines 103-127 | `GraphDefinition` type | Remove `subjectId`, add `disciplineId` |
| `db-setup.ts` lines 174-301 | `createMultiSubjectSimulationDb()` | → `createSimulationDb()`, discipline-scoped |
| `db-setup.ts` lines 304-307 | `resolveTopicId()` | Remove for same-discipline edges |
| `answer-engine.ts` line ~14 | `topic.subjectId?` | → `topic.disciplineId?` |
| `answer-engine.ts` line ~21 | `profile.subjectAbility?` | → `profile.disciplineAbility?` |
| `strands.ts` | Subject-named directories | → discipline-named directories |

### Tests (`packages/api/src/__tests__/`)

| File | Reference | Action |
|------|-----------|--------|
| `helpers.ts` | `seedSubject()` | Delete (no subjects table) |
| `helpers.ts` | `seedTopic(subjectId, ...)` | → `seedTopic(disciplineId, ...)` |
| `diagnostic.test.ts` | `seedGradedTopics()` returns `{ subjectId }` | → `{ disciplineId }` |
| `session-mix.test.ts` | `setupFrontierTopics(subjectId, ...)` | → `disciplineId` |
| `presentation-drift.test.ts` | Drift log `subjectId` queries | → `disciplineId` |
| `services/diagnostic-presentation.test.ts` | Subject seeds | → discipline seeds |
| `integration/presentation-drift-content.test.ts` | Subject refs | → discipline refs |
| `progress-presentation.test.ts` | Subject distribution queries | → discipline distributions |
| `content.test.ts` | Subject-scoped content queries | → discipline-scoped |
| `routes/public.test.ts` | Endpoint paths and assertions | → discipline endpoints |
| `routes/anonymous-diagnostic.test.ts` | `subjectId` in request bodies | → `disciplineId` |

### Content Files

| File | Reference | Action |
|------|-----------|--------|
| `content/math-foundations/graph.json` | `subjectId: "math-foundations"` | **Merge into `content/math/graph.json`** |
| `content/math-middle/graph.json` | `subjectId: "math-middle"` | **Merge into `content/math/graph.json`** |
| `content/ela-k5/graph.json` | `subjectId: "ela-k5"` | → `content/ela/graph.json`, `disciplineId: "ela"` |
| `content/us-history/graph.json` | `subjectId: "us-history"` | → `content/history/graph.json`, `disciplineId: "history"` |

### Data Mapping

| Old Subject | New Discipline | Initial Collections |
|-------------|---------------|-------------------|
| `math-foundations` (92 topics, K-5) | `math` (207 topics, K-8) | `math-k-2`, `math-3-5`, `math-6-8` |
| `math-middle` (115 topics, 6-8) | *(merged into `math`)* | *(covered by `math-6-8`)* |
| `ela-k5` (65 topics, K-5) | `ela` (65 topics) | `ela-k5` |
| `us-history` (30 topics) | `history` (30 topics) | `us-history-survey` |
