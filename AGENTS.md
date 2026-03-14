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
| LLM (runtime) | OpenRouter (model-agnostic) — tutoring/grading only |
| Monorepo | pnpm workspaces |
| Content Storage | R2 (content bundles) + D1 (graph structure) |
| Analytics | Cloudflare Analytics Engine |
| Deploy | Cloudflare Pages |

## Structure

```
packages/
  api/src/           # Hono API (Workers entry point)
    routes/          # auth, graph, learn, review, progress, llm
    services/        # graph, srs, session, llm, analytics, content-r2 (core logic)
    db/              # Drizzle schema + migrations
  web/src/           # Vue 3 frontend
    pages/           # index, learn, progress, explore
    components/      # ProblemView, WorkedExample, ConfidenceSlider
    composables/     # useApi
  shared/src/        # Shared TypeScript types
audit/               # System health evaluation (three pillars)
  learner-simulations/ # Pillar 1: synthetic learner runs
    src/             # runner, evaluate, heal-loop, regression, analysis
    profiles/        # learner profile definitions
    targets.json     # evaluation targets
  content/           # Pillar 2: content evaluation
    status.ts, gaps.ts, report.ts, atomicity-context.ts
  reports/           # Pillar 3: all audit output
    latest.json      # most recent audit report
    snapshots/       # timestamped audit history
  orchestrator.ts    # unified audit runner
  render.ts, types.ts, relevance.ts, thresholds.json
tools/               # Content pipeline (validate, import, bundle, deploy)
docs/                # Architecture docs

# Content lives in a separate repo: paulperrone/learn-content (sibling directory)
# ../learn-content/
#   cross-discipline-edges.json  # Cross-discipline prerequisite edges (centralized)
#   <discipline>/     # Knowledge graph + problem banks (JSON, source of truth)
#     graph.json       # Topics, prerequisites (intra-discipline only), encompassings, collections
#     problems/        # Problem banks (15 per topic)
#     examples/        # Worked examples (2 per topic)
#     collections/     # Collection definitions (grade bands, strands, tracks)

# Cloudflare bindings:
# DB       — D1 (graph structure, user state, SRS history)
# CONTENT  — R2 bucket (content bundles: problems.json, examples.json per topic)
# ANALYTICS — Analytics Engine (problem attempt + example view events)
# AI       — Workers AI (Whisper STT)
```

## Commands

Use the justfile for all common operations. Run `just <recipe>` or `just --list` to see all recipes.

**Testing** validates code correctness (run automatically on code changes):

```bash
just dev              # Start API (8787) + frontend (5173) concurrently
just test             # Unit + integration tests (Workers pool + miniflare D1)
just typecheck        # TypeScript validation
just validate-content # Content validation (graph DAG + problems + cross-discipline edges)
just regression       # Simulation regression check (~15s, 3 profiles × 5 sessions)
just validate         # Full pre-commit gate: typecheck + test + validate-content + regression
```

> **IMPORTANT:** Never run `pnpm vitest run` or `npx vitest` directly. Workers-pool tests import `cloudflare:test` which only resolves through the `@cloudflare/vitest-pool-workers` runner configured in `packages/api/vitest.config.ts`. Use `just test` (or `pnpm test`) which invokes the correct runner. Running vitest directly will show 15+ false failures.

> **Note:** `just test` is vitest-only (fast, ~30s). Simulation regression is in `just validate` (not `just test`) because it tests cross-cutting engine behavior, not individual functions. `just validate` is the comprehensive gate to run before committing.

**Auditing** evaluates system behavior (run on demand):

```bash
just audit            # System health report (graph + content + simulation + LLM + media + review)
just audit-all        # Comprehensive: simulate + evaluate + audit
just audit-check      # What audit sections are affected by current changes? (advisory)
just evaluate         # Evaluate simulation runs against targets
just heal-epoch       # Healing loop iteration
/content-review       # LLM content review (Claude Code slash command)
/content-health       # Deterministic content health scoring (Claude Code slash command)
/atomicity-audit      # Topic atomicity assessment (Claude Code slash command)
```

> **Testing vs auditing:** Test files in `audit/__tests__/` and `audit/learner-simulations/src/__tests__/` test the audit *tool code* (schema, rendering, thresholds, evaluation engine). They are code tests ("does the tool work?"), not audits ("is the system healthy?").

**Content pipeline:**

```bash
just db-generate      # Generate Drizzle migration
just db-migrate       # Apply migration to local D1
just import-content   # Import ../learn-content/ graph → local D1 (graph structure only)
just generate-bundles # Generate R2 content bundles from learn-content JSON
just deploy           # Deploy API + web + content to production
just deploy-content   # Deploy content: R2 bundles + D1 graph (production)
just deploy-preview   # Deploy everything to preview
```

## Conventions

- Early returns over nested conditionals
- `type` over `interface` unless extending
- Strict TypeScript, no `any`
- Services are factory functions: `createXService(db)` returning method objects
- Content is pre-generated offline, validated, then deployed to R2 as bundles — LLM at runtime is for tutoring/grading only
- All problems must include dimension fields (`presentation`, `contentDepth`, `locale`, `flavor`) and metadata (`source`, `cognitiveDemand`, `type`). Dimension values should match the topic's `defaultPresentation` and `contentDepth` from graph.json unless intentionally creating multi-presentation or multi-depth content. See `docs/content-system.md` §2 for the full required fields list.
- **D1 stores graph structure + user state only.** Content (problems, examples) lives in R2 bundles. See `docs/r2-content-architecture.md`.
- Content service uses `ContentBucket` abstraction — R2 in production, filesystem adapter in audit/learner-simulations and local dev
- **Content generation happens in Claude Code sessions** (not via OpenRouter pipelines). Claude Code is the workhorse for graph design, problem/example generation, encompassing analysis, and content review. OpenRouter is only for in-app runtime LLM features (tutoring, grading, self-explanation evaluation).
- Topics belong directly to disciplines; disciplines define progression models (`mastery-gated`, `context-layered`, `flexible`)
- Math graph: 705 topics across 18 strands (K-8, MA-caliber density). Prereq density 1.42/topic, encompassing density 1.01/topic. See `docs/archive/expansion-map.md` for MA cross-reference.
- Collections are packaging views (grade bands, strands, exam-prep tracks) — they don't own topics. Math has 3 grade-band (K-2, 3-5, 6-8) + 18 strand collections.
- Prerequisite edges have types: `required` (hard gate), `recommended` (context), `enriching` (suggestion)
- Content has depth (`survey`, `contextual`, `analytical`, `synthesis`) and presentation (`primary`, `intermediate`, `standard`, `advanced`) dimensions. See `docs/content-system.md`.
- FSRS state per user per topic. FIRe (Fractional Implicit Repetition) is disabled — premature at current graph scale (1.01 encompassing edges/topic). Code and edges preserved. See `docs/fire.md`.
- Learning loop phases: pretest → instruction → guided → independent → review → remediation
- Analytics Engine records rich per-problem events (problem attempts, example views) with content version correlation. D1 `review_log` continues as compact SRS history.
- Tests: co-located `__tests__/` directory, `*.test.ts` naming, `@cloudflare/vitest-pool-workers` for API tests with miniflare D1. New services and routes must include vitest tests. Use helpers from `packages/api/src/__tests__/helpers.ts` for DB setup and seeding.

## Content Pipeline

**Source of truth:** `../learn-content/<discipline>/graph.json` + `problems/*.json` + `examples/*.json` + `collections/*.json` (separate `learn-content` repo).
**D1 stores graph structure only** (topics, edges, collections) — rebuilt via `just import-content`.
**R2 stores content bundles** (problems.json, examples.json per topic) — deployed via `just deploy-content`.

### Content repo setup

Content lives in a sibling repo: `paulperrone/learn-content`. Clone it alongside learn-platform:
```
source/
  learn-platform/    # This repo (code, tooling)
  learn-content/     # Content repo (graphs, problems, examples)
```
Tooling resolves content via `CONTENT_DIR` env var (default: `../learn-content`).

### How content is created

All content authoring happens in **Claude Code sessions**. The workflow:

1. **Design the knowledge graph** — Define topics, prerequisites, and encompassing edges in `graph.json`. Follow the discipline's progression model (below) and the encompassing methodology in `docs/content-system.md`. Use `just visualize <discipline>` to inspect the DAG structure.
2. **Generate problems** — Write `../learn-content/<discipline>/problems/<topic-id>.json` files. 5 problems per topic at 3 difficulty levels. Follow platform-medium constraints (screen + text input only).
3. **Generate worked examples** — Write `../learn-content/<discipline>/examples/<topic-id>.json` files. 2 examples per topic with step-by-step breakdowns.
4. **Define collections** — Write `../learn-content/<discipline>/collections/<collection-id>.json` to package topics into grade bands, strands, or tracks.
5. **Validate** — `just validate-content` checks DAG integrity, topic coverage, and platform-incompatible instructions.
6. **Import graph** — `just import-content` loads graph structure (topics, edges, collections) into local D1.
7. **Deploy content** — `just deploy-content` bundles content JSON → R2 bundles + graph SQL → D1.
8. **Visualize** — `just visualize <discipline>` generates an interactive graph visualization.

### Content delivery architecture

```
learn-content/ (source JSON)  →  generate-bundles  →  R2 bundles (problems.json, examples.json per topic)
                              →  export-sql        →  D1 (graph structure only)
```

At runtime, the content service fetches from R2 (with Cache API), applies 7-tier fallback ranking in-memory, and records rich events to Analytics Engine. See `docs/r2-content-architecture.md` for full architecture.

**OpenRouter is NOT used for content generation.** Claude Code produces higher quality content with better iteration — it can read the graph, understand prerequisites, check consistency, and fix issues in the same session.

**Non-text content** (images, animations, audio) will use separate pipelines when needed, but text content (graphs, problems, examples) is always authored through Claude Code.

## Content Creation by Discipline

When creating content (graphs, problems, worked examples) for a discipline, follow the rules for its progression model.

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
- Content at each depth level must also be created at appropriate **presentation levels** (primary, intermediate, standard, advanced). A 14-year-old starting from scratch gets `survey` depth at `standard` presentation — NOT the primary-level version designed for 6-year-olds. The presentation adapts vocabulary, sentence complexity, and engagement style to the audience without changing the analytical sophistication.
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

- Cross-discipline edges live in `../learn-content/cross-discipline-edges.json` (NOT inline in per-discipline `graph.json` files)
- Each edge requires a `rationale` field explaining why this specific edge exists
- Both `from` and `to` use `discipline:topic-id` format (e.g., `"from": "ela:key-details", "to": "math:word-problems"`)
- Cross-discipline edges should almost always be `type: "required"` — if the dependency is soft enough to be `recommended`, it probably shouldn't be a cross-discipline edge at all
- **Granularity rules:** The `from` topic should be the most specific topic that provides the prerequisite skill. The `to` topic should be the most general topic that genuinely requires the skill. Don't skip levels in either direction.
- `just validate-content` runs unified DAG cycle detection across all disciplines and checks edge granularity
- The diagnostic should eventually place students across the full connected graph, not just within one discipline

---

For past decisions, see DECISIONS.md.
For gotchas, see LEARNINGS.md.
For research, see RESEARCH.md.
For learning science reference, see docs/learning-science.md (load relevant sections when making pedagogy/feature decisions).
For content architecture details, see docs/r2-content-architecture.md (R2 bundles, Analytics Engine, cache strategy).
