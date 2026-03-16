# XP System

XP is an effort-quality currency, separate from mastery. 1 XP ≈ 1 minute of focused effort, scaled by performance.

## Design Principles

- **Mastery = what you know** (knowledge graph + FSRS)
- **XP = effort invested**, weighted by quality
- Placement/diagnostic grants mastery credit but zero XP
- No lifetime total column — all use cases are time-bounded (daily goals, streaks, weekly summaries)

## XP Formula

### Base XP per item

| Item type | XP |
|-----------|-----|
| Lesson practice problem | 3 |
| Independent/review problem | 5 |
| Remediation problem | 4 |
| Worked example completion | 2 |
| Lesson completion (all sections) | 5 |

### Session bonus multiplier

Applied to session base total after all problems:

| Condition | Multiplier | Effect |
|-----------|-----------|--------|
| Perfect (all correct, no hints) | x1.2 | +20% bonus |
| All correct (some hints) | x1.0 | No change |
| Mostly correct (>=75%) | x0.8 | -20% |
| Marginal pass (>=50%) | x0.5 | -50% |
| Poor (<50%) | x0.2 | -80% |

### Rushing penalty

- Response < 3s on non-trivial problem: -1 XP per rushed answer
- Trivial problems (single-tap) exempt
- Session total never goes below 0

### Formula

```
sessionXP = max(0, round(baseTotal * (1 + bonusMultiplier) - rushingPenalty))
```

## Storage

| Scope | Location | Column |
|-------|----------|--------|
| Per-problem | `review_log` | `xp_earned` |
| Per-day | `daily_activity` | `daily_xp` |
| Goal | `user_preferences` | `daily_xp_goal` (default 20) |

## Daily Goal

Single XP target (default 20, range 5-100). No goal type selector — XP is the only metric.

Streak counts consecutive days where `daily_xp > 0` and goal is met.
