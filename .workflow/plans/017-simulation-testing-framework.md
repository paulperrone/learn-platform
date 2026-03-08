# Plan 017: Simulation Testing Framework

> **Created:** 2026-03-08T21:36:23Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build a framework that runs synthetic learners through the real learning engine (diagnostic → sessions → reviews → mastery) with deterministic answer strategies, structured event logging, and analysis tooling. Validates that adaptive systems (85% targeting, presentation drift, FSRS scheduling, FIRe compression, remediation routing, mastery convergence) behave correctly across diverse learner profiles over simulated weeks of use.

## Progress

**Completed:** Phase 1 ✓
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: Simulation Harness & Learner Profiles ✓
**Goal:** Core infrastructure — define learner archetypes, build the simulation loop that calls real services against a real D1, and structured event logging.

1. [x] [RSH] Design learner profile schema: ability curve (per-grade-level accuracy probability), age/birthYear, answer speed distribution, hint-seeking behavior (probability of requesting hints per phase), confidence calibration tendency (overconfident/underconfident/calibrated), misconception map (specific topicIds or grade ranges where ability drops sharply)
2. [x] [IMP] Define 8-10 learner archetypes as JSON profile files in `simulations/profiles/`:
   - `strong-young.json` — age 6, high ability across K-2 (85-95% accuracy), drops at grade 3+
   - `average-young.json` — age 7, moderate ability K-1 (70-80%), drops grade 2+
   - `struggling-young.json` — age 6, low ability (50-60% even at grade 0)
   - `strong-older.json` — age 14, high ability across K-5 (90%+)
   - `average-older.json` — age 12, moderate ability K-3 (75%), drops grade 4+
   - `struggling-older.json` — age 13, low ability K-1 (60%), drops grade 2+
   - `overconfident.json` — age 10, average ability but confidence always 4-5 regardless of correctness
   - `underconfident.json` — age 10, average ability but confidence always 1-2
   - `misconception-fractions.json` — age 10, strong on whole-number ops (90%) but collapses on fraction topics (30-40%)
   - `fast-learner.json` — age 8, starts average but ability increases by +0.5% per session (simulating learning)
3. [x] [IMP] Build answer strategy engine: deterministic function `resolveAnswer(profile, topic, difficulty, cognitiveDemand, phase, sessionNumber) → { correct: boolean, responseMs: number, confidence: number, hintsToRequest: number }`. Uses profile's ability curve + topic grade + difficulty + misconception map to compute weighted probability, then uses seeded PRNG for reproducibility.
4. [x] [IMP] Build structured event logger: writes JSONL to `simulations/runs/<profile>-<timestamp>/events.jsonl`. Each event includes: `{ tick, sessionNumber, phase, topicId, problemId, difficulty, cognitiveDemand, presentation, contentDepth, correct, confidence, hintsUsed, rating, stabilityBefore, stabilityAfter, difficultyBefore, difficultyAfter, masteredBefore, masteredAfter, frontierBefore, frontierAfter, rollingAccuracy, presentationWeights, remediationTarget, fireCreditApplied, fadingLevel, interleaveStrand }`.
5. [x] [IMP] Build simulation runner: `SimulationRunner` class that given a profile + subject + session count: (a) initializes a fresh in-memory SQLite DB with content imported, (b) creates user from profile, (c) runs diagnostic, (d) runs N learning sessions calling real `createSessionService`, `createSRSService`, `createContentService`, `createGradingService` against the DB, (e) advances simulated time between sessions. Uses better-sqlite3 with drizzle-orm adapter (same schema as D1).
6. [x] [IMP] Add CLI entry points to justfile: `just simulate <profile> [sessions] [seed]` runs single profile; `just simulate-all [sessions] [seed]` runs all profiles. Outputs to `simulations/runs/`.
7. [x] [TST] Smoke test: run `just simulate average-older 5` end-to-end, verify JSONL log is produced with correct event structure (27 fields, 418 events covering diagnostic + 5 learning sessions), no service errors.

**Validation:** `just simulate average-older --sessions 5` completes without error and produces a valid JSONL log file with events covering diagnostic + 5 learning sessions.

---

## Phase 2: Diagnostic Simulation & Validation
**Goal:** Validate that the adaptive binary-search diagnostic correctly places each learner archetype and that presentation mismatch detection works.

1. [ ] [IMP] Run diagnostic simulation for all 10 profiles, capturing per-question logs: `{ questionNumber, topicId, gradeLevel, correct, estimateBefore, estimateAfter, searchLow, searchHigh, phase }`.
2. [ ] [IMP] Build diagnostic analysis: for each profile, compute placement accuracy = |expected frontier grade - actual frontier grade|. Expected frontier grade is derived from profile's ability curve (grade where accuracy drops below 60%).
3. [ ] [TST] Assertion suite: all profiles placed within ±1 grade of expected ability boundary. Flag any profile that takes >30 questions (search inefficiency) or <8 questions (premature stop).
4. [ ] [VAL] Validate presentation seeding: check that `strong-young` (age 6, advanced ability) gets presentation distribution shifted toward intermediate (not stuck at primary). Check that `struggling-older` (age 13, low ability) gets distribution shifted down from standard.
5. [ ] [DOC] Write diagnostic simulation report: table of profile × placement accuracy × questions asked × presentation seed. Save to `simulations/reports/diagnostic.md`.

**Validation:** All 10 profiles placed within ±1 grade. No profile takes >30 questions. Presentation seeding correctly detects mismatches for at least 2 profiles.

---

## Phase 3: Multi-Session Learning Trajectories
**Goal:** Simulate weeks of learning (20-50 sessions per profile) and track full state evolution — mastery progression, review scheduling, FIRe credit flow, phase transitions, remediation chains.

1. [ ] [IMP] Time-advance mechanism: between sessions, advance simulated clock by configurable interval (default: 1 day). SRS scheduling uses this simulated time for due-date calculations. Support variable intervals (e.g., skip weekends, simulate inconsistent practice).
2. [ ] [IMP] Run 30-session trajectories for all 10 profiles against math-foundations. Log per-session summary: `{ sessionNumber, day, topicsAttempted, topicsMastered, reviewsCompleted, newTopicsIntroduced, remediationsTriggered, averageAccuracy, presentationCenter, fireReviewsSkipped, fadingLevels, cognitiveDemandDistribution }`.
3. [ ] [IMP] Snapshot user state after each session: dump `user_topic_state` rows and `user_subject_presentation` to structured log. This enables post-hoc analysis of how every topic's FSRS parameters evolve.
4. [ ] [VAL] Validate mastery curves: for non-struggling profiles, mastery % should monotonically increase (allowing plateaus but not regression). For struggling profiles, mastery should still increase but more slowly. For `fast-learner`, mastery acceleration should be visible.
5. [ ] [VAL] Validate remediation chains: for `misconception-fractions` profile, verify that when fraction topics are attempted, remediation correctly routes to prerequisite whole-number topics, and that after remediation success the student returns to the fraction topic.
6. [ ] [VAL] Validate worked example fading: for topics visited multiple times, verify fading level increases (full → partial → independent) across sessions. Log fading progression per topic.

**Validation:** 30-session runs complete for all profiles. Mastery curves are monotonically non-decreasing for 8/10 profiles. Remediation triggers for misconception profile on fraction topics. Fading progression visible for topics with 3+ visits.

---

## Phase 4: Adaptive System Validation
**Goal:** Analyze simulation logs to validate that each adaptive system converges correctly. This is the core value — turning simulation data into confidence about system behavior.

1. [ ] [IMP] **85% difficulty targeting analysis:** For each profile, extract rolling accuracy (window=10) across all problems in all sessions. Compute: convergence point (first problem where rolling stays within [0.80, 0.90] for 20+ problems), oscillation frequency (sign changes in accuracy delta), overshoot magnitude (max deviation from 0.85 after convergence). Flag profiles where targeting fails to converge within 50 problems.
2. [ ] [IMP] **Presentation drift analysis:** For each profile, extract presentation distribution weights after each session. Compute: drift direction (toward expected level?), drift speed (sessions until center level matches expected), stability (does it settle or keep drifting?). Compare `strong-young` (should drift primary→intermediate) vs `struggling-older` (should drift standard→intermediate).
3. [ ] [IMP] **Mastery convergence analysis:** For each profile, compute: sessions to first mastery, sessions to 25%/50%/75% mastery, final mastery % at session 30. Validate mastery criterion (3 consecutive correct + stability ≥ 14 days + Review state): are there topics that should be mastered but aren't (criterion too strict)? Topics mastered that shouldn't be (too loose)?
4. [ ] [IMP] **FIRe effectiveness analysis:** For each profile, run the same trajectory twice: once with real encompassing edges, once with encompassing edges cleared. Compare: total explicit reviews, review sessions needed, time-to-mastery. Compute compression ratio = (reviews without FIRe - reviews with FIRe) / reviews without FIRe. Target: >30% compression.
5. [ ] [IMP] **Remediation routing analysis:** For misconception profiles, extract all remediation events. Compute: correct prerequisite identified (did it route to the actual weak topic?), remediation depth (how many hops before returning), remediation success rate (did the student pass the original topic after remediation?), false remediation triggers (remediation on topics where student isn't actually weak).
6. [ ] [IMP] **Interleaving quality analysis:** Extract topic sequences within sessions. Compute: same-strand adjacency rate (should be near 0%), review/new ratio (target 60/40), cognitive demand diversity (entropy of demand distribution per session — higher is better).

**Validation:** 85% targeting converges within 30 problems for ≥7/10 profiles. Presentation drift moves in expected direction for all profiles. FIRe compression >30%. Remediation routes to correct prerequisite ≥80% of the time. Same-strand adjacency <10%.

---

## Phase 5: Analysis Tooling & Regression Baselines
**Goal:** Build tooling to visualize simulation results, establish regression baselines, and extract content quality signals.

1. [ ] [IMP] Build analysis script (`tools/simulate-analyze.ts` or Python): reads JSONL logs from a run directory, produces summary report with key metrics per profile: placement accuracy, sessions to 50% mastery, difficulty convergence speed, presentation drift trajectory, FIRe compression ratio, remediation success rate, interleaving quality score.
2. [ ] [IMP] Chart generation: produce HTML file with embedded charts (Chart.js or similar lightweight library) for each profile: mastery curve over sessions, rolling accuracy over problems (with 0.85 target line), presentation weight evolution, review burden over sessions (explicit reviews per session), cognitive demand distribution heatmap.
3. [ ] [IMP] Regression baseline: after initial run, snapshot key metrics to `simulations/baseline.json`. Structure: `{ profile: { placementAccuracy, sessionsTo50Mastery, difficultyConvergencePoint, fireCompressionRatio, remediationSuccessRate, ... } }`. Future runs compare against baseline via `just simulate-compare`.
4. [ ] [IMP] Content quality signals: analyze per-topic accuracy across all profiles. Flag topics where even strong profiles score <70% (likely content issue, not learner issue). Flag topics where all profiles score >95% (too easy, no learning signal). Output as `simulations/reports/content-quality.md` with specific topic IDs and recommendations.
5. [ ] [IMP] Content analysis validation tests: extract simulation findings into assertion-based test coverage that validates the content pipeline's downstream behavior. Specifically:
   - **Content matrix completeness:** For each topic, log every time the content service fails to find a problem at the requested difficulty/presentation/depth/demand combination (fallback events). Assert fallback rate stays below a threshold per topic (e.g., <20% of requests). Topics exceeding the threshold are content gaps that need filling.
   - **Difficulty calibration:** Across all problems served per topic, compute actual accuracy vs expected accuracy for the requested difficulty level. Flag topics where `easy` problems have <70% accuracy (mislabeled) or `hard` problems have >80% accuracy (mislabeled). Turn these into regression assertions in `simulations/baseline.json`.
   - **Per-topic accuracy anomalies as assertions:** Topics where strong-older (90%+ ability) scores <70% are likely broken content, not learner weakness. Topics where struggling-young (50-60% ability) scores >90% are likely trivially easy. Snapshot these per-profile × per-topic accuracy ranges as regression bounds — if a code change causes a topic's accuracy to shift outside its baseline range, the comparison flags it.
   - **Demand distribution validation:** Compare the cognitive demands actually served per session against the `DEMAND_PROFILES` target distribution. Assert the served distribution converges within ±15% of target by session 5. Divergence means the content service can't fulfill the demand mix (content gap) or the selection algorithm is broken.
6. [ ] [IMP] CLI integration: `just simulate-analyze [run-dir]` generates report + charts. `just simulate-compare <baseline> <current>` shows metric deltas and flags regressions (>10% degradation on any metric). `just simulate-report` runs all profiles, analyzes, and produces combined report.

**Validation:** `just simulate-all --sessions 30 && just simulate-analyze` produces a readable HTML report with charts for all profiles. `just simulate-compare` correctly detects an intentionally introduced regression (e.g., temporarily change mastery threshold and verify it flags the change). Content analysis assertions produce actionable flags for at least 3 topics with content gaps or calibration issues.

---

## Phase 6: Simulation-Informed Readiness Gate
**Goal:** Analyze simulation findings, fix any system issues discovered, update Plan 018 priorities, and gate content generation on system correctness. If simulation reveals significant system problems, create Plan 017.5 (System Remediation & Retest) to fix and re-validate before proceeding to content.

1. [ ] [RSH] Compile simulation findings into a **System Readiness Report** (`simulations/reports/system-readiness.md`). For each adaptive system, assign pass/fail/warn:
   - 85% difficulty targeting: PASS if converges within 30 problems for ≥7/10 profiles
   - Presentation drift: PASS if moves in expected direction for all profiles
   - Mastery convergence: PASS if non-struggling profiles reach ≥50% mastery by session 30
   - FIRe compression: PASS if >30% reduction in explicit reviews
   - Remediation routing: PASS if routes to correct prerequisite ≥80% of the time
   - Interleaving: PASS if same-strand adjacency <10%
   - Diagnostic placement: PASS if all profiles within ±1 grade
2. [ ] [IMP] Fix any system bugs or parameter tuning issues revealed by simulation. Examples: adjust difficulty thresholds if 85% targeting oscillates, tune mastery criterion if too strict/loose, adjust presentation drift rates if too aggressive/slow, fix remediation routing if it targets wrong prerequisites. Each fix is a targeted code change + re-run of affected simulation profiles to confirm improvement.
3. [ ] [VAL] Re-run `just simulate-all` after fixes. Compare against Phase 5 baseline using `just simulate-compare`. All previously-failing metrics should now pass. No regressions on previously-passing metrics.
4. [ ] [IMP] Update Plan 018 phase priorities based on content quality signals from simulation:
   - Which topics need more problems most urgently? (feeds 018 Phase 3 ordering)
   - Which content gaps have highest impact? (feeds 018 Phase 0 gap detection thresholds)
   - Are procedural generators sufficient or do certain topic types need hand-authored procedural problems too? (feeds 018 Phase 2 scope)
   - Document priority adjustments in Plan 018 and DECISIONS.md.
5. [ ] [VAL] **Readiness gate decision:** If all adaptive systems pass, Plan 018 is unblocked — proceed to content generation. If any system has FAIL status after fixes in step 2-3, create **Plan 017.5: System Remediation & Retest** — a focused plan to address the specific failing systems with deeper architectural changes (not just parameter tuning), followed by a full re-simulation cycle. Plan 018 remains blocked until 017.5 completes and all systems pass. Document the decision and rationale in DECISIONS.md.

**Validation:** System Readiness Report produced with all systems at PASS or WARN (no FAIL). Plan 018 priorities updated based on simulation data. If 017.5 is needed, it is created with specific scope and Plan 018 dependency is documented. Content generation does not begin on a poorly-operating system.
