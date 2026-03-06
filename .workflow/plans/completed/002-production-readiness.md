# Epic: Production Readiness

> **Created:** 2026-03-04T03:47:03Z
> **Completed:** 2026-03-04
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Take the locally-working MVP to a deployed, testable state. Generate full content for all 71 Foundational Mathematics topics, add real authentication UI, persist learning sessions across worker restarts, add error handling, configure Cloudflare infrastructure, and deploy. Final phase captures future capability areas as separate intake items.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6
**In Progress:** —
**Next:** All phases complete. Run `/workflow-intake` to start a new epic.

---

## Phase 1: Content Generation ✓
**Goal:** All 71 topics have validated problem banks and worked examples

1. [x] [TRF] Generate problem banks for all 68 remaining topics using Claude Code
2. [x] [TRF] Generate worked examples for all 70 remaining topics using Claude Code
3. [x] [VAL] Run validate-content.ts — 0 errors, all 71 topics have problems and examples
4. [x] [TRF] Re-import full content into local D1 and verify via API

**Validation:** `npx tsx tools/validate-content.ts` reports 0 missing topics for problems and examples. `npx tsx tools/import-content.ts` succeeds. API returns problems/examples for a sample of topics across grade levels.

---

## Phase 2: Authentication UI ✓
**Goal:** Real login/signup flow replacing hardcoded test-user

1. [x] [IMP] Create auth composable (useAuth) with Better-Auth client: login, signup, logout, session state
2. [x] [IMP] Build login page with email/password form
3. [x] [IMP] Build signup page with email/password + birth year (for age-appropriate UI)
4. [x] [IMP] Add route guards — redirect unauthenticated users to login, pass real userId to all API calls
5. [x] [TST] Verify full flow: signup → login → dashboard loads with real user → logout → redirected to login

**Validation:** Can create account, log in, see dashboard with real user data, log out. Hardcoded test-user removed from useApi composable.

---

## Phase 3: Session Persistence ✓
**Goal:** Learning sessions survive worker restarts

1. [x] [RSH] Evaluate D1 vs Durable Objects for session state (cost, complexity, latency)
2. [x] [IMP] Implement chosen persistence: save/load session state on each phase transition
3. [x] [IMP] Add session recovery — if user returns to /learn with an active session, resume where they left off
4. [x] [TST] Verify: start session, restart wrangler dev, resume session at correct phase/topic

**Validation:** Start a learning session, kill and restart the API server, navigate back to /learn — session resumes at the correct phase and topic.

---

## Phase 4: Error Handling ✓
**Goal:** Graceful error handling across API and frontend

1. [x] [IMP] Add Hono error middleware: catch all route errors, return structured JSON errors with appropriate status codes
2. [x] [IMP] Add frontend error boundary and toast/notification system for API errors
3. [x] [IMP] Add loading states and empty states to all pages (dashboard, learn, progress, explore)
4. [x] [TST] Verify: API returns structured errors on bad input, frontend shows user-friendly messages, no unhandled promise rejections

**Validation:** Hit API with invalid data → get structured error JSON. Frontend shows loading spinners, empty states, and error messages appropriately. No raw error dumps visible to users.

---

## Phase 5: Cloudflare Deployment ✓
**Goal:** Full stack deployed and accessible on the internet

1. [x] [CFG] Create remote D1 database: `wrangler d1 create learn-db`, update database_id in wrangler.toml
2. [x] [CFG] Add secrets: `wrangler secret put BETTER_AUTH_SECRET`, `wrangler secret put OPENROUTER_API_KEY`
3. [x] [CFG] Configure BETTER_AUTH_URL var for production domain
4. [x] [TRF] Build remote content import: convert import-content.ts to use `wrangler d1 execute` SQL statements, run migrations and import content to remote D1
5. [x] [CFG] Configure Cloudflare Pages for Vue frontend build (or Workers Sites), set up custom domain if desired
6. [x] [IMP] Deploy API worker and frontend, configure CORS for production origin
7. [x] [TST] End-to-end verification: signup on deployed URL → login → start learning session → see progress update → logout

**Validation:** Full learning flow works on the public URL. Auth, graph queries, session progression, SRS scheduling all function in production.

---

## Phase 6: Future Capabilities Intake ✓
**Goal:** Capture post-MVP research questions and capability areas as structured intake items

1. [x] [RSH] Research three future capability areas: (a) runtime LLM architecture — API calls vs agent harness vs hybrid, (b) content pipeline architecture for multi-subject expansion, (c) post-MVP capabilities assessment with priority ranking
2. [x] [DOC] Update SPEC.md with post-MVP roadmap (7 prioritized capability areas) and RESEARCH.md with detailed findings (3 research entries)

**Validation:** Future work captured in RESEARCH.md with trade-off analysis and recommendations. SPEC.md updated with prioritized roadmap. Each area has enough definition to be picked up as a `/workflow-intake` item for its own epic.
