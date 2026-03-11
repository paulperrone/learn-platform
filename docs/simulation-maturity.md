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
just evaluate-l1          # 5 sessions, all profiles
just evaluate-l2          # 30 sessions, all profiles
just evaluate-l3          # 90 sessions, all profiles

# Compare across levels (requires at least 2 baselines)
just evaluate-compare-levels

# Manual control
just simulate-l3          # simulate only
just evaluate --level l3  # evaluate + save baseline
```

## Baseline Results (2026-03-11, seed=42)

### System Metrics Across Levels

| System | L1 (5s) | L2 (30s) | L3 (90s) | Trend |
|--------|---------|----------|----------|-------|
| Mastery Convergence (P0) | ❌ 5/11 | ✅ 16/11 | ✅ 17/11 | Improves L1→L2, plateaus L2→L3 |
| Mastery Preservation (P0) | ✅ 0.0% | ✅ 0.0% | ✅ 0.0% | Stable across all levels |
| Remediation Routing (P0) | ✅ 335 | ✅ 2611 | ✅ 3294 | Scales with session count |
| Difficulty Targeting (P1) | ✅ 23/17 | ✅ 29/17 | ✅ 29/17 | Converges by L2, stable at L3 |
| Review/New Balance (P1) | ❌ 0.44 | ⚠️ 0.73 | ❌ 0.86 | **Degrades** — review queue dominates at L3 |
| Interleaving (P1) | ✅ 0.036 | ✅ 0.081 | ✅ 0.092 | Slight degradation, still PASS |
| FIRe Efficiency (P1) | ⚠️ -25% | ⚠️ -25% | ⚠️ -25% | Stable (15-session FIRe eval unchanged) |
| Presentation Drift (P2) | ❌ 5/14 | ✅ 19/14 | ✅ 17/14 | Needs >5 sessions to manifest |
| Diagnostic Placement (P2) | ✅ 27/24 | ✅ 27/24 | ✅ 27/24 | Stable (diagnostic runs once) |
| Cognitive Demand Entropy (P2) | ✅ 1.35 | ✅ 1.25 | ✅ 1.14 | Decreasing — less variety at longer horizons |

### L3 Insights (Not Visible at L2)

1. **Review/New Balance degrades from WARN to FAIL.** At 90 sessions, review queue grows so large that 86% of session time is reviews vs 14% new content. This is a structural issue: once topics enter the SRS, they accumulate review obligations faster than students master them. Potential fix: more aggressive mastery thresholds or review compression.

2. **Cognitive demand entropy decreases.** From 1.35 bits at L1 to 1.14 at L3 (still PASS but trending toward WARN at 0.90). At longer horizons, the system converges on familiar problem types. May need demand-aware selection that boosts underrepresented types.

3. **Mastery plateaus early.** Average non-struggling profile plateaus at session 8 with 77% final mastery at L3. The ceiling is likely content-limited (304 topics across 4 subjects) rather than system-limited — strong profiles exhaust available content by session 8-10.

4. **Review scaling stabilizes at L3.** Reviews per session increase from first to final third at L2 (4.0 → 5.0) but stabilize at L3 (4.8 → 4.3). The review queue reaches a natural equilibrium as mastered topics exit the queue.

### Behavioral Match

| Level | Match Rate |
|-------|-----------|
| L1 | 17/29 (59%) |
| L2 | 27/29 (93%) |
| L3 | 27/29 (93%) |

Behavioral match stabilizes at L2. The 2 non-matching profiles are consistent across L2 and L3.

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

### L4/L5 — Long-Term (Future)
- Long-term retention: do mastered topics stay mastered?
- Review efficiency: does review load decrease as stability grows?
- Topic starvation: does the system stop introducing new content?
- Gap resilience: how quickly do students recover from breaks?

## Profile Coverage

All 29 profiles run at L1-L3. L4/L5 use a subset of 7 key profiles to manage compute cost (see Plan 019 Phase 5).
