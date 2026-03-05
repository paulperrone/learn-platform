# Plan: Content Personalization, Access & Group Learning

> **Created:** 2026-03-05T18:32:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Restructure the content model to separate the knowledge graph (source of truth) from instructional and assessment content. Restructure the account model so orgs are a billing layer, account_links are a visibility layer, and any account can learn + teach. Add Teach Mode for zero-account classroom use, anonymous/guest access, app-level i18n, and connected group learning.

Content generation pipeline, content matrix visualization, and admin tooling are in a **separate plan** (see plan 012: Admin, Content Matrix & Pipeline).

**Research basis:** docs/learning-science.md (SDT/autonomy, self-explanation, relatedness, dual coding, working memory), PhysicsGraph analysis (engagement as bottleneck, content diversity), SPEC.md (open platform, CC BY 4.0 content).

---

### Core Architecture A — Three-Layer Content Model

```
GRAPH NODES (topics table) -- the ONE source of truth
|  id, name, description, depth, gradeLevel, standardCode
|  Relationships: prerequisites, encompassings
|  Mastery: user_topic_state FK -> topics.id
|  NO content stored here (problemsJson/examplesJson removed)
|
+-- INSTRUCTIONAL CONTENT (new table, FK -> topics.id)
|     Each row = one specific combination in the matrix
|     Columns: topicId, flavor, locale, presentation, version
|     Contains: title, lesson steps (worked examples), asset refs (videos, activities)
|     Matrix: topic x flavor x locale x presentation x version
|
+-- ASSESSMENT CONTENT (new table, FK -> topics.id)
      Each row = one problem in the pool
      Columns: topicId, flavor, locale, presentation, version, difficulty
      Contains: question, answer, hints, solution
      Same dimension columns as instructional (future-proofed)
      DEFAULT: classic flavor + en locale only, locale translations later
      Large varied pool per topic (target 15-30+ problems)
```

**Instructional content** gets the full matrix treatment. Versions represent refinement over time (v1 -> v2), not variation for review.

**Assessment content** stays classic + locale-only for now. Real-world tests aren't themed. Variation comes from pool size. Schema supports future flavored assessment.

---

### Core Architecture B — Unified Account Model

```
TWO INDEPENDENT LAYERS:

1. ORGS (billing layer) -- shared spending source
|  Any type: family, school, tutoring-org, etc.
|  Roles within org: owner, admin, teacher, student
|  Billing: per-student budget (~$5/student suggested for orgs)
|  If user belongs to billing org -> org billing takes priority
|  Individual accounts without org -> self-billing ($5/mo or $50/yr)
|
2. ACCOUNT LINKS (visibility/tracking layer) -- who sees whose progress
   type: 'parent' | 'teacher' | 'tutor' | 'guardian'
   Lightweight many-to-many edges between accounts
   Independent of org membership -- persist across org changes
   Privacy-respecting: defined permissions per link type
```

**Single unified account.** Every account can learn AND teach. No separate account types — capabilities are additive. Orgs handle billing. Account links handle visibility. These are independent.

---

### Key Design Principles

- Topics table = graph nodes only. Source of truth for mastery and structure.
- Both instructional and assessment content FK to the topic node.
- No age-gated content. Universal access.
- Simplified UI only for very young learners (2-5/6) needing speech/simple nav.
- Any account can learn AND teach.
- Orgs handle billing. Account links handle visibility. Independent layers.
- Anonymous usage is first-class — not degraded, just unpersisted.
- All content CC BY 4.0.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Content Model Restructure & Schema Migration
**Goal:** Separate the knowledge graph from content. Create normalized `instructional_content` and `assessment_content` tables with dimension columns. Migrate existing inline JSON blobs to the new tables. No content generation — just the data model.

1. [ ] [RSH] Design the normalized content schema. `instructional_content` table: `id`, `topicId` (FK -> topics.id), `flavor` (text, default 'classic'), `locale` (text, default 'en'), `presentation` (text, default 'individual'), `version` (integer, default 1), `title` (text), `stepsJson` (text — array of WorkedExampleStep), `assetsJson` (text — optional array of asset references: videos, activities, images), `createdAt`, `updatedAt`. `assessment_content` table: `id`, `topicId` (FK -> topics.id), `flavor` (text, default 'classic'), `locale` (text, default 'en'), `presentation` (text, default 'individual'), `version` (integer, default 1), `difficulty` (text), `question` (text), `answer` (text), `hintsJson` (text — array of hint strings), `solution` (text), `createdAt`. Define indexes: composite on (topicId, flavor, locale, presentation, version) for both tables.

2. [ ] [IMP] Create Drizzle migration: add `instructional_content` and `assessment_content` tables. Migrate existing `examplesJson` from topics into `instructional_content` rows (flavor='classic', locale='en', presentation='individual', version=1). Migrate existing `problemsJson` from topics into `assessment_content` rows (same defaults). After migration verified, drop `problemsJson` and `examplesJson` columns from `topics` table.

3. [ ] [IMP] Update import pipeline: modify `tools/import-content.ts` to write to the new tables instead of topics JSON blobs. Import tool tags imported rows with default dimension values.

4. [ ] [IMP] Update API services: modify graph service, session service, and learn routes to read from `instructional_content` and `assessment_content` tables instead of parsing JSON from topics. Add dimension parameters to content queries: `getInstructionalContent(topicId, { flavor, locale, presentation })` with fallback chain (requested combo -> classic/en/individual). Session service selects assessment problems filtered by topicId + locale.

5. [ ] [IMP] Update shared types: split `Problem` and `WorkedExample` types to reflect the new model. Add `ContentDimensions` type. Update frontend components (ProblemView, WorkedExample) to work with the new data shape.

6. [ ] [TST] Verify: existing learning sessions work end-to-end after migration. Content loads from new tables. Fallback chain works. Import tool populates new tables correctly. No regressions.

**Validation:** Topics table contains only graph structure. All content lives in normalized tables with dimension columns. Existing platform functionality preserved.

---

## Phase 2: Teach Mode (Public Classroom Tool)
**Goal:** Zero-account, zero-setup teaching interface. Browse graph, step through worked examples, present problems, lead instruction. Works with existing classic content.

1. [ ] [IMP] Build `/teach` public route: topic browser showing the knowledge graph organized by grade and strand. No authentication required. Teacher selects a topic. UI optimized for projection (large text, high contrast, minimal chrome). Locale selector in sidebar.

2. [ ] [IMP] Build teaching presentation view: full-screen instructional content with step-by-step reveal (teacher clicks to advance). Teacher notes/hints visible only on their device. Problem display from assessment pool with show/hide answer toggle. "Next problem" draws from pool for variation.

3. [ ] [IMP] Build topic sequencing helper: suggest "Teach next" options based on prerequisite graph. Show prerequisite chain. Allow jumping to any topic.

4. [ ] [IMP] Build printable/exportable problem sets: export/print a clean problem set (with or without answers) from assessment pool for selected topic and locale.

5. [ ] [TST] Verify: /teach works without auth, presentation readable on projector, step-by-step reveal works, problem cycling from pool, export generates clean output.

**Validation:** A teacher can navigate to /teach, find a topic, and run a classroom lesson in under 2 minutes with zero setup.

---

## Phase 3: Account Model & Billing Restructure
**Goal:** Orgs = billing layer (family, school, tutoring). Account_links = visibility layer. Independent signups. Org per-student billing. Any account can learn + teach.

1. [ ] [RSH] Design the unified account model. (a) Org as billing-only: types (family, school, tutoring), roles (owner, admin, teacher, student), per-student budget (~$5/student), org billing priority over individual. (b) `account_links` table: id, fromUserId, toUserId, type ('parent'|'teacher'|'tutor'|'guardian'), permissions (JSON), status ('active'|'pending'|'revoked'), createdAt. Independent of org. (c) Teach data model: `teach_sessions` (log of what was covered), `assignments` (share code), `assignment_responses` (nullable userId for anonymous). (d) Any account can learn AND teach.

2. [ ] [IMP] Create `account_links` table and API routes. Link creation flows: parent creates child -> auto parent link; teacher shares code -> student accepts; student requests link via teacher's code. Migrate existing `managedBy` to account_links. Permission checks based on link type.

3. [ ] [IMP] Restructure org for flexible billing. Org types via metadata. Expanded roles: owner, admin, teacher, student. Org billing dashboard: total members, per-student budget, total spend. Billing priority: org > individual > free. OpenRouter key provisioning per-org with per-student limits.

4. [ ] [IMP] Independent student signup: no org required. Full free-tier access. Can self-bill ($5/mo or $50/yr). Can join org later. Can link to teachers/parents without joining their org. Universal content access.

5. [ ] [IMP] Add teach data model: `teach_sessions`, `assignments` (with shareCode), `assignment_responses`. Teacher dashboard: topics covered, suggestions for next, linked students' progress.

6. [ ] [TST] Verify: independent signup works. Account links create/list/revoke. Linked teacher reads student progress. Org billing priority. Multiple roles per org. Backward compat with existing families. Teach sessions logged. Assignments created with share codes.

**Validation:** Student with 1 parent + 5 teachers has correct visibility. School org with owner + teachers + students has correct billing. Independent student works with zero relationships.

---

## Phase 4: Anonymous Usage, Guest Sessions & Assignments
**Goal:** Public /learn and /teach with anonymous progress, assignment sharing via links, seamless merge on account creation.

1. [ ] [IMP] Anonymous learning sessions: public `/learn` allows unauthenticated learning. Generate `anonymousToken` (UUID) in localStorage. Progress tracked client-side. No paid features. Prompt to create account.

2. [ ] [IMP] Anonymous teach usage: /teach logs sessions via anonymousToken. Anonymous assignment creation: share code link, responses tagged with teacher's token.

3. [ ] [IMP] Assignment flow: teacher creates assignment (topics, problem count, type). Short share code / URL. Students complete without accounts. Teacher sees responses. Anonymous students prompted to create account.

4. [ ] [IMP] Account merge on signup: check localStorage for anonymousToken. Import teach_sessions, assignment_responses, initialize user_topic_state from guest progress. Clear token.

5. [ ] [IMP] Young-child simplified UI mode: optional mode for ages 2-5/6. Large touch targets, icon-based nav, TTS auto-read, STT for answers. UI toggle, not content gating.

6. [ ] [TST] Verify: anonymous learn/teach works. Assignments via share link work for anonymous students. Teacher sees anonymous responses. Merge preserves progress. Young-child mode navigable.

**Validation:** Visitor solving problems in 30 seconds with no account. Teacher shares homework link, 20 students complete without accounts. Guest creates account and progress transfers.

---

## Phase 5: App i18n (UI Strings)
**Goal:** Internationalize the application UI. Content translation is handled by the content pipeline (plan 012).

1. [ ] [IMP] Integrate `vue-i18n`: extract all UI strings to locale message files (en.json, es.json, ja.json, ar.json). Locale selector in nav/settings. Persist preference (user setting or localStorage). Auto-detect from browser `navigator.language`.

2. [ ] [IMP] RTL CSS support: Arabic locale layout mirrors correctly. Math notation stays LTR within RTL. Test key flows.

3. [ ] [IMP] Locale-aware LLM tutoring: inject locale into system prompts. LLM responds in student's language. TTS voice selection uses locale. STT passes language hint to Whisper.

4. [ ] [TST] Verify: UI fully translated in pilot languages. RTL layout correct. LLM responds in correct language. Locale persists across sessions.

**Validation:** Spanish-speaking user has fully localized UI, tutoring, and speech. Arabic layout RTL. App detects browser language on first visit.

---

## Phase 6: Connected Group Learning
**Goal:** Account-based group modes layered on Teach Mode — family co-learning, connected classroom, peer pairs.

1. [ ] [RSH] Design group session model: `group_sessions` linking facilitator to N students. Session types: Family Co-Learning, Connected Classroom. Topic selection for heterogeneous groups (frontier intersection or teacher override). Individual FSRS tracking within group.

2. [ ] [IMP] Family co-learning: parent starts session, selects children (from account_links). System suggests topics near frontier intersection. Each child gets assessment at their difficulty. Parent sees facilitator view with per-child progress.

3. [ ] [IMP] Connected classroom: extends Teach Mode with device sync. Teacher controls big-screen presentation. Students join via code (account or anonymous). Individual assessment at each student's level. Real-time class progress dashboard.

4. [ ] [IMP] Peer pair mode: two students alternate steps on multi-step problems. Self-explanation after each step. Both students' SRS state updates.

5. [ ] [TST] Verify: co-learning shows different difficulty per child. Classroom joins via code. Real-time sync works. FSRS tracking preserved. Peer pair turns alternate.

**Validation:** Parent with 3 kids at different levels runs co-learning. Teacher projects while 20 students practice on devices. Peer pair with turn-taking works.
