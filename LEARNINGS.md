# Learnings

Gotchas, insights, and tacit knowledge. Append-only.

## Guardrails

> Critical patterns that MUST be followed. Violations cause bugs or rework.

- D1 foreign keys are enforced — test users must exist in `users` table before creating `user_topic_state` rows
- Drizzle ORM version must match better-auth peer dependency (>=0.41.0 as of better-auth 1.5.x)
- `pnpm approve-builds` is interactive — add native deps to `pnpm.onlyBuiltDependencies` in root package.json instead
- import-content.ts must delete from `review_log` and `user_topic_state` before deleting topics — FK constraints on `topic_id`
- Drizzle `$defaultFn()` is app-level only — when adding NOT NULL columns via migration, manually add `DEFAULT` to the generated SQL or SQLite will reject it

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
