# Learn Platform: System Review — Post-Implementation Deep Dive

> **Date:** 2026-03-07
> **Scope:** Comprehensive assessment after 12 completed plans. Engine completeness, structural gaps, content system design, strategic positioning, and path forward.
> **References:** `docs/learning-science.md`, `docs/content-system.md`, `.workflow/plans/reference/008-physicsgraph-learnings.md`, `DECISIONS.md`, `LEARNINGS.md`, `RESEARCH.md`, `docs/system-review-2026-03-06.md`
> **Context:** Prior review (2026-03-06) identified implementation gaps in the dimension system, session intelligence, and tutoring layer. Plans 009-012 were executed to close those gaps. This review assesses what's changed, what structural issues remain, and what to focus on next.

---

## Table of Contents

1. [Prompts](#prompts)
2. [Current State: What's Built](#current-state-whats-built)
3. [SWOT Analysis](#swot-analysis)
4. [Structural Issues to Address](#structural-issues-to-address)
5. [Design Gaps to Close Before Scaling Content](#design-gaps-to-close-before-scaling-content)
6. [Functional Opportunities](#functional-opportunities)
7. [Content System Assessment](#content-system-assessment)
8. [Validation Strategy: Proof Subjects](#validation-strategy-proof-subjects)
9. [Recommended Focus Areas](#recommended-focus-areas)
10. [Mission Check](#mission-check)

---

## Prompts

1. > Now I want you to do a deep dive into the learning-science and the content-system documents, as well as an audit of what we have implemented. I want you to think deeply (ultrathink) about the system, what we have setup, and what its strengths vs weaknesses are. I want you to think about the reference 008 physicsgraph document, and our learnings from MathAcademy too. Let's do a deep dive into what we have, where we want to go, and how we can get there. The core mission is to make an incredible learning tool available as freely as possible. Are we on track for that? Are there any big opportunities that we can still capitalize on? Does our content system do a good job of making it easier to generate content, or do we have too heavy, too vague, or not enough definition around it? Are we too limited with the survey through synthesis categories, preventing students from getting some of the other categories in their learning as needed or desired (maybe there should be some mixing or blending to make sure that lessons don't feel one note?). Let's take a deep and comprehensive look at this all, assess what we have, where we can improve, what our big limitations, strengths (SWOT style analysis across the board), and what we can do to proceed further in our mission.

2. > I am not worried about content thinness so far. I recognize that it's thin, but my thinking is that once I have the matrix of what I want to deliver, and have tested content (like math foundations, a basic english language arts - maybe starting with preschool and K even, a basic US history, etc) to see if it works within the system, then I will go and generate content across the board. As a solo dev with razor thin margins, the goal early on is to make sure I generate the content well once or twice only. Later on I can hone it, but the content gen will be the most expensive part of this for me, especially adding images, potential games, and more into the mix. So I want to focus on all the auxiliary and functional stuff primarily.

---

## Current State: What's Built

12 completed plans have produced a feature-complete learning engine. The infrastructure-to-content ratio is intentionally high — the strategy is to prove the engine works across subject types before investing in bulk content generation.

### Engine Completeness

| System | Plan | Status | Research Basis |
|--------|------|--------|----------------|
| 6-phase learning loop (pretest -> instruction -> guided -> independent -> review -> remediation) | 001 | Complete | Bloom's 2-sigma, mastery learning |
| FSRS spaced repetition + FIRe credit | 001 | Complete | FSRS 99.6% superiority over SM-2; FIRe reduces reviews to ~1/topic |
| Knowledge graph + 3 progression models (mastery-gated, context-layered, flexible) | 001, 009 | Complete | 3-4x mastery likelihood at frontier (Zou et al., 2019) |
| Adaptive binary-search diagnostic | 001, 009.5 | Complete | Pretesting effect (g=0.36); placement accuracy |
| Multi-dimensional content selection (flavor x locale x presentation x depth x version) | 009 | Complete | Late-starter problem; audience adaptation |
| Presentation drift tracking + adaptive presentation | 009.5 | Complete | Expertise reversal effect (Sweller et al., 2003) |
| LLM tutoring / grading / hints (OpenRouter) | 004 | Complete | Socratic method; hint progression protocol |
| Speech (browser TTS + Workers AI Whisper STT) | 005 | Complete | K-2 accessibility |
| Family accounts + parent/teacher account linking | 003 | Complete | SDT relatedness; monitoring |
| Group sessions (family/classroom/peer) | 007 | Complete | Collaborative learning |
| Diverse question types (numerical, multi-step, matching, multi-select) | 007 | Complete | Short-answer g=0.70 vs MC g=0.48 |
| Visual aid components (NumberLine, BaseTenBlocks, FractionBar, ArrayGrid, PlaceValueChart) | 007 | Complete | Dual coding theory (Baddeley, 1983) |
| Engagement (daily goals, streaks, milestones, contribution graph, mastery celebrations, completion estimates) | 012 | Complete | Habit formation (Lally et al., 2010); SDT competence |
| Session intelligence (depth blending, adaptive difficulty, targeted remediation, worked example fading) | 010 | Complete | 85% rule (Wilson et al., 2019); fading (Renkl & Atkinson, 2004) |
| Confidence calibration + metacognition | 011 | Complete | Calibration training; misconception detection |
| Admin analytics + content quality metrics | 008 | Complete | "Fix the content, not the standard" (Math Academy) |
| Open content platform (public API, explore pages, CC-BY-4.0) | 006 | Complete | Mission: freely available |
| Onboarding flow (intro -> diagnostic -> first session) | 007 | Complete | PhysicsGraph onboarding lesson |
| Content pipeline (Plan 018) | 018 | **Not started** | PhysicsGraph content velocity; generation at scale |

### Infrastructure Metrics

| Metric | Count |
|--------|-------|
| API route files | 16 |
| Service modules | 11 |
| Database tables | 48 |
| Frontend pages | 28 |
| Frontend components | 18 |
| Test files | 33 |
| Content tools | 9 |
| Subjects | 1 (Foundational Mathematics) |
| Topics | 71 |
| Assessment problems | 355 (~5/topic) |
| Worked examples | 142 (~2/topic) |
| Prerequisite edges | 108 |
| Encompassing edges | 16 |

---

## SWOT Analysis

### Strengths

**1. Research foundation is best-in-class for an open platform.**
`learning-science.md` distills 20 principles with citations, effect sizes, and direct implementation mappings. Every system decision traces to research. This isn't "gamified quizzes" — it's a systematic approximation of the 2-sigma tutoring effect. The documentation doubles as the content generation playbook.

**2. Three progression models are genuinely novel.**
No competitor offers mastery-gated (math/CS), context-layered (history/philosophy), AND flexible (vocabulary/geography) in a unified knowledge graph. Math Academy is mastery-gated only. Khan Academy is essentially flexible. The context-layered spiral curriculum (survey -> contextual -> analytical -> synthesis) for humanities has no peer.

**3. The dimension system is a force multiplier for content generation.**
`(flavor x locale x presentation x depth x version)` means the same knowledge graph serves every audience. A 6-year-old in Spanish with an adventure theme AND a 14-year-old in English at standard presentation use the same topic graph with different content selected. When the content push happens, each generated variant is immediately routed to the right learner.

**4. Free core tier is a genuine differentiator.**
Math Academy: $499/yr. PhysicsGraph: $29-99/mo. Khan Academy: free but no knowledge graph + mastery learning + FSRS. The "free learning engine, paid AI features" model maximizes adoption — the entire learning loop (graph + SRS + problems + worked examples + browser TTS + progress tracking + family accounts) is free.

**5. Edge deployment keeps costs near-zero.**
Cloudflare Workers + D1 = minimal hosting at small scale. No cold starts, global edge deployment. Critical for a free platform with thin margins.

**6. Comprehensive test coverage and documentation.**
33 test files across all layers, comprehensive DECISIONS.md, LEARNINGS.md, RESEARCH.md. The codebase is maintainable and extensible.

**7. Plans 009-012 closed the major implementation gaps from the prior review.**
The dimension system, session intelligence, tutoring layer, and engagement features are now implemented — not just documented. Content selection filters by all dimensions with fallback chains. Sessions blend depths. Hints progress. Confidence is calibrated. Streaks track.

---

### Weaknesses

**1. FIRe credit is still underpowered due to sparse encompassing relationships.**
16 encompassing edges across 71 topics. FIRe's promise — reducing explicit reviews to ~1 per topic on average — requires dense encompassing relationships. This is a **graph structure issue**, not a content issue. Even with thin content, enriching the encompassing graph would make the SRS engine work as designed. The methodology for assigning fractional weights is undocumented.

**2. Cognitive demand within mastery-gated topics is one-dimensional.**
For mastery-gated subjects, `content_depth` is always `survey` (correctly — analytical depth lives in the topic graph). But individual problems within a topic all test the same cognitive mode, typically procedural computation. There's no `cognitive_demand` tag to ensure sessions mix procedural, conceptual, application, reasoning, and error-analysis questions within a single topic's practice. The session structure varies (pretest vs guided vs independent), but the cognitive demand doesn't.

**3. No second subject to validate non-math progression models.**
The context-layered (US History) and flexible (vocabulary) progression models are implemented in code but untested with real content. Cross-discipline prerequisites are architecturally supported but content-less. Until a context-layered subject exists, the spiral curriculum is theoretical.

**4. Content iteration workflow is undocumented.**
The admin analytics surface problems (topics with <80% accuracy, difficulty spikes). But the feedback loop — observe student performance -> identify root cause (content vs prerequisite gap vs granularity) -> decide fix -> version and redeploy -> measure improvement — has no documented protocol. PhysicsGraph's biggest lesson was their full curriculum rewrite driven by student struggle data.

**5. No real user data yet.**
All analytics, difficulty adaptation, confidence calibration, and content quality systems are built but operating without signal. The validate-first strategy is correct, but the system needs even a small cohort (5-10 beta families) to prove the feedback loops work.

---

### Opportunities

**1. Encompassing relationship enrichment is the highest-leverage graph improvement.**
Going from 16 to 80+ encompassing edges with calibrated fractional weights would make FIRe genuinely functional. This is graph design work, not content work — it can be done now. The payoff: every future student gets dramatically fewer redundant reviews. Math Academy credits this as one of their key efficiency innovations.

**2. Cognitive demand tagging transforms session quality.**
Adding a `cognitive_demand` field to assessment content (`procedural`, `conceptual`, `application`, `reasoning`, `error_analysis`) and having the session service mix demands within a topic's practice would make lessons feel varied and engaging. A student gets "Compute 7+8" then "Why does 7+8 = 8+7?" then "Sara has 7 stickers and gets 8 more — how many?" — all within the same topic. This is a schema + generation concern, not a content volume concern.

**3. The self-explanation loop is a major differentiator when wired end-to-end.**
The `evaluateExplanation` LLM endpoint exists. The research is clear: self-explanation + faded worked examples produces medium-to-large effects on near and far transfer without additional study time. Verifying the frontend calls this during guided practice — and that the LLM evaluation actually influences session flow — would make this platform's tutoring feel genuinely different from every quiz app.

**4. Cross-discipline prerequisites create unique value.**
"You need reading comprehension before word problems" is a statement every teacher makes but no platform enforces. Even one working cross-discipline link would demonstrate the architecture's unique capability and create a compelling narrative.

**5. "Try before signup" is the highest-leverage acquisition flow.**
`try.vue` and the diagnostic exist. PhysicsGraph's biggest growth insight: requiring signup before experiencing the product killed conversion. The flow — 5-10 diagnostic questions -> knowledge frontier visualization -> "wow, this knows what I know" -> seamless signup with progress preserved — is the entry point that sells the platform's intelligence. The `account-merge.ts` service enables the anonymous -> authenticated transition.

**6. Community content contributions via open format.**
CC-BY-4.0 license + JSON content format + validation pipeline = potential for educator contributions. No competitor has an open content ecosystem for mastery-based learning. Even a small community of teachers contributing and reviewing problems would create a content flywheel.

---

### Threats

**1. Competitors have massive content head starts.**
Math Academy: thousands of topics refined over years. Khan Academy: tens of thousands of exercises. The content generation strategy (generate well once at scale) must execute efficiently when the time comes. The pipeline (Plan 018) is the vehicle.

**2. Over-engineering risk on the content pipeline.**
Plan 018 is 9 phases including visual generation, batch orchestration, audio/narrative, and review workflows. Each phase is well-designed but collectively represents months of work. The risk is building an elaborate generation machine when the immediate need is proven content for 3-4 proof subjects. A minimal viable pipeline (Phases 1-3: job model, LLM generation, validation) may be sufficient for the validation stage.

**3. Solo dev risk on combinatorial complexity.**
8 disciplines, 3 progression models, 5 content dimensions, 6 session phases, 4 remediation types — each new subject validates different code paths. The test coverage is good (33 files) but integration testing across the full learning loop with real content variants across progression models is a gap.

**4. Sustainability timeline.**
No revenue until users adopt AI features, which requires enough free content to demonstrate value, which requires the content pipeline. The validate-first strategy is correct but the timeline from "proof subjects" to "enough content for retention" to "paid AI adoption" is long. Plan accordingly.

---

## Structural Issues to Address

### Issue 1: Encompassing Relationships Need Enrichment and Methodology

**Current:** 16 encompassing edges, 71 topics. No documented methodology for assigning fractional weights.

**Why it matters:** FIRe credit is architecturally complete but starved of data. The review compression algorithm has almost nothing to work with. Students get more explicit reviews than necessary, making sessions feel like flashcard grinding instead of intelligent learning.

**What to do:**
- Audit the existing 71-topic graph and add encompassing relationships where they exist. Target: 80+ edges. Examples:
  - "Multi-Digit Addition" encompasses "Add Within 20" (~0.7 — same operation, harder numbers)
  - "Order of Operations" encompasses "Addition" (~0.3) and "Multiplication" (~0.3)
  - "Fraction Addition" encompasses "Equivalent Fractions" (~0.5) and "Add Within 100" (~0.2)
- Document the weight assignment methodology:
  - 1.0 = the advanced topic exercises the simpler skill identically (rare)
  - 0.5-0.8 = the simpler skill is a core component of the advanced task
  - 0.2-0.4 = the simpler skill is exercised incidentally
  - <0.2 = probably not worth an edge
- Apply this methodology when building graphs for new proof subjects
- This is graph design work that can happen independently of content generation

### Issue 2: Add Cognitive Demand Tagging to Assessment Schema

**Current:** Problems have `difficulty` (easy/medium/hard) and `type` (text-qa, numerical-input, multi-step, matching, multi-select). No tag for what KIND of thinking the problem requires.

**Why it matters:** Within a single mastery-gated topic, all problems tend to test the same cognitive mode (procedural). Sessions feel repetitive even when the session structure varies. Good math instruction mixes:

| Demand | Example ("Add Within 20") | What it tests |
|--------|--------------------------|---------------|
| `procedural` | "Compute 7 + 8" | Can you execute the procedure? |
| `conceptual` | "Why does 7 + 8 = 8 + 7?" | Do you understand the underlying property? |
| `application` | "Sara has 7 stickers, gets 8 more. How many?" | Can you apply it in context? |
| `reasoning` | "Without computing: is 7+8 or 6+9 bigger? Explain." | Can you reason about it? |
| `error_analysis` | "Alex says 7+8 = 14. What went wrong?" | Can you diagnose mistakes? |

**What to do:**
- Add `cognitive_demand` field to `assessment_content` schema (nullable for backward compat)
- Update session service to select a mix of demands during guided and independent practice
- Include cognitive demand in content generation prompts when generating at scale
- For existing content, tag problems with their demand type (most will be `procedural`)

### Issue 3: Clarify "Survey Only" for Mastery-Gated Instructional Content

**Current:** Content system docs state: "Never create non-survey depth content for mastery-gated subjects."

**The nuance:** This is correct for content_depth selection — mastery-gated subjects encode analytical progression in the topic graph. But the mandate could inadvertently discourage worked examples from explaining WHY procedures work. A worked example for "Add Within 20" should show the procedure AND explain the underlying concept (e.g., place value, commutativity) — this is just good instruction, not "contextual depth."

**What to do:** Add a clarification to `content-system.md`: "Survey-depth instructional content for mastery-gated subjects should still explain WHY procedures work, not just HOW to execute them. The `survey` label means the topic itself is foundational, not that instruction should be shallow. Worked examples should include conceptual framing alongside procedural steps." This is a documentation change, not an architecture change.

---

## Design Gaps to Close Before Scaling Content

### Gap 1: Content Iteration Protocol

**What exists:** Admin analytics surface per-topic accuracy, hint usage, difficulty spikes between prerequisite pairs.

**What's missing:** The documented workflow for acting on those signals:

```
1. DETECT: Admin dashboard flags topic X with <80% accuracy or >2 hints/attempt
2. DIAGNOSE: Is it a content issue, prerequisite gap, or granularity issue?
   - Content issue: problems are ambiguous, too hard, or poorly scaffolded
   - Prerequisite gap: students arrive without the needed foundation
   - Granularity issue: the topic covers too many skills (needs splitting)
3. FIX: Based on diagnosis:
   - Content issue -> rewrite problems, improve hints, add worked examples (new version)
   - Prerequisite gap -> add/strengthen prerequisite edges, adjust diagnostic
   - Granularity issue -> split topic into sub-topics, rebuild local graph
4. DEPLOY: Import new content version. Keep old version for comparison.
5. MEASURE: Track accuracy delta on the new version. Did it improve?
```

**Why it matters:** When generating content at scale, some percentage will underperform. Having this protocol documented before the content push means iterations are systematic, not ad hoc. This is what PhysicsGraph learned from their curriculum rewrite.

### Gap 2: Graph Structure Validation for New Subject Types

**What exists:** `validate-graph.ts` checks DAG properties, prerequisite closure, standard codes.

**What's missing:** Guidance for designing graphs for new progression models:

- **Target topic granularity:** Math Academy uses ~1,000 steps through calculus (10x textbooks). Our 71 K-5 topics are more granular than textbooks but less than Math Academy. What's the target? The answer affects content generation cost directly.
- **Context-layered graph design:** How wide and shallow should a US History graph be? How many `required` vs `recommended` vs `enriching` edges? What determines whether a topic is an "anchor topic" (gets all depth levels) vs. peripheral?
- **Encompassing relationships per subject type:** Mastery-gated subjects have natural encompassings (advanced operations encompass basic ones). Do context-layered subjects have encompassings? (Possibly — "Causes of the Civil War" encompasses "Slavery in America" at some fraction.)

**Why it matters:** Each proof subject will require graph design before content generation. Documenting the methodology as it's developed (starting with the math graph enrichment) creates the playbook for all future subjects.

### Gap 3: Verify End-to-End Feature Integration

Plans 009-012 implemented many features. Some questions about whether they're fully wired:

| Feature | Question | Where to verify |
|---------|----------|----------------|
| Self-explanation prompts | Does the frontend call `evaluateExplanation` during guided practice? | `WorkedExample.vue`, `learn.vue` |
| Confidence calibration | Is confidence data feeding into FSRS rating adjustments? | `srs.ts`, `session.ts` |
| Presentation drift | Does diagnostic seed presentation levels? Does drift data adjust future content selection? | `diagnostic.ts`, `content.ts` |
| Adaptive difficulty | Is the 85% success rate actually targeted in session problem selection? | `session.ts`, `adaptive-difficulty.test.ts` |
| Depth blending | Are sessions mixing warmup/main/stretch across depth levels? | `session-depth-blend.test.ts` |
| Worked example fading | Does FSRS state drive the fading level (full -> partial -> independent)? | `session-fading.test.ts` |
| Interleaving | Do review sessions avoid related topics back-to-back? | `interleaving.test.ts` |

These likely all work (tests exist for each), but a manual integration walkthrough — starting a learning session and observing the full loop — would confirm everything connects. This is worth doing before building proof subjects, since content generated for a broken feature is wasted.

---

## Functional Opportunities

### The "Try Before Signup" Flow

`try.vue` exists. The diagnostic is engaging and immediately demonstrates the platform's intelligence. The `account-merge.ts` service enables anonymous -> authenticated transition.

**Polish priority:** The UX flow — take 5-10 diagnostic questions -> see knowledge frontier visualization -> "I want to keep going" -> seamless signup with progress preserved — is the highest-leverage acquisition funnel. Worth testing end-to-end and polishing before launch. This is what sells the platform without a sales pitch.

### Community Content Contributions

CC-BY-4.0 + JSON format + validation pipeline = foundation for educator contributions. The `tools/validate-content.ts` and `tools/import-content.ts` already handle the mechanics.

**What's missing:** A public content format specification, a contribution workflow (submit -> validate -> review -> import), and contributor guidelines. These are documentation tasks, not engineering tasks. When the platform has users, inviting educators to contribute problems and worked examples creates a content flywheel.

### Per-Topic Performance Analytics as a Public Signal

The admin analytics track per-topic accuracy, hint usage, and difficulty spikes. Some of this data could be surfaced publicly (anonymized, aggregated) as a signal of content quality. "This topic has 92% first-attempt accuracy across 500+ students" builds trust and demonstrates the "fix the content, not the standard" philosophy.

---

## Content System Assessment

### Depth Levels (survey -> synthesis): Well-Designed

**For mastery-gated subjects:** Content depth is correctly always `survey`. Analytical progression lives in the topic graph. With the cognitive demand tagging recommendation (Issue 2), individual problems can still test different kinds of thinking without misusing depth levels.

**For context-layered subjects:** The spiral curriculum is the most innovative aspect of the design. Re-visiting the American Revolution at survey -> contextual -> analytical -> synthesis depth is pedagogically sound and has no competitor equivalent. This needs validation with a real subject.

**For flexible subjects:** Survey is all that's needed. The system correctly handles this.

**Verdict:** The 4-level depth system is right-sized. No change needed. The "one note" concern is addressed by cognitive demand tagging (a problem property) and session depth blending (already implemented), not by changing the depth model.

### Dimension System: Right Abstraction, Watch the Surface Area

The 5-axis system `(flavor x locale x presentation x depth x version)` is powerful. But even a modest subject generates thousands of matrix cells:

```
71 topics x 4 presentations x 1 depth x 1 flavor x 1 locale = 284 cells (assessment only)
71 topics x 4 presentations x 1 depth x 3 flavors x 2 locales = 1,704 cells
```

**Guidance for the content push:** Follow the priority matrix in `content-system.md` section 12 ruthlessly:
1. Survey x standard x classic x en x all topics (covers most learners)
2. Survey x intermediate x classic x en x all topics (opens 3-5 audience)
3. Survey x primary x classic x en x entry topics (opens K-2)
4. Then expand flavors and locales based on demand

Resist the temptation to fill the matrix broadly before going deep. 20-30 problems per topic at one dimension combination is more valuable than 5 problems each at 6 combinations.

### Generation Readiness

The system is ready for content generation in the sense that:
- Content selection filters by all dimensions with fallback chains
- Presentation drift adapts to student performance
- Session intelligence blends depths and difficulties
- Validation tools catch structural and medium-constraint issues
- Import tools handle dimension metadata

What's still needed before bulk generation:
- Plan 018 Phases 1-3 (pipeline architecture, LLM generation, validation framework) — the minimal viable pipeline
- Encompassing relationship enrichment (Issue 1) — so generated content works within a functional FIRe system
- Cognitive demand field in schema (Issue 2) — so generation prompts can specify demand types

---

## Validation Strategy: Proof Subjects

Each proof subject validates different dimensions of the system:

| Subject | Progression Model | What It Validates | Estimated Scope |
|---------|-------------------|-------------------|-----------------|
| **Math Foundations** (exists) | `mastery-gated` | Core loop, FSRS, FIRe, diagnostic, mastery criteria | 71 topics, needs encompassing enrichment |
| **Pre-K/K ELA** | `mastery-gated` | Cross-discipline prereqs (reading -> word problems), primary presentation for very young learners, phonics/letter content types | ~25-30 topics |
| **US History** | `context-layered` | Spiral curriculum, depth progression, `recommended` edge behavior, rubric-based grading at analytical/synthesis depth | ~25-30 topics |
| **Basic Vocabulary** (optional) | `flexible` | Flexible model, FSRS-primary learning, minimal prerequisites | ~20 topics |

Each needs: graph design (topics + prerequisites + encompassings) + thin content (5-10 problems + 2-3 worked examples per topic) + manual walkthrough of the full learning loop.

The proof subjects don't need to be complete — they need to exercise every code path for their progression model. If the context-layered spiral works for 25 US History topics, it'll work for 250.

---

## Recommended Focus Areas

### High Priority (Directly Improves Learning Quality)

1. **Enrich encompassing relationships in math-foundations** (16 -> 80+). Document the weight assignment methodology. This makes FIRe functional and reduces every future student's review burden.

2. **Add `cognitive_demand` field to assessment content schema.** Tag existing problems. Update session service to mix demands. This makes mastery-gated lessons feel varied instead of one-note.

3. **Verify end-to-end feature integration.** Walk through a full learning session manually and confirm: self-explanation prompts fire, confidence data feeds FSRS, presentation drift adjusts, adaptive difficulty targets 85%, depth blending works, fading progresses, interleaving avoids interference.

4. **Verify adaptive difficulty targets 85% success rate end-to-end.** The research is emphatic (Wilson et al., 2019, Nature Communications). The test exists. Confirm it works with real content, so when content is generated with difficulty tiers, the system uses them correctly.

### Medium Priority (Improves Platform Readiness)

5. **Document content iteration protocol** (detect -> diagnose -> fix -> deploy -> measure). Do this before generating at scale so iterations are systematic.

6. **Clarify "survey only" rule** for mastery-gated instructional content. Add note to `content-system.md` that survey-depth worked examples should still explain WHY, not just HOW.

7. **Polish try -> diagnostic -> signup -> preserved progress flow.** This is the acquisition funnel. Test end-to-end. The account merge service exists — make sure the UX is seamless.

8. **Design the minimal graph for US History** (~25 topics). This is the first context-layered proof subject. Document the graph design process as you go — this becomes the playbook for all future subjects.

### Lower Priority (Before Content Push)

9. **Plan 018 Phases 1-3** (pipeline architecture, LLM generation, validation framework). The minimal viable content pipeline. Skip phases 4-9 until after proof subjects validate the system.

10. **Document encompassing relationship design methodology** for use across all future subjects. The math enrichment (item 1) is the first application.

11. **Design graph structure guidelines** per progression model — target granularity, edge type distribution, anchor topic identification for context-layered subjects.

12. **Plan integration test suite** that exercises the full learning loop across progression models with real content variants. Current tests are good but unit/service-focused. A "student journey" integration test would catch cross-cutting issues.

---

## Mission Check

**"Make an incredible learning tool available as freely as possible."**

### Incredible

The learning science foundation and engine architecture are genuinely best-in-class for an open platform. Plans 009-012 closed the major implementation gaps from the prior review — the dimension system, session intelligence, tutoring layer, and engagement features are now functional, not just documented.

**Remaining gap:** The structural issues above (encompassing enrichment, cognitive demand mixing, feature integration verification) are the differences between "well-designed engine" and "incredible learning experience." They're what make the content generation investment worthwhile, because the engine uses the content intelligently.

### Available

Free core tier, edge deployment, no cold starts, works on any browser with TTS/STT. The try-before-signup flow is the key to discoverability. CC-BY-4.0 content license enables community contribution.

### Freely

Free learning engine (graph + SRS + problems + examples + TTS + progress + family accounts). AI features ($5/mo) fund sustainability. No ads, no data selling.

### The Flywheel

```
System correctness -> proof subjects validate all paths
    -> content generation at scale (once, done well)
        -> student engagement
            -> usage data
                -> content iteration (systematic, documented protocol)
                    -> better content -> more engagement -> ...
```

**Current position:** System correctness is high after 12 plans. Next step is structural refinement (encompassings, cognitive demand, integration verification), then proof subjects to validate non-math paths, then the content push.

**The key insight from this review:** The engine is built. The remaining work before content generation is graph enrichment and structural refinement — making the engine USE content intelligently — not building more engine. When the content push happens, the system should deliver measurably better learning outcomes than simpler alternatives because of FIRe, cognitive demand mixing, depth blending, adaptive difficulty, and self-explanation evaluation. These features need to actually work end-to-end, which means verifying and polishing, not adding new capabilities.
