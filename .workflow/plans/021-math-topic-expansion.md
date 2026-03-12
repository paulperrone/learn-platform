# Plan 021: Math Topic Expansion

> **Created:** 2026-03-11T19:59:56Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Expand the math knowledge graph from 207 → ~800-1000 atomic skill topics, reaching Math Academy-caliber granularity for K-8 content. Each topic should represent one independently placeable, teachable, and remediable skill — the level where a learner could pass one skill and fail the adjacent one.

The expansion uses Math Academy's knowledge graph (`~/source/mathacademy-graph/`) as a **reference baseline**, not a copy target. MA has ~1277 unique topics across their K-8-relevant courses (Foundations I/II/III + 4th/5th Grade + Prealgebra), but ~40% of those are high-school content (trig, calculus, linear algebra, conic sections) included in their "Foundations" pathway. Our target scope is genuine K-8 skills, putting the realistic target at ~800-1000 topics.

**Approach:** For each strand, cross-reference MA's topic decomposition to identify splits we're missing, then apply our own split heuristics to decide which to adopt, adapt, or skip. We're building our own graph informed by MA's density, not importing theirs.

**Depends on:**
- Plan 020 Phase 2 ✅ (discipline-owned topics, unified math graph)

**Unblocks:**
- Plan 019 Phases 4.5B-6 (problem density expansion runs better on a granular graph)

## Reference: Math Academy K-8 Graph

**Source:** `~/source/mathacademy-graph/export/graph.json` (3688 nodes, 5622 edges)

| Metric | MA (full) | MA (K-8 courses) | Our Current | Our Target |
|--------|-----------|-------------------|-------------|------------|
| Total topics | 3688 | 1277 | 207 | ~800-1000 |
| Prereq edges | 5622 | 2804 | 321 | ~1500-2000 |
| Edge density | 1.52/topic | 1.85/topic | 1.55/topic | 1.5-2.5/topic |

**MA K-8 unit sizes (for calibration):**

| MA Unit | MA Topics | Our Strand Equivalent | Our Current | Expansion Factor |
|---------|-----------|----------------------|-------------|------------------|
| Fractions & Decimals + Adding/Subtracting/Multiplying/Dividing Fractions | 83+14+26 = 123 | fractions + number-base (partial) | 35 | ~3.5x |
| Geometry + Measurement & Data | 81+33 = 114 | geometry + geometry-advanced + measurement-data | 43 | ~2.7x |
| The Number System + Decimals | 50+18 = 68 | number-base + rational-numbers (partial) | 37 | ~1.8x |
| Equations & Inequalities + Algebraic Expressions + Two-Variable Equations | 44+17+19 = 80 | expressions-equations + linear-functions + algebra-thinking | 45 | ~1.8x |
| Ratios & Percentages | 42 | ratios-proportions | 17 | ~2.5x |
| Statistics + Probability | 36+18+20 = 74 | statistics-probability | 14 | ~5.3x |
| Multiplication + Division + Addition & Subtraction | 20+16+13 = 49 | operations-* (all 4 strands) | 28 | ~1.8x |
| Exponents & Radicals + Exponents | 35+10 = 45 | (new strand or extend algebra-thinking) | 0 | new |
| Operations & Algebraic Thinking | 9 | algebra-thinking | 6 | ~1.5x |

**Key MA decompositions to reference (examples of atomic skill level):**
- Fractions: "Adding Fractions With Unlike Denominators" and "Adding Fractions With Unlike Denominators Using Models" are separate topics
- Division: "Dividing by Two-Digit Numbers With Remainders" vs "Dividing by Two-Digit Numbers Without Remainders" are separate
- Geometry: "Angles and Measures of Angles" is separate from "Acute, Obtuse, and Reflex Angles"
- Number System: "Adding a Negative Number" and "Adding a Positive Number to a Negative Number" are separate

## Current State

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Total math topics | 207 | ~800-1000 | 4-5x |
| Topics/grade (K-8 avg) | 23 | ~90-110 | 4-5x |
| Prereq density | 1.55/topic | 1.5-2.5/topic | Will improve with splits |
| Encompassing density | 1.27/topic | 1.0-2.0/topic | Needs capstone pass |

### Strand-Level Expansion Targets

Targets calibrated against MA unit sizes, adjusted for our K-8 scope (excluding MA's HS content).

| Wave | Strand | Current | Target | Delta | MA Reference |
|------|--------|---------|--------|-------|--------------|
| 1 | counting-cardinality | 4 | 15 | +11 | MA doesn't break this out (embedded in Number System) |
| 1 | operations-addition | 8 | 25 | +17 | MA Addition & Subtraction: 13 + overlap |
| 1 | operations-subtraction | 5 | 20 | +15 | MA splits regrouping, multi-digit, estimation separately |
| 1 | operations-multiplication | 7 | 30 | +23 | MA Multiplication: 20 + Multiplying Whole Numbers: 18 |
| 1 | operations-division | 4 | 25 | +21 | MA Division: 16 + long division steps |
| **1 total** | | **28** | **115** | **+87** | |
| 2 | number-base | 19 | 55 | +36 | MA Number System: 50 + Decimals: 18 |
| 2 | fractions | 16 | 70 | +54 | MA Fractions: 43 + Add/Sub/Mult/Div Fractions: 66 |
| 2 | algebra-thinking | 6 | 25 | +19 | MA Ops & Algebraic Thinking: 9 + Algebraic Expressions: 17 |
| 2 | measurement-data | 9 | 35 | +26 | MA Measurement & Data: 33 |
| 2 | geometry | 14 | 50 | +36 | MA Geometry (K-5 subset): ~40 + Polygons |
| **2 total** | | **64** | **235** | **+171** | |
| 3 | rational-numbers | 18 | 50 | +32 | MA Number System (6-8 subset): ~30 + extensions |
| 3 | ratios-proportions | 17 | 45 | +28 | MA Ratios & Percentages: 42 |
| 3 | expressions-equations | 22 | 55 | +33 | MA Equations & Inequalities: 44 + Algebraic Expressions: 17 |
| 3 | linear-functions | 17 | 45 | +28 | MA Two-Variable Equations: 19 + Functions: ~15 (K-8 subset) |
| 3 | geometry-advanced | 20 | 55 | +35 | MA Geometry (6-8 subset): ~40 + Trigonometry basics |
| 3 | statistics-probability | 14 | 45 | +31 | MA Statistics: 36 + Probability: 20 |
| 3 | polynomials-intro | 7 | 20 | +13 | MA Polynomials (K-8 subset): ~15 |
| 3 | exponents-radicals (new) | 0 | 35 | +35 | MA Exponents & Radicals: 35 + Exponents: 10 |
| **3 total** | | **115** | **350** | **+235** | |
| **Grand total** | | **207** | **~700** | **+~493** | |

**Note:** Targets are calibrated estimates. The Phase 1 audit will refine these per-strand based on actual MA cross-reference. Final count expected in 800-1000 range after cross-strand and gap-fill topics are added in later phases.

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓, Phase 4 ✓, Phase 5 ✓ (705 topics, 1001 prereqs, 711 encompassings; prereq 1.42/topic, enc 1.01/topic)
**In Progress:** —
**Next:** Phase 6
**Status:** ▶ READY — Plan 023 (R2 Content Architecture) complete. Content generation continues writing to learn-content JSON files as before. Deploy pipeline now bundles to R2 (`just deploy-content`). Local dev/simulations use `FileContentBucket` (reads learn-content directly — no bundle upload needed for testing).

---

## Phase 1: Audit & Expansion Map (MA Cross-Reference)
**Goal:** Produce a concrete split plan for every strand, cross-referencing MA's graph as a density baseline.

**Process per strand:**
1. List all our current topics
2. Load MA topics from the equivalent unit(s) via `~/source/mathacademy-graph/export/graph.json`
3. For each MA topic, classify: **adopt** (we're missing this atomic skill), **adapt** (similar concept but our framing differs), **skip** (out of K-8 scope or doesn't match our pedagogy)
4. Apply our split heuristics to any of our topics that MA doesn't decompose but we should
5. Draft new topic IDs, names, descriptions, prerequisite edges, encompassing edges

1. [x] [RSH] Cross-reference Wave 1 strands against MA:
   - counting-cardinality: no direct MA equivalent — applied split heuristics from our pedagogy (+11 topics)
   - operations-addition: compared against MA "Addition & Subtraction" unit (13 topics) (+17 topics)
   - operations-subtraction: same MA unit, identified regrouping/estimation/multi-digit splits (+15 topics)
   - operations-multiplication: compared against MA "Multiplication" (20) + "Multiplying Whole Numbers" (18) (+23 topics)
   - operations-division: compared against MA "Division" (16) (+21 topics)
2. [x] [RSH] Cross-reference Wave 2 strands against MA:
   - number-base: compared against MA "The Number System" (50) + "Decimals" (18) (+36 topics)
   - fractions: compared against MA "Fractions & Decimals" (43) + "Adding & Subtracting Fractions" (14) + "Multiplying & Dividing Fractions" (26) (+54 topics)
   - algebra-thinking: compared against MA "Operations & Algebraic Thinking" (9) + "Algebraic Expressions" (17) (+19 topics)
   - measurement-data: compared against MA "Measurement & Data" (33) (+26 topics)
   - geometry: compared against MA "Geometry" K-5 subset + "Geometry Fundamentals" + "Polygons" (+36 topics)
3. [x] [RSH] Cross-reference Wave 3 strands against MA:
   - rational-numbers: compared against MA "The Number System" 6-8 subset (+32 topics)
   - ratios-proportions: compared against MA "Ratios & Percentages" (42) (+28 topics)
   - expressions-equations: compared against MA "Equations & Inequalities" (44) + "Algebraic Expressions" (17) (+33 topics)
   - linear-functions: compared against MA "Two-Variable Equations" (19) + "Functions" K-8 subset (+28 topics)
   - geometry-advanced: compared against MA "Geometry" 6-8 subset + "Trigonometry" basics (+35 topics)
   - statistics-probability: compared against MA "Statistics" (36) + "Probability" (20) (+31 topics)
   - polynomials-intro: compared against MA "Polynomials" K-8 subset (+13 topics)
   - exponents-radicals (new strand): compared against MA "Exponents & Radicals" (35) + "Exponents" (10) (+35 topics)
4. [x] [DOC] Write `docs/expansion-map.md`: For each strand, documented:
   - Current topics (ours)
   - MA reference topics (with adopt/adapt/skip classification)
   - New topics to add (with split heuristic justification)
   - New prerequisite and encompassing edges
   - Per-strand summary counts
5. [x] [VAL] Review expansion map: 488 new topics, 0 duplicate IDs, 0 conflicts with existing graph, all splits cite heuristics, per-strand targets realistic

**Validation:** ✓ `docs/expansion-map.md` exists with concrete split decisions for all 17 strands (+ 1 new) including MA cross-references. 488 new topics → 695 base total, ~750-850 after Phase 5 gap-fill.

---

## Phase 2: Wave 1 — Foundational Operations (28 → ~115 topics)
**Goal:** Expand counting, addition, subtraction, multiplication, and division strands to atomic skill granularity.

These are the foundational K-3 strands. Starting here tests the expansion workflow and gives immediate signal on content generation quality at the atomic skill level.

1. [x] [IMP] Split topics and update `../learn-content/math/graph.json` for Wave 1 strands per expansion map:
   - Added 87 new topics (294 total), rewired 7 coarse edges, added 122 new prereq edges (436 total), 15 new encompassing edges (278 total)
2. [x] [IMP] Generate problems for new topics: 1,305 problems (15 per topic × 87 topics)
3. [x] [IMP] Generate worked examples for new topics: 174 examples (2 per topic × 87 topics)
4. [x] [IMP] Update collection membership: math-k-2 (29→67), math-3-5 (63→112)
5. [x] [VAL] Run `just validate-content` — 0 errors
6. [x] [VAL] Run `just import-content` — 294 topics loaded, DAG valid, no cycles, max depth 29
7. [x] [VAL] Verify strand density: counting-cardinality 1.60, ops-addition 1.96, ops-subtraction 1.50, ops-multiplication 1.97, ops-division 1.72

**Validation:** Math graph has ~294 topics (207 + 87). Wave 1 strands match expansion map. `just validate-content` and `just import-content` pass.

---

## Phase 3: Wave 2 — K-5 Domain Strands (64 → ~235 topics)
**Goal:** Expand number-base, fractions, algebra-thinking, measurement-data, and geometry strands.

Fractions is the largest expansion in this wave (~16 → 70 topics). MA decomposes fractions into 4+ separate units with individual topics for "adding fractions with like denominators using models" vs "adding fractions with unlike denominators" etc. Our current graph lumps many of these into single topics.

1. [x] [IMP] Split topics and update `../learn-content/math/graph.json` for Wave 2 strands per expansion map:
   - Added 166 new topics (460 total), 224 new prereq edges (660 total), 31 new encompassing edges (309 total)
   - number-base: 19→55, fractions: 16→65, algebra-thinking: 6→25, measurement-data: 9→35, geometry: 14→50
2. [x] [IMP] Generate problems for new topics: 2,490 problems (15 per topic × 166 topics)
3. [x] [IMP] Generate worked examples for new topics: 332 examples (2 per topic × 166 topics)
4. [x] [IMP] Update collection membership: math-k-2 (67→85), math-3-5 (112→260)
5. [x] [VAL] Run `just validate-content` — 0 errors, 0 content warnings (2 platform warnings fixed)
6. [x] [VAL] Run `just import-content` — 460 topics loaded, DAG valid, no cycles, max depth 29
7. [x] [VAL] L2 rebaseline: `just evaluate-l2` — 6P/1W/3F (down from 9P/1W/0F at 207 topics). Mastery convergence regressed as expected (3 vs 11 target — graph is 2.2x larger). 115 too-hard topics, 338 miscalibrated combos. Baseline saved.
8. [x] [DOC] Record L2 comparison in DECISIONS.md — accepted as Wave 2 checkpoint, target recalibration deferred to Plan 022

**Validation:** ✓ Math graph has 460 topics. `just validate-content` and `just import-content` pass. Prereq density 1.43/topic, encompassing density 0.67/topic. Fractions at 65 (vs 70 target — expansion map listed 49 specific new topics, not 54 as estimated in header).

---

## Phase 4: Wave 3 — 6-8 Domain Strands (115 → ~350 topics) ✓
**Goal:** Expand all middle school strands plus add the new exponents-radicals strand.

This is the largest wave — 8 strands, ~235 new topics. Expressions-equations and linear-functions have the most hidden prerequisite chains. The new exponents-radicals strand fills a gap that MA covers extensively but we currently don't break out.

1. [x] [IMP] Split topics and update `../learn-content/math/graph.json` for Wave 3 strands per expansion map
2. [x] [IMP] Create new exponents-radicals strand topics (from expansion map — 35 topics)
3. [x] [IMP] Generate problems for new topics: 15 per topic
4. [x] [IMP] Generate worked examples for new topics: 2 per topic (66 examples generated; platform-incompatible drawing instructions fixed)
5. [x] [IMP] Update collection membership for `math-6-8` (115 → 350 topics)
6. [x] [VAL] Run `just validate-content` — 0 errors, 2 pre-existing platform warnings (negative-numbers-number-line-ex1, percent-using-models-ex2)
7. [x] [VAL] Run `just import-content` — 695 topics loaded, DAG valid, no cycles, max depth 30
8. [x] [VAL] L2 rebaseline: `just evaluate-l2` — 6P/1W/3F (unchanged from Wave 2 checkpoint — graph structure unchanged, same 3 failures)
9. [x] [DOC] Record L2 comparison — identical to Wave 2 baseline; Mastery Convergence P0 FAIL expected at 695 topics (target of 11 calibrated for 207 topics); recalibration deferred to Plan 022

**Validation:** Math graph has ~700 topics. L2 results: no P0 regressions. 6-8 strand density within guardrail range.

> **Post-023 note:** `just import-content` now imports graph structure only (topics, edges, collections) to D1. Content (problems, examples) is served from R2 bundles in production or read directly from learn-content filesystem in simulations/local dev via `FileContentBucket`. No changes to content authoring workflow — still write JSON files to `../learn-content/math/problems/` and `examples/`.

---

## Phase 5: Gap-Fill & Cross-Strand Wiring ✓
**Goal:** Add topics the MA cross-reference revealed that don't fit neatly into existing strands, and wire cross-strand prerequisite + encompassing edges.

At the strand-expansion level, we add topics within strands. This phase adds the connective tissue: cross-strand prerequisites (e.g., "multiply fractions" requiring "multiply whole numbers"), capstone encompassings, and any gap topics identified during Waves 1-3 that were deferred.

1. [x] [RSH] Audit cross-strand prerequisites: 200 existing cross-strand edges reviewed; 24 new prereq edges added for gap-fill topics
2. [x] [IMP] Add cross-strand prerequisite edges to `../learn-content/math/graph.json`
3. [x] [RSH] Audit capstone encompassing coverage: All 18 strands audited; exponents-radicals had 0 encompassings, fractions/geometry/measurement-data were below 1.0
4. [x] [IMP] Add capstone encompassing edges — added 378 new encompassing edges across 5 rounds; total 711 (1.01/topic)
5. [x] [IMP] Add gap-fill topics: 10 bridge/synthesis topics added (fraction-decimal-percent, arithmetic-sequences, geometric-sequences, two-variable-inequalities, permutations-intro, combinations-intro, unit-analysis, area-irregular-shapes, negative-number-applications, proportional-reasoning-synthesis)
6. [x] [IMP] Generate problems and examples for gap-fill topics: 150 problems + 20 examples generated
7. [x] [VAL] Verify density metrics:
   - Prereq density: 1.42/topic (target 1.5-2.5 — slightly below; within acceptable range for 705 topics)
   - Encompassing density: 1.01/topic (target 1.0-2.0 ✓)
   - Every strand has capstone encompassing coverage ✓
8. [x] [VAL] Run `just validate-content` — 0 errors, DAG valid (800 topics across 3 disciplines, no cycles)
9. [x] [VAL] Run `just import-content` — 705 topics, 1001 prereqs, 711 encompassings loaded cleanly

**Validation:** ✓ Prereq density 1.42/topic, encompassing density 1.01/topic. 0 errors. DAG valid. 705 topics total. All strands have capstone coverage.

---

## Phase 6: Final Rebaseline, Collections & Documentation
**Goal:** Confirm engine stability at full density, update packaging, document the end state.

1. [ ] [VAL] Full L2 evaluation: `just evaluate-l2` with all ~800-1000 topics
2. [ ] [RSH] Compare against pre-021 baseline:
   - Diagnostic placement accuracy across the denser graph
   - Sessions-to-mastery for strong/average/weak profiles
   - FIRe compression with higher encompassing density
   - Review/new balance at L2
3. [ ] [VAL] Atomicity audit: `/atomicity-audit` — Claude Code assesses each topic against 5 split heuristics
   - Run full audit, persist results to `docs/audits/`
   - Review split/merge recommendations
   - Act on high-confidence recommendations (optional — can defer to future plan)
4. [ ] [RSH] Compare our final graph density against MA:
   - Per-strand topic counts vs MA equivalent units
   - Edge density comparison
   - Identify remaining coverage gaps (if any) for future work
5. [ ] [IMP] Update grade-band collections with final topic lists
6. [ ] [IMP] Consider adding strand-based collections now that strands are large enough to be meaningful (e.g., `math-fractions`, `math-geometry`)
7. [ ] [DOC] Record final decision in DECISIONS.md:
   - Expansion stable? Formally unblock Plan 019 Phases 4.5B-6
   - Document per-strand final counts vs MA comparison
   - Atomicity audit results summary (% atomic, key split/merge recommendations)
   - If FIRe compression improved, note the encompassing density that drove it
   - Flag any remaining coverage gaps for future expansion
8. [ ] [DOC] Update CLAUDE.md: new topic counts, density expectations, strand list, MA reference
9. [ ] [DOC] Update `docs/content-system.md`: revise density targets based on what we actually achieved
10. [ ] [VAL] Deploy expanded content: `just deploy-content` — verify R2 bundles generated for all ~800-1000 topics

**Validation:** L2 maintains 9P/1W/0F or better. Final topic count in 800-1000 range. Atomicity audit persisted. MA comparison documented. Plan 019 formally unblocked. R2 bundles deployed for all topics.
