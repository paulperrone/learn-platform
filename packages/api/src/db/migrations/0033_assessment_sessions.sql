CREATE TABLE `assessment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope_json` text NOT NULL,
	`config_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`questions_asked` integer DEFAULT 0 NOT NULL,
	`questions_correct` integer DEFAULT 0 NOT NULL,
	`raw_score` real,
	`strand_scores_json` text,
	`standard_scores_json` text,
	`questions_json` text NOT NULL,
	`time_limit_minutes` integer,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assessment_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assessment_session_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`topic_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`response_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`assessment_session_id`) REFERENCES `assessment_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `as_user_idx` ON `assessment_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `as_status_idx` ON `assessment_sessions` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `ar_session_idx` ON `assessment_responses` (`assessment_session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ar_session_qnum_idx` ON `assessment_responses` (`assessment_session_id`,`question_number`);
