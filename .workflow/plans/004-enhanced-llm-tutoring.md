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

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6
**In Progress:** —
**Next:** Phase 7

---

## Phase 1: Research & Design ✓
**Goal:** Define the enhanced tutoring architecture

1. [x] [RSH] Audit current LLM service: map all call sites, measure typical prompt sizes, identify where context injection would have most impact (socraticTutor, evaluateExplanation, gradeResponse)
2. [x] [RSH] Design session context format: what student history to include (last N responses, struggle patterns, mastery level, time-on-task), token budget, how to summarize efficiently
3. [x] [RSH] Design hint progression model: define hint levels (nudge → guiding question → partial reveal → worked step), when to escalate, how to track hint usage for SRS scheduling

**Validation:** Architecture doc in RESEARCH.md with context injection format, hint level definitions, and token budget estimates. Clear implementation path for Phases 2-4.

---

## Phase 2: Session Context Injection ✓
**Goal:** LLM calls receive student history for personalized responses

1. [x] [IMP] Build student profile builder: function that generates a concise text summary from user_topic_state and recent review_log (mastery level, recent struggles, pace, strengths)
2. [x] [IMP] Inject profile into socraticTutor system prompt: include student context so tutor adapts language complexity, pacing, and examples to the individual
3. [x] [IMP] Inject session context into evaluateExplanation: include what the student has been working on so evaluation accounts for their learning trajectory
4. [x] [TST] Verify: compare LLM responses with and without context injection — responses should reference student's specific struggles and adapt difficulty

**Validation:** LLM responses demonstrably adapt to student history. Tutor references specific areas of strength/weakness. Token usage stays within budget (~500 tokens for context).

---

## Phase 3: Streaming Responses ✓
**Goal:** Real-time streamed tutoring responses in the UI

1. [x] [IMP] Add streaming endpoint: `/api/llm/tutor-stream` using OpenRouter's streaming API, return Server-Sent Events from Hono on Workers
2. [x] [IMP] Update LLM service: add `callStream()` method that returns a ReadableStream, handle token counting from streaming responses
3. [x] [IMP] Build streaming text component in Vue: progressive text reveal, typing indicator, cancel button, graceful error handling
4. [x] [TST] Verify: tutoring response streams word-by-word in UI, token usage is tracked correctly, cancellation works, fallback to non-streaming on error

**Validation:** Tutoring responses appear progressively in the UI. Latency to first token is <500ms. Usage tracking works with streaming. Non-streaming fallback functions correctly.

---

## Phase 4: Progressive Hint System ✓
**Goal:** Multi-level hints that scaffold without giving answers

1. [x] [IMP] Define hint levels in problem schema: Level 1 (conceptual nudge), Level 2 (guiding question), Level 3 (partial solution reveal), Level 4 (full worked step). Store hint templates per problem or generate via LLM.
2. [x] [IMP] Add hint API endpoint: `/api/llm/hint` — accepts problem ID, current hint level, student response history; returns next-level hint using LLM with strict "don't give the answer" prompting
3. [x] [IMP] Build hint UI: "Need a hint?" button, progressive hint reveal (each click shows next level), visual indicator of hints used, cost warning before LLM hints
4. [x] [TST] Verify: hints progress through levels appropriately, never reveal the final answer, hint usage is tracked in review_log for SRS scheduling impact

**Validation:** Students can request hints at increasing levels of detail. Hints guide without giving answers. Hint usage is recorded and affects SRS scheduling (more hints → shorter review interval).

---

## Phase 5: LLM Hardening & Graceful Degradation ✓
**Goal:** LLM features fail gracefully when not configured; model selection is centrally configurable

1. [x] [IMP] Add graceful "LLM not available" responses: when `OPENROUTER_API_KEY` is missing or empty, all `/api/llm/*` endpoints return `{ available: false, error: "AI tutoring is not configured" }` with 503 instead of 500. Frontend handles this with clear messaging.
2. [x] [IMP] Extract model map to central config: move hardcoded `MODEL_MAP` and `COST_PER_M` to a platform config (stored in a `llm_model_config` D1 table). Admin-tunable without code deploys. Include model ID, tier assignment, cost rates.
3. [x] [IMP] Update all frontend LLM call sites to handle "not available" gracefully: hint buttons show "AI hints not available" disabled state, learning flow continues uninterrupted, no error toasts for expected 503 unavailability.
4. [x] [TST] Verify: typecheck passes across all packages. Middleware gates all LLM endpoints except /status and /usage. Model config loads from DB with hardcoded fallback defaults.

**Validation:** Platform runs cleanly with or without an OpenRouter key. Model selection is configurable without code changes. Frontend never shows errors for expected LLM unavailability.

---

## Phase 6: Per-Family Provisioned OpenRouter Keys ✓
**Goal:** Each family gets its own OpenRouter API key for billing isolation and usage tracking via Management API

1. [x] [RSH] Research OpenRouter Management API integration: documented full API (POST/GET/PATCH/DELETE `/api/v1/keys`), billing model (USD limits, monthly reset), key lifecycle. Findings in RESEARCH.md.
2. [x] [IMP] Add provisioned key management service: `createOpenRouterKeyService(managementApiKey)` in `services/openrouter-keys.ts` with methods: `provisionKey`, `disableKey`, `updateLimit`, `getKeyUsage`. Store `openrouterKeyHash` + `openrouterApiKey` in org metadata.
3. [x] [IMP] Wire provisioned keys into LLM calls: `resolveApiKey()` in llm routes looks up user's family provisioned key, falls back to platform key. Internal `llm_usage` table still tracks per-user telemetry regardless of which key is used.
4. [x] [IMP] Auto-provision keys on family creation: `POST /api/family` provisions OpenRouter key (best-effort). `PUT /api/family/budget` syncs limit to OpenRouter key.
5. [x] [TST] Verify: typecheck passes. Key provisioning is best-effort (family works without management key). `resolveApiKey` correctly resolves child → parent → org → provisioned key → fallback.

**Validation:** Each family has its own OpenRouter API key. Usage is tracked both at OpenRouter level (per-key) and internally (per-user within family). Budget limits are enforced at both levels. Internal telemetry preserved for analytics.

---

## Phase 7: Admin Experience & Usage Analytics
**Goal:** Platform admin can configure models, view aggregate usage, and see content effectiveness signals

1. [ ] [IMP] Add admin routes (`/api/admin`): platform-level model tier config (CRUD for model assignments per tier), aggregate usage stats (total cost, calls, per-family breakdown), platform config management. Protected by admin role check.
2. [ ] [IMP] Build admin dashboard page (`/admin`): model configuration panel (which models serve each tier), platform-wide usage metrics (total cost this month, top families by usage, cost by purpose), family-level usage drill-down.
3. [ ] [IMP] Add content effectiveness analytics: per-topic metrics (LLM call rate, hint request rate, average attempts to mastery, time-to-mastery), identify struggling topics (high tutoring usage → content may need improvement), compare mastery curves across learners to find content that works well vs poorly.
4. [ ] [IMP] Foundation for adaptive content: track per-user learning patterns in `llm_usage` and `review_log` (which problems trigger tutoring, hint escalation patterns, response time trends). Query endpoints for content effectiveness reports. This data informs future offline content generation — tailoring problem difficulty, example selection, and hint quality based on aggregate learner performance.
5. [ ] [TST] Verify: admin can view/change model config → changes take effect → usage analytics show meaningful data → content effectiveness signals are queryable and actionable.

**Validation:** Admin has full visibility into platform usage and model configuration. Content effectiveness metrics are tracked and queryable. Data foundation exists for future adaptive content generation.
