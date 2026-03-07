# Plan: Content Generation Pipeline

> **Created:** 2026-03-05T21:00:00Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

The production system for generating content at scale across all dimensions of the content matrix. Takes strategy decisions from 008 Phase 1 and turns them into actual content — text, visuals, audio, video, interactive — through a multi-backend pipeline with LLMs, image generation, compute orchestration, and automated quality gates.

PhysicsGraph's biggest multiplier was investing in content tooling (2 days/topic down to 1.14 days). This plan is that investment. Content creation speed is the bottleneck — everything here aims to increase velocity while maintaining quality.

**Depends on:**
- Plan 007 Phase 1 (content model — `instructional_content` and `assessment_content` tables)
- Plan 008 Phase 1 (content strategy — what to generate and in what order)

**Research basis:** [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md) — Content Velocity, Content Pipeline Tooling, ReviewBot, Question Type Diversity, Animations and Visualizations sections.

**Generation backends:**
```
LLMs (OpenRouter)          — text content: problems, lessons, hints, translations, stories
Image Generation (ComfyUI) — visual content: diagrams, illustrations, themed artwork
Compute (Modal)            — batch orchestration: parallel generation, GPU-heavy jobs
Audio (TTS models)         — narrated lessons, character voices
Video (Manim + composition)— animated explanations, YouTube-ready content
Game engines (web)         — interactive learning activities, manipulatives
```

**Content Dimension Matrix:**
```
Topic (graph node)
  x Flavor       (adventure, nature, space, cooking, sports, creative, stories, classic)
  x Locale       (en, es, ja, ar, ...)
  x Presentation (individual, group)
  x Version      (v1, v2... refinement over time)
  x Media        (text, text+visual, text+audio, video, interactive)
= Generation Matrix
```

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Pipeline Architecture & Job Model
**Goal:** The foundational infrastructure — job queue, state machine, storage, CLI tooling. Everything else builds on this.

1. [ ] [RSH] Design pipeline architecture. A generation job = a specific matrix cell to fill. Pipeline stages:
   - **Queue** — job created with target dimensions, content type, media type, priority
   - **Generate** — appropriate backend(s) produce content
   - **Validate** — automated checks (Phase 3)
   - **Review** — human reviews in admin UI (Phase 9)
   - **Import** — approved content written to production tables

   Job states: `queued` → `generating` → `generated` → `validating` → `validated` → `reviewing` → `approved`/`rejected` → `imported`. Failed states: `generation_failed`, `validation_failed`. Rejected jobs can be re-queued with modified parameters.

2. [ ] [IMP] Build `generation_jobs` table: `id`, `contentType` ('instructional'|'assessment'), `mediaType` ('text'|'text-visual'|'text-audio'|'video'|'interactive'), `topicId`, `flavor`, `locale`, `presentation`, `version`, `status`, `priority`, `backend` (which generation system), `generatedContentJson` (staging — text content), `generatedAssetsJson` (staging — asset references/parameters), `validationResult`, `reviewNotes`, `costCents` (actual generation cost), `parentJobId` (for multi-stage pipelines — e.g., text job spawns visual job), `createdAt`, `updatedAt`, `importedAt`.

3. [ ] [IMP] Build job management API: `POST /api/admin/jobs` (create job or batch of jobs), `GET /api/admin/jobs` (list by status, filters), `PATCH /api/admin/jobs/:id` (update status), `POST /api/admin/jobs/:id/retry` (re-queue failed job), `POST /api/admin/jobs/batch` (create from matrix gap selection — "fill all gaps for topic X"). Feeds into Phase 9 review queue.

4. [ ] [IMP] Build CLI tool `tools/pipeline.ts`: create jobs, run generation, check status, retry failures. Supports batch operations. `npx tsx tools/pipeline.ts generate --topic add-within-10 --flavor adventure --locale en`. Also: `--dry-run` to estimate cost without executing.

5. [ ] [TST] Verify: jobs create, transition through states, batch creation works, CLI operates correctly, failed jobs can be retried, parent-child job relationships track.

**Validation:** Pipeline infrastructure exists. Jobs flow through states. CLI and API both work. Foundation is solid for adding generation backends.

---

## Phase 2: LLM Text Generation
**Goal:** The core text generation capability — composable prompt templates, OpenRouter integration, structured output parsing. Covers assessment problems, instructional lessons, hints, and translations.

1. [ ] [IMP] Build composable prompt template system. Templates are structured data, composed at generation time:
   - **Base templates** per content type: assessment problem, instructional lesson, worked example
   - **Flavor fragments**: adventure (quest framing, adventure characters), nature (outdoor scenarios, animals), space (rockets, planets), etc. Each flavor defines: character names, setting descriptions, scenario patterns, vocabulary constraints
   - **Locale instructions**: culturally appropriate names, currency, measurement units, number formatting, reading direction. Not just translation — cultural adaptation.
   - **Presentation adaptation**: individual (second person, "you") vs group (facilitator instructions, discussion prompts)
   - **Question type constraints**: numerical-input (no options), multi-step (sub-problem chain), matching (pair structure), etc.
   - **Difficulty calibration**: grade-level vocabulary, operation complexity, number ranges per difficulty tier

   Templates stored as TypeScript objects with composition functions. Versioned — track which template version produced which content.

2. [ ] [IMP] Build generation executor: takes a queued job, composes prompt from templates + topic metadata + base content (if translating/flavoring from existing classic/en), calls LLM via OpenRouter, parses structured response into content schema, validates format compliance, updates job with generated content. Handle: retries on malformed output, cost tracking per call, model selection per content type (cheaper models for translation, capable models for original content).

3. [ ] [IMP] Build translation pipeline: for assessment content, translate classic/en problems to target locale. Verify numerical answers are identical. For instructional content, culturally adapt (not just translate). Two-pass: generate translation, then validate with a second LLM call checking faithfulness + cultural appropriateness.

4. [ ] [IMP] Build content improvement pipeline: take an existing content item + quality analytics from 008 (accuracy rate, hint usage, student feedback) → generate improved version (v2). Prompt includes: "This problem has 65% accuracy, students commonly make X mistake, hints are used 80% of the time. Improve clarity, add better hints, adjust difficulty." Version tracking links v2 to v1.

5. [ ] [TST] Verify: prompt composition produces well-structured prompts across flavor/locale/presentation combos. Generated content parses correctly. Translations preserve math. Cost tracking accurate. Improvement pipeline produces meaningful changes.

**Validation:** Text content generates reliably across the matrix. Flavored content is thematically appropriate. Translations are culturally adapted. Improvement pipeline responds to quality signals.

---

## Phase 3: AI Review & Validation Framework
**Goal:** Automated quality gates between generation and human review. PhysicsGraph's ReviewBot caught errors humans missed. Our version validates math, checks age-appropriateness, scans for guessability, and scores readability.

1. [ ] [IMP] Build validation runner: takes generated content, runs a sequence of validators, produces a structured report attached to the job. Validators are composable — different content types run different validator sets. Report includes: pass/fail per check, severity (error/warning/info), specific issue descriptions.

2. [ ] [IMP] **Math correctness validator:** For assessment content — verify the stated answer is correct. For numerical problems, compute the answer independently. For multi-step, verify each step. For matching, verify all pairs. Use a math-capable LLM (or symbolic computation for arithmetic) as a second opinion. Flag discrepancies.

3. [ ] [IMP] **AI content reviewer (ReviewBot):** LLM-based review checking: age-appropriateness for stated grade level, clarity of language (no ambiguous wording), hint quality (do hints guide without giving away?), answer correctness, difficulty alignment, cultural sensitivity for locale content. Produces per-issue explanations. This is the generalist quality check.

4. [ ] [IMP] **Guessability scanner:** For any MC-style or matching assessment — can the correct answer be identified without understanding the math? Check: is the correct answer visually distinct (only even number, longest option, etc.)? Are distractors plausible? Flag with explanation and suggested fix.

5. [ ] [IMP] **Readability scorer:** Flesch-Kincaid grade level, vocabulary complexity, sentence length. Flag content that's above the target grade level for the topic. Especially important for K-2 content where reading ability is limited.

6. [ ] [IMP] **Format compliance validator:** Does the generated content match the expected schema? All required fields present? JSON well-formed? Asset references valid? Difficulty field matches allowed values? This catches malformed generation output before it reaches review.

7. [ ] [TST] Verify: math validator catches intentional errors. ReviewBot flags age-inappropriate content. Guessability scanner identifies obvious MC questions. Readability scorer aligns with known grade-level texts. Format validator rejects malformed content.

**Validation:** Automated validation catches the majority of quality issues before human review. Reviewers spend time on subjective quality, not catching math errors or format problems.

---

## Phase 4: Visual Content Generation
**Goal:** Move beyond text-only content. Generate diagrams, illustrations, and visual aids that render in the platform and enrich flavored content.

1. [ ] [RSH] Assess visual generation approaches and match to content needs:
   - **Programmatic SVG** (code-generated): number lines, arrays, fraction bars, place value charts. Deterministic, fast, no GPU needed. Parameters stored in `assetsJson`. Best for: mathematical diagrams where precision matters.
   - **ComfyUI / Stable Diffusion**: themed illustrations for flavored content (adventure scene with math problem, space-themed diagrams). GPU-required, variable quality. Best for: decorative/thematic visuals that don't need mathematical precision.
   - **Manim / programmatic animation**: animated explanations (regrouping, carrying, fraction operations). Deterministic, GPU for rendering. Best for: concept animations, video content.
   - **Hybrid**: programmatic math diagram + generated decorative border/theme.

   Decide which approach for which content type. Cost and quality tradeoffs.

2. [ ] [IMP] Build programmatic SVG generator: given topic + visual type + parameters, produce SVG markup. Visual types from 007 P3: `NumberLine`, `BaseTenBlocks`, `FractionBar`, `ArrayGrid`, `PlaceValueChart`. Generator takes content context (the specific numbers in a problem) and produces accurate, labeled diagrams. Output stored as SVG strings or parameters in `assetsJson`.

3. [ ] [IMP] Build image generation pipeline (ComfyUI integration): for flavored content, generate themed illustrations. Workflow: text prompt composed from flavor + topic + scene description → ComfyUI API → generated image → stored in R2 → reference in `assetsJson`. Style consistency per flavor (adventure always looks like adventure). Batch generation via Modal for GPU access.

4. [ ] [IMP] Build visual-text composition: generated visuals paired with text content. Instructional content step can reference an inline visual. Assessment content can include a diagram as part of the question. ProblemView and WorkedExample components (007 P3) render from `assetsJson`.

5. [ ] [IMP] Build animation generation pipeline (stretch goal): Manim scripts generated from lesson structure → rendered to video/GIF → stored in R2. For concept animations: regrouping, fraction operations, number line jumps. Can be embedded in lessons or exported as standalone video content.

6. [ ] [TST] Verify: SVG generator produces correct diagrams for sample problems. Image generation produces themed visuals. Visuals render in platform. Asset references resolve correctly. Batch generation via Modal works.

**Validation:** Topics have visual aids that render alongside text. Flavored content has themed illustrations. Math diagrams are accurate. Visual generation is repeatable and cost-effective.

---

## Phase 5: Batch Orchestration & Cost Management
**Goal:** Run generation at scale — hundreds of jobs across multiple backends, with cost tracking, parallelism, and failure handling.

1. [ ] [IMP] Build batch orchestrator: takes a set of generation jobs, groups by backend (LLM, image, audio), executes in parallel with configurable concurrency limits. Rate limiting per API provider. Retry with exponential backoff on transient failures. Dead letter queue for persistent failures. Progress reporting (X of Y complete, estimated time remaining).

2. [ ] [IMP] Modal integration for GPU-heavy jobs: image generation (ComfyUI), animation rendering (Manim), bulk audio generation. Modal functions wrap the generation logic. Jobs dispatched from the orchestrator, results pulled back and attached to jobs. Cost tracked per Modal execution.

3. [ ] [IMP] Cost management: track actual cost per job (LLM tokens, Modal compute time, R2 storage). Aggregate by: content type, dimension, backend. Estimate cost before generation (`--dry-run`). Budget limits per batch run. Cost-per-matrix-cell dashboard data for 008's gap analysis.

4. [ ] [IMP] Model selection optimization: for each content type, track quality vs cost across available models. Cheaper models for translation and format conversion. Capable models for original content creation. A/B tracking: when two models produce content for similar jobs, compare acceptance rates in Phase 9 review. Shift allocation toward higher-acceptance models.

5. [ ] [IMP] Template iteration loop: track which prompt template versions produce highest acceptance rates (from Phase 9 curation metrics). When acceptance drops below threshold, flag template for revision. Log rejection reasons → feed into template improvement.

6. [ ] [TST] Verify: batch of 50+ jobs executes with correct parallelism. Failures retry appropriately. Cost tracking matches actual API bills. Modal jobs dispatch and return. Rate limits respected.

**Validation:** Can queue and execute hundreds of generation jobs overnight. Costs are tracked and predictable. Failures don't block the batch. Model and template performance improves over time.

---

## Phase 6: Audio & Narrative Content
**Goal:** Extend the pipeline beyond text and static visuals to audio narration, story content, and character-driven experiences.

1. [ ] [RSH] Assess audio generation options: TTS models for lesson narration (quality vs cost vs latency), voice selection per locale, character voices for flavored content (adventure narrator voice vs space narrator voice). Options: Cloudflare Workers AI, ElevenLabs, OpenAI TTS, open-source models on Modal. Decide tier: basic TTS for all content vs premium voices for flagship content.

2. [ ] [IMP] Build audio generation pipeline: lesson text → TTS → audio file → R2 storage → reference in `assetsJson`. Batch generation for all instructional content in a locale. Audio segmented by lesson step (play step-by-step, not whole lesson at once). Supports browser playback via existing speech infrastructure.

3. [ ] [IMP] Build narrative content generation: for story-flavored instructional content, generate serialized narratives — recurring characters, continuing plot across topics. Character bible per flavor (personality, speech patterns, backstory). Prompt templates include narrative context from previous topics in the same flavor's story arc.

4. [ ] [IMP] Build original IP framework: define character assets, story universes, and narrative arcs for 2-3 pilot flavors. Characters that students recognize across their learning journey. Store character metadata alongside content — reusable across topics and media types.

5. [ ] [TST] Verify: audio generates and plays in platform. Narrative content maintains story continuity across topics. Character consistency holds across generated content.

**Validation:** Lessons have optional audio narration. Story flavors have recognizable characters and continuing narratives. Audio quality is acceptable for K-5 audience.

---

## Phase 7: Assessment Pool Expansion (First Production Run)
**Goal:** Use the pipeline to expand assessment from 5 problems per topic to 15-30+. This is the first real production use of the full pipeline. Classic/en first, then translations.

1. [ ] [IMP] Create assessment expansion jobs: for all 71 math K-5 topics, generate additional problems to reach 15-30 per topic. Target diversity: mix of question types (numerical-input, multi-step, matching alongside text-qa), spread across easy/medium/hard, varied surface forms (different number choices, different word problem contexts). Queue as generation jobs with appropriate templates.

2. [ ] [IMP] Execute generation and validation: run queued jobs through LLM generation → automated validation (math correctness, guessability, readability, format). Flag issues. Route validated content to Phase 9 review queue.

3. [ ] [IMP] Review and import: work through Phase 9 review queue. Track acceptance rate. Feed rejection patterns back to templates. Import approved problems.

4. [ ] [IMP] Add visual aids to high-impact assessment: for topics identified in 008 P1 strategy (counting, place value, fractions, multiplication), generate SVG visual parameters alongside problems. Problems render with diagrams.

5. [ ] [IMP] Assessment translation pilot: for expanded pools, create translation jobs for pilot locale (from 008 P1 strategy — likely Spanish first). Validate translated problems have identical numerical answers. Review and import.

6. [ ] [TST] Verify: pools reach 15-30+ per topic. Difficulty distribution balanced. Question type diversity present. Visuals render for applicable topics. Translated problems mathematically correct. Pool sizes visible in 008's content matrix.

**Validation:** Every math K-5 topic has 15-30+ assessment problems with diverse types. Pilot locale has translated problems. Pipeline ran end-to-end at production scale. Acceptance rate tracked.

---

## Phase 8: Instructional Content Matrix Fill
**Goal:** Use the pipeline to generate flavored and localized instructional content across the matrix. Build out the content experience students actually see.

1. [ ] [IMP] Base English improvement: before flavoring, improve the classic/en instructional content informed by 008 P3 quality analytics. Shorter, clearer lessons. Engelmann-informed sequencing. Better hints. Visual aids integrated. Version 2 of base content for underperforming topics.

2. [ ] [IMP] Flavor pilot: generate 2-3 flavors (from 008 P1 strategy decisions) for 10 pilot topics. Full instructional content — lessons, worked examples, visual aids (themed if image generation is ready). Review, iterate on templates, import.

3. [ ] [IMP] Locale expansion: classic instructional content translated + culturally adapted for pilot locale(s). Individual + group presentation variants. Review for cultural appropriateness. Import.

4. [ ] [IMP] Cross-dimension expansion: flavored + localized content. Adventure in Spanish, Nature in Japanese, etc. Prioritize by user demand data or 008's gap analysis. Scale based on pipeline capacity and budget.

5. [ ] [IMP] Quality iteration: track rejection patterns by dimension. Improve per-flavor and per-locale templates. Re-generate rejected content. Track acceptance rate over time. Target >80% acceptance rate before scaling further.

6. [ ] [TST] Verify: flavored content is mathematically correct and thematically appropriate. Localized content uses culturally appropriate contexts. Matrix shows expanding coverage. Quality metrics improve with iteration.

**Validation:** Content matrix shows substantial coverage across flavors and locales. Generated content passes review at >80% acceptance rate. Quality improves via template iteration. Students can experience flavored learning.

---

## Phase 9: Review & Curation Workflow (from Plan 008 Phase 5)
**Goal:** Admin UI for reviewing content produced by the pipeline. The human quality gate between generation and production. Pipeline produces content → lands here → approved content goes live.

1. [ ] [IMP] Review queue page: list jobs in "generated" or "reviewing" status from `generation_jobs` table. Show generated content side-by-side with base English classic version. Highlight AI review warnings and guessability flags. Show validation results (math correctness, readability, format compliance).

2. [ ] [IMP] Inline editing: edit generated content before approval (fix errors, improve wording, adjust difficulty). Preview renders (including visuals if present). Save edits back to the job's staging content.

3. [ ] [IMP] Approve/reject workflow: approve imports to `instructional_content` or `assessment_content` tables. Reject with notes (fed back to template improvement). Idempotent import — re-import updates existing content for same dimension combo.

4. [ ] [IMP] Batch operations: select multiple jobs, bulk approve/reject. Filter by content type, topic, flavor, locale, validation status, media type. Sort by creation date, topic, priority.

5. [ ] [IMP] Curation metrics: acceptance rate over time, common rejection reasons, average review time, content velocity (reviewed/imported per day/week). Track which prompt templates and generation configs produce highest acceptance rates.

6. [ ] [TST] Verify: review queue shows content correctly. Side-by-side comparison works. Inline editing saves. Approve/reject flows to correct tables. Batch ops work. Metrics track accurately.

**Validation:** Paul reviews content, compares with base, edits, approves, and sees it in the matrix immediately. Rejection feedback improves generation quality over time. Acceptance rate is tracked.
