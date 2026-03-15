# Plan 031: Adaptive Assessment Loop

> **Created:** 2026-03-15T15:46:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Wire assessments into the learning scheduler as a system-triggered calibration loop, inspired by MathAcademy's model. Phase 1 is a mandatory deep diagnostic of the mastery system — every threshold, every ratio, every assumption — before anything is changed. Phase 2 applies threshold calibration changes from Phase 1 findings. Phase 3 replaces the batched session model with a pull-based atomic architecture (`getNextItem()`) — the foundation everything else builds on. Phases 4–5 implement the assessment gate and surface it in the UI.

**Motivation:** Assessment is currently user-initiated and disconnected from the learning queue. A student who aces a checkpoint sees no change in what the system serves them next. The MA model inverts this: assessments are system-scheduled checkpoints that gate new material and use the result to recalibrate the new/review mix. Getting this right requires understanding the mastery system deeply first — the target convergence of 7 mastered topics in 30 sessions (Plan 030 Phase 5 baseline) may reflect a calibration problem, not a feature.

**Key design principles:**
- Assessment trigger is ratio-based (`topics_introduced_since_assessment / frontier_size`), not grade-band-based — scales gracefully from K-2 through Algebra 2
- Phase 1 findings are binding — Phase 2 steps are not finalized until the diagnostic is written
- The gate blocks new material but never blocks reviews — learners always have something to do
- Pacing factor is a multiplier on the session mix, not a hard override — bounded to prevent divergence

**Depends on:** Plan 030 complete ✓ (assessment service, standards service, `assessment_sessions` table all exist).

## Progress

**Completed:** Phase 1 (Mastery System Deep Diagnostic)
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: Mastery System Deep Diagnostic ✓

**Goal:** Produce a written findings document with specific, numbered recommendations before any threshold or parameter is changed. Every assumption in the mastery pipeline gets examined with simulation data.

### Context for Execution

The mastery pipeline today:
1. Topic introduced via lesson phase → `user_topic_state` row created (state=Learning, reps=0)
2. Problems answered → FSRS schedules next review via `ts-fsrs`
3. On each answer in Review state: `consecutiveCorrectReviews` incremented/reset
4. Mastery criterion (Path A): `state === Review AND stability >= 4d AND consecutiveCorrect >= 2`
5. Mastery criterion (Path B): `consecutiveCorrect >= 3` in any state
6. Mastery with hysteresis: once mastered, only lose mastery on 2+ consecutive incorrect
7. Implicit mastery: diagnostic estimates ≥ `IMPLICIT_MASTERY_THRESHOLD` (0.75) treated as mastered for frontier computation

Session mix today (hardcoded in `getSessionMix()`):
- Warmup: up to 3 mastered topics (1 if review queue large)
- Main: max 70% review cap, guaranteed min 2 new topics
- Stretch: context-layered disciplines only

Mastery tiers: practicing (<4d), recently-mastered (4–30d), solidly-mastered (30–90d), permanently-mastered (>90d)

### Steps

1. [x] [RSH] Map the complete mastery pipeline end-to-end:
   - Trace every function that reads or writes `mastered`, `stability`, `consecutiveCorrectReviews`, `consecutiveIncorrectReviews`, `IMPLICIT_MASTERY_THRESHOLD`
   - Document the call graph: `session.ts respond()` → `srs.ts reviewTopic()` → mastery check → `user_topic_state` update → `justMastered` event → `getNewlyUnlockedTopics()`
   - Identify any edge cases or gaps: does Path B (3 consecutive in any state) interact correctly with FSRS state transitions? Can a topic master without ever reaching Review state?
   - Document what "losing mastery" means in practice — how often does this happen in simulations?

2. [x] [RSH] Audit the mastery criterion thresholds:
   - Research: what does FSRS literature say about minimum stability for durable retention? The 4-day threshold was our own choice — is it defensible?
   - How many FSRS repetitions does a typical topic need before reaching stability ≥ 4d? (Check FSRS parameters: D=5.09, S=1.28 initial stability for "Good" rating — how many Good answers to reach 4d stability?)
   - Compare: if threshold were 2d vs 4d vs 7d, how does mastery count change at 30 sessions? Run targeted simulation sweep.
   - Analyze the `consecutiveCorrect >= 2` requirement: is this additive friction on top of the stability requirement, or does one tend to be the binding constraint?

3. [x] [RSH] Analyze simulation mastery convergence per profile:
   - For each profile (average-older, misconception-fractions, strong-older), extract:
     - Sessions to first mastery
     - Sessions to 5th mastery
     - Sessions to 10th mastery
     - Total mastered at sessions 10, 20, 30
   - Identify the profile that plateaus earliest and why — is it review debt, topic unlocking, or the mastery criterion itself?
   - Run a 60-session simulation (not just 30) to see if mastery accelerates late or stays flat

4. [x] [RSH] Review debt analysis — are topics getting stuck?:
   - For each topic introduced in simulation, track: introduced at session N, first reached Review state at session M, mastered at session P (or never)
   - Compute: % of introduced topics that never reach mastery in 30 sessions; % that reach Review state but fail to accumulate enough stability; % still in Learning state at session 30
   - Identify "stuck" patterns: topics where stability bounces (correct then incorrect repeatedly, never reaching 4d) — what % of topics exhibit this?
   - Does the misconception profile show pathological patterns (getting stuck more than failing)?

5. [x] [RSH] Session mix trace — is the hardcoded mix right?:
   - For average-older profile, plot per-session: # new topics, # reviews, # warmup, actual new/review ratio
   - Is the 70% review cap binding? (i.e., do we have more due reviews than the cap allows?) If so, at what session count does this start?
   - Is `minNewTopics = 2` always achievable? (Frontier could be empty.) What happens when it is?
   - Does the warmup (3 mastered topics) meaningfully help retention or just add noise to session structure?
   - Output: log per-session breakdown (new count, review count, warmup count, ratio) as a structured table in the findings doc — no chart tooling needed for this offline analysis.

6. [x] [RSH] Implicit mastery audit:
   - After a grade-3 diagnostic placement, how many topics get implicitly mastered (prob ≥ 0.75)? List the distribution.
   - How does the implicit set compare to the materialized set — are there topics with prob 0.74 (just below threshold) that are effectively being treated as unmastered?
   - Is `IMPLICIT_MASTERY_THRESHOLD = 0.75` the right cutoff? What happens to frontier computation if it were 0.70 vs 0.80?
   - Are there topics that get implicit mastery from the diagnostic but then fail when the system actually tries to review them? (Evidence for threshold being too generous?)

7. [x] [DOC] Write findings document `docs/mastery-system-analysis.md`:
   - Section 1: Pipeline map (from step 1)
   - Section 2: Threshold analysis — is 4d+2-correct right? (from step 2)
   - Section 3: Convergence data — mastery rates per profile (from step 3)
   - Section 4: Stuck topic analysis (from step 4)
   - Section 5: Session mix analysis (from step 5)
   - Section 6: Implicit mastery analysis (from step 6)
   - Section 7: **Numbered recommendations** — specific changes with rationale, e.g.:
     - "Rec 1: Change stability threshold from 4d to Xd because..."
     - "Rec 2: Remove warmup tier or resize to N because..."
     - "Rec 3: Change implicit mastery threshold from 0.75 to X because..."
   - These recommendations define Phase 2 steps

**Validation:** `docs/mastery-system-analysis.md` exists with all 7 sections. Recommendations are specific (concrete values, not "consider changing"). Simulation data supports each recommendation.

---

## Phase 2: Threshold & Session Mix Calibration

**Goal:** Apply the specific recommendations from Phase 1. This phase's steps are intentionally not fully pre-written — they depend on the Phase 1 findings document. The structure below is a template; actual steps will be inserted after Phase 1 is complete.

### Steps

1. [ ] [RSH] Review Phase 1 recommendations — decisions already made in `docs/mastery-system-analysis.md` Section 7:
   - **Rec 1 (implement)**: Add session-level remediation budget cap (max 15 remediations/session)
   - **Rec 2 (implement)**: Add stuck-topic escape hatch for topics with reps > 20, stability < 0.5, consecutiveCorrect = 0
   - **Rec 3 (implement)**: Fix mastery convergence metric to use total mastery (materialized + implicit) in evaluate.ts and targets.json
   - **Rec 4 (defer)**: Stability threshold at 4d is correct — no change
   - **Rec 5 (defer)**: Implicit mastery threshold at 0.75 is correct — no change
   - **Rec 6 (defer to Phase 3)**: Warmup pool retrievability selection belongs in `getNextItem()` design
   - Document these decisions in DECISIONS.md

2. [ ] [IMP] Implement Rec 1 — session remediation budget cap:
   - Add `sessionRemediationCount?: number` to `SessionState` type (`session.ts`)
   - In `advancePhase()`, add `&& (state.sessionRemediationCount ?? 0) < 15` to `shouldRemediate`
   - Increment `state.sessionRemediationCount` when entering remediation phase
   - Update `db-setup.ts` if any DB schema changes needed (none expected — pure session state)

3. [ ] [IMP] Implement Rec 2 — stuck-topic escape hatch:
   - In `getDueTopics()`, after the `rows.filter((r) => r.reps > 0)` filter, add a second filter: skip topics with `reps > 20 AND stability < 0.5 AND consecutiveCorrectReviews === 0`
   - Add a cooldown reset: for filtered topics, update `due = now + 90d` in the DB (one-time cleanup per topic; check `dueResetCount` or simply check `stability < 0.5 AND reps > 20`)
   - This is an `async` operation; can be done lazily on read or proactively in a scheduled cleanup

4. [ ] [IMP] Implement Rec 3 — fix mastery convergence metric:
   - In `audit/learner-simulations/src/evaluate.ts`, update the `mastery_convergence_count` computation to use `masteryCount` (total incl. implicit) instead of `materializedMasteryCount`
   - Update `targets.json`: raise target for `mastery_convergence` to reflect new metric, update `lastUpdatedReason`

5. [ ] [TST] Re-run simulation suite and validate fixes:
   - `just regression` — verify no regressions in other metrics
   - Check that sessions with 0 remediation-loop events (no session > 15 remediations)
   - Check that stuck topics (reps > 20, stability < 0.5) no longer appear in session 30 snapshots
   - Under new metric: mastery_convergence_count should improve

6. [ ] [VAL] Update `targets.json` and document:
   - Update `mastery_convergence` target based on new metric (total mastery; expect higher profile count)
   - Update `lastUpdatedReason` with specific changes made
   - Run `just regression` to capture new baseline

**Note on scope:** Phase 2 applies only threshold changes (stability criterion, consecutive correct, implicit mastery threshold). Session mix structure changes from Phase 1 findings (warmup, review cadence) are deferred to Phase 3 — they'll be incorporated into `getNextItem()` design rather than patched into the old `getSessionMix()`.

**Validation:** Before/after simulation comparison shows improvement on the specific metric identified as problematic in Phase 1. All other targets still pass. `docs/mastery-system-analysis.md` Section 7 recommendations are addressed (each either implemented or explicitly deferred with reasoning in DECISIONS.md).

---

## Phase 3: Atomic Pull-Based Session Architecture

**Goal:** Replace the batched `getSessionMix()` model with a pull-based `getNextItem()` model — the canonical scheduling entry point going forward. Every interaction is a single atomic unit: one topic, one phase (lesson, review, worked example, or assessment). After each unit completes, the frontend asks "what's next?" and the system resolves the next one. This is the architectural foundation for Phase 4's assessment gate and the correct mental model for the learning journey.

### Context for Execution

The current architecture is push-based: `startSession()` calls `getSessionMix()` to pre-build a blended queue of N items across multiple topics, which the frontend walks through until empty. The new model inverts this: complete one interaction → call "next item" → render it → complete → repeat.

An atomic unit is a `NextItem` — a discriminated union with a fixed priority ordering:

```
Priority 1: { type: "assessment", assessmentSessionId }  ← when checkpoint is pending (Phase 4)
Priority 2: { type: "review", topicId }                  ← SRS-scheduled retrieval
Priority 3: { type: "lesson", topicId }                  ← first encounter with a topic
Priority 4: { type: "complete" }                         ← nothing due, nothing new
```

The existing session lifecycle (`startSession`, `respond`, `endSession`) is retained as a lightweight wrapper — a session now represents a single in-progress atomic unit. `startSession()` calls `getNextItem()` to determine that unit. This minimizes route handler and test infrastructure changes while achieving the pull-based model.

Phase 1 Step 5 findings (warmup analysis, review cadence) should inform the priority logic and thresholds inside `getNextItem()` — session mix structure changes belong here, not patched into the old blended model.

### Steps

1. [ ] [RSH] Audit all callers of `getSessionMix()`, `startSession()`, `respond()`, `endSession()` in `session.ts`, route handlers, simulation runner, and `learn.vue`:
   - What does each caller expect the session/mix to contain?
   - What cached state needs to change? (`sessionMix` at `session.ts:39` caches the full blended queue — this is removed)
   - What frontend assumptions about receiving multiple items at session start need to change?

2. [ ] [IMP] Define `NextItem` type in `packages/shared/src/`:
   ```ts
   type NextItem =
     | { type: "lesson"; topicId: string }
     | { type: "review"; topicId: string }
     | { type: "worked-example"; topicId: string }
     | { type: "assessment"; assessmentSessionId: string }
     | { type: "complete" }
   ```

3. [ ] [IMP] Implement `getNextItem(userId)` in `srs.ts`:
   - Priority order: (1) pending assessment — placeholder hook only here, always skipped until Phase 4; (2) due reviews, oldest due first; (3) new lesson — next unlocked topic from `computeFrontier()`; (4) `{ type: "complete" }`
   - Apply any session mix structure changes recommended in Phase 1 Step 5 findings (e.g., remove warmup tier, adjust review threshold) as part of this priority logic
   - Returns a single `NextItem`
   - `getSessionMix()` is deprecated — leave in place until callers are migrated in steps 4–6

4. [ ] [IMP] Update `session.ts` — session represents one atomic unit:
   - `startSession()` calls `getNextItem()` to determine the unit; session state stores `{ topicId, phase: NextItem["type"] }` — not a blended queue
   - Remove `sessionMix` cache from session state
   - On `respond()` completing the unit, call `endSession()` automatically — client does not need to explicitly close a completed session
   - Retain explicit `endSession()` for timeout/abandonment cases

5. [ ] [IMP] Update `learn.vue` — pull-based loop:
   - On page load and after each interaction completes: call `POST /api/learn/start` → receive single `NextItem` → render appropriate component
   - Remove any logic that iterates a pre-fetched queue
   - Handle `{ type: "complete" }` with an "All caught up" state

6. [ ] [TST] Update simulation runner (`runner.ts`):
   - Replace `getSessionMix()` call with repeated `getNextItem()` calls (via `startSession()`) until `complete` or interaction-count limit reached
   - Retain session/interaction count tracking
   - `just regression` must pass

7. [ ] [DOC] Update architecture documentation:
   - `CLAUDE.md`: Replace "Learning loop phases (simplified, Plan 029)" section with atomic pull-based model description — the unit of learning is `(topic, phase)`, not a blended session
   - `docs/assessment-system.md`: Add atomic session model section
   - Any references to "session mix", "blended sessions", or `getSessionMix()` in docs

**Validation:** `learn.vue` renders one atomic unit at a time with no pre-fetched queue. `getNextItem()` is the single scheduling entry point. Simulation runner uses the pull loop. `just regression` passes. Docs reflect the new architecture with no references to the old batched model.

---

## Phase 4: Assessment Calibration Loop

**Goal:** Wire assessments into `getNextItem()` as a system-triggered calibration gate. When an assessment is pending, `getNextItem()` returns `{ type: "assessment", ... }` as the top-priority item, blocking new lessons until the checkpoint is complete. Assessment results feed back into the scheduler via a pacing factor.

### Context for Execution

The assessment service (`packages/api/src/services/assessment.ts`) and routes (`/api/assessment/*`) already exist from Plan 030. `assessment_sessions` and `assessment_session_items` tables exist.

With the atomic pull model from Phase 3, the gate is simple: `getNextItem()` checks `user_learning_state.pending_assessment_id` at priority position 1 — if set, return `{ type: "assessment", assessmentSessionId }`. No blended session to modify, no queue to inject into.

The trigger fires in `respond()` when a lesson-type session completes for a new topic (first introduction). Increment `topics_introduced_since_assessment`. When `topics_introduced / frontier_size >= ASSESSMENT_TRIGGER_RATIO`, start an assessment and write `pending_assessment_id`.

The pacing factor modulates how eagerly `getNextItem()` returns new lessons vs routing to reviews. At `pacing = 1.0` (baseline), normal threshold. At `pacing < 1.0`, more reviews must clear before a new lesson is served. At `pacing > 1.0`, new lessons are served more aggressively.

### Steps

1. [ ] [IMP] D1 schema — `user_learning_state` table:
   ```sql
   CREATE TABLE user_learning_state (
     user_id TEXT PRIMARY KEY REFERENCES users(id),
     pending_assessment_id TEXT REFERENCES assessment_sessions(id),
     topics_introduced_since_assessment INTEGER NOT NULL DEFAULT 0,
     pacing_factor REAL NOT NULL DEFAULT 1.0,
     last_assessment_at TEXT,
     updated_at TEXT NOT NULL
   );
   ```
   - D1 migration + schema.ts + Drizzle types

2. [ ] [IMP] Assessment trigger — fire in `respond()` on lesson completion for a new topic:
   - "New topic" = lesson-phase session where topic had no prior `user_topic_state` row (or `reps === 0`)
   - On completion: increment `topics_introduced_since_assessment` in `user_learning_state`
   - Trigger condition: `topics_introduced / frontier_size >= ASSESSMENT_TRIGGER_RATIO` (constant, start at 0.25)
   - Also trigger if `last_assessment_at` is null AND `topics_introduced >= MIN_TOPICS_BEFORE_FIRST_ASSESSMENT` (suggest 5)
   - When triggered: `assessmentSvc.startAssessment(userId, { scope: { type: "comprehensive" }, questionCount: 10 })`, write `pending_assessment_id`, reset counter to 0
   - Never trigger if `pending_assessment_id` already set

3. [ ] [IMP] Gate in `getNextItem()`:
   - At priority position 1 (before reviews): load `user_learning_state`; if `pending_assessment_id` set → return `{ type: "assessment", assessmentSessionId: pending_assessment_id }`
   - Reviews remain accessible via direct review API — learner always has something to do

4. [ ] [IMP] Pacing factor feedback — `finishAssessment()` applies and records:
   - Score ≥ 0.80: `pacing = min(pacing * 1.15, 2.0)` — ready for more new material
   - Score 0.60–0.80: no change — on track
   - Score < 0.60: `pacing = max(pacing * 0.80, 0.5)` — consolidate before advancing
   - Clear `pending_assessment_id = null`, write `pacing_factor`, write `last_assessment_at`
   - In `getNextItem()`, apply pacing: use `pacing_factor` to scale the reviews-pending threshold at which a new lesson is returned (pacing = 1.0 → normal threshold; pacing = 0.5 → stricter, more reviews cleared first; pacing = 2.0 → more permissive)

5. [ ] [TST] Simulation validation (50-session runs, all three profiles):
   - Gate fires at expected cadence (ratio arithmetic confirmed against per-session logs)
   - Pacing factor converges: strong-older ramps (≥1.2 by session 30); misconception-fractions drops when assessment scores low
   - Pacing factor stays bounded — no monotonic divergence
   - Learner never permanently stuck (reviews always available when gate is active)
   - Run with existing `--mode learning` — gate fires naturally from the implemented logic, no special mode needed

6. [ ] [TST] API tests:
   - `getNextItem()` returns assessment item when `pending_assessment_id` is set
   - `getNextItem()` returns review/lesson normally when no assessment pending
   - Trigger fires after correct ratio of lesson completions for new topics
   - `finishAssessment()` clears gate and applies pacing correctly for each score band
   - Pacing factor stays within [0.5, 2.0] bounds after many cycles

**Validation:** Gate fires at predictable intervals. Pacing factor for strong-older increases over 50 sessions (≥1.2 by session 30). Pacing for misconception-fractions decreases when assessments score < 0.60. No learner gets permanently gated. All API tests pass.

---

## Phase 5: UX Surface + Documentation

**Goal:** Make the calibration loop visible and intentional in the user experience. The checkpoint should feel like a milestone earned, not a wall encountered.

### Steps

1. [ ] [IMP] Session status endpoint — surface scheduler state before starting:
   - `GET /api/learn/session-status` returns `{ assessmentPending: boolean, assessmentSessionId?: string, reviewsDue: number, newTopicsAvailable: number, pacingFactor: number }`
   - Frontend calls this on `/learn` page load to decide what to show

2. [ ] [IMP] Assessment-ready prompt in `learn.vue`:
   - When `assessmentPending === true`: show a milestone card ("You've covered enough new material for a checkpoint — take a 10-question assessment to unlock what's next")
   - Primary CTA: "Start Checkpoint" → navigates to `/assess/:assessmentSessionId`
   - Secondary: "Review first" → starts a review-only interaction (still gates new lessons)
   - Framing is milestone/reward, not blocker/penalty

3. [ ] [IMP] Post-assessment result feedback in `assess.vue`:
   - After `finishAssessment()`, result page shows pacing impact:
     - Score ≥ 80%: "Strong performance — your learning pace is increasing"
     - Score 60–80%: "Solid — continuing at current pace"
     - Score < 60%: "Let's consolidate before moving forward — your review mix will be adjusted"
   - Show which strands need attention (from strand breakdown in AssessmentResult)
   - CTA: "Continue Learning" → back to `/learn`

4. [ ] [DOC] Documentation pass:
   - Update `docs/assessment-system.md`: add calibration loop section (trigger, gate, pacing factor)
   - Update `DECISIONS.md`: trigger ratio design, pacing factor bounds, gate framing decisions
   - Update `LEARNINGS.md` with any gotchas from Phase 4 implementation

**Validation:** Full user flow testable: complete enough lesson interactions → assessment prompt appears → take assessment → result shows pacing feedback → continue learning with updated mix. Documentation reflects the new architecture.

---

## Deferred

- **Pacing factor visibility as "readiness" meter**: showing the pacing factor as a user-facing progress indicator (e.g., "Learning velocity: 1.3x"). Deferred — validate the backend model first.
- **Multiple pending assessments / strand-targeted checkpoints**: triggering strand-specific assessments when a strand reaches completion threshold. Deferred — comprehensive checkpoints first.
- **Adaptive trigger threshold per learner**: adjusting `ASSESSMENT_TRIGGER_RATIO` based on historical performance. Deferred — fixed ratio first.
- **Visual pacing chart**: Chart.js + vue-chartjs for progress/pacing visualization in the UI. Deferred — text feedback validates the model first; add visualization when the model is proven.
