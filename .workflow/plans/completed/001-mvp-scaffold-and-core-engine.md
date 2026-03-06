# Epic: MVP Scaffold and Core Engine

> **Created:** 2026-03-04T03:00:00Z
> **Completed:** 2026-03-04T03:35:00Z
>
> For project context, see [CLAUDE.md](../../../CLAUDE.md)
> For product vision, see [SPEC.md](../SPEC.md)
> For decisions, see [DECISIONS.md](../../../DECISIONS.md)

## Summary

Stand up the full-stack monorepo, implement the core backend engines (knowledge graph, SRS, learning loop, LLM integration), build the content pipeline, create the Foundational Mathematics knowledge graph, and build the frontend UI. This epic covers the foundational build from zero to a locally-working full-stack application.

## Progress

**Completed:** All 6 phases
**In Progress:** —
**Next:** —

---

## Phase 1: Project Scaffold
**Goal:** pnpm monorepo with Hono API, Vue frontend, Drizzle schema, Better-Auth

1. [x] [CFG] Initialize pnpm monorepo with packages/api, packages/web, packages/shared
2. [x] [CFG] Configure Hono on Cloudflare Workers with wrangler.toml
3. [x] [IMP] Create Drizzle schema (12 tables: subjects, topics, prerequisites, encompassings, users, auth, user_topic_state, review_log, learn_sessions, llm_usage)
4. [x] [CFG] Configure Better-Auth with Drizzle adapter and D1
5. [x] [CFG] Set up Vue 3 + Vite with vue-router and page stubs
6. [x] [IMP] Generate and apply initial D1 migration
7. [x] [VAL] Verify API starts on :8787 and frontend on :5173

**Validation:** `pnpm dev` starts both servers, API returns `{"status":"ok"}`, frontend serves HTML. ✅

---

## Phase 2: Knowledge Graph Engine
**Goal:** Graph service, import pipeline, Foundational Mathematics content

1. [x] [IMP] Create graph service: computeFrontier, getPrerequisiteChain, validateDAG, computeDepths, encompassing queries
2. [x] [IMP] Wire graph service to Hono routes (/api/graph/*)
3. [x] [IMP] Build Foundational Mathematics graph: 71 topics, 108 prerequisite edges, 16 encompassing edges (Common Core K-5)
4. [x] [IMP] Create sample problem banks (count-to-10, add-within-5, add-within-10) and worked example (add-within-10)
5. [x] [IMP] Build import-content.ts tool: reads graph.json + problems/ + examples/ → local D1
6. [x] [VAL] Import graph, query frontier (6 root topics for new user), DAG validates (no cycles), depths computed (max 14)

**Validation:** `npx tsx tools/import-content.ts` imports cleanly, `/api/graph/subjects/math-foundations/validate` returns `{"valid":true}`, frontier shows 6 depth-0 topics. ✅

---

## Phase 3: SRS Engine
**Goal:** ts-fsrs integration, FIRe credit, session mix

1. [x] [IMP] Create SRS service wrapping ts-fsrs v5: scheduleReview, getDueTopics, getSessionMix
2. [x] [IMP] Implement FIRe (Fractional Implicit Repetition) credit to encompassed topics
3. [x] [IMP] Implement metacognitive confidence tracking (exponential moving average)
4. [x] [IMP] Implement mastery graduation (5+ reps, 30+ day stability, 0 lapses)
5. [x] [IMP] Wire to /api/review/* and /api/progress/* routes
6. [x] [VAL] Submit review → FSRS state updates correctly (stability=2.3, difficulty=2.1), session mix returns review + new topics

**Validation:** POST `/api/review/submit` returns valid FSRS state, GET `/api/review/mix/:userId` returns interleaved review/new mix, GET `/api/progress/:userId` returns correct counts. ✅

---

## Phase 4: Learning Loop
**Goal:** 6-phase session service

1. [x] [IMP] Create session service with in-memory state management
2. [x] [IMP] Implement phase progression: pretest → instruction → guided → independent → review → remediation
3. [x] [IMP] Implement remediation path: failed independent → trace prereq chain → easier problems with hints
4. [x] [IMP] Implement session mix integration (60% review + 40% new, interleaved)
5. [x] [IMP] Wire to /api/learn/* routes (start session, respond, advance)
6. [x] [VAL] Full session flow: start → review topics → new topic (pretest fails → instruction → guided → independent → remediation on failure)

**Validation:** Complete learning session via API: reviews first, then new topics with full phase progression, remediation triggers on failure. ✅

---

## Phase 5: LLM Integration + Content Pipeline
**Goal:** OpenRouter runtime client, offline content generation tools

1. [x] [IMP] Create LLM service: evaluateExplanation (cheap model), socraticTutor (capable model), gradeResponse (cheap model)
2. [x] [IMP] Implement usage tracking with per-model cost calculation
3. [x] [IMP] Wire to /api/llm/* routes
4. [x] [IMP] Build offline tools: generate-graph.ts, generate-problems.ts, generate-examples.ts
5. [x] [IMP] Build validation tools: validate-graph.ts (DAG, cycles, orphans), validate-content.ts (completeness, format)
6. [x] [VAL] validate-graph passes (0 errors), validate-content passes (0 errors, reports 68 topics missing problems)

**Validation:** `npx tsx tools/validate-graph.ts` → 0 errors, DAG PASSED. `npx tsx tools/validate-content.ts` → 0 errors, 15 problems and 2 examples validated. ✅

---

## Phase 6: Frontend
**Goal:** Dashboard, learning session UI, progress, graph explorer

1. [x] [CFG] Add Tailwind CSS v4 via @tailwindcss/vite plugin
2. [x] [IMP] Create API composable (useApi.ts) with all endpoint methods
3. [x] [IMP] Build Dashboard page: stats cards, progress bar, frontier topics, start learning CTA
4. [x] [IMP] Build Learn page: full session UI with ProblemView and WorkedExample components
5. [x] [IMP] Build Progress page: topics by grade with mastery status dots
6. [x] [IMP] Build Explore page: knowledge graph visualization by depth with detail panel
7. [x] [IMP] Build components: ProblemView (hints, solution reveal), WorkedExample (step-by-step, self-explanation), ConfidenceSlider
8. [x] [VAL] Frontend proxy works: /api/* → localhost:8787, dashboard loads live data

**Validation:** `pnpm dev` starts full stack, frontend loads dashboard with live progress data from API, graph explorer shows all 71 topics. ✅
