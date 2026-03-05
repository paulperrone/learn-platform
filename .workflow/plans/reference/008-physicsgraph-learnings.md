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

**Detailed Overview from Past Session** 

Let me go through the PhysicsGraph updates month by month and extract the tactical learnings.                         
                                                                                                                        
  PhysicsGraph: Tactical Learnings from 7 Months of Building                                                            
   
  Content Velocity & Process                                                                                            
                                                                                                                      
  Key finding: Content creation speed is the bottleneck, and it improves dramatically with tooling investment.
  - Started at 2 days/topic, improved to 1.14 days/topic by unit 2 — and called it "the slowest it will ever be"
  - Every month they shipped content editing improvements: overhauled workflows, removed "papercuts," made rearranging
  the knowledge graph easier
  - Built ReviewBot — an AI tool that catches small errors and inconsistencies human reviewers miss. Reduced noise over
  time.
  - They hired a content creator (physicist) early, not an engineer. Content is the product.

  Our takeaway: Our tools/ pipeline (generate, validate, import) is the right idea. We should invest in making content
  creation faster — better tooling pays compound returns. An AI content reviewer (like ReviewBot) is low-hanging fruit
  we could build with our existing LLM integration.

  ---
  Question Type Diversity

  Key finding: Multiple choice is insufficient. They built 8+ question types and it materially improved learning.

  Types they built (beyond MC):
  1. Numerical input — type the number, no guessing
  2. Equation input — write the equation
  3. Multi-select — check all that apply
  4. Matching — connect related items
  5. Dynamic Select — dropdowns + numerical inputs combined (inspired by Math Academy's proofs)
  6. Essay/free response — open-ended written answers
  7. Graph drawing — draw on a coordinate plane
  8. Multi-step problems — chain of dependent steps

  They also built a scanner that uses AI to catch easily-guessable multiple-choice questions — acknowledging that bad MC
   questions let students game the system.

  Our takeaway: Our current problemsJson stores problems as question/answer pairs. For K-5 math, the most impactful
  additions would be:
  - Numerical input (type the answer, don't pick from options) — retrieval practice g=0.70 vs MC g=0.48
  - Multi-step (chain of steps for word problems, showing work)
  - Matching (connect equivalent fractions, match operations to results)
  - Equation building (drag-and-drop number sentences for younger kids)

  This aligns with the learning science: short-answer forces deeper retrieval than multiple choice.

  ---
  Curriculum Rewrites Based on Student Feedback

  Key finding: They did a FULL curriculum rewrite after only a few months, driven by student struggle data.

  What changed in the rewrite:
  - Shorter, clearer lessons — they were too long initially
  - More tikz diagrams and manim animations — visual explanations matter enormously
  - Engelmann's Direct Instruction framework for sequencing — explicit, structured, no ambiguity
  - Smoother difficulty curves — they found "difficulty spikes" that frustrated students
  - More engaging question types (replacing MC with the types above)

  The rewrite "manages to teach content at a deeper level and require more engaged thinking while also having fewer
  difficulty spikes." Harder questions + smoother scaffolding = better learning.

  Our takeaway: We should plan for content iteration. Track per-topic and per-problem accuracy rates from day one. When
  accuracy drops below 80%, investigate the content (not the student). Our analytics already track per-topic accuracy —
  we should surface this in the admin dashboard and act on it systematically.

  Engelmann's Direct Instruction is worth studying as a sequencing framework for our content pipeline — it's highly
  structured and works especially well for K-5.

  ---
  Animations and Visualizations

  Key finding: Manim animations and tikz diagrams were highlighted as a major content improvement.

  They invested heavily in:
  - Manim animations embedded in lessons (cited "two of three manim animations in this particular lesson")
  - Tikz diagrams for static visualizations
  - Image upload and image generation workflows built into their content pipeline
  - A visualization editor built specifically for content creators

  Our takeaway: For K-5 math, visual representations are critical (dual coding theory). We currently have text-only
  problems/examples. We should consider:
  - SVG-based visual aids in worked examples (number lines, arrays, base-ten blocks)
  - Simple animations for concepts like regrouping/carrying
  - This could be a future phase — even static diagrams would be a big improvement

  ---
  Diagnostic Test

  Key finding: They invested significant effort in a diagnostic test and consider it essential.

  Their diagnostic:
  - Identifies the student's "knowledge frontier" before starting
  - Includes animations to make it engaging
  - They're planning to put part of the diagnostic before the credit card so prospects experience the product

  Our takeaway: Our pretest phase in the learning loop is per-topic. A course-level diagnostic (like Math Academy's
  20-40 question placement exam) would let returning students or those with partial knowledge skip ahead. This is
  especially important for adult learners reviewing foundations.

  ---
  Free Response Questions (FRQs) & Practice Tests

  Key finding: FRQs with AI grading were their biggest investment and competitive differentiator.

  - Students write/draw answers, get point-by-point grading like the real AP exam
  - Feedback in minutes instead of days/weeks
  - "No one else does this, and I see why" — extremely labor-intensive to build
  - Made optional (not all users want test prep)

  Our takeaway: For K-5, this maps to having students show their work and explain their reasoning, with LLM grading. Our
   LLM grading endpoint already exists — we could extend it to evaluate multi-step written solutions, not just final
  answers. This connects directly to the self-explanation research.

  ---
  Gamification & Engagement

  Features they added over time:
  - Daily XP goals (not just total XP)
  - Estimated course completion time (sets expectations)
  - XP history per course + GitHub-style contribution graph (visual streaks)
  - Post-lesson animations emphasizing path through knowledge graph (makes progress tangible)
  - Progress bars for in-progress topics on the menu
  - Knowledge graph color-coded by unit with unit filtering
  - Keyboard shortcuts
  - Dark mode (in private beta)
  - "Weekly activity" emails (opt-in)

  Our takeaway: Several of these are quick wins:
  - Daily XP/practice goals (habit formation research: consistent cues matter)
  - GitHub-style contribution graph (streak visualization)
  - Post-lesson knowledge graph animation (connect learning to the bigger picture)
  - Estimated completion time (sets expectations, reduces dropout)

  ---
  Growth & Marketing Lessons

  Key finding: They grew purely on word-of-mouth for months, then realized they needed to invest in onboarding.

  Timeline:
  - Months 1-4: Zero marketing, pure word-of-mouth, MRR still grew 50%
  - Month 5: "Oops. We forgot to do marketing."
  - Month 6: New landing page, SSR for marketing pages, Duolingo-inspired onboarding sequence
  - Month 7: Social media push, record WAU higher than launch

  Critical onboarding insight: "Our site did a very poor job of communicating what we're about, and to understand you
  had to sign up and give us your credit card." They built:
  - Better landing page with focused messaging
  - Duolingo-inspired onboarding sequence (guided, not overwhelming)
  - Moved credit card input after a taste of the diagnostic (let people experience it first)
  - Dynamic onboarding email sequence
  - Free trial infrastructure

  Our takeaway:
  - The /how-we-teach page we just built addresses the "communicate what we're about" problem
  - Our /explore pages (public content browser) let people see the product without signing up
  - We should plan for: free trial without credit card, taste of diagnostic before signup, onboarding email sequence
  - SSR for public pages matters for SEO/growth (our Cloudflare ASSETS binding can serve pre-rendered pages)

  ---
  Infrastructure Decisions

  Notable technical choices:
  - Moved from Stripe Checkout to Stripe Elements (credit card form on their own site, better conversion)
  - Added end-to-end testing + CI for critical paths
  - Built sandbox mode for testing, demos, and user-generated content
  - Introduced a typed ORM to the codebase
  - SSR for marketing pages

  ---
  Summary: Top Priorities Informed by PhysicsGraph

  ┌──────────┬────────────────────────────────────────────────┬─────────────────────────────────────────────────────┐
  │ Priority │                      What                      │                         Why                         │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ High     │ Numerical input questions (type answer, not    │ g=0.70 vs g=0.48 retrieval practice                 │
  │          │ MC)                                            │                                                     │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ High     │ Per-topic/per-problem accuracy analytics in    │ Drives content iteration — their biggest lesson     │
  │          │ admin                                          │                                                     │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ High     │ Content pipeline tooling investment            │ Compound returns on creation speed                  │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Medium   │ Multi-step problems                            │ Better models real math reasoning                   │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Medium   │ Visual aids in problems/examples               │ Dual coding, major content improvement              │
  │          │ (SVG/diagrams)                                 │                                                     │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Medium   │ Daily practice goals + streak visualization    │ Habit formation research                            │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Medium   │ Course-level diagnostic test                   │ Proper placement, skip-ahead for knowledgeable      │
  │          │                                                │ students                                            │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Lower    │ AI content reviewer (ReviewBot equivalent)     │ Catches errors humans miss                          │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Lower    │ Onboarding sequence (free trial before         │ Conversion optimization, later-stage                │
  │          │ payment)                                       │                                                     │
  ├──────────┼────────────────────────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Lower    │ Post-lesson graph animation                    │ Engagement, makes progress tangible                 │
  └──────────┴────────────────────────────────────────────────┴─────────────────────────────────────────────────────┘

## Distribution of Phases

The original 008 plan had 7 phases derived from PhysicsGraph's build-and-grow journey. These have been distributed to active plans where they fit architecturally:

| Original Phase | Distributed To | Plan Phase |
|---|---|---|
| Phase 1: Diverse Question Types | **007** (Content Personalization) | Phase 1 (schema) + Phase 2 (components/grading) |
| Phase 2: Content Quality Analytics | **008** (Admin & Content Landscape) | Phase 3 (content quality analytics) |
| Phase 3: Visual Aids | **007** (Content Personalization) | Phase 3 (SVG components + integration) |
| Phase 4: Course-Level Diagnostic | **007** (Content Personalization) | Phase 6 (anonymous usage + diagnostic) |
| Phase 5: Engagement & Habits | **013** (Engagement & Habits) | Full standalone plan |
| Phase 6: Content Pipeline Tooling | **009** (Content Generation Pipeline) | Phases 1-5 (full pipeline architecture) |
| Phase 7: Onboarding & Growth | **007** (Content Personalization) | Phase 6 (anonymous + onboarding flow) |

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
