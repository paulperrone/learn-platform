# Plan 032: XP System

> **Created:** 2026-03-16T04:58:06Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Replace minutes-based activity tracking with quality-weighted XP. 1 XP ≈ 1 minute of focused effort, but scaled by performance — perfect scores earn bonus XP, poor performance earns reduced XP, detected rushing earns negative XP. XP powers daily goals, streaks, queue previews, and the dashboard. Mastery progress stays separate (knowledge graph). Inspired by Math Academy's XP system.

## Design Reference

**Math Academy XP model (from research):**
- 1 XP ≈ 1 minute of focused effort (calibration anchor)
- Perfect score → bonus XP; near-fail → minimal XP; rushing → negative XP
- Daily goal: configurable, recommended 20-40 XP/day
- XP and mastery progress are intentionally separate tracks
- Queue shows XP preview per upcoming item
- Weekly leagues (future — not in this plan)

**XP Formula (proposed):**

```
Base XP per problem:
  - Lesson practice: 3 XP
  - Independent/review problem: 5 XP
  - Remediation problem: 4 XP
  - Worked example completion: 2 XP
  - Lesson completion (all sections): 5 XP

Multipliers:
  - Perfect session (all correct, no hints): ×1.2 bonus
  - All correct (some hints): ×1.0
  - Mostly correct (≥75%): ×0.8
  - Marginal pass (≥50%): ×0.5
  - Poor (<50%): ×0.2

Penalties:
  - Rushing (response < 3s on non-trivial problem): -1 XP per rushed answer
  - No XP total ever goes below 0 for a session

Review vs New:
  - New topic sessions: base XP (learning effort)
  - Review sessions: base XP (retention effort)
  - Both earn XP equally — reviews are real work
```

## Progress

**Completed:** None yet
**In Progress:** —
**Next:** Phase 1

---

## Phase 1: Schema + XP Engine
**Goal:** Add XP columns to DB, define XP formulas, build the core `computeXP()` function

1. [ ] [IMP] Add `xpEarned` (integer) column to `review_log` table — records XP per problem response
2. [ ] [IMP] Add `dailyXp` (integer, default 0) column to `daily_activity` table — replaces minutes as the primary effort metric
3. [ ] [IMP] Add `totalXp` (integer, default 0) column to `user` table (or `user_learning_state`) — lifetime XP accumulator
4. [ ] [IMP] Add `xpGoal` (integer, default 20) to daily goal config — replaces minutes goal
5. [ ] [CFG] Generate and apply D1 migration with `just db-generate` / `just db-migrate`
6. [ ] [IMP] Create `packages/api/src/services/xp.ts` — pure functions: `computeProblemXP(params)`, `computeSessionBonus(results)`, `detectRushing(responseMs, problemType)`, `computeSessionXP(responses)`
7. [ ] [TST] Unit tests for XP engine — verify formula correctness: base XP per type, perfect bonus, rushing penalty, edge cases (empty session, all wrong, all rushed)
8. [ ] [DOC] Add XP formula documentation to `docs/xp-system.md`

**Validation:** `just test` passes, XP engine returns correct values for all test cases

---

## Phase 2: XP Recording + Session Integration
**Goal:** Record XP on every problem response, accumulate per-session, wire into activity service

1. [ ] [IMP] In `session.ts` `respond()`: after grading, call `computeProblemXP()` and store `xpEarned` in `review_log` insert
2. [ ] [IMP] Accumulate session XP in `SessionState` (new `sessionXp` field) — sum of all problem XP + session bonus
3. [ ] [IMP] In `endSession()`: compute session bonus via `computeSessionBonus()`, record total session XP to `daily_activity.dailyXp` and `user_learning_state.totalXp`
4. [ ] [IMP] Update `activity.ts` `recordProblemCompleted()` to also accept and record XP
5. [ ] [IMP] Update `goalProgress` response to include `xpEarned` (session so far) and `xpGoal` alongside existing fields
6. [ ] [TST] Integration tests: complete a session, verify XP recorded in review_log, daily_activity, and user_learning_state

**Validation:** After a learning session, XP values appear in all three tables with correct formula application

---

## Phase 3: Queue XP Previews
**Goal:** Show estimated XP per item in the study queue

1. [ ] [IMP] Add `estimateTopicXP(topicId, isReview)` to XP service — estimate based on problem count (from R2 bundle metadata or content service) × base XP per type
2. [ ] [IMP] Update `GET /learn/queue` response to include `estimatedXp` per review and new topic item
3. [ ] [IMP] Update `queue.vue` to display XP badge on each topic card (e.g., "+15 XP")
4. [ ] [TST] Verify queue endpoint returns reasonable XP estimates

**Validation:** Queue page shows XP estimates next to each topic. Values are proportional to topic size.

---

## Phase 4: Dashboard + Goal Overhaul
**Goal:** Replace minutes-based goals/streaks with XP-based, redesign dashboard to center on XP

1. [ ] [IMP] Update `activity.ts` — `getTodayProgress()` returns XP progress toward XP goal (not minutes)
2. [ ] [IMP] Update `activity.ts` — `getStreakInfo()` counts streak based on days where `dailyXp > 0` (not minutes > 0)
3. [ ] [IMP] Update `activity.ts` — `getWeeklySummary()` includes `totalXp` for the week
4. [ ] [IMP] Update `index.vue` dashboard — daily goal ring shows XP progress, weekly summary shows XP totals, streak counter based on XP days
5. [ ] [IMP] Update `settings.vue` — daily goal configuration uses XP (default 20, range 5-100) instead of minutes/problems
6. [ ] [TST] Verify dashboard displays XP correctly for users with and without learning history

**Validation:** Dashboard shows XP goal ring, XP-based streak, XP weekly summary. Settings allow XP goal configuration.

---

## Phase 5: Session XP Feedback
**Goal:** Show XP earned in real-time during learning sessions

1. [ ] [IMP] Update `respond()` API response to include `xpEarned` for the problem just completed
2. [ ] [IMP] Update `learn.vue` — show XP earned per problem (small "+5 XP" toast or inline indicator after submission)
3. [ ] [IMP] Update `learn.vue` — show running session XP total in the goal progress bar (replace minutes)
4. [ ] [TST] End-to-end: complete problems, verify XP feedback appears, accumulates, and matches dashboard after session

**Validation:** During a session, each problem shows XP earned. Session total is visible. After session, dashboard reflects earned XP.
