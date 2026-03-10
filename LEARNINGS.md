# Learnings

Gotchas, insights, and tacit knowledge. Append-only.

## Guardrails

> Critical patterns that MUST be followed. Violations cause bugs or rework.

- D1 foreign keys are enforced — test users must exist in `users` table before creating `user_topic_state` rows
- Drizzle ORM version must match better-auth peer dependency (>=0.41.0 as of better-auth 1.5.x)
- `pnpm approve-builds` is interactive — add native deps to `pnpm.onlyBuiltDependencies` in root package.json instead
- import-content.ts must delete from `group_session_participants`, `group_sessions`, `diagnostic_sessions`, `assignment_responses`, `assignments`, `teach_sessions`, `review_log`, `user_topic_state`, `assessment_content`, and `instructional_content` before deleting topics — FK constraints on `topic_id` and `subject_id`
- Drizzle `$defaultFn()` is app-level only — when adding NOT NULL columns via migration, manually add `DEFAULT` to the generated SQL or SQLite will reject it
- Content generation prompts MUST include platform-medium constraints (screen + text input only) or LLMs will generate physical/verbal instructions (hold up fingers, point, speak aloud) that are impossible on the platform. Always run `npx tsx tools/validate-content.ts` after generating content.

---

## 2026-03-03: Wrangler dev port defaults to 8788, not 8787

Set `[dev] port = 8787` in wrangler.toml to get a predictable port. The Vite proxy in web/vite.config.ts expects 8787.

## 2026-03-03: Zsh glob expansion breaks curl URLs with query params

Always quote URLs in zsh: `curl -s 'http://localhost:8787/api/foo?bar=1'` — unquoted `?` triggers glob expansion.

## 2026-03-03: better-sqlite3 needs build approval for import tool

The `tools/import-content.ts` script uses better-sqlite3 to write directly to the local D1 sqlite file at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`. Must add `better-sqlite3` to `pnpm.onlyBuiltDependencies`.

## 2026-03-03: Tailwind CSS v4 uses @tailwindcss/vite plugin

No `tailwind.config.js` needed. Import via `@import "tailwindcss"` in CSS. Plugin added in vite.config.ts.

## 2026-03-04: import-content.ts FK delete order must cover all referencing tables

**Source:** User session
**Area:** D1 / SQLite FK constraints

The original import script only deleted from `encompassings` and `prerequisites` before deleting topics. But `review_log` and `user_topic_state` also have FK references to `topics.id`. The full delete order must be: review_log → user_topic_state → encompassings → prerequisites → topics → subjects.

**Context:** Fails on re-import after any user activity has created review_log or user_topic_state rows.

---

### 2026-03-04: Better-Auth client types don't include server-side additionalFields

**Source:** User session
**Area:** Better-Auth / TypeScript

`signUp.email()` on the client doesn't accept custom fields defined via `user.additionalFields` on the server (e.g., `birthYear`). The client type system doesn't know about them. Use a type assertion (`as Parameters<typeof authClient.signUp.email>[0]`) to pass extra fields through. They do get stored correctly — it's only a client-side type gap.

**Context:** Adding birthYear to signup form with Better-Auth 1.5.x + better-auth/vue client.

---

### 2026-03-04: SQLite ALTER TABLE can't add NOT NULL column without DEFAULT

**Source:** User session
**Area:** D1 / SQLite / Drizzle migrations

SQLite `ALTER TABLE ADD COLUMN` fails with "Cannot add a NOT NULL column with default value NULL" if the column is `NOT NULL` and has no `DEFAULT`. Drizzle generates the migration without a DEFAULT even when the schema has `$defaultFn()` (which is app-level, not DB-level). Fix: manually add `DEFAULT ''` to the generated migration SQL.

**Context:** Adding `updated_at TEXT NOT NULL` to `learn_sessions` table. Drizzle's `$defaultFn` only runs in app code, not as a SQL DEFAULT.

---

### 2026-03-05: OpenRouter provisioned key string only returned once at creation

**Source:** User session
**Area:** OpenRouter Management API

The `POST /api/v1/keys` response includes the raw API key (`sk-or-v1-...`) in the `key` field. This is the **only time** the raw key is ever returned. All subsequent operations reference the key by its `hash`. If you don't store the raw key immediately at creation, it's lost forever.

**Context:** Auto-provisioning family OpenRouter keys. Must store the key in org metadata in the same transaction as creation.

---

### 2026-03-05: OpenRouter API limits are in USD, not cents or tokens

**Source:** User session
**Area:** OpenRouter Management API

OpenRouter Management API `limit` field is denominated in **USD** (e.g., `limit: 5.00` = $5.00), not cents. Our internal budget tracking uses `monthlyBudgetCents`. Must divide by 100 when syncing: `limit = monthlyBudgetCents / 100`.

**Context:** Syncing family budget to provisioned OpenRouter key limits.

### 2026-03-04: Wrangler `[assets]` with `binding` routes ALL requests through Worker

**Source:** User session
**Area:** Cloudflare Workers / Wrangler v4

When `[assets]` has a `binding = "ASSETS"`, ALL requests go to the Worker — static files are NOT served automatically. The Worker must explicitly call `c.env.ASSETS.fetch(c.req.raw)` for non-API routes. Without a binding, assets are served first and only non-matches reach the Worker. Use `not_found_handling = "single-page-application"` so the ASSETS binding returns `index.html` for unknown paths (SPA routing).

**Context:** Single-domain deployment where Worker serves both API and Vue SPA.

---

### 2026-03-05: vitest-pool-workers D1 exec() can't handle multi-line template literals

**Source:** User session
**Area:** @cloudflare/vitest-pool-workers / D1

D1's `exec()` in the miniflare test environment fails with "incomplete input" when given multi-line SQL via template literals (backtick strings). The SQL gets truncated at newlines. Workaround: use `prepare().run()` with single-line SQL strings for schema setup. Define DDL as an array of individual `CREATE TABLE`/`CREATE INDEX` statements.

**Context:** Setting up test database schema in vitest Workers pool. Inlined migration SQL failed; switching to individual `prepare().run()` calls per statement worked.

---

### 2026-03-05: Better-Auth sessions can't be faked by inserting into sessions table

**Source:** User session
**Area:** Better-Auth / Testing

Inserting a session row directly into the `sessions` table and setting a `Cookie: better-auth.session_token=<token>` header does NOT make `auth.api.getSession({ headers })` return a valid session. Better-Auth's session resolution has additional validation beyond raw token lookup. For testing authenticated routes, either use the full Better-Auth signup/signin flow or test auth middleware rejection (401) and test business logic at the service/DB level.

---

### 2026-03-05: SpeechSynthesis voice list loads asynchronously on Chrome

**Source:** User session
**Area:** Web Speech API / Vue

`speechSynthesis.getVoices()` returns an empty array on first call in Chrome — voices load async and fire `voiceschanged` event. Safari returns voices synchronously. Must handle both: call `getVoices()` immediately AND listen for `voiceschanged`. The `useSpeech.ts` composable handles this with `loadVoices()` + event listener.

**Context:** Building TTS for K-5 learners. Voice selection must work across Chrome and Safari.

---

### 2026-03-05: Hono `parseBody()` for FormData in Workers

**Source:** User session
**Area:** Hono / Cloudflare Workers

Use `c.req.parseBody()` (not `c.req.formData()`) to parse multipart form data in Hono on Workers. Returns an object where file fields are `File` instances. Check with `instanceof File` before processing. Works with the standard `FormData` upload pattern from browsers.

---

### 2026-03-05: vue-tsc rootDir conflict with cross-package type imports

**Source:** User session
**Area:** Vue / TypeScript / pnpm monorepo

Setting `rootDir: "src"` in web package `tsconfig.json` causes `TS6059` errors when importing types from `@learn/shared` (which resolves outside `rootDir` via path alias). Even `import type` triggers this. Fix: remove `rootDir` from the web tsconfig — it's not needed for type-checking (`outDir` controls output). API package works because it doesn't set `rootDir`.

**Context:** Adding `SpeechSettings` type import from `@learn/shared` to web composables.

---

### 2026-03-05: Better-Auth signup flow works in vitest Workers pool for HTTP auth tests

**Source:** User session
**Area:** Better-Auth / Testing / @cloudflare/vitest-pool-workers

Full signup flow (`POST /api/auth/sign-up/email`) works in miniflare Workers pool tests. Response includes `set-cookie` header with `better-auth.session_token=<value>`. Extract via regex, use as `Cookie` header for subsequent authenticated requests. ~50-70ms per signup — fast enough for focused test files. This is the ONLY reliable way to test authenticated routes via HTTP; `createAuthSession()` helper doesn't work because Better-Auth hashes tokens internally.

**Context:** Testing settings API routes (GET/PUT /api/settings) that require authentication.

---

### 2026-03-05: Drizzle `update()` on D1 returns D1Result — no rowsAffected property

**Source:** User session
**Area:** Drizzle ORM / D1

`db.update().set().where()` returns `D1Result<unknown>` which has `meta.changes` and `meta.rows_written`, but NOT a `rowsAffected` property. If you need to know how many rows were affected, count before updating with a separate `select({ count: sql<number>'count(*)' })` query.

**Context:** Building account merge service that transfers anonymous data to real user accounts. Needed affected row counts for merge confirmation.

---

### 2026-03-05: Wrangler log EPERM causes `pnpm test` to report failure even when tests pass

**Source:** User session
**Area:** @cloudflare/vitest-pool-workers / Wrangler

`pnpm test` (vitest with `@cloudflare/vitest-pool-workers`) can report exit code 1 due to wrangler failing to write debug logs (`EPERM: operation not permitted` on `~/.wrangler/logs/`). The actual tests may have passed — check the test result lines, not just the exit code. This is a wrangler infrastructure issue, not a test failure.

**Context:** Running `pnpm test` after Teach Mode implementation. All tests passed but the process exited with code 1 due to wrangler log file permissions.

---

### 2026-03-06: LLM-generated content defaults to classroom pedagogy without medium constraints

**Source:** User session
**Area:** Content generation / LLM prompts

LLMs prompted to create "concrete, hands-on" K-2 content will generate physical manipulation instructions (hold up fingers, point at objects, draw, speak aloud) by default. These are good classroom pedagogy but impossible on a screen-based platform. 48% of initial worked examples had this problem. Fix: generation prompts must explicitly describe the delivery medium and provide screen-native translation examples for common physical actions. Validate with regex patterns post-generation.

**Context:** First content quality review. Added platform-medium constraints to generate-examples.ts, generate-problems.ts, and pattern-based validation to validate-content.ts.

---

### 2026-03-06: Never run `pnpm vitest run` directly — use `pnpm test` or `just test`

**Source:** User session
**Area:** Testing / @cloudflare/vitest-pool-workers

Running `pnpm vitest run` (or `npx vitest`) directly skips the Workers pool runner. All tests that import `cloudflare:test` fail with "Cannot find package" errors (15+ false failures). The correct command is `pnpm test` (which delegates to `pnpm --filter api test`) or `just test`, both of which use the `@cloudflare/vitest-pool-workers` config from `packages/api/vitest.config.ts`.

**Context:** Only `packages/api/src/__tests__/services/grading.test.ts` (pure logic, no Workers deps) passes under bare vitest. All other test files need the Workers pool.

---

### 2026-03-07: Drizzle-kit generate breaks when migrations are manually created

**Source:** User session
**Area:** Drizzle ORM / drizzle-kit

When migrations are created manually (not via `drizzle-kit generate`), the snapshot chain in `migrations/meta/` gets out of sync. The next `drizzle-kit generate` will diff against the last snapshot it knows about, producing a migration that recreates tables already added by manual migrations. Fix: after manually creating a migration, also run `drizzle-kit generate` to update the snapshot, then replace the generated SQL file with your manual one (keeping the snapshot). Or avoid manual migrations entirely.

**Context:** Manual migration `0014_user_topic_depth.sql` was created without a snapshot. Next generate produced a migration recreating that table plus the intended schema change. Had to fix journal entries, delete bad snapshots, and regenerate.

---

### 2026-03-07: DiagnosticState needs backwards-compat defaults for new fields

**Source:** User session
**Area:** Diagnostic service / JSON state

When adding new fields to `DiagnosticState` (which is serialized as JSON in `diagnostic_sessions.stateJson`), in-progress diagnostics won't have these fields. In `respond()`, initialize missing fields with defaults before using them: `state.correctness = state.correctness ?? []` and `state.servedPresentationLevels = state.servedPresentationLevels ?? []`. This prevents crashes when resuming diagnostics started before the code update.

**Context:** Added `servedPresentationLevels` and `correctness` arrays to DiagnosticState for presentation distribution seeding (plan 009.5 Phase 2).

---

### 2026-03-07: ts-fsrs v5 has no built-in parameter optimizer

**Source:** User session
**Area:** ts-fsrs / FSRS

ts-fsrs v5 does not include a `computeParameters()` or optimizer function. The `w` weights optimization is only available in the Python `fsrs-optimizer` package. In a JS/Workers environment, per-user FSRS customization must be done via heuristics (adjusting `request_retention` based on observed retention rate) or by running a separate offline optimizer job. Custom params can be passed to `generatorParameters({ request_retention, w })` and `fsrs()`.

**Context:** Implementing per-user FSRS optimization for Plan 010 Phase 7. Plan referenced `fsrs.computeParameters()` which doesn't exist in the TS library.

---

### 2026-03-07: FSRS consecutive correct only increments at State.Review

**Source:** Test failure during confidence calibration implementation
**Area:** ts-fsrs / SRS service

`consecutiveCorrectReviews` only increments when `newCard.state === State.Review` (state=2). New topics start at `State.New` (0), then move through `State.Learning` (1) after initial reviews. It typically takes 2-3 `Rating.Good` reviews before a card reaches `State.Review`. Tests that check consecutive correct counts must account for this — seeding a few reviews first.

**Context:** Confidence calibration test expected 2 consecutive correct after 2 Good reviews on a new topic, but the card was still in Learning state.

---

### 2026-03-07: Drizzle migration snapshot drift requires manual migration SQL

**Source:** User session
**Area:** Drizzle ORM / D1

When schema changes are applied via hand-written migrations (not `drizzle-kit generate`), the Drizzle snapshot drifts out of sync. Running `drizzle-kit generate` later produces a migration that tries to recreate already-existing tables/columns. Fix: manually edit the generated SQL to only include the new change (e.g., just the ALTER TABLE), keeping the snapshot file as-is for future sync.

**Context:** Migration 0020 generated CREATE TABLE statements for tables already created in migrations 0016-0019.

---

### 2026-03-07: Session service in-memory cache bypasses DB state in tests

**Source:** User session
**Area:** Testing / Session service

The session service maintains an in-memory `activeSessions` Map as a cache over D1. When `startSession()` is called, it populates this cache. Subsequent `respond()` calls check the cache first. In tests, if you call `startSession()` and then write state directly to DB to set up a scenario, `respond()` will use the stale cached state, not your DB override. Fix: create learn_session rows directly via `db.insert()` instead of calling `startSession()`, so the cache is never populated and `respond()` reads from DB via `loadState()`.

**Context:** Targeted remediation tests needed to set specific session states (e.g., `currentPhase: "remediation"`, `remediationTargetTopicId`) before calling `respond()`.

---

### 2026-03-08: Session stateJson is nulled on completion — read state before session ends

**Source:** User session
**Area:** Testing / Session service

When `endSession()` is called (triggered by session completion in `respond()`), it sets `stateJson: null` and `endedAt` in the D1 row. Additionally, `persistState()` is only called when `result.type !== "complete"`. This means tests that need to verify session state in D1 must read the state BEFORE the session completes — once `respond()` returns `type: "complete"`, the state is already wiped from D1. Use `getSession()` or read `stateJson` between non-completing responses.

**Context:** Integration test for session state coherence. Initial approach of looping responses then reading state failed because the session completed and wiped stateJson.

---

### 2026-03-08: Diagnostic materialization creates invalid FSRS state for mastered topics

**Source:** User session
**Area:** Diagnostic service / FSRS / Simulation

When the diagnostic materializes mastery into `user_topic_state`, mastered topics get `state=2` (Review) but `stability=0` and `difficulty=0`. FSRS's `repeat()` produces NaN when given a Review-state card with zero stability, because the scheduling algorithm divides by stability. The NaN propagates to the `.set({ stability: NaN })` update, and SQLite stores NaN as NULL, triggering the NOT NULL constraint.

**Workaround:** The simulation runner sanitizes post-diagnostic state by setting `stability=15, difficulty=5` for any row with `state=2` and `stability=0`. A proper fix would be for `materializeMastery()` in `diagnostic.ts` to set reasonable FSRS defaults when marking topics as mastered.

**Context:** Discovered while building the simulation framework (Plan 017 Phase 1). The production app may not hit this because sessions might not immediately schedule reviews on diagnostic-mastered topics, but it's a latent bug.

---

### 2026-03-08: V8's `new Date()` does NOT call `Date.now()` internally

**Source:** User session
**Area:** JavaScript / Node.js / Time mocking

Overriding `Date.now()` does NOT affect `new Date()` in V8. The no-arg Date constructor calls the C++ runtime directly to get the current time, bypassing `Date.now()`. To mock time for both patterns, you must replace the Date constructor itself (e.g., via Proxy) — simply patching `Date.now` is insufficient.

**Context:** Simulation time advancement for FSRS scheduling. Services use `new Date()` and `new Date().toISOString()` throughout. A `Proxy`-based approach that intercepts `construct` with zero args works correctly.

---

### 2026-03-08: Drizzle better-sqlite3 adapter is runtime-compatible with D1 adapter services

**Source:** User session
**Area:** Drizzle ORM / Testing / Simulation

Services typed as `DB` (which is `DrizzleD1Database<typeof schema>`) work correctly at runtime when passed a `drizzle-orm/better-sqlite3` instance cast via `as unknown as DB`. The query builder API is identical — `select()`, `insert()`, `update()`, `returning()`, and `db.query.*` relational queries all work. `await` on synchronous better-sqlite3 results is a no-op. This enables running the full service layer against an in-memory SQLite database without miniflare.

**Context:** Simulation framework uses better-sqlite3 (already a root dependency) instead of miniflare for simplicity. All 71 topics, 355 problems, and 142 examples import correctly. Services run diagnostic + multi-session learning loops without modification.

---

### 2026-03-08: Simulation must patch Math.random for deterministic diagnostic topic selection

**Source:** Simulation diagnostic analysis (plan 017 Phase 2)
**Area:** Simulation / Diagnostic service

The diagnostic service uses `Math.random()` for topic selection within `selectNextTopic()`. Without patching Math.random, simulation runs produce different results each invocation even with the same seed — only the answer engine's PRNG was seeded, not the diagnostic's topic selection. Fix: patch `Math.random` with a **separate** seeded PRNG (different seed offset from the answer engine's PRNG, e.g., `seed + 1000000`). Using the same PRNG instance changes the answer sequence because topic selection consumes values from the shared sequence.

**Context:** Discovered when diagnostic analysis produced different placement results on consecutive runs with the same seed.

---

### 2026-03-08: Diagnostic binary search has upward placement bias and bounds lock-in

**Source:** Simulation diagnostic analysis (plan 017 Phase 2)
**Area:** Diagnostic service

The diagnostic's binary search has two related issues revealed by simulation across 10 learner profiles:

1. **Upward placement bias:** `searchLow` ratchets up aggressively on correct answers (`Math.max(searchLow, topicGrade)`) but can never decrease. A single lucky correct answer permanently raises the floor. 5/10 profiles placed above expected frontier grade.

2. **Bounds lock-in:** Once `searchLow = searchHigh`, incorrect answers at that grade can't lower searchHigh (since `Math.min(searchHigh, topicGrade)` is a no-op). All 10 profiles converge to `searchLow = searchHigh` by completion. The diagnostic stops at exactly 8 questions (MIN_QUESTIONS) every time — it converges quickly but potentially prematurely.

**Impact:** The learning session's adaptive difficulty targeting and remediation partially compensate, but struggling students may face initial frustration from inflated placement. Specific fix suggestions documented in `simulations/reports/diagnostic.md` for Phase 6.

---

### 2026-03-08: Diagnostic-materialized mastery is immediately lost when sessions review those topics

**Source:** Simulation trajectory analysis (plan 017 Phase 3)
**Area:** SRS service / Diagnostic service / Session service

When the diagnostic materializes mastery, it sets `mastered=true, state=2 (Review)` but `consecutiveCorrectReviews=0`. The simulation sanitizes `stability=15, difficulty=5` for these topics. However, when the session service reviews a mastered topic, the SRS service re-evaluates the mastery criterion: `consecutiveCorrectReviews ≥ 3 AND stability ≥ 14 AND state = Review`. Since `consecutiveCorrectReviews=0`, the check fails and mastery is cleared. This causes 7/10 profiles to lose ALL diagnostic mastery within 1-5 sessions. strong-older drops from 100% → 0%.

**Code mystery (Phase 6 analysis):** Line 220 of srs.ts has `shouldMasterFinal = !isMisconception && (shouldMaster || state.mastered)` — the `state.mastered` OR clause SHOULD preserve mastery for already-mastered topics. But simulation shows mastery being cleared anyway. This means either: (a) `state.mastered` is false coming in (diagnostic materialization bug), (b) `isMisconception` is true for some reviews (misconception detection false positive), or (c) there's another code path that clears mastery. Investigation needed in Plan 017.5 Phase 1.

**Fix options (Plan 017.5):**
1. Set `consecutiveCorrectReviews=3` during diagnostic materialization
2. Separate "diagnostic mastery" from "earned mastery" — don't re-evaluate diagnostic mastery on review
3. Adjust mastery criterion to not un-master already-mastered topics on correct reviews
4. First priority: trace the exact code path in simulation to identify why `state.mastered` OR clause doesn't preserve mastery

---

### 2026-03-08: Session service never triggers remediation or worked example fading in simulation

**Source:** Simulation trajectory analysis (plan 017 Phase 3)
**Area:** Session service

Across 30 sessions × 10 profiles (15,560 total events), zero remediation events and zero fading-level events were observed. The remediation routing and worked example fading systems exist in the session service code but don't activate under simulation conditions. Possible causes: (1) remediation requires specific failure patterns that the simulation's answer engine doesn't produce, (2) fading levels aren't propagated to the session response items, (3) the session mix (60% review, 40% new) doesn't create conditions where remediation would trigger.

**Impact:** Remediation and fading validation deferred to Phase 6, after the system issues above are addressed.

---

### 2026-03-09: FIRe encompassing credit paradoxically increases review load

**Source:** Simulation adaptive analysis (plan 017 Phase 4)
**Area:** SRS service / FIRe compression

Running identical profiles with and without encompassing edges reveals that FIRe *increases* total reviews by -20.4% (731 vs 501 for average-older, 681 vs 620 for strong-older). FIRe credit keeps more topics "fresh" via fractional credit on reviewed parents, which prevents children from lapsing and dropping out of the review cycle. Without encompassing edges, non-reviewed topics lapse and are naturally pruned from the due list. The `compressReviews` greedy set-cover algorithm selects parent topics that cover more due children, but because those children stay due (via credit), the total review burden grows.

**Fix options for Phase 6:**
1. Only apply FIRe credit when it would SKIP the child's explicit review (true compression), not just reduce time-to-due
2. The session service review budget is fixed at ~60% of interactions — FIRe should reduce the *proportion* of budget spent on reviews, not increase topic throughput
3. Consider FIRe as a scheduling signal (delay the child's next explicit review) rather than a stability credit

---

### 2026-03-09: Session service runs 98-100% reviews, almost no new topic introduction

**Source:** Simulation adaptive analysis (plan 017 Phase 4)
**Area:** Session service / SRS service

All 10 profiles show 97-100% review ratio across 30 sessions (target: ~60%). After diagnostic materializes mastery for many topics, ALL of those topics become immediately due for review (due dates are set to now). The session mix algorithm gives 60% of slots to reviews, but with 40-71 topics all due simultaneously, the review budget is exhausted before any new topics are introduced. Since topics don't gain mastery and keep failing the mastery criterion, they cycle back as perpetually-due reviews.

**Impact:** New frontier topics are never introduced. Learning stagnates on review cycling. The session service needs a max-reviews-per-session cap or a mechanism to "graduate" topics from review even without meeting the strict mastery criterion.

---

### 2026-03-09: Simulation analysis baseline must match session count for regression checks

**Source:** User session
**Area:** Simulation framework

The fast regression check runs 3 profiles × 5 sessions, while the full analysis runs 10 profiles × 15-30 sessions. Comparing 5-session metrics against a 30-session baseline produces false regressions (e.g., same-strand adjacency rate varies with session count). The regression script uses its own `regression-baseline.json` created from matching 5-session runs. The full `baseline.json` is for `just simulate-compare` after deep analysis runs.

**Context:** Separate baseline files avoid session-count mismatches between fast regression checks and deep analysis.

---

### 2026-03-08: Simulation must pass problemId for correct server-side grading

**Source:** Plan 017.5 Phase 1 investigation
**Area:** Simulation / Session service

The simulation runner was not passing `problemId` when calling `sessionSvc.respond()`. The session service falls back to `problems[0]` (first problem from `getAllTopicProblems`) when no `problemId` is provided. Since `selectProblem` often picks a different problem than `problems[0]`, the server graded answers against the wrong problem — causing correct answers to be marked incorrect. Combined with calibrated confidence (3-5 when "correct"), this triggered false misconception detection, stripping mastery from correctly-answered topics.

**Fix:** Pass `problemId: problem.id` in the simulation's respond call.

---

### 2026-03-08: FSRS rating-based correctness vs actual correctness for mastery

**Source:** Plan 017.5 Phase 1 investigation
**Area:** SRS service

`isCorrectReview = rating >= Rating.Good` (3) treats hint-capped ratings as incorrect. When a student answers correctly but uses 3+ hints, the session caps the rating to `Rating.Hard` (2), making `isCorrectReview = false`. Combined with confidence >= 4, this falsely triggers misconception detection.

**Fix:** Added `isActuallyCorrect = rating >= Rating.Hard` (2). Used `isActuallyCorrect` for mastery tracking, consecutive correct/incorrect counters, misconception detection, and review log correctness. `isCorrectReview` is still used for FSRS scheduling quality (fragile knowledge detection, confidence calibration).

**Key insight:** A correct answer with hints is NOT a misconception. The rating cap is a scheduling signal (schedule more reviews), not a correctness signal.

---

### 2026-03-09: Remediation requires failure accumulation, not single-failure trigger

**Source:** Plan 017.5 Phase 2
**Area:** Session service / Remediation

Single-failure remediation (entering remediation on the first incorrect answer in independent phase) is too aggressive. With the diagnostic materializing 40-71 topics into the review queue, students interact with many topics — a single failure is often noise. The 2-failure threshold within a session provides a better signal that the student genuinely struggles with a topic.

**Implementation:** `sessionFailures: Record<string, number>` on `SessionState` tracks per-topic failure counts across all phases (pretest, guided, independent, review). Remediation triggers when any topic accumulates 2+ failures. Review topics get a retry on first failure before moving on.

---

### 2026-03-09: Review topics must participate in remediation routing

**Source:** Plan 017.5 Phase 2
**Area:** Session service / Remediation

When the diagnostic materializes many topics (40-71), sessions become 100% review with 0 new topic introduction. If review topics can't trigger remediation, the remediation system is completely bypassed. Review topics now get a retry on first failure (stay on topic) and trigger remediation on 2nd failure via the accumulated `sessionFailures` counter.

---

### 2026-03-09: FIRe stability bonus model doesn't work — FSRS overwrites on next review

**Source:** Plan 017.5 Phase 3 implementation
**Area:** SRS service / FIRe credit

Attempted to change FIRe credit from due-date advancement to stability bonus: boost child topic's `stability` value so FSRS schedules the next review further out. Failed because FSRS recomputes stability from scratch on every `scheduleReview()` call: `scheduling[rating].card.stability` overwrites the bonus completely. The stability bonus is ephemeral — it exists only between FIRe credit application and the next explicit review. Due-date extension (pushing due dates further out) works because FSRS sets a NEW due date on each review but doesn't read/consider the current due date for scheduling calculations.

---

### 2026-03-09: compressReviews greedy set-cover had coverage leak — covered children not removed from remaining

**Source:** Plan 017.5 Phase 3 analysis
**Area:** SRS service / review compression

The `compressReviews()` greedy set-cover algorithm marked covered children in a `covered` Set but did NOT remove them from the `remaining` Set. This meant the loop continued selecting topics from the full candidate pool until `budget` was reached, regardless of how many topics were already implicitly covered. Fix: also call `remaining.delete(id)` for each covered child. This enables the loop to terminate early when all due topics are covered with fewer than `budget` explicit reviews.

---

### 2026-03-09: FIRe compression requires reduced review dominance to be effective

**Source:** Plan 017.5 Phase 3 simulation gate
**Area:** FIRe / session service

FIRe due-date extension and review compression both work at the unit test level, but show 0% compression in simulation. Root cause: diagnostic materializes 40+ topics simultaneously, all immediately overdue. With this many due topics, the review budget (5 slots) always fills regardless of FIRe compression. FIRe can only reduce explicit reviews when the due pool is small enough that compression reduces it BELOW the budget. Requires Phase 4 session mix changes (review cap, new-topic guarantee) to reduce the perpetually-full review queue.

---

### 2026-03-09: Simulation interleaving metric must measure topic-transition adjacency, not event-level

**Source:** Plan 017.5 Phase 4 implementation
**Area:** Simulation / adaptive-analysis

The `adaptive-analysis.ts` same-strand adjacency metric was measuring consecutive event pairs (every problem/answer in a session). This inflated adjacency to 25-96% because the learning loop naturally stays on one topic for 10-20 events (pretest → instruction → guided → independent). Fix: deduplicate consecutive same-topic events into a topic sequence, then measure strand adjacency on topic transitions only. This dropped average adjacency from 25.6% to 11.9% and correctly reflects the mix-level interleaving quality.

---

### 2026-03-09: Session mix must be cached in session state to prevent re-interleaving

**Source:** Plan 017.5 Phase 4 debugging
**Area:** Session service

`nextTopic()` was calling `srs.getSessionMix()` on every topic transition, which recomputed the mix each time. This caused: (1) interleaving to be lost as the mix was regenerated, (2) topics already completed to reappear, (3) sessions stuck on the same topic for 100 events. Fix: cache `mix.items` in `SessionState.sessionMix` on `startSession()` and reuse it in `nextTopic()`, filtering by `topicsCompleted`.

---

### 2026-03-09: Review handler must push to topicsCompleted on all exit paths

**Source:** Plan 017.5 Phase 4 debugging
**Area:** Session service

The `advancePhase()` review handler was moving to the next topic without adding the current topic to `topicsCompleted`. This caused `nextTopic()` to return the same topic repeatedly (100 events on the same topic). Fix: ensure every exit path from review handling (correct answer, warmup failure, remediation trigger, max retries) pushes `currentTopicId` to `topicsCompleted` before calling `nextTopic()`.

---

### 2026-03-09: Remediation on warmup topics causes infinite loops

**Source:** Plan 017.5 Phase 4 debugging
**Area:** Session service / remediation

Warmup topics (mastered topic recall) are single review problems. When a warmup topic triggers remediation (on failure), the remediation can loop because warmup topics don't follow the full learning loop. Fix: skip remediation for warmup topics (they're mastered, failure is noise) and for already-remediated topics (prevent re-triggering). Added `isWarmup` check on `currentBlendRole` and `remediatedTopics` tracking in session state.

---

### 2026-03-09: Diagnostic frontier topics must be excluded from getDueTopics

**Source:** Plan 017.5 Phase 4 debugging
**Area:** SRS service / session mix

After diagnostic, frontier topics are materialized with `reps=0, mastered=false`. `getDueTopics()` was including these as review candidates because they're non-mastered and past due. But they've never been studied — they should appear as NEW topics, not reviews. Fix: filter `getDueTopics()` to only return topics with `reps > 0`. Also detect diagnostic frontier topics in `computeFrontier()` (frontier=true, mastered=false, reps=0) and include them in the frontier instead of excluding them.

---

### 2026-03-09: Snap weight redistribution must target drift direction, not highest weight

**Source:** Plan 017.5 Phase 5
**Area:** Presentation drift / content service

When presentation weights are snapped (values below `snapThreshold` redistributed), the snapped weight must go to the drift target level — not the highest-weight level. If snapped weight goes to highest weight, it fights downward drift: a struggling student's weight accumulates at the current center instead of the level they're drifting toward, preventing center shift.

---

### 2026-03-09: Hardcoded DDL in test helpers and simulation db-setup must be updated with schema changes

**Source:** Plan 017.5 Phase 5
**Area:** Testing / schema migrations

Adding a column to `schema.ts` and generating a D1 migration is not enough. The vitest workers (miniflare) use hardcoded CREATE TABLE statements in `packages/api/src/__tests__/helpers.ts`, and simulations use a separate copy in `simulations/src/db-setup.ts`. Both must be updated manually when schema changes. Forgetting either causes "no such column" errors only visible at test/simulation runtime.

---

### 2026-03-09: Diagnostic binary search floor must not ratchet up monotonically

**Source:** Plan 017.5 Phase 6
**Area:** Diagnostic service / placement

`searchLow` (the confirmed grade floor) was a one-way ratchet: `Math.max(searchLow, topicGrade)` on correct answers, never decreasing. This caused upward placement bias (5/10 profiles). Fix: (a) allow floor decrease on 3+ consecutive failures at/below floor, (b) prevent full lock-in when `searchLow >= searchHigh` during search. Conservative thresholds (3 consecutive, not 1) prevent stochastic noise at 60-70% accuracy frontier grades from pulling the floor down.

---

### 2026-03-09: Diagnostic should not stop until bounds converge

**Source:** Plan 017.5 Phase 6
**Area:** Diagnostic service / stopping criteria

With `MIN_QUESTIONS = 8`, the diagnostic could stop even if `searchHigh - searchLow > 1` (wide bounds = low confidence). Added a convergence gate: don't stop if `boundaryRange > 1` regardless of question count. `MAX_QUESTIONS = 15` prevents infinite questioning. Result: struggling profiles now get 10-13 questions (previously always 8), producing accurate placement.

---

### 2026-03-09: Diagnostic-only simulation runs shadow full runs in analysis tooling

**Source:** Plan 017.5 Phase 7
**Area:** Simulation tooling

`findLatestRuns()` in `adaptive-analysis.ts` picks the most recent run directory per profile. Running `just simulate-diagnostic` creates 0-session (diagnostic-only) run directories with timestamps AFTER the 30-session full runs. The adaptive analysis then reads these diagnostic-only runs and reports 0 problems, 0 remediation, 0% interleaving — all metrics show initial=final. Fix: delete diagnostic-only and short-run directories before running analysis, or add a sessions-minimum filter to `findLatestRuns()`.

---

### 2026-03-09: Simulation baseline must be regenerated after system-level changes

**Source:** Plan 017.5 Phase 7
**Area:** Simulation tooling

The 30-session `baseline.json` was from pre-017.5 (showed 0% mastery for most profiles, 99% review ratio). Comparing post-017.5 runs against this stale baseline produced 19 false "regressions" — the baseline reflected broken system behavior, not target behavior. After major system changes (mastery, remediation, session mix), always regenerate the baseline from a fresh full run before using `simulate-compare`.

---

### 2026-03-09: Top-level await breaks tsx/esbuild in CJS mode for simulation scripts

**Source:** Plan 017.7 Phase 2
**Area:** Simulation tooling / TypeScript

Simulation scripts run via `npx tsx` default to CJS output format. Top-level `await` (e.g., `const x = await import(...)` at module scope) causes esbuild `TransformError`. Workaround: use static imports, or wrap async code in a `main()` function. Also guard CLI execution with `if (process.argv[1]?.endsWith("filename.ts"))` so the main block doesn't fire when the module is imported by tests or other scripts.

---

### 2026-03-09: loadTargets() returns LoadResult wrapper, not TargetFile directly

**Source:** Plan 017.7 Phase 5
**Area:** Simulation tooling

`loadTargets()` in `simulations/src/load-targets.ts` returns `{ targets, errors, warnings }` (type `LoadResult`), not a raw `TargetFile`. Code consuming targets must destructure: `const { targets } = loadTargets()`. This tripped up `detect-changes.ts` which tried to call `Object.entries(targets.systems)` on the wrapper object.

---

### 2026-03-09: Justfile named args require positional invocation from CLI

**Source:** Plan 017.7 Phase 6
**Area:** Build tooling / justfile

`just heal-epoch sessions="30" seed="42"` passes the literal strings `sessions=30` and `seed=42` as argument values, causing `--sessions sessions=30` which parses as NaN. Use positional arguments instead: `just heal-epoch 30 42`. This caused epoch-1 to run 0 sessions (diagnostic only) with NaN seed.

---

### 2026-03-09: Interleaving metrics insensitive when review ratio >95%

**Source:** Plan 017.7 Phase 6
**Area:** Simulation / healing loop

When the review/new ratio is >95% (as in current post-diagnostic sessions), same-strand adjacency rate is low regardless of whether the strand-aware shuffle is active, disabled, or reversed. Reviews of diverse topics naturally intersperse, masking the shuffle algorithm's effect. Interleaving mini-sim verification is only meaningful when the review ratio is closer to the 60/40 target.

---

### 2026-03-09: FIRe compression requires non-mastered topics in the review pool

**Source:** Plan 017.7 Phase 7
**Area:** Diagnostic / SRS / FIRe

applyFIReCredit skips mastered=true children, and compressReviews only operates on getDueTopics (mastered=false, reps > 0). When diagnostic materializes 44 topics as mastered=true, FIRe has nothing to compress. The fix: reduce materialization to placement grade only (skip grades below placement). computeFrontier infers implicit mastery from diagnostic topicEstimatesJson. Result: 0% → 8.5% FIRe compression.

---

### 2026-03-09: Reduced materialization causes interleaving regression via warmup diversity

**Source:** Plan 017.7 Phase 7
**Area:** Session mix / interleaving

With fewer mastered topics materialized (15 instead of 44), the warmup pool is smaller and less strand-diverse. Sessions start with frontier topics from the same area, increasing same-strand adjacency (0.071 → 0.144). Fix needed: improve strand diversity in getSessionMix when warmup pool is small, or add synthetic diversity from implicit mastery pool.

---

### 2026-03-09: FIRe paired evaluation is noisy at smaller materialization differences

**Source:** Plan 017.7 Phase 7
**Area:** Simulation / evaluation

The ±1 materialization approach (25 mastered topics) showed noisy FIRe paired results: average-older went -14.9% (more reviews WITH FIRe). The ±0 approach (15 mastered topics) showed consistent positive results (8.5% average). Larger materialization reductions produce clearer FIRe signals because the session dynamics diverge more between with/without encompassing runs.

---

### 2026-03-09: Simulation metrics must account for implicit mastery after reduced materialization

**Source:** Plan 017.8 Phase 1
**Area:** Simulation / metrics

After reduced materialization (017.7), three locations counted mastered topics from `user_topic_state` only, missing topics implicitly mastered via diagnostic estimates (prob ≥ 0.6 in `diagnosticSessions.topicEstimatesJson`):

1. `runner.ts:takeStateSnapshot()` — undercounted mastery in state snapshots
2. `runner.ts:saveDiagnosticResult()` — undercounted `masteredTopicIds` in diagnostic results
3. `progress.ts:/completion` route — undercounted user completion percentages

Pattern: any new code that counts mastered topics must check both `user_topic_state` rows with `mastered=true` AND diagnostic estimates with prob ≥ 0.6 for topics not in `user_topic_state`. Reference `computeFrontier()` in `graph.ts` for the canonical pattern.

---

### 2026-03-09: Mastery preservation metric must use materialized mastery, not total

**Source:** Plan 017.8 Phase 1
**Area:** Simulation / evaluation

The mastery preservation metric (S0 → S1 drop) showed 36.6% false failure because S0 included implicit mastery (44 topics = 62%) which naturally decreases as topics move from implicit → materialized with `mastered=false`. The fix: use `materializedMasteryCount` (earned SRS mastery) for preservation, not total `masteryCount`. Added `materializedMasteryCount` field to `StateSnapshot` type. After fix: mastery preservation = 1.4% (PASS).

---

### 2026-03-09: FIRe architecture — three fixes to reach positive compression

**Source:** User session + Plan 017.8 Phase 5
**Area:** SRS / FIRe compression

Three issues caused FIRe compression to be 0% or negative:

1. **Due-date extension conflicts with FSRS** — extending `due` without updating `lastReview`/`stability` made FSRS interpret longer gaps as decay, increasing reviews. Fixed: virtual FSRS reviews via `repeat(card, Rating.Good)` with stability interpolated by weight.
2. **Upward penalty counteracts FIRe credit** — `applyUpwardPenalty()` pulled parent due dates closer on child failure. For struggling profiles, penalty-driven reviews exceeded FIRe savings (-33.8% for misconception-fractions). No research basis in FIRe model. Fixed: disabled in session loop.
3. **Non-Review state virtual reviews** — FSRS Learning/New states produce 0 or negative stability from Good rating. Fixed: `State.Review` filter in `applyFIReCredit()`.

After all three fixes: -10.5% → +1.2% average, strong-older at +25%. Remaining gap to 20% target requires more encompassing edges (currently 15 / 71 topics).

**Context:** Paired evaluation IS deterministic (Math.random seeded via SimulationRunner). FSRS fuzz is NOT a confound — earlier suspicion was incorrect.

---

### 2026-03-09: Mini-verify (heal-verify) is unreliable for metrics requiring many sessions

**Source:** Plan 017.8 Phase 5 (training run epochs 2-3)
**Area:** Healing / training loop

`heal-verify` runs 3 profiles × 10 sessions for quick feedback. This is insufficient for `mastery_convergence` (needs 30 sessions to build mastery) and `review_new_balance` (needs enough sessions for frontier exhaustion to manifest). Mini-verify also measures `in_range` metrics incorrectly — it reports "worsened" when moving *toward* the target range if the delta direction is ambiguous. Use full evaluation (`just evaluate`) for these metrics.

---

### 2026-03-09: Frontier exhaustion limits review/new balance with small content sets

**Source:** Plan 017.8 Phase 5 (training run epoch 2)
**Area:** Session mix / content

With only ~27 frontier topics in math-foundations, the frontier dries up by session ~10 regardless of session mix tuning. After that, sessions are 100% review. The review/new balance target (0.50-0.70) is mathematically unreachable without more content. Aggressive tuning (lower review cap, higher new topic cap) degrades interleaving quality. The fix is content expansion, not parameter tuning.
