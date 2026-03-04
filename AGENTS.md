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

```bash
pnpm dev              # Start API (8787) + frontend (5173) concurrently
pnpm db:generate      # Generate Drizzle migration
pnpm db:migrate       # Apply migration to local D1
pnpm typecheck        # TypeCheck all packages
npx tsx tools/import-content.ts         # Import content/ → local D1
npx tsx tools/validate-graph.ts         # Validate DAG, no cycles
npx tsx tools/validate-content.ts       # Validate problem/example completeness
```

## Conventions

- Early returns over nested conditionals
- `type` over `interface` unless extending
- Strict TypeScript, no `any`
- Services are factory functions: `createXService(db)` returning method objects
- Content is pre-generated offline, validated, then imported — LLM at runtime is for tutoring/grading only
- FSRS state per user per topic; FIRe credit for encompassing relationships
- Learning loop phases: pretest → instruction → guided → independent → review → remediation

---

For past decisions, see DECISIONS.md.
For gotchas, see LEARNINGS.md.
For research, see RESEARCH.md.
