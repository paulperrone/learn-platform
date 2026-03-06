CREATE TABLE `diagnostic_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`anonymous_token` text,
	`subject_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`questions_asked` integer DEFAULT 0 NOT NULL,
	`questions_correct` integer DEFAULT 0 NOT NULL,
	`estimated_frontier_json` text,
	`topic_estimates_json` text,
	`state_json` text,
	`is_taste` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diag_user_idx` ON `diagnostic_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `diag_anon_idx` ON `diagnostic_sessions` (`anonymous_token`);--> statement-breakpoint
CREATE TABLE `onboarding_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`diagnostic_session_id` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_learn_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`anonymous_token` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`state_json` text,
	`updated_at` text NOT NULL,
	`topics_attempted` integer DEFAULT 0 NOT NULL,
	`topics_mastered` integer DEFAULT 0 NOT NULL,
	`reviews_completed` integer DEFAULT 0 NOT NULL,
	`average_accuracy` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_learn_sessions`("id", "user_id", "anonymous_token", "started_at", "ended_at", "state_json", "updated_at", "topics_attempted", "topics_mastered", "reviews_completed", "average_accuracy") SELECT "id", "user_id", "anonymous_token", "started_at", "ended_at", "state_json", "updated_at", "topics_attempted", "topics_mastered", "reviews_completed", "average_accuracy" FROM `learn_sessions`;--> statement-breakpoint
DROP TABLE `learn_sessions`;--> statement-breakpoint
ALTER TABLE `__new_learn_sessions` RENAME TO `learn_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `learn_sessions_user_idx` ON `learn_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `learn_sessions_active_idx` ON `learn_sessions` (`user_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `learn_sessions_anon_idx` ON `learn_sessions` (`anonymous_token`);