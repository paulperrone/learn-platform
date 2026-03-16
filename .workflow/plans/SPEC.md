# SPEC: Learn Platform

> **Version:** 1.3
> **Created:** 2026-03-04T03:35:01Z
> **Updated:** 2026-03-15
> **Status:** Active

## Vision

A free, open mastery-learning platform inspired by MathAcademy's knowledge graph + spaced repetition approach, expanded with LLM capabilities (Socratic tutoring, problem generation, self-explanation assessment). Covers many subjects starting from the very foundations. Core platform is free; AI features (LLM tutoring, speech-to-text) are subscription-gated with transparent usage-based pricing.

## Revenue Model

**Goal:** Maximize adoption. Free core learning platform, sustainable margin on AI features only.

- **Free tier:** Full platform — knowledge graph, SRS, problems, worked examples, browser TTS, progress tracking, family accounts. Zero LLM cost per free user.
- **Paid tier ($8/mo or $70/yr):** AI features — LLM tutoring/grading/hints, speech-to-text, future premium features
- **Usage cap:** $3/mo of AI usage per billing period
- **Overage:** Parents set monthly spend cap in $8 increments (default $8 = no overage). Each $8 unlocks $3 more AI usage. Auto-charges up to parent-set cap
- **Teacher/tutor accounts:** Always free (read-only progress access via parent sharing)
- **Supplementary revenue:** YouTube lesson videos (ad revenue, no in-app ads)

## Infrastructure Cost Model

**Updated:** 2026-03-09 — based on per-session D1 operation audit and full margin analysis

**Free tier cost per user:** ~$0.01/mo (D1 + Workers only, zero LLM). The entire learning engine — SRS, adaptive difficulty, remediation, diagnostic, content delivery — runs on deterministic code. No LLM in the loop for free users.

**Paid tier true margins (after Stripe 2.9% + $0.30, $3/mo LLM usage):**

| Plan | Price | After Stripe | After LLM | **Net margin** |
|------|-------|-------------|-----------|----------------|
| Monthly $8 | $8.00 | $7.47 | $4.47 | **$4.46** |
| Annual $70 | $5.83/mo | $5.63 | $2.63 | **$2.62** |

**Fixed overhead (solo operator):** ~$150-200/mo (transactional email, monitoring, accounting, business registration, tax compliance).

**Sustainability at conservative 1% conversion:**

| Free DAU | Infra/mo | Paid users | Margin/mo | Fixed OH | **Net** |
|----------|----------|-----------|-----------|----------|---------|
| 5K | $50 | 50 | $185 | $150 | **+$35** |
| 10K | $120 | 100 | $370 | $175 | **+$75** |
| 50K | $500 | 500 | $1,850 | $200 | **+$1,150** |
| 100K | $1,000 | 1,000 | $3,700 | $200 | **+$2,500** |

**Breakeven: ~7K free DAU at 1% conversion. ~3K at 2%.**

**Key architectural advantage:** free users are nearly free because content is pre-generated, grading is deterministic, and SRS is algorithmic. LLM costs only exist for paid users and are self-funded by subscription margin.

**Pricing context:** Duolingo $8/mo, IXL $10/mo, MathAcademy $49/mo. $8/mo is competitive. $70/yr ($5.83/mo effective) incentivizes annual commitment with lower churn and better Stripe fee ratio.

**Future cost optimizations (defer until 10K+ DAU):**
1. Cache frontier per user (invalidate on mastery change) — saves ~60 D1 reads/session
2. Batch content queries in `buildPhaseItem()` (3→1 query) — saves ~30 reads/session
3. Batch presentation drift writes (per-session not per-response) — saves ~14 writes/session
4. Move session state to Durable Objects — eliminates `persistState()` D1 write per response
5. Edge-cache static content (problems, examples, graph) via Cache API or KV

These optimizations could cut per-user infrastructure cost by 50-70%, but are unnecessary until scale demands them.

## MVP Scope

**Foundational Mathematics** as first subject — 772 topics across 18 strands (K-8, MA-caliber density), aligned to Common Core and Massachusetts frameworks.

### Core Systems

1. **Knowledge Graph Engine** — DAG of prerequisite relationships between atomic learning topics. Frontier computation, traversal, depth assignment, validation. Prereq density 1.46/topic, encompassing density 0.96/topic. Cross-discipline prerequisite edges supported.

2. **SRS Engine** — ts-fsrs spaced repetition with FIRe (Fractional Implicit Repetition) prerequisite-direction credit: practicing a topic applies fractional stability credit to its mastered prerequisites via BFS (up to 3 hops). Per-user per-topic FSRS card state.

3. **Adaptive Diagnostic** — Binary-search placement test that finds a student's level by jumping through the knowledge graph. Starts at middle grade, adapts based on answers, refines near the boundary. Materializes mastery estimates into `user_topic_state` for placement grade and above; topics below placement are implicitly mastered via `diagnosticSessions.topicEstimatesJson`. Supports retake from dashboard.

4. **Learning Loop** — Pull-based atomic sessions. Each `startSession()` covers one topic via `getNextItem()` priority: assessment > review > lesson > complete. Frontend calls `startSession()` repeatedly. Phases within a topic: lesson → independent → review → remediation. Assessment sessions are separate: multi-topic checkpoint triggered by assessment calibration loop, no scaffolding, scored output. Scaffolding during review is tracked (`none`, `lesson-referenced`, `llm-assisted`, `lesson-and-llm`) and affects SRS credit.

5. **Assessment Calibration** — Periodic multi-topic checkpoints triggered when `topicsIntroducedSinceAssessment / frontierSize ≥ 0.25` (ratio-based, scales naturally). Adjusts `pacingFactor` (0.5–2.0) to control review/new topic mix. Gates new lessons until checkpoint is taken; UX frames as milestone, not blocker.

6. **XP System** — Quality-weighted effort currency (not a knowledge metric). 1 XP ≈ 1 minute of focused effort, scaled by performance (perfect bonus ×1.2, rushing penalty -1 XP). Powers daily goals, streaks, weekly summaries, session feedback, and future leagues. No lifetime total stored — all meaningful scopes are time-bounded (daily, weekly). Mastery tracked separately by knowledge graph. Placement grants mastery but zero XP.

7. **LLM Integration** — Runtime: Socratic tutoring, self-explanation evaluation, response grading via OpenRouter (model-agnostic). Offline: content generation pipeline via Claude Code sessions (graph, problems, examples, generators). Platform-medium constraints ensure screen-native content.

8. **Content Delivery** — R2 stores content bundles (problems.json, examples.json per topic). D1 stores graph structure + user state only. Content service uses `ContentBucket` abstraction (R2 in production, filesystem adapter in dev/audit). Cache API for edge caching. Analytics Engine records rich per-problem events with content version correlation.

9. **Speech** — Browser TTS for reading problems aloud (K-2 audience). Workers AI Whisper for speech-to-text input. Graceful degradation when AI binding unavailable.

10. **Frontend** — Dashboard with daily XP goal ring, streak tracking, contribution graph. Learning session UI with real-time XP feedback. Study queue with XP previews. Progress visualization, knowledge graph explorer, admin dashboard with content matrix. Assessment milestone UX.

### Content Model

All content — lessons, problems, worked examples, and graph structure — is **authored in Claude Code sessions**, validated, and deployed. Problems are produced by TypeScript generators (`learn-content/<discipline>/generators/<topic-id>.ts`) that output deterministic content from a seed. Lessons are section-based (explanation, worked-example, diagram, video, practice) and serve as the primary instructional vehicle per topic. Content is bundled to R2 (problems, examples per topic) and graph structure is imported to D1. Runtime LLM is only for interactive tutoring/grading.

### Disciplines & Progression Models

Subjects are grouped into **disciplines** — broad knowledge domains that define how the prerequisite graph is traversed. Each discipline has a **progression model** that controls how strictly prerequisites gate new content.

**Progression models:**

| Model | Gating behavior | Examples |
|-------|----------------|----------|
| `mastery-gated` | Must master `required` and `recommended` prerequisites before unlocking. `enriching` edges are suggestions only. Hard sequential progression. | Mathematics, CS, foreign language grammar, music technique |
| `context-layered` | Only `required` prerequisites gate. `recommended` prerequisites add context but don't block. Breadth-first at each depth, then spiral deeper. | History, philosophy, literature, political science |
| `flexible` | All topics available. Prerequisites are suggestions for optimal ordering. | Vocabulary, geography, anatomy |

**Prerequisite edge types:**

| Type | Meaning | Gating in mastery-gated | Gating in context-layered | Gating in flexible |
|------|---------|------------------------|--------------------------|-------------------|
| `required` | Cannot meaningfully engage without this | Blocks | Blocks | Suggests |
| `recommended` | Important context that enriches understanding | Blocks | Suggests | Suggests |
| `enriching` | Nice to have, tangentially related | Suggests | Suggests | Suggests |

**Depth levels and content creation:**

Content depth maps roughly to educational stages, but the meaning of "depth" varies by discipline:

| Depth | Mastery-gated (Math) | Context-layered (History) |
|-------|---------------------|--------------------------|
| 0-2 (Survey) | Foundational skills: counting, basic operations | "What happened?" — timelines, key events, notable figures. Simple narratives. |
| 3-5 (Contextual) | Intermediate skills: fractions, multi-digit ops | "Why did it happen?" — causes, effects, connections. Multiple perspectives. |
| 6-8 (Analytical) | Pre-algebra, ratios, geometry proofs | "How do we know?" — primary sources, competing interpretations, historiography. |
| 9+ (Synthesis) | Algebra, trigonometry, calculus | "What does it mean?" — thematic analysis, comparative study, constructing arguments. |

**Seeded disciplines:** math, ela, science, history, languages, philosophy, arts, cs.

**Content depth dimension:** Content items have a `content_depth` field (`survey`, `contextual`, `analytical`, `synthesis`) that controls analytical sophistication independent of topic depth. Combined with `presentation` (audience adaptation: `primary`, `intermediate`, `standard`, `advanced`), this enables the same topic to serve different learners — a 14-year-old gets a crisp age-appropriate survey while a 6-year-old gets a story-based introduction. See `docs/content-system.md` for the full content system reference.

### Non-Goals (MVP)

- Multiple subjects (post-MVP — but graph architecture supports cross-subject prerequisites)
- Video generation
- Weekly leagues / leaderboards (future — XP infrastructure supports this)
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
| LLM (runtime) | OpenRouter (model-agnostic) — tutoring/grading only |
| Content Storage | R2 (content bundles) + D1 (graph structure) |
| Analytics | Cloudflare Analytics Engine |
| Monorepo | pnpm workspaces |
| Deploy | Cloudflare Pages |

## Users

- **Young learners** (K-8, ages 5-14) working through math fundamentals
- **Parents/guardians** setting up and managing family accounts, controlling billing and teacher sharing
- **Teachers/tutors** (free accounts) viewing linked students' progress — school teachers, homeschool co-ops, private tutors, after-school programs
- **Self-directed adult learners** reviewing foundations

## Success Criteria

- Full learning session works end-to-end (diagnostic → lesson → review → assessment checkpoint)
- 772 Mathematics topics (K-8) with generator-produced problem banks and worked examples
- SRS scheduling produces correct review intervals
- FIRe prerequisite-direction credit reduces review burden measurably
- Assessment calibration adjusts pacing based on checkpoint performance
- XP system tracks effort quality across daily goals, streaks, and session feedback
- Auth flow works for account creation and login
- Deployed and accessible on the public internet

## Post-MVP Roadmap

Future capability areas, in recommended priority order. Each should become its own epic via `/workflow-intake`.

1. **Math 9-12 Content Expansion** — Extend from 772 K-8 topics to full K-12 math (algebra II, trigonometry, pre-calculus, calculus). Generator architecture (Plan 029) supports this. Requires more complex problem types and graph structure scaling at the upper end.

2. **Cross-Subject Prerequisites** — Reading comprehension is a prerequisite for math word problems. Algebra is a prerequisite for physics. Disciplines and progression models are implemented. The prerequisites table supports `required`/`recommended`/`enriching` edge types. Content and diagnostic still need to leverage cross-subject edges.

3. **Reading/ELA Subject** — First non-math subject. Validates multi-subject architecture. Requires new content types (passages, comprehension questions) and different assessment models. Light prerequisite links to math word problems.

4. **Enhanced LLM Tutoring** — Inject session context (recent responses, struggle areas, mastery level) into LLM prompts. Add streaming responses for more natural tutoring. Build hint system that progressively reveals solution steps.

5. **Interactive Simulations** — Canvas/WebGL components for geometry, measurement, and data topics. High-impact for visual learners but significant frontend work per topic.

6. **Adaptive Learning Paths** — ML-based path optimization using accumulated user data. Requires months of usage data before viable. Reinforcement learning approach to optimize topic ordering per student.

### Completed (moved from roadmap)

- **Parent Dashboard + Role System** — Family accounts, child profiles, progress viewing, budget controls
- **Speech/TTS** — Browser TTS for problem reading, Workers AI Whisper for speech-to-text input
- **Adaptive Diagnostic** — Binary-search placement test with mastery materialization
- **Math K-8 Content Expansion** — 71 → 772 topics across 18 strands with generator architecture (Plan 029)
- **R2 Content Architecture** — Content bundles on R2, graph structure on D1, Analytics Engine events (Plan 023)
- **Learning Loop Simplification** — Pull-based atomic sessions replacing 6-phase loop (Plan 031)
- **Assessment Calibration** — Periodic checkpoint system with pacing adjustment (Plans 030/031)
- **Content Generators** — TypeScript generators producing deterministic content from seed (Plan 029)
