# System Readiness Report

> Generated: 2026-03-08
> Simulation: 10 profiles × 30 sessions × seed 42
> Source: Plan 017 Phases 1-5 simulation data

## Executive Summary

**Gate Decision: FAIL — Plan 017.5 required before content generation (Plan 018) can proceed.**

Of 7 adaptive systems validated, only 2 pass. The remaining 5 require architectural fixes (not just parameter tuning) before the learning engine is ready for content investment. Creating Plan 017.5: System Remediation & Retest.

---

## System Scorecard

| # | System | Status | Criterion | Result |
|---|--------|--------|-----------|--------|
| 1 | 85% Difficulty Targeting | **PASS** | ≥7/10 profiles converge within 30 problems | 7/10 converged |
| 2 | Diagnostic Placement | **WARN** | All profiles within ±1 grade | 9/10 pass (struggling-young ±2) |
| 3 | Presentation Drift | **FAIL** | Moves in expected direction for all profiles | 9/10 correct direction but oscillates; struggling-older drifts wrong way |
| 4 | Mastery Convergence | **FAIL** | Non-struggling profiles reach ≥50% mastery by session 30 | 0/3 non-struggling reach 50%. All profiles lose diagnostic mastery within 1-5 sessions |
| 5 | FIRe Compression | **FAIL** | >30% reduction in explicit reviews | −20.4% avg (FIRe INCREASES reviews) |
| 6 | Remediation Routing | **FAIL** | Routes to correct prerequisite ≥80% of time | 0 events across all profiles |
| 7 | Interleaving Quality | **FAIL** | Same-strand adjacency <10% | 14.3% adjacency, 99% review ratio (target ~60%) |

**Summary: 1 PASS, 1 WARN, 5 FAIL**

---

## Detailed Analysis

### 1. 85% Difficulty Targeting — PASS

The adaptive difficulty system converges to [0.80, 0.90] rolling accuracy for 7/10 profiles:

| Profile | Converged? | At Problem # | Notes |
|---------|-----------|-------------|-------|
| fast-learner | ✓ | #48 | Fastest convergence |
| average-older | ✓ | #135 | Stable |
| misconception-fractions | ✓ | #151 | Stable |
| overconfident | ✓ | #275 | Moderate oscillation |
| underconfident | ✓ | #585 | Slow, high overshoot |
| struggling-older | ✓ | #711 | Slow |
| struggling-young | ✓ | #975 | Very slow, high oscillation |
| strong-young | ✗ | — | Never converges (oscillates) |
| strong-older | ✗ | — | Stays >90% (ability exceeds content difficulty) |
| average-young | ✗ | — | Oscillates around target |

**Assessment:** Core targeting works. Strong profiles that never converge are expected — they exceed the content's difficulty ceiling. No code changes needed.

### 2. Diagnostic Placement — WARN

9/10 profiles placed within ±1 grade of expected ability boundary. One failure: `struggling-young` placed at grade 2 vs expected grade 0 (±2).

**Root causes:**
- **Upward placement bias:** `searchLow` ratchets up on correct answers but can never decrease. A single lucky correct answer permanently raises the floor. 5/10 profiles placed above expected.
- **Bounds lock-in:** Once `searchLow = searchHigh`, both update operations become no-ops. All 10 profiles finish with collapsed bounds.
- **Minimum questions:** All diagnostics stop at exactly 8 questions (MIN_QUESTIONS). No profile goes beyond minimum, suggesting the convergence criterion triggers too easily.
- **One-way presentation seeding:** Diagnostic only shifts presentation DOWN (not up). Strong-young (age 6, advanced ability) stays at primary presentation.

**Severity:** WARN — most placements are acceptable, but struggling students face initial frustration from inflated placement. The session's adaptive difficulty partially compensates.

**Fix scope:** Moderate — needs search bounds refinement, possibly a confidence threshold to prevent premature convergence.

### 3. Presentation Drift — FAIL

9/10 profiles drift in the expected direction initially, but:
- **Oscillation:** Weights oscillate without settling. Only 2/10 profiles stable at session 30.
- **Wrong direction:** `struggling-older` drifts intermediate→standard instead of down to primary.
- **Slow convergence:** Drift rates (0.02-0.04 per problem) are too small relative to accuracy variance.

**Root cause:** Small drift rates + high accuracy variance = oscillation. The drift direction reverses whenever the student hits a lucky/unlucky streak. No dampening or momentum mechanism.

**Fix scope:** Moderate — increase drift rates, add exponential moving average smoothing, add center-level hysteresis to prevent oscillation.

### 4. Mastery Convergence — FAIL (Critical)

This is the most severe issue. No profile achieves meaningful mastery growth through learning:

- **7/10 profiles** lose ALL diagnostic-materialized mastery within 1-5 sessions
- **0/10 profiles** gain new mastery through 30 sessions of learning
- `strong-older` drops from 100% → 0% mastery despite answering correctly on most reviews
- 3 struggling profiles retain mastery only because their low-grade mastered topics are never selected for review

**Root causes:**
1. **Mastery criterion too strict:** Requires `consecutiveCorrectReviews ≥ 3 AND stability ≥ 14 AND state = Review`. With 1-day session intervals, FSRS stability grows slowly. Simulation shows 19-46 topics per profile with ≥2 consecutive correct but not mastered.
2. **Diagnostic materialization gap:** Diagnostic sets `mastered=true` but `consecutiveCorrectReviews=0`. When these topics are served for warmup review, the mastery criterion re-evaluation clears mastery.
3. **No mastery preservation:** The code has `shouldMasterFinal = shouldMaster || state.mastered` which should preserve mastery, but the simulation shows mastery loss — investigation needed to identify the exact code path.

**Fix scope:** Architectural — the mastery criterion, diagnostic materialization, and warmup review interaction all need redesign.

### 5. FIRe Compression — FAIL

FIRe (Fractional Implicit Repetition) produces **negative compression** (-20.4% average):
- With FIRe: 681-731 reviews per profile
- Without FIRe: 501-620 reviews per profile

**Root cause:** FIRe credit keeps encompassed topics "fresh" by advancing their due dates. This prevents them from lapsing and falling out of the review cycle. Paradoxically, topics that would have been naturally forgotten (and thus removed from review burden) are kept alive by FIRe credit, increasing total reviews.

**Fix scope:** Architectural — FIRe credit model needs rethinking. Options: (a) only apply FIRe credit to mastered topics, (b) cap FIRe-maintained freshness so topics can still lapse, (c) use FIRe to reduce review frequency rather than maintain freshness.

### 6. Remediation Routing — FAIL (Critical)

Zero remediation events across ALL 10 profiles in 30 sessions, including `misconception-fractions` which was designed specifically to test remediation.

**Root cause:** Remediation only triggers on failure during `independent` phase specifically. But:
- Review topics skip straight to independent phase and are evaluated as single attempts
- A single failure transitions to remediation, but the trigger conditions (failing independent practice specifically) are rarely met because the session advances topics after each phase
- The misconception-fractions profile fails on fraction topics but those topics may not reach the independent phase in the right conditions

**Fix scope:** Architectural — remediation trigger needs to be based on accumulated failure patterns (e.g., 2+ consecutive failures on a topic across sessions), not single-attempt phase-specific failures.

### 7. Interleaving Quality — FAIL

- **Same-strand adjacency:** 14.3% (target: <10%)
- **Review/new ratio:** 99% review / 1% new (target: ~60/40)
- **Cognitive demand entropy:** ~1.15 bits (reasonable)

**Root cause:** After diagnostic materializes many topics, the session mix is dominated by reviews of those topics. The `getSessionMix` allocates 60% of main slots to reviews and 40% to new topics from the frontier. But when the review queue is large (many due topics), it overwhelms the new-topic allocation. Additionally, interleaving logic doesn't explicitly check strand adjacency.

**Fix scope:** Moderate — add strand-aware shuffle to interleaving, cap review queue contribution, ensure minimum new-topic introduction rate.

---

## Content Quality Signals

Simulation also identified content issues (separate from system behavior):
- **24 topics too hard:** Strong profiles score <70% on these (e.g., coordinate-plane, unit-conversion, multi-digit-multiply)
- **47 difficulty calibration mismatches:** Topics labeled "easy" with actual accuracy 37-49%
- These are content fixes, not system fixes — addressed in Plan 018

---

## Fix Classification

### Parameter Tuning (attempt in this phase)
None — all failing systems require structural changes, not just threshold adjustments.

### Architectural Changes (Plan 017.5)
1. **Mastery convergence** — Redesign mastery criterion, diagnostic materialization, review interaction
2. **FIRe compression** — Rethink credit model to achieve positive compression
3. **Remediation routing** — Add accumulated failure tracking, broaden trigger conditions
4. **Interleaving** — Add strand-aware interleaving, cap review dominance
5. **Presentation drift** — Add smoothing/dampening to prevent oscillation
6. **Diagnostic bounds** — Add refinement phase with bidirectional bounds adjustment

---

## Recommendation

**Create Plan 017.5: System Remediation & Retest** with focused phases for each failing system. Plan 018 (Content Generation) remains blocked until 017.5 completes and all systems pass re-simulation.

Priority order for remediation:
1. **Mastery convergence** (P0) — Without mastery growth, the entire learning loop is broken
2. **Remediation routing** (P0) — Core adaptive feature, completely non-functional
3. **FIRe compression** (P1) — Currently counterproductive, needs model rethink
4. **Interleaving** (P1) — Review dominance prevents new topic introduction
5. **Presentation drift** (P2) — Directionally correct but unstable
6. **Diagnostic bounds** (P2) — Mostly works, refinement for edge cases
