# Plan 020: Discipline Graphs, Collections, and Content Granularity v2

> **Created:** 2026-03-11T16:46:19Z
> **Completed:** —
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

**Completed:** Phase 1 (architecture decision recorded, hierarchy updated to discipline-owned topics + collections, stale fixed-count granularity guidance replaced with split heuristics and density guardrails, collections clarified as cross-discipline-capable packaging)
**In Progress:** —
**Next:** Phase 2

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

## Phase 2: Schema, Content Pipeline, and Graph Merge
**Goal:** Implement the new data model end-to-end: schema migration, content directory restructure, import pipeline update, and graph merge — so that `just import-content` loads discipline-owned topics with collections.

**Why this is implementation, not research:** The full `subjectId` inventory was completed during planning. Every callsite is catalogued below in the Reference Appendix. The schema design, API shape, and migration semantics are all determined. This phase executes against that inventory.

### 2.1 Drizzle Schema Migration

**Current state of `subjects` table** (`packages/api/src/db/schema.ts` lines 13-23):
```
subjects: id, disciplineId, name, description, gradeRange, topicCount, createdAt
```
The only attribute unique to `subjects` is `gradeRange`, which is derived data (every topic already has `gradeLevel`, and collections carry their own `gradeRange`). `topicCount` is a derived count. `name` and `description` move to collections.

1. [ ] [IMP] Modify `topics` table (`schema.ts` lines 25-38):
   - Replace `subjectId` column with `disciplineId` referencing `disciplines.id`
   - Rename index `topics_subject_idx` → `topics_discipline_idx` on `disciplineId`
   - Topic columns unchanged: `id, disciplineId, name, description, depth, gradeLevel, strand, standardCode, createdAt`

2. [ ] [IMP] Add `collections` table:
   ```
   collections: id (text PK), primaryDisciplineId (text FK→disciplines, NOT NULL),
     name (text NOT NULL), description (text NOT NULL),
     kind (text NOT NULL DEFAULT 'grade-band'),  -- 'grade-band' | 'strand' | 'remediation' | 'exam-prep' | 'thematic'
     gradeRange (text),  -- e.g. "3-5", nullable for strand/thematic collections
     displayOrder (integer NOT NULL DEFAULT 0),
     visibility (text NOT NULL DEFAULT 'published'),  -- 'published' | 'draft' | 'archived'
     createdAt (text NOT NULL)
   ```
   - Index on `primaryDisciplineId`
   - `primaryDisciplineId` indicates the main discipline; interdisciplinary collections still have one primary but their topics may come from other disciplines

3. [ ] [IMP] Add `collection_topics` join table:
   ```
   collection_topics: id (integer PK autoincrement),
     collectionId (text FK→collections NOT NULL),
     topicId (text FK→topics NOT NULL),
     sortOrder (integer NOT NULL DEFAULT 0)
   ```
   - Unique index on `(collectionId, topicId)`
   - Index on `topicId` for reverse lookups ("which collections contain this topic?")
   - No discipline constraint — topics from any discipline can join any collection

4. [ ] [IMP] Replace `user_subject_presentation` (`schema.ts` lines 302-315) with `user_discipline_presentation`:
   - Same columns but `subjectId` → `disciplineId` referencing `disciplines.id`
   - Rename unique index `usp_user_subject_idx` → `udp_user_discipline_idx` on `(userId, disciplineId)`
   - **Rationale:** Presentation level (primary/intermediate/standard/advanced) is inherently per-discipline — a student's reading level in math is different from history, and it shouldn't reset at an arbitrary grade boundary within the same discipline

5. [ ] [IMP] Replace `presentation_drift_log` (`schema.ts` lines 317-329):
   - `subjectId` → `disciplineId` referencing `disciplines.id`
   - Rename index `pdl_user_subject_idx` → `pdl_user_discipline_idx`

6. [ ] [IMP] Update `diagnostic_sessions` (`schema.ts` lines 413-430):
   - `subjectId` → `disciplineId` referencing `disciplines.id`
   - **Semantic change:** Diagnostics scope to the entire discipline graph (all of math K-8), not a subject slice (just K-5). This is the correct behavior — one adaptive binary search across all grade levels.

7. [ ] [IMP] Drop `subjects` table entirely:
   - Remove the table definition from `schema.ts` (lines 13-23)
   - Remove the `subjects_discipline_idx` index
   - Remove all `references(() => subjects.id)` foreign keys throughout the schema
   - **D1 is disposable** — we don't need a data migration for existing rows; `just import-content` rebuilds everything

8. [ ] [IMP] Generate Drizzle migration:
   - Run `just db-generate` to create the migration SQL
   - **Remember:** `$defaultFn()` is app-level only. Check generated SQL for NOT NULL columns and add `DEFAULT` clauses manually where needed (see LEARNINGS.md).
   - Run `just db-migrate` to apply

### 2.2 Content Directory Restructure

**Current content directories:**
- `content/math-foundations/` (92 topics, K-5, discipline: math)
- `content/math-middle/` (115 topics, 6-8, discipline: math)
- `content/ela-k5/` (65 topics, discipline: ela)
- `content/us-history/` (30 topics, discipline: history)

**Target content directories** (one directory per discipline):
- `content/math/` (207 topics, K-8, one graph.json)
- `content/ela/` (65 topics)
- `content/history/` (30 topics)

1. [ ] [IMP] Merge `content/math-foundations/` and `content/math-middle/` into `content/math/`:
   - Create `content/math/graph.json` by combining both graph definitions:
     - Union all topics (check for ID collisions — topic IDs should be unique since they encode the skill, not the subject)
     - Union all prerequisite edges
     - Union all encompassing edges
     - **Remove cross-subject prefix syntax:** Any `from` values like `math-foundations:decimal-operations` become just `decimal-operations` since they're now same-discipline edges
   - Merge `problems/` and `problems-generated/` directories from both sources into `content/math/problems/` and `content/math/problems-generated/`
   - Merge `examples/` directories
   - **graph.json top-level fields change:**
     - `subjectId` → removed (or kept temporarily for backward compat during transition)
     - Add `disciplineId: "math"`
     - `subjectName` → `disciplineName: "Mathematics"` (or just `name`)
     - `gradeRange` moves to collection definitions
   - **New graph.json field: `collections`** — define initial collections inline:
     ```json
     "collections": [
       { "id": "math-k-2", "name": "Math K-2", "kind": "grade-band", "gradeRange": "K-2", "topicIds": ["count-to-10", ...] },
       { "id": "math-3-5", "name": "Math 3-5", "kind": "grade-band", "gradeRange": "3-5", "topicIds": ["..."] },
       { "id": "math-6-8", "name": "Math 6-8", "kind": "grade-band", "gradeRange": "6-8", "topicIds": ["..."] }
     ]
     ```
   - **Keep collections minimal (3 proof-of-concept):** `math-k-2`, `math-3-5`, `math-6-8`. Granular per-grade and per-strand collections are deferred until after the topic expansion in Plan 019 Phase 4.5B, when there are enough fine-grained topics to meaningfully package.

2. [ ] [IMP] Rename `content/ela-k5/` → `content/ela/`:
   - Update graph.json: add `disciplineId: "ela"`, remove `subjectId`/`subjectName`
   - Add a single collection: `ela-k5` (all topics, `gradeRange: "K-5"`)

3. [ ] [IMP] Rename `content/us-history/` → `content/history/`:
   - Update graph.json: add `disciplineId: "history"`, remove `subjectId`/`subjectName`
   - Add a single collection: `us-history-survey` (all topics)

4. [ ] [IMP] Remove old content directories after merge is validated:
   - Delete `content/math-foundations/` and `content/math-middle/`

### 2.3 Import Pipeline Update

**File:** `tools/import-content.ts` (329 lines)

The import pipeline currently: discovers `content/*/graph.json` → inserts into `subjects` table → inserts topics with `subject_id` → inserts edges → validates DAG → computes depths.

1. [ ] [IMP] Update `GraphDefinition` type (`import-content.ts` lines 22-48):
   ```typescript
   type GraphDefinition = {
     disciplineId: string;
     name: string;
     description?: string;
     topics: { ... }[];
     prerequisites: { ... }[];
     encompassings?: { ... }[];
     collections?: {
       id: string;
       name: string;
       description?: string;
       kind?: string;
       gradeRange?: string;
       topicIds: string[];
     }[];
   };
   ```
   - Remove `subjectId`, `subjectName`, `gradeRange` from top level
   - Add `collections` array

2. [ ] [IMP] Update `clearSubject()` → `clearDiscipline()` (`import-content.ts` lines 129-146):
   - All DELETE queries change from `WHERE subject_id = ?` to `WHERE discipline_id = ?` on the topics table
   - Remove `DELETE FROM subjects` — no subjects table to clear
   - Add `DELETE FROM collection_topics` and `DELETE FROM collections` for the discipline

3. [ ] [IMP] Update main import logic (`import-content.ts` lines 151-326):
   - Remove subject insert (`INSERT INTO subjects`)
   - Change topic insert from `INSERT INTO topics (id, subject_id, ...)` to `INSERT INTO topics (id, discipline_id, ...)`
   - Add collection insert: `INSERT INTO collections` then `INSERT INTO collection_topics`
   - Ensure discipline row exists before inserting topics (upsert into `disciplines` table — the import should create/update the discipline from graph.json metadata)
   - **Remove `resolveTopicId()` cross-subject prefix stripping** (`import-content.ts` line 149): No longer needed since all math topics are in one graph. Keep cross-discipline prefix support if `from` contains a colon where the prefix doesn't match the current discipline.

4. [ ] [IMP] Update `tools/content-status.ts` and `tools/content-gaps.ts`:
   - Replace subject references with discipline references
   - Update content-status to report per-discipline and per-collection stats

5. [ ] [IMP] Update `tools/validate-content.ts`:
   - Validate discipline-owned graph structure (no `subjectId` references)
   - Validate collection membership (all topicIds in collections exist in the graph)
   - Validate no duplicate topic IDs within a discipline
   - Cross-discipline edge validation: prefix must reference an existing discipline, not a subject

6. [ ] [IMP] Update `tools/generate-content-pack.ts`:
   - Replace subject-scoped download logic with discipline-scoped

### 2.4 Validate Phase 2

1. [ ] [VAL] Run `just validate-content` — all 3 disciplines pass DAG validation
2. [ ] [VAL] Run `just db-migrate && just import-content` — all topics load under disciplines, collections populated
3. [ ] [VAL] Verify merged math graph: 207 topics, all prerequisite edges intact, no orphaned cross-subject references
4. [ ] [VAL] Run `just visualize math` — one connected graph spanning K-8

**Validation:** `just import-content` succeeds with discipline-owned topics and collection memberships. No `subjects` table exists in the schema.

---

## Phase 3: Backend Services and Route Migration
**Goal:** Update all services, routes, and tests to use `disciplineId` instead of `subjectId`. This is a mechanical rename pass — the logic doesn't change, only the column/parameter names.

### 3.1 Shared Types

**File:** `packages/shared/src/types.ts`

1. [ ] [IMP] Remove `Subject` type (lines 3-9)
2. [ ] [IMP] Update `Topic` type (lines 11-19): `subjectId: string` → `disciplineId: string`
3. [ ] [IMP] Update `CompletionEstimate` type (lines 404-413): `subjectId`/`subjectName` → `disciplineId`/`disciplineName`
4. [ ] [IMP] Update `DiagnosticSession` type (lines 434-446): `subjectId` → `disciplineId`
5. [ ] [IMP] Add new types:
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
- [ ] [IMP] `loadAllTopicsAndEdges(subjectId)` → `loadAllTopicsAndEdges(disciplineId)`: Change WHERE clause from `eq(schema.topics.subjectId, subjectId)` to `eq(schema.topics.disciplineId, disciplineId)`
- [ ] [IMP] `startDiagnostic({ subjectId })` → `startDiagnostic({ disciplineId })`: Update parameter type and pass-through
- [ ] [IMP] `resume({ subjectId })` → `resume({ disciplineId })`: Update parameter type

**`packages/api/src/services/graph.ts`:**
- [ ] [IMP] `getSubjectTopics(subjectId)` → `getDisciplineTopics(disciplineId)`: Rename function and change WHERE clause
- [ ] [IMP] `getSubjects()` → `getDisciplines()`: Query `disciplines` table instead of `subjects` table
- [ ] [IMP] `validateDAG(subjectId?)` → `validateDAG(disciplineId?)`: Optional filter parameter rename
- [ ] [IMP] `computeDepths(subjectId)` → `computeDepths(disciplineId)`: Filter rename
- [ ] [IMP] `getTopicStrands()`: Remove subject prefix logic if present
- [ ] [IMP] Add `getCollections(disciplineId?)`: New function to query collections with optional discipline filter
- [ ] [IMP] Add `getCollectionTopics(collectionId)`: New function returning topics in a collection

**`packages/api/src/services/session.ts`:**
- [ ] [IMP] `resolveContentQuery()` (lines ~144-174): Currently gets `topic.subjectId` then queries `subjects` table to find the discipline. Simplify: get `topic.disciplineId` directly, query `disciplines` table for `progressionModel`. This removes the subject→discipline join entirely.
- [ ] [IMP] `startAnonymousSession(token, subjectId?)` → `startAnonymousSession(token, disciplineId?)`: Optional scope filter on topics changes from subject to discipline
- [ ] [IMP] Remove `lastServedSubjectId` from session state type if unused; rename to `lastServedDisciplineId` if used

**`packages/api/src/services/content.ts`:**
- [ ] [IMP] `resolvePresentation(subjectId?)` → `resolvePresentation(disciplineId?)`: Optional parameter rename
- [ ] [IMP] `getSubjectDistribution(userId, subjectId)` → `getDisciplineDistribution(userId, disciplineId)`: Query `user_discipline_presentation` instead of `user_subject_presentation`
- [ ] [IMP] `upsertSubjectDistribution()` → `upsertDisciplineDistribution()`: Same table swap
- [ ] [IMP] `applyNudge(userId, subjectId)` → `applyNudge(userId, disciplineId)`: Same table swap
- [ ] [IMP] `getAllSubjectDistributions()` → `getAllDisciplineDistributions()`: Same table swap

**`packages/api/src/services/srs.ts`:**
- [ ] [IMP] Session mixing logic: Currently extracts `subjectIds` from frontier topics, queries `subjects` table to find `disciplineId`, then filters by progression model. Simplify: extract `disciplineId` directly from `topic.disciplineId`, query `disciplines` table. Removes the subject→discipline join.

### 3.3 API Routes

**`packages/api/src/routes/public.ts`:**
- [ ] [IMP] `GET /api/public/subjects` → `GET /api/public/disciplines`: Return disciplines list (plus collections nested or as separate endpoint)
- [ ] [IMP] `GET /api/public/subjects/:id/topics` → `GET /api/public/disciplines/:id/topics`: Parameter rename
- [ ] [IMP] `GET /api/public/graph/:subjectId` → `GET /api/public/graph/:disciplineId`: Parameter rename, query change
- [ ] [IMP] `GET /api/public/download/:subject` → `GET /api/public/download/:discipline`: Parameter rename
- [ ] [IMP] Add `GET /api/public/collections`: List all published collections (optionally filtered by `?discipline=math`)
- [ ] [IMP] Add `GET /api/public/collections/:id`: Collection detail with topic list

**`packages/api/src/routes/learn.ts`:**
- [ ] [IMP] `POST /learn/diagnostic/start`: body `subjectId` → `disciplineId`
- [ ] [IMP] `POST /learn/diagnostic/resume`: body `subjectId` → `disciplineId`
- [ ] [IMP] `POST /learn/sessions`: optional body `subjectId` → `disciplineId`

**`packages/api/src/routes/progress.ts`:**
- [ ] [IMP] `GET /progress/:userId/presentation`: Return per-discipline distributions instead of per-subject. Response shape: `{ disciplineId, disciplineName, weights, centerLevel }[]`
- [ ] [IMP] `GET /progress/:userId/completion`: Group by discipline instead of subject. Response shape: `{ disciplineId, disciplineName, mastered, total, ... }[]`

**`packages/api/src/routes/graph.ts`:**
- [ ] [IMP] `GET /graph/:subjectId/user-state/:userId` → `GET /graph/:disciplineId/user-state/:userId`: Parameter rename

**`packages/api/src/routes/admin.ts`:**
- [ ] [IMP] Replace subject joins with discipline joins in admin queries

### 3.4 Test Updates

**`packages/api/src/__tests__/helpers.ts`:**
- [ ] [IMP] Remove `seedSubject()` helper (lines ~144-164) — no subjects table to seed
- [ ] [IMP] Update `seedTopic(subjectId, ...)` → `seedTopic(disciplineId, ...)`: Insert with `discipline_id` instead of `subject_id`
- [ ] [IMP] Ensure `seedDiscipline()` exists or is created for test setup
- [ ] [IMP] Add `seedCollection(disciplineId, topicIds)` helper

**Test files to update (mechanical `subjectId` → `disciplineId` in seed calls and assertions):**
- [ ] [IMP] `__tests__/diagnostic.test.ts`: `seedGradedTopics()` returns `{ disciplineId }` instead of `{ subjectId }`
- [ ] [IMP] `__tests__/session-mix.test.ts`: `setupFrontierTopics(disciplineId, ...)`
- [ ] [IMP] `__tests__/presentation-drift.test.ts`: Drift log queries by `disciplineId`
- [ ] [IMP] `__tests__/services/diagnostic-presentation.test.ts`
- [ ] [IMP] `__tests__/integration/presentation-drift-content.test.ts`
- [ ] [IMP] `__tests__/progress-presentation.test.ts`
- [ ] [IMP] `__tests__/content.test.ts`
- [ ] [IMP] `__tests__/routes/public.test.ts`: Update endpoint paths and response assertions
- [ ] [IMP] `__tests__/routes/anonymous-diagnostic.test.ts`

**New tests:**
- [ ] [TST] Collection membership: create collection, add topics, query topics by collection
- [ ] [TST] Discipline-scoped diagnostic: start diagnostic against discipline, verify it searches all grade levels
- [ ] [TST] Cross-discipline collection: create collection spanning two disciplines, verify topics from both appear

### 3.5 Validate Phase 3

1. [ ] [VAL] `just test` — all existing tests pass with discipline-scoped queries
2. [ ] [VAL] `just typecheck` — no remaining `subjectId` references in source (excluding git history)
3. [ ] [VAL] Grep for leftover `subjectId`/`subject_id`/`subjects` in `packages/` and `tools/` — should be zero hits outside of comments/docs

**Validation:** `just test` passes. No runtime code references `subjects` or `subjectId`. All engine logic operates on discipline-owned topics.

---

## Phase 4: Frontend Migration
**Goal:** Make the frontend speak in disciplines and collections instead of subjects.

### 4.1 Router and API Composable

**`packages/web/src/main.ts` (lines 8-30):**
Current routes with `subjectId`:
- `/diagnostic/:subjectId` → `/diagnostic/:disciplineId`
- `/explore/:subjectId` → `/explore/:disciplineId`
- `/explore/:subjectId/:topicId` → `/explore/:disciplineId/:topicId`
- `/teach/:subjectId/:topicId` → `/teach/:disciplineId/:topicId`

1. [ ] [IMP] Update all route definitions in `main.ts`
2. [ ] [IMP] Consider whether to keep `/explore/:disciplineId` as the browse-by-discipline view and add `/collections/:collectionId` as a separate browse-by-collection view, or merge them

**`packages/web/src/composables/useApi.ts`:**
- [ ] [IMP] `getTopics(subjectId)` → `getTopics(disciplineId)`: Update endpoint path
- [ ] [IMP] `getUserGraphState(subjectId, userId)` → `getUserGraphState(disciplineId, userId)`: Update endpoint path
- [ ] [IMP] `startDiagnostic({ subjectId })` → `startDiagnostic({ disciplineId })`: Update body field
- [ ] [IMP] `resumeDiagnostic({ subjectId })` → `resumeDiagnostic({ disciplineId })`: Update body field
- [ ] [IMP] `startAnonymousSession(token, subjectId?)` → Update parameter name
- [ ] [IMP] `getPresentationDistributions()`: Update response type from `subjectId`/`subjectName` to `disciplineId`/`disciplineName`
- [ ] [IMP] `getCompletionEstimates()`: Same response type update
- [ ] [IMP] `getPublicTopics(subjectId)` → `getPublicTopics(disciplineId)`: Update endpoint path
- [ ] [IMP] `getPublicGraph(subjectId)` → `getPublicGraph(disciplineId)`: Update endpoint path
- [ ] [IMP] `getContentMatrix()`: Update response type
- [ ] [IMP] Add `getCollections(disciplineId?)` and `getCollectionDetail(collectionId)` API functions

### 4.2 Pages

**14 frontend files reference subjects.** Most changes are mechanical renames of props, route params, and variable names.

- [ ] [IMP] `pages/onboarding.vue`: Subject selection → discipline selection (or collection selection if you want grade-band entry points)
- [ ] [IMP] `pages/index.vue`: Dashboard subject references → discipline references
- [ ] [IMP] `pages/explore-index.vue`: List disciplines + collections instead of subjects
- [ ] [IMP] `pages/explore-subject.vue` → rename to `explore-discipline.vue`: Browse discipline graph
- [ ] [IMP] `pages/explore-topic.vue`: `subjectId` route param → `disciplineId`
- [ ] [IMP] `pages/diagnostic.vue`: `subjectId` route param → `disciplineId`
- [ ] [IMP] `pages/progress.vue`: Per-subject stats → per-discipline stats
- [ ] [IMP] `pages/try.vue`: Subject selection → discipline selection
- [ ] [IMP] `pages/teach.vue`: `selectSubject()` → `selectDiscipline()`
- [ ] [IMP] `pages/teach-topic.vue`: Route param rename
- [ ] [IMP] `pages/admin.vue`: Subject references in admin views
- [ ] [IMP] `pages/docs-comparison.vue`: Subject references in comparison views

### 4.3 Validate Phase 4

1. [ ] [VAL] `just dev` — navigate all pages, verify no broken links or missing data
2. [ ] [VAL] Full flow: signup → onboarding → diagnostic → learn → progress — all works with discipline-scoped data
3. [ ] [VAL] Explore page shows disciplines and/or collections, topic detail pages load correctly
4. [ ] [VAL] No remaining `subjectId` references in `packages/web/src/`

**Validation:** The UI no longer exposes the internal subject split. Users see disciplines and collections.

---

## Phase 5: Simulation Migration and Rebaseline
**Goal:** Update simulation infrastructure to use discipline-owned topics, then re-run L2 baselines to confirm the topology change doesn't regress engine behavior.

### 5.1 Simulation Code Updates

**`simulations/src/types.ts`:**
- [ ] [IMP] `LearnerProfile.subjects?: string[]` → `LearnerProfile.disciplines?: string[]`
- [ ] [IMP] `LearnerProfile.subjectAbility?` → `LearnerProfile.disciplineAbility?`
- [ ] [IMP] `SimulationConfig.subject: string` → `SimulationConfig.discipline: string`
- [ ] [IMP] `SimulationConfig.subjects?: string[]` → `SimulationConfig.disciplines?: string[]`

**`simulations/src/runner.ts`:**
- [ ] [IMP] `topicSubjects` map (line 96) → `topicDisciplines`: Maps `topicId → disciplineId`
- [ ] [IMP] `config.subject` → `config.discipline` throughout
- [ ] [IMP] `getSubjectId()` → `getDisciplineId()`: Returns `this.config.discipline`
- [ ] [IMP] Diagnostic start call: pass `disciplineId` instead of `subjectId`

**`simulations/src/db-setup.ts`:**
- [ ] [IMP] `GraphDefinition` type (lines 103-127): Remove `subjectId`/`subjectName`, add `disciplineId`
- [ ] [IMP] `createMultiSubjectSimulationDb()` → `createSimulationDb()`: Load by discipline, not subject. Insert topics with `discipline_id` instead of `subject_id`. Skip subject inserts entirely.
- [ ] [IMP] Remove `resolveTopicId()` cross-subject prefix stripping (line 304) — no longer needed for same-discipline edges

**`simulations/src/answer-engine.ts`:**
- [ ] [IMP] `topic.subjectId?` → `topic.disciplineId?` in answer resolution (line ~14)
- [ ] [IMP] `profile.subjectAbility?.[topic.subjectId]` → `profile.disciplineAbility?.[topic.disciplineId]` (line ~21)

**`simulations/src/strands.ts`:**
- [ ] [IMP] Update strand loading to use discipline-organized content directories

**Learner profile definitions** (wherever profiles are defined):
- [ ] [IMP] Update profile `subjects` arrays → `disciplines` arrays
- [ ] [IMP] Update profile `subjectAbility` curves → `disciplineAbility` curves
- [ ] [IMP] Simplify multi-subject profiles: a math simulation just loads the `math` discipline (no need to specify `["math-foundations", "math-middle"]`)

### 5.2 Rebaseline L2

1. [ ] [VAL] Re-import content: `just validate-content && just import-content`
2. [ ] [VAL] Run L2 evaluation: `just evaluate-l2`
3. [ ] [RSH] Compare against pre-020 baselines:
   - Implicit diagnostic credit behavior across the unified math graph
   - Sessions-to-plateau for strong and average profiles
   - Review/new balance at L2
   - FIRe behavior with the flatter discipline graph
   - **Expected:** Results should be equivalent or better since the graph topology is the same content — just organized differently. The main change is diagnostics seeing the full K-8 range in one pass instead of K-5 and 6-8 separately.

4. [ ] [DOC] Record comparison results and any behavioral changes observed

### 5.3 Validate Phase 5

1. [ ] [VAL] All simulation profiles run without errors
2. [ ] [VAL] L2 results: no P0 regressions (target: maintain 9P/1W/0F or better)
3. [ ] [VAL] No remaining `subjectId` references in `simulations/src/`

**Validation:** Simulations run on discipline-owned topology. L2 baselines are equivalent to or better than pre-020 baselines.

---

## Phase 6: Validation Tooling for Granularity and Packaging
**Goal:** Prevent future graphs from drifting back to coarse standards-level units.

1. [ ] [IMP] Extend `just validate-content` with warnings/errors for:
   - Topic counts far below discipline-specific density targets
   - Problems-per-topic below minimum thresholds
   - Topics with overly broad descriptions or standards-level smell
   - Mastery-gated strands with no capstone/encompassing structure
   - Collections with empty membership or incoherent grade ranges
   - Interdisciplinary collections that lack explicit prerequisite readiness into the target-domain topics

2. [ ] [IMP] Add authoring diagnostics/reporting:
   - Per-discipline density summary
   - Per-strand chain depth
   - Problems-per-topic histogram
   - Encompassing coverage report
   - Collection coverage report
   - Interdisciplinary collection discipline-mix summary

3. [ ] [DOC] Add a reusable graph-authoring checklist:
   - Generate graph
   - Run density/coverage validation
   - Inspect visualization
   - Confirm remediation paths are specific
   - Confirm packaging collections are intelligible to end users
   - For interdisciplinary collections, confirm canonical ownership is clear and cross-discipline prerequisites are explicit

4. [ ] [VAL] Prove the guardrails catch the current coarse-graph failure mode on a fixture or reduced sample.

**Validation:** The content pipeline emits actionable warnings before a sparse graph can be imported as "done."

---

## Phase 7: Finalize and Unblock Plan 019
**Goal:** Clean up documentation, update CLAUDE.md, and formally unblock Plan 019.

1. [ ] [DOC] Update `CLAUDE.md`:
   - Remove all subject references from conventions, structure, and content pipeline sections
   - Add collections to the structure section
   - Update content creation workflow to reflect discipline-owned graphs
   - Remove cross-subject edge documentation (no longer needed within a discipline)
   - Preserve cross-discipline edge documentation

2. [ ] [DOC] Update `docs/content-system.md`:
   - Verify hierarchy section reflects reality
   - Update any remaining subject references

3. [ ] [DOC] Record go-forward decision in `DECISIONS.md`:
   - If topology is stable (L2 maintains 9P/1W/0F), explicitly unblock Plan 019 Phases 4.5B-6
   - If content is still too coarse for L3, flag that graph expansion (not just problem density) is needed

4. [ ] [DOC] Update Plan 019 references:
   - Mark 020 dependency satisfied
   - Resume with problem density expansion on the discipline-owned graph

5. [ ] [DOC] Update `MEMORY.md`:
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
