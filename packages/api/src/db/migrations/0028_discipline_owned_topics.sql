-- Plan 020 Phase 2: Replace subject-owned topics with discipline-owned topics + collections
-- D1 is disposable — this migration drops and recreates tables rather than ALTER

-- Create collections table
CREATE TABLE IF NOT EXISTS `collections` (
  `id` text PRIMARY KEY NOT NULL,
  `primary_discipline_id` text NOT NULL REFERENCES `disciplines`(`id`),
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `kind` text NOT NULL DEFAULT 'grade-band',
  `grade_range` text,
  `display_order` integer NOT NULL DEFAULT 0,
  `visibility` text NOT NULL DEFAULT 'published',
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collections_discipline_idx` ON `collections` (`primary_discipline_id`);
--> statement-breakpoint

-- Create collection_topics join table
CREATE TABLE IF NOT EXISTS `collection_topics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `collection_id` text NOT NULL REFERENCES `collections`(`id`),
  `topic_id` text NOT NULL REFERENCES `topics`(`id`),
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ct_collection_topic_idx` ON `collection_topics` (`collection_id`, `topic_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ct_topic_idx` ON `collection_topics` (`topic_id`);
--> statement-breakpoint

-- Recreate topics with discipline_id instead of subject_id
-- SQLite doesn't support DROP COLUMN, so we recreate the table
CREATE TABLE IF NOT EXISTS `topics_new` (
  `id` text PRIMARY KEY NOT NULL,
  `discipline_id` text NOT NULL REFERENCES `disciplines`(`id`),
  `name` text NOT NULL,
  `description` text NOT NULL,
  `depth` integer NOT NULL DEFAULT 0,
  `grade_level` integer NOT NULL,
  `strand` text,
  `standard_code` text,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
INSERT INTO `topics_new` SELECT `id`, (SELECT `discipline_id` FROM `subjects` WHERE `subjects`.`id` = `topics`.`subject_id`), `name`, `description`, `depth`, `grade_level`, `strand`, `standard_code`, `created_at` FROM `topics`;
--> statement-breakpoint
DROP TABLE `topics`;
--> statement-breakpoint
ALTER TABLE `topics_new` RENAME TO `topics`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `topics_discipline_idx` ON `topics` (`discipline_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `topics_depth_idx` ON `topics` (`depth`);
--> statement-breakpoint

-- Recreate user_discipline_presentation (was user_subject_presentation)
CREATE TABLE IF NOT EXISTS `user_discipline_presentation` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `discipline_id` text NOT NULL REFERENCES `disciplines`(`id`),
  `primary_weight` real NOT NULL DEFAULT 0,
  `intermediate_weight` real NOT NULL DEFAULT 0,
  `standard_weight` real NOT NULL DEFAULT 0,
  `advanced_weight` real NOT NULL DEFAULT 0,
  `center_level` text NOT NULL DEFAULT 'standard',
  `drift_signal` real NOT NULL DEFAULT 0,
  `last_adjusted_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `udp_user_discipline_idx` ON `user_discipline_presentation` (`user_id`, `discipline_id`);
--> statement-breakpoint
DROP TABLE IF EXISTS `user_subject_presentation`;
--> statement-breakpoint

-- Recreate presentation_drift_log with discipline_id
CREATE TABLE IF NOT EXISTS `presentation_drift_log_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `discipline_id` text NOT NULL REFERENCES `disciplines`(`id`),
  `from_weights` text NOT NULL,
  `to_weights` text NOT NULL,
  `from_center` text NOT NULL,
  `to_center` text NOT NULL,
  `trigger` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
DROP TABLE IF EXISTS `presentation_drift_log`;
--> statement-breakpoint
ALTER TABLE `presentation_drift_log_new` RENAME TO `presentation_drift_log`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pdl_user_discipline_idx` ON `presentation_drift_log` (`user_id`, `discipline_id`);
--> statement-breakpoint

-- Recreate diagnostic_sessions with discipline_id
CREATE TABLE IF NOT EXISTS `diagnostic_sessions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES `users`(`id`),
  `anonymous_token` text,
  `discipline_id` text NOT NULL REFERENCES `disciplines`(`id`),
  `status` text NOT NULL DEFAULT 'active',
  `questions_asked` integer NOT NULL DEFAULT 0,
  `questions_correct` integer NOT NULL DEFAULT 0,
  `estimated_frontier_json` text,
  `topic_estimates_json` text,
  `state_json` text,
  `is_taste` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `completed_at` text
);
--> statement-breakpoint
DROP TABLE IF EXISTS `diagnostic_sessions`;
--> statement-breakpoint
ALTER TABLE `diagnostic_sessions_new` RENAME TO `diagnostic_sessions`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `diag_user_idx` ON `diagnostic_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `diag_anon_idx` ON `diagnostic_sessions` (`anonymous_token`);
--> statement-breakpoint

-- Drop subjects table
DROP TABLE IF EXISTS `subjects`;
