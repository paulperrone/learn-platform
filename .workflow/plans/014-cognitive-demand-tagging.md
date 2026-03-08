# Plan: Cognitive Demand Tagging

> **Created:** 2026-03-08T00:52:40Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Add a `cognitive_demand` dimension to assessment content with developmentally-appropriate mixing. Demand distribution adapts to the learner's presentation level — younger/earlier learners get mostly procedural + application, while older/advanced learners get the full spectrum including reasoning and error analysis. Content generation targets for each demand vary by topic grade level.

**The "one-note" problem:** Within a single mastery-gated topic, all problems tend to test the same cognitive mode (usually procedural computation). The session structure varies (pretest vs guided vs independent), but the cognitive demand doesn't. This makes sessions feel repetitive even when the engine is doing sophisticated things under the hood.

**The solution:** Tag each assessment problem with its cognitive demand type and have the session service mix demands based on the learner's presentation level. Younger learners get simpler demand profiles; older learners get the full spectrum.

**Cognitive demand types:**

| Demand | What it tests | Example ("Add Within 20") |
|---|---|---|
| `procedural` | Can you execute the procedure? | "Compute 7 + 8" |
| `application` | Can you apply it in context? | "Sara has 7 stickers, gets 8 more. How many?" |
| `conceptual` | Do you understand the underlying property? | "Why does 7 + 8 = 8 + 7?" |
| `reasoning` | Can you reason about it without computing? | "Without computing: is 7+8 or 6+9 bigger? Explain." |
| `error_analysis` | Can you diagnose mistakes? | "Alex says 7+8 = 14. What went wrong?" |

**Demand distribution by presentation level:**

| | Primary (K-2) | Intermediate (3-5) | Standard (6-8) | Advanced (9+) |
|---|---|---|---|---|
| **Available demands** | procedural, application | + conceptual | + reasoning | + error_analysis |
| **Weighting** | 60% proc, 40% app | 45% proc, 30% app, 25% concept | 35% proc, 25% app, 25% concept, 15% reasoning | 25/20/20/20/15 |

Each presentation level introduces one new demand type and redistributes weights. The progression:
- **Primary:** Can you do it? Can you use it?
- **Intermediate:** Can you explain it?
- **Standard:** Can you reason about it?
- **Advanced:** Can you diagnose mistakes?

**Research basis:** `docs/learning-science.md` sections 2 (cognitive load — demand must match developmental stage), 5 (worked examples and scaffolding — fading cognitive support), 6 (active learning and retrieval practice — varied practice improves transfer), 9 (interleaving — mixing problem types improves retention), 18 (assessment design — the 85% rule requires calibrated difficulty AND demand variety).

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Schema & Migration
**Goal:** Add `cognitive_demand` column to `assessment_content` table with backward-compatible nullable field.

1. [ ] [IMP] Add `cognitiveDemand` field to the `assessmentContent` table in `packages/api/src/db/schema.ts`:
   ```
   cognitiveDemand: text("cognitive_demand")  // nullable for backward compat
   ```
   Valid values: `procedural`, `conceptual`, `application`, `reasoning`, `error_analysis`. Nullable — existing content without a tag is treated as `procedural` by the session service (safe default since most existing problems ARE procedural).

2. [ ] [IMP] Generate and apply Drizzle migration. Since this is a nullable column with no DEFAULT, SQLite `ALTER TABLE ADD COLUMN` will work without manual SQL editing. Run `just db-generate` and `just db-migrate`.

3. [ ] [IMP] Update shared types in `packages/shared/src/types.ts`:
   - Add `CognitiveDemand` type: `'procedural' | 'conceptual' | 'application' | 'reasoning' | 'error_analysis'`
   - Add `cognitiveDemand?: CognitiveDemand` to the `Problem` type (or equivalent assessment content type)
   - Add `DemandDistribution` type mapping `CognitiveDemand` to weight percentages
   - Add `DEMAND_PROFILES` constant defining the four presentation-level distributions

**Validation:** Migration applies cleanly. `just typecheck` passes. Existing content and tests work unchanged (nullable column, no behavioral change yet).

---

## Phase 2: Tag Existing Content
**Goal:** Classify all 355 existing math-foundations problems by cognitive demand and update the content JSON files.

1. [ ] [IMP] Build `tools/tag-cognitive-demand.ts` script that:
   - Reads each problem JSON file in `content/math-foundations/problems/`
   - For each problem, classifies its cognitive demand using one of:
     - **Rule-based first pass:** Problems with "compute", "solve", "find", "what is X + Y" → `procedural`. Problems with word problem framing (names, scenarios, "how many") → `application`. Problems with "explain", "why" → `conceptual`. Problems with "without computing", "which is bigger", "compare" → `reasoning`. Problems with "what went wrong", "find the mistake" → `error_analysis`.
     - **LLM fallback:** For ambiguous cases, use a cheap LLM call with the 5 definitions and the problem text to classify.
   - Writes the `cognitiveDemand` field into each problem's JSON
   - Outputs a summary: count per demand type, count per grade level x demand type

2. [ ] [VAL] Review the tagging results. Spot-check 20-30 problems across grade levels. Verify:
   - G0-1 problems are mostly `procedural` and `application` (word problems exist at this level)
   - G3-5 problems include some `conceptual` where properties/explanations are asked
   - No obvious misclassifications
   - Adjust rule-based patterns if needed, re-run

3. [ ] [IMP] Update `tools/import-content.ts` to read `cognitiveDemand` from problem JSON and write to the `cognitive_demand` column on import. Run `just import-content` to load tagged content. Verify with a spot-check query: `SELECT cognitive_demand, COUNT(*) FROM assessment_content GROUP BY cognitive_demand`.

**Validation:** All 355 problems tagged. Distribution makes sense (majority procedural for G0-1, increasing diversity at higher grades). Import populates the column. Spot-check passes.

---

## Phase 3: Demand-Aware Session Mixing
**Goal:** Update the session service to select problems with cognitive demand variety, weighted by the learner's presentation level.

1. [ ] [IMP] Add a `getDemandProfile(presentation: PresentationLevel): DemandDistribution` function that returns the weight distribution for the learner's presentation level:
   - `primary`: `{ procedural: 0.60, application: 0.40 }`
   - `intermediate`: `{ procedural: 0.45, application: 0.30, conceptual: 0.25 }`
   - `standard`: `{ procedural: 0.35, application: 0.25, conceptual: 0.25, reasoning: 0.15 }`
   - `advanced`: `{ procedural: 0.25, application: 0.20, conceptual: 0.20, reasoning: 0.20, error_analysis: 0.15 }`

2. [ ] [IMP] Update `selectProblem` in `packages/api/src/services/session.ts` to incorporate demand mixing:
   - Accept optional `demandProfile` and `recentDemands` parameters
   - When a demand profile is provided and the problem pool has multiple demand types:
     - Compute which demand type is most "underrepresented" given recent demands vs target weights
     - Prefer problems of the underrepresented demand type (soft preference, not hard filter)
     - Never fail to return a problem because a specific demand isn't available — always fall back to any available problem
   - When problems lack `cognitiveDemand` tags (null), treat them as `procedural`
   - Track which demands have been served in the session state (`recentDemands: CognitiveDemand[]`)

3. [ ] [IMP] Wire demand mixing into each session phase with phase-appropriate behavior:
   - **Pretest:** Always `procedural` or `application` — quick diagnostic check, not the place for "explain why"
   - **Instruction:** N/A (worked examples, not assessment)
   - **Guided:** Favor `conceptual` when available — this is where "why does this work?" prompts pair with self-explanation. Fall back to `procedural` if no conceptual problems exist for this topic.
   - **Independent:** Full demand mixing per the learner's profile — this is the primary mixing phase
   - **Review:** Favor `procedural` and `application` — retrieval practice is about recall, not deep reasoning
   - **Remediation:** Always `procedural` — student is struggling, reduce cognitive load

4. [ ] [TST] Write tests in `packages/api/src/__tests__/services/cognitive-demand.test.ts`:
   - Seed a topic with problems tagged across all 5 demand types
   - Verify `selectProblem` with `primary` profile only returns procedural/application
   - Verify `selectProblem` with `advanced` profile returns all 5 types over multiple selections
   - Verify demand variety: 10 consecutive selections don't produce 10 of the same demand
   - Verify graceful fallback: topic with only `procedural` problems still works at all presentation levels
   - Verify phase-appropriate behavior: pretest selects procedural/application regardless of profile
   - Verify null `cognitiveDemand` treated as procedural

**Validation:** Tests pass. A primary-level learner doing independent practice sees procedural + application only. An advanced-level learner sees all five demand types over the course of a session. No regression in existing session tests.

---

## Phase 4: Content Generation Guidance & Validation
**Goal:** Document cognitive demand targets by grade level so future content generation produces appropriate diversity. Update validation to catch gaps.

1. [ ] [DOC] Add "Cognitive Demand" section to `docs/content-system.md` covering:
   - **Definition of each demand type** with examples at multiple grade levels (not just G1 "Add Within 20" — include G3 fractions and G5 algebra examples)
   - **Generation targets by topic grade level:**
     - G0-1: Generate `procedural` (60%) + `application` (40%) only. Conceptual/reasoning/error_analysis are developmentally inappropriate at this level.
     - G2-3: Generate `procedural` (40%) + `application` (30%) + `conceptual` (30%). Conceptual questions at this level are concrete: "Show two different ways to make 15" or "Is 3+4 the same as 4+3? Why?"
     - G4-5: Generate all five types. `procedural` (30%) + `application` (20%) + `conceptual` (20%) + `reasoning` (20%) + `error_analysis` (10%). Reasoning and error analysis become meaningful at this level.
   - **Relationship to presentation level:** Content is generated with demands appropriate to the topic's grade level. The session service then selects from available demands based on the learner's presentation level. A precocious 8-year-old at standard presentation on a G2 topic will get conceptual questions (because they exist for G2) but not reasoning (because G2 content doesn't have reasoning problems).
   - **Not every topic needs all demands:** Some topics are inherently procedural (basic counting). The system handles this gracefully. Don't force unnatural demands.

2. [ ] [IMP] Update `tools/validate-content.ts` to check cognitive demand coverage:
   - For G0-1 topics: warn if no `application` problems exist (word problems should exist even for early topics)
   - For G2-3 topics: warn if no `conceptual` problems exist
   - For G4-5 topics: warn if fewer than 3 demand types are represented
   - These are warnings, not errors — some topics legitimately have limited demand diversity

3. [ ] [DOC] Add DECISIONS.md entry: "Cognitive demand tagging: demand types, presentation-level distribution profiles, grade-level generation targets. Demand mixing prevents one-note sessions while respecting developmental appropriateness."

**Validation:** Content system docs include demand section with grade-level examples. Validation script runs and produces sensible warnings for existing content. DECISIONS.md updated. Future content generation prompts can reference the documented targets.
