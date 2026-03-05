# Epic: PhysicsGraph Learnings — Applied Platform Improvements

> **Created:** 2026-03-05T06:36:31Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Apply lessons from PhysicsGraph's 7-month build-and-grow journey to our platform. PhysicsGraph (founded by Jeffrey Biles) builds a knowledge graph + spaced repetition system for AP Physics — similar architecture to ours and Math Academy. Their monthly progress updates reveal practical insights about question diversity, content iteration, visual aids, diagnostics, engagement, tooling, and onboarding that directly apply to our K-5 math platform. Each phase is a standalone improvement informed by research and validated by real-world experience.

**Research basis:** docs/learning-science.md, PhysicsGraph analysis in RESEARCH.md.

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Diverse Question Types
**Goal:** Move beyond text question/answer to numerical input, multi-step, and matching — improving retrieval practice depth (short-answer g=0.70 vs MC g=0.48)

1. [ ] [RSH] Design question type schema: define types (numerical-input, multi-step, matching, multi-select, equation-builder) with JSON structures for each. Extend the existing `problemsJson` format to support a `type` field with type-specific properties. Maintain backward compatibility with existing text Q&A problems.
2. [ ] [IMP] Build question type components: `NumericalInput` (type the answer, no options), `MultiStep` (chain of dependent sub-problems with per-step feedback), `Matching` (connect items from two columns), `MultiSelect` (check all correct answers). Each component handles input, validation, and display.
3. [ ] [IMP] Update grading logic in the learn/review routes: support grading each question type (exact numeric match with tolerance, multi-step partial credit, matching set equality, multi-select scoring). Update LLM grading to handle multi-step explanations.
4. [ ] [IMP] Update content pipeline: modify `tools/generate-content.ts` to generate diverse question types per topic. Update `tools/validate-content.ts` to validate new schemas. Generate sample problems in new formats for 5-10 topics as a pilot.
5. [ ] [TST] Verify: each question type renders correctly, grading works for all types, existing text Q&A problems still work (backward compat), new question types appear in learning sessions.

**Validation:** Students see diverse question types in sessions. Numerical input requires typing answers. Multi-step shows sequential sub-problems. All types grade correctly.

---

## Phase 2: Content Quality Analytics
**Goal:** Surface per-topic and per-problem accuracy data so content can be iterated based on real student performance — the most impactful lesson from PhysicsGraph's curriculum rewrite

1. [ ] [IMP] Add content effectiveness endpoint to admin routes: per-topic first-attempt accuracy, per-topic hint usage rate, per-topic average response time, per-problem accuracy breakdown. Flag topics with <80% accuracy or >2 hints/attempt average. Query from existing `review_log` data.
2. [ ] [IMP] Build content analytics admin page: sortable table of topics with accuracy, hint usage, response time, and difficulty indicators. Color-code by health (green >85%, yellow 80-85%, red <80%). Click-through to per-problem breakdown showing which specific problems are causing struggles.
3. [ ] [IMP] Add difficulty spike detection: identify adjacent topics in the knowledge graph where accuracy drops significantly (>15% drop from prerequisite to dependent topic). Surface these as "difficulty spikes" in the admin dashboard — these indicate either content issues or missing intermediate topics.
4. [ ] [TST] Verify: analytics load correctly from real review_log data, topics are flagged appropriately, difficulty spikes are detected in the graph, admin page is responsive and sortable.

**Validation:** Admin can identify which topics and problems need content improvement. Difficulty spikes between prerequisite pairs are visible. Data matches manual spot-checks of review_log.

---

## Phase 3: Visual Aids in Content
**Goal:** Add SVG-based visual representations to problems and worked examples — dual coding theory shows verbal + visual distributes cognitive load across working memory subsystems

1. [ ] [RSH] Design visual component library for K-5 math: identify the most impactful visual types (number lines, base-ten block arrays, fraction bars/circles, place value charts, simple bar models, comparison diagrams). Define a JSON schema for embedding visuals in problemsJson/examplesJson (type, parameters, positioning).
2. [ ] [IMP] Build reusable Vue SVG components: `NumberLine` (configurable range, tick marks, jump arcs), `BaseTenBlocks` (ones/tens/hundreds with grouping animation), `FractionBar` (divided bar with shaded portions), `ArrayGrid` (rows × columns for multiplication). Each renders from JSON parameters.
3. [ ] [IMP] Integrate visuals into ProblemView and WorkedExample components: render visual aids alongside question text when present in the problem/example JSON. Support visuals in all learning loop phases (instruction, guided, independent).
4. [ ] [IMP] Update content pipeline: add visual generation to `tools/generate-content.ts` — for appropriate topics (counting, place value, fractions, multiplication arrays), generate visual parameters alongside problems. Update 10-15 topics with visual aids as a pilot.
5. [ ] [TST] Verify: visual components render correctly across screen sizes, visuals appear in learning sessions for topics that have them, topics without visuals still work, accessibility (screen reader alt text for visuals).

**Validation:** Students see number lines, arrays, and fraction bars alongside relevant problems. Visuals are responsive on mobile and desktop. Content pipeline can generate visual parameters.

---

## Phase 4: Course-Level Diagnostic Test
**Goal:** Placement test that identifies a student's knowledge frontier across the full K-5 graph in 20-30 questions — PhysicsGraph and Math Academy both found this essential for proper student placement

1. [ ] [RSH] Design diagnostic algorithm: implement graph compression to select the minimum set of topics that "covers" the K-5 graph (every topic is within 2-3 prerequisite edges of a selected topic). Design inference rules: correct answer → credit to prerequisites; incorrect → penalty to post-requisites. Target 20-30 questions for K-5. Select the simplest question per topic that exercises key prerequisites.
2. [ ] [IMP] Build diagnostic API: `POST /api/learn/diagnostic/start` (create session), `POST /api/learn/diagnostic/respond` (submit answer, compute next question adaptively), `GET /api/learn/diagnostic/result` (final frontier map). Store results and initialize `user_topic_state` for placed-out topics.
3. [ ] [IMP] Build diagnostic UI: clean, focused interface. Show progress (question N of ~25). After completion, show visual knowledge map highlighting the frontier. Offer to start learning from the identified frontier.
4. [ ] [TST] Verify: diagnostic converges to correct frontier in 20-30 questions, placed-out topics are properly marked in user_topic_state, frontier computation matches expected results for known test profiles, UI flows smoothly.

**Validation:** A student with partial K-5 knowledge completes a 20-30 question diagnostic and is correctly placed at their frontier. They don't repeat topics they've already mastered.

---

## Phase 5: Engagement & Habit Features
**Goal:** Daily practice goals, streak visualization, and progress animations — habit formation research shows consistent cues + visible progress are key drivers

1. [ ] [IMP] Add daily practice goals: configurable daily target (default: 20 minutes or N problems). Track daily completion in a new `daily_activity` table (userId, date, minutesActive, problemsCompleted, topicsMastered, goalMet). Show goal progress prominently on dashboard.
2. [ ] [IMP] Build streak and contribution visualization: GitHub-style contribution graph showing daily activity over past 12 weeks. Current streak counter (consecutive days meeting goal). Display on dashboard and progress page.
3. [ ] [IMP] Add estimated completion time: based on remaining topics, current pace, and review burden, estimate weeks/months to complete the subject. Show on progress page. Update as pace changes.
4. [ ] [IMP] Add post-lesson knowledge graph highlight: after completing a topic, show a brief animation highlighting the newly mastered node in the knowledge graph and the topics it unlocks. Makes progress tangible and connects individual lessons to the bigger picture.
5. [ ] [TST] Verify: daily goals track accurately, streaks count correctly (including timezone handling), contribution graph renders with real data, completion estimate is reasonable, post-lesson animation fires after topic mastery.

**Validation:** Students see their daily progress, maintain visible streaks, and get a sense of their trajectory through the knowledge graph. Parents can see consistency patterns.

---

## Phase 6: Content Pipeline Tooling
**Goal:** Speed up content creation and catch errors automatically — PhysicsGraph's biggest multiplier was investing in content tooling (2 days/topic → 1.14 days/topic)

1. [ ] [IMP] Build AI content reviewer: a `tools/review-content.ts` script that uses LLM to review generated problems/examples for: mathematical accuracy, age-appropriateness, clarity of language, hint quality, answer correctness, difficulty alignment with grade level. Flag issues with explanations. Run as part of the validation pipeline.
2. [ ] [IMP] Add guessability scanner: for multiple-choice problems, use LLM to evaluate whether the correct answer is easily guessable without understanding the math (e.g., it's the only even number, or obviously different from distractors). Flag and suggest improvements.
3. [ ] [IMP] Add content velocity tracking: track when topics/problems were created, modified, and reviewed. Generate a report showing content creation rate over time, topics needing review, and coverage gaps (topics with fewer than N problems or no worked examples).
4. [ ] [TST] Verify: AI reviewer catches intentionally introduced errors, guessability scanner flags obviously guessable MC questions, velocity report accurately reflects content state.

**Validation:** Running the content review pipeline on existing K-5 content produces actionable feedback. Flagged issues are genuine problems when manually inspected.

---

## Phase 7: Onboarding & Growth
**Goal:** Let prospects experience the product before signup — PhysicsGraph found their biggest growth blocker was requiring signup/payment before experiencing the product

1. [ ] [IMP] Add public diagnostic taste: allow unauthenticated users to take 5-10 questions from the diagnostic on the landing page or `/try` route. Show them their estimated knowledge level and what they'd learn next. Prompt signup to continue.
2. [ ] [IMP] Build guided onboarding flow: after first signup, walk new users through a 3-step introduction — (1) explain the knowledge graph and how learning works, (2) run the full diagnostic, (3) start their first learning session. Track onboarding completion.
3. [ ] [IMP] Add welcome email sequence: triggered by signup. Email 1 (immediate): welcome + how to get started. Email 2 (day 2): explain spaced repetition and why daily practice matters. Email 3 (day 7): progress summary + encouragement. Use a simple email queue (D1 + scheduled Worker).
4. [ ] [TST] Verify: public diagnostic works without auth, onboarding flow completes end-to-end, emails are queued and well-formatted, conversion funnel is trackable.

**Validation:** A new visitor can experience the diagnostic without signing up. After signup, they're guided through onboarding and receive follow-up emails. The funnel from visit → signup → first session is smooth.
