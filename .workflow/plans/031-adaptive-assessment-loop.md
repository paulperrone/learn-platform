# Plan 031: Adaptive Assessment Loop

> **Created:** 2026-03-15T15:46:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Wire assessments into the learning scheduler as a system-triggered calibration loop, inspired by MathAcademy's model. Phase 1 is a mandatory deep diagnostic of the mastery system — every threshold, every ratio, every assumption — before anything is changed. Phases 2–4 implement the loop itself: ratio-based triggers, a session gate that holds back new material when an assessment is due, and a pacing factor that feeds assessment results directly back into the session mix.

**Motivation:** Assessment is currently user-initiated and disconnected from the learning queue. A student who aces a checkpoint sees no change in what the system serves them next. The MA model inverts this: assessments are system-scheduled checkpoints that gate new material and use the result to recalibrate the new/review mix. Getting this right requires understanding the mastery system deeply first — the target convergence of 7 mastered topics in 30 sessions (Plan 030 Phase 5 baseline) may reflect a calibration problem, not a feature.

**Key design principles:**
- Assessment trigger is ratio-based (`topics_introduced_since_assessment / frontier_size`), not grade-band-based — scales gracefully from K-2 through Algebra 2
- Phase 1 findings are binding — Phase 2 steps are not finalized until the diagnostic is written
- The gate blocks new material but never blocks reviews — learners always have something to do
- Pacing factor is a multiplier on the session mix, not a hard override — bounded to prevent divergence

**Depends on:** Plan 030 complete ✓ (assessment service, standards service, `assessment_sessions` table all exist).

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Mastery System Deep Diagnostic

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

1. [ ] [RSH] Map the complete mastery pipeline end-to-end:
   - Trace every function that reads or writes `mastered`, `stability`, `consecutiveCorrectReviews`, `consecutiveIncorrectReviews`, `IMPLICIT_MASTERY_THRESHOLD`
   - Document the call graph: `session.ts respond()` → `srs.ts reviewTopic()` → mastery check → `user_topic_state` update → `justMastered` event → `getNewlyUnlockedTopics()`
   - Identify any edge cases or gaps: does Path B (3 consecutive in any state) interact correctly with FSRS state transitions? Can a topic master without ever reaching Review state?
   - Document what "losing mastery" means in practice — how often does this happen in simulations?

2. [ ] [RSH] Audit the mastery criterion thresholds:
   - Research: what does FSRS literature say about minimum stability for durable retention? The 4-day threshold was our own choice — is it defensible?
   - How many FSRS repetitions does a typical topic need before reaching stability ≥ 4d? (Check FSRS parameters: D=5.09, S=1.28 initial stability for "Good" rating — how many Good answers to reach 4d stability?)
   - Compare: if threshold were 2d vs 4d vs 7d, how does mastery count change at 30 sessions? Run targeted simulation sweep.
   - Analyze the `consecutiveCorrect >= 2` requirement: is this additive friction on top of the stability requirement, or does one tend to be the binding constraint?

3. [ ] [RSH] Analyze simulation mastery convergence per profile:
   - For each profile (average-older, misconception-fractions, strong-older), extract:
     - Sessions to first mastery
     - Sessions to 5th mastery
     - Sessions to 10th mastery
     - Total mastered at sessions 10, 20, 30
   - Identify the profile that plateaus earliest and why — is it review debt, topic unlocking, or the mastery criterion itself?
   - Run a 60-session simulation (not just 30) to see if mastery accelerates late or stays flat

4. [ ] [RSH] Review debt analysis — are topics getting stuck?:
   - For each topic introduced in simulation, track: introduced at session N, first reached Review state at session M, mastered at session P (or never)
   - Compute: % of introduced topics that never reach mastery in 30 sessions; % that reach Review state but fail to accumulate enough stability; % still in Learning state at session 30
   - Identify "stuck" patterns: topics where stability bounces (correct then incorrect repeatedly, never reaching 4d) — what % of topics exhibit this?
   - Does the misconception profile show pathological patterns (getting stuck more than failing)?

5. [ ] [RSH] Session mix trace — is the hardcoded mix right?:
   - For average-older profile, plot per-session: # new topics, # reviews, # warmup, actual new/review ratio
   - Is the 70% review cap binding? (i.e., do we have more due reviews than the cap allows?) If so, at what session count does this start?
   - Is `minNewTopics = 2` always achievable? (Frontier could be empty.) What happens when it is?
   - Does the warmup (3 mastered topics) meaningfully help retention or just add noise to session structure?
   - Chart: as a learner progresses from session 1 → 30, does the mix feel right? Early learner should be mostly new; established learner should be mostly review.

6. [ ] [RSH] Implicit mastery audit:
   - After a grade-3 diagnostic placement, how many topics get implicitly mastered (prob ≥ 0.75)? List the distribution.
   - How does the implicit set compare to the materialized set — are there topics with prob 0.74 (just below threshold) that are effectively being treated as unmastered?
   - Is `IMPLICIT_MASTERY_THRESHOLD = 0.75` the right cutoff? What happens to frontier computation if it were 0.70 vs 0.80?
   - Are there topics that get implicit mastery from the diagnostic but then fail when the system actually tries to review them? (Evidence for threshold being too generous?)

7. [ ] [DOC] Write findings document `docs/mastery-system-analysis.md`:
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

1. [ ] [RSH] Review Phase 1 recommendations and decide which to implement:
   - For each recommendation, decide: implement as-is / implement with modification / defer
   - Document rationale for each decision in DECISIONS.md before writing code
   - Define measurable success criterion for each change (e.g., "mastery count at 30 sessions increases from 7 to X")

2. [ ] [IMP] Apply mastery threshold changes (per Phase 1 Rec N):
   - *(Steps defined after Phase 1 — e.g., update `RECENTLY_MASTERED_THRESHOLD` in srs.ts, update `consecutiveCorrect` requirement, update `IMPLICIT_MASTERY_THRESHOLD`)*

3. [ ] [IMP] Apply session mix changes (per Phase 1 Rec N):
   - *(Steps defined after Phase 1 — e.g., adjust 70% review cap, minNewTopics, warmup size)*

4. [ ] [TST] Re-run simulation suite with new parameters:
   - `just regression` — may need baseline update
   - Compare mastery convergence before/after: sessions-to-10th-mastery should improve
   - Verify no regressions in other metrics (retention, interleaving, cognitive demand)

5. [ ] [VAL] Update `targets.json` with new baselines and document the change:
   - Update `mastery_convergence` target based on new convergence data
   - Update `lastUpdatedReason` with specific threshold changes made
   - Run `just regression --update-baseline` to capture new regression baseline

**Validation:** Before/after simulation comparison shows improvement on the specific metric identified as problematic in Phase 1. All other targets still pass. `docs/mastery-system-analysis.md` Section 7 recommendations are addressed (each either implemented or explicitly deferred with reasoning in DECISIONS.md).

---

## Phase 3: Assessment Calibration Loop

**Goal:** Wire assessments into the session scheduler as a system-triggered calibration gate. Assessment results feed back into the session mix via a pacing factor.

### Context for Execution

The assessment service (`packages/api/src/services/assessment.ts`) and routes (`/api/assessment/*`) already exist from Plan 030. `assessment_sessions` and `assessment_session_items` tables exist. What's missing is the scheduler integration: nothing triggers assessments automatically, nothing gates new material, nothing reads assessment results to adjust the mix.

`getSessionMix()` in `srs.ts` builds the blended stack already — it calls `computeFrontier()` for new topics and `getDueTopics()` for reviews. The gate is: when `pendingAssessmentId` is set for a user, skip the new-topic slice and inject an `assessment-gate` item first.

The trigger is ratio-based: `topics_introduced_since_assessment / frontier_size`. "Introduced" means the topic had a lesson phase for the first time in this cycle — not mastered, not reviewed, just newly seen. This makes the trigger scale naturally: a narrow frontier (10 topics in early K-2) fires a checkpoint after 2-3 topics introduced; a wide frontier (100 topics in a full strand) still fires at the same relative coverage. Calibrate the threshold based on simulation (suggested starting point: 25%).

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
   - D1 migration + schema.ts + drizzle types
   - Add index on `pending_assessment_id` for gate check lookup

2. [ ] [IMP] Assessment trigger — fire in `endSession()` when new topic introduced:
   - In `session.ts`, when a topic's lesson phase completes for the first time (topic has no prior `user_topic_state` row or `reps === 0`), increment `topics_introduced_since_assessment` in `user_learning_state`
   - Trigger condition: `topics_introduced / frontier_size >= ASSESSMENT_TRIGGER_RATIO` (constant, start at 0.25)
   - Also trigger if: `last_assessment_at` is null (never assessed) AND `topics_introduced >= MIN_TOPICS_BEFORE_FIRST_ASSESSMENT` (constant, suggest 5)
   - When triggered: call `assessmentSvc.startAssessment(userId, { scope: { type: "comprehensive" }, questionCount: 10 })`, write `pendingAssessmentId` + reset `topics_introduced_since_assessment = 0`
   - Never trigger if `pendingAssessmentId` is already set (don't stack pending assessments)

3. [ ] [IMP] Session gate — block new topics when assessment pending:
   - In `srs.ts` `getSessionMix()`: at the start, load `user_learning_state` for the user
   - If `pendingAssessmentId` is set: skip the frontier/new-topic section entirely, set `newTopics = []`
   - Inject `{ type: "assessment-gate", assessmentSessionId: pendingAssessmentId }` as first item in the returned stack
   - Reviews still proceed normally — learner always has something to do
   - Add `assessmentPending: boolean` and `assessmentSessionId?: string` to `getSessionMix()` return type so callers can surface the gate to the UI

4. [ ] [IMP] Pacing factor feedback — `finishAssessment()` adjusts the mix:
   - After scoring in `assessment.ts` `finishAssessment()`, load `user_learning_state`
   - Apply pacing adjustment:
     - Score ≥ 0.80: `pacing = min(pacing * 1.15, 2.0)` — performing well, ready for more new material
     - Score 0.60–0.80: no change — on track
     - Score < 0.60: `pacing = max(pacing * 0.80, 0.5)` — struggling, consolidate before advancing
   - Clear `pendingAssessmentId = null`, write updated `pacing_factor`, write `last_assessment_at`
   - In `getSessionMix()`, scale new-topic allocation: `effectiveNewMin = Math.round(minNewTopics * pacingFactor)`, `effectiveReviewCap = reviewCap - 0.1 * (pacingFactor - 1.0)` (bounded 0.5–0.8)

5. [ ] [TST] Simulation validation:
   - Run 50-session simulation for all three profiles with the gate active
   - Verify: gate fires at expected cadence (check ratio arithmetic against simulation log)
   - Verify: pacing factor converges (strong-older profile ramps up to ~1.5–2.0; average-older stays near 1.0; misconception-fractions may drop to ~0.7)
   - Verify: pacing factor doesn't diverge (monotonically increasing or decreasing without bound)
   - Verify: learner is never completely stuck (reviews always available when gate is active)
   - Add simulation mode `--mode calibration` that runs assessment-gated sessions and logs pacing factor per epoch

6. [ ] [TST] API tests for the gate and feedback loop:
   - Test: `startSession()` returns `assessment-gate` item when pending assessment exists
   - Test: `startSession()` returns normal mix when no pending assessment
   - Test: trigger fires after correct ratio of introduced topics
   - Test: `finishAssessment()` clears gate, applies pacing adjustment correctly for each score band
   - Test: pacing factor stays within [0.5, 2.0] bounds after many assessment cycles

**Validation:** Simulation shows gate firing at predictable intervals with ratio-based trigger. Pacing factor for strong-older profile increases over 50 sessions (≥1.2 by session 30). Pacing factor for misconception-fractions profile decreases when assessments score low. No learner gets permanently gated (reviews always available). All API tests pass.

---

## Phase 4: UX Surface + Documentation

**Goal:** Make the calibration loop visible and intentional in the user experience. The gate should feel like a milestone earned, not a wall encountered.

### Steps

1. [ ] [IMP] Session status endpoint — surface gate state before starting:
   - `GET /api/learn/session-status` returns `{ assessmentPending: boolean, assessmentSessionId?: string, reviewsDue: number, newTopicsAvailable: number, pacingFactor: number }`
   - Frontend calls this on `/learn` page load to decide what to show

2. [ ] [IMP] Assessment-ready prompt in `learn.vue`:
   - When `assessmentPending === true`: show a milestone card ("You've covered enough new material for a checkpoint — take a 10-question assessment to unlock what's next")
   - Primary CTA: "Start Checkpoint" → navigates to `/assess/:assessmentSessionId`
   - Secondary: "Review first" → starts a review-only session (still gates new topics)
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
   - Update CLAUDE.md: note that session mix is now pacing-factor-aware
   - Update DECISIONS.md: trigger ratio design, pacing factor bounds, gate framing decisions
   - Update LEARNINGS.md with any gotchas from Phase 3 implementation

**Validation:** Full user flow testable: complete 5 learning sessions → assessment prompt appears → take assessment → result shows pacing feedback → continue learning with updated mix. Documentation reflects the new architecture.

---

## Deferred

- **Pacing factor visibility as "readiness" meter**: showing the pacing factor as a user-facing progress indicator (e.g., "Learning velocity: 1.3x"). Deferred — validate the backend model first.
- **Multiple pending assessments / strand-targeted checkpoints**: triggering strand-specific assessments when a strand reaches completion threshold. Deferred — comprehensive checkpoints first.
- **Adaptive trigger threshold per learner**: adjusting `ASSESSMENT_TRIGGER_RATIO` based on historical performance. Deferred — fixed ratio first.
