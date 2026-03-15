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

**Completed:** Phase 1, Phase 2, Phase 3, Phase 3.5, Phase 4 (Assessment Calibration Loop)
**In Progress:** —
**Next:** Phase 5

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

## Phase 2: Threshold & Session Mix Calibration ✓

**Goal:** Apply the specific recommendations from Phase 1. This phase's steps are intentionally not fully pre-written — they depend on the Phase 1 findings document. The structure below is a template; actual steps will be inserted after Phase 1 is complete.

### Steps

1. [x] [RSH] Review Phase 1 recommendations — decisions already made in `docs/mastery-system-analysis.md` Section 7:
   - **Rec 1 (implement)**: Add session-level remediation budget cap (max 15 remediations/session)
   - **Rec 2 (implement)**: Add stuck-topic escape hatch for topics with reps > 20, stability < 0.5, consecutiveCorrect = 0
   - **Rec 3 (implement)**: Fix mastery convergence metric to use total mastery (materialized + implicit) in evaluate.ts and targets.json
   - **Rec 4 (defer)**: Stability threshold at 4d is correct — no change
   - **Rec 5 (defer)**: Implicit mastery threshold at 0.75 is correct — no change
   - **Rec 6 (defer to Phase 3)**: Warmup pool retrievability selection belongs in `getNextItem()` design
   - Document these decisions in DECISIONS.md

2. [x] [IMP] Implement Rec 1 — session remediation budget cap:
   - Add `sessionRemediationCount?: number` to `SessionState` type (`session.ts`)
   - In `advancePhase()`, add `&& (state.sessionRemediationCount ?? 0) < 15` to `shouldRemediate`
   - Increment `state.sessionRemediationCount` when entering remediation phase
   - Update `db-setup.ts` if any DB schema changes needed (none expected — pure session state)

3. [x] [IMP] Implement Rec 2 — stuck-topic escape hatch:
   - In `getDueTopics()`, after the `rows.filter((r) => r.reps > 0)` filter, add a second filter: skip topics with `reps > 20 AND stability < 0.5 AND consecutiveCorrectReviews === 0`
   - **Reset strategy: lazy write inside `getDueTopics()`** — when filtering a stuck topic, immediately update `due = now + 90d` in the DB. Filter-only (no write) doesn't work: stability ≈ 0 means FSRS sets `due ≈ now` every time, so the topic re-enters the filter every session and silently disappears with no recovery path. The write is intentional and idempotent (running it twice is harmless).
   - Add a clear code comment in `getDueTopics()` noting this intentional side effect
   - Optionally add a `stuckResetAt TEXT` column to `userTopicState` to make the event queryable and prevent redundant resets — but this is a nice-to-have, not required for correctness

4. [x] [IMP] Implement Rec 3 — fix mastery convergence metric:
   - In `audit/learner-simulations/src/evaluate.ts`, update the `mastery_convergence_count` computation to use `masteryCount` (total incl. implicit) instead of `materializedMasteryCount`
   - Update `targets.json`: raise target for `mastery_convergence` to reflect new metric, update `lastUpdatedReason`

5. [x] [TST] Re-run simulation suite and validate fixes:
   - `just regression` — verify no regressions in other metrics
   - Check that sessions with 0 remediation-loop events (no session > 15 remediations)
   - Check that stuck topics (reps > 20, stability < 0.5) no longer appear in session 30 snapshots
   - Under new metric: mastery_convergence_count should improve

6. [x] [VAL] Update `targets.json` and document:
   - Update `mastery_convergence` target based on new metric (total mastery; expect higher profile count)
   - Update `lastUpdatedReason` with specific changes made
   - Run `just regression` to capture new baseline

**Note on scope:** Phase 2 applies only threshold changes (stability criterion, consecutive correct, implicit mastery threshold). Session mix structure changes from Phase 1 findings (warmup, review cadence) are deferred to Phase 3 — they'll be incorporated into `getNextItem()` design rather than patched into the old `getSessionMix()`.

**Validation:** Before/after simulation comparison shows improvement on the specific metric identified as problematic in Phase 1. All other targets still pass. `docs/mastery-system-analysis.md` Section 7 recommendations are addressed (each either implemented or explicitly deferred with reasoning in DECISIONS.md).

---

## Phase 3: Atomic Pull-Based Session Architecture + Prerequisite FIRe ✓

**Goal:** Replace the batched `getSessionMix()` model with a pull-based `getNextItem()` model — the canonical scheduling entry point going forward. Simultaneously introduce prerequisite-direction FIRe credit (`applyPrereqCredit`) so that practicing a topic implicitly maintains its prerequisite foundations, eliminating the need for a warmup tier. Every interaction is a single atomic unit: one topic, one phase (lesson, review, worked example, or assessment). After each unit completes, the frontend asks "what's next?" and the system resolves the next one.

### Context: Pull-Based Architecture

The current architecture is push-based: `startSession()` calls `getSessionMix()` to pre-build a blended queue of N items across multiple topics, which the frontend walks through until empty. The new model inverts this: complete one interaction → call "next item" → render it → complete → repeat.

An atomic unit is a `NextItem` — a discriminated union with a fixed priority ordering:

```
Priority 1: { type: "assessment", assessmentSessionId }  ← when checkpoint is pending (Phase 4)
Priority 2: { type: "review", topicId }                  ← SRS-scheduled retrieval (R dropped below threshold)
Priority 3: { type: "lesson", topicId }                  ← first encounter with a topic
Priority 4: { type: "complete" }                         ← nothing due, nothing new
```

The existing session lifecycle (`startSession`, `respond`, `endSession`) is retained as a lightweight wrapper — a session now represents a single in-progress atomic unit. `startSession()` calls `getNextItem()` to determine that unit. This minimizes route handler and test infrastructure changes while achieving the pull-based model.

**The warmup tier is not ported forward.** The current `getSessionMix()` warmup randomly samples mastered topics to prevent retention decay. In the pull-based model, this function is replaced entirely by FIRe credit (described below) — mastered prerequisites stay alive implicitly through normal practice on dependent topics. Explicit reviews for mastered topics only appear in the review queue when their retrievability actually drops below threshold, meaning they genuinely need a review. This is demand-driven rather than random-sampled.

### Context: Prerequisite-Direction FIRe Credit

The existing FIRe implementation (`applyFIReCredit`, disabled) flows *downward* through encompassing edges: practicing a parent topic credits its encompassed children. This phase introduces a second, complementary mechanism flowing *backward* through prerequisite edges: when you correctly answer topic B, the system applies fractional stability credit to B's prerequisites.

**The epistemological model:** Correctly solving `long division` requires deploying knowledge of `multiplication`, `subtraction`, and `place value`. A correct answer on `long division` is meaningful evidence that those prerequisites are still known. Each such event extends the FSRS-projected stability of those prerequisites by a fraction of what a direct review would have given, pushing out their due dates.

**Why this replaces warmup:** Foundational topics (grade K-2 content) are prerequisites for a large fraction of the graph. A Grade 4 learner practices grade 3-4 content in every session. Each correct answer on grade 3-4 content propagates backward through the prerequisite chain, continuously refreshing grade K-2 stability. These foundational topics accumulate implicit credit far faster than they decay, keeping them permanently above the review threshold without ever appearing in the explicit review queue. The warmup tier was doing this job manually (and noisily, via random sampling); FIRe credit does it structurally.

**Why multi-hop credit is largely self-correcting:** The concern with multi-hop credit (hop 3+: Grade 4 practitioner crediting Grade K-0 content) is that the credit might be unwarranted — succeeding at `long division` only weakly implies you remember how to `count to 10`. But this concern is mostly theoretical: by the time a learner is doing Grade 4 work, Grade K topics have been practiced directly hundreds of times and should have FSRS stability in the 90+ day range (permanently mastered tier). At 90d stability, retrievability after 30 days with no direct review is R ≈ 0.96 — the topic hasn't decayed at all and its due date is far in the future. These topics will not appear in `getDueTopics()` and will not receive credit because their stability is already so high that the marginal credit (geometrically decayed by 2-3 hops) produces negligible change.

The geometric hop-decay is still included as a correctness safeguard against edge cases (e.g., a topic that somehow escaped to low stability despite being a deep prerequisite — the Phase 2 stuck-topic escape hatch should prevent this, but defense-in-depth). The R-floor gate (`R < 0.5 → skip, needs real review`) is the more important safety valve: a prerequisite that has genuinely been forgotten should receive an explicit review, not implicit credit that masks the forgetting.

**The graduation invariant:** For the warmup removal to be safe, there must be a verifiable property: by the time a learner's frontier reaches grade G, all topics at grades < G−1 should be at `solidly-mastered` stability (≥ 30 days). If this invariant holds, FIRe credit from grade-G practice is sufficient to maintain grade G−2 and below without warmup. If it does not hold (a learner has a grade K-0 topic at low stability while working on grade 4 content), that topic needs an explicit review — and the `getDueTopics()` query will surface it naturally once its due date is reached. The simulation verification step below checks this invariant directly.

**Credit mechanism design:**

```
applyPrereqCredit(userId, topicId, rating, consecutiveCorrect):

  if rating < Rating.Good → return   // Hard/Again: not enough evidence
  if consecutiveCorrect < 2 → return // Lucky guess guard

  BFS through prerequisite edges, up to max_hops = 3:
    hop 1 (direct prereqs):    credit_fraction = 0.30
    hop 2 (prereq's prereqs):  credit_fraction = 0.15
    hop 3 (grandparent prereqs): credit_fraction = 0.075

  For each prerequisite at each hop:
    if !state.mastered → skip (still being learned, needs direct reviews)
    R = computeRetrievability(state)
    if R < 0.5 → skip (too stale, needs real review not implicit credit)

    boost = (scheduling[Rating.Good].card.stability − state.stability) × credit_fraction
    newStability = state.stability + boost
    newDue = now + newStability × MS_PER_DAY  // push due date forward

    UPDATE userTopicState SET stability=newStability, due=newDue

  Edge type weighting:
    "required" edge  → full credit_fraction at that hop
    "recommended"    → credit_fraction × 0.5
    "enriching"      → skip entirely (weak conceptual coupling)
```

Credit is logged in `reviewLog` with `phase: "fire-prereq"` for auditability. The credit does not increment `reps` or affect `consecutiveCorrectReviews` — it only extends stability and due date. Mastery state is unaffected (mastered topics remain mastered; unmastere topics don't gain mastery from implicit credit).

### Steps

1. [x] [RSH] Audit all callers of `getSessionMix()`, `startSession()`, `respond()`, `endSession()` in `session.ts`, route handlers, simulation runner, and `learn.vue`:
   - What does each caller expect the session/mix to contain?
   - What cached state needs to change? (`sessionMix` at `session.ts:39` caches the full blended queue — this is removed)
   - What frontend assumptions about receiving multiple items at session start need to change?
   - Document any warmup-related code paths that will be removed

2. [x] [IMP] Define `NextItem` type in `packages/shared/src/`:
   ```ts
   type NextItem =
     | { type: "lesson"; topicId: string }
     | { type: "review"; topicId: string }
     | { type: "worked-example"; topicId: string }
     | { type: "assessment"; assessmentSessionId: string }
     | { type: "complete" }
   ```

3. [x] [IMP] Implement `getNextItem(userId)` in `srs.ts` — no warmup tier:
   - Priority order: (1) pending assessment — placeholder hook only, always skipped until Phase 4; (2) due reviews via `getDueTopics()`, oldest due first; (3) new lesson — next unlocked topic from `computeFrontier()` sorted by depth; (4) `{ type: "complete" }`
   - **Do not port the warmup tier.** Warmup is replaced by FIRe prereq credit (step 4). The review queue (Priority 2) already captures any mastered topic whose retrievability has genuinely dropped — no separate random-warmup pass needed.
   - `getSessionMix()` is deprecated — leave in place until callers are migrated in steps 5–7
   - Returns a single `NextItem`

4. [x] [IMP] Implement `applyPrereqCredit(userId, topicId, rating, consecutiveCorrect)` in `srs.ts`:
   - Call from `scheduleReview()` after the FSRS update, when `isActuallyCorrect && consecutiveCorrect >= 2 && rating >= Rating.Good`
   - BFS through prerequisite edges up to `MAX_HOPS = 3`; credit fraction at hop h = `BASE_FRACTION × 0.5^(h−1)` where `BASE_FRACTION = 0.30`
   - Gates (skip the topic if ANY of these fail): `state.mastered === true`, `computeRetrievability(state) >= 0.5`
   - Edge type multiplier: `required → 1.0`, `recommended → 0.5`, `enriching → skip`
   - Credit mechanics: compute `fullBoost = scheduling[Rating.Good].card.stability − state.stability`; apply `boost = fullBoost × credit_fraction`; update `stability` and `due` only — do NOT update `reps`, `consecutiveCorrectReviews`, `mastered`, or `lastReview`
   - **Logging: add `implicit INTEGER DEFAULT 0` column to `review_log` via D1 migration** — `reviewLog.correct` and `reviewLog.rating` are NOT NULL and cannot be set to null for FIRe events. Do not make them nullable. Instead, log FIRe events as `correct = true, rating = Rating.Good, implicit = 1, responseMs = 0, phase = "fire-prereq"`. This keeps existing NOT NULL constraints intact, and `implicit = 1` unambiguously identifies system-generated credit events. The migration is additive (existing rows get `implicit = 0` default) with no backfill required.
   - Export `FIRE_PREREQ_ENABLED = true` constant alongside `FIRE_ENABLED` (encompassing FIRe remains disabled separately)

5. [x] [IMP] Update `session.ts` — session represents one atomic unit:
   - **One unit = one full topic sequence** for one topic: a lesson walks through all phase steps (pretest → instruction → guided → independent) across multiple `respond()` calls; a review is typically one `respond()` call. The existing `advancePhase()` machinery is preserved entirely — it still drives phase progression within the unit. What changes is that a session covers exactly one topic, not a blended queue of many topics.
   - `startSession()` calls `getNextItem()` to determine the unit; session state stores `{ topicId, phase: NextItem["type"] }` — not a blended queue
   - Remove `sessionMix` cache from session state
   - Remove warmup-related fields (`currentBlendRole`, warmup tracking) from `SessionState`
   - When `advancePhase()` would previously call `nextTopic()` to advance within the queue, it now returns `{ type: "complete" }` — the topic sequence is done, the session ends
   - On `respond()` returning `type: "complete"`, call `endSession()` automatically — client does not need to explicitly close a completed unit
   - Retain explicit `endSession()` for timeout/abandonment cases
   - `learn.vue` loop: frontend calls `startSession()` after each `complete` to pull the next unit — this is the pull loop

6. [x] [IMP] Update `learn.vue` — pull-based loop:
   - On page load and after each interaction completes: call `POST /api/learn/start` → receive single `NextItem` → render appropriate component
   - Remove any logic that iterates a pre-fetched queue
   - Handle `{ type: "complete" }` with an "All caught up" state

7. [x] [TST] Update simulation runner (`runner.ts`):
   - Replace `getSessionMix()` call with repeated `getNextItem()` calls (via `startSession()`) until `complete` or interaction-count limit reached
   - Track `firePrereqCreditEvents` in `SessionSummary` (count from reviewLog where `phase = "fire-prereq"`)
   - Retain session/interaction count tracking
   - `just regression` must pass

8. [x] [TST] Verify graduation invariant — foundational topics at long-term mastery before dependents:
   - Run a 60-session simulation for `average-older` and `strong-older` profiles
   - **"Frontier grade" definition: median `gradeLevel` of all topics with `reps > 0`** — topics the learner has actually been introduced to (not just theoretically unlocked). Median is robust to outlier high-grade topics in the frontier. This value is directly computable from `topicStates[]` in each snapshot.
   - For each session snapshot at sessions 20, 30, 40, 60: compute `frontierGrade = median(gradeLevel for topics where reps > 0)`; then assert that all topics with `gradeLevel ≤ frontierGrade − 2` have `stability ≥ 30d` (solidly-mastered threshold) OR `reps = 0`
   - The invariant: a learner whose introduced topics center around grade 4 should not have grade K-2 topics at `stability < 30d`
   - If invariant fails: investigate whether FIRe credit is propagating back far enough, or whether Phase 2's stuck-topic escape hatch is needed first for a specific topic
   - Document graduation rates in `docs/mastery-system-analysis.md` (append Section 8: Post-FIRe validation)

9. [x] [DOC] Update architecture documentation:
   - `CLAUDE.md`: Replace "Learning loop phases (simplified, Plan 029)" section with atomic pull-based model description — unit of learning is `(topic, phase)`, not a blended session; note FIRe prereq credit as the warmup replacement
   - `docs/assessment-system.md`: Add atomic session model section
   - `docs/fire.md`: Add section on prerequisite-direction FIRe — distinguish from encompassing-direction FIRe (still disabled); document the graduation invariant and the R-floor safety valve
   - Remove any references to "session mix", "blended sessions", "warmup tier", or `getSessionMix()` in docs

**Validation:** `learn.vue` renders one atomic unit at a time with no pre-fetched queue. `getNextItem()` is the single scheduling entry point with no warmup tier. `applyPrereqCredit` fires on every qualifying correct review; `reviewLog` records `fire-prereq` events. Graduation invariant passes for 60-session simulations: grade K-2 topics are at solidly-mastered stability (≥30d) by the time the learner's frontier reaches grade 4. `just regression` passes. Docs updated with no references to the old batched/warmup model.

---

## Phase 3.5: Quality Gate — Tests, Docs, and Graduation Verification ✓

**Goal:** Address gaps identified in the Opus-level audit of Phases 1-3. The two core Phase 3 functions (`getNextItem`, `applyPrereqCredit`) have no dedicated unit tests — they're only exercised indirectly through integration tests and simulation regression. Documentation deliverables from Phase 3 Step 9 were partially completed. The graduation invariant (Step 8) used a weaker verification methodology than specified.

### Steps

1. [x] [TST] Unit tests for `getNextItem()` priority ordering (`pull-based-scheduling.test.ts`):
   - Test: when assessment pending → returns assessment type (placeholder for Phase 4, but structure the test)
   - Test: when topics are due for review → returns review with most overdue topicId
   - Test: when no reviews due but frontier available → returns lesson with shallowest-depth topic
   - Test: when multiple frontier topics at same depth → secondary sort by gradeLevel
   - Test: when no reviews due and frontier empty → returns `{ type: "complete" }`
   - Test: when both reviews and frontier available → review takes priority over lesson
   - Seed via helpers: create user_topic_state rows with specific due dates, seed frontier topics with specific depths

2. [x] [TST] Unit tests for `applyPrereqCredit()` (`pull-based-scheduling.test.ts`):
   - Test: rating < Good → no credit applied (no review_log entries with implicit=1)
   - Test: consecutiveCorrect < 2 → no credit applied
   - Test: direct prerequisite receives credit (hop 1, fraction = 0.30)
   - Test: hop 2 prerequisite receives credit at 0.15 fraction
   - Test: hop 3 prerequisite receives credit at 0.075 fraction
   - Test: hop 4+ prerequisite receives NO credit (MAX_HOPS = 3)
   - Test: unmastered prerequisite skipped (mastered gate)
   - Test: prerequisite with R < 0.5 skipped (retrievability gate)
   - Test: "enriching" edge type skipped, "recommended" edge gets 0.5 multiplier
   - Test: credit only updates stability and due — reps, consecutiveCorrectReviews, mastered unchanged
   - Test: negative boost guard — prerequisite with stability > Good scheduling stability gets no credit
   - Test: review_log entry has implicit=1, phase="fire-prereq", responseMs=0
   - Test: BFS visited set prevents duplicate processing (diamond prerequisite graph)
   - All tests gated behind `describe.skipIf(!FIRE_PREREQ_ENABLED)` for consistency

3. [x] [DOC] Update `docs/assessment-system.md` — add atomic session model section:
   - Explain `getNextItem()` as the scheduling entry point
   - Priority ordering: assessment > review > lesson > complete
   - Session lifecycle: `startSession()` → one topic → `respond()` × N → `{ type: "complete" }` → `startSession()` again
   - Relationship to assessment gate (Phase 4 will wire into priority 1)

4. [x] [DOC] Clean stale references in docs:
   - `docs/mastery-system-analysis.md`: Update Section 5 header and references to note that `getSessionMix()` is deprecated; warmup replaced by FIRe prereq credit. Keep the analysis data intact (it's Phase 1 findings), but add a note at the top of Section 5 that the session mix model was replaced in Phase 3.
   - `docs/simulation-targets.md`: Update "session mix allocation" reference
   - `docs/simulation-maturity.md`: Update "session mix warmup" reference
   - Do NOT rewrite the Phase 1 analysis sections — they are historical findings. Add "(Superseded by Plan 031 Phase 3: pull-based atomic sessions)" notes where relevant.

5. [x] [TST] Proper graduation invariant verification:
   - Run 60-session simulations for average-older and strong-older (seed=42)
   - At session snapshots 20, 30, 40, 60: compute `frontierGrade = median(gradeLevel for topics where reps > 0)` from `topicStates[]`
   - Assert: all topics with `gradeLevel ≤ frontierGrade − 2` have `stability ≥ 30d` OR `reps = 0` (never introduced)
   - If topics are implicitly mastered (no user_topic_state), they trivially pass (no stability to decay)
   - Append Section 8 ("Post-FIRe Graduation Verification") to `docs/mastery-system-analysis.md` with the results
   - Include a table: session → frontierGrade → topics below threshold → pass/fail

6. [x] [FIX] Remove dead variable in runner.ts:
   - Line 496: `const interactions = 0;` — remove this unused variable

**Validation:** `just test` passes (all new unit tests green). `getNextItem` has ≥6 unit tests covering priority ordering. `applyPrereqCredit` has ≥12 unit tests covering gates, credit formula, edge weighting, and logging. `docs/assessment-system.md` has atomic session section. No stale getSessionMix/warmup references in docs (except clearly marked historical analysis). Graduation invariant documented with per-session data in mastery-system-analysis.md Section 8.

---

## Phase 4: Assessment Calibration Loop ✓

**Goal:** Wire assessments into `getNextItem()` as a system-triggered calibration gate. When an assessment is pending, `getNextItem()` returns `{ type: "assessment", ... }` as the top-priority item, blocking new lessons until the checkpoint is complete. Assessment results feed back into the scheduler via a pacing factor.

### Context for Execution

The assessment service (`packages/api/src/services/assessment.ts`) and routes (`/api/assessment/*`) already exist from Plan 030. `assessment_sessions` and `assessment_session_items` tables exist.

With the atomic pull model from Phase 3, the gate is simple: `getNextItem()` checks `user_learning_state.pending_assessment_id` at priority position 1 — if set, return `{ type: "assessment", assessmentSessionId }`. No blended session to modify, no queue to inject into.

The trigger fires in `respond()` when a lesson-type session completes for a new topic (first introduction). Increment `topics_introduced_since_assessment`. When `topics_introduced / frontier_size >= ASSESSMENT_TRIGGER_RATIO`, start an assessment and write `pending_assessment_id`.

The pacing factor modulates how eagerly `getNextItem()` returns new lessons vs routing to reviews. At `pacing = 1.0` (baseline), normal threshold. At `pacing < 1.0`, more reviews must clear before a new lesson is served. At `pacing > 1.0`, new lessons are served more aggressively.

### Steps

1. [x] [IMP] D1 schema — `user_learning_state` table:
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

2. [x] [IMP] Assessment trigger — fire in `respond()` on lesson completion for a new topic:
   - "New topic" = lesson-phase session where topic had no prior `user_topic_state` row (or `reps === 0`)
   - On completion: increment `topics_introduced_since_assessment` in `user_learning_state`
   - Trigger condition: `frontier_size > 0 AND topics_introduced / frontier_size >= ASSESSMENT_TRIGGER_RATIO` (constant, start at 0.25) — guard against division by zero when frontier is empty (early diagnostic phase)
   - Also trigger if `last_assessment_at` is null AND `topics_introduced >= MIN_TOPICS_BEFORE_FIRST_ASSESSMENT` (suggest 5)
   - When triggered: `assessmentSvc.startAssessment(userId, { scope: { type: "comprehensive" }, questionCount: 10 })`, write `pending_assessment_id`, reset counter to 0
   - Never trigger if `pending_assessment_id` already set

3. [x] [IMP] Gate in `getNextItem()`:
   - At priority position 1 (before reviews): load `user_learning_state`; if `pending_assessment_id` set → return `{ type: "assessment", assessmentSessionId: pending_assessment_id }`
   - Reviews remain accessible via direct review API — learner always has something to do

4. [x] [IMP] Pacing factor feedback — `finishAssessment()` applies and records:
   - Score ≥ 0.80: `pacing = min(pacing * 1.15, 2.0)` — ready for more new material
   - Score 0.60–0.80: no change — on track
   - Score < 0.60: `pacing = max(pacing * 0.80, 0.5)` — consolidate before advancing
   - Clear `pending_assessment_id = null`, write `pacing_factor`, write `last_assessment_at`
   - In `getNextItem()`, apply pacing: use `pacing_factor` to scale the reviews-pending threshold at which a new lesson is returned (pacing = 1.0 → normal threshold; pacing = 0.5 → stricter, more reviews cleared first; pacing = 2.0 → more permissive)

5. [x] [TST] Simulation validation (50-session runs, all three profiles):
   - Gate fires at expected cadence (ratio arithmetic confirmed against per-session logs)
   - Pacing factor converges: strong-older ramps (≥1.2 by session 30); misconception-fractions drops when assessment scores low
   - Pacing factor stays bounded — no monotonic divergence
   - Learner never permanently stuck (reviews always available when gate is active)
   - Run with existing `--mode learning` — gate fires naturally from the implemented logic, no special mode needed

6. [x] [TST] API tests:
   - `getNextItem()` returns assessment item when `pending_assessment_id` is set
   - `getNextItem()` returns review/lesson normally when no assessment pending
   - Trigger fires after correct ratio of lesson completions for new topics
   - `finishAssessment()` clears gate and applies pacing correctly for each score band
   - Pacing factor stays within [0.5, 2.0] bounds after many cycles

**Validation:** Gate fires at predictable intervals. Pacing factor for strong-older increases over 50 sessions (≥1.2 by session 30). Pacing for misconception-fractions decreases when assessments score < 0.60. No learner gets permanently gated. All API tests pass.

---

## Phase 5: UX Surface + Documentation ✓

**Goal:** Make the calibration loop visible and intentional in the user experience. The checkpoint should feel like a milestone earned, not a wall encountered.

### Steps

1. [x] [IMP] Session status endpoint — surface scheduler state before starting:
   - `GET /api/learn/session-status` returns `{ assessmentPending: boolean, assessmentSessionId?: string, reviewsDue: number, newTopicsAvailable: number, pacingFactor: number }`
   - Frontend calls this on `/learn` page load to decide what to show

2. [x] [IMP] Assessment-ready prompt in `learn.vue`:
   - When `assessmentPending === true`: show a milestone card ("You've covered enough new material for a checkpoint — take a 10-question assessment to unlock what's next")
   - Primary CTA: "Start Checkpoint" → navigates to `/assess/:assessmentSessionId`
   - Secondary: "Review first" → starts a review-only interaction (still gates new lessons)
   - Framing is milestone/reward, not blocker/penalty

3. [x] [IMP] Post-assessment result feedback in `assess.vue`:
   - After `finishAssessment()`, result page shows pacing impact:
     - Score ≥ 80%: "Strong performance — your learning pace is increasing"
     - Score 60–80%: "Solid — continuing at current pace"
     - Score < 60%: "Let's consolidate before moving forward — your review mix will be adjusted"
   - Show which strands need attention (from strand breakdown in AssessmentResult)
   - CTA: "Continue Learning" → back to `/learn`

4. [x] [DOC] Documentation pass:
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
