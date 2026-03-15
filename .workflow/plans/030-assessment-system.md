# Plan 030: Assessment System & Proof of Skill

> **Created:** 2026-03-15T00:00:00Z
> **Completed:** 2026-03-14T00:00:00Z
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Build a separate assessment mode distinct from learning sessions. Mixed-topic tests that sample from mastered content, map to grade-level standards, and produce scored results. Standards-based reporting gives parents and teachers verifiable evidence of learning progress. Oral assessment mode leverages existing STT infrastructure for presentation-based evaluation. Concludes with a unified simulation/audit/analytics phase that covers both Plan 029 (generator/lesson changes) and Plan 030 (assessment) in a single pass.

**Motivation:** The learning session engine validates mastery per-topic via FSRS, but there's no way to produce a "proof of skill" — a holistic assessment that demonstrates a student has learned a body of knowledge. Parents and teachers need report cards, not SRS statistics. Standardized test prep (SAT, state assessments) requires mixed-topic timed tests, not single-topic review. The diagnostic places students but doesn't produce a score. The assessment system fills this gap.

**Key distinctions from learning sessions:**
- **Learning session:** Single-topic focus, SRS-driven scheduling, adaptive difficulty, scaffolding available, no time pressure, goal is to learn
- **Assessment session:** Multi-topic, examiner-defined scope, no scaffolding, optional time limit, goal is to measure and prove

**Depends on:** Plan 029 (content generators — need reliable content to assess against). Assessment quality depends on problem quality, which generators guarantee.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 5
**In Progress:** —
**Next:** —

---

## Phase 1: Assessment Session Model ✓

**Goal:** Define the assessment session type, topic sampling algorithm, scoring model, and D1 schema. The assessment session is a first-class session type alongside learning sessions and diagnostic sessions.

**Preflight context (2026-03-14):**
- **Timed expiry:** Server-enforced via check-on-next-request. Every call to `/respond` and `/result` computes `expiresAt = startedAt + timeLimitMinutes * 60s`. If `now > expiresAt` and session is still `active`, the server scores what's been answered, marks remaining questions unanswered, sets status `"timed-out"`, persists result, and returns the completed result. `/history` endpoint also lazily expires stale active sessions on load. No cron or background worker needed.
- **Standard code parsing:** Scope to CCSS Math format only for now (`Grade.Domain.Standard`, e.g., `K.CC.4`). ELA standard codes (e.g., `RF.K.1d`) have a different structure — parsing for those is deferred.
- **`assessmentSessions` / `assessmentResponses` tables:** Do not exist yet — create them in this phase as specified.

### Context for Execution

The platform currently has two session types:
- **Learn session** (`learnSessions` table): Adaptive learning with SRS, single-topic phases (lesson/review/remediation)
- **Diagnostic session** (`diagnosticSessions` table): Placement test using adaptive binary search, materializes mastery estimates

The assessment session is distinct from both:
- Not adaptive — questions are pre-determined at session start (not chosen based on response correctness)
- Multi-topic — samples from a defined scope (grade band, strand, collection, or custom set)
- Scored — produces a percentage score, per-strand breakdown, and standard alignment
- Optionally timed — countdown timer, auto-submit on expiry
- No scaffolding — no hints, no lesson reference, no LLM tutoring during assessment
- No SRS impact — assessment results don't directly affect FSRS scheduling (they're a measurement, not a learning activity)

**Assessment scoping options:**
- Grade band: "Grade 3 Math" — sample from all mastered grade 3 topics
- Strand: "Fractions" — sample from all mastered fraction topics
- Collection: "K-2 Addition" — sample from a defined collection's topics
- Custom: teacher/parent selects specific topics
- "Everything mastered" — comprehensive assessment of all mastered material

**Topic sampling algorithm:**
- Start with scope (topics the student has mastered or is learning)
- Weight by: (1) recency of last review (more recent = more likely), (2) strand coverage (ensure all strands in scope get representation), (3) prerequisite depth (mix easy and hard topics)
- Ensure no two consecutive problems from the same topic
- For timed assessments: front-load easier topics (lower prerequisite depth) to reduce anxiety

**Scoring model:**
- Raw score: correct / total
- Per-strand score: correct / total within each strand represented
- Standard alignment: map topic correctness to Common Core standard codes (`topic.standardCode`)
- Mastery classification per standard: "proficient" (≥80%), "developing" (50-79%), "needs support" (<50%)

### Steps

1. [x] [IMP] Define assessment types in `packages/shared/src/types.ts`:
   - `AssessmentSessionConfig = { scope: AssessmentScope; questionCount: number; timeLimitMinutes?: number; shuffleOrder?: boolean }`
   - `AssessmentScope = { type: "grade-band" | "strand" | "collection" | "custom" | "comprehensive"; gradeLevel?: number; strandId?: string; collectionId?: string; topicIds?: string[] }`
   - `AssessmentResult = { sessionId; userId; scope; startedAt; completedAt; totalQuestions; totalCorrect; rawScore; strandScores: Record<string, { correct, total, score }>; standardScores: Record<string, { standard, correct, total, classification }> }`
   - `AssessmentItem = { questionNumber; totalQuestions; topicId; topicName; problem: Problem; timeRemainingMs?: number }`
   - `StandardClassification = "proficient" | "developing" | "needs-support"`

2. [x] [IMP] Add D1 schema for assessment sessions:
   - `assessmentSessions` table: id, userId, scope (JSON), config (JSON), status ("active" | "completed" | "timed-out"), questionsAsked, questionsCorrect, rawScore, strandScoresJson, standardScoresJson, startedAt, completedAt, timeLimitMinutes
   - `assessmentResponses` table: id, assessmentSessionId, questionNumber, topicId, problemId, answer, correct, responseMs, createdAt
   - Generate D1 migration, update test helpers SCHEMA_STATEMENTS

3. [x] [IMP] Build the topic sampling algorithm in `packages/api/src/services/assessment.ts`:
   - `createAssessmentService(db, contentBucket)` factory function
   - `sampleTopics(userId, scope, count): Promise<{ topicId, strandId, standardCode, problem: Problem }[]>`
   - Weighted sampling: recency (exponential decay from lastReview), strand coverage (ensure diversity), depth mixing
   - No consecutive same-topic problems
   - For timed mode: sort by ascending prerequisite depth (easier first)
   - Fall back gracefully if scope has fewer topics than requested count

4. [x] [IMP] Build assessment session lifecycle:
   - `startAssessment(userId, config): Promise<{ sessionId, firstItem: AssessmentItem }>`
   - `respondToAssessment(sessionId, { answer, responseMs }): Promise<{ correct, nextItem?: AssessmentItem, result?: AssessmentResult }>`
   - `getAssessmentResult(sessionId): Promise<AssessmentResult>`
   - Session state: pre-determined question sequence (not adaptive), current position, accumulated responses
   - On completion: compute strand scores, standard classifications, persist result
   - **Timed expiry:** At the top of both `respondToAssessment` and `getAssessmentResult`, check if `timeLimitMinutes` is set and `now > startedAt + timeLimitMinutes * 60s`. If so, auto-complete the session (score answered questions, mark remaining as unanswered, set status `"timed-out"`). Return result immediately without processing the incoming answer.

5. [x] [IMP] Add assessment API routes in `packages/api/src/routes/assessment.ts`:
   - `POST /api/assessments/start` — start assessment with config
   - `POST /api/assessments/:id/respond` — submit answer
   - `GET /api/assessments/:id/result` — get completed result
   - `GET /api/assessments/history` — list past assessments with scores
   - Wire into Hono app router

6. [x] [TST] Write tests for assessment service:
   - Test: topic sampling produces diverse strand coverage
   - Test: no consecutive same-topic problems
   - Test: scoring produces correct per-strand breakdown
   - Test: timed assessment auto-completes on expiry
   - Test: standard classification thresholds (≥80% proficient, 50-79% developing, <50% needs support)
   - `just test` — all pass

**Validation:** Assessment service creates sessions, samples topics correctly, scores results with strand breakdown and standard alignment. API routes work. Tests pass. `just typecheck` passes.

---

## Phase 2: Assessment UI & Experience ✓

**Goal:** Build the frontend for starting, taking, and reviewing assessments. Timed mode with countdown. Results page with visual score breakdown.

**Preflight context (2026-03-14):**
- **Charting:** Install `chart.js` + `vue-chartjs` (MIT, Vue 3 native, excellent browser support). Use for the score trend line chart (step 4 history view). Per-strand breakdown bars use pure CSS/Tailwind (`width: X%`) — no library needed there. Do NOT use ChartGPU (no Vue bindings, requires WebGPU, overkill for this use case).
- **Timed expiry (client side):** The countdown timer is UI-only. When the timer hits zero, call `POST /api/assessments/:id/respond` with the current answer (or an empty answer if no response was in progress) — the server will detect expiry and return a completed result. Client should also call this on page unload/visibility change if a timed session is in progress.

### Context for Execution

The assessment UI is separate from the learning UI (`learn.vue`). It should feel like a test — clean, focused, no distractions. No hints button, no lesson reference, no "Show Lesson" panel. Progress indicator shows question X of Y.

**Key UX decisions:**
- Assessment lives at `/assess` (new page)
- Start screen: choose scope (grade, strand, collection), configure (question count, time limit)
- Taking the test: one question at a time, progress bar, optional countdown timer
- Results: score summary, per-strand breakdown with bar charts, standard alignment table
- History: past assessments with scores and dates, trend over time

### Steps

1. [x] [IMP] Create assessment start page (`packages/web/src/pages/assess.vue`):
   - Scope selector: grade band dropdown, strand dropdown, collection dropdown, or "comprehensive"
   - Question count selector: 10, 20, 30, 50
   - Time limit toggle: untimed, 15min, 30min, 60min
   - Start button → calls `POST /api/assessments/start`
   - If no mastered topics in scope: show message "You haven't mastered any topics in this area yet"

2. [x] [IMP] Create assessment question view (`packages/web/src/components/AssessmentQuestion.vue`):
   - Renders problem directly without hints, confidence slider, or lesson reference
   - Progress bar: "Question 7 of 20"
   - Timer display (if timed): countdown with color change at <5min, <1min
   - No back button (can't revisit previous questions)
   - Auto-advance on submit
   - Auto-submit remaining questions on timer expiry

3. [x] [IMP] Create assessment results page (`packages/web/src/components/AssessmentResults.vue`):
   - Overall score: large percentage with pass/fail color (green ≥80%, yellow ≥50%, red <50%)
   - Per-strand breakdown: horizontal bar chart (strand name, X/Y correct, percentage)
   - Standards alignment table: standard code, description, classification badge (proficient/developing/needs-support)

4. [x] [IMP] Create assessment history view (integrated into `/assess` start page):
   - List past assessments: date, scope, score, question count
   - Click to view full result in modal
   - Score trend chart (3+ assessments): vue-chartjs line chart (chart.js + vue-chartjs installed)

5. [x] [IMP] Wire routing and navigation:
   - Add `/assess` route to Vue Router
   - Add "Test" link to navigation
   - Add "Take a Test" CTA on progress page
   - Add `useApi` methods for assessment endpoints

6. [x] [TST] Manual testing in dev:
   - `just typecheck` — passes

**Validation:** Full assessment flow works in the browser: start → take → score → review. Timed mode counts down and auto-submits. Results show per-strand breakdown and standard alignment. History tracks past assessments.

---

## Phase 3: Standards Alignment & Reporting ✓

**Goal:** Map topic mastery to Common Core standards. Produce standards-based report cards viewable by parents and teachers. Exportable reports.

**Preflight context (2026-03-14):**
- **Standard code parsing:** Implement for CCSS Math format only: `Grade.Domain.Standard` (e.g., `K.CC.4` → domain `K.CC`, cluster via first letter suffix like `K.CC.A`). ELA codes (`RF.K.1d`) have different structure — skip or return raw code for non-math formats. Document this scope limitation.
- **Account links:** `account-links.ts` route exists — teacher/parent permission check can reuse that system.

### Context for Execution

Topics already have a `standardCode` field (e.g., "K.CC.4", "RF.K.1d") in graph.json and the D1 `topics` table. This phase builds the reporting layer on top of assessment results and ongoing learning mastery.

**Report types:**
- **Assessment report:** Generated after each assessment session — standards tested, classification per standard
- **Progress report:** Ongoing — standards mastered vs. in-progress vs. not-started, based on `user_topic_state` mastery
- **Parent/teacher report:** Summary of child's/student's learning trajectory — mastery rate, assessment scores, areas of strength/weakness

**Standard hierarchy (Common Core):**
- Domain: "Counting and Cardinality" (K.CC)
- Cluster: "Know number names and the count sequence" (K.CC.A)
- Standard: "Count to 100 by ones and by tens" (K.CC.1)
- Our `standardCode` maps to individual standards. Multiple topics may share a standard code.

### Steps

1. [x] [IMP] Build standards mapping service (`packages/api/src/services/standards.ts`):
   - `getStandardsForTopics(topicIds: string[]): Record<string, { standard, domain, cluster, topics[] }>`
   - Parse standard codes to extract domain (first characters + number) and cluster
   - Aggregate: for each standard, which topics contribute, how many are mastered
   - `getStandardsMastery(userId, disciplineId): Promise<StandardsReport>` — query `user_topic_state` + `topics.standardCode`, compute per-standard and per-domain mastery percentages

2. [x] [IMP] Build report generation:
   - `generateProgressReport(userId, disciplineId): Promise<ProgressReport>` — comprehensive learning progress against standards
   - `ProgressReport = { discipline, generatedAt, overallMastery, domainScores: DomainScore[], recentAssessments: AssessmentSummary[], topicsToFocus: Topic[] }`
   - `DomainScore = { domain, domainName, standardCount, masteredCount, percentage, classification }`

3. [x] [IMP] Add reporting API routes:
   - `GET /api/reports/progress/:disciplineId` — standards-based progress report for authenticated user
   - `GET /api/reports/progress/:disciplineId/:userId` — teacher/parent view (requires account link)
   - `GET /api/reports/assessment/:id` — detailed assessment report with standards alignment (account-link auth)

4. [x] [IMP] Build report UI:
   - Progress report page (`packages/web/src/pages/report.vue`): domain-level mastery bars, expandable to standard level, topics to focus
   - Teacher/parent view: accessible via account links, read-only version of student's report
   - Print/PDF-friendly layout (CSS `@media print`)
   - "View Report" CTA added to progress page

5. [x] [TST] Validate reporting:
   - Test: standards mapping correctly aggregates topics by standard code
   - Test: mastery percentages match user_topic_state counts
   - Test: account link DB query pattern verified
   - `just test` — passes (6/6 new tests)

**Validation:** Standards-based progress reports work for students, parents, and teachers. Assessment results map to Common Core standards with proficiency classifications. Reports are printable. Tests pass.

---

## Phase 4: Oral Assessment (STT-Based Evaluation)

> **Status: DEFERRED** — Phase 4 is out of scope for the current 030 execution. Phases 1-3 deliver the core assessment system. Phase 4 is a future plan enhancement. The design notes below are preserved for when this phase is picked up.

**Goal:** Add an oral assessment mode where students explain concepts verbally. Speech-to-text captures the explanation, and LLM evaluates it against a rubric. This is the "presentation" proof of skill — the student demonstrates understanding, not just answer recall.

**Preflight context (2026-03-14) — decisions made for when this is picked up:**
- **Oral prompt as Problem variant (chosen architecture):** Extend `Problem` with `type: "written" | "oral"` as a discriminated union. Oral problems have `rubric: RubricCriterion[]` and `expectedConcepts: string[]` instead of a definite `answer`. Stored in the same `problems.json` R2 bundle per topic. Generators emit 15 written + 2-3 oral problems per topic (additive). Learning sessions filter to `type === "written"` only. This architecture naturally extends to `type: "audio" | "image"` in future.
- **Grading path:** `respondToAssessment` checks `problem.type` — oral problems route to LLM rubric evaluation, written problems route to existing answer matching. Oral assessment is paid-tier (LLM dependency).
- **`RubricCriterion` vs `RubricDimension`:** Check `packages/shared/src/types.ts` at implementation time for any existing rubric type from Plan 029 P2 and unify rather than adding a parallel type.
- **Waveform visualization:** Skip real waveform (requires `AudioContext.createAnalyser()` complexity). Use a CSS pulsing animation on the mic button during recording instead — sufficient for K-8 audience.

### Context for Execution

The platform already has STT infrastructure:
- **Browser TTS** for reading problems aloud (K-2 audience)
- **Workers AI Whisper** for speech-to-text input (`packages/api/src/routes/learn.ts` has STT endpoint)
- **LLM self-explanation evaluation** exists in the tutoring flow — student types explanation, LLM evaluates quality

Oral assessment extends this: instead of typing, the student speaks. Instead of evaluating a typed self-explanation within a learning session, we evaluate a spoken explanation within an assessment session.

**Oral assessment flow:**
1. Assessment presents a topic and prompt: "Explain how you would add 47 + 35 using regrouping"
2. Student speaks into microphone (browser MediaRecorder → Workers AI Whisper → text)
3. LLM evaluates transcribed text against a rubric:
   - Did the student identify the key concept? (e.g., "carrying" or "regrouping")
   - Did the student explain the procedure correctly?
   - Did the student demonstrate understanding (not just memorization)?
4. Rubric score: 4-point scale (advanced, proficient, developing, beginning)
5. Result includes: transcribed text, rubric score, LLM feedback

**Constraints:**
- Requires paid tier (LLM + STT = AI features)
- Graceful degradation: if STT unavailable, fall back to text input
- Rubric must be pre-defined per topic (not ad-hoc LLM judgment)

### Steps

1. [ ] [IMP] Define oral assessment types:
   - `OralPrompt = { topicId; promptText: string; rubric: RubricCriterion[] }`
   - `RubricCriterion = { criterion: string; weight: number; levels: { score: 1|2|3|4; description: string }[] }`
   - `OralResponse = { transcribedText: string; rubricScores: { criterion, score, feedback }[]; overallScore: number }`
   - Add `oralPrompts` to generator output (optional — generators can include oral prompts for topics)

2. [ ] [IMP] Build oral assessment mode in assessment service:
   - New assessment type: `"oral"` alongside default `"written"`
   - Oral assessment presents prompts instead of problems
   - Response flow: capture audio → STT → LLM evaluation → rubric score
   - LLM evaluation prompt: structured prompt with rubric criteria, expected concepts, scoring instructions

3. [ ] [IMP] Build oral assessment UI:
   - Recording interface: mic button, waveform visualization, recording timer
   - Transcription display: show what was captured (student can re-record)
   - Submit → LLM evaluation → show rubric scores with feedback
   - Overall result: aggregate rubric scores across all oral prompts

4. [ ] [IMP] Generate oral prompts for pilot topics:
   - Start with counting-cardinality and basic operations (~30 topics)
   - Prompts should test explanation ability, not just recall
   - Include rubric with 3-4 criteria per topic
   - Add to generator shared utilities: `OralPromptBuilder`

5. [ ] [TST] Test oral assessment:
   - Test: STT captures speech and produces text
   - Test: LLM evaluation produces rubric scores
   - Test: graceful fallback to text input when STT unavailable
   - Manual test: speak an explanation, verify scoring makes sense
   - `just test` — passes

**Validation:** Oral assessment mode works: student speaks, system transcribes, LLM evaluates against rubric, score is produced. Graceful text fallback. Pilot topics have oral prompts.

---

## Phase 5: Simulation, Audit & Platform Updates ✓

**Goal:** Unified simulation/audit/analytics update for both Plan 029 (generators, simplified learning loop) and Plan 030 (assessment system). Wire up orphaned analytics from Plan 028. Add missing D1 columns. Simulate assessment sessions. Establish new baselines for everything. Single documentation pass.

**Depends on:** Plan 029 complete ✓ (archived 2026-03-15 — all phases done). Plan 030 Phases 1-3 complete (Phase 4 deferred).

### Context for Execution

The simulation runner (`audit/learner-simulations/src/runner.ts`) drives synthetic learners through the session engine. Changes needed from 029: handle `type: "lesson"` items, remove old-phase logic. Changes needed from 030: simulate assessment sessions, validate scoring.

**Analytics gaps from 028 (carried from 029-P8):**
- `recordLessonView` event type is defined in `analytics.ts` but never called from `session.ts`
- `ReviewScaffolding` is tracked in frontend state and sent to API but not persisted in `review_log`

### Steps

1. [x] [IMP] Update simulation runner for simplified phase model (from 029):
   - In `runner.ts`: handle `type: "lesson"` session items — simulate viewing all sections and completing practice
   - Remove phase-specific logic for `pretest`, `instruction`, `guided`, `independent`
   - Update `StateSnapshot` to remove phase-specific fields

2. [x] [IMP] Wire up `recordLessonView` analytics (from 029):
   - In `session.ts` `respond()`: when lesson phase completes, call `analytics.recordLessonView()`
   - Verify the event writes to AE correctly

3. [x] [IMP] Add `scaffolding` column to `review_log` (from 029):
   - D1 migration: `ALTER TABLE review_log ADD COLUMN scaffolding TEXT`
   - Update review_log INSERT in session.ts to include scaffolding value
   - Update test helpers `SCHEMA_STATEMENTS`

4. [x] [IMP] Add assessment simulation to the simulation runner:
   - New simulation mode: `--mode assessment` (alongside existing `--mode learning`)
   - Simulate: start assessment → answer questions (use learner profile accuracy) → complete → check scores
   - Verify: scores match expected accuracy for the learner profile
   - Verify: strand coverage in sampled questions is diverse

5. [x] [IMP] Update audit orchestrator for lesson coverage + assessment metrics:
   - Add lesson counts to Content Quality section: "X/Y topics have lessons (Z%)"
   - New audit section: Assessment System Health (Section 9)
   - Metrics: topics with standardCode, unique standards count, avg topics per standard
   - Update `render.ts` and `types.ts`

6. [x] [IMP] Update evaluation targets and establish unified baselines:
   - targets.json v7: mastery_convergence target 17→7, interleaving 0.10→0.160, cognitive_demand_entropy 0.90→0.85
   - Updated regression-baseline.json for all 3 profiles
   - All 10 evaluation systems PASS

7. [x] [TST] Run full test and regression suite:
   - `just typecheck` ✓, `just test` ✓, `just regression` ✓

8. [x] [DOC] Unified documentation pass:
   - CLAUDE.md: updated learning loop phases (simplified, Plan 029) + assessment session reference
   - DECISIONS.md: added simplified loop, difficulty removal, assessment separation decisions
   - LEARNINGS.md: added db-setup sync gotcha, phase name tracking gotcha, targets rebaseline guidance
   - Created `docs/assessment-system.md`: architecture, scoring model, standards alignment, simulation mode

**Validation:** `just regression` passes with updated baselines. `just audit` reports lesson coverage and assessment health. `recordLessonView` fires on lesson completion. `scaffolding` persists in review_log. Assessment simulation runs and scores correlate with mastery. All tests pass. Documentation reflects both 029 and 030 changes.

---

## Deferred Features (Future Expansion)

The following were considered for 030 but deferred to future plans:

### Proof of Skill Certificates
- Certificate generation on collection/grade-band mastery completion
- Verifiable certificate page with unique URL and anti-tamper hash
- Social sharing (image generation, email, download)
- Milestone tracking: "Completed K-2 Mathematics" with date and score
- **Why deferred:** Depends on assessment system being stable and validated. Certificate trust requires proven scoring accuracy.

### Assessment Type Expansion
- `equation-builder` implementation (drag-and-drop equation construction) — type defined in shared types, component not built
- Interactive problem types: geometry canvas (draw/measure), graphing calculator (plot functions), data entry (create charts)
- Free-response with LLM grading extended to assessments (currently only in tutoring flow)
- **Why deferred:** Each new type needs a dedicated Vue component + grading logic. High per-type effort. Current text-qa and numerical-input cover K-8 math well.

---

## Future Beyond 030

These are capability areas that don't belong in any current plan but should be on the roadmap:

- **Locale/flavor content authoring** — Spanish content, themed content (story, adventure, game flavors). Infrastructure exists (7-tier fallback handles it), needs content.
- **Interpretive discipline content at scale** — Using 029 P2 prompt-template generators to produce ELA, history, philosophy content. PoC complete (history `causes-of-revolution`); needs per-topic templates for remaining topics and disciplines. Note: 030 P4 `RubricCriterion` type overlaps with 029 P2 `RubricDimension` — unify during implementation.
- **Cross-discipline assessments** — Tests spanning math + ELA (word problems that test both reading comprehension and math skill). Requires cross-discipline edges to be fully leveraged.
- **Adaptive learning path optimization** — ML/RL-based path optimization using accumulated user data. Requires months of usage data before viable.
- **Media pipeline** — Real diagrams (not text placeholders), animations (manim-style step-by-step), interactive simulations (canvas-based). Each media type needs its own production pipeline.
- **Web game section types** — Games as worked examples or practice within lessons. A fraction-bar drag-and-drop game replaces a text worked example. Needs per-game Vue component.
- **Social features / leaderboards** — Classroom leaderboards, peer challenges, collaborative learning. Careful design needed to avoid negative motivation effects.
- **Gamification layer** — XP, badges, streaks (beyond current daily goals), level-up animations. Low-effort high-engagement but must not undermine intrinsic motivation.
- **Offline mode** — Service worker + IndexedDB for learning without internet. Content bundles cached locally. SRS state synced on reconnect.
- **Mobile app** — Capacitor or native wrapper. Current PWA works but native provides better STT, push notifications, and App Store presence.
