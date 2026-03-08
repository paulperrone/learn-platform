# Plan: Encompassing Graph Enrichment & FIRe Methodology

> **Created:** 2026-03-08T00:42:10Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Audit the 71-topic math-foundations knowledge graph, identify missing encompassing relationships, assign calibrated fractional weights, validate that FIRe review compression meaningfully improves, and document the weight assignment methodology as a reusable playbook for all future subjects.

FIRe (Fractional Implicit Repetition) is one of the platform's most powerful features — Math Academy credits it with reducing explicit reviews to ~1 per topic on average. The SRS service already implements multi-hop credit traversal, upward penalty propagation, and greedy set-cover review compression.

**Research basis:** `docs/learning-science.md` section 8 (FIRe), section 15 (Automaticity and Layering). Math Academy empirical result: most courses can be learned with roughly only one explicit review per topic on average when encompassing density is sufficient.

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓, Phase 4 ✓, Phase 5 ✓
**In Progress:** —
**Next:** All phases complete

### Phase 1-2 Results (completed 2026-03-07)

Starting state: 71 topics, 108 prerequisite edges, 42 encompassing edges. 24 topics had zero encompassing edges.

**What was done:** Systematically analyzed all 71 topics across 14 strands (counting, addition, subtraction, multiplication, division, fractions, decimals, place-value, geometry, measurement, time-money, data, algebra, add-sub, word-problems). Added 91 new encompassing edges.

**Final state:**
- **133 encompassing edges** (42 original + 91 new)
- **1.9 encompassing edges per topic** (exceeds 1.0-1.5 target for mastery-gated disciplines)
- **70 of 71 topics** now have at least one encompassing edge (`shapes-3d-k` is genuinely isolated — 3D shapes at K level has no valid encompassing relationship)
- **Weight distribution:** 68 edges at 0.3-0.4, 46 at 0.5-0.6, 17 at 0.7-0.8, 2 at 0.9-1.0
- **Multi-hop chains verified:** 3-4 hops deep with meaningful weight propagation (e.g., `variables-expressions` → `order-of-operations` → `multi-digit-multiply` → `multiply-within-100` → `skip-count-2-5-10`, cumulative weight 0.058)
- `just validate-content` passes (0 errors, DAG intact)
- Committed as `a7c6c79`

**Edge categories added:**
- Within-strand transitive chains: addition (6), subtraction (4), multiplication (2), division (3), fractions (9), decimals (4), place value (5), counting (4)
- Cross-strand: word-problems→computation (8), measurement→arithmetic (4), order-of-operations→all-four-ops (4), algebra→computation (3), place-value→counting (4), comparison (2), arrays (2), factors (2), properties (2), patterns (2), money (2), coordinate (2), geometry (3), data (4), time (2), measurement-chain (3), odd-even (2), fractions-number-line (1)

**Weight rubric applied (from Phase 2 step 1 — this must be documented in Phase 4):**

| Weight Range | Meaning | Examples |
|---|---|---|
| **0.8-1.0** | Advanced topic exercises the simpler skill nearly identically | `count-to-20` → `count-to-10` (0.8), `add-within-20` → `add-within-5` (0.9) |
| **0.5-0.7** | Simpler skill is a core component exercised every time | `place-value-hundreds` → `place-value-tens-ones` (0.7), `factors-multiples` → `multiply-within-100` (0.5) |
| **0.3-0.4** | Simpler skill is exercised incidentally | `order-of-operations` → `add-within-100-fluent` (0.3), `money-coins-bills` → `skip-count-2-5-10` (0.4) |
| **0.1-0.2** | Too tangential — edges at this weight were not created |

**Heuristic used:** Within-strand edges tend 0.6-0.8. Cross-strand edges tend 0.3-0.5. Word-problem edges typically 0.4-0.6.

---

## Phase 1: Audit & Relationship Identification ✓
**Goal:** Systematically identify all valid encompassing relationships across the 71 topics.

1. [x] [RSH] Analyze the graph by strand and identify within-strand encompassing chains and gaps.
2. [x] [RSH] Identify cross-strand encompassing relationships (word problems→computation, fractions→whole-number ops, measurement→arithmetic, place-value→counting).
3. [x] [RSH] Identify multi-hop depth opportunities — verified chains 3-4 hops deep.
4. [x] [RSH] Address the 24 zero-edge topics — reduced to 1 (`shapes-3d-k`, genuinely isolated).

---

## Phase 2: Weight Calibration & Edge Creation ✓
**Goal:** Assign fractional weights, update graph.json, validate integrity.

1. [x] [IMP] Apply weight assignment rubric to all 91 identified edges.
2. [x] [IMP] Update `content/math-foundations/graph.json` — 133 total encompassing edges. `just validate-content` passes.
3. [x] [TST] Verify graph integrity — spot-checked 10 random edges, all weights appropriate for their category.

---

## Phase 3: FIRe Compression Validation ✓
**Goal:** Prove that enriched encompassings measurably improve review compression and that multi-hop credit flows correctly.

**Key context for implementation:**
- The SRS service lives at `packages/api/src/services/srs.ts` — look for `compressReviews()`, `applyFIReCredit()`, and multi-hop traversal logic
- Encompassings are loaded from the graph service at `packages/api/src/services/graph.ts`
- Existing SRS tests are in `packages/api/src/__tests__/services/` — follow the same patterns
- Use `just test` (never `pnpm vitest run` directly — Workers pool tests need `@cloudflare/vitest-pool-workers`)
- Use helpers from `packages/api/src/__tests__/helpers.ts` for DB setup and seeding
- The graph data is in `content/math-foundations/graph.json` — the test can load this directly or seed a subset

**Steps:**

1. [x] [TST] Write `packages/api/src/__tests__/services/fire-compression.test.ts`:
   - Read the SRS service to understand `compressReviews()` API signature and how it takes encompassing data
   - Seed 20+ topics as "due for review" in user_topic_state
   - Compare compression with a subset of encompassings (original 42) vs. full set (133)
   - Assert the new ratio is meaningfully better (fewer explicit reviews selected for same coverage)
   - Verify that the selected reviews' FIRe coverage actually covers the skipped topics

2. [x] [TST] Write a test for multi-hop credit flow:
   - Practice `order-of-operations` (has deep chains — see Phase 1-2 Results above)
   - Verify credit flows to `multi-digit-multiply` (hop 1, w=0.4), `multiply-within-100` (hop 2, w=0.6), `skip-count-2-5-10` (hop 3, w=0.4)
   - Verify credit diminishes: hop 1 = 0.4, hop 2 = 0.24, hop 3 = 0.096
   - Verify upward penalty: fail `add-within-10` → penalty to `add-within-20` (w=0.8), `add-within-100` (hop 2), `add-within-100-fluent` (hop 3)

3. [x] [TST] Write a test for cross-strand coverage:
   - Mark computation topics (add, subtract, multiply, divide within 100) and word-problem topics as due
   - Verify that reviewing `multi-step-word-problems` covers `add-within-100-fluent` (0.3), `subtract-within-100-fluent` (0.3), `multiply-within-100` (0.3), `divide-within-100` (0.3)
   - This is the key cross-strand value: one word-problem review implicitly refreshes four computation skills

**Validation:** `just test` passes. Compression ratio improves measurably. Multi-hop credit flows 3+ hops. Cross-strand encompassings provide meaningful coverage.

---

## Phase 4: Methodology Documentation ✓
**Goal:** Document the encompassing design methodology as a reusable playbook for all future subjects. This is critical — right now the weight rubric and identification strategies exist only in this plan file, not in any reusable documentation.

**Key context:**
- `docs/content-system.md` already documents topics, prerequisites, edge types, progression models, and content dimensions. It mentions encompassings exist (line ~57) but has NO section on how to design them.
- `docs/learning-science.md` section 8 explains the research basis for FIRe and why encompassings matter, but not how to create them.
- The gap: someone creating a new subject (e.g., physics, history) has no guidance on identifying encompassing edges, assigning weights, or validating coverage.
- The weight rubric, identification strategies, and density targets from Phase 1-2 (documented in the "Phase 1-2 Results" section above) must be formalized into `docs/content-system.md`.

**Steps:**

1. [x] [DOC] Add "Encompassing Relationships" section to `docs/content-system.md` (after the existing "Prerequisite Edge Types" section, around line 120). Cover:

   - **Definition:** When topic A implicitly exercises topic B during practice. Distinct from prerequisites (sequencing) — encompassings are about implicit practice credit.

   - **How to identify encompassings — three categories:**
     1. **Within-strand:** Same operation at increasing complexity. Every higher-level topic in a strand encompasses its predecessors (e.g., `add-within-100` encompasses `add-within-20`, which encompasses `add-within-10`). These form chains.
     2. **Cross-strand:** Topic in one strand exercises skills from another. Word problems encompass computation. Multi-step encompasses component operations. Measurement/application encompasses arithmetic. Fractions encompass whole-number operations.
     3. **Application → foundation:** Any topic that requires using a simpler skill as a tool (not as the focus). Long division encompasses multiplication (checking quotients). Equivalent fractions encompass multiplication.

   - **Weight assignment rubric:** Copy the table from Phase 1-2 Results above. Add the heuristic: within-strand → 0.6-0.8, cross-strand → 0.3-0.5, word-problems → 0.4-0.6. Never create edges below 0.3 (too indirect to provide meaningful FIRe credit).

   - **Target density by discipline:**
     - Mastery-gated (math, CS): 1.0-2.0 edges per topic. Dense within-strand chains + cross-strand links.
     - Context-layered (history, philosophy): 0.5-1.0 edges per topic. "Causes of Civil War" encompasses "Slavery in America" (~0.4).
     - Flexible (vocabulary, geography): 0.3-0.5 edges per topic. Root words encompass derived words (~0.3).

   - **Validation checklist (run after adding encompassings to any subject):**
     1. `just validate-content` passes (DAG integrity, all topic IDs valid)
     2. Every leaf topic (no children in prereq graph) is encompassed by at least one parent
     3. Multi-hop chains exist for deep graph regions (3+ hops)
     4. Weight distribution is reasonable (mostly 0.3-0.6 with some 0.7-0.9 within-strand)
     5. `tools/visualize-graph.html` shows clear hierarchical structure (update the inline data when graph changes)
     6. FIRe compression test passes (Phase 3 test can be parameterized for new subjects)

   - **Anti-patterns:**
     - Don't add encompassings where exercise is too indirect (reading a word problem doesn't encompass phonics)
     - Don't inflate weights to game compression — inaccurate weights mean students think they've reviewed when they haven't
     - Don't create edges below 0.3 — the FIRe credit is negligible and adds graph complexity
     - Don't skip cross-strand edges — they provide the most compression value

2. [x] [DOC] Add DECISIONS.md entry: "Encompassing enrichment methodology established. Weight rubric (0.3-0.9 scale), three identification categories (within-strand, cross-strand, application→foundation), target density per discipline type. Math-foundations enriched from 42 to 133 edges with 1.9 edges/topic density. Methodology documented in docs/content-system.md for reuse across all future subjects."

**Validation:** `docs/content-system.md` has a complete encompassing methodology section. A developer creating a new subject graph can follow it end-to-end without needing to read this plan. DECISIONS.md records the methodology establishment.

---

## Phase 5: Remove Legacy OpenRouter Generation Scripts ✓
**Goal:** Remove the `tools/generate-*.ts` scripts that call OpenRouter for content generation. Content authoring happens in Claude Code sessions (see DECISIONS.md 2026-03-07). These scripts are dead code that will confuse future contributors.

**Key context:**
- `tools/generate-graph.ts` — generates graph.json via OpenRouter. Replaced by Claude Code graph design sessions.
- `tools/generate-problems.ts` — generates problems/*.json via OpenRouter. Replaced by Claude Code problem authoring.
- `tools/generate-examples.ts` — generates examples/*.json via OpenRouter. Replaced by Claude Code example authoring.
- `tools/generate-content-pack.ts` — bundles graph + problems + examples into content-pack.json. May still be useful for distribution; evaluate.
- The justfile has recipes `generate-problems` and `generate-examples` that invoke these scripts.
- `CLAUDE.md` already documents these as legacy (updated 2026-03-07).

**Steps:**

1. [x] [IMP] Remove `tools/generate-graph.ts`, `tools/generate-problems.ts`, `tools/generate-examples.ts`. Kept `tools/generate-content-pack.ts` — used by public API route for content export.

2. [x] [IMP] Removed `generate-problems` and `generate-examples` recipes from the justfile.

3. [x] [IMP] Checked — OpenRouter deps are used by runtime LLM service (llm.ts, openrouter-keys.ts). No deps to remove.

4. [x] [IMP] Updated `CLAUDE.md` — removed legacy caveats about `tools/generate-*.ts` scripts.

5. [x] [TST] `just validate` passes (0 errors). No functional references to removed scripts remain.

**Validation:** The `tools/` directory contains only validation, import, visualization, and export scripts — no generation scripts that call external LLMs. The content pipeline section in CLAUDE.md is clean with no legacy caveats.
