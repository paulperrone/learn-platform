# Learnings

Gotchas, insights, and tacit knowledge. Append-only.

## Guardrails

> Critical patterns that MUST be followed. Violations cause bugs or rework.

- D1 foreign keys are enforced — test users must exist in `users` table before creating `user_topic_state` rows
- Drizzle ORM version must match better-auth peer dependency (>=0.41.0 as of better-auth 1.5.x)
- `pnpm approve-builds` is interactive — add native deps to `pnpm.onlyBuiltDependencies` in root package.json instead

---

## 2026-03-03: Wrangler dev port defaults to 8788, not 8787

Set `[dev] port = 8787` in wrangler.toml to get a predictable port. The Vite proxy in web/vite.config.ts expects 8787.

## 2026-03-03: Zsh glob expansion breaks curl URLs with query params

Always quote URLs in zsh: `curl -s 'http://localhost:8787/api/foo?bar=1'` — unquoted `?` triggers glob expansion.

## 2026-03-03: better-sqlite3 needs build approval for import tool

The `tools/import-content.ts` script uses better-sqlite3 to write directly to the local D1 sqlite file at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`. Must add `better-sqlite3` to `pnpm.onlyBuiltDependencies`.

## 2026-03-03: Tailwind CSS v4 uses @tailwindcss/vite plugin

No `tailwind.config.js` needed. Import via `@import "tailwindcss"` in CSS. Plugin added in vite.config.ts.
