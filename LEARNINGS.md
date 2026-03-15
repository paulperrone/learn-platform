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

**Impact:** The learning session's adaptive difficulty targeting and remediation partially compensate, but struggling students may face initial frustration from inflated placement. Specific fix suggestions documented in `audit/reports/diagnostic.md` for Phase 6.

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

Adding a column to `schema.ts` and generating a D1 migration is not enough. The vitest workers (miniflare) use hardcoded CREATE TABLE statements in `packages/api/src/__tests__/helpers.ts`, and simulations use a separate copy in `audit/learner-simulations/src/db-setup.ts`. Both must be updated manually when schema changes. Forgetting either causes "no such column" errors only visible at test/simulation runtime.

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

`loadTargets()` in `audit/learner-simulations/src/load-targets.ts` returns `{ targets, errors, warnings }` (type `LoadResult`), not a raw `TargetFile`. Code consuming targets must destructure: `const { targets } = loadTargets()`. This tripped up `detect-changes.ts` which tried to call `Object.entries(targets.systems)` on the wrapper object.

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

---

### 2026-03-09: Ceiling profiles show lower final mastery than ability suggests due to early session exits

**Source:** Plan 017.9 Phase 1
**Area:** Simulation / profile calibration

Profiles with very high ability (strong-older, strong-highschool, gifted-middle) complete sessions with far fewer events (~165-355 vs ~2000+ for average profiles) because the content ceiling is reached quickly. This means fewer topics are practiced and mastered in 30 sessions despite near-perfect accuracy. Final mastery of 0.70-0.80 (not 0.90+) is expected. Also, high ability across all grades pushes presentation drift toward "advanced" regardless of age — strong-older (14) and gifted-middle (10) both drift up because ability level maps to "standard"/"advanced" in the presentation drift logic.

**Context:** Profile expectations (min/max final mastery, expected presentation center) must account for this ceiling effect when calibrating targets.

---

### 2026-03-10: Content quality patterns that cause low simulation accuracy

**Source:** Plan 018 Phase 1
**Area:** Content authoring / grading

Three content patterns cause systematically low accuracy in simulations (and likely in production):

1. **Multi-value answers** — "List all factor pairs: 1×12, 2×6, 3×4" — text-qa grading compares a single string, so list-format answers almost never match. Convert to count-based questions ("How many factor pairs does 12 have?" → "6").
2. **Multi-part questions** — "What angle is this? What type?" — grader only checks the `answer` field (one value), so the second part is ungraded but confuses students who include both. Split into separate problems or remove the ungraded part.
3. **Ambiguous fraction formats** — "1 3/20" could also be "23/20". Specify the expected format in the question ("Write your answer as an improper fraction").

---

### 2026-03-09: Supplementary content agents can overwrite procedural generator output

**Source:** Plan 018 Phase 3
**Area:** Content pipeline / tooling

When running parallel background agents to author supplementary problems for non-generatable topics, agents may also write files for topics that already have procedural generator output in `problems-generated/`. This silently replaces 50 procedural problems with 15 supplementary ones. Fix: after all supplementary agents complete, re-run `npx tsx tools/generate-problems.ts --count 50 --seed 42` to regenerate all procedural topics — generator output is deterministic and idempotent, so it safely overwrites any accidental replacements without affecting supplementary-only topics (which have no registered generator).

---

### 2026-03-09: problems-generated/ files must match topicId to filename for coverage detection

**Source:** Plan 018 Phase 3
**Area:** Content pipeline / validation

The validate-content and content-status tools detect topic coverage by matching `<topic-id>.json` filenames against graph topic IDs. Problem files must be named exactly `<topicId>.json` (e.g., `add-within-5.json`) and contain problems where `p.topicId` matches. If the filename doesn't match the topicId, the topic will show as "missing problems" even though problems exist. This applies to both `problems/` and `problems-generated/` directories.

**Context:** These patterns were the root cause for 6 topics with <50% overall accuracy despite content being conceptually correct. The grading service (`grading.ts`) does text normalization + numeric fallback, but can't handle lists or multi-part answers.

### 2026-03-10: import-content.ts must import all subjects before inserting edges

**Source:** Plan 018 Phase 4 — ELA cross-subject prerequisites failed FK constraints
**Area:** Content pipeline / import

When subjects have cross-subject prerequisite edges (e.g., `ela-k5:key-details` → `math-foundations:add-subtract-word-problems-1`), the import script must insert ALL subjects' topics before inserting ANY prerequisites. The previous single-subject import failed because `from` topic IDs referenced topics not yet imported.

Fix: Two-phase import — (1) iterate subjects inserting subjects + topics + content, (2) iterate again inserting prerequisites + encompassings. Cross-subject edges are stored in the *target* subject's `graph.json` using `"subject:topic-id"` format for the `from` field.

---

### 2026-03-10: Audio-dependent ELA standards adapted to text-only

**Source:** Plan 018 Phase 4
**Area:** Content / ELA

Common Core ELA phonics standards (RF.K.2a-d: rhyming, syllable counting, phoneme blending/segmenting) and fluency standards (RF.x.4: timed oral reading) require audio. These cannot be assessed on a screen + text platform. Adaptations: oral phoneme manipulation → visual letter-sound blending (CVC words); oral fluency → omitted entirely. Text-based decoding accuracy is the platform's strength.

---


---

### 2026-03-10: Context-layered subjects need historical-skills topics connected to the content graph

**Source:** User session — Plan 018 Phase 5
**Area:** Content / knowledge graph design

When designing context-layered subjects (history), foundational skill topics (e.g., "primary sources intro", "cause and effect", "historical perspectives") tend to be created as standalone nodes disconnected from the chronological content graph. The graph validator flags these as orphans. These skill topics MUST have `recommended` edges pointing INTO the content topics that use those skills (e.g., `cause-and-effect-in-history` → `causes-of-revolution`). Without these edges, the skill topics are unreachable in the frontier and never served to learners.

**Context:** Applies to any context-layered subject where methodological/analytical skill topics sit alongside content topics. The skill topics are prerequisites for deeper analysis but not for survey-depth content — use `recommended` edges, not `required`.

---

### 2026-03-10: Simulation DB DDL must be kept in sync with schema migrations

**Source:** Plan 018 Phase 6
**Area:** Simulation / DB setup

`audit/learner-simulations/src/db-setup.ts` has hardcoded CREATE TABLE statements (not generated from Drizzle schema). When Phase 3.5 added the `source` column to `assessment_content`, the simulation DDL wasn't updated, causing "no such column: source" errors. Fix: manually added the column. Future schema migrations that add columns used by services must also update `db-setup.ts SCHEMA_STATEMENTS`.

---

### 2026-03-10: Math prerequisite edges were missing type field

**Source:** Plan 018 Phase 6
**Area:** Content / graph validation

Both `math-foundations` (146/148 edges) and `math-middle` (173/173 edges) had prerequisite edges with no `type` field. Only the 2 cross-subject ELA edges in math-foundations had `type: "required"`. ELA and US History were fine. The edge insertion code defaulted to `"required"` but the field should be explicit for mastery-gated disciplines. Fixed by backfilling all missing types to `"required"`.

---

### 2026-03-10: Interleaving metric must exclude remediation events and measure per-session

**Source:** User session — Plan 019 Phase 2
**Area:** Simulation / evaluation metrics

The interleaving quality metric was measuring same-strand adjacency across ALL events in ALL sessions as one continuous sequence. Two problems: (1) inter-session transitions are not controlled by the interleaving algorithm, and (2) remediation chains (90+ events bouncing between same-strand prerequisite topics like `count-to-10` ↔ `count-to-20`) dominated the metric. Remediation is pedagogically correct — it SHOULD focus on the struggling strand. Fix: group events by session number and exclude `phase === "remediation"` events. Result: 0.254 → 0.085 (PASS).

**Context:** Applies to any evaluation metric that measures algorithm effectiveness — only count events the algorithm controls.

---

### 2026-03-10: Binary mastery creates a shrinking FIRe pool that limits compression

**Source:** User session — Plan 019 Phase 2.5 design
**Area:** SRS / FIRe compression

FIRe compression is structurally limited because `mastered: boolean` retires topics from both the review queue (`getDueTopics` filters `mastered = false`) and FIRe credit (`applyFIReCredit` skips mastered). With mastery at stability ≥ 4 days (achieved in 3–4 successful reviews), topics spend only 5–10 sessions in FIRe's eligible pool. By session 20+, most early topics are mastered and invisible to FIRe. Math Academy's system keeps topics in SRS with growing intervals — FIRe extends those intervals without explicit reviews, achieving "one review per topic" over a full course.

**Context:** This is the structural reason FIRe compression is hard to improve with constant tuning. The fix requires graduated mastery (keeping recently-mastered topics in the system).

---

### 2026-03-10: Adding mastered topics to review queue worsens FIRe compression

**Source:** User session — Plan 019 Phase 2.5
**Area:** SRS / FIRe compression / graduated mastery

Adding recently-mastered topics (stability 4–90 days) back into `getDueTopics()` causes FIRe compression to drop from -1.1% to -30.6%. Root cause: FIRe credit accelerates mastery by extending stability → more topics cross the mastery threshold faster → more topics enter the recently-mastered review pool → MORE reviews in the "with FIRe" run than "without". misconception-fractions went from with=64/without=72 (11.1% compression) to with=66/without=36 (-83.3%). The correct approach: let FIRe credit maintain mastered topics implicitly (extend their stability toward permanent mastery) WITHOUT adding them to the explicit review queue.

**Context:** This is the key interaction between graduated mastery and FIRe paired comparison. Any change that adds reviews must be carefully evaluated against the paired measurement methodology.

---

### 2026-03-10: FIRe paired comparison at 15 sessions is dominated by butterfly effects

**Source:** User session — Plan 019 Phase 2.5
**Area:** Simulation / FIRe evaluation methodology

The FIRe paired comparison (with vs without encompassing edges) diverges after ~5 sessions because different topic mastery timing → different frontier → different session mixes. At 15 sessions, the measurement is noisy: average-older consistently shows -20.6% compression regardless of engine changes, driven by trajectory divergence rather than algorithmic failure. Meanwhile misconception-fractions and fast-learner show positive compression (6-11%). Longer horizons (30-90 sessions) should produce more stable measurements as the butterfly effects average out over more sessions.

**Context:** When FIRe compression is stuck, check whether the measurement window is long enough before concluding the algorithm is broken.

---

### 2026-03-10: FIRe compression metric measures the wrong thing — total reviews vs efficiency

**Source:** User session — Plan 019 Phase 2.5/2.6
**Area:** SRS / FIRe evaluation methodology

The FIRe paired comparison measures `(withoutReviews - withReviews) / withoutReviews` — total review count across all sessions. But `compressReviews()` doesn't reduce reviews per session. It uses greedy set-cover to select parent topics, then removes covered children from the candidate pool. The freed slots go to NEW topic introductions (`mainNewCount = mainSlots - actualReviewCount`). So FIRe students progress faster → encounter more topics → more topics enter the SRS system → more future reviews → negative "compression". The metric punishes FIRe for working correctly. The correct metric is efficiency: reviews per mastered topic, or mastery achieved at a fixed session count.

**Context:** This explains why FIRe compression has been stuck at -1% to -3% despite correct algorithm implementation and good encompassing density. The engine is working — the measurement is wrong.

---

### 2026-03-10: FIRe paired comparison tests more than just FIRe credit

**Source:** User session — Plan 019 Phase 2.6
**Area:** SRS / FIRe evaluation methodology

Removing encompassing edges for the "without FIRe" comparison changes TWO things: (1) `applyFIReCredit()` has no edges to traverse, and (2) `compressReviews()` falls back from set-cover optimization to simple most-overdue ordering. The second effect is arguably larger — review ordering determines which topics get practiced and when they reach mastery. At 15 sessions, the simpler ordering (no set-cover) consistently produces MORE mastered topics, suggesting the set-cover optimization may be counterproductive at short horizons.

**Context:** When analyzing FIRe efficiency results, consider that the measurement captures the full encompassing system (credit + ordering), not just the credit mechanism. To isolate FIRe credit alone, you'd need to disable only `applyFIReCredit()` while keeping encompassing edges for `compressReviews()`.

---

### 2026-03-11: FIRe virtual credit hurts efficiency at short horizons (15 sessions)

**Source:** User session — Plan 019 Phase 2.7
**Area:** SRS / FIRe algorithm

Isolation experiments (4 modes × 3 profiles) show that `applyFIReCredit()` virtual FSRS reviews are the primary cause of negative FIRe efficiency at 15 sessions (-25.5% avg across profiles). The credit extends child topic stability, which delays their natural mastery through actual reviews. Set-cover ordering in `compressReviews()` is neutral for 2/3 profiles — it selects the same topics as simple most-overdue at this horizon. Large non-additive interactions (+29.6% for fast-learner) mean the mechanisms partially cancel each other when combined.

**Context:** FIRe diagnostic available via `npx tsx audit/learner-simulations/src/evaluate.ts --fire-isolation`. `FireDiagnosticConfig` (`disableCredit`, `disableOrdering`) passed through `createSessionService` → `createSRSService` — optional params that default to current production behavior.

---

### 2026-03-11: Review/New Balance degrades from WARN to FAIL at L3 (90 sessions)

**Source:** User session — Plan 019 Phase 4
**Area:** Simulation / evaluation metrics

At L2 (30 sessions), Review/New Balance is WARN at 0.729 (target: 0.600 ± 0.05). At L3 (90 sessions), it degrades to FAIL at 0.860 — 86% reviews vs 14% new content. The review queue grows as topics enter SRS faster than students master them. This is a structural scaling issue: once a topic enters the review queue, it generates future review obligations. At shorter horizons, new topic introductions dilute the ratio; at longer horizons, the accumulated review backlog dominates.

**Context:** This insight is only visible at L3 (90 sessions). L2 baselines mask the problem. Use `just evaluate-l3` and `just evaluate-compare-levels` to monitor cross-level trends. Fix options: more aggressive mastery thresholds, review compression, or review queue caps.

---

### 2026-03-11: Diagnostic credit propagation and mastery criterion are multiplicative — tune one at a time

**Source:** Plan 019 Phase 4.5A
**Area:** Diagnostic / mastery calibration

Reducing diagnostic credit AND tightening mastery criterion simultaneously caused catastrophic mastery convergence failure (17→1 profiles reaching 50% at L2). Each change alone was viable (diagnostic reduction: 17→14, mastery tightening alone: untested in isolation because the interaction was discovered first). The correct approach: change diagnostic credit first, evaluate, then consider mastery criterion adjustment IF still needed.

Strong-older plateauing at session 9 is a **content ceiling** problem (92 math-foundations topics), not a calibration problem. A 14-year-old who answers grade-5 math correctly genuinely knows K-5 math — giving them grade-0 topics to "prove" mastery is pedagogically wrong. Fix: multi-subject profiles + content expansion (Phase 4.5B), not stricter mastery.


---

### 2026-03-11: Math Academy graph structure — K-8 content is spread across 6 courses with significant HS overlap

**Source:** User session — Plan 021 Phase 1
**Area:** Content / MA cross-reference

MA's K-8 relevant content spans 6 courses: 4th Grade Math (137 topics), 5th Grade Math (132), Mathematical Foundations I (352), Foundations II (357), Foundations III (323), and Prealgebra (205). However, Foundations I-III contain substantial high school content (trigonometry, conic sections, calculus intro, linear algebra) mixed with K-8 material. To get genuine K-8 topics, filter by unit names — units like "Fractions", "The Number System", "Ratios & Percentages" are K-8; units like "Trigonometry", "Conic Sections", "Integration Techniques" are HS. Many topics appear in multiple courses (dedup by `node.id`). Edge data uses numeric IDs (`from`/`to`), not string slugs.

**Context:** When cross-referencing MA for future strands or disciplines, always dedup by topic ID and filter by unit-level K-8 relevance rather than course-level.

---

### 2026-03-12: R2 content migration — optional R2 with D1 fallback preserves test compatibility

**Source:** User session — Plan 023 Phase 2
**Area:** Content architecture / testing

When migrating content service from D1 to R2, making R2Bucket optional in factory signatures (`createContentService(db, r2Bucket?)`) with automatic D1 fallback avoids a big-bang test migration. Phase 3 removed the D1 fallback and content tables — all tests now seed content into R2 via miniflare's `r2Buckets: ["CONTENT"]` config. The `seedAssessmentContent`/`seedInstructionalContent` helpers write to `env.CONTENT` R2 bucket.

**Context:** Applied to `createContentService`, `createSessionService`, `createDiagnosticService`. The `ContentQuery` type's `discipline` field is now effectively required — R2 needs it for key construction (`{discipline}/{topicId}/problems.json`). Without discipline, content service returns `[]`.

---

### 2026-03-12: R2 content test seeding — discipline path must match between seed and query

**Source:** User session — Plan 023 Phase 3
**Area:** Testing / R2 content

When seeding content into R2 for tests, the `disciplineId` used in `seedAssessmentContent(topicId, { disciplineId: "x" })` determines the R2 key path (`x/{topicId}/problems.json`). If the test creates a topic under discipline "disc-foo" but seeds content with the default `disciplineId: "math"`, the content service can't find it because it looks at `disc-foo/{topicId}/problems.json`. Always pass the matching `disciplineId` override to seed helpers. This caused 47 test failures during the Phase 3 D1→R2 migration.

**Context:** Applies whenever adding new tests that seed content, or when creating topics under non-default disciplines.

---

### 2026-03-12: graph.json prerequisites and encompassings require `strength` and `weight` fields

**Source:** User session — Plan 021 Phase 5
**Area:** Content pipeline / graph import

The `prerequisites` table has `strength REAL NOT NULL DEFAULT 1.0` and `encompassings` has `weight REAL NOT NULL DEFAULT 1.0`. The D1 default saves you if you insert via raw SQL, but the import tool (`import-content.ts`) passes `p.strength` and `e.weight` directly — no fallback. When adding edges programmatically (e.g., via Python scripts), always include `"strength": 1.0` in prereq objects and `"weight": 0.5` in encompassing objects, or the import will fail with `SQLITE_CONSTRAINT_NOTNULL`.

**Context:** Hit this when adding 24 new prerequisite edges and 378 new encompassing edges in Phase 5 gap-fill. Fixed by patching all missing fields before import.

---

### 2026-03-12: Expansion map encompassing specs were capstone-to-split only — systematic hierarchy coverage was missing

**Source:** User session — Plan 021 Phase 5
**Area:** Content graph / FIRe credit

After Phases 1-4 (Waves 1-3), encompassing density was 0.48/topic (333 edges / 695 topics) — far below the 1.0-2.0 target. The expansion map's encompassing sections only specified direct capstone-to-split edges (e.g., "add-subtract-fractions encompasses add-fractions-like-denom"). Systematic within-strand hierarchy (advanced topics encompassing their procedural prerequisites) was never added. This means FIRe credit barely fired in practice — only for the specific splits mentioned in the expansion map.

**Context:** Phase 5 added 378 new encompassing edges through 5 systematic rounds, pushing density from 0.48 to 1.01/topic. For future content expansion waves, include systematic encompassing passes as part of the wave (not deferred to a gap-fill phase).

---

### 2026-03-12: Grade-band collection membership goes stale after gap-fill phases

**Source:** User session — Plan 021 Phase 6
**Area:** Content pipeline / collections

Grade-band collections (math-k-2, math-3-5, math-6-8) are not auto-updated when new topics are added. After Phase 5 gap-fill added 10 bridge topics and 6 grade-5 exponent topics, the collections were missing those entries. Found in Phase 6: math-3-5 was missing 6 exponent topics; math-6-8 was missing 10 gap-fill topics and had 6 grade-5 topics incorrectly included. Fix: after any wave that adds topics, rebuild collection membership from grade-level assignments in graph.json. The validator doesn't catch this (collections are optional packaging views, not structural).

**Context:** Run after every content wave: `python3 -c "rebuild grade-band collections from gradeLevel field"` or add to post-wave checklist.

---

### 2026-03-12: problems-generated has 207 files but only 143 have procedural generators

**Source:** User session — Plan 022 Phase 1
**Area:** Content pipeline / problem generation

The `problems-generated/` directory has 207 files (one per topic with < 15 hand-authored problems), but `generatorRegistry` only covers 143 topics. The remaining 64 files are hand-authored problems placed in `problems-generated/` for complex/conceptual topics that don't have procedural generators (word problems, qualitative graphs, bar-graph reading, etc.). These 64 topics have 15 problems each; the 143 with generators have 50. When `generate-bundles.ts` or `FileContentBucket` merges `problems/` + `problems-generated/`, effective counts are 20–65 per topic (avg 23.6 across all 705 math topics). Running `just generate-problems` regenerates the 143 covered topics but leaves the 64 hand-authored ones untouched.

**Context:** Relevant when auditing coverage or adding new generators. The generator registry is the authoritative list of procedurally generated topics; `problems-generated/` may also contain hand-authored content for complex topics.

---

### 2026-03-12: Atomicity audit at 705-topic scale — expected merge rate and dominant patterns

**Source:** User session — Plan 021 Phase 6
**Area:** Content graph / atomicity

At 705 topics (MA-comparable density), the atomicity audit found 27.9% "should-merge" (197 topics). This is expected — the Wave 1-3 expansion deliberately added fine-grained sub-skill topics (slope-from-graph, slope-from-table, calculate-slope; add-fractions-like-denom, subtract-fractions-like-denom separately). The dominant merge pattern is **operation sub-splits**: separate add/subtract variants of the same operation already covered by a combined parent. Secondary patterns: skip-counting sub-topics (count-by-2s/5s/10s), fluency variants (fluent-level topics duplicate base topics), and statistics individual measures (mean, median, mode duplicating measures-of-center). Only 2.4% should-split. At this density, over-granularity is the more common failure mode, not under-granularity.

**Context:** Audit results in `audit/reports/atomicity-latest.json`. Merges deferred to Plan 022 (post-expansion validation).

---

### 2026-03-12: evaluate-l3 FIRe runs mask the 90-session L3 runs in latest-run lookups

**Source:** User session
**Area:** Simulation / analysis

`just evaluate-l3` runs the 90-session L3 simulation for all profiles, then immediately runs FIRe paired comparison simulations (15 sessions each, with and without encompassing). The FIRe runs create NEW run directories that become the "latest" timestamp for each profile. If you then look for "the latest average-older run" to analyze L3 behavior, you'll find the 15-session FIRe run, not the 90-session L3 run. This causes confusing results: only 15 sessions, early content cutoff, FIRe-specific topic selection. Fix: always filter by session count when analyzing specific profiles after a `evaluate-l3` call (e.g., `len(sessions) == 90`).

**Context:** Affects any post-evaluate-l3 per-profile analysis. The evaluation pipeline (`evaluate-l3`) correctly uses the 90-session data — this only affects ad-hoc analysis of individual profiles.

---

### 2026-03-12: masteryPlateauSession metric measures rate stabilization, not content exhaustion

**Source:** User session
**Area:** Simulation / L3 metrics

The `masteryPlateauSession` field in L3 metrics reports when the mastery RATE stabilizes (delta-mastery per session stops changing significantly) — NOT when content is exhausted. A profile reporting `plateauSession: 6` may still have 70+ sessions of new content available. To find the actual content ceiling (last session where new topics are introduced), look at `newTopicsIntroduced` per session in `session-summaries.json`. For strong-older at post-expansion L3: plateauSession=6, but `newTopicsIntroduced` drops to 0 only at session 72.

**Context:** The plateau metric was originally useful for the 207-topic graph where content exhaustion and rate stabilization coincided at session 6-8. With 705 topics, the two measurements diverge significantly.

---

### 2026-03-12: Mastery convergence target breaks for large topic graphs — implicit mastery dominates

**Source:** User session
**Area:** Simulation targets / evaluation

The mastery convergence metric ("≥50% of non-struggling profiles reach 50% total mastery") was calibrated for a 207-topic graph. With 705 topics, the measure becomes inconsistent: high-placement profiles (strong-older, gifted-middle) immediately "pass" because the diagnostic gives them implicit mastery for 60-80% of topics before session 1. Average profiles genuinely making good progress (170 topics mastered in 90 sessions) "fail" because 170/705 < 50%. The metric doesn't distinguish between "implicit mastery from diagnostic" and "mastery earned through learning sessions." At 705 topics, 3/29 profiles pass — not because the engine is broken, but because the metric measures the wrong thing. Recalibration needed: measure progress within accessible content, or count topics mastered during the simulation only.

**Context:** This is the primary cause of the mastery_convergence FAIL in the post-expansion L3 evaluation. Deferred recalibration to Plan 022 Phase 5.

---

### 2026-03-12: evaluate-l4/l5 runs FIRe comparison — same masking issue as evaluate-l3

**Source:** User session — Plan 022 Phase 3
**Area:** Simulation / analysis

`just evaluate-l4` and `evaluate-l5` call `just evaluate` which includes FIRe paired comparison (15-session runs). After running L4/L5, the FIRe runs become the "latest" for each profile — the same masking issue as evaluate-l3 (see prior learning). When analyzing per-profile L4/L5 behavior, filter by session count (180 or 360) to avoid finding the 15-session FIRe runs instead.

**Context:** Same pattern as evaluate-l3 masking. Applies to all `evaluate-l*` recipes.

---

### 2026-03-12: L4/L5 use 7 key profiles, not all profiles — evaluate only reads latest run per profile

**Source:** User session — Plan 022 Phase 3
**Area:** Simulation / maturity levels

`simulate-l4` and `simulate-l5` run only the 7 key profiles (average-older, fast-learner-older, struggling-older, returning-after-gap, misconception-fractions, strong-highschool, multi-math-strong). But `just evaluate` reads the latest run for ALL profiles found in `audit/learner-simulations/runs/`. This means if you ran L3 (all profiles) before L4, many L3 profile runs will still be present and will be evaluated alongside the 7 fresh L4 runs — the session counts will be mixed (some 180, some 90). The L4/L5 maturity level label and `maxSessions` will be computed from all runs, not just the 7 you just ran. To get a clean L4/L5 evaluation: run `just simulate-clean --keep 1` first, OR accept that mixed-session metrics are filtered by the evaluation code (L3+ metrics use runs from the longest sessions only).

**Context:** The evaluate.ts `computeL3Metrics` uses `nonStruggling` runs but doesn't filter by session count. Mixed-session runs inflate or deflate some averages. Pragmatic workaround: the L4/L5 baselines in practice reflect mixed data, which is fine for trend comparison.

---

### 2026-03-12: FSRS review load is stable at scale — no explosion at 180-360 sessions

**Source:** User session — Plan 022 Phase 3
**Area:** Simulation / FSRS behavior

A key concern before running L4/L5 was whether the FSRS review queue would grow unboundedly at scale (180+ sessions). It does not. Reviews/session stays at 4.1-4.3 from session 60 to session 360 on the 705-topic math graph. New topic starvation (first session with 5+ consecutive zero-new-topic sessions) occurs at session 84 on average for the 7 key profiles. After that, profiles are in pure FSRS review mode, but the queue size stabilizes. This confirms FSRS scheduling equilibrium is reached and maintained.

**Context:** This is the primary insight from L4/L5 that was invisible at L3.

---

### 2026-03-12: FIRe efficiency gets WORSE at longer horizons — stability compounding hypothesis disproven

**Source:** User session — Plan 022 Phase 4
**Area:** Simulation / FIRe evaluation

After fixing the `computeFIReEfficiency()` function to use the evaluation's session count (was hardcoded to 15), FIRe efficiency is now properly measured per level:

| Level | Sessions | FIRe Efficiency |
|-------|----------|-----------------|
| L2 | 30 | -12.6% |
| L3 | 60 (capped) | -19.8% |

FIRe gets MORE negative at longer horizons. The hypothesis that "stability compounding from virtual credit would produce larger benefits at 90+ sessions" is disproven at current encompassing density (1.01 edges/topic). The problem is structural: not enough encompassing edges for set-cover to meaningfully reduce redundant reviews. Virtual credit extends due dates on topics that still need explicit review, and the harm accumulates over time.

---

### 2026-03-12: Unconditional set-cover queue elimination hurts more than it helps at current encompassing density

**Source:** User session — Plan 022 Phase 4
**Area:** FIRe / review compression

Phase 2.7 isolation showed that removing children from the review queue unconditionally (based on set-cover coverage) hurts mastery rates because children with low retrievability need explicit review. The R > 0.85 gate in Approach 4 fixes this: only skip children whose memory is genuinely strong enough that skipping is safe. Fast-learner profile went from -35.3% to +6.5% FIRe efficiency. The key insight is that queue elimination effectiveness scales with encompassing density — at ~1.01 edges/topic, aggressive elimination is counterproductive.

---

### 2026-03-12: FIRe gating pattern — use `!FIRE_ENABLED && !fireDiagnostic` for clean disable

**Source:** User session — Plan 022 Phase 4.5
**Area:** SRS / FIRe architecture

When disabling FIRe via a constant, gate with `!FIRE_ENABLED && !fireDiagnostic` (not just `!FIRE_ENABLED`). The `fireDiagnostic` parameter allows the FIRe isolation diagnostic and paired evaluation to still exercise the full FIRe code path even when FIRe is globally disabled. This keeps the `--run-fire` and `--fire-isolation` evaluation flags working for future density analysis without requiring a code change. Tests use `describe.skipIf(!FIRE_ENABLED)` / `it.skipIf(!FIRE_ENABLED)` to cleanly skip FIRe-specific tests.

**Context:** Any future feature disable should follow this pattern — global constant + diagnostic bypass + test gating via `skipIf`.

---

### 2026-03-12: Interleaving degrades when frontier clusters in same strand — fix via strand cap, not algorithm

**Source:** User session — Plan 022 Phase 4.6
**Area:** Session planning / interleaving

On a 705-topic graph with 18 strands, the `interleaveByStrand()` greedy algorithm works correctly but can't diversify when the input session mix has 6-7 topics from one strand. Root cause: frontier topics cluster by strand because prerequisite chains are intra-strand. The fix is upstream — cap new topics per strand (MAX_PER_STRAND=2) in `getSessionMix()` before interleaving. This guarantees strand diversity in the input, making the interleaving algorithm effective again.

**Context:** When interleaving quality regresses, check input composition (session mix) before tuning the algorithm. The algorithm is O(n²) greedy and handles its input correctly — the problem is always upstream.

---

### 2026-03-13: `.claude` is a symlink — `git add` must use real path

**Source:** User session
**Area:** Git / project tooling

`.claude/` in learn-platform is a symlink to `.workflow/`. Running `git add .claude/plans/...` fails with `fatal: pathspec '...' is beyond a symbolic link`. Always stage workflow plan files via their real path: `git add .workflow/plans/...`.

**Context:** Any time you commit plan changes (marking phases complete, updating progress).

---

### 2026-03-13: `drizzle-kit generate` hangs on interactive rename prompts — write migrations manually for ALTER TABLE

**Source:** User session — Plan 024 Phase 1
**Area:** Drizzle / D1 migrations

When adding new columns to existing tables, `drizzle-kit generate` may prompt "Is X table created or renamed from Y?" with interactive arrow-key selection that hangs in non-interactive environments (CI, Claude Code). For simple ALTER TABLE additions, write the migration SQL manually and update `meta/_journal.json` with the new entry. Keep the Drizzle schema in sync so future generates work correctly.

**Context:** Any time you add columns to existing D1 tables. Safe for nullable columns (no DEFAULT needed). For NOT NULL columns, add DEFAULT manually.

---

### 2026-03-13: Making tsx CLI scripts importable without side effects

**Source:** User session — Plan 025 Phase 1
**Area:** TypeScript / Node tooling

To make a `npx tsx` script importable as a module: (1) wrap all computation in an exported function, (2) guard CLI output with `const isCLI = process.argv[1]?.includes('script-name'); if (isCLI) { ... }`. This prevents the script from executing on import while keeping `npx tsx tools/script.ts` working. Don't use `import.meta.url` comparison — it doesn't work reliably with tsx.

**Context:** Any time you need to import logic from an existing CLI tool. See audit/content/status.ts, audit/content/gaps.ts, audit/content/report.ts for examples.

---

### 2026-03-14: Text-only counting generators use item listing, not visual representations

**Source:** User session — Plan 029 Phase 3
**Area:** Content generation / K-2 math generators

For counting-objects topics (count-objects-to-5/10/20) on a text-only platform, represent the "count this set" problem by listing the item names: "Count the objects: apple, apple, apple. How many apples?" This looks redundant but is pedagogically correct — it mirrors the real task of counting one-to-one. An alternative (story) variant describes the scenario narratively. Both avoid images while preserving the counting skill.

**Context:** Any K-early elementary generator that asks students to count a set of objects on screen.

---

### 2026-03-15: Generator infinite loop: while-dedup loop hangs when range collapses to one value

**Source:** User session — Plan 029 Phase 4
**Area:** Content generation / generator correctness

A `while (n2 === n1) n2 = rng.int(min, max)` loop hangs forever if `min === max` (only one possible value). Example: `rng.int(1, d-1)` with `d=2` always returns 1, so `n1 === n2` is always true. Fix: ensure the range has ≥2 values before entering the loop — e.g., use `rng.int(3, 10)` for denominator when you need two distinct numerators in [1, d-1]. Also watch for empty while-loop bodies: `while (condition) { }` with no body is a spin-hang, not a guard — use computed construction (derive `total = perGroup * groups`) instead of rejection-sampling.

**Context:** Any generator that uses a rejection-sampling while loop to get two distinct values. Always verify the range has at least 2 distinct elements before using this pattern.

---

### 2026-03-15: Generator index.ts: filenames starting with a digit produce invalid JS identifiers

**Source:** User session — Plan 029 Phase 6
**Area:** Content pipeline / TypeScript tooling

`3d-shape-nets.ts` converted by camelCase → `3dShapeNets`, which starts with a digit — invalid in JS/TS. esbuild catches this at bundle time. Fix: prefix any identifier that starts with a digit with `_` (e.g., `_3dShapeNets`). Add to the `toCamel()` function: `if (/^[0-9]/.test(name)) name = '_' + name;`.

**Context:** The `index.ts` generation script in `learn-content/math/generators/`. Any topic ID starting with a digit (e.g., `3d-...`) will trigger this.

---

### 2026-03-15: Generator index.ts auto-generation: camelCase regex must handle digit suffixes

**Source:** User session — Plan 029 Phase 5
**Area:** Content pipeline / TypeScript tooling

When auto-generating `index.ts` imports from filenames, the camelCase regex `/-([a-z])/g` only capitalizes letters after dashes — it leaves `-1`, `-2`, etc. intact, producing invalid identifiers like `addSubtractWordProblems-1`. Use `/-([a-z0-9])/g` instead, which handles both: lowercase letters become uppercase (e.g., `-w` → `W`) and digits stay as-is (e.g., `-1` → `1`).

**Context:** The `node` script that generates `math/generators/index.ts` from filenames. See the `toCamel()` function in the generation script.

---

### 2026-03-15: "Draw" instruction in generator solutions triggers platform-incompatible validation

**Source:** User session — Plan 029 Phase 5
**Area:** Content generation / validation

The content validator flags any `solution`, `hint`, or lesson text containing words like "draw" as platform-incompatible (screen + text input only). For visual topics (number lines, graphs, geometry), use "place", "mark", "indicate", "locate", or "show" instead. Example: `inequalities-on-number-line` used "Draw a circle at..." → changed to "Place a circle at...". The `conceptText` lesson explanation is also checked.

**Context:** Any generator for topics involving visual representation (number lines, graphs, coordinate planes). Run `just validate-content` after writing to catch these.

---

### 2026-03-15: Run 291 TypeScript generators via esbuild bundle, not tsx or tsc

**Source:** User session — Plan 029 Phase 4
**Area:** Content pipeline / TypeScript tooling

`npx tsx math/generators/run.ts` with 291 generator imports hangs for 10+ minutes at 100% CPU — tsx transpiles all 291 files on demand. Compiled `tsc` is also slow (291 ES module imports). Solution: `npx esbuild math/generators/run.ts --bundle --platform=node --outfile=run.js` produces a 716KB bundle in ~15ms that runs instantly. The output filename must match the `isMainModule` guard in run.ts (`process.argv[1]?.endsWith("run.js")`). Run from the learn-content directory: `node run.js --seed 42`.

**Context:** Any time you need to execute the math generator pipeline (Phase 4+). The bundle is a build artifact — don't commit it.

---

### 2026-03-14: Splitting compound topics in graph.json requires stale edge cleanup and collection updates

**Source:** User session — Plan 029 Phase 0
**Area:** Content pipeline / graph management

When removing a compound topic and replacing it with split topics: (1) rewire prerequisite edges from/to the old topic to the new topics, (2) clean up stale edges referencing deleted topic IDs, (3) update collection `topicIds` arrays to reference new IDs, (4) check if the old topic already had the split topics as dependents/encompassed children — if so, the compound is a consolidation parent, not a split candidate. The `dot-plots-histograms` case: the graph already had separate `dot-plots` and `histograms` topics as children — splitting would create duplicate IDs and self-loops.

**Context:** Any time you modify graph.json by splitting/removing topics. Script at `tools/expand-graph.py` handles this programmatically.


---

### 2026-03-14: Simulation db-setup.ts must mirror full D1 schema (including migration columns)

**Source:** User session — Plan 030 Phase 5
**Area:** Audit / learner simulations

`audit/learner-simulations/src/db-setup.ts` creates the simulation SQLite schema from raw SQL strings — it does NOT read migration files. When D1 migrations add new columns (e.g., `review_log.llm_assisted`, `review_log.hint_source`, `review_log.scaffolding`), the simulation DB won't have them and all sessions will throw `SqliteError: table review_log has no column named llm_assisted`. Every new column added via a D1 migration must also be manually added to the corresponding CREATE TABLE in `db-setup.ts`. The failure manifests as zero problem events and cascading metric failures (mastery convergence, cognitive demand, review/new balance all break simultaneously).

**Context:** Any time a D1 migration adds columns to tables used by the learning session engine.

---

### 2026-03-14: computeSessionSummary newTopicsIntroduced must track current phase names

**Source:** User session — Plan 030 Phase 5
**Area:** Audit / learner simulations

`computeSessionSummary()` counts new topics introduced by checking `event.phase`. After the Plan 029 simplification, new topics are introduced in `phase === "lesson"` (not `"pretest"`). If the check is stale (only checks `"pretest"`), `newTopicsIntroduced` stays 0, making `reviewNewBalance = 1.0` (all review, no new items) and failing the balance metric. Always update this check when the learning loop phases change.

**Context:** `audit/learner-simulations/src/runner.ts` `computeSessionSummary()` function.

---

### 2026-03-14: targets.json must be re-baselined when the learning loop changes

**Source:** User session — Plan 030 Phase 5
**Area:** Audit / evaluation targets

After the Plan 029 simplified loop (lesson → independent → review), evaluation metrics shift materially:
- **Mastery convergence**: average profiles earn fewer mastered topics per session (FSRS needs 3-5 sessions to earn stable mastery), so the 30-session baseline should be calibrated to the new loop, not the old one
- **Interleaving**: lesson items naturally cluster same-topic problems (lesson + immediate practice), so same-strand adjacency increases vs. the old loop

When changing the learning loop, run `just regression --update-baseline` and `just evaluate` after verifying the new behavior is intentional, then update `targets.json` with a documented rationale in `lastUpdatedReason`. Treat unexpected metric drops as diagnostic signals before updating baselines.

**Context:** `audit/learner-simulations/targets.json` and `regression-baseline.json`. Run `node audit/learner-simulations/src/regression.ts --update-baseline` to update.

---

### 2026-03-15: Remediation loop has no session-level cap — can consume entire session

**Source:** User session — Plan 031 Phase 1
**Area:** Session engine / remediation logic

`advancePhase()` tracks `remediatedTopics` to prevent re-entering remediation for the **original topic** within a session, but the prerequisite chain has no session-level budget. When a stuck topic (high reps, low accuracy) fails → triggers remediation → prereq A fails → triggers remediation of prereq A → prereq B tried (even if mastered) → cycles back. Observed: sessions with 98 remediation events out of 100 total session events, leaving only 2 actual reviews completed. The student effectively experiences 98 prerequisite drill attempts with no progress.

Fix (Plan 031 Phase 2): Add `sessionRemediationCount` to `SessionState`, cap at 15 per session.

**Context:** `session.ts advancePhase()`. Triggered when a stuck topic (consistently wrong answers) appears in the session mix.

---

### 2026-03-15: Topics with near-zero stability and high reps spin indefinitely in the review queue

**Source:** User session — Plan 031 Phase 1
**Area:** Session engine / FSRS scheduling

FSRS has no mechanism to stop scheduling a topic that consistently gets `Rating.Again`. Each failure brings the next due date closer to "now" (learning steps: 1m, 10m, then 1d), so a failing topic appears in every session. Observed: two topics with reps=92 and reps=200 (stability≈0) in average-older's session 30 — they consumed review slots every session for 30 sessions without achieving mastery. The topic is still in `getDueTopics()` results daily.

Fix (Plan 031 Phase 2): In `getDueTopics()`, skip topics with `reps > 20 AND stability < 0.5 AND consecutiveCorrect = 0`. Set `due = +90 days` for cooldown, re-introduce via lesson phase.

**Context:** `srs.ts getDueTopics()`. Typically affects above-grade-level topics introduced when a learner's diagnostic placement was generous, combined with the learner's actual accuracy being 30-40%.

---

### 2026-03-15: computeFrontier must exclude implicitly mastered topics from frontier

**Source:** User session — Plan 031 Phase 3
**Area:** Graph service / diagnostic mastery / session scheduling

`computeFrontier()` uses `masteredIds` (which includes diagnostic implicit mastery) for prerequisite checks, but does NOT exclude implicitly mastered topics from the frontier results. A topic with P(mastery) >= 0.75 from diagnostic estimates but no `user_topic_state` row will appear as a frontier candidate. When `getNextItem()` picks it as a lesson, `scheduleReview()` creates a `user_topic_state` row with `mastered: false`. This topic is now: (a) excluded from implicit mastery count (it has a materialized row), AND (b) not counted as materialized mastery (mastered=false). Net effect: total mastery drops.

The impact scales with how many frontier topics are processed per session. The old batched model (10 topics/session) masked this bug; the new pull-based model (processes all frontier topics in one session) caused a 17-47% mastery drop. Fix: add `if (masteredIds.has(topic.id)) return false` before the `startedIds` check in `computeFrontier()`.

**Context:** `graph.ts computeFrontier()`. Discovered during Plan 031 Phase 3 regression — `finalMasteryPercent` dropped significantly for all profiles when switching to pull-based sessions.

---

### 2026-03-15: Path B mastery (consecutiveCorrect >= 3, any state) can fire at very low stability

**Source:** User session — Plan 031 Phase 1
**Area:** Mastery criterion / FSRS edge cases

Path B of the mastery criterion (`consecutiveCorrect >= 3` in any FSRS state) can trigger while a topic is still in Learning state with stability < 2 days. Example observed: `order-numbers-to-20` mastered with stabilityAfter=1.37d. The topic is correct by design — 1.37d stability still means ~89% retention at that exact moment — but the topic will decay quickly and may need early re-review. This is distinct from Path A (requires `stability >= 4d after update`), which provides a stronger durability guarantee. Path B is the correct safety net for topics stuck in Learning/Relearning state.

**Context:** srs.ts `scheduleReview()` lines 252-254. Affects any topic with 3 consecutive correct answers before graduating to Review state — most common for K-0 content served to advanced learners with a high diagnostic placement.

---

### 2026-03-15: cardFromRow sets elapsed_days=0 — FSRS repeat() computes same-day review

**Source:** User session — Plan 031 Phase 3.5
**Area:** FSRS / SRS service / Testing

`cardFromRow()` hardcodes `elapsed_days: 0` and `scheduled_days: 0`. When `userFsrs.repeat(card, new Date())` is called for a Review-state card with stability 10d, FSRS interprets this as a same-day review and computes new stability ≈ current stability (no meaningful improvement). This makes `fullBoost = scheduling[Good].card.stability - state.stability` ≈ 0, triggering the `fullBoost <= 0` guard and silently skipping credit.

**Fix for tests:** Seed `lastReview` to a past date (e.g., 7 days ago) so `computeRetrievability()` returns a reasonable R value AND FSRS computes a meaningful stability increase for the Good rating. Without `lastReview`, the fallback `lastReview = now` produces `elapsedDays = 0`.

**Context:** Discovered when `applyPrereqCredit()` unit tests showed zero stability change on mastered prerequisites. The function's logic was correct — the issue was test seed data lacking `lastReview`.

---

### 2026-03-15: getDueTopics() only returns mastered=false topics — don't seed mastered=true for review tests

**Source:** User session — Plan 031 Phase 4
**Area:** SRS service / testing

`getDueTopics()` filters `mastered === false` — mastered topics are never considered "due for review" regardless of their `due` date. This is by design: mastered topics only lose mastery on 2+ consecutive incorrect answers, at which point they become unmastered and re-enter the review queue. Tests that seed topics as `mastered: true` with past-due dates will NOT get review items from `getNextItem()` — they'll get lessons for frontier topics instead.

**Context:** `srs.ts getDueTopics()` line 367. Discovered when Phase 4 pacing test expected a review for a mastered topic but got a lesson.

---

### 2026-03-15: session-status endpoint must precede /sessions/:id route to avoid param capture

**Source:** User session — Plan 031 Phase 5
**Area:** Hono routing

In Hono, `GET /learn/sessions/:id` captures any path segment after `/sessions/`. A new `GET /learn/session-status` route must be registered **before** the parameterized route, or `session-status` gets captured as `:id`. The learn routes file already has this pattern (`/sessions/active` before `/:id`), so `session-status` follows the same placement.

**Context:** `packages/api/src/routes/learn.ts` — route ordering is load-bearing.
