# FIRe: Fractional Implicit Repetition

> **Status:** Disabled as of Plan 022 Phase 4.5 (2026-03-12). Code and encompassing edges preserved for future re-enablement.
>
> **Re-enablement criteria:** Encompassing density ≥ 1.5 edges/topic AND graph ≥ 1,500 topics. Set `FIRE_ENABLED = true` in `packages/api/src/services/srs.ts`.

---

## What is FIRe?

In hierarchical knowledge, practicing an advanced topic implicitly reviews all its prerequisites. FIRe recognizes and credits these implicit repetitions so the SRS system doesn't schedule redundant explicit reviews.

**Example:** When a student practices "Multiplying Two-Digit Numbers," they implicitly review "Multiplying One-Digit Numbers" and "Adding to Two-Digit Numbers." FIRe should credit this and reduce explicit reviews of the simpler topics.

**Research basis:** Ausubel, Robbins, & Blake (1957) — *"Tasks exercising prior knowledge restore memory as effectively as direct repetition."* Math Academy (Skycak, 2026) operationalized this as FIRe across 3,688 topics, achieving roughly one explicit review per topic on average.

---

## Our Implementation History

### Approach 1: Due-Date Advancement (abandoned)
Pulled child due dates closer to now. Paradoxically increased reviews by +20% — topics stayed perpetually "fresh" and never lapsed out of the review cycle.

### Approach 2: Due-Date Extension (abandoned)
Pushed child due dates further out without updating FSRS state. FSRS interpreted longer gaps as memory decay, increasing review frequency. See LEARNINGS.md 2026-03-09.

### Approach 3: Virtual FSRS Reviews + Unconditional Set-Cover (abandoned)
Two mechanisms:
- `applyFIReCredit()`: Virtual `repeat(card, Rating.Good)` on encompassed children with weight-interpolated stability increase
- `compressReviews()`: Greedy set-cover selects parents, unconditionally removes covered children from review queue

**Result:** -16.9% efficiency at 15 sessions. Phase 2.7 isolation showed credit hurt all profiles (-7.9% to -37.8%), ordering hurt fast-learner (-34%).

### Approach 4: Retrieval-Dependent Credit (final implementation before disable)
Added R > 0.85 gate in `compressReviews()` — only eliminate covered children whose retrievability is already high. Low-R children stay in the queue for explicit review.

**Result:** -12.7% efficiency (+4.2pp improvement). Fast-learner: -35.3% → +6.5% (+41.8pp). No regressions at L3. Still net negative overall due to insufficient encompassing density.

### Disable Decision (Plan 022 Phase 4.5)
At 705 topics with ~1.01 encompassing edges/topic, FIRe consistently produces negative efficiency across all evaluation levels and gets worse at longer horizons (-12.6% at L2/30 sessions, -19.8% at L3/60 sessions). The hypothesis that stability compounding would improve at longer horizons was disproven at current density.

---

## Architecture (Preserved)

### Code Locations
- `packages/api/src/services/srs.ts` — `FIRE_ENABLED` constant, `applyFIReCredit()`, `compressReviews()`, `computeFIReCoverage()`, `applyUpwardPenalty()`
- `packages/api/src/routes/review.ts` — calls `applyFIReCredit()` after review
- `packages/api/src/services/session.ts` — calls `applyFIReCredit()` in learning loop
- `packages/api/src/services/group-session.ts` — calls `applyFIReCredit()` for group sessions
- `simulations/src/evaluate.ts` — `computeFIReEfficiency()`, `computeFIReIsolation()`, `--run-fire` flag

### Encompassing Edges
Encompassing edges remain in `graph.json` and are validated by `just validate-content`. They define implicit practice relationships independent of FIRe's runtime behavior. Quality heuristics (density tracking, weight distribution) are retained for future density monitoring.

### Two Mechanisms (Often Conflated)
1. **Credit propagation** (`applyFIReCredit`): After reviewing a parent, update encompassed children's FSRS state via virtual reviews. Multi-hop BFS (3 hops max), 0.05 cumulative weight threshold, freshness gate (R > 0.9 skip).
2. **Review elimination** (`compressReviews`): Greedy set-cover selects parents that maximize encompassing coverage, eliminates covered children with R > 0.85 from the review queue.

When `FIRE_ENABLED = false`:
- `applyFIReCredit()` returns `[]` immediately
- `compressReviews()` uses most-overdue ordering (no set-cover)

### Tests
FIRe-specific tests are gated behind `FIRE_ENABLED`:
- `fire-compression.test.ts` — all describes use `describe.skipIf(!FIRE_ENABLED)`
- `review-compression.test.ts` — set-cover-specific tests use `it.skipIf(!FIRE_ENABLED)`
- `srs.test.ts` — `applyFIReCredit` describe uses `describe.skipIf(!FIRE_ENABLED)`
- `confidence-fsrs-fire.test.ts` — entire file uses `describe.skipIf(!FIRE_ENABLED)`

### Evaluation
- `--run-fire` flag on `evaluate.ts` to explicitly run FIRe paired comparison (disabled by default)
- `--fire-isolation` flag runs 4-mode isolation diagnostic (credit vs ordering attribution)
- `just simulate-fire` runs FIRe-specific adaptive analysis

---

## 13 Implementation Approaches (Stack-Ranked)

### Hybrid "Trueness" Ranking (Science + Program Fit)

| Rank | Approach | Score | Status |
|------|----------|-------|--------|
| 1 | Review Elimination (Pure Set Cover) | 9.5/10 | Tested — negative at low density |
| 2 | Retrieval-Dependent Credit | 9.0/10 | **Implemented** (Approach 4), disabled |
| 3 | Virtual FSRS + Set Cover | 8.0/10 | Abandoned (Approach 3) |
| 4 | Half-Life Extension (FSRS-adapted) | 7.5/10 | Not tested |
| 5 | Content-Aware Dynamic Credit | 9.0/10 | **Next** — tag problems with exercised prereqs |
| 6 | Priority Ordering Only | 6.5/10 | Tested — neutral for 2/3 profiles |
| 7 | Adaptive Weight Learning | 8.5/10 | **Eventual** — needs real user data |
| 8 | Performance-Gated Credit | 7.0/10 | Not tested |
| 9 | Probabilistic Bayesian Credit | 6.0/10 | Not tested |
| 10 | Retrospective Session-Level Credit | 5.5/10 | Not tested |
| 11 | Binary Credit (Full Review Equivalence) | 4.0/10 | Not tested |
| 12 | Due Date Extension Only | 2.0/10 | Abandoned — FSRS-incompatible |
| 13 | Layering Only (No FIRe) | 1.0/10 | Current state (FIRe disabled) |

For detailed descriptions of each approach, see the "13 Hypothetical Implementations" section of the original analysis below.

---

## Key Findings

### Why FIRe Doesn't Work at Current Scale

1. **Insufficient encompassing density.** 705 topics at ~1.01 edges/topic. Math Academy operates at 3,688 topics with much higher density. Below ~1.5 edges/topic, set-cover can't find meaningful parent sets.

2. **Virtual credit delays natural mastery.** Extending child stability delays explicit reviews that would have led to faster mastery through actual practice. The harm accumulates over time.

3. **Measurement confound.** Removing encompassing edges changes both credit AND ordering simultaneously. Phase 2.7 isolation proved credit is the primary harm vector, not ordering.

4. **Efficiency gets worse at longer horizons.** -12.6% at 30 sessions → -19.8% at 60 sessions. Stability compounding hypothesis disproven at current density.

5. **Binary mastery creates a shrinking FIRe pool.** Topics master quickly (stability ≥ 4 days, 3-4 reviews) and exit FIRe's scope. Math Academy keeps topics in SRS with growing intervals.

### What We Learned About FIRe Implementation

- Due-date extension without FSRS state update breaks FSRS (interprets gaps as decay)
- FSRS stability bonuses are ephemeral — overwritten on next `scheduleReview()`
- Upward penalty (penalizing parents on child failure) has no research basis and produces net negative compression for struggling profiles
- Non-Review state virtual reviews produce 0 or negative stability — must filter to `State.Review` only
- Paired comparison at 15 sessions is dominated by butterfly effects — longer horizons needed
- The "total review count" metric punishes FIRe for working correctly — efficiency (reviews per mastered topic) is the right metric

---

## Evolution Path

### Completed
- ~~Due-date advancement~~ — paradoxical review increase
- ~~Due-date extension~~ — FSRS-incompatible
- ~~Unconditional set-cover (Approach 3)~~ — -16.9% efficiency
- ~~Retrieval-dependent credit (Approach 4)~~ — -12.7% efficiency, disabled

### Next (when density reaches 1.5+ edges/topic)
**Content-aware dynamic credit (Approach 5/10):** During problem authoring, tag problems with which prerequisite skills they exercise and at what intensity. Most faithful to Ausubel's finding.

### Eventual (real users)
**Adaptive weight learning (Approach 13):** Start with author weights, let actual child-topic retention rates refine them. Individual transfer differences are real (Kyllonen & Tirre, 1988).

---

## The Gap Between Us and Math Academy

| Dimension | Math Academy | Us |
|-----------|-------------|-----|
| SRS model | Custom half-life (~2x doubling) | FSRS v5 (power-law, 21 params) |
| Encompassing source | Internal, possibly computed | Author-defined in graph.json |
| Graph scale | 3,688 topics, high density | 705 topics, ~1.01 edges/topic |
| Credit mechanism | Half-life extension + queue elimination | Virtual FSRS + retrieval-gated set-cover |
| Validated with users | Yes (thousands of students, years) | Simulation only |
| Result | ~1 explicit review per topic avg | -12.7% efficiency |

---

## Detailed Approach Descriptions

### 1. Review Elimination via Set Cover (Math Academy's Core)
When children are due for review, find the smallest set of parent topics whose encompassings cover all due children. Only explicitly review the parents. Children get implicit credit — marked as reviewed, never explicitly queued. The "toppling an entire arrangement of dominoes with the fewest pushes" metaphor.

### 2. Virtual FSRS Reviews + Set Cover Queue Removal
`compressReviews()`: Greedy set-cover selects parents, removes covered children from the review queue. `applyFIReCredit()`: After successful parent review, applies virtual FSRS `repeat(card, Rating.Good)` to children with weight-interpolated stability increase. Multi-hop BFS (3 hops max), 0.05 cumulative weight threshold, freshness gate (R > 0.9).

### 3. Priority Ordering Only (No Queue Removal)
Use encompassing edges only for ordering reviews (parents first), but never skip child reviews. Double reinforcement — FIRe credit fires, then child gets explicit review too.

### 4. Retrieval-Dependent Credit (Conditional Elimination)
After reviewing a parent and applying virtual credit, compute child's post-credit retrievability. If R > 0.85, skip the child's explicit review. If R is still low, keep it in the queue. Adaptive — only eliminates when implicit credit is genuinely sufficient.

### 5. Half-Life Extension (Math Academy's Actual SRS Model)
MA uses a custom half-life model. When parent is reviewed, child's half-life is extended by a fraction of what a real review would produce. Child's review counter is NOT incremented.

### 6. Binary Credit (Full Review Equivalence)
Only full encompassings (weight = 1.0) receive full credit. Partial encompassings get nothing. Too coarse for our weight granularity.

### 7. Due Date Extension Only (No FSRS State Mutation)
Push child's due date later without modifying FSRS state. Proven FSRS-incompatible in our system.

### 8. Performance-Gated Credit
During parent review, verify the specific problem actually exercised the child skill. Only credit skills demonstrated. Requires per-problem encompassing metadata.

### 9. Layering Only (No Explicit FIRe)
Don't implement FIRe. Trust natural content overlap. Review queues grow linearly.

### 10. Content-Aware Dynamic Credit
Tag each problem with which prerequisite skills it exercises and at what intensity. Credit flows only for skills exercised by the specific problem solved.

### 11. Retrospective Session-Level Credit
After each session, analyze which skills were implicitly practiced across all problems. Session-level aggregation.

### 12. Probabilistic Bayesian Credit
Model P(child practiced | parent reviewed) as a posterior. Credit proportional to posterior probability.

### 13. Adaptive Weight Learning
Start with author-defined weights. Over time, use actual student performance data to learn whether implicit credit is working. Self-calibrating.

---

## Empirical Data Summary

### Phase 2.7 Isolation (15 sessions, 3 profiles)

| Profile | Mode A (Both) | Mode B (Credit Only) | Mode C (Ordering Only) | Mode D (Neither) |
|---------|--------------|---------------------|----------------------|-----------------|
| average-older | 1.67 r/m | — | — | 1.21 r/m |
| misconception-fractions | 1.03 r/m | — | — | 1.01 r/m |
| fast-learner | 2.41 r/m | — | — | 1.78 r/m |

Credit effect: -7.9% to -37.8% (hurts all profiles). Ordering effect: 0% (average, misconception), -34% (fast-learner).

### FIRe Efficiency by Evaluation Level

| Level | Sessions | Efficiency |
|-------|----------|-----------|
| L2 | 30 | -12.6% |
| L3 | 60 (capped) | -19.8% |

### Approach 4 vs Approach 2

| Metric | Before (Approach 2) | After (Approach 4) |
|--------|---------------------|-------------------|
| FIRe efficiency (L2) | -16.9% | -12.7% |
| fast-learner efficiency | -35.3% | +6.5% |
| L3 evaluation | 5P/2W/3F | 6P/1W/3F |
