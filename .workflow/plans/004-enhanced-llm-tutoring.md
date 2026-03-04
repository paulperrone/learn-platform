# Epic: Enhanced LLM Tutoring

> **Created:** 2026-03-04T23:26:01Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Evolve LLM integration from stateless single-turn API calls to context-aware tutoring. Inject session history and student profile into prompts for personalized responses, add streaming for natural conversation flow, and build a progressive hint system that scaffolds without giving answers. Builds on the existing `createLLMService` pattern in `packages/api/src/services/llm.ts`.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Research & Design
**Goal:** Define the enhanced tutoring architecture

1. [ ] [RSH] Audit current LLM service: map all call sites, measure typical prompt sizes, identify where context injection would have most impact (socraticTutor, evaluateExplanation, gradeResponse)
2. [ ] [RSH] Design session context format: what student history to include (last N responses, struggle patterns, mastery level, time-on-task), token budget, how to summarize efficiently
3. [ ] [RSH] Design hint progression model: define hint levels (nudge → guiding question → partial reveal → worked step), when to escalate, how to track hint usage for SRS scheduling

**Validation:** Architecture doc in RESEARCH.md with context injection format, hint level definitions, and token budget estimates. Clear implementation path for Phases 2-4.

---

## Phase 2: Session Context Injection
**Goal:** LLM calls receive student history for personalized responses

1. [ ] [IMP] Build student profile builder: function that generates a concise text summary from user_topic_state and recent review_log (mastery level, recent struggles, pace, strengths)
2. [ ] [IMP] Inject profile into socraticTutor system prompt: include student context so tutor adapts language complexity, pacing, and examples to the individual
3. [ ] [IMP] Inject session context into evaluateExplanation: include what the student has been working on so evaluation accounts for their learning trajectory
4. [ ] [TST] Verify: compare LLM responses with and without context injection — responses should reference student's specific struggles and adapt difficulty

**Validation:** LLM responses demonstrably adapt to student history. Tutor references specific areas of strength/weakness. Token usage stays within budget (~500 tokens for context).

---

## Phase 3: Streaming Responses
**Goal:** Real-time streamed tutoring responses in the UI

1. [ ] [IMP] Add streaming endpoint: `/api/llm/tutor-stream` using OpenRouter's streaming API, return Server-Sent Events from Hono on Workers
2. [ ] [IMP] Update LLM service: add `callStream()` method that returns a ReadableStream, handle token counting from streaming responses
3. [ ] [IMP] Build streaming text component in Vue: progressive text reveal, typing indicator, cancel button, graceful error handling
4. [ ] [TST] Verify: tutoring response streams word-by-word in UI, token usage is tracked correctly, cancellation works, fallback to non-streaming on error

**Validation:** Tutoring responses appear progressively in the UI. Latency to first token is <500ms. Usage tracking works with streaming. Non-streaming fallback functions correctly.

---

## Phase 4: Progressive Hint System
**Goal:** Multi-level hints that scaffold without giving answers

1. [ ] [IMP] Define hint levels in problem schema: Level 1 (conceptual nudge), Level 2 (guiding question), Level 3 (partial solution reveal), Level 4 (full worked step). Store hint templates per problem or generate via LLM.
2. [ ] [IMP] Add hint API endpoint: `/api/llm/hint` — accepts problem ID, current hint level, student response history; returns next-level hint using LLM with strict "don't give the answer" prompting
3. [ ] [IMP] Build hint UI: "Need a hint?" button, progressive hint reveal (each click shows next level), visual indicator of hints used, cost warning before LLM hints
4. [ ] [TST] Verify: hints progress through levels appropriately, never reveal the final answer, hint usage is tracked in review_log for SRS scheduling impact

**Validation:** Students can request hints at increasing levels of detail. Hints guide without giving answers. Hint usage is recorded and affects SRS scheduling (more hints → shorter review interval).
