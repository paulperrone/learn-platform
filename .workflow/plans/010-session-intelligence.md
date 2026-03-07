# Plan: Session Intelligence & Learning Loop

> **Created:** 2026-03-06T23:45:24Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Transform the session service from a mechanical phase walker into an adaptive learning experience. Currently the learning loop executes phases in fixed order regardless of performance signals, hints are binary show/hide, mastery requires 0 lapses ever, related topics can appear back-to-back (causing interference), and worked examples never fade.

This plan implements: progressive hint reveal, calibrated mastery criteria, full FIRe implementation (multi-hop, upward penalties, review compression), session depth blending, non-interference interleaving, worked example fading, adaptive difficulty targeting, and per-user FSRS optimization. These changes make sessions feel like a tutor, not a quiz app.

**Note:** Session persistence already uses D1 write-through (DECISIONS.md 2026-03-04). The in-memory `Map` is a hot cache; D1 is the source of truth. Sessions survive Worker restarts. Durable Objects are a future optimization (lower read latency, alarm-based cleanup), not a blocker.

**Depends on:** Plan 009 Phase 1 (content selection — needed for depth blending to select content at different depths)

**Research basis:** `docs/learning-science.md` — §5 (fading), §7 (FSRS), §8 (FIRe), §9 (interleaving/non-interference), §17 (session design), §18 (85% rule), §19 (content design)

**System review reference:** `docs/system-review-2026-03-06.md` — Tier 2 priorities

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓
**In Progress:** —
**Next:** Phase 4

---

## Phase 1: Progressive Hint Reveal ✓
**Goal:** Hints revealed one at a time across attempts instead of all-or-nothing. Maps to the documented tutoring protocol: nudge → narrow → partial solution → full solution.

1. [x] [IMP] Add `hintIndex` to session state per problem attempt. On first attempt: no hints shown. On second attempt (after incorrect answer on same problem or phase): reveal hint[0]. Third attempt: hint[1]. Continue through the array. After all hints exhausted: show full solution. Track `hintsUsed` count in session state for the review log.

2. [x] [IMP] Update `buildPhaseItem()`: instead of `showHints: true/false`, return `availableHints: hint[0..hintIndex]` — the frontend renders only the revealed hints. For `guided` phase, start with hint[0] already revealed (scaffolded). For `independent` and `review`, start with no hints.

3. [x] [TST] Verify: first attempt shows no hints. Each subsequent attempt reveals one more hint. Hint count tracked in review log. Guided phase starts with first hint. All hints exhausted triggers solution display. Existing tests unaffected.

**Validation:** A student struggling with a problem gets progressively more help — first a nudge, then specific guidance, then a partial solution — rather than either nothing or everything.

---

## Phase 2: Mastery Criteria & FIRe Density ✓
**Goal:** Fix the overly strict mastery criteria and improve FIRe credit effectiveness.

1. [x] [IMP] Replace mastery criteria: current requirement of `0 lapses ever` with `consecutive correct at review state`. New criteria: topic is mastered when the student has 3+ consecutive correct reviews at FSRS `Review` state (state=2) with stability > 14 days. A single lapse during the review phase resets the consecutive counter but does NOT reset overall progress — the student re-enters the review cycle, not the learning cycle.

2. [x] [IMP] Add encompassing edges to the math-foundations graph. Current: 16 edges across 71 topics. Target: 40+ edges. Every multi-step topic should encompass its component skills (e.g., `add-within-20` encompasses `add-within-10`; `multiply-2digit` encompasses `multiply-1digit` and `add-within-100`). Update `graph.json` and re-import.

3. [x] [IMP] Extend FIRe credit to multi-hop: currently `applyFIReCredit()` only credits direct children. Extend to traverse the encompassing graph 2-3 hops deep with diminishing weight (weight * parentWeight at each hop). This dramatically increases review compression.

4. [x] [IMP] Implement upward penalty flow: when a student fails a problem on a simpler/child topic, propagate penalties UP to more advanced/parent topics that encompass it. Failure on `add-within-10` should reduce stability on `add-within-20` since the advanced skill depends on the simpler one. Penalty weight = encompassing weight * penalty factor (e.g., 0.5 — penalties are less aggressive than credit).

5. [x] [IMP] Implement early repetition discount: if FIRe credit is applied when a topic's memory is still very fresh (retrievability > 0.95), discount the credit proportionally. A review that happens well before the optimal interval provides less learning benefit. Discount factor = `1 - retrievability` (so credit at R=0.99 is only 1% effective, credit at R=0.85 is 15% effective). Prevents over-crediting from dense practice sessions.

6. [x] [TST] Verify: student with 3 consecutive correct reviews at Review state gets mastery. Single lapse resets consecutive counter but not mastery flag if already mastered. FIRe credit flows through 2-3 hops with diminishing weight. Upward penalties reduce parent stability on child failure. Early repetition discount reduces credit for fresh topics. New encompassing edges validate in DAG check. Existing tests updated for new criteria.

**Validation:** Students don't lose mastery from careless errors. FIRe credit compresses reviews meaningfully — practicing an advanced topic refreshes multiple prerequisites. Failure on basics correctly destabilizes advanced skills. Fresh-memory credit is appropriately discounted.

---

## Phase 3: Session Depth Blending ✓
**Goal:** Sessions mix content depths within a single learning session — warmup recall, main frontier work, stretch questions. Prevents the "one note" feel.

1. [x] [IMP] Update `getSessionMix()` to include depth blending. For each session:
   - **Warmup** (first 2-3 items): survey-depth recall questions on previously mastered topics. Quick, builds confidence, activates prior knowledge.
   - **Main work** (~60% of session): content at the student's current frontier depth. Mix of review and new topics (existing 60/40 split).
   - **Stretch** (last 1-2 items): one question at the next depth level above frontier (productive failure / priming for future learning). Only for context-layered disciplines where depth progression exists.

2. [x] [IMP] Tag session items with their blend role (`warmup`, `main`, `stretch`) so the frontend can adjust messaging. Warmup: "Quick review!" Main: standard messages. Stretch: "Challenge question — give it your best shot, it's okay to be unsure."

3. [x] [IMP] Handle depth blending gracefully when content doesn't exist at target depth: skip warmup if no survey content exists for mastered topics (rare edge case). Skip stretch if no next-depth content exists. Depth blending is best-effort, not required — sessions work fine without it.

4. [x] [TST] Verify: session mix includes warmup, main, and stretch items when content exists. Warmup items are survey-depth on mastered topics. Stretch items are one depth above frontier. Mastery-gated subjects get warmup but no stretch (depth is in topic progression). Sessions degrade gracefully when blend content is unavailable.

**Validation:** Sessions feel varied — easy warmup, focused main work, challenging stretch. Students aren't locked into monotonous same-difficulty questions.

---

## Phase 4: Non-Interference Interleaving
**Goal:** Avoid putting conceptually similar topics back-to-back in reviews. Research: 50-90% of multiplication errors are caused by interference from related facts.

1. [ ] [IMP] Build topic similarity grouping: topics that share a direct prerequisite edge or are siblings (same parent prerequisite) are in the same "strand." Tag each topic with its strand ID (derived from the first prerequisite or manually assigned). Store as a computed property or denormalized column.

2. [ ] [IMP] Update session mix interleaving: when ordering review and new items, ensure no two items from the same strand appear consecutively. If the mix can't satisfy this constraint (e.g., all due reviews are from the same strand), allow it but log a warning. Prioritize non-interference over strict due-date ordering.

3. [ ] [TST] Verify: session mix doesn't place add-within-10 and add-within-20 back-to-back. Topics from different strands (e.g., addition and geometry) alternate. Constraint degrades gracefully when unavoidable.

**Validation:** Review sessions alternate between dissimilar topics. Students don't confuse related facts due to adjacency.

---

## Phase 5: Worked Example Fading
**Goal:** Worked examples progressively fade steps as student gains proficiency. Research shows fading is where learning transitions from passive to active.

1. [ ] [IMP] Track example exposure per topic in session state or user_topic_state: how many times has this student seen worked examples for this topic? First encounter: full example (all steps visible). Second encounter: last step blanked (student fills in). Third encounter: last two steps blanked. Fourth+: fully faded (student solves independently with example structure visible as scaffold).

2. [ ] [IMP] Update `buildPhaseItem()` for `instruction` phase: instead of always returning the full example, return the example with a `fadingLevel` (0=full, 1=last step blanked, etc.). Frontend renders blanked steps as input fields where the student fills in the work. Fading level determined by exposure count + FSRS state (higher stability = more fading).

3. [ ] [TST] Verify: first encounter shows full example. Subsequent encounters fade progressively. FSRS state influences fading level (high stability = more fading). Frontend receives correct fading metadata. Fading doesn't break when example has only 2 steps (can't fade beyond available steps).

**Validation:** Students transition from studying complete examples to actively completing partially-blanked examples to solving independently. The scaffolding removes itself as proficiency grows.

---

## Phase 6: FIRe Review Compression
**Goal:** Select reviews that maximize trickle-down credit, reducing the total number of explicit reviews needed. Learning-science.md §8: "Select reviews whose encompassings knock out the most other due reviews. This is the key optimization that makes spaced repetition practical at scale." Math Academy achieves ~1 explicit review per topic on average with this approach.

1. [ ] [IMP] Build review compression algorithm: given the set of all due topics, compute the optimal subset of reviews that covers the most due topics via FIRe trickle-down. For each candidate review topic, calculate its "coverage score" — how many other due topics it would implicitly refresh through encompassing edges (multi-hop, weighted). Greedily select the topic with highest coverage, apply its FIRe credit, recompute remaining due set, repeat until all due topics are covered or the review budget is exhausted.

2. [ ] [IMP] Integrate into `getSessionMix()`: replace the current "most overdue first" review selection with the compression algorithm. The session still targets ~60% review items, but now each review is chosen to maximize implicit repetition of other due topics. Fall back to most-overdue ordering when encompassing density is too low for meaningful compression.

3. [ ] [IMP] Track compression metrics: log how many explicit reviews were scheduled vs. how many total due topics were covered (explicit + implicit via FIRe). Surface in admin analytics. Target: compression ratio > 2x (each explicit review covers 2+ due topics on average). This metric improves as encompassing edge density increases (Phase 2).

4. [ ] [TST] Verify: compression algorithm selects high-coverage reviews over merely overdue ones. Compression ratio tracked accurately. Sessions still feel natural (not just "always the hardest topic"). Fallback works when encompassing density is low. Total review burden decreases compared to naive scheduling.

**Validation:** Students do fewer explicit reviews while maintaining the same retention. Compression ratio is measurable and improves with encompassing density. This is the key efficiency gain that prevents "flashcard fatigue."

---

## Phase 7: Adaptive Difficulty & Per-User FSRS
**Goal:** Dynamically adjust problem difficulty within sessions to target ~85% success rate (the optimal learning zone per Wilson et al., 2019). Personalize FSRS parameters per user from their review history.

1. [ ] [IMP] Build rolling accuracy tracker in session state: track the last N problems' correctness within the current session (sliding window, N=10). Compute rolling accuracy. If accuracy > 90%, bias problem selection toward harder difficulty. If accuracy < 80%, bias toward easier. Target: 85% +/- 5%. Update `selectProblem()` to accept a difficulty bias signal.

2. [ ] [IMP] Adaptive difficulty selection: extend `selectProblem()` to use the rolling accuracy signal. Current: selects by requested difficulty tier (easy/medium/hard). New: when bias is "harder," prefer medium→hard. When bias is "easier," prefer easy→medium. When on target, use the phase's default difficulty. Log the actual difficulty served vs. the phase default for analytics.

3. [ ] [IMP] Per-user FSRS parameter optimization: ts-fsrs supports custom parameters trained on a user's review history. After a user has 50+ reviews, compute personalized FSRS parameters from their review log using `fsrs.computeParameters()`. Store in `userPreferences` or a new `user_fsrs_params` table. Load personalized params when creating the FSRS instance for that user. Fall back to global defaults for new users.

4. [ ] [TST] Verify: rolling accuracy tracker updates correctly within sessions. Problem difficulty shifts toward harder when accuracy is high. Shifts toward easier when low. Per-user FSRS params compute from review history. Personalized params produce different scheduling than defaults. Users with <50 reviews use global defaults.

**Validation:** Sessions maintain ~85% success rate through adaptive difficulty. Students are challenged but not overwhelmed. FSRS scheduling becomes personalized as review history grows, producing more accurate intervals per individual.
