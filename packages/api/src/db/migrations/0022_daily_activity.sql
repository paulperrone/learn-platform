-- Daily activity tracking table
CREATE TABLE `daily_activity` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `date` text NOT NULL,
  `minutes_active` integer DEFAULT 0 NOT NULL,
  `problems_completed` integer DEFAULT 0 NOT NULL,
  `topics_mastered` integer DEFAULT 0 NOT NULL,
  `goal_met` integer DEFAULT 0 NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE UNIQUE INDEX `da_user_date_idx` ON `daily_activity` (`user_id`, `date`);
CREATE INDEX `da_user_goal_idx` ON `daily_activity` (`user_id`, `goal_met`);

-- Add daily goal preferences to user_preferences
ALTER TABLE `user_preferences` ADD COLUMN `daily_goal_type` text DEFAULT 'minutes' NOT NULL;
ALTER TABLE `user_preferences` ADD COLUMN `daily_goal_target` integer DEFAULT 20 NOT NULL;
