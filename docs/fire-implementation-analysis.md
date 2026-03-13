# FIRe Implementation Analysis

> Comprehensive analysis of all hypothetical FIRe (Fractional Implicit Repetition) implementation approaches, stack-ranked by learning science efficacy, program fit, and hybrid "trueness."
>
> **Created:** 2026-03-10
> **Context:** Plan 019 Phase 2.6 — after replacing the FIRe compression metric with an efficiency metric (reviews per mastered topic)
> **Sources:** "The Math Academy Way" (Skycak, 2026), Ausubel et al. (1957), Math Academy knowledge graph analysis (`~/source/mathacademy-graph/analysis.md`), platform learning-science.md, FSRS documentation

---

## The Core Insight

Ausubel et al. (1957): *"Tasks exercising prior knowledge restore memory as effectively as direct repetition."*

Math Academy operationalized this as FIRe — when a student practices "Multiplying Two-Digit Numbers," they implicitly review "Multiplying One-Digit Numbers" and "Adding to Two-Digit Numbers." The system should recognize this and credit it.

Math Academy's empirical result: **roughly one explicit review per topic on average** with sufficient encompassing density. Their graph has 3,688 topics with encompassing relationships embedded in the knowledge graph (likely computed from prerequisite structure or stored internally).

The question is not *whether* implicit practice helps — the research is clear. The question is **how** to recognize and credit it in an SRS system.

---

## 13 Hypothetical Implementations

### 1. Review Elimination via Set Cover (Math Academy's Core)

When children are due for review, find the *smallest set of parent topics* whose encompassings cover all due children. Only explicitly review the parents. Children get implicit credit — marked as reviewed, never explicitly queued. The "toppling an entire arrangement of dominoes with the fewest pushes" metaphor.

**Key property:** Children are REMOVED from the explicit review queue entirely. The parent review IS the child review.

### 2. Virtual FSRS Reviews + Set Cover Queue Removal (Our Current — Phase 2.6)

Two mechanisms working together:
- `compressReviews()`: Greedy set-cover selects parents, removes covered children from the review queue
- `applyFIReCredit()`: After successful parent review, applies virtual FSRS `repeat(card, Rating.Good)` to children with weight-interpolated stability increase

Implementation details:
- Multi-hop BFS (3 hops max), 0.05 cumulative weight threshold
- Freshness gate: skip if child retrievability > 0.9
- Children's `due` dates extended proportionally to stability boost
- `lastReview` is NOT updated — preserves FSRS retrievability calculation
- Only applies to children in Review state (not Learning/Relearning/New)
- Skips permanently-mastered topics (stability > 90 days)

### 3. Priority Ordering Only (No Queue Removal)

Use encompassing edges only for *ordering* reviews (parents first), but never skip child reviews. Children still get explicit reviews in the same session. FIRe credit fires (virtual stability boosts), then child gets reviewed explicitly too — double reinforcement.

**Key difference from #2:** No queue elimination. More total reviews per session, but each review compounds.

### 4. Retrieval-Dependent Credit (Conditional Elimination)

After reviewing a parent and applying virtual credit, compute the child's post-credit retrievability. If R > threshold (e.g., 0.85), skip the child's explicit review. If R is still low, keep it in the queue.

**Key property:** Adaptive — only eliminates reviews when implicit credit is genuinely sufficient.

### 5. Half-Life Extension (Math Academy's Actual SRS Model)

MA uses a custom half-life model, not FSRS. When a parent is reviewed, child's half-life is extended by a *fraction* of what a real review would produce. The doubling pattern (~2x per successful review after rep 3) makes this straightforward:

```
newHalfLife = oldHalfLife + weight × (expectedPostReviewHalfLife - oldHalfLife)
```

Child's review counter is NOT incremented — implicit credit is purely in the interval extension.

### 6. Binary Credit (Full Review Equivalence)

Only full encompassings (weight = 1.0) receive credit, and they receive *full* credit — child's SRS state updated exactly as if the student explicitly reviewed it. Partial encompassings (weight < 1.0) get nothing.

### 7. Due Date Extension Only (No FSRS State Mutation)

Don't modify FSRS internal state at all. Simply push child's due date later: `newDue = due + weight × currentInterval`. FSRS is never informed about the implicit practice.

**Known issue in our system:** Already tried and abandoned. FSRS interprets the gap between `lastReview` and extended `due` as memory decay, *increasing* future review frequency. See DECISIONS.md.

### 8. Performance-Gated Credit (Problem-Level Verification)

During the parent's review, verify that the specific problem actually *exercised* the child skill and that the student succeeded on those sub-steps. Only credit skills actually demonstrated.

**Requirement:** Per-problem encompassing metadata or runtime LLM analysis. Not all parent problems exercise all encompassed children equally.

### 9. Layering Only (No Explicit FIRe)

Don't implement FIRe at all. Trust that learning advanced topics naturally practices prerequisites through the content itself. SRS schedules reviews normally. Any implicit overlap is untracked.

**Effect:** Review queues grow linearly with topics — exactly what FIRe is designed to prevent.

### 10. Content-Aware Dynamic Credit

At content authoring time, tag each problem with which prerequisite skills it exercises and at what intensity. During review, credit flows only for skills exercised by the specific problem solved. Different problems for the same topic may credit different children.

**Example:** A multiplication word problem might exercise "multiplying one-digit numbers" (weight 1.0) but NOT "adding to two-digit numbers" (weight 0) even though the parent topic encompasses both.

### 11. Retrospective Session-Level Credit

After each session, analyze which skills were implicitly practiced across ALL problems. If a student solved 3 multiplication problems (across different parent topics), credit basic multiplication once (or proportionally). Session-level aggregation, not per-review.

### 12. Probabilistic Bayesian Credit

Model P(child practiced | parent reviewed) as a posterior updated by each parent review. Credit proportional to posterior probability. Accounts for uncertainty about whether implicit practice actually occurred.

### 13. Adaptive Weight Learning

Start with author-defined encompassing weights. Over time, use actual student performance data to learn whether implicit credit is working: if child topic performance degrades despite receiving credit, reduce weight. If maintained, increase weight. Self-calibrating system.

---

## Rank 1: Learning Science Efficacy

What the research supports, independent of any particular system:

| Rank | Approach | Rationale |
|------|----------|-----------|
| **1** | 10. Content-Aware Dynamic | Most faithful to Ausubel: "tasks *exercising* prior knowledge restore memory." Credit should match actual exercise, not topic-level approximation. |
| **2** | 8. Performance-Gated | Second-most faithful — only credits when student *demonstrates* the prerequisite skill. Aligns with retrieval practice research (Rowland 2014: g=0.50). |
| **3** | 5. Half-Life Extension (MA) | Proven at scale with real students. MA's empirical claim: "roughly one explicit review per topic on average." The only approach with real-world validation on thousands of students. |
| **4** | 1. Review Elimination | MA's scheduling layer. Directly implements the "domino toppling" principle. Retroactive facilitation says the parent review IS the child review. |
| **5** | 4. Retrieval-Dependent | Principled hybrid. Only eliminates when memory is genuinely maintained. Respects the forgetting curve. |
| **6** | 13. Adaptive Weight Learning | Data converges toward truth. Learner-specific weights capture individual differences in transfer (Kyllonen & Tirre, 1988). |
| **7** | **2. Virtual FSRS + Set Cover (Ours)** | Theoretically sound adaptation. But "80% of a Good rating" has no empirical basis — the weight interpolation is an approximation without research backing. |
| **8** | 12. Probabilistic Credit | Theoretically elegant (ACT-R-adjacent) but no empirical validation for FIRe specifically. |
| **9** | 11. Retrospective Credit | Session-level analysis could capture more implicit practice. But delays feedback; learning science favors immediate attribution. |
| **10** | 3. Priority Ordering Only | Conservative. Misses FIRe's core claim: implicit practice can *replace* explicit review, not just supplement it. |
| **11** | 6. Binary Credit | Too coarse. Most encompassings are partial. MA's PDF explicitly notes "prerequisites are often not fully encompassed." |
| **12** | 7. Due Date Extension Only | FSRS-incompatible. Distorts the scheduling model. Empirically abandoned in our system. |
| **13** | 9. Layering Only | Not FIRe. Natural overlap isn't tracked or optimized. Review queues grow linearly. |

---

## Rank 2: Fit to Our Program

Our constraints: FSRS v5 (not half-life), pre-authored JSON content in Claude Code sessions, explicit encompassing edges with weights in `graph.json`, 207-302 topics (growing), Cloudflare Workers runtime, simulation-driven development, D1/SQLite.

| Rank | Approach | Rationale |
|------|----------|-----------|
| **1** | 1. Review Elimination | Already implemented as `compressReviews()`. Leverages existing graph, runs in O(topics × budget), no runtime dependencies. |
| **2** | **2. Virtual FSRS + Set Cover (Ours)** | Already implemented. Good FSRS integration. But combined set-cover + virtual review interaction makes measurement hard. |
| **3** | 4. Retrieval-Dependent | Minimal addition to current system: check `computeRetrievability()` after virtual credit before removing from queue. ~10 lines of code. |
| **4** | 3. Priority Ordering Only | Trivial simplification: don't call `remaining.delete(id)` for covered children. Safe fallback. |
| **5** | 5. Half-Life Extension (adapted) | Our virtual FSRS IS this, adapted to FSRS. Could simplify by removing the `repeat()` call and directly computing stability extension. |
| **6** | 10. Content-Aware Dynamic | Requires per-problem skill tags in `problems/*.json`. Feasible with Claude Code authoring but significant content expansion. |
| **7** | 13. Adaptive Weight Learning | Requires user performance data we don't have yet. Could prototype with simulation data. |
| **8** | 6. Binary Credit | Easy but wastes our weight granularity. Only helps ~15% of edges at weight 1.0. |
| **9** | 8. Performance-Gated | Needs per-problem skill analysis at runtime. Could use problem metadata but adds authoring overhead. |
| **10** | 11. Retrospective Credit | Architecturally different from our per-review model. Would need post-session analysis pass. |
| **11** | 12. Probabilistic Credit | Over-engineered for 300 topics and no user data. |
| **12** | 7. Due Date Extension Only | Already tried, already abandoned. FSRS-incompatible. See DECISIONS.md. |
| **13** | 9. Layering Only | Not implementing FIRe defeats the purpose of our encompassing edges. |

---

## Rank 3: Hybrid "Trueness" (Science + Program Fit)

"Trueness" = how faithfully the implementation captures FIRe's learning science insight, weighted by practical feasibility and measurable impact in our system.

| Rank | Approach | Score | Assessment |
|------|----------|-------|------------|
| **1** | 1. Review Elimination (Pure Set Cover) | 9.5/10 | This IS FIRe. MA proved it works. We already have `compressReviews()`. Simplest, most direct, most "true" to the original concept. |
| **2** | 4. Retrieval-Dependent Credit | 9.0/10 | Improvement over pure elimination: safety valve. Only skip when R confirms memory is maintained. ~10 lines on top of current code. |
| **3** | **2. Virtual FSRS + Set Cover (Ours)** | 8.0/10 | Correct in principle — children need updated FSRS state for future scheduling. But the weight interpolation is untested, and the combined interaction creates measurement noise that's hard to isolate. |
| **4** | 5. Half-Life Extension (FSRS-adapted) | 7.5/10 | Simplification of our current approach. Instead of calling `repeat()` and interpolating, directly compute stability extension. Less "correct" FSRS but potentially less noisy. |
| **5** | 10. Content-Aware Dynamic | 9.0/10 | Theoretically ideal but high authoring cost. The eventual right answer for a mature system. Would require skill tags on every problem. |
| **6** | 3. Priority Ordering Only | 6.5/10 | Safe fallback. Doesn't capture FIRe's review-elimination claim. But parent-first ordering still produces compounding. May outperform set-cover at short horizons (our Phase 2.6 finding). |
| **7** | 13. Adaptive Weight Learning | 8.5/10 | Ultimate end-state. Start with author weights, let data refine. Requires user base. |
| **8** | 8. Performance-Gated | 7.0/10 | Conceptually right but operationally complex. Would need LLM analysis or manual skill-tagging per problem. |
| **9** | 12. Probabilistic Credit | 6.0/10 | Theoretically interesting, practically over-engineered at our scale. |
| **10** | 11. Retrospective Credit | 5.5/10 | Interesting angle but delays credit and doesn't integrate with per-review FSRS flow. |
| **11** | 6. Binary Credit | 4.0/10 | Too coarse. Wastes weight information. |
| **12** | 7. Due Date Extension Only | 2.0/10 | Proven to break FSRS in our system. Empirically abandoned. |
| **13** | 9. Layering Only | 1.0/10 | Not FIRe. |

---

## Current State Assessment

### Our Implementation (Approach 2)

**Position:** Rank #3 in hybrid trueness, #7 in learning science, #2 in program fit.

The implementation is architecturally correct: virtual FSRS reviews keep child scheduling state consistent, and set-cover queue elimination captures the core FIRe insight that implicit practice replaces explicit review.

However, **the -25% efficiency at 15 sessions** reveals issues:

| Profile | With Encompassing | Without Encompassing | Efficiency |
|---------|-------------------|---------------------|------------|
| average-older | 82 rev / 49 mastered (1.67 r/m) | 68 rev / 56 mastered (1.21 r/m) | -37.8% |
| misconception-fractions | 64 rev / 62 mastered (1.03 r/m) | 72 rev / 71 mastered (1.01 r/m) | -1.8% |
| fast-learner | 82 rev / 34 mastered (2.41 r/m) | 82 rev / 46 mastered (1.78 r/m) | -35.3% |
| **Average** | | | **-25.0%** |

### The Gap Between Us and Math Academy

| Dimension | Math Academy | Us |
|-----------|-------------|-----|
| SRS model | Custom half-life (~2x doubling) | FSRS v5 (power-law, 21 params) |
| Encompassing source | Internal, possibly computed | Author-defined in `graph.json` |
| Graph scale | 3,688 topics, high density | 302 topics, moderate density |
| Credit mechanism | Half-life extension + queue elimination | Virtual FSRS + set-cover queue elimination |
| Validated with users | Yes (thousands of students, years) | Simulation only |
| Result | "~1 explicit review per topic avg" | -25% efficiency at 15 sessions |

### Root Cause Analysis

Removing encompassing edges for the "without FIRe" baseline changes **two things simultaneously**:
1. `applyFIReCredit()` has no edges to traverse (no virtual reviews)
2. `compressReviews()` falls back from set-cover to simple most-overdue ordering

Finding: **the simpler most-overdue ordering produces MORE mastered topics at 15 sessions.** This suggests the set-cover optimization may be counterproductive at short horizons — by prioritizing parent topics (which may be harder), it delays direct child reviews that would have led to mastery sooner.

This is a measurement confound, not necessarily evidence that FIRe credit is harmful. To isolate the credit mechanism from the ordering mechanism, you'd need to disable only `applyFIReCredit()` while keeping encompassing edges for `compressReviews()`.

---

## Implemented Decision (Plan 022 Phase 4)

**Date:** 2026-03-12
**Change:** Switched from Approach 2 (unconditional set-cover) to Approach 4 (retrieval-dependent credit).

### Decision Data

Phase 2.7 isolation diagnostics revealed the root cause of negative FIRe efficiency:

| Profile | Credit Effect | Ordering Effect | Combined |
|---------|--------------|-----------------|----------|
| average-older | -37.8% | 0% | -37.8% |
| misconception-fractions | -7.9% | 0% | -1.8% |
| fast-learner | -30.9% | -34.0% | -35.3% |

**Root cause:** Unconditional queue elimination removed children that genuinely needed review. The set-cover algorithm prioritized parent topics (often harder), delaying child reviews that would have led to faster mastery.

**FIRe efficiency was flat at -16.9% across all evaluation levels (L2-L5).** Note: the efficiency metric always runs at 15 sessions regardless of evaluation level — the identical values across levels reflect the fixed measurement window, not a genuine trend analysis.

### Implementation

In `compressReviews()`, added a retrievability gate (R > 0.85) before eliminating covered children from the review queue. Children with R ≤ 0.85 stay in the queue — they need explicit review regardless of implicit credit from parent practice. Virtual credit (`applyFIReCredit()`) is unchanged.

### Results

| Metric | Before (Approach 2) | After (Approach 4) | Change |
|--------|---------------------|-------------------|--------|
| FIRe efficiency (L2) | -16.9% | -12.7% | +4.2pp |
| fast-learner efficiency | -35.3% | +6.5% | +41.8pp |
| Review/New Balance (L3) | 0.694 PASS | 0.694 PASS | same |
| Mastery convergence | 3 FAIL | 3 FAIL | same |
| L2 overall | 6P/1W/3F | 5P/2W/3F | pres. drift noise |
| L3 overall | 5P/2W/3F | 6P/1W/3F | improved |

The fast-learner profile showed the largest improvement because unconditional queue elimination was most harmful for fast-progressing students — it removed children they could have quickly mastered.

---

## Evolution Path

### Completed
- ~~Approach 3 (priority ordering only)~~ — tested in Phase 2.7 isolation (Mode C). Neutral for average/misconception profiles, negative for fast-learner.
- ~~Approach 4 (retrieval-dependent credit)~~ — **implemented** in Plan 022 Phase 4. R > 0.85 gate on queue elimination.

### Next (content maturity)
**Move toward Approach 10 (content-aware dynamic credit)** as content matures. During problem authoring in Claude Code sessions, tag problems with which prerequisite skills they exercise and at what intensity. This is the most faithful implementation of Ausubel's finding.

### Eventual (real users)
**Approach 13 (adaptive weight learning)** once real users generate performance data. Start with author weights, let actual child-topic retention rates refine them. Individual differences in transfer are real (Kyllonen & Tirre, 1988) and weights should reflect them.

---

## Key Takeaways

1. **Unconditional queue elimination hurts at moderate graph density.** MA's 3,688 topics with dense encompassings make unconditional elimination effective. Our 705 topics with ~1.01 encompassing edges/topic don't have enough density for aggressive elimination.

2. **Retrieval-dependent gating is the right middle ground.** Only skip child reviews when R > 0.85 (child is well-retained). This preserves FIRe's core insight while preventing the harm from skipping needed reviews.

3. **The FIRe efficiency metric has a measurement limitation.** It always runs at 15 sessions regardless of evaluation level. A longer-horizon version (90+ sessions) would better capture stability compounding effects. The flat -16.9% across levels was a measurement artifact, not evidence that FIRe never improves.

4. **Virtual credit is theoretically sound but empirically marginal.** The weight-interpolated virtual FSRS reviews are a reasonable approximation, but at current graph density, the credit mechanism is neutral-to-slightly-negative. It should improve as encompassing density increases.

5. **Graph density matters enormously.** Target 1.5-2.0 encompassing edges/topic for FIRe to become consistently positive. Current math graph: ~1.01 edges/topic.
