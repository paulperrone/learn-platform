# Learn Platform: System Analysis & Strategic Assessment

> **Date:** 2026-03-06
> **Scope:** Deep review of architecture, implementation, documentation, content system, and strategic positioning.
> **References:** `docs/learning-science.md`, `docs/content-system.md`, `.workflow/plans/reference/008-physicsgraph-learnings.md`, `DECISIONS.md`, `LEARNINGS.md`

---

## Table of Contents

1. [Platform Identity](#platform-identity)
2. [SWOT Analysis](#swot-analysis)
3. [Implementation Gap Priority Map](#implementation-gap-priority-map)
4. [Content System Assessment](#content-system-assessment)
5. [Mission Check](#mission-check)

---

## Prompts

1. ❯ Now I want you to do a deep dive into the learning-science and the content-system documents, as well as an audit of what we have             
  implemented. I want you to think deeply (ultrathink) about the system, what we have setup, and what its strengths vs weaknesses are. I want  
  you to think about the reference 008 physicsgraph document, and our learnings from MathAcademy too. Let's do a deep dive into what we have,  
  where we want to go, and how we can get there. The core mission is to make an incredible learning tool available as freely as possible. Are  
  we on track for that? Are there any big opportunities that we can still capitalize on? Does our content system do a good job of makin it     
  easier to generate content, or do we have too heavy, too vague, or not enough definintion around it? Are we too limited with the survey      
  through synthesis categories, preventing students from getting some of the other categories in their learning as needed or desired (maybe    
  there should be some mixing or blending to make sure that lessons don't feel one note?). Let's take a deep and comprehensive look at this    
  all, assess what we have, where we can improve, what our big limitations, strengths (SWOT style analysis across the board), and what we can  
  do to proceed further in our mission.

2. ❯ I am not worried about content thinness so far. I recognize that it's thin, but my thinking is that once I have the matrix of what I want to     
   deliver, and have tested content (like math foundations, a basic english language arts - maybe starting with preschool and K even, a basic     
  US history, etc) to see if it works within the system, then I will go and generate content across the board. As a solo dev with to be razor      
  thin margins, the goal early on is to make sure I generate the content well once or twice only. Later on I can hone it, but the content gen      
  will be the most expensive part of this for me, especially adding images, potential games, and more into the mix. So I want to focus on all      
  the auxillary and functional stuff primarily. Stripping out the concern on content thinness, help me identify and focus on the rest of what      
  you mentioned above. You have some great notes in there - without losing any context, and while reducing the weighting of content thinness,      
  reformat the above so that I have an up to date understanding of the platform and mission as it stands today and with respect to where I         
  want to go.

---

## Platform Identity

A free, open mastery-learning platform using knowledge graph + FSRS spaced repetition + LLM tutoring to approximate 1-on-1 tutoring at scale. Multi-discipline by design — math, history, languages, and more — with discipline-aware progression models that adapt graph traversal to the subject's nature.

**Core bet:** The architecture (graph + SRS + FIRe + discipline-aware progression) is validated by Math Academy's results. By combining this with LLM-assisted content generation and multi-dimension content serving, a solo dev can build what normally requires a team — then generate content at scale once the system is proven.

**Validation strategy:** Test with thin content across subject types (mastery-gated math, context-layered US history, hybrid ELA) to validate all three progression models before investing in bulk content generation. Content generation is the most expensive operation — do it well once, not iteratively.

---

## SWOT Analysis

### Strengths

**1. Architecture matches the research gold standard.**
Knowledge graph + mastery learning + FSRS + FIRe is what Math Academy uses to achieve 95% first-attempt pass rates. The discipline-aware progression model goes *beyond* Math Academy (which is math-only) — this is genuine differentiation.

**2. The dimension system is a force multiplier for eventual content generation.**
`(flavor x locale x presentation x depth x version)` means you generate content once per dimension combination, not once per student type. When the big content push happens, each topic becomes a matrix that serves every audience from the same graph. This is the right investment for a solo dev planning to generate at scale.

**3. Research grounding is exceptional.**
20 principles with citations, effect sizes, and direct implementation mappings in `learning-science.md`. `content-system.md` provides actionable guidance for content creators (including future LLM prompts). This documentation *is* the content generation playbook.

**4. Pre-generated content with validation catches expensive errors early.**
The platform-medium validation (48% of initial content had physical/verbal instructions) proves the pipeline's value. When generating at scale, these guardrails prevent costly rework.

**5. Edge deployment keeps costs near-zero.**
Cloudflare Workers + D1 = minimal hosting overhead. Critical for a free platform with thin margins.

**6. Multi-subject validation strategy is sound.**
Testing with math (mastery-gated), US history (context-layered), and ELA (hybrid) before bulk generation validates all three progression models with minimal content investment.

---

### Weaknesses

**1. Large documentation-implementation gap.**
The system described in docs is world-class. The system in code is ~40% of that. Key unimplemented features:

| Documented Feature | Status | Impact |
|---|---|---|
| Content selection algorithm (depth + presentation + locale + fallback chain) | **Not implemented.** `getTopicProblems()` does `WHERE topic_id = ?` — ignores all dimensions | **Critical** — the entire dimension system is inert without this |
| User profile -> presentation level mapping | **Not implemented.** `birthYear` in schema, nothing reads it | **Critical** — the late-starter value prop doesn't work |
| Worked example fading (full -> partial -> independent) | **Not implemented.** Always shows full example | **High** — research shows fading is where learning happens |
| Self-explanation capture + LLM evaluation | **Not implemented.** Message says "explain in your own words" but nothing captures it | **High** — g = medium-to-large effect on near+far transfer |
| Hint progression (nudge -> guidance -> partial -> full) | **Not implemented.** Flat array, binary show/hide | **High** — this is the tutoring protocol |
| Spiral curriculum depth tracking | **Not implemented.** No per-topic depth completion in user state | **High** — context-layered subjects can't work without it |
| Confidence slider in session flow | **Schema exists** but no UI collection | **Medium** — calibration data improves FSRS and detects misconceptions |
| Non-interference interleaving | **Not implemented.** Session mix doesn't avoid similar topics back-to-back | **Medium** — 50-90% of multiplication errors are interference-caused |

**2. FIRe is near-inert.**
Only 16 encompassing edges across 71 topics. Single-hop credit only (not multi-layer). Math Academy's key result — "only ~1 explicit review per topic on average" — requires dense encompassing relationships. Without this, FSRS schedules far more reviews than necessary, making sessions feel like flashcard grinding.

**3. Mastery criteria is too strict and uncalibrated.**
Current: 5+ reps, stability > 30 days, **0 lapses ever**. A single careless error resets the entire mastery trajectory. This will frustrate students who genuinely know the material. Math Academy uses consecutive-correct-at-review-state, not zero-lapses-ever.

**4. No knowledge point (KP) granularity.**
Topics like "Multi-Digit Multiplication" are really 3-4 KPs (1-digit multiplier, 2-digit, with regrouping, etc.). Without KP-level granularity, remediation can't pinpoint *which specific skill* is failing — it can only say "you struggled with multiplication" and send you back to the whole topic.

**5. Session service is phase-mechanical, not adaptive.**
The learning loop phases (pretest -> instruction -> guided -> independent) execute in fixed order regardless of student performance signals. No depth blending, no adaptive scaffolding level, no session-level difficulty calibration toward the 85% sweet spot.

---

### Opportunities

**1. Implementing the documented content selection algorithm unlocks the entire dimension system.**
This is the single highest-leverage code change. Once the session service filters by `(topicId, contentDepth, presentation, locale)` with fallback chain, every new content variant generated is immediately served to the right audience. Without it, generating multiple presentation levels is wasted effort because nothing selects them.

**2. Depth blending within sessions solves the "one note" concern.**
A session mixing depths feels alive:
- Survey recall warmup (2-3 questions — quick, builds confidence)
- Main work at current depth frontier
- 1-2 stretch questions at next depth level (priming / productive failure)
- Interleaved review from different topics (non-interference)

This is the difference between "digital flashcards" and "it feels like a tutor." Doesn't require more content — just smarter selection from what exists.

**3. Self-explanation + LLM evaluation is a genuine differentiator.**
Most platforms grade binary right/wrong. Having the LLM evaluate "Why did you do that step?" responses is rare and research-backed (medium-to-large effect on transfer). This also generates valuable data about misconceptions.

**4. Progressive hint reveal creates the tutoring experience.**
The documented 4-step protocol (nudge -> narrow -> partial solution -> full solution) maps directly to expert tutor behavior. The hints already exist in the content as arrays — the session service just needs to reveal them progressively instead of all-or-nothing.

**5. Cross-discipline prerequisites create unique value.**
No major platform models cross-discipline dependencies well. When validating with US history + math, edges like "reading comprehension -> word problems" create learning paths that feel intelligent in ways competitors can't match.

**6. The "late starter" value prop is underserved and powerful.**
A 14-year-old who needs fractions, a 30-year-old relearning math, an adult learning US history from scratch — all need survey depth at age-appropriate presentation. This is a real market gap. Implementing profile -> presentation mapping is the unlock.

**7. Engagement features are quick wins.**
From PhysicsGraph: daily goals, streak visualization, GitHub-style contribution graph, post-lesson graph animations. Low engineering cost, outsized motivation impact. These make the difference between "tried it once" and "daily habit."

---

### Threats

**1. The documentation-reality gap risks becoming permanent.**
Every new feature documented but not implemented increases cognitive overhead. When the content generation push happens, the system needs to *actually work* as documented — content selection, dimension filtering, depth tracking, fading — or generated content sits unused.

**2. "Fix the content, not the standard" needs data infrastructure.**
PhysicsGraph's most impactful change was a full rewrite driven by per-topic accuracy data. The admin analytics (plan 008) are built, but the feedback loop — collect data -> identify weak content -> improve content -> redeploy — needs to be tight and automated. This is how to avoid generating twice.

**3. LLM content generation costs at scale.**
When generating across subjects x presentations x depths, API costs will spike. Efficient prompting (multi-variant per call), caching, and batch generation strategies matter. Plan this before the big push.

**4. Solo dev risk on system complexity.**
8 disciplines, 3 progression models, 5 content dimensions, 6 session phases, 4 remediation types — the combinatorial complexity is high. Each new subject validates different code paths. Thorough testing (157 tests currently) is essential, but integration testing across the full learning loop with real content variants is a gap.

---

## Implementation Gap Priority Map

Ordered by impact-to-effort ratio. Focus: make the system work as designed before the content push.

### Tier 1: Make the Dimension System Actually Work

These are prerequisites for content generation to have any effect beyond single-variant.

1. **Content selection with dimension filtering** — Implement the algorithm from `content-system.md` section 6. Session service queries `WHERE (topicId, contentDepth, presentation, locale)` with fallback chain. This is the keystone — everything else depends on it.

2. **User profile -> presentation level** — Read `birthYear` (or explicit preference) from user profile, map to presentation level. Without this, the system can't differentiate a 6-year-old from a 14-year-old.

3. **Per-topic depth completion tracking** — Add `depthCompleted` to `userTopicState` (or a separate table) so context-layered subjects can track spiral progress. Without this, the spiral curriculum is impossible.

4. **Dimension-aware import** — Update `import-content.ts` to read dimension metadata from content JSON instead of hardcoding `classic/en/individual/survey`. Otherwise generating multi-variant content can't be imported.

### Tier 2: Session Intelligence

These make the learning experience feel like a tutor, not a quiz app.

5. **Progressive hint reveal** — Hints exist as arrays. Reveal them one at a time: first attempt -> no hints, second attempt -> hint 1, third -> hint 2, etc. Minimal code change, significant UX improvement.

6. **Depth blending in sessions** — When building a session mix, include warmup (lower depth), main work (current frontier), and stretch (next depth). Prevents the "one note" feel.

7. **Fix mastery criteria** — Replace 0-lapses-ever with consecutive-correct-at-review. Students who know the material but make occasional careless errors shouldn't lose mastery status.

8. **Non-interference interleaving** — When interleaving review topics, avoid putting related topics back-to-back (add-within-10 followed by add-within-20 causes interference). Group by subject area and alternate.

9. **Worked example fading** — Track how many times a student has seen examples for a topic. First encounter: full example. Second: last step blanked. Third: last two steps blanked. Use FSRS state as the signal.

### Tier 3: The Tutoring Layer

These create the differentiated experience.

10. **Self-explanation prompts + LLM evaluation** — After worked examples and guided practice, ask "Why did this step work?" Send response to LLM for quality evaluation. Flag misconceptions.

11. **Confidence calibration loop** — Collect confidence rating after independent/review problems. Feed into FSRS (high confidence + wrong = critical misconception). Show calibration accuracy over time.

12. **Smarter remediation** — Instead of "go back to the whole prerequisite topic," identify the specific failing KP. Requires either KP-level granularity in the graph or heuristic detection from error patterns.

### Tier 4: Scale Preparation (Before the Content Push)

13. **Multi-variant generation tooling** — Prompt templates that generate standard + intermediate + primary presentation in one pass. Coverage tracking in admin (which dimension combinations exist per topic).

14. **Encompassing edge density** — Add more encompassing relationships to the math graph (and require them for new subjects). FIRe's compression ratio improves dramatically with density.

15. **Answer verification in validation pipeline** — Before generating 1,000+ problems, ensure the pipeline catches wrong answer keys. Run answers through multiple verification methods.

16. **Durable Objects migration** — Session state currently in Worker memory (Map). Will lose state on restart. Not urgent for testing but must happen before real users.

---

## Content System Assessment

### Depth Levels (survey -> synthesis): Right-sized

**For mastery-gated subjects (math, CS):** Mostly unnecessary — the topic graph itself provides depth progression. "Adding fractions" *is* the analytical layer of "adding whole numbers." Most math content will be `survey`. The docs already acknowledge this.

**For context-layered subjects (history, philosophy):** Exactly right and possibly the most innovative aspect of the design. The spiral curriculum where the same topic ("American Revolution") gets revisited at increasing analytical sophistication is pedagogically sound (Bruner's spiral curriculum).

**For flexible subjects (vocabulary):** Irrelevant. Survey is all that's needed.

**Verdict:** The 4-level system is well-designed. No change needed.

### Session Blending: A Session-Service Problem, Not a Content Problem

The depth categories are sufficient. What's missing is session intelligence to *mix* them within a single learning session. A student at "contextual" depth shouldn't be locked into only contextual questions:

```
Ideal session for a student at "contextual" depth on US History:
1. Survey recall warmup: "When was the Declaration of Independence signed?"
2. Contextual main work: "What were two economic causes of the revolution?"
3. Contextual practice: "How did British mercantilism affect colonial merchants?"
4. Analytical stretch: "Read this excerpt from Common Sense. What is Paine arguing?"
5. Survey interleave from different topic: "Who was the first president?"
```

This maps to: interleaving (learning-science.md section 9), pretesting/priming (section 11), the 85% rule (section 18), and the review/new mix (section 17).

### Content Generation Readiness: Four Gaps to Close

The dimension system is the right abstraction. What's missing for content generation readiness:

1. **Import tool** needs to accept dimension metadata from JSON (currently hardcoded)
2. **Generation tools** need multi-variant prompts (one call -> multiple presentations)
3. **Admin dashboard** needs coverage tracking (which cells of the matrix are populated)
4. **Session service** needs to select content by dimensions (the keystone)

All four are captured in Tier 1 of the priority map.

---

## Mission Check: "Incredible Learning Tool, Free as Possible"

**Architecturally: on track.** The foundation supports multi-subject, multi-audience, multi-language learning from a single knowledge graph per subject. The discipline-aware progression is genuine innovation beyond what any current competitor offers.

**Functionally: the dimension system is the keystone.** Once content selection actually filters by dimensions, every new content variant generated immediately reaches the right learner. Without it, content generation at scale would go into a void.

**Strategically: the validate-first approach is correct.** Test with thin content across subject types, close the implementation gaps, then generate at scale. This minimizes expensive rework and ensures the content generation investment lands in a system that can actually use it.

**What to get right before the content push:** Tiers 1 and 2 from the priority map. When sitting down to generate 1,000+ content items across dimensions, the system should already be serving them correctly, tracking depth completion per user, blending depths in sessions, and progressively revealing hints. Otherwise the generation investment is premature.

**The flywheel:** System correctness -> content generation -> student engagement -> usage data -> content improvement. The next phase is about closing the system correctness gap so the flywheel can spin when content arrives.
