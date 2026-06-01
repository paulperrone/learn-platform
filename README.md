# Learn Platform

Open mastery-learning platform built around prerequisite graphs, spaced repetition, adaptive diagnostics, generated content, and optional LLM tutoring.

The initial subject is foundational mathematics. The long-term ambition is broader: a free core learning engine where content is validated offline, sequenced through a knowledge graph, practiced with spaced repetition, and supported by paid/optional AI features only where they add value.

## Status

This repository is an active product prototype, not a polished public launch.

Current self-directed learner workflow is being scoped toward roughly **grade 4+ math**. Younger learners can be represented in the graph/content system, but K-3 needs a different guided/co-piloted learner surface: audio-first, visual, minimal typing, and adult-supported. See [DECISIONS.md](./DECISIONS.md) and [LEARNINGS.md](./LEARNINGS.md) for the current product reasoning.

## What It Does

- **Knowledge graph sequencing:** topics unlock through prerequisite relationships.
- **Spaced repetition:** per-user topic state is scheduled with FSRS.
- **Adaptive diagnostics:** placement estimates topic mastery and seeds the learner state.
- **Atomic learning sessions:** each session pulls the next review, lesson, assessment, or completion state.
- **Assessment calibration:** periodic checkpoints tune pacing.
- **XP goals:** XP tracks quality-weighted effort separately from mastery.
- **Content bundles:** D1 stores graph/user state; R2 stores topic content bundles.
- **LLM support:** tutoring, hints, grading, and self-explanation evaluation are runtime AI features, not the core free learning loop.
- **Audit/simulation tooling:** learner simulations, content checks, and regression tools evaluate system behavior.

## Architecture

```text
packages/
  api/      Hono API on Cloudflare Workers, D1, Drizzle, SRS/session services
  web/      Vue 3 + Vite + Tailwind learner/admin frontend
  shared/   shared TypeScript types

audit/      system health, learner simulations, content reports
tools/      content import, bundle generation, validation, deployment
docs/       architecture and learning-system notes
```

Content source lives in a sibling repository:

```text
source/
  learn-platform/    application, services, tooling
  learn-content/     graph JSON, problem banks, examples, generators
```

The platform resolves content from `CONTENT_DIR`, defaulting to `../learn-content`.

## Tech Stack

- Cloudflare Workers
- Hono
- D1 + Drizzle ORM
- Better Auth
- Vue 3 + Vite
- Tailwind CSS v4
- ts-fsrs
- OpenRouter for optional runtime LLM features
- R2 for content bundles
- Cloudflare Analytics Engine
- pnpm workspaces

## Getting Started

Install dependencies:

```bash
pnpm install
```

Set up the content repo next to this one if you have access:

```bash
cd ..
git clone https://github.com/paulperrone/learn-content.git
cd learn-platform
```

Apply local migrations and load content:

```bash
just db-migrate
just import-content
just deploy-content-local
```

Run the app:

```bash
just dev
```

Local URLs:

```text
API: http://localhost:8787
Web: http://localhost:5173
```

## Common Commands

Use the `justfile` for common operations:

```bash
just --list
just test
just typecheck
just validate-content
just regression
just validate
```

Important testing note: use `just test` or `pnpm test`. Do not run `pnpm vitest run` or `npx vitest` directly; API tests depend on the Cloudflare Workers Vitest pool configuration.

## Content Pipeline

Content is authored and validated outside runtime:

1. edit graph/problems/examples/generators in `../learn-content`
2. run content validation
3. import graph structure into D1
4. generate bundles
5. deploy bundles to R2 and graph structure to D1

Useful commands:

```bash
just validate-content
just import-content
just generate-bundles
just deploy-content
```

Runtime LLMs are not used to generate production content. The app uses deterministic content bundles plus optional AI tutoring/grading features.

## Product Notes

The engine is intentionally inspired by mastery-learning systems such as Math Academy: graph sequencing, durable review, diagnostics, and continuous progress.

The current product direction separates the **mastery engine** from the **learner surface**:

- grade 4+ can plausibly use the self-directed queue/session workflow
- K-3 should use a future guided mode with audio-first and visual interaction patterns
- primary content should avoid abstract remediation labels, self-explanation prompts, and typing-heavy tasks

See [Plan 033](./.workflow/plans/033-self-directed-scope-primary-guided-mode.md) for the active plan around this scope.

## Documentation

- [SPEC](./.workflow/plans/SPEC.md)
- [DECISIONS](./DECISIONS.md)
- [LEARNINGS](./LEARNINGS.md)
- [RESEARCH](./RESEARCH.md)
- [R2 content architecture](./docs/r2-content-architecture.md)
- [Assessment system](./docs/assessment-system.md)
- [XP system](./docs/xp-system.md)

## License

License has not been finalized yet.
