# Plan 023: R2 Content Architecture & Analytics Engine

> **Created:** 2026-03-12T18:30:23Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Migrate all assessment and instructional content out of D1 into versioned R2 content bundles (one per topic). D1 stays lean: graph structure (topics, prerequisites, encompassings, collections) + user state (FSRS, mastery, diagnostic). Add Cloudflare Analytics Engine for granular per-problem/per-example event tracking with content version correlation. Update deploy pipeline from SQL batch export → R2 bundle upload.

**No backwards compatibility concerns** — nothing is live/deployed with real users yet.

**Plans 021 and 022 are paused** until this migration completes. Content generation (021 Phase 4+) and post-expansion validation (022) resume after the R2 architecture is in place, so all future content is generated into the final content model.

**Depends on:**
- Content repo separation (complete — learn-content is a sibling repo)
- Cross-discipline edge system (complete — centralized JSON + unified validation)
- Deploy pipeline (complete — but will be rewritten for R2)

**Unblocks:**
- Plan 021 Phase 4+ (Wave 3 content generation — into R2 bundles)
- Plan 022 (post-expansion validation — with AE instrumentation)
- Future media content (images, diagrams, audio, video)
- Content A/B testing and effectiveness analysis

---

## Architecture Reference

### What Stays in D1 (Structured, Queried, Joined)

| Table | Purpose | Why D1 |
|-------|---------|--------|
| `topics` | Graph nodes (id, name, depth, strand, grade_level) | Queried for frontier computation, prerequisite chains, collection membership |
| `prerequisites` | Directed edges (from → to, strength, type) | Joined with topics for DAG traversal |
| `encompassings` | Parent-child FIRe relationships | Queried for credit propagation |
| `disciplines` | Top-level organization + progression model | Reference data, rarely changes |
| `collections` / `collection_topics` | Packaging views (grade bands, strands) | Joined with topics for UI grouping |
| `topic_content_versions` | **NEW** — maps topic_id → content_hash, bundle_version | Queried on every content fetch for cache validation |
| `user_topic_state` | FSRS cards, mastery, frontier per user per topic | Transactional — updated on every review |
| `user_topic_depth` | Content depth progression per user per topic | Queried to determine next depth level |
| `review_log` | Compact SRS history (+ content_version column) | Long-term retention for SRS analysis, mastery trends |
| `daily_activity` | Aggregated daily engagement metrics | Queried for streaks, goals, weekly summaries |
| `learn_sessions` | Session metadata (start, end, aggregate stats) | Session lifecycle management |
| `diagnostic_sessions` | Placement test state and results | Queried for implicit mastery estimates |
| All auth/user/org tables | User accounts, orgs, links | Transactional user management |
| `assignments` / `assignment_responses` | Teacher-created assignments | Queried for assignment workflow |
| `group_sessions` / participants | Collaborative sessions | Real-time session state |
| `llm_usage` | LLM cost tracking | Cost aggregation queries |
| `presentation_drift_log` | Presentation level adjustment history | Queried for drift analysis |
| `user_preferences` / `user_discipline_presentation` | User settings | Read on every session start |

### What Moves to R2 (Content Bundles)

| Current D1 Table | R2 Bundle Location | Notes |
|------------------|--------------------|-------|
| `assessment_content` (17K rows) | `{discipline}/{topic-id}/problems.json` | All problems for a topic in one file |
| `instructional_content` (1.4K rows) | `{discipline}/{topic-id}/examples.json` | All examples for a topic in one file |
| *(future)* | `{discipline}/{topic-id}/media/*` | Images, diagrams, audio, video |

### What Goes to Analytics Engine (Rich Events)

| Event Type | Data Points | Why AE (not D1) |
|------------|-------------|------------------|
| Problem attempt | userId, topicId, problemId, contentVersion, correct, responseMs, hintsUsed, confidence, phase, difficulty, cognitiveDemand, presentation, contentDepth | High volume (50+ events/session), 90-day auto-expire, aggregation-optimized |
| Example view | userId, topicId, exampleId, contentVersion, stepsViewed, selfExplanationQuality, timePerStep, fadingLevel | Step-level granularity too detailed for D1 |
| Content effectiveness rollup | topicId, contentVersion, totalAttempts, accuracy, avgResponseMs, hintRate | Periodic rollup → R2 reports for long-term |

### D1 review_log Stays (Compact, Long-Term)

The existing `review_log` table continues to record every review for SRS history, but gains a `content_version` column for long-term version correlation. It does NOT store the full problem text or detailed interaction — that's in AE.

```
review_log (D1 — permanent, compact):
  userId, topicId, rating, correct, responseMs, phase, content_version, createdAt

Analytics Engine (AE — 90 days, rich):
  userId, topicId, problemId, contentVersion, correct, responseMs, hintsUsed,
  confidence, phase, difficulty, cognitiveDemand, presentation, contentDepth,
  misconception, difficultyBias, blendRole
```

---

## R2 Bundle Format

### Directory Structure

```
R2 Bucket: learn-content
├── math/
│   ├── add-within-20/
│   │   ├── manifest.json       # Version metadata, content hashes, item counts
│   │   ├── problems.json       # All problems for this topic (Problem[])
│   │   ├── examples.json       # All worked examples (WorkedExample[])
│   │   └── media/              # Future: images, diagrams, audio, video
│   │       ├── number-line.svg
│   │       └── walkthrough.mp4
│   ├── add-within-100/
│   │   ├── manifest.json
│   │   ├── problems.json
│   │   └── examples.json
│   └── ...
├── ela/
│   └── ...
└── _meta/
    └── disciplines.json        # Discipline list + topic counts (cache-friendly)
```

### manifest.json Schema

```json
{
  "version": 1,
  "contentHash": "sha256:a1b2c3d4...",
  "topicId": "add-within-20",
  "discipline": "math",
  "generatedAt": "2026-03-12T18:30:00Z",
  "items": {
    "problems": {
      "count": 15,
      "hash": "sha256:...",
      "difficulties": { "easy": 5, "medium": 5, "hard": 5 },
      "types": { "text-qa": 12, "numerical-input": 3 },
      "demands": { "procedural": 8, "conceptual": 4, "application": 3 }
    },
    "examples": {
      "count": 2,
      "hash": "sha256:..."
    },
    "media": []
  },
  "dimensions": {
    "presentations": ["standard"],
    "depths": ["survey"],
    "locales": ["en"],
    "flavors": ["classic"]
  }
}
```

The `contentHash` is the hash of (problems.json + examples.json + media/*). It changes whenever any content in the bundle changes. This is stored in D1 `topic_content_versions` for cache validation.

### problems.json Schema

Identical to current learn-content JSON files — an array of `Problem` objects:

```typescript
// packages/shared/src/types.ts — Problem type (unchanged)
type Problem = {
  id: string;                        // e.g., "add-within-20-p1"
  topicId: string;                   // e.g., "add-within-20"
  difficulty: ProblemDifficulty;     // "easy" | "medium" | "hard"
  question: string;                  // Problem statement
  answer: string;                    // Correct answer
  hints: string[];                   // Progressive hints (2-4)
  solution: string;                  // Worked solution explanation
  type?: AssessmentType;             // "text-qa" | "numerical-input" | "multi-step" | "matching" | "multi-select" | "equation-builder"
  typeProperties?: TypeProperties;   // Type-specific config (tolerance, steps, pairs, options)
  visuals?: VisualAsset[];           // Visual aids (number-line, fraction-bar, etc.)
  keyPrerequisiteId?: string;        // For targeted remediation
  cognitiveDemand?: CognitiveDemand; // "procedural" | "conceptual" | "application" | "reasoning" | "error_analysis"
  // NEW fields for R2 bundles:
  flavor?: string;                   // Content variant (default: "classic")
  locale?: string;                   // Language (default: "en")
  presentation?: PresentationLevel;  // Vocabulary level (default: "standard")
  contentDepth?: ContentDepthLevel;  // Analytical depth (default: "survey")
  source?: string;                   // "hand-authored" | "generated" | "supplementary"
};
```

Note: `flavor`, `locale`, `presentation`, `contentDepth`, and `source` were previously D1-only columns. They now live in the JSON directly. The content service applies fallback ranking on the in-memory array after fetching from R2.

### examples.json Schema

```typescript
// packages/shared/src/types.ts — WorkedExample type (unchanged)
type WorkedExample = {
  id: string;                        // e.g., "add-within-20-ex1"
  topicId: string;
  title: string;                     // "Adding 8 + 5 by Making 10"
  steps: WorkedExampleStep[];
  visuals?: VisualAsset[];
  // NEW fields for R2 bundles:
  flavor?: string;
  locale?: string;
  presentation?: PresentationLevel;
  contentDepth?: ContentDepthLevel;
};

type WorkedExampleStep = {
  subgoalLabel: string;   // "Find how many more to make 10"
  instruction: string;    // "Start with 8. How many more do we need to reach 10?"
  work: string;           // "8 + ? = 10. We need 2 more."
  explanation: string;    // "Knowing pairs that make 10 is key."
};
```

### Content Dimensions in R2 Context

Currently, the 7-tier fallback ranking happens in SQL via indexed columns. After migration, the same ranking happens in-memory on the fetched array. This is fine because:
- Typical bundle: 15-25 problems (well under 1KB to filter)
- Ranking logic is identical (match presentation → match depth → relax constraints)
- No SQL roundtrip — single R2 GET with edge cache

---

## learn-content Repo Changes

The learn-content repo structure is mostly unchanged — it's already the source of truth for content JSON files. But we need to:

1. **Ensure dimension fields are in JSON**: Currently problems/examples in learn-content may not have `flavor`, `locale`, `presentation`, `contentDepth` fields (they defaulted in D1). The bundle generator should add defaults when missing.

2. **Add generated bundles output directory**: The bundle generator tool writes to a local staging area before R2 upload. This doesn't change learn-content itself.

3. **Content generation continues writing to learn-content**: `/generate-content` and future content commands write to `../learn-content/{discipline}/problems/*.json` and `examples/*.json` exactly as before. The deploy pipeline reads these and bundles them for R2.

4. **No structural change to learn-content**: The bundle format is a *deploy artifact*, not a source format. learn-content stays flat (`problems/{topic-id}.json`, `examples/{topic-id}.json`). The bundler aggregates per-topic.

---

## Analytics Engine Event Schema

### Problem Attempt Event

```typescript
analytics.writeDataPoint({
  blobs: [
    userId,           // blob1 — who
    topicId,          // blob2 — what topic
    problemId,        // blob3 — which specific problem
    contentVersion,   // blob4 — bundle version hash
    phase,            // blob5 — pretest|guided|independent|review|remediation
    difficulty,       // blob6 — easy|medium|hard
    cognitiveDemand,  // blob7 — procedural|conceptual|application|reasoning|error_analysis
    presentation,     // blob8 — primary|intermediate|standard|advanced
    contentDepth,     // blob9 — survey|contextual|analytical|synthesis
    disciplineId,     // blob10 — math|ela|history
    blendRole,        // blob11 — warmup|main|stretch
    difficultyBias,   // blob12 — easier|on-target|harder
  ],
  doubles: [
    correct ? 1 : 0,  // double1 — correctness
    responseMs,        // double2 — response time
    hintsUsed,         // double3 — hint count
    confidence ?? 0,   // double4 — self-reported confidence (1-5)
    rating,            // double5 — FSRS grade (1-4)
    misconception ? 1 : 0, // double6 — misconception flag
  ],
  indexes: [topicId], // Primary query dimension
});
```

### Example View Event

```typescript
analytics.writeDataPoint({
  blobs: [
    userId,
    topicId,
    exampleId,
    contentVersion,
    presentation,
    contentDepth,
    "example-view",   // blob7 — event type discriminator
  ],
  doubles: [
    stepsViewed,       // double1 — how many steps seen
    totalSteps,        // double2 — total steps in example
    totalTimeMs,       // double3 — total viewing time
    fadingLevel,       // double4 — progressive fading level
    selfExplQuality,   // double5 — 0=none, 1=weak, 2=partial, 3=strong, 4=misconception
  ],
  indexes: [topicId],
});
```

### Content Effectiveness Query Examples

```sql
-- Per-problem accuracy (last 30 days)
SELECT blob3 AS problemId, blob2 AS topicId,
  SUM(double1) / COUNT(*) AS accuracy,
  AVG(double2) AS avgResponseMs,
  AVG(double3) AS avgHints,
  COUNT(*) AS attempts
FROM learn_analytics
WHERE blob7 != 'example-view'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY blob3, blob2
ORDER BY accuracy ASC

-- Content version comparison (A/B)
SELECT blob4 AS contentVersion,
  SUM(double1) / COUNT(*) AS accuracy,
  AVG(double2) AS avgResponseMs
FROM learn_analytics
WHERE blob2 = 'add-within-20'
GROUP BY blob4
```

---

## Runtime Content Delivery Flow

```
Client: POST /sessions/{id}/respond
  │
  ├─ SessionService.buildPhaseItem(state)
  │   │
  │   ├─ ContentService.resolvePresentation(userId)     ← D1 query (user prefs)
  │   ├─ ContentService.resolveContentDepth(userId, topicId) ← D1 query (user_topic_depth)
  │   │
  │   ├─ ContentService.getTopicProblems(topicId, presentation, depth)
  │   │   │
  │   │   ├─ Check R2 cache (Cache API)
  │   │   │   ├─ HIT: return cached problems.json
  │   │   │   └─ MISS: fetch R2 `math/add-within-20/problems.json`
  │   │   │           → cache with ETag from manifest hash
  │   │   │
  │   │   ├─ Parse Problem[] array (typically 15-25 items)
  │   │   ├─ Apply 7-tier fallback ranking (in-memory):
  │   │   │   1. Exact match (presentation + depth + locale + flavor)
  │   │   │   2. Presentation match, relax depth
  │   │   │   3. Depth match, relax presentation
  │   │   │   ... 7. Accept any content
  │   │   └─ Return ranked Problem[]
  │   │
  │   ├─ SessionService.selectProblem(problems, difficulty, bias, demand)
  │   │   ├─ Filter by difficulty (apply adaptive bias)
  │   │   ├─ Prefer target cognitive demand
  │   │   ├─ Prefer diverse question types
  │   │   └─ Random from candidates
  │   │
  │   └─ Return SessionItem { type: "problem", problem, ... }
  │
  ├─ After response graded:
  │   ├─ D1: update user_topic_state (FSRS)
  │   ├─ D1: insert review_log (compact, with content_version)
  │   ├─ D1: update daily_activity
  │   └─ AE: writeDataPoint (rich event with problem-level detail)
  │
  └─ Return next SessionItem
```

---

## Wrangler Binding Changes

Current bindings:
- `DB` — D1 (learn-db)
- `AI` — Workers AI (Whisper STT)
- `ASSETS` — Static frontend files

New bindings to add:
- `CONTENT` — R2 bucket (learn-content)
- `ANALYTICS` — Analytics Engine dataset (learn-analytics)

```toml
# wrangler.toml additions:

[[r2_buckets]]
binding = "CONTENT"
bucket_name = "learn-content"

[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "learn-analytics"
```

Both need to be added to dev, production, and preview environments.

---

## Progress

**Completed:** Phase 1 ✓
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: R2 Infrastructure & Bundle Format ✓
**Goal:** Establish R2 bucket, define bundle format, build the bundle generation tool, and add D1 schema for content version tracking.

### Context for Execution

**Key files to read first:**
- `wrangler.toml` — add R2 + AE bindings
- `packages/api/src/db/schema.ts` — add `topic_content_versions` table
- `tools/import-content.ts` — reference for how content is currently loaded (mirror the read logic for bundle generation)
- `packages/shared/src/types.ts` — Problem and WorkedExample types (bundle format must match)
- `../learn-content/math/graph.json` — topic list (bundle generator iterates topics)
- `../learn-content/math/problems/add-within-20.json` — sample problem file (source format)
- `../learn-content/math/examples/add-within-20.json` — sample example file (source format)

**Key decisions:**
- Bundle generator is a tool script (`tools/generate-bundles.ts`), not a runtime service
- Content hash uses SHA-256 of (problems.json + examples.json) concatenated
- `topic_content_versions` is a D1 table, not R2 metadata — queried on every content fetch
- R2 keys use `{discipline}/{topic-id}/{filename}` format (flat, no versioned paths — cache busting via ETag/content hash)

### Steps

1. [x] [CFG] Add R2 bucket and Analytics Engine bindings to `wrangler.toml`:
   - Add `[[r2_buckets]]` with binding `CONTENT`, bucket `learn-content`
   - Add `[[analytics_engine_datasets]]` with binding `ANALYTICS`, dataset `learn-analytics`
   - Add both to `[env.production]` section
   - Add preview environment section if not present
   - Update Worker types: `CONTENT: R2Bucket`, `ANALYTICS: AnalyticsEngineDataset`

2. [x] [CFG] Create R2 bucket and Analytics Engine dataset in Cloudflare dashboard:
   - `wrangler r2 bucket create learn-content`
   - Analytics Engine dataset via dashboard (or wrangler if supported)
   - Verify bindings work locally with `wrangler dev`

3. [x] [IMP] Add `topic_content_versions` table — D1 migration:
   ```sql
   CREATE TABLE topic_content_versions (
     topic_id TEXT PRIMARY KEY REFERENCES topics(id),
     content_hash TEXT NOT NULL,
     bundle_version INTEGER NOT NULL DEFAULT 1,
     problems_count INTEGER NOT NULL DEFAULT 0,
     examples_count INTEGER NOT NULL DEFAULT 0,
     generated_at TEXT NOT NULL,
     uploaded_at TEXT
   );
   ```
   - Add Drizzle schema definition in `schema.ts`
   - Run `just db-generate` and verify migration SQL

4. [x] [IMP] Add `content_version` column to `review_log` table — D1 migration:
   ```sql
   ALTER TABLE review_log ADD COLUMN content_version TEXT;
   ```
   - Update Drizzle schema
   - This column is nullable (old reviews won't have it)

5. [x] [IMP] Build bundle generator tool (`tools/generate-bundles.ts`):
   - Read `graph.json` for each discipline to get topic list
   - For each topic:
     - Read `problems/{topic-id}.json` (if exists)
     - Read `examples/{topic-id}.json` (if exists)
     - Add default dimension fields if missing (`flavor: "classic"`, `locale: "en"`, `presentation: "standard"`, `contentDepth: "survey"`, `source: "hand-authored"`)
     - Compute SHA-256 content hash
     - Generate `manifest.json` with item counts, difficulty distribution, type distribution, demand distribution, available dimensions
   - Write bundles to staging directory (default: `/tmp/learn-content-bundles/`)
   - Output summary: topics processed, problems bundled, examples bundled, total size
   - Support `--discipline <name>` filter and `--dry-run` mode

6. [x] [IMP] Build R2 upload tool (`tools/upload-bundles.ts`):
   - Read staged bundles from directory
   - Upload to R2 via wrangler or Workers API
   - Update `topic_content_versions` in D1 with content hashes
   - Support `--preview` and `--production` environment flags
   - Idempotent: skip upload if content hash matches existing

7. [x] [VAL] Verify bundle generation for all current content:
   - Run `npx tsx tools/generate-bundles.ts` on full learn-content
   - Verify: 790 topics across 3 disciplines → 790 bundles, 8890 problems, 1448 examples, 7.21 MB total
   - Verify manifest accuracy (counts, hashes, dimensions)
   - Verify total bundle size is reasonable

8. [x] [DOC] Create `docs/r2-content-architecture.md`:
   - Bundle format specification (manifest, problems, examples schemas)
   - R2 key structure
   - Content hash computation algorithm
   - Cache strategy (ETag-based, Cache API)
   - Analytics Engine event schemas (problem attempt, example view)
   - D1 vs R2 vs AE boundary diagram
   - Migration timeline and plan reference

**Validation:** R2 bucket exists. Bundles generate for all topics. `topic_content_versions` migration applies. Bundle format matches shared types. Architecture doc written.

---

## Phase 2: Content Service Migration
**Goal:** Rewrite the content service to fetch from R2 instead of D1, preserving all existing behavior (7-tier fallback ranking, presentation drift, demand mixing).

### Context for Execution

**Key files to modify:**
- `packages/api/src/services/content.ts` (644 lines) — core rewrite: replace D1 queries with R2 fetches
- `packages/api/src/services/session.ts` — update to pass R2 env binding
- `packages/api/src/index.ts` — pass `CONTENT` binding through to services
- `packages/api/src/db/index.ts` — add R2 type to env

**What changes:**
- `getTopicProblems()` and `getTopicExamples()`: fetch from R2 instead of `db.select().from(assessmentContent)`
- Fallback ranking: same 7-tier logic, but applied to in-memory `Problem[]` array instead of SQL results
- Factory function signature: `createContentService(db, r2Bucket)` instead of `createContentService(db)`

**What does NOT change:**
- `resolvePresentation()` — still queries D1 (user preferences, presentation distribution)
- `resolveContentDepth()` — still queries D1 (user_topic_depth)
- `sampleFromDistribution()` — pure function, unchanged
- `nudgeDistribution()` / `applyNudge()` — still writes to D1
- All session service logic — receives `Problem[]` and `WorkedExample[]` same as before
- All frontend components — receive same `SessionItem` shape
- All shared types — `Problem`, `WorkedExample`, `SessionItem` unchanged

### Steps

1. [ ] [IMP] Create R2 content fetcher module (`packages/api/src/services/content-r2.ts`):
   - `fetchTopicProblems(bucket: R2Bucket, discipline: string, topicId: string): Promise<Problem[]>`
   - `fetchTopicExamples(bucket: R2Bucket, discipline: string, topicId: string): Promise<WorkedExample[]>`
   - `fetchManifest(bucket: R2Bucket, discipline: string, topicId: string): Promise<Manifest>`
   - Use Cache API: check cache first, fetch R2 on miss, cache with content hash ETag
   - Handle missing bundles gracefully (topic exists in graph but no content yet → empty array)
   - Parse JSON and validate against shared types

2. [ ] [IMP] Rewrite `getTopicProblems()` in content service:
   - Replace `db.select().from(schema.assessmentContent).where(eq(...topicId))` with `fetchTopicProblems(bucket, discipline, topicId)`
   - Apply same 7-tier fallback ranking on the fetched `Problem[]` array (filter by presentation, depth, locale, flavor)
   - Preserve difficulty bias, demand preference, and type diversity logic (these operate on the ranked array, unchanged)
   - Add `discipline` parameter (currently inferred from D1 join — now needed for R2 key)

3. [ ] [IMP] Rewrite `getTopicExamples()` in content service:
   - Same pattern: R2 fetch → in-memory fallback ranking
   - Preserve fading level logic (unchanged — operates on selected example)

4. [ ] [IMP] Update service factory wiring:
   - `createContentService(db, r2Bucket)` — add R2 bucket parameter
   - Update `packages/api/src/index.ts` to pass `env.CONTENT` binding
   - Update session service to pass R2 binding through to content service
   - Update any other callers (diagnostic service, assignment routes)

5. [ ] [IMP] Update `scheduleReview()` in SRS service to record content_version:
   - Look up `topic_content_versions.content_hash` for the topic
   - Pass to `review_log` insert as `content_version`
   - Nullable fallback if version not yet populated

6. [ ] [TST] Write/update content service tests:
   - Mock R2 bucket with in-memory implementation
   - Test: fetch problems, fallback ranking (exact match, partial match, any-content fallback)
   - Test: cache hit vs miss behavior
   - Test: missing bundle (topic with no content)
   - Test: content_version recorded in review_log
   - Verify existing content service tests still pass (adapt D1 mocks → R2 mocks)

7. [ ] [VAL] Integration test with local R2:
   - Generate bundles from learn-content
   - Upload to local R2 (wrangler dev)
   - Start learning session, verify problems and examples load correctly
   - Verify presentation fallback works
   - Verify response flow records content_version

**Validation:** All existing content service tests pass (adapted for R2). Learning session works end-to-end with R2 content. Fallback ranking produces identical results to D1 queries. content_version appears in review_log.

---

## Phase 3: D1 Schema Cleanup & Import Pipeline
**Goal:** Remove content tables from D1, update import/export tooling to handle graph-only D1 + R2 content separately.

### Context for Execution

**Key files to modify:**
- `packages/api/src/db/schema.ts` — drop `assessmentContent` and `instructionalContent` tables
- `tools/import-content.ts` — rewrite to import graph structure only (topics, edges, collections), skip content
- `tools/export-sql.ts` — rewrite to export graph structure only
- `tools/validate-content.ts` — update (content validation now checks JSON files, not D1)
- `packages/api/src/routes/admin.ts` — update analytics queries that joined on content tables

**What to remove from D1:**
- `assessment_content` table (17K rows of problem text → now in R2)
- `instructional_content` table (1.4K rows of example text → now in R2)
- All indexes on these tables

**What to keep:**
- `review_log.assessmentContentId` column — still references problem IDs (which are in R2 bundles). This is a logical reference, not a foreign key.
- `assignment_responses.questionId` — same, logical reference to R2 problem ID

**Migration approach:**
Since nothing is live and we don't care about backwards compatibility, we can create a migration that DROPs the tables cleanly. No data preservation needed.

### Steps

1. [ ] [IMP] D1 migration: drop content tables:
   ```sql
   DROP TABLE IF EXISTS assessment_content;
   DROP TABLE IF EXISTS instructional_content;
   ```
   - Remove from Drizzle schema (`schema.ts`)
   - Remove all D1 indexes on these tables
   - Run `just db-generate` to produce migration
   - Verify migration applies cleanly

2. [ ] [IMP] Rewrite `tools/import-content.ts` — graph-only import:
   - Keep: discipline upsert, topic insert, prerequisite insert, encompassing insert, collection insert, cross-discipline edges
   - Remove: assessment_content insert, instructional_content insert
   - Add: populate `topic_content_versions` from manifest files (if bundles exist)
   - Update console output to reflect graph-only import

3. [ ] [IMP] Rewrite `tools/export-sql.ts` — graph-only export:
   - Keep: discipline, topic, prerequisite, encompassing, collection SQL
   - Remove: assessment_content, instructional_content SQL
   - This dramatically reduces batch file count (44 batches → ~5 batches)

4. [ ] [REF] Update admin analytics routes (`packages/api/src/routes/admin.ts`):
   - `/admin/analytics/content-effectiveness` — currently joins `review_log` with `assessment_content`. Rewrite to:
     - Query `review_log` for per-topic aggregates (these don't need content text)
     - Or query Analytics Engine for rich content-level data
   - `/admin/analytics/content-quality` — same treatment
   - `/admin/analytics/content-versions` — rewrite to use `topic_content_versions` + AE data
   - Remove any route that directly queries `assessment_content` or `instructional_content`

5. [ ] [REF] Update validation tooling:
   - `tools/validate-content.ts` — content completeness checks now validate learn-content JSON files directly (they already do — no D1 dependency). Verify no D1 references remain.
   - `tools/validate-graph.ts` — graph-only, already correct
   - `tools/validate-cross-discipline.ts` — graph-only, already correct

6. [ ] [VAL] Full validation pass:
   - `just db-generate` — migration generates cleanly
   - `just db-migrate` — migration applies
   - `just import-content` — graph-only import succeeds
   - `just validate-content` — all checks pass
   - `just typecheck` — no TypeScript errors from removed schema references
   - `just test` — all tests pass (adapt tests that referenced content tables)

**Validation:** Content tables gone from D1. Import/export handle graph-only. All validation passes. TypeScript compiles. Tests pass.

---

## Phase 4: Deploy Pipeline
**Goal:** Replace SQL content deploy with R2 bundle upload. End-to-end deploy works for preview and production.

### Context for Execution

**Current deploy flow (being replaced):**
```
just deploy-content
  → export-sql.ts --dir /tmp/deploy  (generates 44 SQL batch files)
  → for f in *.sql; do wrangler d1 execute --remote; done  (slow, fragile)
```

**New deploy flow:**
```
just deploy-content
  → generate-bundles.ts  (learn-content JSON → staged bundles)
  → upload-bundles.ts --production  (staged bundles → R2 + update D1 topic_content_versions)
```

**Key files to modify:**
- `justfile` — rewrite `deploy-content`, `deploy-content-preview`, `deploy` recipes
- `tools/generate-bundles.ts` (from Phase 1)
- `tools/upload-bundles.ts` (from Phase 1)

### Steps

1. [ ] [IMP] Build `tools/deploy-content.ts` — unified content deploy script:
   - Step 1: Generate bundles from learn-content → staging dir
   - Step 2: Upload bundles to R2 (via wrangler r2 object put, or Workers API)
   - Step 3: Update `topic_content_versions` in remote D1
   - Support `--env production|preview` flag
   - Support `--discipline <name>` for partial deploys
   - Report: topics deployed, bundles uploaded, size, duration

2. [ ] [IMP] Update justfile recipes:
   ```just
   # Deploy content to R2 (production)
   deploy-content:
       CONTENT_DIR="{{content_dir}}" npx tsx tools/deploy-content.ts --env production

   # Deploy content to R2 (preview)
   deploy-content-preview:
       CONTENT_DIR="{{content_dir}}" npx tsx tools/deploy-content.ts --env preview

   # Full production deploy
   deploy:
       npx wrangler deploy
       pnpm --filter web exec vite build
       npx wrangler pages deploy packages/web/dist --project-name learn-platform-web --commit-dirty=true
       just deploy-content

   # Full preview deploy
   deploy-preview: deploy-preview-api deploy-preview-web deploy-content-preview
   ```

3. [ ] [IMP] Add `import-content` R2 mode for local development:
   - `just import-content` should still work for local dev
   - Option A: local dev uses miniflare R2 (in-memory) — generate bundles → upload to local R2
   - Option B: content service has a local-file fallback that reads from learn-content directly (no R2 needed for dev)
   - Decide and implement. Option B is simpler for dev ergonomics.

4. [ ] [VAL] End-to-end preview deploy test:
   - `just deploy-preview` — deploys API + web + content
   - Verify R2 bucket has all topic bundles
   - Verify `topic_content_versions` populated in preview D1
   - Hit preview API: start session, verify content loads from R2

5. [ ] [IMP] Cache invalidation strategy:
   - On content deploy, R2 objects are overwritten with new content
   - Cache API uses content hash as ETag — new hash means cache miss
   - No explicit cache purging needed (overwrite + hash change = automatic invalidation)
   - Document this in architecture doc

6. [ ] [REF] Remove old SQL export tooling:
   - Delete `tools/export-sql.ts` (replaced by generate-bundles + upload-bundles)
   - Remove old `deploy-content` SQL batch logic from justfile
   - Clean up any references in CLAUDE.md, docs

**Validation:** `just deploy-preview` works end-to-end. R2 has all content bundles. Preview environment serves content from R2. Local dev still works. Old SQL export removed.

---

## Phase 5: Analytics Engine Integration
**Goal:** Instrument the learning loop with Cloudflare Analytics Engine for rich per-problem event tracking. Build content effectiveness queries. Add content version correlation.

### Context for Execution

**Key files to modify:**
- `packages/api/src/services/session.ts` — instrument `respond()` with AE events
- `packages/api/src/services/srs.ts` — pass AE binding for event recording
- `packages/api/src/routes/admin.ts` — add/update analytics query routes
- `packages/api/src/index.ts` — pass `ANALYTICS` binding through

**Analytics Engine API:**
```typescript
// Write (in Worker):
env.ANALYTICS.writeDataPoint({
  blobs: string[],    // up to 20 string dimensions
  doubles: number[],  // up to 20 numeric measures
  indexes: string[],  // up to 1 index for efficient querying
});

// Query (via REST API or Workers Analytics Engine SQL API):
// SELECT blob1, SUM(double1)/COUNT(*) FROM dataset WHERE ...
```

**What NOT to change:**
- D1 review_log continues to be written (compact SRS history)
- FSRS scheduling logic unchanged
- Frontend unchanged
- Session flow unchanged

### Steps

1. [ ] [IMP] Create analytics service (`packages/api/src/services/analytics.ts`):
   - Factory: `createAnalyticsService(ae: AnalyticsEngineDataset | null)`
   - `recordProblemAttempt(event: ProblemAttemptEvent)` — writes to AE
   - `recordExampleView(event: ExampleViewEvent)` — writes to AE
   - Graceful degradation: if AE binding is null (local dev), log or skip
   - Type definitions for event shapes (matches schema in Architecture Reference above)

2. [ ] [IMP] Instrument `session.respond()` with analytics:
   - After grading + SRS update, call `analytics.recordProblemAttempt()`
   - Include all 12 blob dimensions and 6 double measures
   - Include content_version from `topic_content_versions`
   - Handle instruction phase: call `analytics.recordExampleView()` after example completion

3. [ ] [IMP] Instrument worked example views:
   - Track per-step viewing in `WorkedExample.vue` → API endpoint
   - New route: `POST /sessions/:id/example-viewed` with step data
   - Session service forwards to analytics service

4. [ ] [IMP] Update admin analytics routes to query Analytics Engine:
   - `/admin/analytics/content-effectiveness` — rewrite query to use AE SQL API
   - `/admin/analytics/content-quality` — same
   - `/admin/analytics/content-versions` — A/B comparison using contentVersion blob
   - New: `/admin/analytics/problem-level` — per-problem accuracy, response time, hint usage
   - New: `/admin/analytics/bundle-comparison` — compare two content versions for a topic

5. [ ] [IMP] Add content effectiveness rollup (optional — can defer):
   - Worker cron or on-demand script that queries AE
   - Writes aggregate stats to R2 `_analytics/` prefix
   - Per-topic: accuracy trend, hint rate, avg response time, struggling problems
   - Per-version: accuracy delta, time delta

6. [ ] [TST] Test analytics instrumentation:
   - Unit test: analytics service writes correct event shape
   - Integration test: run learning session, verify AE events recorded
   - Test: graceful degradation when AE binding missing
   - Test: admin analytics routes return data from AE

7. [ ] [VAL] End-to-end analytics verification:
   - Start session, complete several problems
   - Query AE via admin route — verify events appear
   - Verify content_version correlation works
   - Verify review_log still written (dual-write)

**Validation:** Problem attempts and example views recorded in Analytics Engine. Admin routes query AE successfully. Graceful degradation in dev. Content version correlation works.

---

## Phase 6: Simulation Compatibility & Validation
**Goal:** Ensure the simulation system works with R2 content architecture, run full validation, update all documentation, prepare 021/022 for resumption.

### Context for Execution

**Simulation challenge:** The simulation runner (`simulations/src/runner.ts`) uses the same API services in-process (not via HTTP). It needs content access. Options:
1. **Local file mode**: Content service reads from learn-content JSON files directly (no R2). This is what `import-content.ts` does today.
2. **Local R2**: Use miniflare's R2 emulation.
3. **Hybrid**: Content service accepts either R2 bucket or a file-system adapter.

Option 3 (hybrid) is cleanest — the content service takes an abstract content source, and simulations provide a file-system implementation while production uses R2. This also makes local dev simpler.

**Key files:**
- `simulations/src/runner.ts` — simulation harness
- `simulations/src/services.ts` — service factory for simulations
- Content service (from Phase 2) — needs to accept file-system adapter
- All docs: CLAUDE.md, content-authoring.md, content-system.md, justfile comments

### Steps

1. [ ] [REF] Abstract content source in content service:
   - Define `ContentSource` interface: `getProblems(discipline, topicId)`, `getExamples(discipline, topicId)`
   - `R2ContentSource` — fetches from R2 bucket (production)
   - `FileContentSource` — reads from learn-content directory (simulation, local dev)
   - Content service accepts `ContentSource` instead of raw R2 bucket
   - This makes the content service testable and simulation-compatible

2. [ ] [IMP] Update simulation service factory:
   - Create `FileContentSource` that reads from `CONTENT_DIR`
   - Wire into simulation runner's service creation
   - Verify simulations don't need R2 or network access

3. [ ] [VAL] Simulation regression check:
   - `just simulate-regression` — quick 3-profile check
   - `just simulate average-young 5 42` — single profile smoke test
   - Compare with pre-migration results (should be identical — same content, same logic)

4. [ ] [DOC] Update CLAUDE.md:
   - Update Structure section: R2 bucket, Analytics Engine binding
   - Update Commands: new deploy recipes, bundle generation
   - Update Conventions: content is in R2, not D1
   - Update Content Pipeline section: generate → bundle → upload flow
   - Add Architecture section reference to `docs/r2-content-architecture.md`

5. [ ] [DOC] Update supporting docs:
   - `docs/content-authoring.md` — content generation still writes to learn-content, deploy bundles to R2
   - `docs/content-system.md` — update content storage model
   - `.claude/commands/generate-content.md` — no changes needed (generates to learn-content JSON)
   - `justfile` comments — update recipe descriptions

6. [ ] [DOC] Prepare 021/022 for resumption:
   - Update Plan 021 progress section: "Paused at Phase 4 for R2 migration (Plan 023)"
   - Update Plan 022 progress section: "Blocked on 021; R2 migration (Plan 023) in progress"
   - Add note to both: "Content generation and validation now target R2 bundle format. No changes to learn-content JSON structure — bundles are a deploy artifact."
   - Record decision in DECISIONS.md: "Migrated content from D1 to R2 before completing topic expansion"

**Validation:** Simulations run identically to pre-migration. All documentation updated. Plans 021/022 annotated for resumption. `just test`, `just typecheck`, `just validate-content` all pass. Full `just deploy-preview` works end-to-end.
