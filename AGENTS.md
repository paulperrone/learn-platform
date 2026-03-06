# Learn Platform

Free, open mastery-learning platform with knowledge graph, spaced repetition (FSRS), and LLM tutoring. MVP: Math K-5.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Cloudflare Workers |
| API | Hono |
| Database | D1 + Drizzle ORM |
| Auth | Better-Auth |
| Frontend | Vue 3 + Vite + Tailwind CSS v4 |
| SRS | ts-fsrs v5 |
| LLM | OpenRouter (model-agnostic) |
| Monorepo | pnpm workspaces |
| Deploy | Cloudflare Pages |

## Structure

```
packages/
  api/src/           # Hono API (Workers entry point)
    routes/          # auth, graph, learn, review, progress, llm
    services/        # graph, srs, session, llm (core logic)
    db/              # Drizzle schema + migrations
  web/src/           # Vue 3 frontend
    pages/           # index, learn, progress, explore
    components/      # ProblemView, WorkedExample, ConfidenceSlider
    composables/     # useApi
  shared/src/        # Shared TypeScript types
content/math-k5/     # Knowledge graph + problem banks (JSON, offline-generated)
tools/               # Offline content pipeline (generate, validate, import)
```

## Commands

Use the justfile for all common operations. Run `just <recipe>` or `just --list` to see all recipes.

```bash
just dev              # Start API (8787) + frontend (5173) concurrently
just test             # Run tests (Workers pool + miniflare D1) — ALWAYS use this, never `pnpm vitest run`
just typecheck        # TypeCheck all packages
just validate         # Full validation (typecheck + content)
just validate-content # Validate content only (graph DAG + problems)
just db-generate      # Generate Drizzle migration
just db-migrate       # Apply migration to local D1
just import-content   # Import content/ → local D1
```

> **IMPORTANT:** Never run `pnpm vitest run` or `npx vitest` directly. Workers-pool tests import `cloudflare:test` which only resolves through the `@cloudflare/vitest-pool-workers` runner configured in `packages/api/vitest.config.ts`. Use `just test` (or `pnpm test`) which invokes the correct runner. Running vitest directly will show 15+ false failures.

## Conventions

- Early returns over nested conditionals
- `type` over `interface` unless extending
- Strict TypeScript, no `any`
- Services are factory functions: `createXService(db)` returning method objects
- Content is pre-generated offline, validated, then imported — LLM at runtime is for tutoring/grading only
- FSRS state per user per topic; FIRe credit for encompassing relationships
- Learning loop phases: pretest → instruction → guided → independent → review → remediation
- Tests: co-located `__tests__/` directory, `*.test.ts` naming, `@cloudflare/vitest-pool-workers` for API tests with miniflare D1. New services and routes must include vitest tests. Use helpers from `packages/api/src/__tests__/helpers.ts` for DB setup and seeding.

---

For past decisions, see DECISIONS.md.
For gotchas, see LEARNINGS.md.
For research, see RESEARCH.md.
For learning science reference, see docs/learning-science.md (load relevant sections when making pedagogy/feature decisions).
