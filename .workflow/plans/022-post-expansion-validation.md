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

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1 (after Plan 021 completion)

---

## Phase 1: Problem Density Expansion
**Goal:** Expand math problem sets to 15-25 per topic across the ~800-1000 topic graph. More problems per topic means each topic requires more engagement before content is exhausted.

*Adapted from Plan 019 Phase 4.5B, updated for the expanded graph.*

1. [ ] [RSH] Audit generator coverage against expanded topic set:
   - List which of the ~800-1000 topics have existing generators in `tools/generate-problems.ts`
   - Identify gaps — new atomic topics from 021 that need new generators or hand-authored expansion
   - Document coverage percentage and gap list
2. [ ] [IMP] Write generators for uncovered high-priority topics:
   - Focus on Wave 1 (foundational operations) and Wave 2 (fractions, geometry) first
   - Procedural generation preferred for arithmetic skills; template-based for word problems
3. [ ] [IMP] Run generators for all covered topics:
   - Target: 20 generated problems per topic (easy/medium/hard distribution)
   - Verify output in `content/math/problems-generated/`
4. [ ] [IMP] Merge generated problems into import pipeline:
   - Update `import-content.ts` to load both `problems/*.json` (hand-authored) and `problems-generated/*.json` (procedural)
   - Tag generated problems with `source: "generated"`
   - Hand-authored problems take priority when duplicates exist
5. [ ] [VAL] Validate and import expanded problem sets:
   - `just validate-content` — all generated problems pass validation
   - `just import-content` — load into local D1
   - Verify: average problems per topic ≥ 15
6. [ ] [VAL] Quick L2 sanity check:
   - `just evaluate-l2` with expanded problems
   - No regressions from problem expansion
   - Check per-topic engagement depth increased

**Validation:** Average problems per math topic ≥ 15. `just validate-content` passes. L2 evaluation shows no regressions. Generated problems properly tagged with `source: "generated"`.

---

## Phase 2: L3 Re-evaluation & Content Sufficiency Gate
**Goal:** Re-run L3 with the expanded graph + expanded problems. Determine whether content runway is sufficient for L4 (180 sessions) or if more content is needed.

*Adapted from Plan 019 Phase 4.5C, now running on the post-expansion graph.*

1. [ ] [VAL] Run L3 (90 sessions) with expanded graph + problems:
   - `just evaluate-l3`
   - Compare against pre-expansion L3 baseline (from Plan 019 Phase 4)
2. [ ] [RSH] Compare progression rates before vs after expansion:
   - Sessions-to-plateau: before (session 8 avg) vs after (target: session 50+)
   - Final mastery %: before (77%) vs after (expect lower — 4x more topics)
   - Review/New Balance: before (0.86 FAIL) vs after (expect improvement — far more new content)
   - Topics introduced per session in sessions 30-90: before (0 for strong) vs after (should still be > 0)
3. [ ] [RSH] Content sufficiency assessment for L4/L5:
   - At the new progression rate, how many sessions until strong profiles exhaust all math content?
   - If plateau < 60 sessions: need more content before L4
   - If plateau ≥ 60 sessions: sufficient runway for 180 sessions
   - If plateau ≥ 120 sessions: sufficient for L5 (360 sessions)
4. [ ] [DOC] Document results:
   - Before/after comparison table in `docs/simulation-maturity.md`
   - Update L3 baseline (`simulations/baselines/l3.json`)
   - Record decision in `DECISIONS.md`
5. [ ] [VAL] Decision gate:
   - **Proceed to Phase 3** if profiles have runway for 180+ sessions
   - **Add content (ELA/history expansion or math-high-school)** if content is still insufficient
   - Document decision with supporting data

**Validation:** L3 re-run shows realistic progression (strong profiles plateau ≥ session 50). Before/after comparison documented. Clear go/no-go for L4/L5.

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
