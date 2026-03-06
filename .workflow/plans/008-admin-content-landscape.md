# Plan: Admin Dashboard & Content Landscape

> **Created:** 2026-03-05T19:29:23Z
> **Updated:** 2026-03-05T21:00:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Admin visibility and content strategy. Before building generation infrastructure (009), we need to answer: what are we generating, how do we store it, how do we distribute and monetize it, and what do we prioritize? Then build the admin tooling to see what exists, measure its quality, identify gaps, and curate what the pipeline (009) produces.

**Depends on:** Plan 007 Phase 1 (content model restructure — `instructional_content` and `assessment_content` tables must exist).

**Feeds into:** Plan 009 (Content Generation Pipeline) — the strategy decisions here determine what 009 builds and in what order.

**Research basis:** [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md) — Content Quality Analytics, Content Velocity, Curriculum Rewrites sections.

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓
**In Progress:** —
**Next:** Phase 4

---

## Phase 1: Content Strategy & Prioritization ✓
**Goal:** Make the big decisions about what content we produce, how we store different media types, how we distribute beyond the platform, and what we invest in first. These decisions drive everything in 009 (pipeline) and shape what the admin tooling needs to manage.

1. [x] [RSH] **Content type inventory and prioritization.** Assess each content type for impact, feasibility, and cost. Decide short-term vs long-term priorities:

   **Text content (exists today, expand):**
   - Assessment problems (diverse question types — 007 P2)
   - Instructional lessons (worked examples with steps)
   - Flavored variants (adventure, nature, space, etc.)
   - Locale translations (es, ja, ar)

   **Visual content (high impact, medium effort):**
   - SVG diagrams/visual aids (number lines, arrays, fraction bars — 007 P3)
   - Generated illustrations for flavored content (adventure scenes, space themes)
   - Printable worksheets and problem sets (already partially in 007 P4 Teach Mode)

   **Interactive content (high impact, high effort):**
   - Embedded learning games (drag-and-drop, sorting, pattern completion)
   - Interactive manipulatives (virtual base-ten blocks, fraction strips)
   - Sandbox/playground modes (free exploration of concepts)

   **Audio/video content (medium impact, high effort):**
   - Narrated lessons (TTS or generated voice-over)
   - Animated explanations (manim-style, concept animations)
   - YouTube-ready educational videos (lessons as standalone content)

   **Narrative/IP content (long-term, high differentiation):**
   - Original characters and story universes for content flavors
   - Serialized math adventure stories (problems woven into narrative)
   - Character-driven tutoring personas

   Produce a prioritized roadmap: what ships in the next 3 months vs 6 months vs later.

2. [x] [RSH] **Storage architecture for rich media.** Current: text content in D1 tables (`instructional_content`, `assessment_content`). Plan for:
   - Binary assets (images, audio, video): R2 object storage with CDN
   - Asset references in content tables (`assetsJson` field from 007 P1 schema)
   - Versioning of binary assets alongside content versions
   - Size budgets per content type (mobile-friendly)
   - Offline availability considerations (content packs with embedded assets?)

3. [x] [RSH] **Distribution and monetization strategy.** The platform is free-leaning with CC BY 4.0 content. How do we create value beyond the free service?
   - **On-platform:** Free access to all base content. AI features are the paid tier (already decided in DECISIONS.md).
   - **Content packs:** Already have offline JSON packs (007 P4). Extend to include rich media. Free for basic, premium augmented packs?
   - **API/embed licensing:** Other edtech platforms use our content via API. Free for CC BY 4.0 base content. Paid tier for: real-time adaptive sequencing, FSRS integration, analytics, premium media.
   - **YouTube/social:** Educational video content published freely as a growth channel. Drives awareness, links back to platform for interactive experience.
   - **Printable/classroom materials:** PDF worksheets, teacher guides. Free, drives Teach Mode adoption.
   - **Original IP licensing:** If we create characters/stories, they could be licensed for books, apps, merchandise. Long-term play.
   - **Game embeds:** Learning games embeddable in other sites with attribution. Free basic, paid for customization/analytics.

   Decide: what's CC BY 4.0 (everything base?), what's platform-exclusive (AI features, adaptive sequencing), what's separately monetizable (premium media, API access, IP)?

4. [x] [RSH] **Short-term content priorities.** Given the current state (71 math K-5 topics, ~5 problems each, text-only), decide immediate generation priorities for 009:
   - Priority 1: Assessment pool expansion (5 → 15-30 per topic, diverse types)
   - Priority 2: SVG visual aids for high-impact topics (counting, place value, fractions)
   - Priority 3: Base English instructional content improvement (shorter, clearer, Engelmann-informed)
   - Priority 4: First flavor pilot (pick 1-2 flavors, 10 topics)
   - Priority 5: First locale pilot (pick 1 language, classic content)
   - Validate this ordering or revise based on strategy decisions above.

5. [x] [DOC] Write up content strategy decisions in DECISIONS.md. Document: content type priorities, storage architecture, distribution model, licensing tiers, short-term generation roadmap.

**Validation:** Clear, documented answers to: what content types do we prioritize? How do we store rich media? How do we distribute and monetize? What does 009 build first? These decisions unblock all downstream work.

---

## Phase 2: Admin Dashboard & System Stats ✓
**Goal:** Protected admin area with platform overview. The home base for managing content and monitoring the platform.

1. [x] [IMP] Build `/admin` route with admin-only auth gate (Better-Auth admin plugin role check). Dashboard home shows: total topics, total instructional content rows, total assessment content rows, content by locale breakdown, content by flavor breakdown, user counts, org counts.

2. [x] [IMP] Admin navigation: Overview, System Stats, Model Config, LLM Usage, Content Effectiveness, Learning Patterns. Clean, functional UI — internal tool, table-heavy, data-dense layout.

3. [x] [IMP] System stats page: total content volume by type, active users (7d/30d), LLM usage summary (cost, calls, tokens, models), content creation velocity (content rows added per week, last 8 weeks).

4. [x] [TST] Verify: admin route auth-gated (no session gets 401). Dashboard loads with real data. Navigation works. Stats queries validated at service level. All 132 tests pass.

**Validation:** Paul has a home base to see platform health at a glance. Auth-gated, data-dense, functional.

---

## Phase 3: Content Quality Analytics ✓
**Goal:** Surface per-topic and per-problem accuracy data so content can be iterated based on real student performance. PhysicsGraph's biggest lesson: track accuracy and fix content, not students.

1. [x] [IMP] Content quality analytics page: per-topic first-attempt accuracy, hint usage rate, average response time, per-problem accuracy breakdown. Query from `review_log` data. Color-code topics by health (green >85%, yellow 80-85%, red <80%). Click-through to per-problem breakdown showing which specific problems cause struggles. Flag topics with <80% accuracy or >2 hints/attempt average.

2. [x] [IMP] Difficulty spike detection: identify adjacent topics in the knowledge graph where accuracy drops >15% from prerequisite to dependent. Surface as "difficulty spikes" — indicates content issues or missing intermediate topics. Graph-aware analysis using prerequisites table.

3. [x] [IMP] Content effectiveness over time: track how accuracy changes after content updates. Compare v1 vs v2 performance for the same topic. Show whether content iteration is actually improving outcomes.

4. [x] [TST] Verify: analytics match manual spot-checks of review_log. Difficulty spikes correctly identified. Version comparison works when data exists.

**Validation:** Paul can see which topics and problems need improvement. Difficulty spikes between prerequisite pairs are visible. Analytics drive content iteration decisions.

---

## Phase 4: Content Matrix Visualization
**Goal:** Interactive matrix view showing what content exists across all dimensions. Identify gaps. See pool sizes. The core tool for deciding what to generate next via 009.

1. [ ] [IMP] Build content matrix API: `GET /api/admin/content-matrix` returns structured summary by topic × dimension. For each topic: which instructional flavor × locale × presentation × version combos exist, assessment pool size per locale, total problem count, question type distribution, asset types present (text-only, has-visuals, has-audio, etc.). Efficient aggregate query.

2. [ ] [IMP] Build matrix visualization page: interactive grid/table. Rows = topics (grouped by grade/strand). Columns = dimension combinations. Cells show: green (content exists), red (gap), yellow (flagged by quality analytics), blue (has rich media). Click a cell to preview content. Filter by: grade, subject, flavor, locale, media type. Sort by: gap count, name, grade, quality score.

3. [ ] [IMP] Assessment pool size view: per-topic problem count by locale. Highlight topics below target (< 15). Difficulty distribution (easy/medium/hard balance). Question type distribution. Flag missing difficulty levels or missing diverse types.

4. [ ] [IMP] Gap analysis summary: total matrix cells, filled count, fill percentage. Highest priority gaps (informed by Phase 1 strategy decisions). Estimated generation cost per gap (feed to 009 for budgeting). "Generate this" action creates job(s) in 009's pipeline queue.

5. [ ] [TST] Verify: matrix loads with real data. Gaps identified correctly. Filters work. Cell preview works. Pool sizes accurate. Quality overlay from Phase 3 works. Gap-to-job creation works.

**Validation:** Paul sees at a glance what exists, what's missing, what's underperforming, and what has rich media. Gap analysis feeds directly into 009's generation queue.

---

## Phase 5: Review & Curation Workflow
**Goal:** Admin UI for reviewing content produced by 009's pipeline. The human quality gate between generation and production. Pipeline produces content → lands here → approved content goes live.

1. [ ] [IMP] Review queue page: list jobs in "generated" or "reviewing" status (from 009's `generation_jobs` table). Show generated content side-by-side with base English classic version. Highlight AI review warnings and guessability flags. Show validation results (math correctness, readability, format compliance).

2. [ ] [IMP] Inline editing: edit generated content before approval (fix errors, improve wording, adjust difficulty). Preview renders (including visuals if present). Save edits back to the job's staging content.

3. [ ] [IMP] Approve/reject workflow: approve imports to `instructional_content` or `assessment_content` tables. Reject with notes (fed back to 009 for template improvement). Idempotent import — re-import updates existing content for same dimension combo.

4. [ ] [IMP] Batch operations: select multiple jobs, bulk approve/reject. Filter by content type, topic, flavor, locale, validation status, media type. Sort by creation date, topic, priority.

5. [ ] [IMP] Curation metrics: acceptance rate over time, common rejection reasons, average review time, content velocity (reviewed/imported per day/week). Track which prompt templates and generation configs produce highest acceptance rates — feed back to 009.

6. [ ] [TST] Verify: review queue shows content correctly. Side-by-side comparison works. Inline editing saves. Approve/reject flows to correct tables. Batch ops work. Metrics track accurately.

**Validation:** Paul reviews content, compares with base, edits, approves, and sees it in the matrix immediately. Rejection feedback improves generation quality over time. Acceptance rate is tracked.
