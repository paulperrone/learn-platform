# Plan: Encompassing Graph Enrichment & FIRe Methodology

> **Created:** 2026-03-08T00:42:10Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Audit the 71-topic math-foundations knowledge graph, identify missing encompassing relationships (currently 42, targeting 80+), assign calibrated fractional weights, validate that FIRe review compression meaningfully improves, and document the weight assignment methodology as a reusable playbook for all future subjects.

FIRe (Fractional Implicit Repetition) is one of the platform's most powerful features — Math Academy credits it with reducing explicit reviews to ~1 per topic on average. The SRS service already implements multi-hop credit traversal, upward penalty propagation, and greedy set-cover review compression. But with only 42 encompassing edges (and 24 topics with zero edges), the compression algorithm has limited material to work with.

**Current state:**
- 71 topics, 108 prerequisite edges, 42 encompassing edges
- 24 topics have NO encompassing edges (including foundational topics like count-to-10, place-value-tens-ones, intro-arrays)
- FIRe compression falls back to most-overdue ordering when density is too low
- No documented methodology for assigning fractional weights
- Cross-strand encompassings are underrepresented (e.g., word problems encompassing computation skills)

**Research basis:** `docs/learning-science.md` section 8 (FIRe), section 15 (Automaticity and Layering). Math Academy empirical result: most courses can be learned with roughly only one explicit review per topic on average when encompassing density is sufficient.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Audit & Relationship Identification
**Goal:** Systematically identify all valid encompassing relationships across the 71 topics. An advanced topic encompasses a simpler topic when practicing the advanced topic implicitly exercises the simpler skill.

1. [ ] [RSH] Analyze the graph by strand (addition, subtraction, multiplication, division, fractions, place value, geometry, measurement, data/graphs) and identify within-strand encompassing chains. Many within-strand chains already exist (e.g., add-within-20 -> add-within-10 -> add-within-5). Find gaps — e.g., `add-within-100-fluent` should encompass `add-within-10` (not just `add-within-20`), since 100-level addition still exercises single-digit addition skills.

2. [ ] [RSH] Identify cross-strand encompassing relationships. These are currently underrepresented and are where the most compression value lies. Examples:
   - **Word problems encompass computation:** `multiply-word-problems` encompasses `add-within-100-fluent` (checking answers requires addition), `division-word-problems` encompasses `subtract-within-100-fluent` (remainder checking)
   - **Fractions encompass whole-number operations:** `add-subtract-fractions` encompasses `add-within-20` (adding numerators), `multiply-fractions` encompasses `multiply-within-100` (multiplying numerators/denominators)
   - **Multi-step encompasses component operations:** `order-of-operations` encompasses `add-within-100-fluent`, `subtract-within-100-fluent`, `multiply-within-100`, `divide-within-100`
   - **Measurement encompasses computation:** `perimeter` encompasses `multiply-within-100` (rectangular perimeter), `area-multiply` encompasses `add-within-100-fluent`
   - **Place value encompasses counting:** `place-value-hundreds` encompasses `count-to-100`, `place-value-tens-ones` encompasses `count-to-20`

3. [ ] [RSH] Identify multi-hop depth opportunities. The SRS service supports multi-hop credit (2-3 hops with diminishing weight). Verify that chains are deep enough for multi-hop to engage. Example chain: `order-of-operations` -> `multi-digit-multiply` -> `multiply-within-100` -> `skip-count-2-5-10`. Credit should flow 3 hops from order-of-operations all the way to skip-counting.

4. [ ] [RSH] Address the 24 zero-edge topics specifically. For each, determine:
   - **Root topics** (count-to-10, count-to-20, shapes-2d-k, shapes-3d-k, measure-length-nonstandard, bar-graphs-picture-graphs): These are leaf nodes — they ARE encompassed by others but don't encompass anything. Ensure at least one parent topic has an encompassing edge pointing to them.
   - **Mid-graph topics** (place-value-tens-ones, intro-arrays, properties-of-multiplication, factors-multiples, fractions-number-line, place-value-hundreds, place-value-rounding, odd-even): These should both encompass children and be encompassed by parents. These are the biggest gaps.
   - **Isolated strands** (money-coins-bills, coordinate-plane, line-symmetry, line-plots): Topics with few connections to the main computation strands. Identify any valid encompassings or accept they have limited FIRe value.

**Validation:** A complete list of proposed encompassing edges with rationale, organized by strand and cross-strand category. Target: 40+ new edges identified (bringing total from 42 to 80+).

---

## Phase 2: Weight Calibration & Edge Creation
**Goal:** Assign fractional weights to all identified edges using a documented rubric, update graph.json, validate integrity, and import.

1. [ ] [IMP] Apply weight assignment rubric to all identified edges:

   | Weight Range | Meaning | Examples |
   |---|---|---|
   | **0.8-1.0** | Advanced topic exercises the simpler skill nearly identically. The simpler skill IS the core of the advanced task, just with harder numbers or more steps. | `add-within-20` encompasses `add-within-10` (0.8): same operation, bigger numbers |
   | **0.5-0.7** | Simpler skill is a core component exercised every time. Student must use the simpler skill to complete the advanced task, but other skills are also required. | `multiply-word-problems` encompasses `multiply-within-100` (0.6): must multiply, but also read/interpret |
   | **0.3-0.4** | Simpler skill is exercised incidentally — not the focus, but it happens. | `order-of-operations` encompasses `add-within-100-fluent` (0.3): addition happens but isn't the point |
   | **0.1-0.2** | Tangential exercise — the skill is used but barely. | Generally not worth an edge — skip. |

   Within-strand edges tend toward higher weights (0.6-0.8). Cross-strand edges tend toward lower weights (0.3-0.5). Word-problem edges are typically 0.4-0.6 (the computation is exercised but reading/interpretation is the main skill).

2. [ ] [IMP] Update `content/math-foundations/graph.json` with all new encompassing edges. Maintain the existing edges — only add new ones. Run `just validate-content` to ensure DAG integrity (no cycles introduced through encompassings, all referenced topic IDs exist). Run `just import-content` to load into local D1.

3. [ ] [TST] Verify graph integrity: `just validate-content` passes. Spot-check 10 edges manually — does the weight feel right? Does the parent topic genuinely exercise the child skill at the assigned fraction? Count total edges and verify target met (80+).

**Validation:** graph.json updated with 80+ encompassing edges. Validation passes. Import succeeds. Weights follow the documented rubric.

---

## Phase 3: FIRe Compression Validation
**Goal:** Prove that enriched encompassings measurably improve review compression and that multi-hop credit flows correctly through the enriched graph.

1. [ ] [TST] Write a test in `packages/api/src/__tests__/services/fire-compression.test.ts` that:
   - Seeds 20+ topics as "due for review" in user_topic_state
   - Calls `srs.compressReviews()` with the OLD encompassing set (42 edges) and measures compression ratio (selected reviews / due topics)
   - Calls `srs.compressReviews()` with the NEW encompassing set (80+ edges) and measures compression ratio
   - Asserts the new ratio is meaningfully better (e.g., old: 15/20 selected, new: 10/20 selected)
   - Verifies that the selected reviews' FIRe coverage actually covers the skipped topics (no gaps)

2. [ ] [TST] Write a test for multi-hop credit flow:
   - Practice `order-of-operations` (a high-level topic with deep encompassing chains)
   - Verify credit flows to `multi-digit-multiply` (hop 1), `multiply-within-100` (hop 2), `skip-count-2-5-10` (hop 3)
   - Verify credit diminishes appropriately at each hop (weight * parent_weight at each level)
   - Verify upward penalty also flows: fail `add-within-10` -> penalty to `add-within-20`, `add-within-100`, `add-within-1000`

3. [ ] [TST] Write a test for cross-strand coverage:
   - Mark computation topics (add, subtract, multiply) and word-problem topics as due
   - Verify that reviewing word-problem topics covers some computation topics via encompassing edges
   - This is the key cross-strand value: a single word-problem review session implicitly refreshes multiple computation skills

**Validation:** Tests pass. Compression ratio improves measurably with enriched graph. Multi-hop credit flows at least 3 hops deep. Cross-strand encompassings provide meaningful coverage.

---

## Phase 4: Methodology Documentation
**Goal:** Document the encompassing design methodology as a reusable playbook for all future subjects.

1. [ ] [DOC] Add "Encompassing Relationships" section to `docs/content-system.md` covering:
   - **What is an encompassing relationship?** When topic A implicitly exercises topic B during practice. Distinct from prerequisites (which are about sequencing, not implicit practice).
   - **How to identify encompassings:** Within-strand (same operation at different complexity levels), cross-strand (word problems encompass computation, multi-step encompasses component operations), measurement/application encompasses computation.
   - **Weight assignment rubric:** The table from Phase 2 step 1, with examples from each weight range.
   - **Common patterns by discipline:**
     - Mastery-gated (math): Dense within-strand chains + cross-strand computation links. Target: 1.0-1.5 encompassing edges per topic.
     - Context-layered (history): Sparser — "Causes of Civil War" encompasses "Slavery in America" (~0.4) because understanding causes exercises knowledge of the institution. Target: 0.5-1.0 edges per topic.
     - Flexible (vocabulary): Minimal — root words encompass derived words (~0.3). Target: 0.3-0.5 edges per topic.
   - **Validation checklist:** After adding encompassings to a new subject, verify: DAG integrity, all leaf topics are encompassed by at least one parent, multi-hop chains exist for deep graph regions, compression ratio is meaningful (test).
   - **Anti-patterns:** Don't add encompassings where the exercise is too indirect (reading a word problem doesn't encompass phonics). Don't inflate weights to game compression — inaccurate weights mean inaccurate FIRe credit, which means students think they've reviewed when they haven't.

2. [ ] [DOC] Add a DECISIONS.md entry recording: "Encompassing enrichment methodology: weight rubric, cross-strand patterns, target density per discipline type. Enriched math-foundations from 42 to N edges with measured FIRe compression improvement."

**Validation:** Content system docs include encompassing methodology section. Future subject graph designers have a clear rubric and checklist. DECISIONS.md records the enrichment rationale and outcome.
