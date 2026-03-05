# Plan: Admin Dashboard, Content Matrix & Generation Pipeline

> **Created:** 2026-03-05T19:29:23Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build a system admin dashboard, content matrix visualization, and a content generation pipeline. The admin view lets the platform owner (Paul) see what content exists across all dimensions (topic x flavor x locale x presentation x version), identify gaps, and queue generation jobs. The pipeline takes specific matrix combinations as inputs and generates content (instructional, assessment, videos, etc.) for review before import.

**Depends on:** Plan 007 Phase 1 (content model restructure — instructional_content and assessment_content tables must exist).

**Content Dimension Matrix:**

```
Topic (graph node)
  x Flavor       (adventure, nature, space, cooking, sports, creative, stories, classic)
  x Locale       (en, es, ja, ar, ...)
  x Presentation (individual, group)
  x Version      (v1, v2... refinement over time)
= Generation Matrix
```

**Pipeline scope:**
- Instructional content: full matrix treatment (all flavors, locales, presentations)
- Assessment content: classic + locale translations only (neutral testing)
- Future: video scripts, interactive activities, audio narration
- All generated content goes through review before import

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Admin Dashboard Foundation
**Goal:** Protected admin area for system management. Auth-gated to admin role. Foundation for content matrix and pipeline management views.

1. [ ] [IMP] Build `/admin` route with admin-only auth gate. Use Better-Auth admin plugin role check. Dashboard home shows: total topics, total instructional content rows, total assessment content rows, content by locale breakdown, content by flavor breakdown, user counts, org counts.

2. [ ] [IMP] Admin navigation: Content Matrix, Generation Queue, Users & Orgs, System Stats. Clean, functional UI — this is an internal tool, not user-facing. Table-heavy, data-dense layout.

3. [ ] [IMP] System stats page: database size, total content volume, active users, active orgs, LLM usage summary, OpenRouter key status. Quick health check for the platform.

4. [ ] [TST] Verify: admin route is auth-gated (non-admin gets 403). Dashboard loads with real data. Navigation works across admin pages.

**Validation:** Paul can log in, navigate to /admin, and see a high-level overview of the platform's content and user state.

---

## Phase 2: Content Matrix Visualization
**Goal:** Interactive matrix view showing what content exists across all dimensions. Identify gaps. See pool sizes. The core tool for deciding what to generate next.

1. [ ] [IMP] Build content matrix API endpoints: `GET /api/admin/content-matrix` returns a structured summary of all content by topic x dimension. For each topic: which instructional flavor x locale x presentation x version combos exist, assessment pool size per locale, total problem count. Efficient query — aggregate counts, not full content.

2. [ ] [IMP] Build matrix visualization page: interactive grid/table. Rows = topics (grouped by grade/strand). Columns = dimension combinations. Cells show: green (content exists), red (gap), yellow (exists but low quality/needs review). Click a cell to see the actual content. Filter by: grade level, subject, flavor, locale. Sort by: gap count, topic name, grade.

3. [ ] [IMP] Assessment pool size view: for each topic, show problem count by locale. Highlight topics with < 15 problems (below target). Show difficulty distribution (easy/medium/hard balance). Flag topics with missing difficulty levels.

4. [ ] [IMP] Gap analysis summary: auto-generated report of what's missing. "71 topics x 8 flavors x 4 locales x 2 presentations = 4,544 instructional content cells. Currently filled: 142 (3.1%). Highest priority gaps: [list]." Sortable by priority (base English classic first, then locales, then flavors).

5. [ ] [TST] Verify: matrix loads with real content data. Gaps are correctly identified. Filters work. Cell click shows content preview. Assessment pool sizes accurate.

**Validation:** Paul can see at a glance which content exists, what's missing, and where to focus generation effort. Gap analysis provides a clear priority list.

---

## Phase 3: Content Generation Pipeline Architecture
**Goal:** Design and build the pipeline that takes a matrix combination as input and generates content for review. The pipeline is the system — individual generation jobs are queued, executed, reviewed, and imported.

1. [ ] [RSH] Design pipeline architecture. A generation job = a specific matrix combination to fill (e.g., "add-within-10, adventure, es, group, v1, instructional"). Pipeline stages: (a) Queue — job created with target dimensions and content type. (b) Generate — LLM produces content using composable prompt templates. (c) Validate — automated checks (math correctness, completeness, format). (d) Review — human reviews generated content in admin UI. (e) Import — approved content written to DB. Define job states: queued, generating, generated, reviewing, approved, rejected, imported. Define storage for generated-but-not-yet-imported content (staging area).

2. [ ] [IMP] Build `generation_jobs` table: id, contentType ('instructional'|'assessment'), topicId, flavor, locale, presentation, version, status, generatedContentJson (staging), validationResult, reviewNotes, createdAt, updatedAt, importedAt. API routes: create job(s), list jobs by status, update job status, import approved job.

3. [ ] [IMP] Build composable prompt templates: per-flavor fragments (adventure contexts, nature contexts, etc.), per-locale translation instructions (culturally appropriate names, currency, units), per-presentation adaptation (group: class framing, discussion prompts; individual: student-focused), per-content-type (instructional: worked example steps; assessment: problems with answers/hints). Templates stored as structured data, composable at generation time.

4. [ ] [IMP] Build generation executor: takes a queued job, composes the prompt from templates + base content, calls LLM (OpenRouter), parses response into structured content, runs automated validation (math correctness, format compliance, completeness), updates job with generated content and validation result. Can run as a CLI tool (`tools/run-generation.ts`) or triggered from admin UI.

5. [ ] [IMP] Build `tools/validate-generated.ts`: validates generated content — instructional: math correctness of steps, step completeness, appropriate difficulty. Assessment: numerical answers correct, difficulty labels match, no duplicates. Outputs structured validation report attached to the job.

6. [ ] [TST] Verify: job can be created, generation produces valid content, validation catches intentionally introduced errors, job status flows through all stages. CLI tool works for batch generation.

**Validation:** A generation job for "add-within-10, adventure, es, group, v1, instructional" produces correct Spanish adventure-themed worked example steps. Validation confirms math is correct. Job is staged for review.

---

## Phase 4: Review & Import Workflow
**Goal:** Admin UI for reviewing generated content, approving/rejecting, and importing approved content into the live database.

1. [ ] [IMP] Build review queue page in admin: list of jobs in "generated" or "reviewing" status. Show generated content side-by-side with the base English classic version for comparison. Highlight validation warnings. Allow inline editing of generated content before approval. Approve or reject with notes.

2. [ ] [IMP] Build batch operations: select multiple jobs, bulk approve, bulk reject. Filter review queue by content type, topic, flavor, locale. Sort by creation date, topic, validation status.

3. [ ] [IMP] Build import action: approved jobs get imported into `instructional_content` or `assessment_content` tables. Job status updated to "imported". Import is idempotent — re-importing updates existing content for the same dimension combination. Content matrix visualization (Phase 2) reflects new content immediately.

4. [ ] [IMP] Build generation queue management in admin: create new generation jobs by selecting matrix gaps from the content matrix view. "Fill all gaps for topic X" or "Generate adventure flavor for all topics in grade 3." Batch job creation. Priority ordering. Estimated cost display (based on token estimates per content type).

5. [ ] [TST] Verify: review queue shows generated content correctly. Side-by-side comparison with base works. Inline editing saves. Approve/reject flows work. Import writes to correct tables. Batch operations work. Queue management creates jobs from matrix gaps.

**Validation:** Paul can review generated content, compare with base, edit if needed, approve, and see it appear in the content matrix. Can select gaps in the matrix and queue generation jobs.

---

## Phase 5: Assessment Pool Expansion
**Goal:** Use the pipeline to expand assessment pools from 5 to 15-30+ problems per topic. Classic/en first, then locale translations.

1. [ ] [IMP] Create assessment expansion jobs: for all 71 topics, generate additional problems to reach 15-30 per topic. Target diversity: mix of pure numerical and word problems, spread across easy/medium/hard, varied surface forms. Queue as generation jobs.

2. [ ] [IMP] Run generation and review: execute queued assessment jobs. Validate math correctness. Review in admin. Import approved problems.

3. [ ] [IMP] Assessment translation jobs: for expanded pools, create translation jobs for pilot locales (es, ja, ar). Validate translated problems have identical numerical answers. Review and import.

4. [ ] [TST] Verify: assessment pools reach 15-30+ per topic. Difficulty distribution is balanced. Translated problems have correct answers. Pool sizes visible in content matrix.

**Validation:** Every topic has 15-30+ assessment problems. Spanish, Japanese, and Arabic pools exist with correct math. Content matrix shows full coverage.

---

## Phase 6: Instructional Content Matrix Fill
**Goal:** Use the pipeline to generate flavored and localized instructional content across the matrix.

1. [ ] [IMP] Pilot generation: 10 topics x 3 flavors (adventure, nature, space) x en x individual + group = 60 instructional content jobs. Generate, validate, review, import.

2. [ ] [IMP] Locale expansion: generate classic instructional content in es, ja, ar for all 71 topics x individual + group. 426 jobs. Generate, validate, review, import.

3. [ ] [IMP] Cross-dimension expansion: flavored + localized instructional content. Adventure in Japanese, Nature in Arabic, etc. Prioritize by user demand data (if available) or by matrix gap analysis.

4. [ ] [IMP] Quality iteration: track which generated content gets rejected in review. Improve prompt templates based on rejection patterns. Re-generate rejected content with improved prompts. Track acceptance rate over time.

5. [ ] [TST] Verify: pilot flavored content is mathematically correct and thematically appropriate. Localized content uses culturally appropriate names/contexts. Cross-dimension content composes correctly. Content matrix shows expanding coverage.

**Validation:** Content matrix shows substantial coverage across flavors and locales. Generated content passes review at >80% acceptance rate. Quality improves over time via template iteration.
