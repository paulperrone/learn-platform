# Plan: Engagement & Habit Features

> **Created:** 2026-03-05T19:42:15Z
> **Completed:** 2026-03-07
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Daily practice goals, streak visualization, progress animations, and estimated completion time. Habit formation research shows consistent cues + visible progress are key drivers of sustained learning. These are user-facing engagement features that don't depend on the content model restructure or pipeline — they work with existing platform data.

**Research basis:** docs/learning-science.md Section 17 (Habit Formation), Section 16 (Motivation/SDT). PhysicsGraph analysis: [reference/008-physicsgraph-learnings.md](./reference/008-physicsgraph-learnings.md), Gamification & Engagement section.

**Key research numbers:**
- Median 66 days to form a habit (Lally et al., 2010)
- 5:1 praise-to-criticism ratio for greatest improvement (Hart & Risley, 1995)
- 30 min x 6 days/week is optimal session cadence
- Prior habits predict future behavior more strongly than goals or intentions (Danner et al., 2008)

## Progress

**Completed:** Phase 1 ✓, Phase 2 ✓, Phase 3 ✓
**In Progress:** —
**Next:** —

---

## Phase 1: Daily Practice Goals & Activity Tracking ✓
**Goal:** Configurable daily targets with prominent progress display. The foundation for all habit features.

1. [x] [IMP] Add `daily_activity` table: userId, date, minutesActive, problemsCompleted, topicsMastered, goalMet. Track activity during learning sessions — update on each problem completion and session end.

2. [x] [IMP] Configurable daily goal: default 20 minutes or N problems (user/parent chooses in settings). Show goal progress prominently on dashboard — progress bar/ring, "12 of 20 minutes today" or "8 of 15 problems today." Visual celebration on goal completion. 5:1 praise framing: emphasize what was accomplished, not what's left.

3. [x] [IMP] Weekly summary view: total active days, total problems, total time, topics mastered this week. Compare to previous week (growth framing, not judgment). Parent-visible via account_links.

4. [x] [TST] Verify: daily activity tracks accurately. Goal progress updates in real-time during sessions. Goal completion triggers celebration. Weekly summary calculates correctly. Timezone handling correct.

**Validation:** Student sees daily progress and gets celebration on completion. Parent can see child's weekly consistency.

---

## Phase 2: Streak & Contribution Visualization ✓
**Goal:** GitHub-style contribution graph and streak counter. Visual proof of consistency is a powerful habit reinforcer.

1. [x] [IMP] Build streak counter: consecutive days meeting daily goal. Display prominently on dashboard. Handle edge cases: timezone, missed single day (research: missing one day doesn't materially affect habit formation — consider "freeze" or gentle messaging rather than streak reset).

2. [x] [IMP] Build contribution graph: GitHub-style grid showing daily activity over past 12 weeks. Color intensity reflects activity level (no activity, below goal, met goal, exceeded goal). Display on dashboard and progress page.

3. [x] [IMP] Streak milestones: acknowledge 7-day, 30-day, 66-day (habit formation median), 100-day streaks. Simple, encouraging messages — not gamified badges. Growth framing: "You've practiced 30 days in a row. Consistency is the most powerful learning strategy."

4. [x] [TST] Verify: streaks count correctly across timezones. Contribution graph renders with real data. Milestones trigger at correct thresholds. Display is responsive.

**Validation:** Student sees their consistency pattern at a glance. Streak counter motivates daily return. Contribution graph shows long-term patterns.

---

## Phase 3: Progress Animations & Completion Estimates ✓
**Goal:** Post-lesson graph animations and time-to-completion estimates. Connect individual sessions to the bigger picture.

1. [x] [IMP] Post-lesson knowledge graph highlight: after mastering a topic, show brief animation highlighting the newly mastered node and the topics it unlocks. Makes progress tangible — "You just mastered Addition Within 20. This unlocks: Addition Within 100, Subtraction Within 20." Uses existing knowledge graph data.

2. [x] [IMP] Estimated completion time: based on remaining topics, current pace (topics mastered per week), and projected review burden, estimate weeks/months to complete the subject. Show on progress page. Update as pace changes. Frame positively: "At your current pace, you'll complete K-5 Math in about 14 weeks."

3. [x] [IMP] Progress milestones: acknowledge 25%, 50%, 75%, 100% completion of a subject. Brief celebration + encouragement. Show progress on dashboard as "47 of 71 topics mastered."

4. [x] [TST] Verify: post-lesson animation fires after topic mastery. Completion estimate is reasonable and updates. Milestones trigger at correct thresholds. Animations are smooth and non-blocking.

**Validation:** Student sees tangible progress after each mastery event. Completion estimate sets expectations. Progress milestones provide periodic encouragement.
