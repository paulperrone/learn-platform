# Plan 022: Post-Expansion Engine Validation & Calibration

> **Created:** 2026-03-11T20:10:57Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

After Plan 021 expands the math graph from 207 to ~800-1000 atomic skill topics, this plan validates the expanded graph with problem density expansion, long-horizon simulations (L3-L5), and a data-driven FIRe implementation decision. All content-dependent evaluation and calibration work is deferred here from Plan 019 Phases 4.5B-6, because running it on the pre-expansion graph would produce results invalidated by the topology change.

**Depends on:**
- Plan 021 (math topic expansion to ~800-1000 topics)
- Plan 020 Phases 3-7 (backend/frontend/simulation migration to discipline-owned topics)

**Unblocks:**
- Production readiness for expanded math content
- FIRe implementation decision with sufficient data

## Progress

**Completed:** Phase 1 (2026-03-12), Phase 2 (2026-03-12)
**In Progress:** —
**Next:** Phase 3 (L4-L5 Long-Horizon Simulations)
**Status:** 🟡 Active — Phase 2 complete. L3 re-evaluation shows expansion fixed Review/New Balance (FAIL→PASS). Strong profiles exhaust math content at session 67-72 (up from session 6). Gate passes: proceed to L4/L5. Known issues: mastery convergence target needs recalibration, interleaving quality regressed — both deferred to Phase 5.

---

## Phase 1: Problem Density Expansion ✓
**Goal:** Expand math problem sets to 15-25 per topic across the ~800-1000 topic graph. More problems per topic means each topic requires more engagement before content is exhausted.

*Adapted from Plan 019 Phase 4.5B, updated for the expanded graph.*

1. [x] [RSH] Audit generator coverage against expanded topic set:
   - 705-topic graph: 207 topics had 5 problems, 498 had 15
   - Generator registry covers 143 topics (50 generated problems each in `problems-generated/`)
   - 64 complex/conceptual topics have 15 hand-authored problems in `problems-generated/`
   - All 207 short topics already have `problems-generated/` content from prior runs
2. [x] [IMP] Write generators for uncovered high-priority topics:
   - 143 topics covered by generators (k5-arithmetic, k5-numbers, k5-fractions, middle-rational, middle-algebra, middle-geometry)
   - 64 complex topics (word problems, conceptual) already have hand-authored problems-generated content (15 each) — no new generators needed, minimum already met
3. [x] [IMP] Run generators for all covered topics:
   - `just generate-problems` already ran: 143 topics × 50 = 7150 generated problems in `problems-generated/`
   - 64 additional topics: 15 hand-authored problems each in `problems-generated/`
4. [x] [IMP] Verify generated problems merge into content pipeline:
   - `generate-bundles.ts` confirmed: reads `problems/` then concatenates `problems-generated/` (line ~97)
   - `FileContentBucket` also merges both directories for simulation/local dev
   - Generated problems tagged with `source: "generated"` in generator output
5. [x] [VAL] Validate and import expanded problem sets:
   - `just validate-content`: 0 errors, 16615 math problems across 705 topics (avg 23.6/topic)
   - All ≥ 15 per topic (min: 20 for the 64 hand-authored topics, max: 65 for 143 generator topics)
6. [x] [VAL] Quick L2 sanity check:
   - `just evaluate-l2`: 6P/1W/3F — identical to Plan 021 Phase 6 baseline
   - No regressions from problem expansion confirmed

**Validation:** Average problems per math topic ≥ 15. `just validate-content` passes. L2 evaluation shows no regressions. Generated problems properly tagged with `source: "generated"`.

> **Post-023 note:** Content is now served from R2 bundles (production) or `FileContentBucket` (simulations/local dev). The `assessment_content` and `instructional_content` D1 tables no longer exist. `generate-bundles.ts` and `FileContentBucket` both merge `problems/` + `problems-generated/` directories automatically. `review_log` now has a `content_version` column for version correlation. Analytics Engine records rich per-problem events (accuracy, response time, hints, cognitive demand, content version) — available for content effectiveness analysis in later phases.

---

## Phase 2: L3 Re-evaluation & Content Sufficiency Gate ✓
**Goal:** Re-run L3 with the expanded graph + expanded problems. Determine whether content runway is sufficient for L4 (180 sessions) or if more content is needed.

*Adapted from Plan 019 Phase 4.5C, now running on the post-expansion graph.*

1. [x] [VAL] Run L3 (90 sessions) with expanded graph + problems:
   - `just evaluate-l3`
   - New L3 baseline saved: `simulations/baselines/l3.json` (2026-03-12)
2. [x] [RSH] Compare progression rates before vs after expansion:
   - Sessions-to-plateau: before (session 8 avg) → after (strong: session 67-72, average: session 90+)
   - Final mastery %: before (77%) → after (36.9% avg total — expected, 4x more topics)
   - Review/New Balance: before (0.86 FAIL) → after (0.694 PASS) — **fixed**
   - Topics introduced per session: strong profiles get 5-7/session through session 67-72 (was 0 after session 6)
3. [x] [RSH] Content sufficiency assessment for L4/L5:
   - Strong profiles exhaust at session 67-72 (≥ 60 → sufficient gate passes)
   - Average/struggling: still learning at session 90+ (sufficient runway for L4/L5)
   - Gate result: **proceed to Phase 3**
4. [x] [DOC] Document results:
   - Before/after comparison table in `docs/simulation-maturity.md` (updated)
   - L3 baseline updated: `simulations/baselines/l3.json`
   - Decision recorded in `DECISIONS.md`
5. [x] [VAL] Decision gate:
   - **Proceed to Phase 3** — all profiles have runway ≥ 60 sessions (strong), 90+ (average/struggling)
   - Notable: mastery convergence target needs recalibration for 705-topic graph (deferred to Phase 5)
   - Notable: interleaving quality regressed (0.092→0.141, PASS→FAIL) — under investigation, not blocking

**Validation:** ✓ L3 re-run complete. Strong profiles plateau ≥ session 67 (well above session 50 target). Before/after comparison documented in simulation-maturity.md. Decision recorded in DECISIONS.md.

---

## Phase 3: L4-L5 Long-Horizon Simulations
**Goal:** Semester and year-long simulations that reveal long-term engine behavior on the expanded graph, stress-test FSRS scheduling at scale, and validate effectiveness over extended periods.

*Adapted from Plan 019 Phase 5.*

**Key profiles for L4/L5** (not all 29 — too expensive):
- `average-older` (typical learner)
- `fast-learner-older` (improving ability over long term)
- `struggling-older` (floor behavior over extended time)
- `returning-after-gap` (gap resilience)
- `misconception-fractions` (remediation effectiveness long-term)
- `strong-highschool` (ceiling behavior)
- `multi-math-strong` (multi-subject long-term)

1. [ ] [IMP] Add L4/L5 justfile recipes:
   - `simulate-l4 seed="42"`: 7 key profiles x 180 sessions
   - `simulate-l5 seed="42"`: 7 key profiles x 360 sessions
2. [ ] [IMP] Add L4/L5-specific evaluation metrics:
   - Long-term mastery retention (lapse rate after session 100)
   - Review efficiency trend (reviews per session after session 60)
   - New topic starvation detection
   - FIRe long-term compression
   - Gap resilience (returning-after-gap profile)
3. [ ] [VAL] Run L4 (180 sessions, 7 profiles):
   - Evaluate long-term metrics
   - Identify scaling issues
   - Establish L4 baseline: `simulations/baselines/l4.json`
4. [ ] [VAL] Run L5 (360+ sessions, 7 profiles):
   - Full year simulation
   - Document end state per profile
   - Identify pathological behaviors
   - Establish L5 baseline: `simulations/baselines/l5.json`
5. [ ] [DOC] Update `docs/simulation-maturity.md` with L4/L5 findings

**Validation:** L4 and L5 complete without crashes. At least 2 insights discovered invisible at L3. No pathological behaviors. Gap resilience measured.

---

## Phase 4: FIRe Implementation Decision
**Goal:** Using L3/L4/L5 FIRe efficiency data from the expanded graph combined with Plan 019 Phase 2.7 isolation diagnostics, make a data-driven decision on whether to change the FIRe implementation.

*Adapted from Plan 019 Phase 5.5.*

**Decision framework:**

| FIRe at L3+ | Phase 2.7 attribution | Action |
|-------------|----------------------|--------|
| Positive (>0%) | Any | Keep current. FIRe works at scale. Calibrate target upward. |
| Neutral (-5% to 0%) | Credit helps, ordering hurts | Switch to priority ordering only. Keep credit. |
| Neutral | Both neutral | Keep for future density improvement. |
| Negative (<-5%) | Credit hurts | Implement retrieval-dependent credit (R > 0.85 gate). |
| Negative | Ordering hurts | Replace set-cover with priority ordering. |
| Negative | Both hurt | Disable FIRe queue elimination; keep credit-only for stability compounding. |

1. [ ] [RSH] Compile FIRe efficiency data across maturity levels:
   - L2 (15 sessions): -25% baseline (Plan 019 Phase 2.6)
   - L3 (90 sessions): from Phase 2 results
   - L4 (180 sessions): from Phase 3 results
   - L5 (360 sessions): from Phase 3 results
   - Cross-reference with Plan 019 Phase 2.7 isolation data
   - Is efficiency trending positive? At what session count does it cross 0%?
   - If production data exists: query Analytics Engine for per-problem accuracy/response-time by content version to supplement simulation data
2. [ ] [IMP/RSH] Based on decision framework, implement changes if warranted
3. [ ] [VAL] Run `just evaluate` at L2 and L3 with new implementation (if changed):
   - Compare FIRe efficiency before and after
   - No regressions on other 9 system metrics
   - `just test` — no failures
4. [ ] [DOC] Update documentation:
   - `docs/fire-implementation-analysis.md` — "Implemented Decision" section
   - `docs/learning-science.md` section 8 — final FIRe implementation details
   - `docs/simulation-targets.md` section 2.6 — update target/tolerance
   - Record decision in `DECISIONS.md`

**Validation:** Decision documented with multi-level data. If implementation changed, efficiency improved or target recalibrated. No regressions.

---

## Phase 5: Final Baselines & Documentation
**Goal:** Run the complete evaluation pipeline at each maturity level on the production graph, establish multi-level regression baselines, and produce a comprehensive simulation capability report.

*Adapted from Plan 019 Phase 6.*

1. [ ] [VAL] Multi-level regression validation:
   - Run L1 → L2 → L3 sequentially, verify metrics improve monotonically where expected
   - Mastery convergence: should increase L1→L2→L3
   - Review balance: should normalize by L2, stay stable at L3
   - FIRe efficiency: should increase L2→L3
2. [ ] [IMP] Create multi-level baseline file: `simulations/baselines/multi-level.json`
   - Contains L1-L5 baselines for trend comparison
   - `just simulate-compare-levels` recipe
3. [ ] [IMP] Add maturity level to evaluation report output:
   - `evaluation.json` includes `maturityLevel` field
   - Markdown report shows level context
4. [ ] [DOC] Finalize `docs/simulation-maturity.md`:
   - Complete reference for the 5-level maturity ladder
   - Profile coverage matrix
   - What each level reveals
   - When to run each level
5. [ ] [VAL] Final validation: `just test`, `just evaluate` at L2 with all profiles

**Validation:** Multi-level baselines established. Evaluation reports include maturity level context. Documentation complete. Simulation infrastructure production-ready.
