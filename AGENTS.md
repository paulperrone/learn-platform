# Learn Platform

Free, open mastery-learning platform with knowledge graph, spaced repetition (FSRS), and LLM tutoring. MVP: Foundational Mathematics.

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
content/math-foundations/  # Knowledge graph + problem banks (JSON, offline-generated)
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
- Subjects belong to disciplines; disciplines define progression models (`mastery-gated`, `context-layered`, `flexible`)
- Prerequisite edges have types: `required` (hard gate), `recommended` (context), `enriching` (suggestion)
- FSRS state per user per topic; FIRe credit for encompassing relationships
- Learning loop phases: pretest → instruction → guided → independent → review → remediation
- Tests: co-located `__tests__/` directory, `*.test.ts` naming, `@cloudflare/vitest-pool-workers` for API tests with miniflare D1. New services and routes must include vitest tests. Use helpers from `packages/api/src/__tests__/helpers.ts` for DB setup and seeding.

## Content Creation by Discipline

When creating content (graphs, problems, worked examples) for any subject, follow the rules for its discipline's progression model.

### Mastery-Gated Disciplines (math, cs, languages grammar, music technique)

- Prerequisites are **hard gates**: if topic B requires topic A, students MUST master A first
- All prerequisite edges should be `type: "required"` unless there's a clear reason for `recommended`
- Depth levels map to skill progression: each level builds directly on the previous
- Content at depth N can assume mastery of all content at depths 0 through N-1
- Problems test discrete skills that have clear right/wrong answers
- Worked examples show step-by-step procedures

### Context-Layered Disciplines (history, philosophy, literature, political science)

- Prerequisites are **context, not gates**: knowing about WWI enriches WWII study but doesn't block it
- Use `type: "recommended"` for most edges (context that enriches), `type: "required"` sparingly (only for truly foundational context like "what is a primary source" before "analyze this primary source")
- Content is organized in **depth layers** that represent increasing analytical sophistication:
  - **Depth 0-2 (Survey):** "What happened?" — timelines, key events, notable figures. Simple narratives. Age-appropriate for K-5 or introductory learners.
  - **Depth 3-5 (Contextual):** "Why did it happen?" — causes, effects, connections between events. Multiple perspectives introduced. Maps to middle school / 6-8.
  - **Depth 6-8 (Analytical):** "How do we know?" — primary sources, competing interpretations, historiography. Maps to high school / 9-12.
  - **Depth 9+ (Synthesis):** "What does it mean?" — thematic analysis, comparative history, constructing arguments from evidence. Maps to AP / undergraduate.
- The SAME topic can appear at multiple depth layers with different treatment:
  - Survey: "The American Revolution happened in 1776. The colonists wanted independence from Britain."
  - Contextual: "Taxation without representation, Enlightenment ideas, and colonial identity drove the revolution."
  - Analytical: "Compare Loyalist and Patriot primary sources. How do historians debate the revolution's causes?"
  - Synthesis: "How does the American Revolution fit into the broader Age of Revolutions? What structural conditions enable revolutionary movements?"
- Assessment is often non-binary: use rubric-based scoring for comprehension depth, not just right/wrong
- `enriching` edges connect related topics across time periods or themes (e.g., Roman Republic → American Republic founding)

### Flexible Disciplines (vocabulary, geography, anatomy)

- Prerequisites are **suggestions for optimal ordering**, not requirements
- Most edges should be `type: "enriching"` — knowing Latin roots helps with medical vocabulary but isn't required
- Topics are largely independent — order matters little
- Content can be consumed in any sequence without loss of comprehension
- Assessment is typically recall-based: definitions, identification, matching

### Cross-Discipline Prerequisite Rules

- Cross-discipline edges are valid and encouraged where genuine dependencies exist
- Examples: basic reading comprehension (`ela`) → math word problems (`math`), algebra (`math`) → physics (`science`)
- Cross-discipline edges should almost always be `type: "required"` — if the dependency is soft enough to be `recommended`, it probably shouldn't be a cross-discipline edge at all
- The diagnostic should eventually place students across the full connected graph, not just within one subject

---

For past decisions, see DECISIONS.md.
For gotchas, see LEARNINGS.md.
For research, see RESEARCH.md.
For learning science reference, see docs/learning-science.md (load relevant sections when making pedagogy/feature decisions).
