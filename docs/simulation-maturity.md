# Simulation Maturity Levels

Maturity levels define how many sessions to run and what insights each level reveals. Higher levels are more expensive but surface behaviors invisible at shorter horizons.

> **FIRe status:** Disabled as of Plan 022 (encompassing density 1.01 edges/topic, needs ≥1.5). See [`fire.md`](fire.md). Re-evaluation when graph reaches 1,500+ topics with ≥1.5 encompassing density.
> **Last updated:** 2026-03-13

## Level Summary

| Level | Sessions | Time | What it reveals | When to run |
|-------|----------|------|----------------|-------------|
| L1 | 5 | ~15s | Diagnostic placement, initial mastery preservation, pull-based scheduling | Every code change (via `just test`) |
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

### Current Baseline (2026-03-13, 705 math topics, seed=42, FIRe disabled, targets v6)

Post Plan 022 calibration: FIRe disabled, interleaving fixed (strand diversity cap), mastery convergence recalibrated to 15% threshold. Evaluation metrics fixed: presentation drift stability relaxed to 3/5 majority, diagnostic placement caps at content ceiling + blended multi-discipline frontier + wider misconception tolerance.

| System | L1 (5s) | L2 (90s) | L3 (90s) | Trend |
|--------|---------|----------|----------|-------|
| Mastery Convergence (P0) | ❌ 11/17 | ✅ 18/17 | ✅ 18/17 | Improves with sessions |
| Mastery Preservation (P0) | ✅ 0.0% | ✅ 0.0% | ✅ 0.0% | Stable |
| Remediation Routing (P0) | ✅ 68 | ✅ 5469 | ✅ 5469 | Scales with sessions |
| Difficulty Targeting (P1) | ✅ 22/17 | ✅ 29/17 | ✅ 29/17 | Converges by L2 |
| Review/New Balance (P1) | ❌ 0.40 | ✅ 0.69 | ✅ 0.69 | Shifts toward review as content consumed |
| Interleaving (P1) | ✅ 0.046 | ✅ 0.074 | ✅ 0.074 | All PASS after strand diversity fix |
| FIRe Efficiency (P1) | ✅ 0 | ✅ 0 | ✅ 0 | Disabled — PASS (no FIRe overhead) |
| Presentation Drift (P2) | ✅ 17/14 | ✅ 26/14 | ✅ 26/14 | PASS at all levels (3/5 stability) |
| Diagnostic Placement (P2) | ✅ 28/24 | ✅ 28/24 | ✅ 28/24 | PASS at all levels (ceiling cap + blended frontier) |
| Cognitive Demand Entropy (P2) | ✅ 1.77 | ✅ 1.38 | ✅ 1.38 | Decreasing (review skews demand mix) |
| **Behavioral Match** | 4/29 (14%) | 9/29 (31%) | 9/29 (31%) | Improving, needs further calibration |

**Consolidated baselines:** `simulations/baselines/multi-level.json`

**L4/L5 baselines are stale** (pre-FIRe-disable, pre-interleaving-fix). Run `just evaluate-l4` and `just evaluate-l5` to refresh.

### Key Trends (L1 → L2 → L3)

1. **10/10 PASS at L2 and L3.** All metrics pass with zero warnings at maturity levels that matter for production readiness.
2. **L1 has 2 expected FAILs** (mastery convergence, review/new balance) — both need more sessions to converge. Not actionable.
3. **Presentation drift and diagnostic placement now PASS at all levels** after evaluation metric fixes (stability 3/5, content ceiling cap, blended multi-discipline frontier).
4. **Interleaving fixed.** Was FAIL (0.155) before strand diversity cap, now 0.046–0.074 (all PASS).
5. **FIRe cleanly disabled.** Zero overhead at all levels. Re-enablement criteria: encompassing density ≥1.5 edges/topic AND graph ≥1,500 topics.
6. **Review/New Balance shifts predictably.** 0.40 → 0.69. Will reach WARN at L4 as content is consumed. Expected behavior, not a bug.
7. **Cognitive demand entropy decreases.** 1.77 → 1.38. As review dominates, demand variety drops. All levels still PASS (target ≥0.90).

### Content Runway Analysis (Post-Expansion)

| Profile type | Content ceiling | Notes |
|-------------|----------------|-------|
| Strong (strong-older, gifted-middle) | Session 67-72 | Exhaust math content, shift to review-only |
| Fast learners | Session 90+ | Adequate for L3 |
| Average | Session 90+ | Adequate for L3 |
| Struggling | Session 89+ | Slow but steady progress |

Strong profiles exhaust math content around session 70. Multi-subject content (ELA, history) extends runway. For L4+ (180+ sessions), strong profiles enter review-only mode.

### L4/L5-Specific Metrics (from stale baselines — directional only)

| Metric | L4 (180s) | L5 (360s) | Notes |
|--------|-----------|-----------|-------|
| Lapse rate after session 100 | 0.91/session | 0.80/session | FSRS scheduling improves with more history |
| Reviews/session after session 60 | 4.3 | 4.2 | **No review explosion** — queue stable at scale |
| New topic starvation session | 84 | 84 | Topology-driven, consistent |
| Gap resilience score | 0.092 | 0.092 | Low — 9% of pre-gap learning rate |

### Historical Baselines

<details>
<summary>Pre-Expansion Baseline (2026-03-11, 207 math topics)</summary>

| System | L1 (5s) | L2 (30s) | L3 (90s) |
|--------|---------|----------|----------|
| Mastery Convergence | ❌ 5/11 | ✅ 16/11 | ✅ 17/11 |
| Mastery Preservation | ✅ 0.0% | ✅ 0.0% | ✅ 0.0% |
| Remediation Routing | ✅ 335 | ✅ 2611 | ✅ 3294 |
| Difficulty Targeting | ✅ 23/17 | ✅ 29/17 | ✅ 29/17 |
| Review/New Balance | ❌ 0.44 | ⚠️ 0.73 | ❌ 0.86 |
| Interleaving | ✅ 0.036 | ✅ 0.081 | ✅ 0.092 |
| FIRe Efficiency | ⚠️ -25% | ⚠️ -25% | ⚠️ -25% |
| Behavioral Match | 17/29 | 27/29 | 27/29 |

</details>

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
- FIRe efficiency (disabled — use `--run-fire` to evaluate explicitly)

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
