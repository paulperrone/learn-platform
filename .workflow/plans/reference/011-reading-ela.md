# Plan: Reading & ELA Subject (Deferred)

> **Created:** 2026-03-04T23:26:01Z
> **Updated:** 2026-03-05T20:00:00Z
> **Completed:** —
> **Status:** Deferred — math-first. Revisit when 007/008 content model and pipeline are proven.
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

First non-math subject — Reading/ELA for K-5. Validates multi-subject scalability of the three-layer content model (007 Phase 1) and generation pipeline (008). Introduces new content types (passages, comprehension questions) and rubric-based assessment beyond binary right/wrong. Covers phonics, vocabulary, reading comprehension, and basic writing skills aligned to Common Core ELA standards.

**Depends on:**
- Plan 007 Phase 1 (three-layer content model — `instructional_content` and `assessment_content` tables)
- Plan 007 Phase 2 (diverse question types — components and grading for non-text-qa types)
- Plan 008 Phases 3-4 (generation pipeline and review workflow — reading content generated through the same pipeline)

**Key difference from math:** Reading assessment is often non-binary (comprehension is partial, not right/wrong). This requires rubric-based scoring mapped to FSRS ratings, and LLM grading with structured feedback. This is the main novel platform work — everything else reuses existing infrastructure.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1 (after 007/008 prerequisites are proven with math)

---

## Phase 1: Reading Knowledge Graph
**Goal:** K-5 ELA topic graph aligned to Common Core. Graph nodes go into the `topics` table (source of truth) with a new subject.

1. [ ] [RSH] Map Common Core ELA K-5 standards to atomic learning topics: phonemic awareness, phonics, fluency, vocabulary, comprehension strategies, writing conventions. Identify prerequisite and encompassing relationships.

2. [ ] [IMP] Create `content/reading-k5/graph.json`: ~50-70 topics with prerequisite edges, grade-level alignment, subject='reading-k5'. Same schema as math-foundations graph — topics table is subject-agnostic.

3. [ ] [IMP] Parameterize import tools: update `tools/import-content.ts` to discover and import all subject directories under `content/`, not just math-foundations. Graph import writes to same `topics` table with subject field distinguishing them.

4. [ ] [VAL] Run `tools/validate-graph.ts` against reading graph: no cycles, all prerequisites valid, depths assigned. Run against both graphs together to confirm cross-subject isolation.

5. [ ] [TST] Verify: reading graph imports alongside math graph. Subjects API returns both. Topic counts correct. No cross-subject prerequisite leakage.

**Validation:** Reading knowledge graph has 50-70 validated topics. Imports cleanly alongside math in the same `topics` table. Graph tooling is now subject-agnostic.

---

## Phase 2: Reading Content Types & Schema
**Goal:** Define reading-specific content types that fit within the existing `instructional_content` and `assessment_content` tables from 007 Phase 1.

1. [ ] [RSH] Design reading content types within the existing schema. Instructional content: reading strategy lessons stored in `stepsJson` (e.g., "how to find the main idea" as step-by-step strategy demonstration). Assessment content: new `type` values — 'passage-comprehension' (passage + questions), 'vocabulary-context' (word in context), 'text-evidence' (select supporting text). `typeProperties` stores passage text, question sub-type (literal, inferential, vocabulary, author's purpose), and rubric criteria.

2. [ ] [IMP] Add reading-specific assessment type values and `typeProperties` schemas. Passage stored in `typeProperties` (shared across multiple questions for the same passage). Build corresponding Vue components for each type, following 007 Phase 2's pattern (dynamic component selection in ProblemView).

3. [ ] [IMP] Build passage reader component: formatted text display, adjustable font size, line spacing for readability. Renders from `typeProperties.passage` in assessment content. Integrated into ProblemView when assessment type is passage-based.

4. [ ] [TST] Verify: reading content types store and retrieve from existing tables. Passage reader renders. New question type components work in ProblemView.

**Validation:** Reading content fits within the three-layer content model without schema changes. New question types render alongside math types.

---

## Phase 3: Rubric-Based Assessment & FSRS Integration
**Goal:** Grading system that handles non-binary correctness. The main novel platform work for reading.

1. [ ] [RSH] Design rubric-based scoring model: how to represent partial credit in FSRS (map rubric scores 1-4 to FSRS ratings), how LLM grading produces rubric scores with dimension-level feedback (literal comprehension, inference, vocabulary, text evidence).

2. [ ] [IMP] Extend gradeResponse in LLM service: rubric-aware grading prompts for reading comprehension. Return structured result: overall score (1-4), per-dimension scores, specific feedback per dimension. Prompt template composable with existing grading infrastructure.

3. [ ] [IMP] Update FSRS integration: map rubric scores to FSRS ratings (1=Again, 2=Hard, 3=Good, 4=Easy or similar). Handle partial mastery in topic state. Adjust scheduling based on comprehension depth. Math's binary grading continues to work unchanged.

4. [ ] [TST] Verify: reading questions graded on rubric. Partial credit affects SRS scheduling. Feedback is constructive and dimension-specific. Math grading unaffected.

**Validation:** Reading comprehension gets rubric scores with specific feedback. FSRS adapts to partial credit. Students see where comprehension falls short.

---

## Phase 4: Content Generation via Pipeline
**Goal:** Generate reading content using 008's pipeline. Not a bespoke process — reading is the first non-math subject flowing through the existing generation and review workflow.

1. [ ] [IMP] Create reading-specific prompt templates for 008's composable template system: passage generation (age-appropriate, varied genres, controlled word count), comprehension question generation (multiple types per passage), vocabulary exercise generation, reading strategy worked examples.

2. [ ] [IMP] Queue generation jobs for all reading topics via 008's pipeline: instructional content (reading strategy lessons, classic flavor, en locale) + assessment content (passage-comprehension, vocabulary-context, text-evidence types). Target 15-30 assessment items per topic.

3. [ ] [IMP] Extend 008's AI content reviewer with reading-specific validation: grade-level readability scoring (Flesch-Kincaid), passage length appropriate for grade, comprehension questions actually answerable from the passage, vocabulary words appear in context.

4. [ ] [VAL] Review generated content through 008's admin review workflow. Import approved content.

5. [ ] [TST] Verify: reading content generates through existing pipeline. AI reviewer catches reading-specific issues. Content appears in content matrix. Full learning session works end-to-end.

**Validation:** Reading content generated, reviewed, and imported through the same pipeline as math. Content matrix shows reading coverage. No bespoke tooling needed.

---

## Phase 5: Frontend Integration & Subject Selection
**Goal:** Multi-subject UI. Students can switch between math and reading.

1. [ ] [IMP] Add subject selector: dashboard shows available subjects (Math, Reading). Subject filter on progress page. Explore page shows both knowledge graphs. Graph explorer (`/graph`) supports subject switching.

2. [ ] [IMP] Full reading learning session: select reading topic -> pretest (passage-comprehension) -> instruction (reading strategy lesson) -> guided practice -> independent practice -> review. Same learning loop phases as math, different content types.

3. [ ] [IMP] Progress tracking across subjects: dashboard shows per-subject mastery counts. Progress page filters by subject. Contribution graph (013) and streaks count activity across all subjects.

4. [ ] [TST] Verify: full reading session end-to-end. Subject switching on all pages. Progress tracked per-subject. Teach mode works with reading topics.

**Validation:** Complete reading learning flow works alongside math. Dashboard, progress, explore, and teach mode handle multiple subjects.
