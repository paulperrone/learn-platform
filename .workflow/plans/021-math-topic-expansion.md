# Plan 021: Math Topic Expansion

> **Created:** 2026-03-11T19:59:56Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Expand the math knowledge graph from 207 → ~450 atomic skill topics (2.2x), applying the split heuristics from `docs/content-system.md`. Current topics are roughly standards-level; the target is Math Academy-style granularity where each topic represents one independently placeable, teachable, and remediable skill. Three expansion waves by strand group (foundational operations → K-5 domains → 6-8 domains), each followed by content generation and validation. Self-contained rebaselining at L2 after each major wave.

**Depends on:**
- Plan 020 Phase 2 ✅ (discipline-owned topics, unified math graph)

**Unblocks:**
- Plan 019 Phases 4.5B-6 (problem density expansion runs better on a granular graph)

## Current State

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Total math topics | 207 | ~450 | 2.2x |
| Topics/grade (K-8 avg) | 23 | ~50 | 2.2x |
| Prereq density | 1.55/topic | 1.5-3.0/topic | At floor — will improve with splits |
| Encompassing density | 1.27/topic | 1.0-2.0/topic | In range — needs capstone pass |
| Math Academy benchmark | ~100-150/grade | — | Still 2-3x below after expansion |

### Strand-Level Expansion Targets

| Wave | Strand | Current | Target | Delta |
|------|--------|---------|--------|-------|
| 1 | counting-cardinality | 4 | 10 | +6 |
| 1 | operations-addition | 8 | 18 | +10 |
| 1 | operations-subtraction | 5 | 12 | +7 |
| 1 | operations-multiplication | 7 | 18 | +11 |
| 1 | operations-division | 4 | 12 | +8 |
| **1 total** | | **28** | **70** | **+42** |
| 2 | number-base | 19 | 40 | +21 |
| 2 | fractions | 16 | 35 | +19 |
| 2 | algebra-thinking | 6 | 15 | +9 |
| 2 | measurement-data | 9 | 22 | +13 |
| 2 | geometry | 14 | 30 | +16 |
| **2 total** | | **64** | **142** | **+78** |
| 3 | rational-numbers | 18 | 38 | +20 |
| 3 | ratios-proportions | 17 | 35 | +18 |
| 3 | expressions-equations | 22 | 45 | +23 |
| 3 | linear-functions | 17 | 35 | +18 |
| 3 | geometry-advanced | 20 | 40 | +20 |
| 3 | statistics-probability | 14 | 30 | +16 |
| 3 | polynomials-intro | 7 | 15 | +8 |
| **3 total** | | **115** | **238** | **+123** |
| **Grand total** | | **207** | **450** | **+243** |

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Audit & Expansion Map
**Goal:** Produce a concrete split plan for every strand before touching content files.

For each of 17 strands, apply the split heuristics from `docs/content-system.md` §13 to every existing topic:
- **Pass-one-fail-another:** Can a learner master part of this topic and fail another part?
- **Hidden prerequisite chain:** Does this topic contain an internal step sequence?
- **Remediation intermediate step:** Would remediation naturally point to a sub-skill not currently a topic?
- **Capstone encompassing:** Would splitting create a meaningful parent-child encompassing?

1. [ ] [RSH] Audit Wave 1 strands (counting-cardinality, operations-addition, operations-subtraction, operations-multiplication, operations-division): List every existing topic, identify splits, name new topics, draft prerequisite edges
2. [ ] [RSH] Audit Wave 2 strands (number-base, fractions, algebra-thinking, measurement-data, geometry): Same process
3. [ ] [RSH] Audit Wave 3 strands (rational-numbers, ratios-proportions, expressions-equations, linear-functions, geometry-advanced, statistics-probability, polynomials-intro): Same process
4. [ ] [DOC] Write `docs/expansion-map.md`: For each strand, document before/after topic lists, new prerequisite edges, new encompassing edges, and rationale for each split. Include a summary table with per-strand counts.
5. [ ] [VAL] Review expansion map against split heuristics — verify no topic splits that violate "genuinely atomic" criterion, no splits that create trivial 1-problem topics

**Validation:** `docs/expansion-map.md` exists with concrete split decisions for all 17 strands. Each split cites at least one split heuristic. Target topic counts per strand are within ±10% of the targets in the table above.

---

## Phase 2: Wave 1 — Foundational Operations (28 → 70 topics)
**Goal:** Expand counting, addition, subtraction, multiplication, and division strands to atomic skill granularity.

These are the smallest strands with the biggest expansion ratios. Starting here gives early signal on the split quality and content generation workflow.

1. [ ] [IMP] Split topics and update `content/math/graph.json` for Wave 1 strands per expansion map:
   - Add new topic entries with `id`, `name`, `description`, `gradeLevel`, `strand`, `standardCode`
   - Rewire existing prerequisite edges (some existing edges become transitive through new intermediate topics)
   - Add new prerequisite edges between split topics
   - Add new encompassing edges (capstone topics encompass their component skills)
2. [ ] [IMP] Generate problems for new topics: 15 problems per topic (5 easy / 5 medium / 5 hard), with cognitive demand distribution per grade-level targets
3. [ ] [IMP] Generate worked examples for new topics: 2 examples per topic with step-by-step breakdowns
4. [ ] [IMP] Update collection membership: add new topics to appropriate grade-band collections (`math-k-2`, `math-3-5`)
5. [ ] [VAL] Run `just validate-content` — 0 errors, collection membership valid
6. [ ] [VAL] Run `just import-content` — all new topics load, edges intact
7. [ ] [VAL] Verify strand density: each Wave 1 strand has ≥1.5 prereq edges/topic

**Validation:** Math graph has ~249 topics (207 + 42). Wave 1 strands match expansion map. `just validate-content` passes. `just import-content` succeeds.

---

## Phase 3: Wave 2 — K-5 Domain Strands (64 → 142 topics)
**Goal:** Expand number-base, fractions, algebra-thinking, measurement-data, and geometry strands.

Fractions and number-base are the densest K-5 strands and hide the most internal prerequisite chains (e.g., "fraction addition" hides finding common denominators, converting, adding, simplifying).

1. [ ] [IMP] Split topics and update `content/math/graph.json` for Wave 2 strands per expansion map
2. [ ] [IMP] Generate problems for new topics: 15 per topic, grade-appropriate cognitive demands
3. [ ] [IMP] Generate worked examples for new topics: 2 per topic
4. [ ] [IMP] Update collection membership for `math-k-2`, `math-3-5`
5. [ ] [VAL] Run `just validate-content` — 0 errors
6. [ ] [VAL] Run `just import-content` — ~327 topics loaded
7. [ ] [VAL] L2 rebaseline: `just evaluate-l2` — first checkpoint with enough new mass to be meaningful
8. [ ] [DOC] Record L2 comparison: any regressions from pre-expansion baseline? Document in DECISIONS.md

**Validation:** Math graph has ~327 topics. L2 results: no P0 regressions (9P/1W/0F or better). K-5 strand density within guardrail range.

---

## Phase 4: Wave 3 — 6-8 Domain Strands (115 → 238 topics)
**Goal:** Expand all middle school strands — the largest wave (7 strands, +123 topics).

Expressions-equations and linear-functions have the most hidden prerequisite chains (solving one-step → two-step → multi-step, graphing → slope → intercept → systems).

1. [ ] [IMP] Split topics and update `content/math/graph.json` for Wave 3 strands per expansion map
2. [ ] [IMP] Generate problems for new topics: 15 per topic
3. [ ] [IMP] Generate worked examples for new topics: 2 per topic
4. [ ] [IMP] Update collection membership for `math-6-8`
5. [ ] [VAL] Run `just validate-content` — 0 errors
6. [ ] [VAL] Run `just import-content` — ~450 topics loaded
7. [ ] [VAL] L2 rebaseline: `just evaluate-l2`
8. [ ] [DOC] Record L2 comparison

**Validation:** Math graph has ~450 topics. L2 results: no P0 regressions. 6-8 strand density within guardrail range.

---

## Phase 5: Cross-strand Wiring & Encompassing Pass
**Goal:** Add cross-strand prerequisites and encompassing edges that only make sense at the new granularity level.

At standards-level granularity, cross-strand links were sparse because topics were too coarse to express precise dependencies. With atomic skills, connections like "multiply fractions" requiring "multiply whole numbers" become explicit.

1. [ ] [RSH] Audit cross-strand prerequisites: For each strand pair, identify new edges where an atomic skill in one strand is a genuine prerequisite for a skill in another strand
2. [ ] [IMP] Add cross-strand prerequisite edges to `content/math/graph.json`
3. [ ] [RSH] Audit capstone encompassing coverage: Identify mature strand endpoints that should encompass their component skills but currently don't
4. [ ] [IMP] Add capstone encompassing edges
5. [ ] [VAL] Verify density metrics:
   - Prereq density: 1.5-3.0 edges/topic (target)
   - Encompassing density: 1.0-2.0 edges/topic (target)
   - Every mature strand has at least one capstone with encompassing children
6. [ ] [VAL] Run `just validate-content` — 0 errors, DAG valid (no cycles from new cross-strand edges)

**Validation:** Prereq and encompassing density within guardrail ranges. No cycles. Every strand has capstone coverage.

---

## Phase 6: Final Rebaseline & Collection Update
**Goal:** Confirm engine stability at new density and update packaging.

1. [ ] [VAL] Full L2 evaluation: `just evaluate-l2` with all ~450 topics
2. [ ] [RSH] Compare against pre-021 baseline:
   - Diagnostic placement accuracy across the denser graph
   - Sessions-to-mastery for strong/average/weak profiles
   - FIRe compression with higher encompassing density
   - Review/new balance at L2
3. [ ] [IMP] Update grade-band collections with final topic lists (some new topics may have shifted collection boundaries)
4. [ ] [DOC] Record final decision in DECISIONS.md:
   - Expansion stable? Formally unblock Plan 019 Phases 4.5B-6 on the expanded graph
   - If FIRe compression improved, note the encompassing density that drove it
   - If any strands are still below density floor, flag for a future expansion pass
5. [ ] [DOC] Update CLAUDE.md content pipeline section with new topic counts and density expectations

**Validation:** L2 maintains 9P/1W/0F or better. Final topic count documented. Plan 019 formally unblocked.
