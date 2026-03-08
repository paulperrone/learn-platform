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
