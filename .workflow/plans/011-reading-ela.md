# Epic: Reading & ELA Subject

> **Created:** 2026-03-04T23:26:01Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

First non-math subject — Reading/ELA for K-5. Validates the multi-subject content architecture. Introduces new content types (passages, comprehension questions) and assessment models beyond binary right/wrong. Covers phonics, vocabulary, reading comprehension, and basic writing skills aligned to Common Core ELA standards.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Content Architecture
**Goal:** Generalize content pipeline for non-math subjects

1. [ ] [IMP] Refactor content directory structure: `content/<subject>/` pattern with `graph.json`, `problems/`, `examples/` per subject. Move existing math content to `content/math-k5/` (already there).
2. [ ] [IMP] Define content schemas for reading-specific types: passage schema (text, grade level, word count, genre), comprehension question types (literal, inferential, vocabulary, author's purpose)
3. [ ] [IMP] Parameterize import tools: update `tools/import-content.ts` and `tools/export-sql.ts` to discover and import all subject packs, not just math-k5
4. [ ] [TST] Verify: import tool discovers `content/math-k5/` and any new subject directories, imports all. Existing math content unaffected.

**Validation:** Content pipeline supports multiple subject directories. Import tool is subject-agnostic. Math content continues to work unchanged.

---

## Phase 2: Reading Knowledge Graph
**Goal:** K-5 ELA topic graph aligned to Common Core

1. [ ] [RSH] Map Common Core ELA K-5 standards to atomic learning topics: phonemic awareness, phonics, fluency, vocabulary, comprehension strategies, writing conventions
2. [ ] [IMP] Create `content/reading-k5/graph.json`: ~50-70 topics with prerequisite edges, grade-level alignment, subject metadata
3. [ ] [VAL] Run `tools/validate-graph.ts` against reading graph: no cycles, all prerequisites valid, depths assigned correctly
4. [ ] [TST] Verify: reading graph imports alongside math graph, subjects API returns both subjects, topic counts are correct

**Validation:** Reading knowledge graph has 50-70 validated topics with proper prerequisite structure. Graph imports cleanly alongside math. No cycles, correct depth assignment.

---

## Phase 3: Content Generation
**Goal:** Problem banks and passages for all reading topics

1. [ ] [IMP] Create prompt templates for reading content: passage generation (age-appropriate, varied genres), comprehension question generation (multiple question types per passage), vocabulary exercise generation
2. [ ] [IMP] Generate reading passages and comprehension questions for all topics using content pipeline
3. [ ] [IMP] Generate worked examples as reading strategy demonstrations: "how to find the main idea", "how to use context clues for vocabulary", modeled as step-by-step strategies
4. [ ] [VAL] Run `tools/validate-content.ts` against reading content: all topics have problems and examples, passages are grade-appropriate

**Validation:** All reading topics have content banks. Passages are age-appropriate and varied. Comprehension questions cover multiple types. Strategy demonstrations model good reading practices.

---

## Phase 4: Assessment Model
**Goal:** Grading system that handles non-binary correctness

1. [ ] [RSH] Design rubric-based scoring model: how to represent partial credit in FSRS (map rubric scores to FSRS ratings), how LLM grading integrates with the scoring model
2. [ ] [IMP] Extend gradeResponse in LLM service: rubric-aware grading prompts for reading comprehension, return score on a scale (not just correct/incorrect), structured feedback on comprehension
3. [ ] [IMP] Update FSRS integration: map rubric scores (1-4) to FSRS ratings, handle partial mastery in topic state, adjust scheduling based on comprehension depth
4. [ ] [TST] Verify: reading questions are graded on a rubric, partial credit affects SRS scheduling appropriately, feedback is constructive and specific

**Validation:** Reading comprehension answers receive rubric scores with specific feedback. FSRS scheduling adapts to partial credit. Students see where their comprehension falls short (literal vs inferential).

---

## Phase 5: Frontend Integration
**Goal:** Reading-specific UI components and subject selection

1. [ ] [IMP] Build passage reader component: formatted text display, adjustable font size, line spacing for readability, highlight/annotation support
2. [ ] [IMP] Build comprehension question UI: display questions after passage reading, support multiple question types (multiple choice, short answer, text evidence selection)
3. [ ] [IMP] Add subject selector: dashboard shows available subjects (Math, Reading), subject filter on progress page, explore page shows both knowledge graphs
4. [ ] [TST] Verify: full reading learning session works end-to-end — select reading → pretest → read passage → answer comprehension questions → see progress. Subject switching works on all pages.

**Validation:** Complete reading learning flow works alongside math. Students can switch between subjects. Dashboard, progress, and explore pages handle multiple subjects correctly.
