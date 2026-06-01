# Plan 033: Self-Directed Scope + Primary Guided Mode

> **Created:** 2026-05-31
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Re-scope the current MathAcademy-style learning workflow as a self-directed experience for roughly grade 4+ learners, and treat K-3 as guided/co-piloted until a dedicated primary learner mode exists. Immediate work focuses on preventing confusing sessions: keep `/learn` scoped to the selected discipline, hide or label K-3 topics from self-directed queues, remove primary self-explanation prompts, clean up raw lesson rendering, and audit early content for independent-readiness.

## Reference

Math Academy's public course catalog sets its lowest entry point at 4th Grade Math and describes that entry point as appropriate for students who know multiplication tables through the 12s and can read independently. That is a useful external benchmark: a queue-driven mastery workflow likely starts working around grade 4, not kindergarten.

## Design Decisions

**Self-directed MVP starts at grade 4+.**
- The current queue/session/review/remediation workflow assumes independent reading and navigation.
- Grade 4+ math is the realistic near-term target for independent learner use.
- Grade 3 is transitional and should be treated cautiously.

**K-3 is guided/co-piloted.**
- K-3 content may remain in the graph/content system.
- K-3 should not be presented as fully self-directed until a primary guided mode exists.
- Parent/teacher/adult assistance should be explicit in the product surface.

**The mastery engine and learner surface are separate.**
- Graph, SRS, diagnostic, XP, and content delivery can stay shared.
- The learner UI, content renderer, activity type, and navigation model must vary by developmental band.

## Immediate Improvements

### Phase 1: Stop Confusing Self-Directed Sessions
**Goal:** Make the current `/learn` flow coherent for self-directed learners.

1. [ ] [IMP] Scope queue-launched `/learn` sessions by `disciplineId` so an ELA session does not auto-advance into math.
2. [ ] [IMP] Preserve `disciplineId` when auto-starting the next pull-based session after a topic completes.
3. [ ] [TST] Add API tests for `getNextItem(userId, disciplineId)` returning reviews/frontier topics only from that discipline.
4. [ ] [TST] Add route/component coverage for queue start preserving selected discipline.
5. [ ] [UX] If `/learn` has an active session from another discipline than the route scope, show a clear choice: continue active session or return to queue.

**Validation:** Starting an ELA topic from Study keeps all auto-pulled topics in ELA until the ELA queue is exhausted.

### Phase 2: Gate K-3 From Self-Directed Queue
**Goal:** Avoid presenting K-3 content as independently navigable in the current workflow.

1. [ ] [IMP] Add a self-directed eligibility helper based on discipline/topic metadata, initially `gradeLevel >= 4` for math.
2. [ ] [IMP] Filter self-directed Study Queue by eligibility by default.
3. [ ] [UX] Add a guided/parent-required label or separate section for K-3 topics if exposed.
4. [ ] [UX] Add copy explaining that early elementary topics require guided mode/adult support.
5. [ ] [CFG] Keep admin/explore views able to see all content so K-3 development is not hidden from operators.

**Validation:** A normal learner queue does not surface K-3 math/ELA as standard self-directed lessons.

### Phase 3: Primary Content Safety Fixes
**Goal:** Remove the most jarring mismatches in existing primary content.

1. [ ] [IMP] Suppress self-explanation prompts for `presentation: "primary"` worked examples.
2. [ ] [IMP] Render basic inline markdown in lesson text so `**bold**` does not leak into the UI.
3. [ ] [IMP] Prefer tap/multiple-choice/matching-compatible problem types for primary content where available.
4. [ ] [AUD] Audit K-3 math and early ELA examples for "can a non-reader use this without adult help?"
5. [ ] [AUD] Flag worked examples with `work` values like `(missing!)`, raw equations, or meta labels that are not learner-facing.

**Validation:** Primary examples show direct explanation/next-step flow and avoid asking students to explain trivial recognition steps.

### Phase 4: Define Primary Guided Mode
**Goal:** Specify the product surface needed before claiming K-3 independent support.

1. [ ] [DOC] Write `docs/primary-guided-mode.md` describing the K-3 learner flow: listen/watch -> try -> feedback -> next.
2. [ ] [DOC] Define primary activity constraints: audio-first, no hidden queue mechanics, no abstract remediation labels, minimal typing.
3. [ ] [DOC] Define content requirements for K-3: narrated mini-lessons, manipulatives/visuals, tap/drag/speech activities, adult handoff points.
4. [ ] [DOC] Define how primary guided mode maps onto the shared mastery engine and XP system.
5. [ ] [PLN] Create a follow-up implementation plan for the guided-mode UI once this specification is accepted.

**Validation:** The team has a concrete implementation spec for K-3 guided/co-piloted learning.

## Non-Goals

- Do not remove K-3 topics from the graph.
- Do not abandon K-8 content coverage as a long-term ambition.
- Do not build the full primary guided UI in this plan unless explicitly expanded.
- Do not make videos mandatory for grade 4+ self-directed MVP.

## Success Criteria

- Current self-directed learner flow is coherent and discipline-scoped.
- Grade 4+ math becomes the explicit self-directed MVP target.
- K-3 topics are not accidentally presented as standard independent sessions.
- Primary content no longer triggers self-explanation prompts or raw markdown leakage.
- A concrete guided-mode spec exists for future K-3 work.
