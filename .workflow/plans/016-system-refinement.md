# Plan: System Refinement & Integration Gaps

> **Created:** 2026-03-08T18:34:18Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Closes the remaining system-level gaps identified in the March 7 review and Plan 015 audit. Wires activity recording into the session loop so engagement features actually work, adds mastery state to the explore pages for motivational feedback, hardens the anonymous→authenticated conversion funnel, and documents the graph design methodology and content iteration protocol needed before scaling to new subjects.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3
**In Progress:** —
**Next:** Phase 4

---

## Phase 1: Activity Auto-Recording ✓
**Goal:** Session responses and completions automatically feed the activity service — no manual client calls needed.

1. [x] [IMP] Import activity service into session service; call `recordProblemCompleted()` on each graded attempt in `respond()`
2. [x] [IMP] Accumulate `responseMs` per session and call `recordMinutes()` on `endSession()` (convert ms → minutes, round up)
3. [x] [IMP] Call `recordTopicMastered()` when session advances a topic to mastered state
4. [x] [IMP] Include goal/streak summary in session `respond()` return payload so frontend can show real-time progress
5. [x] [IMP] Update frontend learn.vue to display goal progress indicator during active sessions (problems completed, time spent)
6. [x] [TST] Integration test: full session loop → verify `dailyActivity` row has correct problemsCompleted, minutesActive, topicsMastered
7. [x] [TST] Test edge cases: midnight rollover mid-session, multiple sessions same day accumulate, session abandon (no endSession) still records per-response activity
8. [x] [VAL] Run `just test` — all existing tests still pass with activity wiring added

**Validation:** `dailyActivity` table populated automatically after a learning session with no manual API calls. Goal progress visible in session UI.

---

## Phase 2: Explore Mastery Visualization ✓
**Goal:** Authenticated users see their mastery state overlaid on the knowledge graph in the modern explore pages.

1. [x] [IMP] Add authenticated graph endpoint `GET /graph/:subjectId/user-state` that returns topic list merged with user's `userTopicState` (mastered, reps, status: notStarted/inProgress/mastered/locked)
2. [x] [IMP] Update `explore-subject.vue` to dual-load: public graph + user state (if authenticated); show mastery badges per topic (checkmark, progress dot, lock icon, frontier highlight)
3. [x] [IMP] Update `explore-topic.vue` to show user's state for the topic: mastery status, prerequisite completion, review schedule, next recommended action
4. [x] [IMP] Update `explore-index.vue` to show per-subject completion percentage and topic counts (mastered/total) for authenticated users
5. [x] [IMP] Visual design: color-coded topic nodes by status, frontier topics highlighted, prerequisite chain shows completion state; graceful fallback for unauthenticated (same public view as today)
6. [x] [TST] Test authenticated vs unauthenticated explore views return correct data; verify mastery state reflects actual `userTopicState` records
7. [x] [VAL] Visual inspection in dev: mastered topics green, in-progress blue, locked gray, frontier highlighted

**Validation:** Authenticated user sees their progress overlaid on the knowledge graph. Unauthenticated users see the same public view as before.

---

## Phase 3: Try → Signup Flow Hardening ✓
**Goal:** Anonymous try → diagnostic → signup → preserved progress works end-to-end without data loss.

1. [x] [IMP] Add `userTopicState` and `userTopicDepth` to `account-merge.ts` — transfer anonymous topic state to authenticated user on merge
2. [x] [IMP] Persist diagnostic session state to D1 on each response (not just sessionStorage) so sessions survive page refresh and tab close
3. [x] [IMP] Validate merge preserves estimated frontier: after merge, authenticated user's first `/frontier` call returns topics consistent with diagnostic results
4. [x] [IMP] Enhance onboarding merge UI: show specific counts ("We saved your 12 practice problems and diagnostic results") with option to start fresh
5. [x] [TST] Integration test: anonymous token → taste diagnostic → full diagnostic → signup → merge → verify `userTopicState`, `diagnosticSessions`, `learnSessions` all transferred with correct userId
6. [x] [TST] Edge case tests: multi-tab merge (idempotent), skip-diagnostic path, stale/expired token, merge with no anonymous data

**Validation:** End-to-end test passes. Manual walkthrough: try.vue → diagnostic → signup → onboarding shows merged data → learning starts at correct frontier position.

---

## Phase 4: Graph Design Guidelines
**Goal:** Documented methodology for designing knowledge graphs per progression model, ready for new subject creation.

1. [ ] [DOC] Document target topic granularity per model in `content-system.md`: mastery-gated (~50-100 topics per subject, ~1 skill per topic), context-layered (~25-40 topics, broader thematic units), flexible (~20-30 topics, independent items)
2. [ ] [DOC] Document recommended graph shape per model: mastery-gated (deep linear chains with parallelism, 1.5-2.5 prereq edges/topic), context-layered (wide shallow layers, 0.5-1.0 prereq edges/topic, mostly recommended), flexible (sparse, 0.2-0.5 edges/topic, mostly enriching)
3. [ ] [DOC] Document encompassing relationship design patterns per model type, building on Plan 013's weight methodology: mastery-gated targets 1.0-2.0 encompassing edges/topic, context-layered 0.5-1.0, flexible 0.3-0.5
4. [ ] [DOC] Add graph design checklist to `content-system.md` — prerequisite checklist before generating any new subject's content (DAG valid, edge types match progression model, encompassing density meets target, frontier computation produces reasonable results, topic granularity appropriate)

**Validation:** A developer (or Claude Code session) designing a new subject graph can follow the documented guidelines and produce a structurally valid graph without guesswork.

---

## Phase 5: Content Iteration Protocol
**Goal:** Documented detect → diagnose → fix → deploy → measure workflow for improving content based on usage data.

1. [ ] [DOC] Document detection: how admin analytics surface poor-performing topics (accuracy < 70% or > 95%, hint usage > 60%, high lapse rate, confidence miscalibration — overconfident-wrong or underconfident-right)
2. [ ] [DOC] Document diagnosis workflow: decision tree for root cause — content quality issue (ambiguous wording, wrong answer, missing hint), prerequisite gap (topic too hard given prereqs), difficulty miscalibration (tagged easy but actually hard), cognitive demand mismatch (all procedural, no conceptual variety)
3. [ ] [DOC] Document fix → validate → import → verify cycle: edit content JSON → `just validate-content` → `just import-content` → verify via admin analytics; include rollback procedure (git revert + reimport)
4. [ ] [DOC] Add protocol as "Content Iteration" section in `content-system.md` with concrete examples and thresholds

**Validation:** Protocol is actionable — someone reading it can identify a poorly performing topic and fix it using the documented steps.
