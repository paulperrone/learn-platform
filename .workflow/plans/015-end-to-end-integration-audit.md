# Plan: End-to-End Integration Audit (Plans 009-014)

> **Created:** 2026-03-08T01:03:54Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Systematic verification that all features from plans 009-014 are fully wired end-to-end — backend services connected to frontend, data flowing through the full pipeline, no dead code or unconnected endpoints. Organized by integration boundary rather than by original plan: session learning loop, content dimension system, tutoring/metacognition layer, and engagement features. Any gaps found are fixed in-place, not deferred.

**Why now:** Plans 013 and 014 add new capabilities (encompassing enrichment, cognitive demand tagging) that build on 009-012 features. Before layering more complexity, verify the foundation is solid. Content generated for a broken feature is wasted.

**Scope of audit (by source plan):**

| Plan | Features to verify |
|---|---|
| **009** | Content dimension filtering, fallback chain, depth tracking, cross-subject validation |
| **009.5** | Presentation distribution seeding, drift engine, progress API |
| **010** | Progressive hints, mastery criteria, FIRe multi-hop, depth blending, interleaving, fading, compression, adaptive difficulty, per-user FSRS |
| **011** | Self-explanation prompts + LLM evaluation, confidence calibration + FSRS integration, targeted remediation with key prerequisites, student profile injection |
| **012** | Daily goals, streak counter, contribution graph, completion estimates, milestones, post-lesson animation |
| **013** | (Not yet implemented — verify existing encompassing infrastructure is ready for enrichment) |
| **014** | (Not yet implemented — verify schema is ready for cognitive demand column) |

**Known risk areas (from plan analysis):**
- Session state JSON has grown significantly (hints, demands, drift, fading, accuracy, confidence, remediation chain) — verify D1 round-trip integrity
- Hint/fading coordination: both track exposure counts — verify no conflict
- FIRe multi-hop performance: 2-3 hop BFS on encompassing graph — verify no latency spikes
- Diagnostic re-run: verify presentation distribution overwrites cleanly
- Remediation + non-interference: both mutate session mix — verify no conflict

## Progress

**Completed:** Phase 1, Phase 2
**In Progress:** —
**Next:** Phase 3

---

## Phase 1: Session Learning Loop Audit ✓
**Goal:** Verify the full session flow works end-to-end with all Plan 010 intelligence features wired correctly.

1. [x] [RSH] Trace the `startSession` → `buildPhaseItem` → `respond` path in `packages/api/src/services/session.ts`. For each of the 6 session phases (pretest, instruction, guided, independent, review, remediation), verify:
   - **Pretest:** Selects medium-difficulty problem. Pass = skip instruction. Fail = proceed to instruction. No hints.
   - **Instruction:** Returns worked example. Fading level applied (full → partial → independent based on exposure count + FSRS stability). Self-explanation prompt inserted after example.
   - **Guided:** Selects easy problem with adaptive difficulty bias. First hint pre-revealed. Progressive hint reveal gates subsequent hints across attempts.
   - **Independent:** Selects medium problem with adaptive bias. Confidence rating collected. No pre-revealed hints.
   - **Review:** FIRe compression selects optimal review topics. Depth blending assembles warmup/main/stretch. Non-interference interleaving avoids related topics back-to-back. Blend role tagged on each item.
   - **Remediation:** Routes to key prerequisite topic (or lowest-stability prerequisite). Easy difficulty. No demand mixing.
   Document any phase where a feature is present in code but not reachable in the execution path.

2. [x] [RSH] Verify adaptive difficulty targeting. Trace the rolling accuracy tracker:
   - Where is accuracy computed? (last N problems in session state)
   - Where does it influence `selectProblem`'s difficulty parameter?
   - Does the bias actually shift? (>90% accuracy → harder, <80% → easier)
   - Check `adaptive-difficulty.test.ts` covers these paths. Run `just test` and confirm test passes.

3. [x] [RSH] Verify worked example fading end-to-end:
   - Where is example exposure count stored? (`user_topic_state` or session state?)
   - Does `buildPhaseItem` for instruction phase read this count?
   - Does the returned `fadingLevel` actually increase with exposure?
   - Does the frontend (`WorkedExample.vue`) render blanked steps based on `fadingLevel`?
   - Check `session-fading.test.ts`. Run and confirm.

4. [x] [RSH] Verify FIRe compression and non-interference in review phase:
   - Trace `srs.getSessionMix()` → `compressReviews()` → greedy set-cover
   - Verify multi-hop credit: `applyFIReCredit()` traverses 2-3 hops with diminishing weight
   - Verify non-interference: review ordering avoids same-strand topics back-to-back
   - Check `review-compression.test.ts` and `interleaving.test.ts`. Run and confirm.

5. [x] [TST] Write `packages/api/src/__tests__/integration/session-full-loop.test.ts` — an integration test that exercises a complete multi-topic learning session:
   - Start session for a user with some mastered topics (review due) and frontier topics
   - Step through: pretest (fail) → instruction (worked example with fading) → guided (hint revealed) → independent (graded, confidence captured) → review (FIRe-compressed, depth-blended) → respond incorrectly → remediation (routes to prerequisite)
   - Assert: each phase returns correct `type`, fading progresses, hints gate, confidence is captured, review topics are interleaved, remediation targets a prerequisite
   - This is the "golden path" test — if it passes, the core loop works

**Validation:** Every Plan 010 feature is confirmed reachable in the session execution path. Full-loop integration test passes. Any dead code or unconnected features are documented and fixed.

---

## Phase 2: Content Dimension & Presentation Audit ✓
**Goal:** Verify Plans 009 + 009.5 dimension selection and adaptive presentation are fully wired from user profile through content delivery to frontend display.

1. [x] [RSH] Trace content selection pipeline end-to-end:
   - `resolveContentQuery()` (session.ts:137-167): resolves `contentDepth` + `presentation` for auth users, defaults to standard/survey for anonymous. **Gap:** `locale`/`flavor` never set — always defaults to "en"/"classic". Schema columns exist but no resolution logic. Acceptable for MVP (single locale).
   - `resolvePresentation()` (content.ts:174-218): reads `user_subject_presentation` distribution → samples probabilistically. Falls back to birthYear-based default. Override support exists. ✅ Fully wired.
   - `resolveContentDepth()` (content.ts:220-260): mastery-gated → "survey", flexible → "survey", context-layered → spiral through `userTopicDepth`. ✅ Fully wired.
   - `getTopicProblems()`/`getTopicExamples()` (content.ts:325-349): 8-tier fallback chain via `contentPriority()` (exact match → adjacent presentation → classic flavor → en locale → survey depth → any). ✅ Fully wired and tested.
   - Tests: `content.test.ts` (443 lines) + `dimension-integration.test.ts` (404 lines). All pass.

2. [x] [RSH] Verify diagnostic → presentation distribution seeding:
   - `materializeMastery()` (diagnostic.ts:448-455) calls `estimatePresentationDistribution()` then `content.upsertSubjectDistribution()`. ✅ Fully wired.
   - Linguistic comprehension signal: prereq-mastered-but-failed heuristic (≥40% failure rate + ≥3 qualifying questions → shift distribution down one level). ✅ Implemented.
   - Creates/updates `user_subject_presentation` rows via upsert on unique `(userId, subjectId)`. ✅
   - Re-run overwrites cleanly (test confirms exactly 1 row after 2 diagnostics). ✅
   - Tests: `diagnostic-presentation.test.ts` (231 lines, 8 tests). All pass.

3. [x] [RSH] Verify presentation drift engine:
   - Fires in `respond()` (session.ts:527-535) via `content.applyNudge()` after grading. ✅
   - Asymmetric: 6 context-dependent rates in `DRIFT_RATES` (content.ts:61-69). Success above center = 0.04 (2x normal), failure above = 0.01 (tiny), success below = 0 (no change). ✅
   - `presentation_drift_log` written on center_shift, level_emerged, level_dropped (content.ts:485-498). Schema at schema.ts:313-325. ✅
   - Next content query reads updated distribution via `resolvePresentation()` → `sampleFromDistribution()`. ✅
   - Tests: `presentation-drift.test.ts` (230 lines, 13 pure + 3 integration). All pass.

4. [x] [RSH] Verify frontend integration:
   - `learn.vue` passes `presentationLevel` to `ProblemView` (line 241). ✅
   - `ProblemView.vue` adapts confidence slider: binary for primary/intermediate, 5-point for standard/advanced. ✅
   - `progress.vue` fetches distributions via `getPresentationDistributions()` and renders stacked bar chart with color-coded levels. ✅
   - `WorkedExample.vue` does NOT adapt to presentation level — acceptable (scaffolding is consistent across levels). ⚠️ Minor.
   - No frontend unit tests for presentation rendering. ⚠️ Minor (backend coverage is comprehensive).

**Validation:** Content dimension pipeline confirmed end-to-end. ✅ All 390 tests pass. Only gap is locale/flavor resolution (deferred — single locale MVP). Presentation drift, diagnostic seeding, fallback chain, and frontend visualization all fully wired.

---

## Phase 3: Tutoring & Metacognition Audit
**Goal:** Verify Plan 011 self-explanation, confidence calibration, and targeted remediation are fully connected from frontend through backend to learning outcomes.

1. [ ] [RSH] Verify self-explanation prompt integration:
   - In session.ts: after instruction phase (worked example), is a self-explanation prompt inserted?
   - Does the frontend (`WorkedExample.vue` or `learn.vue`) render a text input for the explanation?
   - When the user submits an explanation, does the frontend call the `evaluateExplanation` LLM endpoint?
   - Does the LLM response (`quality`, `feedback`, `misconceptionFlag`) influence session flow?
   - Does `buildStudentProfile()` get called before LLM calls? Is the profile injected into system prompts?
   - Check: is this fully wired, or is the backend ready but frontend not calling it?

2. [ ] [RSH] Verify confidence calibration pipeline:
   - In session.ts: during independent and review phases, is confidence rating captured?
   - Does the frontend (`ProblemView.vue` or `ConfidenceSlider.vue`) show the confidence UI at the right moments?
   - K-5 binary ("I think I got it right" / "I'm not sure") → what numeric values do these map to?
   - After grading: does the FSRS rating adjustment apply? (high confidence + correct → Easy, low confidence + correct → Good, high confidence + wrong → misconception flag)
   - Is calibration accuracy tracked and displayed on progress page?
   - Check `confidence-calibration.test.ts`. Run and confirm.

3. [ ] [RSH] Verify targeted remediation routing:
   - When a student fails in independent or review phase, does session.ts check for `keyPrerequisiteId` on the assessment content?
   - If `keyPrerequisiteId` exists, does remediation route to that specific topic?
   - If absent, does it fall back to lowest-stability direct prerequisite?
   - Does recursive tracing work? (fail remediation → trace deeper to next prerequisite)
   - Does misconception flag from confidence calibration feed into remediation priority?
   - Check `targeted-remediation.test.ts`. Run and confirm.

4. [ ] [RSH] Verify LLM endpoint wiring:
   - Are all three LLM endpoints (`/api/llm/hint`, `/api/llm/explanation`, `/api/llm/grading`) called from the frontend?
   - Is the "Ask Tutor" button in `ProblemView.vue` wired to `socraticTutor`?
   - Is LLM grading used anywhere, or is it still client-side matching only?
   - Is `StreamingText.vue` used for LLM responses?
   - Document which LLM features are frontend-connected vs backend-only.

5. [ ] [IMP] Fix any gaps found in steps 1-4. For each gap:
   - If frontend doesn't call a backend endpoint: wire it up
   - If data flows to backend but isn't used: connect it
   - If a feature is fully dead code: document why and decide whether to wire or remove
   - Run `just test` after fixes to ensure no regressions

**Validation:** Self-explanation prompts are captured and evaluated by LLM. Confidence ratings feed into FSRS scheduling. High-confidence-wrong triggers remediation. Targeted remediation routes to specific prerequisites. All LLM endpoints are called from frontend (or gaps are documented with rationale).

---

## Phase 4: Engagement & Habit Features Audit
**Goal:** Verify Plan 012 daily goals, streaks, contribution graph, and completion estimates work end-to-end with real data flow.

1. [ ] [RSH] Verify daily activity tracking:
   - When does `daily_activity` get updated? (On each problem completion? On session end? Both?)
   - Trace: session.ts `respond()` → activity service update → `daily_activity` row upsert
   - Does `goalMet` flag update when minutes/problems threshold is reached?
   - Does the frontend dashboard fetch and display goal progress in real-time (or on page load)?
   - Check `activity.test.ts`. Run and confirm.

2. [ ] [RSH] Verify streaks, contribution graph, and milestones:
   - Trace streak calculation: consecutive days with `goalMet = true`
   - Timezone handling: does it use the user's timezone or UTC? Is there a mismatch risk?
   - Contribution graph API: does it return 12 weeks of data in the correct shape?
   - Milestone triggers: do they fire at 7, 30, 66, 100 days?
   - Does the frontend render: streak counter on dashboard, contribution graph grid, milestone celebration?
   - Check `progress-engagement.test.ts`. Run and confirm.

3. [ ] [RSH] Verify completion estimates and post-lesson animation:
   - Trace completion estimate: remaining topics / current pace → weeks estimate
   - Edge cases: no pace data yet (new user), pace = 0, all topics mastered
   - Post-lesson mastery celebration: when topic is mastered, does `MasteryCelebration.vue` fire?
   - Does it show which topics are now unlocked?
   - Does the knowledge graph explorer reflect newly mastered state?
   - Run any related tests and confirm.

**Validation:** Daily goals track accurately. Streaks count correctly including timezone. Contribution graph renders with real data shape. Completion estimate is reasonable. Post-lesson celebration fires on mastery. All engagement features are visible in the frontend.

---

## Phase 5: Cross-Plan Integration Tests
**Goal:** Verify features from different plans interact correctly when combined in realistic scenarios.

1. [ ] [TST] Write `packages/api/src/__tests__/integration/confidence-fsrs-fire.test.ts`:
   - Student answers correctly with high confidence → FSRS schedules extended interval (Rating.Easy)
   - FIRe credit flows from that topic to encompassed children (multi-hop)
   - Verify the extended interval is reflected in the child topics' FIRe credit calculation
   - Student answers correctly with low confidence → FSRS schedules shorter interval (Rating.Good)
   - Verify FIRe credit still flows but with shorter base interval

2. [ ] [TST] Write `packages/api/src/__tests__/integration/presentation-drift-content.test.ts`:
   - Create user with intermediate-centered distribution
   - Serve problem at intermediate level, student succeeds → drift nudges toward standard
   - Next content query: verify presentation resolution now samples standard more frequently
   - Serve problem at standard level, student fails → drift nudges back toward intermediate
   - Next content query: verify distribution shifted back
   - Confirm drift log records centerLevel transitions

3. [ ] [TST] Write `packages/api/src/__tests__/integration/remediation-interleaving.test.ts`:
   - Build session with 3 review topics from different strands
   - Student fails on topic 2 → remediation inserts prerequisite review
   - Verify the inserted prerequisite doesn't violate non-interference (not same strand as adjacent reviews)
   - If prerequisite IS same strand as adjacent: verify graceful handling (warning, not crash)
   - After remediation success: verify session returns to original review sequence

4. [ ] [TST] Write `packages/api/src/__tests__/integration/session-state-coherence.test.ts`:
   - Start a session that exercises ALL features: hints, confidence, fading, demands (once 014 is done), drift, blend roles
   - After 10+ responses, verify session state JSON:
     - Round-trips through D1 correctly (write → read → identical)
     - All fields are present and correctly typed
     - Size is reasonable (< 10KB for a typical session)
   - Verify `loadState()` correctly restores all fields after a simulated Worker restart (cache miss → DB read)

**Validation:** Cross-plan integration tests all pass. Confidence feeds FSRS feeds FIRe correctly. Presentation drift affects subsequent content selection. Remediation doesn't break interleaving. Session state survives D1 round-trip with all fields intact. No cross-plan interaction bugs.
