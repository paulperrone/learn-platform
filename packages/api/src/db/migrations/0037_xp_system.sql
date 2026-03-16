-- Plan 032 Phase 1: XP system schema changes
-- Add xpEarned to review_log, dailyXp to daily_activity,
-- replace dailyGoalType+dailyGoalTarget with dailyXpGoal in user_preferences

ALTER TABLE review_log ADD COLUMN xp_earned INTEGER NOT NULL DEFAULT 0;

ALTER TABLE daily_activity ADD COLUMN daily_xp INTEGER NOT NULL DEFAULT 0;

-- Replace minutes/problems goal with XP goal
-- Step 1: Add new column
ALTER TABLE user_preferences ADD COLUMN daily_xp_goal INTEGER NOT NULL DEFAULT 20;

-- Step 2: Drop old columns (SQLite doesn't support DROP COLUMN before 3.35.0,
-- but D1 uses a recent SQLite version that does)
ALTER TABLE user_preferences DROP COLUMN daily_goal_type;
ALTER TABLE user_preferences DROP COLUMN daily_goal_target;
