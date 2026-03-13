# Simulation Maturity Levels

Maturity levels define how many sessions to run and what insights each level reveals. Higher levels are more expensive but surface behaviors invisible at shorter horizons.

## Level Summary

| Level | Sessions | Time | What it reveals | When to run |
|-------|----------|------|----------------|-------------|
| L1 | 5 | ~15s | Diagnostic placement, initial mastery preservation, session mix warmup | Every code change (via `just test`) |
| L2 | 30 | ~2min | Core adaptive behavior — convergence, remediation, interleaving, drift | Per plan phase |
| L3 | 90 | ~5min | Medium-term scaling — mastery plateau, review queue growth, entropy decay | Per plan |
| L4 | 180 | ~10min | Semester-length — long-term retention, review efficiency, topic starvation | Quarterly |
| L5 | 360+ | ~20min | Year-long — pathological behaviors, FSRS parameter drift, gap resilience | Major releases |

## Running Maturity Levels

```bash
# Quick recipes (simulate + evaluate + save baseline)
just evaluate-l1          # 5 sessions, all profiles (~15s)
just evaluate-l2          # 30 sessions, all profiles (~2min)
just evaluate-l3          # 90 sessions, all profiles (~5min)
just evaluate-l4          # 180 sessions, 7 key profiles (~10min)
just evaluate-l5          # 360 sessions, 7 key profiles (~20min)

# Compare across levels (requires at least 2 baselines)
just evaluate-compare-levels

# Manual control
just simulate-l4          # simulate only (7 key profiles × 180 sessions)
just simulate-l5          # simulate only (7 key profiles × 360 sessions)
just evaluate --level l4  # evaluate + save baseline
```

## Baseline Results

### Pre-Expansion Baseline (2026-03-11, 207 math topics, seed=42)

| System | L1 (5s) | L2 (30s) | L3 (90s) | Trend |
|--------|---------|----------|----------|-------|
| Mastery Convergence (P0) | ❌ 5/11 | ✅ 16/11 | ✅ 17/11 | Improves L1→L2, plateaus L2→L3 |
| Mastery Preservation (P0) | ✅ 0.0% | ✅ 0.0% | ✅ 0.0% | Stable |
| Remediation Routing (P0) | ✅ 335 | ✅ 2611 | ✅ 3294 | Scales with session count |
| Difficulty Targeting (P1) | ✅ 23/17 | ✅ 29/17 | ✅ 29/17 | Converges by L2 |
| Review/New Balance (P1) | ❌ 0.44 | ⚠️ 0.73 | ❌ 0.86 | **Degrades** — review queue dominates at L3 |
| Interleaving (P1) | ✅ 0.036 | ✅ 0.081 | ✅ 0.092 | Slight degradation, still PASS |
| FIRe Efficiency (P1) | ⚠️ -25% | ⚠️ -25% | ⚠️ -25% | Stable |
| Presentation Drift (P2) | ❌ 5/14 | ✅ 19/14 | ✅ 17/14 | Needs >5 sessions |
| Diagnostic Placement (P2) | ✅ 27/24 | ✅ 27/24 | ✅ 27/24 | Stable |
| Cognitive Demand Entropy (P2) | ✅ 1.35 | ✅ 1.25 | ✅ 1.14 | Decreasing |
| **Behavioral Match** | 17/29 (59%) | 27/29 (93%) | 27/29 (93%) | Stabilizes at L2 |

### Post-Expansion Baseline (2026-03-12, 705 math topics, seed=42)

*Run after Plan 021 math expansion (207 → 705 topics). L1/L2 baselines not yet updated (run against old graph). L3 is the first post-expansion baseline.*

| System | L3 (90s) post | L3 (90s) pre | Change |
|--------|--------------|-------------|--------|
| Mastery Convergence (P0) | ❌ 3/11 | ✅ 17/11 | **Regression** — target needs recalibration for 705-topic graph |
| Mastery Preservation (P0) | ✅ 0.0% | ✅ 0.0% | Stable |
| Remediation Routing (P0) | ✅ 6517 | ✅ 3294 | Increased (more topics = more remediation opportunities) |
| Difficulty Targeting (P1) | ✅ 29/17 | ✅ 29/17 | Stable |
| Review/New Balance (P1) | ✅ 0.694 | ❌ 0.86 | **Fixed** — 705 topics provides sufficient new content |
| Interleaving (P1) | ❌ 0.141 | ✅ 0.092 | **Regressed** — more repetition; under investigation |
| FIRe Efficiency (P1) | ⚠️ -16.9% | ⚠️ -25% | Slight improvement |
| Presentation Drift (P2) | ✅ 23/14 | ✅ 17/14 | Improved |
| Diagnostic Placement (P2) | ❌ 23/24 | ✅ 27/24 | Slight regression (marginal miss) |
| Cognitive Demand Entropy (P2) | ✅ 1.30 | ✅ 1.14 | Improved — more variety with 705 topics |
| **Behavioral Match** | 8/29 (28%) | 27/29 (93%) | **Regression** — expectations calibrated for 92-topic graph |

### Content Runway Analysis (Post-Expansion L3)

Key finding from per-session analysis: the 705-topic expansion dramatically extended the content ceiling.

| Profile type | Pre-expansion ceiling | Post-expansion ceiling | Change |
|-------------|----------------------|----------------------|--------|
| Strong (strong-older, gifted-middle) | Session 6-8 | Session 67-72 | **+60 sessions** |
| Fast learners | Session 6-8 | Session 90+ | **+80 sessions** |
| Average | Session 6-8 | Session 90+ | **+80 sessions** |
| Struggling | Session 10-15 | Session 89+ | **+70 sessions** |

Strong profiles still exhaust math content around session 70-72. For L4 (180 sessions), strong profiles will shift to review-only mode after session ~70. Multi-subject content (ELA, history) would extend their runway.

### L3 Insights (Post-Expansion)

1. **Review/New Balance fixed.** Pre-expansion FAIL (0.86) → post-expansion PASS (0.694). The 705-topic graph ensures there's always new content to introduce, balancing the SRS review queue.

2. **Content ceiling pushed from session 6 → session 70 for strong profiles.** The primary bottleneck was content volume, not engine behavior. 705 topics provides adequate runway for L3; strong profiles will reach review-only mode around session 70 in L4.

3. **Mastery convergence target needs recalibration.** The "≥50% total mastery by session 30" target was designed for the 207-topic graph. With 705 topics, most profiles can't reach 50% of the full graph in 30 sessions — they're still making genuine progress. Target should be redefined as progress-within-accessible-content, not absolute graph coverage.

4. **Interleaving quality regressed (PASS → FAIL).** Repetition frequency increased from 0.092 to 0.141. Possible cause: with 705 topics and daily FSRS scheduling, more topics fall due within the same short window. Under investigation for Phase 4.

5. **Behavioral match dropped from 27/29 → 8/29.** Profile behavioral expectations (mastery percentages, timing) were calibrated for the old graph. Need full recalibration against the 705-topic baseline.

### Post-Expansion L4/L5 Baseline (2026-03-12, 705 math topics, seed=42, 7 key profiles)

| System | L3 (90s) | L4 (180s) | L5 (360s) | Trend |
|--------|----------|-----------|-----------|-------|
| Mastery Convergence (P0) | ❌ 3/11 | ❌ 4/11 | ❌ 5/11 | Slow improvement — target needs recalibration |
| Mastery Preservation (P0) | ✅ 0.0% | ✅ 0.0% | ✅ 0.0% | Stable across all levels |
| Remediation Routing (P0) | ✅ 6517 | ✅ 6518 | ✅ 6518 | Stable (plateaus as topics max out) |
| Difficulty Targeting (P1) | ✅ 29/17 | ✅ 29/17 | ✅ 29/17 | Stable |
| Review/New Balance (P1) | ✅ 0.694 | ⚠️ 0.715 | ❌ 0.761 | **Degrades** — content exhaustion at L4/L5 |
| Interleaving (P1) | ❌ 0.141 | ❌ 0.137 | ❌ 0.124 | Slight improvement — not yet PASS |
| FIRe Efficiency (P1) | ⚠️ -16.9% | ⚠️ -16.9% | ⚠️ -16.9% | Stable (unchanged) |
| Presentation Drift (P2) | ✅ 23/14 | ✅ 21/14 | ✅ 22/14 | Stable |
| Diagnostic Placement (P2) | ❌ 23/24 | ❌ 23/24 | ❌ 23/24 | Stable (marginal miss) |
| Cognitive Demand Entropy (P2) | ✅ 1.30 | ✅ 1.33 | ✅ 1.32 | Stable |

### L4/L5-Specific Metrics

| Metric | L4 (180s) | L5 (360s) | Notes |
|--------|-----------|-----------|-------|
| Lapse rate after session 100 | 0.91/session | 0.80/session | Decreases slightly — FSRS scheduling improves with more history |
| Reviews/session after session 60 | 4.3 | 4.2 | **No review explosion** — queue stays stable at scale |
| New topic starvation session | 84 | 84 | Consistent across L4/L5 — starvation onset is topology-driven |
| Gap resilience score | 0.092 | 0.092 | **Low** — post-gap recovery rate is only 9% of pre-gap learning rate |

### L4/L5 Insights

1. **No review queue explosion at scale.** Reviews/session stays at 4.1-4.3 from session 60 to session 360. FSRS scheduling is stable — the queue does not unbounded grow. This was the primary concern entering L4/L5.

2. **New topic starvation detected at session 84.** Invisible at L3 (90 sessions, catches it only at the tail). Average across profiles: new topic introduction stalls at session 84. For the 7 L4/L5 profiles, this is dominated by the strong profiles (`strong-highschool`, `fast-learner-older`, `multi-math-strong`) which exhaust available frontier topics earlier. Weaker profiles continue introducing new topics past session 84.

3. **Review/New Balance degrades progressively.** L3 PASS (0.694) → L4 WARN (0.715) → L5 FAIL (0.761). As content is exhausted, the ratio shifts toward pure review. Multi-subject content (ELA, history) would extend the runway; math alone runs out of new content at semester scale for fast learners.

4. **Gap resilience is low (0.092).** After a 14-day gap, the returning-after-gap profile's mastery growth rate is only 9% of its pre-gap rate. This quantifies a known FSRS behavior: large gaps cause many topics to expire simultaneously, creating a catch-up review backlog that crowds out new topic introduction. No pathological behavior — system recovers gracefully — but gap management is an area for future improvement.

5. **Mastery Preservation is perfect.** 0% mastery loss across all levels (L3/L4/L5). No mastered topics regress. This confirms FSRS stability is calibrated correctly for mastery threshold.

6. **No pathological behaviors detected.** All 7 profiles complete 360 sessions without crashes, infinite loops, or scheduling anomalies.

### L3 Insights (Pre-Expansion, for reference)

1. **Review/New Balance degraded from WARN to FAIL at L3** on the small graph. Fixed by expansion.

2. **Mastery plateaus very early** (session 8 avg, 77% final mastery) — content ceiling, not engine failure.

3. **Review scaling stabilized at L3** (4.8 → 4.3 reviews/session). Queue equilibrium reached.

### Behavioral Match

| Level | Pre-expansion | Post-expansion |
|-------|--------------|----------------|
| L1 | 17/29 (59%) | (not yet re-run) |
| L2 | 27/29 (93%) | (not yet re-run) |
| L3 | 27/29 (93%) | 8/29 (28%) — needs recalibration |

Post-expansion behavioral expectations need full recalibration for all profiles. The 705-topic graph changes expected mastery rates, plateau timing, and review patterns.

## What Each Level Tests

### L1 (5 sessions) — Smoke Test
- Diagnostic places students correctly
- Mastery isn't destroyed on first review session
- Session mix produces content at all
- Regression guard: catches broken engines immediately

### L2 (30 sessions) — Core Adaptive Loop
- Mastery converges for non-struggling profiles
- Difficulty targeting finds the [0.80, 0.90] accuracy zone
- Interleaving shuffles strands effectively
- Presentation drifts toward expected level
- Remediation fires for misconception profiles
- FIRe efficiency (15-session paired eval)

### L3 (90 sessions) — Medium-Term Scaling
- Does mastery % plateau? At what session? Content ceiling vs system bug?
- Review queue: growing, stable, or shrinking?
- Difficulty targeting: does accuracy stay calibrated?
- Cognitive demand: does variety decrease over time?
- Review/New balance: does the system introduce new content or get stuck reviewing?

### L4 (180 sessions) — Semester Simulation
- Long-term retention: lapse rate after session 100 (FSRS stability at scale)
- Review efficiency after session 60: is the queue manageable at semester scale?
- New topic starvation: when does the system run out of new topics to introduce?
- Review/New balance: does it degrade as content is exhausted?

### L5 (360 sessions) — Year-Long Simulation
- All L4 behaviors over a full year
- Gap resilience: do mastered topics survive multi-week breaks?
- FSRS parameter drift: do scheduling parameters stay calibrated over 360 sessions?
- Behavioral pathologies: does anything break at extreme session counts?

## Profile Coverage

All 29 profiles run at L1-L3. L4/L5 use 7 key profiles to manage compute cost:
`average-older`, `fast-learner-older`, `struggling-older`, `returning-after-gap`,
`misconception-fractions`, `strong-highschool`, `multi-math-strong`.
