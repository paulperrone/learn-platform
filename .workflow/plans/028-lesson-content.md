# Plan 028: Lesson Content & Learning Loop Simplification

> **Created:** 2026-03-14T16:02:04Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Introduce section-based lesson content as the primary teaching vehicle for each topic, replacing worked examples as the instruction delivery mechanism. Simultaneously simplify the learning loop from 6 phases (pretest → instruction → guided → independent → review → remediation) to a lesson/review model where diagnostic handles placement and per-topic difficulty levels are eliminated. Vertical slice: define format, author ~15 lessons for counting-cardinality, wire the full pipeline end-to-end.

**Key design decisions (agreed with user):**

1. **Lessons replace worked examples as instruction.** Worked examples become one section type *within* a lesson (alongside prose, diagrams, video placeholders, embedded practice). The `instruction` phase serves a `Lesson` instead of a `WorkedExample`.

2. **Learning loop simplifies to lesson → review.** Diagnostic sessions handle placement (no per-topic pretest). First encounter = lesson with guided practice at the end. Subsequent encounters = review (problems only). No separate guided/independent phases — guided practice is embedded in the lesson itself or is a mode of review.

3. **Per-topic difficulty levels are eliminated.** If a topic is properly atomic (one testable skill), all problems test the same skill at the same level. `difficulty: easy|medium|hard` on problems is a graph decomposition smell for mastery-gated disciplines. Problems within a topic are equivalent.

4. **Scaffolding is an attribute of review, not a separate phase.** During review, students can optionally open lesson content as a reference. Opening it resets the review to "guided" mode — the problem doesn't count as pure review credit. Scaffolding types: `none` (pure review), `lesson-referenced` (opened lesson), `llm-assisted` (used LLM hints).

5. **Remediation shows prerequisite's lesson + guided practice** (not just prerequisite problems).

6. **Section-based lesson structure.** A lesson is an ordered list of sections with types: `explanation`, `worked-example`, `diagram`, `video`, `practice`. Text-first with media slots for future enrichment.

7. **Vertical slice first.** Define format, wire pipeline, author for one strand, then iterate.

## Current State (Context for Execution)

### Content pipeline today

```
../learn-content/<discipline>/
  graph.json              # Topic definitions (705 math topics)
  problems/<id>.json      # Problem[] (5-15 per topic)
  problems-generated/     # Supplementary LLM-generated problems
  examples/<id>.json      # WorkedExample[] (2 per topic)
  collections/            # Grade band / strand packaging

→ tools/validate-content.ts   # Validates problems + examples
→ tools/generate-bundles.ts   # Bundles to /tmp/learn-content-bundles/<disc>/<topic>/{manifest,problems,examples}.json
→ tools/upload-bundles.ts     # Uploads to R2 bucket "learn-content" at <disc>/<topic>/{manifest,problems,examples}.json
→ tools/deploy-content.ts     # Orchestrates: generate → upload → SQL export → D1 update
```

**R2 key format:** `{discipline}/{topicId}/problems.json`, `{discipline}/{topicId}/examples.json`, `{discipline}/{topicId}/manifest.json`

**Content hash:** `sha256(problemsJson + examplesJson)` — prefixed `sha256:<hex>`. Stored in `topic_content_versions.content_hash` and `BundleManifest.contentHash`.

### Session engine today

**`SessionPhase`** (`packages/shared/src/types.ts:72`):
```ts
export type SessionPhase = "pretest" | "instruction" | "guided" | "independent" | "review" | "remediation" | "diagnostic";
```

**Phase ordering** (`packages/api/src/services/session.ts:656`):
```ts
const phases: SessionPhase[] = ["pretest", "instruction", "guided", "independent"];
```
After `independent`, calls `nextTopic`. `review` and `remediation` are handled as special cases outside this array.

**`SessionItem`** discriminated union (`session.ts:1242-1288`):
- `{ type: "problem", phase, problem, availableHints, showSolution, hintsRevealed, askConfidence, difficultyBias, message, ... }`
- `{ type: "instruction", phase: "instruction", example: WorkedExample, fadingLevel, message, ... }`
- `{ type: "remediation", phase: "remediation", problem, availableHints, prerequisiteChain, ... }`
- `{ type: "complete", message }`
- `{ type: "error", message }`

**Problem selection uses difficulty** (`selectProblem` at session.ts:212-238):
- Filters by `p.difficulty === targetDifficulty`
- `applyDifficultyBias(difficulty, bias)` shifts target
- Pretest: medium. Guided: easy. Independent: medium. Review: medium. Remediation: easy.

**Instruction phase** (`session.ts:978-1006`): Serves `examples[0]` with `fadingLevel` computed from prior exposures + FSRS stability. `fadingLevel` determines how many steps are "faded" (student fills them in rather than reading them).

### Content service today

**`createContentService`** (`packages/api/src/services/content.ts:214`):
Returns: `resolvePresentation`, `resolveContentDepth`, `getTopicProblems`, `getTopicExamples`, `getTopicVisuals`, plus discipline distribution helpers.

**`ContentQuery`** (`content.ts:205`):
```ts
{ topicId, discipline?, contentDepth, presentation, locale?, flavor? }
```

**7-tier fallback ranking** (`content.ts:305-342`):
Tier 0: exact match all 4 dims → Tier 7: any content for topic. Uses `PRESENTATION_FALLBACK_ORDER` for adjacent presentation matching.

**`createFileContentBucket`** (`content-r2.ts:145-204`): Maps R2 keys to filesystem for offline use. `{disc}/{topicId}/problems.json` → `{contentDir}/{disc}/problems/{topicId}.json` (merges `problems-generated/`). Applied dimension defaults: `flavor: "classic"`, `locale: "en"`, `presentation: "standard"`, `contentDepth: "survey"`.

### D1 schema today

**`topicContentVersions`** (`schema.ts:55-63`):
```ts
topicId (PK), contentHash, bundleVersion, problemsCount, examplesCount, generatedAt, uploadedAt
```

**`userTopicState`** (`schema.ts:186-207`):
```ts
id, userId, topicId, stability, difficulty, due, state (FSRS), reps, lapses,
mastered, frontier, consecutiveCorrectReviews, consecutiveIncorrectReviews,
confidenceAccuracy, lastReview
```

### Frontend today

**`learn.vue`** dispatches on `currentItem.type`:
- `"problem"` or `"remediation"` → `<ProblemView>`
- `"instruction"` → `<WorkedExample>`

`currentItem` is typed as `any` — no shared type on frontend. API returns next item inline in the `/respond` endpoint response.

**`WorkedExample.vue`**: Renders one step at a time: subgoalLabel → instruction → work → self-explanation textarea → LLM evaluation (optional) → static explanation → next step. Emits `done` when all steps complete.

**`ProblemView.vue`**: Props include `phase`, `availableHints`, `showSolution`, `hintsRevealed`, `askConfidence`. Emits `submit` with `{ answer, correct, confidence, responseMs, hintsUsed }`. Answer checking is client-side.

### Analytics today

**`createAnalyticsService`** (`analytics.ts:48`): Two event types:
- `recordProblemAttempt(ProblemAttemptEvent)` — includes `difficulty`, `phase`, `llmAssisted`, `difficultyBias`
- `recordExampleView(ExampleViewEvent)` — includes `fadingLevel`, `selfExplanationQuality`

### Existing content JSON structures

**Problem** (`../learn-content/math/problems/count-to-10.json`):
```json
{ "id", "topicId", "difficulty", "question", "answer", "hints", "solution",
  "cognitiveDemand", "presentation", "contentDepth", "locale", "flavor", "source", "type" }
```

**WorkedExample** (`../learn-content/math/examples/count-to-10.json`):
```json
{ "id", "topicId", "title", "visuals?", "steps": [{ "subgoalLabel", "instruction", "work", "explanation" }],
  "presentation", "contentDepth", "locale", "flavor" }
```

### Files that will be modified or created

| File | Action | Notes |
|------|--------|-------|
| `packages/shared/src/types.ts` | Modify | Add `Lesson`, `LessonSection`, simplified `SessionPhase`, `ReviewScaffolding`; deprecate `ProblemDifficulty` |
| `../learn-content/math/lessons/<id>.json` | Create | New content directory + files |
| `tools/validate-content.ts` | Modify | Add lesson validation pass |
| `tools/generate-bundles.ts` | Modify | Bundle `lessons.json`, update manifest + contentHash |
| `tools/upload-bundles.ts` | Modify | Upload `lessons.json` |
| `packages/api/src/services/content-r2.ts` | Modify | Add `BundledLesson`, `fetchTopicLessons`, update file bucket |
| `packages/api/src/services/content.ts` | Modify | Add `getTopicLessons()` with 7-tier fallback |
| `packages/api/src/services/session.ts` | **Major rewrite** | Drop pretest/instruction/guided/independent, implement lesson/review model |
| `packages/api/src/services/analytics.ts` | Modify | Add `LessonViewEvent`, `recordLessonView` |
| `packages/api/src/db/schema.ts` | Modify | Add `lessonsCount` to `topicContentVersions`, add `lessonCompletedAt` or similar tracking |
| `packages/web/src/components/LessonView.vue` | Create | Section-based lesson renderer |
| `packages/web/src/pages/learn.vue` | Modify | Add lesson dispatch, remove instruction dispatch |
| `packages/web/src/components/WorkedExample.vue` | Keep | Reused as a section renderer within `LessonView` |
| `audit/learner-simulations/src/runner.ts` | Modify | Update for simplified phase model |
| `audit/content/review-rubric.md` | Modify | Add lesson criteria, remove difficulty calibration |
| `.workflow/commands/generate-content.md` | Modify | Add lesson authoring workflow |

## Progress

**Completed:** Phase 1, Phase 2
**In Progress:** —
**Next:** Phase 3

---

## Phase 1: Design & Type Definitions ✓

**Goal:** Define all new types, the lesson JSON schema, the simplified session phase model, and the review scaffolding model. Update the spec. No implementation beyond type definitions.

### Context for Execution

The `Lesson` type must follow the same dimension pattern as `Problem` and `WorkedExample`: `presentation`, `contentDepth`, `locale`, `flavor` fields for the 7-tier fallback ranking. Lessons are scoped to a single topic (like problems/examples). A lesson contains sections, each with a type and content.

**Section types to define:**
- `explanation` — prose text teaching the concept. Text-first. Optional media slot (diagram, image, animation placeholder).
- `worked-example` — embeds a `WorkedExample` (reuses existing type). Shows step-by-step procedure.
- `diagram` — media placeholder. Initially renders as a text description with `[diagram: ...]` placeholder. Future: actual images/animations.
- `video` — media placeholder. Initially renders as a text description. Future: embedded video.
- `practice` — embeds 2-3 problems for immediate guided practice. Lesson content remains visible as reference during these problems.

**Simplified `SessionPhase`:**
```ts
"lesson" | "review" | "remediation" | "diagnostic"
```
Pretest, instruction, guided, independent are all dropped. The `guided` concept becomes an attribute: when a student has lesson content visible during practice or review, that's guided mode.

**`ReviewScaffolding`:**
```ts
"none" | "lesson-referenced" | "llm-assisted" | "lesson-and-llm"
```
Tracked per problem attempt. `none` = pure review (full SRS credit). Any scaffolding = reduced credit (resets to guided-equivalent, needs more pure reviews for phase progression).

**Difficulty deprecation:** The `difficulty` field on `Problem` should be made optional and deprecated (not removed yet — backward compatibility with existing content). `selectProblem` should stop filtering by difficulty and instead treat all problems as equivalent within a topic. The content review rubric criterion 3 (difficulty calibration) should be replaced with a criterion checking that all problems within a topic test the same skill.

### Steps

1. [x] [RSH] Review `docs/content-system.md` and `docs/learning-science.md` for any constraints on lesson structure or phase sequencing that affect the design. Document findings as comments in the type definitions.

2. [x] [IMP] Add lesson types to `packages/shared/src/types.ts`:
   - `LessonSectionType = "explanation" | "worked-example" | "diagram" | "video" | "practice"`
   - `LessonSection = { type: LessonSectionType; title?: string; content: string; example?: WorkedExample; problems?: Problem[]; mediaAlt?: string; mediaRef?: string }`
   - `Lesson = { id: string; topicId: string; title: string; sections: LessonSection[]; presentation?: PresentationLevel; contentDepth?: ContentDepthLevel; locale?: string; flavor?: string }`
   - `ReviewScaffolding = "none" | "lesson-referenced" | "llm-assisted" | "lesson-and-llm"`
   - Update `SessionPhase` to include `"lesson"` (legacy values kept during migration, narrowed in Phase 3)
   - Make `ProblemDifficulty` optional: `difficulty?: ProblemDifficulty` on `Problem` type
   - Add `/** @deprecated Use topic decomposition instead of difficulty levels */` JSDoc

3. [x] [IMP] Create the lesson JSON schema documentation at `docs/lesson-format.md`:
   - JSON structure for `../learn-content/<discipline>/lessons/<topic-id>.json`
   - A lesson file is a JSON array of `Lesson` objects (typically 1 per topic, but allows multi-presentation)
   - Section ordering rules (explanation first, practice last, worked-example in middle)
   - Dimension field rules (same as problems/examples — match topic's `defaultPresentation` and `contentDepth`)
   - Platform-medium constraints (same rules as problems — no physical actions, drawing, speaking)
   - Example JSON for a complete lesson

4. [x] [DOC] Update SPEC.md:
   - Add lesson content to the product description
   - Update the learning model: diagnostic → lesson → review (not 6-phase)
   - Note that difficulty levels within topics are eliminated
   - Note that scaffolding is tracked as a review attribute

**Validation:** Types compile (`just typecheck`). Lesson JSON schema is documented. SPEC.md reflects the new learning model. No runtime code changes in this phase.

---

## Phase 2: Content Format & Pipeline ✓

**Goal:** Lessons can be authored in learn-content, validated, bundled, and deployed through the existing pipeline. No API or frontend changes yet.

### Context for Execution

The pipeline currently processes `problems/` and `examples/` directories per discipline. This phase adds `lessons/` as a third content type that flows through the same pipeline: validate → bundle → upload → D1 version tracking.

**Key files to modify:**
- `tools/validate-content.ts` — add lesson validation (lines 147-227 are where problems/examples are discovered)
- `tools/generate-bundles.ts` — add lesson reading/bundling (lines 209-240 are where problems/examples are read). Manifest gains `items.lessons: { count, hash }`. contentHash becomes `sha256(problemsJson + examplesJson + lessonsJson)`.
- `tools/upload-bundles.ts` — upload `lessons.json` alongside `problems.json` and `examples.json` (line 120-127 is the file loop)
- `packages/api/src/db/schema.ts` — add `lessonsCount` to `topicContentVersions` (line 55-63)

**contentHash change is breaking:** When lessons are added, the hash changes even if problems/examples didn't change. This is intentional — the hash represents the full content state. But it means all topic_content_versions rows will get new hashes on next deploy, and content review caches will invalidate. This is acceptable.

### Steps

1. [x] [IMP] Add lesson discovery and validation to `tools/validate-content.ts`:
   - Discover `<contentDir>/lessons/` directory (same pattern as problems: `readdirSync.filter(f => f.endsWith(".json"))`)
   - Validate required fields: `id`, `topicId`, `title`, `sections` (non-empty array)
   - Per section: validate `type` is one of the allowed `LessonSectionType` values
   - Per section with `type: "explanation"`: `content` must be non-empty
   - Per section with `type: "worked-example"`: `example` must have `steps` array
   - Per section with `type: "practice"`: `problems` must be non-empty array, each problem validated same as regular problems
   - Validate dimension fields in `--strict` mode: `presentation`, `contentDepth`, `locale`, `flavor`
   - Run `checkPlatformCompatibility` on all text content in sections (explanation content, worked-example instructions/work, practice problem questions/hints/solutions)
   - Validate `topicId` matches a topic in `graph.json`

2. [x] [IMP] Add lesson bundling to `tools/generate-bundles.ts`:
   - Read `<disciplineDir>/lessons/<topicId>.json` for each topic (same pattern as examples, lines 223-229)
   - Define `BundledLesson = Lesson & { flavor: string; locale: string; presentation: string; contentDepth: string }` — apply same dimension defaults as examples
   - Write `lessons.json` to the bundle output directory alongside `problems.json` and `examples.json`
   - Update manifest: add `items.lessons: { count: number; hash: string }` — `hash = sha256(lessonsJson)`
   - Update `contentHash = sha256(problemsJson + examplesJson + lessonsJson)` — **IMPORTANT:** this changes the hash formula, so update the `sha256` call at lines 238-240
   - Update `dimensions` to include lesson presentations/depths/locales/flavors
   - Topics with no lessons should still bundle fine (lessons array is empty, `items.lessons.count = 0`)

3. [x] [IMP] Add lesson upload to `tools/upload-bundles.ts`:
   - Add `lessons.json` to the file upload loop (line 120-127). Only upload if the file exists (topics without lessons won't have it).
   - R2 key: `{discipline}/{topicId}/lessons.json`

4. [x] [IMP] Add `lessonsCount` to D1 schema and update deploy:
   - Add `lessonsCount: integer("lessons_count").notNull().default(0)` to `topicContentVersions` in `schema.ts`
   - Run `just db-generate` to create migration
   - Update `tools/upload-bundles.ts` `updateD1ContentVersion` function (lines 53-64) to include `lessons_count` in the INSERT OR REPLACE
   - Read `manifest.items.lessons.count` for the value (default 0 if `items.lessons` is undefined — backward compat with old manifests)

5. [x] [IMP] Update `/generate-content` slash command (`.workflow/commands/generate-content.md`):
   - Add lesson authoring section (Section 5b, after worked examples)
   - Define lesson structure rules per discipline:
     - Mastery-gated (math): explanation → worked-example → practice (2-3 problems). Explanation teaches the core concept concisely. Worked example demonstrates the procedure. Practice lets them try with the lesson visible.
     - Context-layered (history): explanation with multi-depth treatment → embedded primary sources or perspectives → practice
     - Flexible (vocabulary): explanation with definition/context → practice
   - Quality gates: every topic must have at least 1 lesson with 3+ sections
   - Platform-medium constraints apply to all lesson text

6. [x] [TST] Validate the pipeline end-to-end with a test lesson:
   - Author 1 test lesson: `../learn-content/math/lessons/count-to-10.json`
   - Run `just validate-content` — should pass
   - Run `just generate-bundles` — output should include `lessons.json` in the bundle
   - Verify manifest includes `items.lessons` and updated `contentHash`
   - Run `just typecheck` — should pass
   - Clean up test lesson or keep it for Phase 5

**Validation:** `just validate-content` passes with lesson files. `just generate-bundles` produces bundles with `lessons.json`. Manifest includes `items.lessons`. `just typecheck` passes. D1 migration applies cleanly.

---

## Phase 3: Session Engine Simplification

**Goal:** Replace the 6-phase learning loop with the lesson/review model. Serve lessons via the content service. Track scaffolding on reviews. This is the most complex phase.

### Context for Execution

**The session engine rewrite is substantial.** The current `session.ts` is ~1300 lines with deeply interleaved phase logic. The approach should be:

1. Add lesson content fetching to the content layer (content-r2.ts, content.ts) — clean, isolated changes
2. Rewrite `advancePhase` and `buildPhaseItem` in session.ts — the core loop change
3. Update `SessionItem` union — add lesson variant, update review variant
4. Update analytics — add lesson view event

**Critical invariants to preserve:**
- FSRS state management (`user_topic_state`) — unchanged, still tracks stability/difficulty/due per user per topic
- Mastery criterion: 2 consecutive correct + 4d stability — unchanged
- Frontier computation (`computeFrontier`, `getNewlyUnlockedTopics`) — unchanged
- Diagnostic placement — unchanged, still materializes mastery into `user_topic_state`
- Session blending (new topics + review topics per session) — the `sessionMix` logic stays, but `blendRole` simplifies
- `review_log` table — continue recording all attempts, but `phase` values change to `"lesson"`, `"review"`, `"remediation"`

**New phase logic:**
```
For a new topic (no user_topic_state row, or state=New):
  1. Serve lesson (type: "lesson")
  2. Lesson includes practice problems at the end — these are served inline within the lesson response
  3. After lesson completion → create user_topic_state as Learning, schedule first review

For a review topic (state=Learning or Review, due):
  1. Serve problem (type: "review-problem")
  2. If student opens lesson content → track scaffolding, don't count as pure review
  3. Pure review: correct → FSRS Good/Easy rating. Incorrect → FSRS Again/Hard rating.
  4. After enough correct reviews → mastery

For remediation (consecutive failures on a topic):
  1. Identify the weakest prerequisite
  2. Serve prerequisite's lesson (type: "lesson", with remediation context)
  3. After prerequisite lesson → serve prerequisite practice problems
  4. Return to original topic
```

**Difficulty removal:** `selectProblem` currently filters by `p.difficulty === targetDifficulty`. This should be removed — select randomly from all available problems for the topic (still respecting demand mixing and exclusion of recently-served problems).

### Steps

1. [ ] [IMP] Add lesson types to content-r2.ts (`packages/api/src/services/content-r2.ts`):
   - Add `BundledLesson = Lesson & { flavor: string; locale: string; presentation: string; contentDepth: string }`
   - Add `fetchTopicLessons(bucket: ContentBucket, discipline: string, topicId: string): Promise<BundledLesson[]>` — reads `{discipline}/{topicId}/lessons.json` from R2/filesystem
   - Add `toBareLessons(bundled: BundledLesson[]): Lesson[]` — strips bundle-specific fields (same pattern as `toBareProblems`)
   - Update `createFileContentBucket` to handle `{disc}/{topicId}/lessons.json` key → maps to `{contentDir}/{disc}/lessons/{topicId}.json` with dimension defaults applied
   - Update `BundleManifest` type to include `items.lessons?: { count: number; hash: string }`

2. [ ] [IMP] Add `getTopicLessons` to content.ts (`packages/api/src/services/content.ts`):
   - Add `getTopicLessons(query: ContentQuery): Promise<Lesson[]>` following the same pattern as `getTopicProblems` (lines 367-377): fetch bundled → selectBestRows by dimension → strip to bare
   - Add to the returned service object (line 566-578)
   - The 7-tier fallback ranking works identically for lessons

3. [ ] [IMP] Update `SessionPhase` and `SessionItem` in shared types and session.ts:
   - In `packages/shared/src/types.ts`: update `SessionPhase` (keep `"diagnostic"` as-is since diagnostic service uses it separately)
   - In `session.ts`: update `SessionItem` union:
     - Add: `{ type: "lesson"; phase: "lesson"; topicId; topicName; lesson: Lesson; practiceProblems: Problem[]; message; ... }`
     - Modify: problem type gains `scaffolding: ReviewScaffolding` field
     - Modify: remediation type gains `lesson?: Lesson` field (serves prerequisite lesson + problems)
     - Remove: `{ type: "instruction" }` variant (replaced by lesson)
   - Keep `difficultyBias` field on problem items but always set to `"on-target"` (no difficulty differentiation)

4. [ ] [IMP] Rewrite `advancePhase` in session.ts:
   - Replace the `phases` array `["pretest", "instruction", "guided", "independent"]` with the new model:
     - New topic: `"lesson"` → mark lesson complete → schedule first review
     - Review topic: `"review"` → grade → FSRS update → next item
     - Remediation trigger: same as today (consecutive failures) but serves prerequisite lesson
   - Remove `buildPhaseItem` switch cases for `"pretest"`, `"instruction"`, `"guided"`, `"independent"`
   - Add `"lesson"` case: fetch lesson via `getTopicLessons()`, select 2-3 practice problems, return `SessionItem` with lesson + practice
   - Modify `"review"` case: fetch all problems (no difficulty filter), select randomly excluding recently-served, return with `scaffolding: "none"` default
   - Modify `"remediation"` case: fetch prerequisite's lesson + problems, return both

5. [ ] [IMP] Remove difficulty-based problem selection:
   - In `selectProblem` (session.ts:212-238): remove the `difficulty` parameter and the `applyDifficultyBias` logic. Select from ALL available problems for the topic (still respecting `demandPreference` and `exclude` list).
   - Remove `DifficultyBias` type and `applyDifficultyBias` function
   - Update all call sites in `buildPhaseItem` — remove difficulty and bias arguments
   - The `ProblemAttemptEvent.difficulty` field in analytics should be set to `"standard"` (or the topic's grade level) for backward compatibility — don't break AE queries

6. [ ] [IMP] Add scaffolding tracking to the review response path:
   - In the `/respond` endpoint handler: accept `scaffolding?: ReviewScaffolding` in the request body
   - In `session.respond()`: if `scaffolding !== "none"`, treat the response as guided (don't advance pure review counter, require additional pure reviews)
   - Store scaffolding in `review_log` — add a new `scaffolding TEXT` column (cleaner than overloading `hint_source`; requires D1 migration)
   - This is how the frontend communicates that the student opened the lesson panel

7. [ ] [IMP] Add `recordLessonView` to analytics.ts:
   - Define `LessonViewEvent = { userId, topicId, lessonId, contentVersion, presentation, contentDepth, sectionsViewed, totalSections, totalTimeMs, practiceProblemsAttempted, practiceProblemsCorrect }`
   - Add `recordLessonView(event: LessonViewEvent): void` to the analytics service
   - Write to AE with appropriate blobs/doubles, indexed by `topicId`

8. [ ] [TST] Update session tests and verify:
   - Update existing session tests in `packages/api/src/__tests__/` for the new phase model
   - Test: new topic → lesson item returned with practice problems
   - Test: review topic → problem item returned, no difficulty filtering
   - Test: scaffolding tracking — respond with `scaffolding: "lesson-referenced"` → doesn't count as pure review
   - Test: remediation → prerequisite lesson + problems returned
   - Run `just test` — all tests pass
   - Run `just typecheck` — passes

**Validation:** `just test` passes. `just typecheck` passes. Session service correctly serves lessons for new topics, problems for reviews, and prerequisite lessons for remediation. Scaffolding tracking works. No difficulty filtering in problem selection.

---

## Phase 4: Frontend

**Goal:** Render lessons in the learning UI. Support guided practice mode (lesson visible alongside problems). Support review mode with optional lesson reference and credit downgrade warning.

### Context for Execution

The frontend currently dispatches on `currentItem.type` in `learn.vue` (lines 270-293). `currentItem` is untyped (`any`). The main changes:
- New `LessonView.vue` component that renders sections sequentially
- `WorkedExample.vue` is reused as a section renderer within lessons
- `ProblemView.vue` is reused for practice problems within lessons and for review problems
- `learn.vue` gains a `v-else-if` for `type === "lesson"` and modifies the problem branch to show/hide a lesson reference panel

**Lesson rendering UX:**
- Sections render top-to-bottom, one at a time (progressive disclosure)
- `explanation` sections: prose text, optional media placeholder
- `worked-example` sections: embed `WorkedExample.vue` (existing component)
- `diagram` / `video` sections: placeholder with alt text and `[coming soon]` badge
- `practice` sections: embed `ProblemView.vue` inline with the lesson visible above/beside
- After all sections complete → emit `done`

**Review with lesson panel:**
- During review, a "Show Lesson" button is available
- Clicking it opens a side panel or overlay with the topic's lesson content
- A warning appears: "Opening the lesson will change this to guided practice"
- If confirmed, the response is sent with `scaffolding: "lesson-referenced"`

### Steps

1. [ ] [IMP] Create `LessonView.vue` component (`packages/web/src/components/LessonView.vue`):
   - Props: `lesson: Lesson`, `practiceProblems: Problem[]`, `topicName: string`, `topicId: string`
   - Renders sections sequentially with a progress bar (similar to WorkedExample step progress)
   - `explanation` section: prose text with markdown rendering, optional media placeholder image/text
   - `worked-example` section: renders `<WorkedExample>` component inline (reuse existing)
   - `diagram` section: renders alt text with a styled placeholder box
   - `video` section: renders description with a styled placeholder box
   - `practice` section: renders `<ProblemView>` for each practice problem, with the lesson sections still visible above as reference
   - Emits: `done` (all sections viewed + practice completed), `practice-submit` (individual practice problem submission)

2. [ ] [IMP] Update `learn.vue` to dispatch lesson items:
   - Add `v-else-if="currentItem?.type === 'lesson'"` branch → renders `<LessonView>`
   - Wire `@done` to a handler that calls `/respond` with `{ correct: true, responseMs }` (similar to `handleExampleDone`)
   - Wire `@practice-submit` to send individual practice results to the API
   - Remove the `v-else-if="currentItem?.type === 'instruction'"` branch (lessons replace it)

3. [ ] [IMP] Add lesson reference side panel to review mode:
   - When `currentItem.type === "problem"` and `currentItem.phase === "review"`, show a "Show Lesson" button
   - The button fetches the topic's lesson (can be included in the session item response, or fetched lazily)
   - Clicking opens a **collapsible side panel** showing the lesson sections (read-only, no practice). Side panel keeps the problem visible alongside the lesson content.
   - Show a warning modal first: "Opening the lesson will change this to guided practice. You'll need additional pure reviews. Continue?"
   - If confirmed, set a local `scaffolding` state that's sent with the problem response
   - Style the problem area to indicate guided mode (e.g., lighter background, "Guided" badge)

4. [ ] [IMP] Update problem submission to include scaffolding:
   - Modify `handleProblemSubmit` in `learn.vue` to include `scaffolding` in the POST body
   - Default: `"none"`. If lesson panel was opened: `"lesson-referenced"`. If LLM hints were used: `"llm-assisted"`. If both: `"lesson-and-llm"`.
   - The `ProblemView` component already tracks `hintsUsed` — add LLM hint detection to set `llm-assisted`

5. [ ] [IMP] Update `useApi.ts` to handle new session item types:
   - The API calls are untyped (`any`) so no breaking changes, but add TypeScript interfaces for the new response shapes for developer clarity
   - Add `fetchTopicLesson(topicId: string, discipline: string): Promise<Lesson | null>` for lazy lesson fetching in review mode (if not included in session item)

6. [ ] [TST] Manual testing in dev:
   - Start dev: `just dev`
   - Start a session, navigate to a new topic → should see `LessonView` with sections
   - Complete the lesson + practice → should transition to next item
   - Encounter a review → should see problem with "Show Lesson" button
   - Open the lesson → warning appears, lesson panel opens, guided mode indicated
   - Submit answer with lesson open → verify scaffolding is tracked
   - Verify WorkedExample still renders correctly inside lesson sections

**Validation:** Lesson renders correctly in the browser. Practice problems work within lessons. Review mode shows optional lesson reference. Scaffolding tracking flows from frontend to API. `just typecheck` passes.

---

## ~~Phase 5~~ and ~~Phase 6~~ — Moved to Plan 029

**Content authoring** (was Phase 5: Vertical Slice) and **simulation/audit updates** (was Phase 6) have been moved to Plan 029 (Content Generator Architecture) as Phases 8 and 9. This ensures 028 can be fully completed without circling back, and that content authoring uses the generator infrastructure built in 029 Phases 1-6.

See: [Plan 029](./029-content-generator-architecture.md)

---

## ~~Phase 5: Vertical Slice — Counting & Cardinality~~ (Moved to 029 Phase 6)

**Goal:** Author lessons for the counting-cardinality strand (~15 topics), remove/flatten difficulty field from their problems, validate the full pipeline end-to-end.

### Context for Execution

The counting-cardinality strand has 15 topics (count-to-10, count-to-20, count-to-100, compare-numbers-k, count-objects-to-5, count-objects-to-10, count-objects-to-20, one-to-one-correspondence, count-forward-from-number, count-backward-from-10, count-backward-from-20, compare-groups-more-less, order-numbers-to-10, order-numbers-to-20, number-bonds-to-10). All are grade K, presentation=primary, contentDepth=survey.

Each topic needs a lesson with at minimum:
- 1 `explanation` section introducing the concept
- 1 `worked-example` section demonstrating the skill (can reuse existing worked examples)
- 1 `practice` section with 2-3 problems embedded

The content review we ran in this session found several issues (hints revealing answers, subtraction notation without prerequisites, cognitive demand mislabeling). Lesson authoring is a chance to address these — the lesson's explanation section can explicitly teach the prerequisite concepts that problems assume.

### Steps

1. [ ] [IMP] Author lessons for all 15 counting-cardinality topics:
   - Create `../learn-content/math/lessons/<topic-id>.json` for each topic
   - Use `/generate-content math --strand counting-cardinality` workflow (updated in Phase 2)
   - Each lesson: 3-5 sections following the structure defined in Phase 1
   - Reuse existing worked examples as the `worked-example` section content
   - Select 2-3 problems for the `practice` section from existing problem pool
   - All content follows platform-medium constraints (screen + text input only)

2. [ ] [IMP] Flatten difficulty field on counting-cardinality problems:
   - For all 15 topics in `../learn-content/math/problems/<topic-id>.json`:
     - Remove or set `difficulty` to `"standard"` (or simply omit — it's now optional)
     - Verify all problems test the same core skill
     - If any problems feel significantly easier/harder than others, note for potential topic splitting (don't split in this phase — just document)
   - Also check `problems-generated/` for any counting-cardinality topics

3. [ ] [VAL] Run full pipeline validation:
   - `just validate-content` — passes with lessons, no errors
   - `just generate-bundles` — bundles include `lessons.json` for all 15 topics
   - `just typecheck` — passes
   - `just test` — passes
   - `just regression` — may need baseline update due to phase model changes (run and assess)

4. [ ] [VAL] End-to-end dev test:
   - `just import-content` to load graph
   - `just dev` to start servers
   - Start a session → should see a lesson for the first new topic
   - Complete the lesson → guided practice within the lesson
   - Return for review → problem only, with "Show Lesson" button
   - Test scaffolding: open lesson during review → verify guided mode
   - Verify the session progresses through multiple topics

5. [ ] [DOC] Update content review rubric (`audit/content/review-rubric.md`):
   - Add criterion 8: **Lesson Quality** — does the lesson effectively teach the concept? Are sections well-ordered? Is the explanation clear and appropriate for the declared presentation/depth? Does the practice section reinforce the lesson content?
   - Modify criterion 3: **Difficulty Calibration** → rename to **Problem Equivalence** — verify all problems within a topic test the same skill at the same level (no difficulty inversions because there should be no difficulty gradation). Flag problems that feel significantly easier/harder as potential topic splitting candidates.
   - Update `/content-review` to include lessons in the review context (update `audit/content/review-context.ts` to load lesson files alongside problems/examples)

**Validation:** All 15 topics have lessons. Full pipeline (validate → bundle → import → dev) works. A user can experience the lesson → practice → review flow for counting-cardinality topics in the browser. Content review rubric updated.

---

## ~~Phase 6: Simulation & Audit Updates~~ (Moved to 029 Phase 7)

**Goal:** Update the simulation runner, evaluation system, and audit infrastructure for the simplified learning loop. Establish new baselines.

### Context for Execution

The simulation runner (`audit/learner-simulations/src/runner.ts`) drives synthetic learners through the session engine. It calls the same `createSessionService` and `session.respond()` path that the API uses. The runner tracks `StateSnapshot` including `masteryCount`, `materializedMasteryCount`, phase transitions, etc.

Key changes:
- The runner no longer sees `pretest`, `instruction`, `guided`, `independent` phases — only `lesson`, `review`, `remediation`
- The runner needs to handle `type: "lesson"` session items (simulate completing the lesson + practice)
- Evaluation targets (`audit/learner-simulations/targets.json`) may need updating — phase-specific metrics (e.g., "pretest accuracy") no longer apply
- Baselines need re-establishing since the learning loop change affects all metrics

The audit orchestrator (`audit/orchestrator.ts`) assembles 8 sections. Section 8 (Content Review) should report lesson coverage. The audit test (`audit/__tests__/audit.test.ts`) needs updating for any schema changes.

### Steps

1. [ ] [IMP] Update simulation runner for simplified phase model:
   - In `runner.ts`: update the response simulation for `type: "lesson"` items — simulate viewing all sections and completing practice problems (the answer engine can grade practice problems same as regular problems)
   - Remove any phase-specific logic for `pretest`, `instruction`, `guided`, `independent`
   - Update `StateSnapshot` if needed — remove phase-specific fields that no longer apply
   - Update the answer engine if it has phase-specific behavior

2. [ ] [IMP] Update evaluation targets and baselines:
   - Review `audit/learner-simulations/targets.json` — remove or update targets that reference old phases
   - Update any targets that depend on difficulty distribution (no longer applicable)
   - Run `just simulate-all 30 42` to generate new simulation data
   - Run `just evaluate` to establish performance against updated targets
   - Save new baselines: `just evaluate --level l2` (or appropriate level)

3. [ ] [IMP] Update audit orchestrator for lesson coverage:
   - In `audit/orchestrator.ts`: update Section 2 (Content Quality) to include lesson counts alongside problem/example counts
   - In Section 8 (Content Review): add lesson coverage metric — "X/Y topics have lessons (Z%)"
   - Update `render.ts` to display lesson coverage in the markdown report
   - Update `audit/types.ts` `ContentQualitySection` to include `topicsWithLessons`, `totalLessons`

4. [ ] [TST] Run full test and regression suite:
   - `just typecheck` — passes
   - `just test` — passes (including updated session tests from Phase 3)
   - `npx tsx audit/__tests__/audit.test.ts` — passes (may need assertion updates for section counts/fields)
   - `just regression` — passes (may need new regression baseline)
   - If regression fails due to changed metrics, analyze whether the changes are expected (learning loop simplification changes convergence patterns) and update baseline accordingly

5. [ ] [DOC] Document the learning loop change:
   - Update CLAUDE.md: learning loop phases section, content conventions
   - Update `docs/content-system.md`: lesson content type, simplified phase model
   - Update DECISIONS.md: record the learning loop simplification decision with rationale
   - Update LEARNINGS.md if any gotchas are discovered during implementation

**Validation:** `just regression` passes with updated baselines. `just audit` reports lesson coverage. All tests pass. Documentation reflects the new learning model. L2 evaluation establishes a new baseline for the simplified loop.

---

## Design Notes

### Why lessons replace worked examples (not a separate phase)

Worked examples are one pedagogical tool — step-by-step demonstrations of a procedure. A lesson is a broader instructional unit that may include explanations, examples, diagrams, videos, and practice. Making worked examples a section type within lessons means:
- One content delivery mechanism (lessons) replaces two (instruction + worked examples)
- The lesson can include multiple worked examples if needed
- Non-procedural content (conceptual explanations, diagrams) has a home
- Media enrichment (future) attaches to lesson sections, not a separate content type

### Why difficulty levels are eliminated

In a properly atomic knowledge graph, each topic represents one testable skill. If problems within a topic can be meaningfully ranked easy/medium/hard, the topic is too broad and should be decomposed. Difficulty variation should come from topic progression (simpler prerequisite topics → harder advanced topics), not from within-topic gradation. This principle holds for mastery-gated disciplines (math, CS). Context-layered disciplines may retain depth levels within topics, but that's the `contentDepth` dimension, not problem difficulty.

### Why pretest is dropped

The diagnostic session already places students across the knowledge graph using adaptive binary search. It materializes mastery for topics at and above the placement grade and infers implicit mastery below. If the system only introduces topics that need learning (frontier topics), the per-topic pretest is redundant — the diagnostic already determined the student doesn't know it. Occasionally a student gets taught something they already know, but the cost (one unnecessary lesson view) is far lower than the benefit (simpler loop, better first-touch experience).

### Backward compatibility

- **Problems:** The `difficulty` field becomes optional. Existing problems with difficulty values continue to work — the field is simply ignored during selection. A future migration can clean up the field.
- **Worked examples:** Continue to exist as files and as a section type. No deletion needed.
- **Session phase values in review_log:** Old entries have `"pretest"`, `"instruction"`, etc. New entries have `"lesson"`, `"review"`, `"remediation"`. Analytics queries should handle both.
- **Analytics events:** `ProblemAttemptEvent.difficulty` is set to `"standard"` for all new events. Old events retain their original difficulty value. No AE schema change needed.
