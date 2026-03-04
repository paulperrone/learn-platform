# SPEC: Learn Platform

> **Version:** 1.0
> **Created:** 2026-03-04T03:35:01Z
> **Status:** Active

## Vision

A free, open mastery-learning platform inspired by MathAcademy's knowledge graph + spaced repetition approach, expanded with LLM capabilities (Socratic tutoring, problem generation, self-explanation assessment). Covers many subjects starting from the very foundations. Revenue: free platform, small margin on LLM usage via OpenRouter passthrough.

## MVP Scope

**Math K-5** as first subject — 71 topics aligned to Common Core, covering counting through early algebra.

### Core Systems

1. **Knowledge Graph Engine** — DAG of prerequisite relationships between atomic learning topics. Frontier computation, traversal, depth assignment, validation.

2. **SRS Engine** — ts-fsrs spaced repetition with FIRe (Fractional Implicit Repetition) credit. Per-user per-topic FSRS card state. Session mix: ~60% review, ~40% new.

3. **Learning Loop** — 6-phase session: pretest → instruction (worked examples) → guided practice → independent practice → spaced review → remediation.

4. **LLM Integration** — Runtime: Socratic tutoring, self-explanation evaluation, response grading. Offline: content generation pipeline (graph, problems, examples).

5. **Frontend** — Dashboard, learning session UI, progress visualization, knowledge graph explorer.

### Content Model

All problems, worked examples, and graph structure are **pre-generated offline** by LLMs, **human-reviewed**, and **imported**. Runtime LLM is only for interactive tutoring/grading.

### Non-Goals (MVP)

- Multiple subjects (post-MVP)
- Speech-to-text / text-to-speech
- Video generation
- Social features / leaderboards
- Parent/teacher dashboard
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

- Young learners (K-5, ages 5-11) working through math fundamentals
- Parents/guardians setting up accounts
- Self-directed adult learners reviewing foundations

## Success Criteria

- Full learning session works end-to-end (pretest through review)
- 71 Math K-5 topics with validated problem banks and worked examples
- SRS scheduling produces correct review intervals
- FIRe credit reduces review burden measurably
- Auth flow works for account creation and login
- Deployed and accessible on the public internet
