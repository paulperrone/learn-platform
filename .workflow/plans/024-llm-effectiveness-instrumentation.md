# Plan 024: LLM Effectiveness Instrumentation

> **Created:** 2026-03-13T16:59:02Z
> **Completed:** 2026-03-13
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Add topic/problem attribution and outcome correlation to LLM usage tracking so premium AI feature value is measurable. Extends the D1 `llm_usage` schema, the D1 `review_log`, and the Analytics Engine event schema (from Plan 023) to correlate LLM assistance with learning outcomes. This is a go-live requirement — without it, the premium tier value proposition is unmeasurable.

**Depends on:** Plan 023 (R2 Content Architecture & Analytics Engine) — complete
**Unblocks:** Plan 025 (Consolidated System Audit) — LLM effectiveness data consumed by audit report

## Progress

**Completed:** Phase 1, Phase 2, Phase 3
**In Progress:** —
**Next:** —

---

## Phase 1: Schema & Attribution ✓
**Goal:** Add topic/problem context to every LLM usage record, and mark every problem attempt with whether LLM assistance was received. Extend Analytics Engine event schema with LLM flag.

### Context for Execution

**Key files to read first:**
- `packages/api/src/db/schema.ts` — `llmUsage` table (lines 320-331), `reviewLog` table (lines 221-239)
- `packages/api/src/services/llm.ts` — `trackUsage()` function (line 148-169), all LLM methods
- `packages/api/src/services/analytics.ts` — `ProblemAttemptEvent` type, `recordProblemAttempt()` (12 blobs, 6 doubles)
- `packages/api/src/routes/llm.ts` — LLM route handlers (tutor, grade, hint, evaluate)
- `packages/api/src/services/session.ts` — `SessionState` type (line 15-41), `respond()` flow (line ~424), `persistState()` (line 239). Calls `srs.scheduleReview()` (line ~504) and `analytics.recordProblemAttempt()` (line ~549)
- `packages/api/src/services/srs.ts` — `scheduleReview()` writes to `review_log` (line ~302)

**Key decisions:**
- `llm_usage` gains nullable `topicId` and `problemId` columns (nullable because some LLM calls may be context-free)
- `review_log` gains `llm_assisted` boolean (was ANY LLM feature used on this problem attempt?) and `hint_source` text (`static` | `llm` | null)
- AE event gains blob13 = `llmAssisted` ("true"/"false") — within the 20-blob limit
- `trackUsage()` signature gains optional `topicId` and `problemId` parameters
- Session state tracks `llmAssistedThisProblem: boolean` per-problem (reset on each new problem)

1. [x] [IMP] D1 migration: add columns to `llm_usage`:
   ```sql
   ALTER TABLE llm_usage ADD COLUMN topic_id TEXT;
   ALTER TABLE llm_usage ADD COLUMN problem_id TEXT;
   ALTER TABLE llm_usage ADD COLUMN session_id TEXT;
   ```
   - Update Drizzle schema in `schema.ts`
   - Add index: `llm_usage_topic_idx` on `(topic_id)`
   - Run `just db-generate` and verify migration SQL
   - Manually add `DEFAULT` clauses if needed (nullable columns should be fine without)

2. [x] [IMP] D1 migration: add columns to `review_log`:
   ```sql
   ALTER TABLE review_log ADD COLUMN llm_assisted INTEGER DEFAULT 0;
   ALTER TABLE review_log ADD COLUMN hint_source TEXT;
   ```
   - `llm_assisted`: boolean (0/1) — was any LLM feature used for this problem attempt?
   - `hint_source`: `'static'` | `'llm'` | null — what kind of hints were used?
   - Update Drizzle schema
   - Run `just db-generate`

3. [x] [IMP] Update `trackUsage()` in `packages/api/src/services/llm.ts`:
   - Add optional `topicId?: string`, `problemId?: string`, `sessionId?: string` parameters
   - Pass through to `db.insert(schema.llmUsage).values({ ... })`
   - Update all callers:
     - `socraticTutor()` — pass topicId from request context
     - `evaluateExplanation()` — pass topicId and exampleId
     - `gradeResponse()` — pass topicId and problemId
     - Hint generation endpoints — pass topicId and problemId
   - Update LLM route handlers (`packages/api/src/routes/llm.ts`) to extract and pass topic/problem context

4. [x] [IMP] Add LLM tracking to session state and review_log:
   - **Decision: Option (a) — LLM route sets flag in `learn_sessions.stateJson`**
   - In `packages/api/src/services/session.ts`: add `llmAssistedThisProblem: boolean` and `hintSourceThisProblem: 'static' | 'llm' | null` to `SessionState` type (line ~15-41), reset both on each new problem (in phase advancement)
   - In LLM route handlers (`packages/api/src/routes/llm.ts`): when any LLM endpoint is called with a `sessionId`, load session state via `loadState()`, set `llmAssistedThisProblem = true` (and `hintSourceThisProblem = 'llm'` for hint endpoints), then `persistState()`
   - In `session.respond()` (line ~504): read `state.llmAssistedThisProblem` and `state.hintSourceThisProblem`, pass to `srs.scheduleReview()` as `llmAssisted` and `hintSource`
   - In `packages/api/src/services/srs.ts` `scheduleReview()` (line ~302): add `llmAssisted` and `hintSource` to the `review_log` INSERT values

5. [x] [IMP] Extend Analytics Engine event schema:
   - Add blob13 = `llmAssisted` ("true" | "false") to `ProblemAttemptEvent`
   - Update `recordProblemAttempt()` in analytics.ts to include the new blob
   - Update type definition `ProblemAttemptEvent` with `llmAssisted: boolean`
   - Verify we stay within AE's 20-blob limit (currently 12 → 13)

6. [x] [TST] Test LLM attribution:
   - Unit test: `trackUsage()` records topicId and problemId
   - Unit test: review_log includes `llm_assisted` flag
   - Unit test: AE event includes `llmAssisted` blob
   - Integration test: call tutor endpoint → respond to problem → verify review_log has `llm_assisted = true`
   - Integration test: respond to problem without LLM → verify `llm_assisted = false`
   - Verify existing LLM tests still pass
   - `just test` passes, `just typecheck` passes

**Validation:** Every LLM call records topic + problem context. Every problem attempt in review_log and AE records whether LLM was used. Session state tracks LLM assistance per-problem. All tests pass.

---

## Phase 2: Correlation Analytics ✓
**Goal:** Admin endpoints that join LLM usage with learning outcomes to measure whether premium features improve learning. Uses D1 review_log (long-term, permanent) and AE (granular per-problem, 90-day).

### Context for Execution

**Key files to modify:**
- `packages/api/src/routes/admin.ts` — add new analytics endpoints
- `packages/api/src/db/schema.ts` — reference new columns from Phase 1

**Data sources for queries:**
- D1 `review_log` (has `llm_assisted`, `hint_source`, `correct`, `topicId`, `responseMs`, `confidence`)
- D1 `llm_usage` (has `topicId`, `problemId`, `purpose`, `costCents`)
- D1 `user_topic_state` (has mastery, stability, lapses, reps)
- AE (has per-problem granularity with `llmAssisted` blob13)

1. [x] [IMP] Add `/admin/analytics/llm-effectiveness` endpoint:
   - Per-topic accuracy split: `llm_assisted = true` vs `llm_assisted = false`
   - Minimum sample size: 10 attempts per group per topic
   - Response: `{ topicId, llmAccuracy, baselineAccuracy, delta, llmAttempts, baselineAttempts }`
   - Sort by delta descending (topics where LLM helps most)
   - Also compute overall: "LLM-assisted accuracy: X% vs baseline: Y%"

2. [x] [IMP] Add `/admin/analytics/llm-hint-outcomes` endpoint:
   - For each hint event: did the student get the NEXT attempt on the same topic correct?
   - Split by `hint_source` (static vs LLM)
   - Response: `{ hintSource, nextAttemptAccuracy, sampleSize }`
   - Also: per-purpose effectiveness (tutor vs grade vs hint L3 vs hint L4)

3. [x] [IMP] Add `/admin/analytics/llm-mastery-impact` endpoint:
   - Compare time-to-mastery (sessions from first attempt to mastered) for users who used LLM on a topic vs those who didn't
   - Compare lapse rate (post-mastery lapses) for LLM-assisted vs unassisted mastery
   - Requires joining `llm_usage` (by topicId, userId) with `user_topic_state` (mastery, lapses, reps)
   - Response: `{ llmAvgSessionsToMastery, baselineAvgSessionsToMastery, llmAvgLapses, baselineAvgLapses }`

4. [x] [IMP] Add budget exhaustion logging:
   - **Decision: Append to `llm_usage` with `purpose: "budget_exceeded"`** — no new table needed
   - When `checkBudget()` returns false (budget exceeded), insert a row into `llm_usage` with `purpose: "budget_exceeded"`, `inputTokens: 0`, `outputTokens: 0`, `costCents: 0`, plus `topicId` and `problemId` from request context
   - Admin endpoint: `/admin/analytics/llm-budget-impact` — what happens to accuracy AFTER budget exhaustion? (Compare pre- vs post-exhaustion accuracy for the same user by joining `llm_usage` WHERE `purpose = 'budget_exceeded'` with subsequent `review_log` entries)

5. [x] [TST] Test correlation analytics:
   - Unit test: effectiveness endpoint returns correct delta calculations
   - Unit test: hint outcomes correctly links hint event to next attempt
   - Unit test: mastery impact correctly joins llm_usage with user_topic_state
   - Test with minimum sample size enforcement (returns empty for insufficient data)
   - `just test` passes

**Validation:** Admin can query "LLM-assisted accuracy vs baseline" per topic. Admin can see "hint-to-solve conversion rate by source." Admin can compare time-to-mastery with vs without LLM. Budget exhaustion events are logged and their learning impact is measurable.

---

## Phase 3: Cohort Comparison & Dashboard ✓
**Goal:** Organization-level feature tiering for quasi-experimental comparison. Admin dashboard view showing LLM ROI. Natural cohort analysis.

### Context for Execution

**Verified:** Organization tables exist in schema.ts — `organizations` (line 149), `members` (line 160), `invitations` (line 171). The `organizations.metadata` TEXT column stores JSON and can hold `llmTier`.

**Key files to modify:**
- `packages/api/src/db/schema.ts` — organization metadata (lines 149-158)
- `packages/api/src/routes/llm.ts` — feature gating by tier
- `packages/api/src/routes/admin.ts` — cohort comparison endpoint
- `packages/web/src/pages/admin.vue` — LLM effectiveness dashboard section

1. [x] [IMP] Add `llmTier` to organization metadata:
   - Extend org metadata JSON: `{ ..., llmTier: "free" | "basic" | "full" }`
   - `free`: static hints only (L1-2), no LLM features
   - `basic`: LLM hints (L3-4) + grading
   - `full`: + Socratic tutoring + self-explanation evaluation
   - Default: `"full"` for orgs with budget > 0, `"free"` for budget = 0
   - Update LLM route middleware to check tier before checking budget

2. [x] [IMP] Add `/admin/analytics/llm-cohort-comparison` endpoint:
   - Group organizations by `llmTier` (or by natural budget: $0 vs >$0)
   - Compare per-cohort: mastery rate, average accuracy, sessions-to-mastery, lapse rate, daily activity
   - Response: `{ cohort, userCount, avgMasteryRate, avgAccuracy, avgSessionsToMastery, avgLapseRate }`
   - Include statistical significance indicator (minimum N per cohort)

3. [x] [IMP] Add LLM effectiveness section to admin dashboard:
   - Summary cards: "LLM-assisted accuracy: X% vs baseline: Y% (Δ+Z%)"
   - Top 10 topics where LLM helps most / least
   - Hint outcome comparison (static vs LLM conversion rates)
   - Cohort comparison table (by llmTier)
   - Monthly LLM cost vs learning outcome chart
   - Cost-effectiveness: "Each $1 of LLM spend improves mastery by X topics"

4. [x] [TST] Test cohort comparison and dashboard:
   - Unit test: cohort grouping by llmTier works correctly
   - Unit test: feature gating respects tier (free user can't access tutoring)
   - Verify admin dashboard renders with mock data
   - Verify admin dashboard handles "no data yet" gracefully
   - `just test` passes, `just typecheck` passes

**Validation:** Organizations have an llmTier that gates feature access. Admin can compare learning outcomes across cohorts. Dashboard shows clear ROI metrics for premium features. System handles pre-launch "no data" state gracefully.
