# Plan: Content Personalization, Access & Group Learning

> **Created:** 2026-03-05T18:32:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Restructure the content model to separate the knowledge graph (source of truth) from instructional and assessment content. Add diverse question types and visual aids. Restructure the account model so orgs are a billing layer, account_links are a visibility layer, and any account can learn + teach. Add Teach Mode for zero-account classroom use, anonymous/guest access with diagnostic and onboarding, app-level i18n, and connected group learning.

Content generation pipeline, content matrix visualization, and admin tooling are in **plan 012** (Admin, Content Matrix & Pipeline). Engagement and habit features are in **plan 013** (Engagement & Habits).

**Research basis:** docs/learning-science.md, PhysicsGraph analysis (see [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md) for full context), SPEC.md.

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
|     Contains: title, lesson steps (worked examples), asset refs (videos, visuals)
|     Matrix: topic x flavor x locale x presentation x version
|
+-- ASSESSMENT CONTENT (new table, FK -> topics.id)
      Each row = one problem in the pool
      Columns: topicId, flavor, locale, presentation, version, difficulty, type
      Contains: question, answer, hints, solution, type-specific properties
      Question types: text-qa, numerical-input, multi-step, matching, multi-select
      DEFAULT: classic flavor + en locale only, locale translations later
      Large varied pool per topic (target 15-30+ problems)
```

**Instructional content** gets the full matrix treatment. Versions represent refinement over time (v1 -> v2), not variation for review.

**Assessment content** stays classic + locale-only for now. Real-world tests aren't themed. Variation comes from pool size and diverse question types. Schema supports future flavored assessment.

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

**Completed:** Phase 1 ✓
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: Content Model Restructure & Schema Migration ✓
**Goal:** Separate the knowledge graph from content. Create normalized `instructional_content` and `assessment_content` tables with dimension columns and question type support. Migrate existing inline JSON blobs. No content generation.

1. [x] [RSH] Design the normalized content schema. `instructional_content` table: `id`, `topicId` (FK -> topics.id), `flavor` (text, default 'classic'), `locale` (text, default 'en'), `presentation` (text, default 'individual'), `version` (integer, default 1), `title` (text), `stepsJson` (text — array of WorkedExampleStep), `assetsJson` (text — optional: video refs, SVG visual parameters, activity configs), `createdAt`, `updatedAt`. `assessment_content` table: `id`, `topicId` (FK -> topics.id), `flavor` (text, default 'classic'), `locale` (text, default 'en'), `presentation` (text, default 'individual'), `version` (integer, default 1), `type` (text, default 'text-qa' — also: 'numerical-input', 'multi-step', 'matching', 'multi-select', 'equation-builder'), `difficulty` (text), `question` (text), `answer` (text), `hintsJson` (text), `solution` (text), `typeProperties` (text — JSON for type-specific data: sub-steps for multi-step, match pairs for matching, options for multi-select), `createdAt`. Define indexes: composite on (topicId, flavor, locale, presentation, version) for both tables. Define visual asset JSON schema for `assetsJson`: visual types (number-line, base-ten-blocks, fraction-bar, array-grid, place-value-chart) with parameters.

2. [x] [IMP] Create Drizzle migration: add `instructional_content` and `assessment_content` tables. Migrate existing `examplesJson` from topics into `instructional_content` rows (flavor='classic', locale='en', presentation='individual', version=1). Migrate existing `problemsJson` from topics into `assessment_content` rows (same defaults, type='text-qa'). Drop `problemsJson` and `examplesJson` from `topics` table after migration.

3. [x] [IMP] Update import pipeline: modify `tools/import-content.ts` to write to the new tables. Import tool tags rows with default dimension values and type='text-qa'.

4. [x] [IMP] Update API services: modify graph service, session service, and learn routes to read from new tables. Add dimension parameters to queries with fallback chain (requested -> classic/en/individual). Session service selects assessment problems filtered by topicId + locale.

5. [x] [IMP] Update shared types: add `ContentDimensions`, `AssessmentType`, `VisualAsset` types. Update `Problem` type with `type` and `typeProperties` fields. Update frontend components for new data shape.

6. [x] [TST] Verify: existing learning sessions work end-to-end after migration. Content loads from new tables. Fallback chain works. Import populates correctly. No regressions.

**Validation:** Topics table = graph only. All content in normalized tables with dimension + type columns. Existing functionality preserved.

---

## Phase 2: Diverse Question Types
**Goal:** Move beyond text Q&A to numerical input, multi-step, and matching — improving retrieval practice depth (short-answer g=0.70 vs MC g=0.48). Research context: [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md), Question Type Diversity section.

1. [ ] [IMP] Build question type Vue components: `NumericalInput` (type the answer, no options — forces retrieval), `MultiStep` (chain of dependent sub-problems with per-step feedback), `Matching` (connect items from two columns via drag or tap), `MultiSelect` (check all correct answers). Each component handles input, validation, and display. Integrate into ProblemView with dynamic component selection based on `assessment_content.type`.

2. [ ] [IMP] Update grading logic in learn/review routes: numerical-input exact match with configurable tolerance, multi-step partial credit (per-step scoring), matching set equality, multi-select scoring (partial credit for subset). Update LLM grading to handle multi-step explanations.

3. [ ] [IMP] Add guessability considerations: numerical input inherently prevents guessing (g=0.70 vs MC g=0.48). For any remaining MC-style questions, ensure distractors are plausible. Type selection in session service prefers numerical-input and multi-step over text-qa when available.

4. [ ] [TST] Verify: each question type renders correctly, grading works for all types, existing text-qa problems still work (backward compat), diverse types appear in learning sessions, Teach Mode presentation view handles all types.

**Validation:** Students see diverse question types. Numerical input requires typing. Multi-step shows sequential sub-problems. All types grade correctly. Existing content unaffected.

---

## Phase 3: Visual Aids
**Goal:** SVG-based visual representations in instructional content and assessment — dual coding theory shows verbal + visual distributes cognitive load across working memory subsystems. Research context: [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md), Animations and Visualizations section.

1. [ ] [RSH] Identify highest-impact visual types for K-5 math: number lines (counting, addition, subtraction), base-ten block arrays (place value), fraction bars/circles (fractions), array grids (multiplication), place value charts, bar models (word problems). Map each visual type to the topics where it's most impactful.

2. [ ] [IMP] Build reusable Vue SVG components: `NumberLine` (configurable range, tick marks, jump arcs), `BaseTenBlocks` (ones/tens/hundreds with grouping), `FractionBar` (divided bar with shaded portions), `ArrayGrid` (rows x columns for multiplication). Each renders from JSON parameters stored in `assetsJson`.

3. [ ] [IMP] Integrate visuals into ProblemView and WorkedExample components: render visual aids alongside text when present in `assetsJson`. Support visuals in all learning loop phases and in Teach Mode presentation view. Responsive across screen sizes.

4. [ ] [IMP] Add visual parameters to pilot content: manually add `assetsJson` visual configs to 10-15 topics where visuals are most impactful (counting, place value, fractions, multiplication). This is manual data entry, not pipeline generation.

5. [ ] [TST] Verify: visual components render across screen sizes. Visuals appear in sessions for topics that have them. Topics without visuals still work. Teach Mode displays visuals on projector. Accessibility: screen reader alt text.

**Validation:** Students see number lines, arrays, and fraction bars alongside relevant problems. Visuals responsive on mobile and desktop. Teach Mode projector view includes visuals.

---

## Phase 4: Teach Mode (Public Classroom Tool)
**Goal:** Zero-account, zero-setup teaching interface. Browse graph, step through worked examples with visuals, present diverse question types. Works with existing classic content.

1. [ ] [IMP] Build `/teach` public route: topic browser showing the knowledge graph organized by grade and strand. No authentication required. Teacher selects a topic. UI optimized for projection (large text, high contrast, minimal chrome). Locale selector in sidebar.

2. [ ] [IMP] Build teaching presentation view: full-screen instructional content with step-by-step reveal (teacher clicks to advance). Visual aids render inline. Teacher notes/hints visible only on their device. Problem display from assessment pool with show/hide answer toggle — supports all question types (numerical input, multi-step, matching). "Next problem" draws from pool for variation.

3. [ ] [IMP] Build topic sequencing helper: suggest "Teach next" options based on prerequisite graph. Show prerequisite chain. Allow jumping to any topic.

4. [ ] [IMP] Build printable/exportable problem sets: export/print a clean problem set (with or without answers) from assessment pool for selected topic and locale.

5. [ ] [TST] Verify: /teach works without auth, presentation readable on projector, step-by-step reveal works, all question types display, visuals render, export generates clean output.

**Validation:** A teacher can navigate to /teach, find a topic, and run a classroom lesson with visuals and diverse problem types in under 2 minutes.

---

## Phase 5: Account Model & Billing Restructure
**Goal:** Orgs = billing layer (family, school, tutoring). Account_links = visibility layer. Independent signups. Org per-student billing. Any account can learn + teach.

1. [ ] [RSH] Design the unified account model. (a) Org as billing-only: types (family, school, tutoring), roles (owner, admin, teacher, student), per-student budget (~$5/student), org billing priority over individual. (b) `account_links` table: id, fromUserId, toUserId, type ('parent'|'teacher'|'tutor'|'guardian'), permissions (JSON), status ('active'|'pending'|'revoked'), createdAt. Independent of org. (c) Teach data model: `teach_sessions` (log of what was covered), `assignments` (share code), `assignment_responses` (nullable userId for anonymous). (d) Any account can learn AND teach.

2. [ ] [IMP] Create `account_links` table and API routes. Link creation flows: parent creates child -> auto parent link; teacher shares code -> student accepts; student requests link via teacher's code. Migrate existing `managedBy` to account_links. Permission checks based on link type.

3. [ ] [IMP] Restructure org for flexible billing. Org types via metadata. Expanded roles: owner, admin, teacher, student. Org billing dashboard: total members, per-student budget, total spend. Billing priority: org > individual > free. OpenRouter key provisioning per-org with per-student limits.

4. [ ] [IMP] Independent student signup: no org required. Full free-tier access. Can self-bill ($5/mo or $50/yr). Can join org later. Can link to teachers/parents without joining their org. Universal content access.

5. [ ] [IMP] Add teach data model: `teach_sessions`, `assignments` (with shareCode), `assignment_responses`. Teacher dashboard: topics covered, suggestions for next, linked students' progress.

6. [ ] [TST] Verify: independent signup works. Account links create/list/revoke. Linked teacher reads student progress. Org billing priority. Multiple roles per org. Backward compat with existing families. Teach sessions logged. Assignments with share codes.

**Validation:** Student with 1 parent + 5 teachers has correct visibility. School org with owner + teachers + students has correct billing. Independent student works with zero relationships.

---

## Phase 6: Anonymous Usage, Diagnostic & Onboarding
**Goal:** Public /learn and /teach with anonymous progress, course-level diagnostic for placement, guided onboarding, and assignment sharing. Research context: [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md), Diagnostic Test and Growth & Marketing sections.

1. [ ] [IMP] Anonymous learning sessions: public `/learn` allows unauthenticated learning. Generate `anonymousToken` (UUID) in localStorage. Progress tracked client-side. No paid features. Prompt to create account.

2. [ ] [IMP] Anonymous teach usage: /teach logs sessions via anonymousToken. Anonymous assignment creation: share code link, responses tagged with teacher's token.

3. [ ] [IMP] Course-level diagnostic: `POST /api/learn/diagnostic/start`, `POST /api/learn/diagnostic/respond` (adaptive), `GET /api/learn/diagnostic/result`. Graph compression selects ~20-30 covering questions. Correct answer credits prerequisites; incorrect penalizes dependents. Works for both authenticated and anonymous users. Anonymous users see estimated frontier and signup prompt.

4. [ ] [IMP] Public diagnostic taste: unauthenticated users take 5-10 diagnostic questions on landing page or `/try`. Shows estimated knowledge level and what they'd learn next. Prompts signup to continue with full diagnostic. PhysicsGraph's key insight: let people experience the product before asking for signup/payment.

5. [ ] [IMP] Guided onboarding: after first signup, 3-step introduction — (1) explain knowledge graph and how learning works, (2) run full diagnostic, (3) start first learning session. Track onboarding completion. Welcome email sequence: day 0 (how to start), day 2 (why daily practice), day 7 (progress summary). Simple email queue via D1 + scheduled Worker.

6. [ ] [IMP] Assignment flow + account merge: teacher creates assignment with share code. Students complete without accounts. Account merge on signup imports anonymousToken data (teach_sessions, assignment_responses, diagnostic results, progress estimates).

7. [ ] [IMP] Young-child simplified UI mode: optional mode for ages 2-5/6. Large touch targets, icon-based nav, TTS auto-read, STT for answers. UI toggle, not content gating.

8. [ ] [TST] Verify: anonymous learn/teach works. Diagnostic converges in 20-30 questions. Public taste works without auth. Onboarding completes end-to-end. Assignments via share link work for anonymous students. Merge preserves all progress. Young-child mode navigable.

**Validation:** Visitor experiences diagnostic and solves problems in 30 seconds with no account. Student with partial knowledge is placed correctly at frontier. Teacher shares homework link, students complete without accounts. Guest creates account and all progress transfers.

---

## Phase 7: App i18n (UI Strings)
**Goal:** Internationalize the application UI. Content translation handled by the content pipeline (plan 012).

1. [ ] [IMP] Integrate `vue-i18n`: extract all UI strings to locale message files (en.json, es.json, ja.json, ar.json). Locale selector in nav/settings. Persist preference (user setting or localStorage). Auto-detect from browser `navigator.language`.

2. [ ] [IMP] RTL CSS support: Arabic locale layout mirrors correctly. Math notation stays LTR within RTL. Test key flows.

3. [ ] [IMP] Locale-aware LLM tutoring: inject locale into system prompts. LLM responds in student's language. TTS voice selection uses locale. STT passes language hint to Whisper.

4. [ ] [TST] Verify: UI fully translated in pilot languages. RTL layout correct. LLM responds in correct language. Locale persists across sessions.

**Validation:** Spanish-speaking user has fully localized UI, tutoring, and speech. Arabic layout RTL. App detects browser language on first visit.

---

## Phase 8: Connected Group Learning
**Goal:** Account-based group modes layered on Teach Mode — family co-learning, connected classroom, peer pairs.

1. [ ] [RSH] Design group session model: `group_sessions` linking facilitator to N students. Session types: Family Co-Learning, Connected Classroom. Topic selection for heterogeneous groups (frontier intersection or teacher override). Individual FSRS tracking within group.

2. [ ] [IMP] Family co-learning: parent starts session, selects children (from account_links). System suggests topics near frontier intersection. Each child gets assessment at their difficulty. Parent sees facilitator view with per-child progress.

3. [ ] [IMP] Connected classroom: extends Teach Mode with device sync. Teacher controls big-screen presentation. Students join via code (account or anonymous). Individual assessment at each student's level. Real-time class progress dashboard.

4. [ ] [IMP] Peer pair mode: two students alternate steps on multi-step problems. Self-explanation after each step. Both students' SRS state updates.

5. [ ] [TST] Verify: co-learning shows different difficulty per child. Classroom joins via code. Real-time sync works. FSRS tracking preserved. Peer pair turns alternate.

**Validation:** Parent with 3 kids at different levels runs co-learning. Teacher projects while 20 students practice on devices. Peer pair with turn-taking works.
