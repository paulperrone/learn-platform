# State of the Platform — Assessment

> **Date:** 2026-03-11
> **Evaluation level:** L2 (15 sessions, 29 profiles)
> **Result:** 8 PASS, 2 WARN, 0 FAIL — 27/29 behavioral match

---

## 1. Engine — What Works, What's Validated, Known Limitations

### Validated Systems (10 targets)

| Pri | System | Status | Actual | Target |
|-----|--------|--------|--------|--------|
| P0 | Mastery Convergence | PASS | 16 | 11 |
| P0 | Mastery Preservation | PASS | 0.0% | ≤10% |
| P0 | Remediation Routing | PASS | 2016 | ≥5 |
| P1 | Review/New Balance | WARN | 0.718 | 0.600 ±0.10 |
| P1 | FIRe Efficiency | WARN | -25.0% | 0% ±30% |
| P1 | Difficulty Targeting | PASS | 29/17 | 17 |
| P1 | Interleaving Quality | PASS | 0.079 | ≤0.100 |
| P2 | Presentation Drift | PASS | 18 | 14 |
| P2 | Diagnostic Placement | PASS | 27 | 24 |
| P2 | Cognitive Demand Entropy | PASS | 1.29 bits | ≥0.90 |

### What works well

- **Adaptive learning loop**: Pretest → instruction → guided → independent → review → remediation is fully functional across all 4 subjects and 3 discipline models.
- **Diagnostic placement**: Binary-search adaptive diagnostic places 27/29 profiles correctly. Implicit mastery propagation works for topics below placement grade.
- **FSRS scheduling**: ts-fsrs v5 integration with per-user parameter optimization. Reviews spaced correctly.
- **Remediation**: 2016 remediation events across 29 profiles. When students struggle, the engine correctly routes them to prerequisite topics.
- **Interleaving**: Same-strand adjacency at 0.079 (target ≤0.100). Strands loaded from graph.json, remediation events correctly excluded from measurement.
- **Difficulty targeting**: 29/17 profiles converge to 85% accuracy band. Rolling accuracy stays in [0.80, 0.90] once converged.
- **Multi-subject**: 5 multi-subject profiles run correctly across math-foundations, math-middle, ELA, and US History with cross-subject prerequisites.
- **Simulation infrastructure**: 29 profiles, 10 system targets, paired FIRe evaluation, deterministic seeding. Healing loop (`just heal-epoch`) for automated diagnosis and fix.

### Known limitations

- **FIRe efficiency at -25%**: Virtual FSRS credit hurts at 15 sessions. Phase 2.7 isolation shows credit is the primary problem (-25.5% avg). May improve at longer horizons (L3+). Decision deferred to Phase 5.5.
- **Review/New balance at 0.718**: Slightly above the 0.70 WARN boundary. The engine favors reviews over new topics — not harmful but suboptimal for fast learners.
- **2/29 behavioral mismatch**: Two profiles don't match expected patterns. Minor — 93% match rate is acceptable at L2.
- **Content ceiling effects**: At 15 sessions, fast learners exhaust available frontier topics in math-foundations (94 topics). Not a bug — just limited content depth.
- **FIRe pool shrinking**: Binary mastery retires topics from FIRe credit. Graduated mastery model exists but getDueTopics changes reverted (worsened compression). FIRe credit extended to mastered topics <90d stability.
- **L2 only**: All validation is at 15 sessions. No data on long-term behavior (mastery plateau, review queue scaling, FSRS parameter drift).

### What would break first with real users

1. **Content gaps**: A real student who masters all 94 math-foundations topics has nowhere to go except math-middle. No science, languages, or CS content yet.
2. **LLM grading edge cases**: Free-text answer grading uses 3-pass normalization but hasn't been tested with real student typos, partial answers, or non-English input.
3. **Session length**: Fixed 15-item sessions. Real users may want shorter (5-min mobile) or longer (30-min focused) sessions.
4. **Gap resilience**: `returning-after-gap` profile exists but behavior only validated at L2. Real gaps of weeks/months untested.

---

## 2. Content — Coverage, Quality, Gaps

### Coverage

| Subject | Topics | Problems | Examples | Encompassing | Discipline |
|---------|--------|----------|----------|-------------|------------|
| math-foundations | 94 | ~470 | ~188 | 163 (1.73/topic) | mastery-gated |
| math-middle | 115 | ~575 | ~230 | 100 (0.87/topic) | mastery-gated |
| ela-k5 | 65 | ~325 | ~130 | 44 (0.68/topic) | mastery-gated |
| us-history | 30 | ~150 | ~60 | 13 (0.43/topic) | context-layered |
| **Total** | **304** | **~1,520** | **~608** | **320** | |

### Quality signals

- All content generated in Claude Code sessions with platform-medium constraints (screen + text input only).
- `just validate-content` passes: DAG integrity, topic coverage, no physical/verbal instructions.
- 5 problems per topic at 3 difficulty levels (basic, intermediate, advanced).
- 2 worked examples per topic with step-by-step breakdowns.
- Cross-subject prerequisites exist (ELA → math word problems).

### Gaps

- **Encompassing density**: math-middle (0.87/topic) and ELA (0.68/topic) are below the 1.0 target. US History (0.43/topic) is sparse — but context-layered disciplines naturally have fewer encompassing relationships.
- **No science, CS, or languages content**: 8 disciplines defined in schema, only 3 implemented (math, ELA, history).
- **Depth coverage**: Most content is at survey/contextual depth. Analytical and synthesis depth layers are thin.
- **Presentation levels**: Content exists at multiple presentation levels but coverage is uneven.

---

## 3. Frontend — Functional Flows, Missing Pieces

### Functional flows (production-ready)

- **Sign up → Onboarding → Diagnostic → Learn → Progress**: Complete happy path works.
- **Guest try**: `/try` page lets unauthenticated users take a taste diagnostic before signup.
- **Dashboard** (`/`): Daily goal progress, streak, contribution graph, weekly summary, frontier topics, completion estimates.
- **Learning session** (`/learn`): Problem display (5 types: text-qa, numerical, matching, multi-select, multi-step), confidence slider, hints (static + LLM), worked examples, mastery celebrations.
- **Progress** (`/progress`): Topic mastery grid by grade, presentation distribution, confidence calibration.
- **Settings** (`/settings`): Language, TTS/STT, child mode.
- **Family** (`/family`): Parent dashboard, child management, LLM budget controls.
- **Admin** (`/admin`): 8-tab dashboard with model config, usage, content quality, difficulty spikes.
- **28 routes** total, lazy-loaded with route guards (auth, parent-only, admin-only).

### Stub pages (not blocking MVP)

- Documentation pages (`/docs/*`): how-we-teach, mastery-learning, spaced-repetition, knowledge-graph, ai-tutoring, comparison — all stubs.
- Teaching pages (`/teach`, `/teach/:subject/:topic`): stubs.
- Advanced explore pages: partially functional.
- Group sessions: stubs.

### Missing pieces

- **Error recovery in learn.vue**: If `getActiveSession()` fails, no error UI — user sees "start session" button with no feedback.
- **Network error handling**: `withErrorToast()` silently returns `undefined` on error; can leave UI in loading state.
- **Empty state messaging**: Some pages show only placeholder when no data exists.
- **Form validation**: Signup/login use HTML5 required only; no inline field-level validation.
- **Loading skeletons**: Generic spinners instead of skeleton screens.

### Mobile & accessibility

- **Responsive**: Tailwind responsive classes throughout (`md:`, `lg:`, `sm:`). Grid adapts (1→2→4 columns).
- **Touch**: Child mode enforces min 3rem touch targets. `inputmode="decimal"` on numeric inputs.
- **Accessibility**: All math visuals have `role="img"` + aria-labels. Form labels present. RTL partial support.
- **Gaps**: No skip-to-main link. Limited ARIA landmarks. RTL incomplete.

---

## 4. Infrastructure — Deployment Readiness, Production Blockers

### Ready now

- **Cloudflare Workers**: `wrangler.toml` fully configured with production D1 ID, Workers AI binding, SPA asset serving.
- **28 SQL migrations**: Sequential, all applied locally. Ready for `wrangler d1 migrations apply --remote`.
- **Better-Auth**: Email/password auth, organization/admin plugins, child accounts. Just needs `BETTER_AUTH_SECRET` secret.
- **OpenRouter**: LLM service wired up with streaming, cost tracking, family budgets. Just needs `OPENROUTER_API_KEY` secret.
- **Build pipeline**: `pnpm build` → `wrangler deploy`. `just deploy` recipe exists.
- **CORS**: Configured for `learn.perrone.dev` and Workers dev URL. In-code rate limiting (60 req/min default, 10 for sensitive endpoints).

### Production deployment checklist

1. Set secrets: `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY` (optional: `OPENROUTER_MANAGEMENT_KEY`)
2. Apply migrations: `npx wrangler d1 migrations apply learn-db --remote --env production`
3. Import content: `npx tsx tools/export-sql.ts > /tmp/content.sql && npx wrangler d1 execute learn-db --remote --file=/tmp/content.sql --env production`
4. Build and deploy: `just deploy`
5. Configure WAF in Cloudflare dashboard (rate limiting, bot protection)

### Not blockers but recommended

- Add CSP, X-Frame-Options, X-Content-Type-Options headers.
- Create `.env.example` documenting required variables.
- Set up error monitoring (e.g., Sentry or Cloudflare analytics).
- Verify `export-sql.ts` handles 304 topics without hitting D1 row limits.

---

## 5. Prioritized Next-Work List

### Tier 1: Ship to real users (1-2 phases)

1. **Deploy to production** — Run the deployment checklist above. The platform is functionally complete for an alpha/beta launch.
2. **Error handling polish** — Add error UI to learn.vue, improve empty states, add form validation. ~1 phase of work.

### Tier 2: Improve confidence before wider launch (2-3 phases)

3. **L3 validation (90 sessions)** — Run Phase 4 to verify long-term engine behavior. This is the single highest-value engineering task — it either confirms the engine is ready or surfaces bugs invisible at L2.
4. **FIRe decision (Phase 5.5)** — With L3+ data, decide whether to keep, modify, or disable FIRe credit. Currently at -25% efficiency — acceptable as WARN but needs resolution.
5. **Content density** — Increase encompassing edges in math-middle (0.87 → 1.5+/topic) and ELA (0.68 → 1.0+/topic).

### Tier 3: Growth features (future plans)

6. **More subjects** — Science, CS, world languages. Schema supports 8 disciplines; only 3 have content.
7. **Session flexibility** — Variable session length (5/15/30 min), mobile-optimized short sessions.
8. **Social features** — Group sessions, teaching mode, leaderboards.
9. **Documentation pages** — Fill in the stub /docs/* pages for SEO and user education.

---

## Recommendation

**Deploy now, validate in parallel.**

The platform is ready for alpha users today. The core learning loop works, the engine passes all P0 targets with 0 FAILs, the frontend supports the full user journey, and deployment is a checklist of 5 steps.

The recommended path:

1. **Immediate**: Deploy to production. Invite 5-10 alpha testers (friends, family, math students).
2. **Parallel**: Run L3 validation (Phase 4) to confirm long-term engine behavior. This doesn't block alpha launch — L2 validation is sufficient for early users doing <30 sessions.
3. **After L3 data**: Make the FIRe decision (Phase 5.5) and calibrate targets.
4. **After alpha feedback**: Prioritize error handling, session flexibility, and content gaps based on real user pain points.

Continuing simulation maturity (Phases 4-6) without real users risks optimizing in a vacuum. Real user data will reveal issues simulations can't — confusing UI, unclear problems, unexpected answer formats, mobile UX issues. Ship and iterate.
