# Learning Science Reference

> Distilled principles and research guiding platform design. For quick context import into development sessions.
> For the content taxonomy, dimensions, and creation strategies, see `content-system.md`.
>
> **Primary sources:** "The Math Academy Way" (Skycak, 2026), mathacademy.com/pedagogy, and independent learning science research.
> **Last updated:** 2026-03-06

---

## How to Use This Document

This is a **ready reference** for development sessions. When building or modifying features, load the relevant section to ensure decisions are grounded in research. The document is organized by principle, not by source — each section contains the research finding, key numbers, citations, and direct platform implications.

For the full primary source, see `~/Desktop/the-math-academy-way.pdf` (Skycak, 2026, ~500 pages).

**Peer platforms implementing similar approaches:**
- **Math Academy** (mathacademy.com) — The gold standard. Knowledge graph + FIRe + mastery learning + spaced repetition. Math focus, 4th grade through university. $499/yr. Primary inspiration.
- **PhysicsGraph** (physicsgraph.com) — Founded by Jeffrey Biles. Knowledge graph + spaced repetition for AP Physics. Similar architecture to Math Academy but for physics. Notable innovations: Free Response Questions with AI grading, manim animations, Engelmann's Direct Instruction framework for sequencing, multi-step problems, diverse question types (numerical input, equation input, graph drawing, matching, dynamic select). Content velocity: started at 2 days/topic, improved to ~1 day/topic. ~200 topics in Physics 1 graph. $29/mo (core) or $99/mo (test prep with FRQs + practice tests). Growing purely via word-of-mouth + Twitter. Key lesson: they found students struggling with FRQs led to a full curriculum rewrite with shorter/clearer lessons, more diagrams/animations, and smoother difficulty curves — validating Math Academy's "fix the content, not the standard" principle.

---

## Table of Contents

1. [Bloom's Two-Sigma Problem](#1-blooms-two-sigma-problem)
2. [Working Memory and Cognitive Load](#2-working-memory-and-cognitive-load)
3. [Knowledge Graph and Prerequisite Enforcement](#3-knowledge-graph-and-prerequisite-enforcement)
4. [Mastery Learning](#4-mastery-learning)
5. [Worked Examples, Scaffolding, and Fading](#5-worked-examples-scaffolding-and-fading)
6. [Active Learning and Retrieval Practice](#6-active-learning-and-retrieval-practice)
7. [Spaced Repetition and FSRS](#7-spaced-repetition-and-fsrs)
8. [FIRe: Fractional Implicit Repetition](#8-fire-fractional-implicit-repetition)
9. [Interleaving and Non-Interference](#9-interleaving-and-non-interference)
10. [Self-Explanation Effect](#10-self-explanation-effect)
11. [Pretesting and Productive Failure](#11-pretesting-and-productive-failure)
12. [Confidence Calibration and Metacognition](#12-confidence-calibration-and-metacognition)
13. [AI Tutoring and Socratic Method](#13-ai-tutoring-and-socratic-method)
14. [Targeted Remediation](#14-targeted-remediation)
15. [Automaticity and Layering](#15-automaticity-and-layering)
16. [Motivation and Self-Determination Theory](#16-motivation-and-self-determination-theory)
17. [Habit Formation and Session Design](#17-habit-formation-and-session-design)
18. [Assessment and Quiz Design](#18-assessment-and-quiz-design)
19. [Content Design Guidelines](#19-content-design-guidelines)
20. [Key Numbers and Thresholds](#20-key-numbers-and-thresholds)

---

## 1. Bloom's Two-Sigma Problem

**Principle:** One-on-one tutoring produces dramatically better learning outcomes than traditional classrooms. The challenge is replicating this effect at scale through technology.

**Research:**
- Students receiving one-on-one tutoring performed **2 standard deviations** above classroom-taught peers — the average tutored student outperformed 98% of traditionally-taught students (Bloom, 1984).
- Mastery learning in a classroom (without individual tutoring) achieved ~1 sigma improvement.
- Traditional schooling groups by age and progresses in lockstep. Talent development is fully individualized — tasks chosen per student, mastery required before advancing (Bloom & Sosniak, 1981).
- More conservative meta-analyses show d = 0.52-0.94 for classroom mastery learning (Guskey & Pigott, 1988) and d = 0.37 for tutoring programs generally (2020 meta-analysis of 96 RCTs).

**Platform implication:** The knowledge graph + FSRS + LLM tutoring together approximate expert tutor decisions: what to teach next, when to review, how to help when stuck, and when to advance.

---

## 2. Working Memory and Cognitive Load

**Principle:** Working memory is severely limited. When a learning task exceeds this capacity, the learner cannot learn. Every design decision must minimize unnecessary cognitive load.

**Research:**
- Working memory holds ~7 digits / **~4 chunks** simultaneously (Miller, 1956; Cowan, 2001).
- Duration: ~20 seconds without rehearsal (Brown, 1958; Peterson & Peterson, 1959).
- Holding items AND manipulating them compete for the same resources — if manipulation is required, fewer items can be held.
- Working memory capacity is a **better predictor of academic success than IQ** for young students (Alloway & Alloway, 2010).
- Higher WMC correlates with faster learning rate, better abstraction ability, lower perceived effort.
- **Element interactivity** is the unifying mechanism: intrinsic load is determined by the number of elements that must be processed simultaneously. Multi-digit multiplication has high element interactivity; single-digit addition has low.
- **Expertise reversal effect:** Techniques that help beginners (e.g., worked examples) actively hinder experts by adding redundant information (Sweller et al., 2003). Platform must adapt scaffolding to learner proficiency.
- Math Academy uses ~10x more granular scaffolding than typical textbooks (~1,000 steps through calculus vs ~100 in a textbook).

**Platform implication:** Break topics into small knowledge points. Sequence prerequisites so component skills are automatic before combining them. Paper-and-pencil offloads WM — the tradeoff is asymmetric: overshooting scaffolding wastes seconds; undershooting causes a brick wall.

---

## 3. Knowledge Graph and Prerequisite Enforcement

**Principle:** A directed acyclic graph (DAG) of topics connected by prerequisite relationships enables algorithmic decisions about sequencing, remediation, and review compression.

**Research:**
- Students are **3-4x more likely to master a topic** at their knowledge frontier (prerequisites mastered) vs. beyond it (Zou et al., 2019).
- ~38-49% of students in any grade classroom are either below or above "grade level" — one-size-fits-all instruction fails (Pedersen et al., 2023).
- Hierarchical learning sequences are superior to disconnected courses (Arzi, Ben-Zvi, & Ganiel, 1985).

**Three relationship types:**
1. **Prerequisites:** Must learn A before B. The DAG edges.
2. **Key prerequisites:** The specific skill causing struggle at a particular knowledge point. Enables pinpoint remediation.
3. **Encompassings:** Advanced topics implicitly practice simpler topics. Numerical weights [0, 1] represent the fraction of a simpler topic exercised. Enables FIRe credit.

**Graph traversal:** Neither pure breadth-first nor depth-first. Use a **layered approach**: teach a layer of foundational concepts across the breadth of the graph, then deepen. This interleaves dissimilar concepts (non-interference) while maintaining prerequisite order.

**Platform implication:** The knowledge graph is the backbone. Every topic has prerequisites (must-master-first edges) and encompassing relationships (for FIRe credit). Validate as DAG. Unlock topics visually so students see what's available, locked, and mastered.

---

## 4. Mastery Learning

**Principle:** Students must demonstrate genuine proficiency on prerequisites before advancing. Even rough approximations produce large gains; true mastery requires fully individualized instruction.

**Research:**
- Effect sizes: ~0.5 SD for classroom approximations (Kulik, Kulik, & Bangert-Drowns, 1990); ~1 sigma for Bloom's version; 2 sigma for individual tutoring.
- Mastery learning (PSI) was actively suppressed by educational establishments despite documented effectiveness (Sherman, 1992; Buskist, Cush, & DeGrandpre, 1991).
- Math Academy achieves 95% first-attempt pass rate, 99% within two attempts (after years of content refinement).

**Mastery threshold:** High enough to execute skills as components of advanced skills, but NOT automaticity level. Automaticity develops over time through layering and review.

**Our learning loop:**
1. **Pretest** → identify what they already know
2. **Instruction** → worked examples
3. **Guided practice** → practice with scaffolding/hints
4. **Independent practice** → solve alone
5. **Spaced review** → FSRS-scheduled retrieval practice
6. **Remediation** → prerequisite repair when struggling

---

## 5. Worked Examples, Scaffolding, and Fading

**Principle:** Worked examples reduce cognitive overload for beginners. Scaffolding is gradually removed as students gain proficiency (fading). The combination with self-explanation prompts is especially powerful.

**Research:**
- Worked examples help beginners develop schemas without overloading WM (Sweller, 2006).
- **Subgoal labeling** helps students grasp problem structure and transfer learning (Catrambone, 1995).
- **Dual coding** (verbal + visual) distributes load across WM subsystems (Baddeley, 1983).
- **Backward fading** is most effective: start with complete worked example, remove the last step, then last two, until solving independently (Renkl & Atkinson, 2004). Students learn most about the principles that are faded.
- Combining faded worked examples with self-explanation prompts produces medium-to-large effects on both near and far transfer, without additional study time (Atkinson & Renkl).

**Lesson structure (per knowledge point):**
1. Introduction
2. Worked example
3. 2-5 adaptive practice questions
4. ~7 active practice problems per 1 passive worked example

**Platform implication:** WorkedExample component should support variable fading levels: full example, partially faded (some steps blanked), and fully faded. Track mastery of sub-skills and fade scaffolding when sub-skills are automated. FSRS provides the expertise signal for dynamic fading.

---

## 6. Active Learning and Retrieval Practice

**Principle:** Actively solving problems produces far better learning than passive studying. Retrieval practice (recalling from memory) is one of the most powerful learning strategies known.

**Research:**
- Meta-analysis of hundreds of studies: active learning significantly improves STEM outcomes. Authors call for "abandoning traditional lecturing" (Freeman et al., 2014).
- Harvard physics: students in active classes *felt* they learned less but actually learned *more* — passive learning creates an "illusion of competence" (Deslauriers et al., 2019).
- **Testing effect meta-analyses:** Rowland (2014): g = 0.50. Adesope et al. (2017, 217 studies): g = 0.61. Short-answer tests (g = 0.70) outperform multiple-choice (g = 0.48) because they force deeper retrieval.
- Effects are **stronger at longer delays**: <1 day: g = 0.56; 1-6 days: g = 0.82.
- "The single most important variable in promoting long-term retention and transfer is 'practice at retrieval'" (Halpern & Hakel, 2003).
- Combined spacing + retrieval practice is the gold standard. Students practicing mixed (interleaved) problem sets outperform blocked practice by 30-40% on delayed tests.

**Platform implication:** Use constructed-response formats as primary assessment (not just multiple choice). Every FSRS review is a retrieval practice event. Always provide feedback after retrieval attempts.

---

## 7. Spaced Repetition and FSRS

**Principle:** Spacing reviews over increasing intervals consolidates memory into long-term storage. Each successful review extends the interval. The FSRS algorithm personalizes this to each student-topic pair.

**Research:**
- Ebbinghaus (1885) discovered the spacing effect and forgetting curve.
- Spaced repetition can retain memory for **5+ years** (Bahrick et al., 1993).
- "Arguably the largest and most robust finding in learning research" (Rohrer, 2009).
- Expanding intervals produce better generalization than constant intervals (Vlach, Sandhofer, & Bjork, 2014).
- Massed practice produces severe overconfidence; spaced practice yields accurate self-prediction (Emeny, Hartwig, & Rohrer, 2021).
- Learning speed varies by student — stronger students learn faster and retain longer. Spaced repetition must calibrate to individual differences (Kyllonen & Tirre, 1988; Zerr et al., 2018).

**FSRS algorithm specifics:**
- Three memory states: Difficulty (D), Stability (S), Retrievability (R).
- Uses power-law forgetting curve (not exponential).
- 21 parameters, trained on hundreds of millions of reviews from ~10,000 users.
- **99.6% superiority over SM-2/Anki** — users do 20-30% fewer reviews for the same retention.
- Mean reversion in difficulty prevents "ease hell" (a chronic SM-2 problem).
- Parameters can be personalized per-user from their review history.
- Target desired retention (e.g., 90%) and FSRS computes optimal intervals.

**Platform implication:** Use ts-fsrs v5 with per-user parameter optimization. Store per-user per-topic FSRS state. Integrate with FIRe credit. Retrievability around 0.85-0.90 is the sweet spot for scheduling reviews (aligns with ZPD/85% rule).

---

## 8. FIRe: Fractional Implicit Repetition

> **Deep dive:** For a comprehensive analysis of 13 implementation approaches with stack rankings, see [`fire-implementation-analysis.md`](fire-implementation-analysis.md).

**Principle:** In hierarchical knowledge, practicing an advanced topic implicitly reviews all its prerequisites. The system should credit these implicit repetitions and select reviews to maximize this "trickle-down" effect.

**Research:**
- Tasks exercising prior knowledge restore memory as effectively as direct repetition (Ausubel, Robbins, & Blake, 1957).
- Novel algorithm developed by Math Academy (Skycak, 2026). Proven at scale: 3,688 topics, thousands of students.
- Math Academy empirical result: most courses can be learned with roughly **only one explicit review per topic on average**.
- The research supports the core claim (implicit practice maintains memory) but does NOT validate any specific credit mechanism — weight-interpolated virtual FSRS reviews, for instance, have no direct empirical basis. The interpolation is our approximation.

**Two distinct mechanisms (often conflated):**

1. **Review elimination (scheduling):** Identify due reviews. Find the smallest set of parent topics whose encompassings cover all due children. Only review parents; children are removed from the review queue. This is the "domino toppling" metaphor — one push covers many. Implemented in `compressReviews()` via greedy set-cover.

2. **Credit propagation (SRS state):** After reviewing a parent, update encompassed children's SRS state so future scheduling reflects the implicit practice. Implemented in `applyFIReCredit()` via virtual FSRS reviews with weight-interpolated stability increases.

These mechanisms interact: set-cover changes which topics are reviewed, and credit propagation changes children's future scheduling. Removing encompassing edges disables BOTH simultaneously, making it hard to isolate each mechanism's contribution.

**Our implementation details:**
- Multi-layer flow: credit travels up to 3 hops, pruned at 0.05 cumulative weight.
- Partial encompassings: only a fraction of credit flows along partial edges.
- **No upward penalty:** An earlier design penalized parent topics when children failed, but this has no research basis in the FIRe model and empirically produced net negative compression for struggling profiles. Prerequisite-based remediation routing handles the "student can't do prerequisites" case instead.
- Freshness gate: if the child topic was recently reviewed (retrievability > 0.9), implicit credit is skipped — the memory is already strong enough that additional reinforcement provides negligible benefit.
- Virtual FSRS reviews: `repeat(card, Rating.Good)` with weight-interpolated stability increase. Updates `stability` and `due` but NOT `lastReview`, `reps`, `difficulty`, `state`, or `lapses`.
- Previous approach (due-date extension without FSRS state update) was abandoned because FSRS interpreted the longer gap as memory decay.

**Empirical findings (simulation, 2026-03-10):**
- FIRe efficiency (reviews per mastered topic) at 15 sessions: **-25% average** — meaning the system achieves FEWER masteries per review with encompassing edges than without.
- Root cause: removing encompassing edges changes both credit propagation AND review ordering (set-cover falls back to most-overdue). The simpler most-overdue ordering produces more masteries at short horizons, suggesting set-cover may be counterproductive at small graph scales.
- Expected to improve at longer horizons (90+ sessions) where stability compounding matters.
- Graph density is a critical factor: our 302 topics at 1.77 edges/topic may not have enough structure for set-cover to outperform simple ordering. MA's 3,688 topics operate in a fundamentally different regime.

**Implementation evolution path (from analysis):**
1. Near term: Test priority ordering without queue elimination (may outperform set-cover at short horizons)
2. Medium term: Retrieval-dependent credit — only eliminate child reviews when post-credit R > 0.85
3. Long term: Content-aware dynamic credit — tag problems with exercised prerequisite skills
4. Eventual: Adaptive weight learning from real user performance data

**Platform implication:** FIRe's value is proportional to encompassing density and session count. At our current scale (302 topics, 15-session evaluation), the benefit is not yet measurable. The architecture is correct for growth — as content expands and simulations run longer, FIRe should show increasing returns. The most faithful implementation would credit only the specific prerequisite skills exercised by each problem, not blanket topic-level credit.

---

## 9. Interleaving and Non-Interference

**Principle:** Mixing practice across different skills (interleaving) produces vastly superior retention vs. practicing one skill repeatedly (blocking). Meanwhile, conceptually similar topics taught in close succession cause interference.

**Research:**
- Interleaving **doubled test scores** (Taylor & Rohrer, 2010). 76% advantage at 1-month delay (Rohrer, Dedrick, & Stershic, 2015).
- Interleaved practice provided "near immunity against forgetting" — 80% to 74% across a 30x increase in test delay.
- 50-90% of multiplication errors are caused by interference from related facts (Campbell, 1987). Spacing related concepts 3 days apart markedly reduced interference (Underwood & Ekstrand, 1967).
- Students rate blocking as more effective even after their own test scores prove the opposite (Kornell & Bjork, 2008). Students mind-wander more during blocked practice (Metcalfe & Xu, 2016).
- Interleaving, spacing, testing, and varying conditions are all "desirable difficulties" — harder in the moment but better for long-term learning (Bjork & Bjork, 2011).

**Two levels:**
- **Macro-interleaving:** Breadth-first traversal through the knowledge graph. Work on topics across multiple areas simultaneously.
- **Micro-interleaving:** Reviews and quizzes mix problem types from different topics.

**Platform implication:** Initial learning uses minimal blocking within lessons (appropriate when first learning). Reviews are fully interleaved across diverse topics. The knowledge graph traversal should be layered/breadth-first, not depth-first.

---

## 10. Self-Explanation Effect

**Principle:** When students pause to explain *why* a solution step works — articulating principles, connecting to prior knowledge — they learn significantly more.

**Research:**
- Students who generated more self-explanations during worked examples significantly outperformed others (Chi et al., 1989).
- Prompts like "Why does this step work?" and "How does this relate to what you already know?" improve understanding (Chi et al., 1994).
- Combining self-explanation prompts with faded worked examples produces medium-to-large effects on both near and far transfer, without additional study time (Atkinson & Renkl).
- Benefits demonstrated across physics, mathematics, programming, and algebra.

**Effective prompts:**
- Identify the principle behind a step
- Compare current step to previous examples
- Predict what comes next before seeing it

**K-5 adaptation:** Simplify prompts: "How did you know to do that?", "What would happen if the number was bigger?", "Can you explain this step to me?"

**Platform implication:** The LLM tutor should ask "Can you explain why we did that?" rather than confirming correctness. During guided practice, include self-explanation prompts at key steps. Use LLM to evaluate self-explanation quality.

---

## 11. Pretesting and Productive Failure

**Principle:** Testing students before instruction — even when they fail — primes the brain for learning and improves subsequent instruction effectiveness. However, the effect varies significantly by age.

**Research:**
- Meta-analysis (Sinha & Kapur, 2021): 53 studies, 12,000+ participants. Problem-solving before instruction showed Hedge's g = 0.36 (moderate effect).
- **Critical K-5 finding:** The meta-analysis found that for younger learners (2nd-5th grade), **instruction-first approaches actually performed better**. Younger children may lack the prior knowledge structures needed to benefit from productive failure.
- Even simple pretesting (multiple choice on unseen material) improves later learning through a "search-set" priming mechanism. Searching memory, even unsuccessfully, makes subsequent encoding more effective.
- Failure must be followed by structured consolidation that explicitly addresses the failure (Kapur, 2016).

**Platform implication:** For K-5, use **lightweight pretesting** (2-3 diagnostic questions) rather than open-ended productive failure. Students who pass skip instruction; students who fail get primed for the lesson. Always follow with explicit instruction. For older students (4th-5th), gradually introduce more exploration with heavy scaffolding.

---

## 12. Confidence Calibration and Metacognition

**Principle:** Students who can accurately judge what they know vs. don't know make better study decisions and learn more. Calibration is trainable.

**Research:**
- Low-performing students consistently overestimate their abilities, leading to ineffective study strategies and reduced effort.
- Calibration training works: item-specific judgments ("How confident are you on THIS problem?") plus performance feedback improve both calibration and performance.
- Massed practice produces severe overconfidence; spaced practice yields accurate self-assessment (Emeny, Hartwig, & Rohrer, 2021).
- Delayed judgments of learning are more accurate than immediate ones.
- High achievers tend toward underconfidence — less harmful but can cause unnecessary review.

**Platform implication:**
- Include confidence rating after each problem. For K-5, binary: "I think I got it right" / "I'm not sure." Graduate to finer scales for older students.
- Track calibration accuracy over time. Show students charts of their calibration.
- Use confidence data to improve FSRS: high confidence + correct = stable; low confidence + correct = needs sooner review; **high confidence + wrong = critical misconception** flagged for remediation.

---

## 13. AI Tutoring and Socratic Method

**Principle:** LLM tutors are most effective when using Socratic questioning to guide students toward understanding rather than providing answers. However, dialogue alone is insufficient — structured scaffolding is essential.

**Research:**
- Socratic AI tutors support development of reflection and critical thinking significantly better than standard chatbots. Students progress from vague help-seeking to sophisticated problem decomposition within 2-3 weeks, with >75% producing substantive reflections.
- Key risk: "dialogue-alone trap" — rich dialogue doesn't always improve test outcomes. Dialogue must be combined with structured guidance.
- Too many/few questions, or questions that are too hard/easy, negatively impact learning. Hint strategy must be calibrated to the student's current understanding.
- Khanmigo biggest challenge: achieving meaningful student engagement. Many interactions showed minimal cognitive effort.
- Strongest outcomes appear when Socratic AI is combined with human mentorship, clear scaffolds, and feedback loops.

**Tutoring protocol:**
1. Ask a guiding question first
2. If student cannot answer, provide a narrowing hint
3. If still stuck, show a partial worked example
4. Only as last resort, explain directly

**K-5 specifics:** Keep LLM interactions short and concrete. 2-3 exchanges max before escalating to a worked example. Monitor for "minimal effort" patterns (short response times, single-word answers).

**Platform implication:** System prompts must enforce Socratic behavior — never give away the answer on first interaction. Use the student's FSRS/graph data to calibrate hint difficulty. If prerequisites are weak, flag for remediation rather than trying to teach through hints.

---

## 14. Targeted Remediation

**Principle:** When students struggle, provide precise support targeted to the specific foundational skill causing difficulty. Never lower the bar; instead, give additional support to clear it.

**Four types (from Math Academy):**

1. **Corrective:** Struggle during task → more questions. Fail a lesson → break + try unrelated topics + re-attempt. Stuck twice at same point → remedial review on key prerequisite. Miss quiz question → immediate remedial review.

2. **Preventative:** Predicted struggle based on low learning speeds of related topics. Post-remediation of earlier topics naturally pre-remediates later ones.

3. **Foundational:** Diagnostic identifies missing below-grade foundations. System fills gaps while allowing progress on unrelated topics (maintains momentum).

4. **Content:** If pass rates on any topic/KP are unacceptably low, fix the content (more scaffolding, intermediate steps), not the standard.

**Platform implication:** Key prerequisite links per knowledge point enable pinpointing the exact skill causing failure. The remediation phase in the learning loop automatically falls back to prerequisite review. FSRS learning speed identifies difficult student-topic pairs for preventative remediation.

---

## 15. Automaticity and Layering

**Principle:** Automaticity — performing foundational skills without conscious effort — frees working memory for higher-order reasoning. It develops through sustained practice and is accelerated by layering new skills on top of prior knowledge.

**Research:**
- "You cannot comprehend a 'big picture' if your mind's energies are hijacked by low-level processing" (Hattie & Yates, 2013).
- Automaticity effectively turns long-term memory into an extension of working memory (Chase & Ericsson, 1982).
- **Retroactive facilitation:** New tasks exercising prior knowledge restore memory to the same extent as identical repetition (Ausubel et al., 1957).
- **Proactive facilitation:** Prior knowledge improves acquisition of new tasks (Arzi, Ben-Zvi, & Ganiel, 1985).
- The most efficient path to automaticity: keep layering more advanced skills rather than drilling the same basic skill in isolation.

**Platform implication:** FSRS + FIRe drive skills toward automaticity through calibrated review. Advanced practice naturally reinforces foundational skills. Don't over-drill basics in isolation — let the knowledge graph provide layering opportunities.

---

## 16. Motivation and Self-Determination Theory

**Principle:** Mastery-based systems naturally support intrinsic motivation by satisfying autonomy, competence, and relatedness needs. Growth mindset framing is important but system design matters more than explicit mindset instruction.

**Research:**
- **Self-Determination Theory** (Deci & Ryan, 2020): three basic needs drive intrinsic motivation:
  - **Autonomy:** choice and ownership over learning
  - **Competence:** feeling of mastery, optimal challenges, growth
  - **Relatedness:** connection to others
- Students with mastery goals (learning-focused) are more intrinsically motivated and resilient than those with performance goals (grade-focused).
- Growth mindset intervention effect is modest (d ≈ 0.10 in large replications) — it's more important to design the system to naturally communicate growth than to explicitly teach mindset.
- Not all extrinsic motivation is harmful. The spectrum: external regulation → introjection → identification → integration. Well-designed rewards can support movement toward internalization.
- Creativity-contingent rewards show sizeable positive effects (g = 0.62) (Byron & Khazanchi, 2012).

**Platform implication:**
- **Autonomy:** Let students choose which unlocked topic to work on. Small choices increase ownership.
- **Competence:** Show progress as mastery count ("47 of 120 topics mastered"), not grades. Frame everything as growth.
- **Relatedness:** Parent/teacher dashboards create support networks.
- Avoid: leaderboards (performance comparison), excessive time pressure. Points and streaks are fine if they emphasize effort and consistency.
- Frame all feedback in growth terms: "Not yet mastered" instead of "Failed."

---

## 17. Habit Formation and Session Design

**Principle:** Regular, short practice sessions are dramatically more effective than infrequent long ones. Habit formation bypasses the need for self-control.

**Research:**
- Prior habits are a stronger predictor of future behavior than goals or intentions (Danner et al., 2008).
- Median 66 days to reach habit plateau, range 18-254 days (Lally et al., 2010). Missing one day doesn't materially affect formation.
- Contextual consistency is critical: same time, same setting. Performing multiple behaviors in response to one cue dilutes the association (Wood & Neal, 2007).
- **5-to-1 praise rule:** ~5 confirmations per criticism produces greatest improvements (Hart & Risley, 1995; Gottman, 1994).

**Session design:**
- Short and frequent beats long and sparse: **30 min × 6 days > 90 min × 2 days**
- Minimum session length: ~20 minutes (below this, context-switching cost outweighs benefits)
- Minimum viable pace: ~15 XP/weekday. Below this, learning efficiency degrades substantially.
- Hard rule: students get opportunity for new lessons at least ~25% of the time (prevent review-only fatigue).

**Platform implication:** Design sessions for 20-30 minute focused sessions. Track streaks/consistency. Provide parent guidance on habit formation. Mix ~60% review + ~40% new content.

---

## 18. Assessment and Quiz Design

**Principle:** Frequent, low-stakes assessments with immediate feedback are the most effective testing strategy. Quiz design must be interleaved, comprehensive, and calibrated to ~85% accuracy.

**Research:**
- Frequent quizzes reduce test anxiety to a medium extent (g = -0.52) while improving performance (g = 0.50) (Yang et al., 2023b).
- 72% of students reported frequent quizzes made them less nervous for exams (Agarwal et al., 2014).
- The **85% Rule**: optimal learning occurs at approximately 85% success / 15% error rate (Wilson et al., 2019, Nature Communications).
- Timed testing is appropriate only after untimed mastery. Misalignment between proficiency and testing demands causes anxiety (Codding, Peltier, & Campbell, 2023).
- **Order of answers matters:** XOXOO (learning occurred) vs OOXOX (regression detected) — the sequence is highly informative, not just the aggregate.

**Quiz design principles (from Math Academy):**
- Cover ALL topics ever learned, not just recent (prevents artificial ease, measures true retention)
- Interleaved across topic types
- Multiple questions per review (robustness against guessing, mastery = consistent correctness)
- Calibrated to 80-85% accuracy range
- Remedial review immediately follows any missed question
- No topic previews (priming inflates scores and robs retrieval practice)

**Platform implication:** Target 85% success rate. If consistently above 90%, increase difficulty. Below 80%, provide more scaffolding. Use short-answer/constructed-response formats for deeper retrieval.

---

## 19. Content Design Guidelines

**Principles for creating effective learning content:**

### Problem Design
- Each knowledge point: introduction → worked example → 2-5 adaptive practice questions
- Active:passive ratio of ~7:1 (7 practice problems per 1 worked example)
- Problems should exercise the target skill plus implicitly review prerequisites
- Use subgoal labeling to group steps into meaningful units
- Include visualizations and diagrams throughout (dual coding)

### Scaffolding Levels
- Full worked example (novice)
- Partially faded example (intermediate — some steps blanked)
- Independent problem with hints available (approaching mastery)
- Independent problem without hints (mastery assessment)

### Content Quality Metrics
- Target 95% first-attempt pass rate, 99% within two attempts
- If pass rates are lower, fix the **content** (more scaffolding, better explanations, split topics) — never lower the standard
- Track performance at topic, knowledge point, and individual question granularity

### Hint Progression
1. Gentle nudge (activate prior knowledge)
2. Specific guidance (narrow the problem)
3. Partial worked solution (show key step)
4. Full worked solution (only after genuine effort)

### Warning Signs of Content Issues
- Failing more than 1 in 10 lessons (expected: 95% first-try pass)
- Consistently below 80% accuracy on reviews
- High hint usage without improvement over time

---

## 20. Key Numbers and Thresholds

Quick reference for development decisions:

| Metric | Value | Source |
|--------|-------|--------|
| Bloom's tutoring effect | 2 sigma (98th percentile) | Bloom, 1984 |
| WM chunk capacity | ~4 items | Cowan, 2001 |
| WM duration | ~20 seconds | Brown, 1958 |
| Mastery learning effect (classroom) | ~0.5-1.0 SD | Kulik et al., 1990 |
| Interleaving advantage (1-month) | 76% | Rohrer et al., 2015 |
| Testing effect (class quizzes) | g = 0.50 | Yang et al., 2021 |
| Test anxiety reduction (frequent quizzes) | g = -0.52 | Yang et al., 2023b |
| Retrieval practice (short-answer) | g = 0.70 | Adesope et al., 2017 |
| FSRS superiority over SM-2 | 99.6% of users | FSRS benchmark |
| FSRS review reduction vs SM-2 | 20-30% fewer reviews | FSRS benchmark |
| Optimal success rate (85% rule) | 85% success / 15% error | Wilson et al., 2019 |
| Lesson first-attempt pass rate target | 95% | Math Academy empirical |
| Two-attempt pass rate target | 99% | Math Academy empirical |
| Active:passive ratio | 7:1 | Math Academy design |
| Knowledge points per lesson | 3-4 | Math Academy design |
| Practice questions per KP | 2-5 (adaptive) | Math Academy design |
| Explicit reviews needed per topic (avg) | ~1 (with FIRe) | Math Academy empirical |
| Multiplication interference errors | 50-90% | Campbell, 1987 |
| Habit formation median | 66 days (range 18-254) | Lally et al., 2010 |
| Praise-to-criticism ratio | 5:1 | Hart & Risley, 1995 |
| Minimum session length | ~20 minutes | Context-switching threshold |
| Optimal session frequency | 30 min × 6 days/week | Math Academy recommendation |
| Review/new content mix | ~60% review / ~40% new | Math Academy design |
| K-5 productive failure | Favors instruction-first | Sinha & Kapur, 2021 |
| Creativity reward effect | g = 0.62 | Byron & Khazanchi, 2012 |
| Growth mindset intervention | d ≈ 0.10 | Large-scale replications |
| Pretesting effect | g = 0.36 | Sinha & Kapur, 2021 |
| Self-explanation + fading | Medium-to-large effect | Atkinson & Renkl |

---

## Appendix: How Our Learning Loop Maps to Research

| Phase | Research Principles | Implementation |
|-------|-------------------|----------------|
| **Pretest** | Pretesting effect, diagnostic routing | 2-3 probe questions. Pass = skip. Fail = primed for instruction. |
| **Instruction** | Worked examples, cognitive load, dual coding, subgoal labeling | Full worked examples with labeled steps and visuals. |
| **Guided practice** | Faded examples, self-explanation prompts, ZPD targeting | Partially faded examples + "Why does this work?" prompts. LLM tutor available. |
| **Independent practice** | Retrieval practice, 85% success targeting, confidence calibration | Solve alone. Rate confidence. Target 85% accuracy. |
| **Spaced review** | FSRS scheduling, FIRe credit, interleaving, retrieval practice | Mixed reviews across topics. Encompassing credit reduces total reviews. |
| **Remediation** | Targeted remediation, key prerequisites, scaffolding reset | Trace prerequisite graph to find specific gap. Return to instruction for that skill. |

---

## Appendix: Full Citation Index

- Adesope, Trevisan & Sundararajan (2017). Rethinking the use of tests: A meta-analysis. *Review of Educational Research*.
- Agarwal et al. (2014). How to use retrieval practice to improve learning.
- Alloway & Alloway (2010). Investigating the predictive roles of working memory and IQ.
- Arzi, Ben-Zvi & Ganiel (1985). Proactive facilitation in learning hierarchies.
- Atkinson & Renkl. Transitioning from studying examples to solving problems.
- Ausubel, Robbins & Blake (1957). Retroactive facilitation in meaningful verbal learning.
- Bahrick et al. (1993). Maintenance of foreign language vocabulary over 5 years.
- Bjork & Bjork (2011). Making things hard on yourself, but in a good way: Desirable difficulties.
- Bloom (1984). The 2 Sigma Problem. *Educational Researcher*.
- Bloom & Sosniak (1981). Talent development vs. schooling.
- Brown (1958). Some tests of the decay theory of immediate memory.
- Byron & Khazanchi (2012). Rewards and creative performance.
- Campbell (1987). Network interference and mental multiplication.
- Catrambone (1995). Aiding subgoal learning: Effects on transfer.
- Chase & Ericsson (1982). Skill and working memory.
- Chase & Simon (1973). Perception in chess.
- Chi et al. (1989). Self-explanations: How students study and use examples.
- Chi et al. (1994). Eliciting self-explanations improves understanding.
- Codding, Peltier & Campbell (2023). Timed testing and proficiency alignment.
- Cowan (2001). The magical number 4 in short-term memory.
- Danner et al. (2008). Habit vs. intention in predicting future behavior.
- Deci & Ryan (2020). Self-determination theory update. *Motivation Science*.
- Deslauriers et al. (2019). Measuring actual learning versus feeling of learning.
- Ebbinghaus (1885). Memory: A Contribution to Experimental Psychology.
- Emeny, Hartwig & Rohrer (2021). Spaced practice and calibration accuracy.
- Freeman et al. (2014). Active learning increases performance in STEM.
- Guskey & Pigott (1988). Mastery learning meta-analysis.
- Halpern & Hakel (2003). Applying the science of learning.
- Hart & Risley (1995). Meaningful differences in everyday experience.
- Hattie & Yates (2013). Visible Learning and the Science of How We Learn.
- Kapur (2016). Examining productive failure. *Educational Psychologist*.
- Kornell & Bjork (2008). Learning concepts and categories: Is spacing the "enemy of induction"?
- Kulik, Kulik & Bangert-Drowns (1990). Effectiveness of mastery learning programs.
- Kyllonen & Tirre (1988). Individual differences in associative learning.
- Lally et al. (2010). How are habits formed? *European Journal of Social Psychology*.
- Metcalfe & Xu (2016). People mind-wander more during massed than spaced inductive learning.
- Miller (1956). The magical number seven, plus or minus two.
- Pedersen et al. (2023). Grade-level distribution of students in classrooms.
- Peterson & Peterson (1959). Short-term retention of individual verbal items.
- Renkl & Atkinson (2004). Structuring the transition from example study to problem solving.
- Rohrer (2009). The effects of spacing and mixing practice problems.
- Rohrer, Dedrick & Stershic (2015). Interleaved practice improves mathematics learning.
- Rowland (2014). The effect of testing versus restudy on retention.
- Sherman (1992). The suppression of mastery learning.
- Sinha & Kapur (2021). When problem solving followed by instruction works. *Review of Educational Research*.
- Skycak (2026). The Math Academy Way. Math Academy, LLC.
- Sweller (2006). The worked example effect and human cognition.
- Sweller et al. (2003). Expertise reversal effect.
- Taylor & Rohrer (2010). The effects of interleaved practice.
- Underwood & Ekstrand (1967). Effects of spacing on interference.
- Vlach, Sandhofer & Bjork (2014). Expanding retrieval and generalization.
- Wilson et al. (2019). The eighty-five percent rule for optimal learning. *Nature Communications*.
- Wood & Neal (2007). A new look at habits and the habit-goal interface.
- Yang et al. (2021). Testing effect meta-analysis across 222 classroom studies.
- Yang et al. (2023b). Practice testing reduces test anxiety meta-analysis.
- Ye et al. FSRS algorithm. open-spaced-repetition project.
- Zerr et al. (2018). Individual differences in spaced retrieval practice.
- Zou et al. (2019). Students are 3-4x more likely to master frontier topics.
