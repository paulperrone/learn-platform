# SPEC: Learn Platform

> **Version:** 1.2
> **Created:** 2026-03-04T03:35:01Z
> **Updated:** 2026-03-06
> **Status:** Active

## Vision

A free, open mastery-learning platform inspired by MathAcademy's knowledge graph + spaced repetition approach, expanded with LLM capabilities (Socratic tutoring, problem generation, self-explanation assessment). Covers many subjects starting from the very foundations. Core platform is free; AI features (LLM tutoring, speech-to-text) are subscription-gated with transparent usage-based pricing.

## Revenue Model

**Goal:** Maximize adoption. Free core learning platform, sustainable margin on AI features only.

- **Free tier:** Full platform — knowledge graph, SRS, problems, worked examples, browser TTS, progress tracking, family accounts
- **Paid tier ($5/mo or $50/yr):** AI features — LLM tutoring/grading/hints, speech-to-text, future premium features
- **Usage cap:** $3/mo of AI usage per billing period (40% gross margin before Stripe fees/taxes)
- **Overage:** Parents set monthly spend cap in $5 increments (default $5 = no overage). Each $5 unlocks $3 more AI usage. Auto-charges up to parent-set cap
- **Teacher/tutor accounts:** Always free (read-only progress access via parent sharing)
- **Supplementary revenue:** YouTube lesson videos (ad revenue, no in-app ads)

## MVP Scope

**Foundational Mathematics** as first subject — 71 topics aligned to Common Core, covering counting through early algebra.

### Core Systems

1. **Knowledge Graph Engine** — DAG of prerequisite relationships between atomic learning topics. Frontier computation, traversal, depth assignment, validation.

2. **SRS Engine** — ts-fsrs spaced repetition with FIRe (Fractional Implicit Repetition) credit. Per-user per-topic FSRS card state. Session mix: ~60% review, ~40% new.

3. **Adaptive Diagnostic** — Binary-search placement test that finds a student's level by jumping through the knowledge graph. Starts at middle grade, adapts based on answers, refines near the boundary. Materializes mastery estimates into SRS state on completion. Supports retake from dashboard.

4. **Learning Loop** — 6-phase session: pretest → instruction (worked examples) → guided practice → independent practice → spaced review → remediation.

5. **LLM Integration** — Runtime: Socratic tutoring, self-explanation evaluation, response grading. Offline: content generation pipeline (graph, problems, examples). Platform-medium constraints ensure screen-native content.

6. **Speech** — Browser TTS for reading problems aloud (K-2 audience). Workers AI Whisper for speech-to-text input. Graceful degradation when AI binding unavailable.

7. **Frontend** — Dashboard with diagnostic CTA, learning session UI, progress visualization, knowledge graph explorer, admin dashboard with content matrix.

### Content Model

All problems, worked examples, and graph structure are **pre-generated offline** by LLMs, **human-reviewed**, and **imported**. Runtime LLM is only for interactive tutoring/grading.

### Non-Goals (MVP)

- Multiple subjects (post-MVP — but graph architecture supports cross-subject prerequisites)
- Video generation
- Social features / leaderboards
- Dynamic learning path optimization (RL)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare Workers |
| API | Hono |
| Database | D1 + Drizzle ORM |
| Auth | Better-Auth |
| Frontend | Vue 3 + Vite + Tailwind CSS v4 |
| SRS | ts-fsrs v5 |
| LLM | OpenRouter |
| Monorepo | pnpm workspaces |
| Deploy | Cloudflare Pages |

## Users

- **Young learners** (K-5, ages 5-11) working through math fundamentals
- **Parents/guardians** setting up and managing family accounts, controlling billing and teacher sharing
- **Teachers/tutors** (free accounts) viewing linked students' progress — school teachers, homeschool co-ops, private tutors, after-school programs
- **Self-directed adult learners** reviewing foundations

## Success Criteria

- Full learning session works end-to-end (pretest through review)
- 71 Foundational Mathematics topics with validated problem banks and worked examples
- SRS scheduling produces correct review intervals
- FIRe credit reduces review burden measurably
- Auth flow works for account creation and login
- Deployed and accessible on the public internet

## Post-MVP Roadmap

Future capability areas, in recommended priority order. Each should become its own epic via `/workflow-intake`.

1. **Math 6-12 Content Expansion** — Extend from 71 K-5 topics to full K-12 math. Subjects should form continuous connected graphs (K-5 → pre-algebra → algebra, etc.), not isolated silos. The diagnostic should place across the full connected graph. Requires parameterized content pipeline, support for more complex problem types, and graph structure scaling.

2. **Cross-Subject Prerequisites** — Reading comprehension is a prerequisite for math word problems. Algebra is a prerequisite for physics. The graph schema supports cross-subject edges; content and diagnostic need to leverage them.

3. **Reading/ELA Subject** — First non-math subject. Validates multi-subject architecture. Requires new content types (passages, comprehension questions) and different assessment models. Light prerequisite links to math word problems.

4. **Enhanced LLM Tutoring** — Inject session context (recent responses, struggle areas, mastery level) into LLM prompts. Add streaming responses for more natural tutoring. Build hint system that progressively reveals solution steps.

5. **Interactive Simulations** — Canvas/WebGL components for geometry, measurement, and data topics. High-impact for visual learners but significant frontend work per topic.

6. **Adaptive Learning Paths** — ML-based path optimization using accumulated user data. Requires months of usage data before viable. Reinforcement learning approach to optimize topic ordering per student.

### Completed (moved from roadmap)

- **Parent Dashboard + Role System** — Family accounts, child profiles, progress viewing, budget controls
- **Speech/TTS** — Browser TTS for problem reading, Workers AI Whisper for speech-to-text input
- **Adaptive Diagnostic** — Binary-search placement test with mastery materialization
