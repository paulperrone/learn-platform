CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `encompassings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_topic_id` text NOT NULL,
	`child_topic_id` text NOT NULL,
	`weight` real DEFAULT 0.5 NOT NULL,
	FOREIGN KEY (`parent_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `encomp_unique_idx` ON `encompassings` (`parent_topic_id`,`child_topic_id`);--> statement-breakpoint
CREATE INDEX `encomp_parent_idx` ON `encompassings` (`parent_topic_id`);--> statement-breakpoint
CREATE TABLE `learn_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`topics_attempted` integer DEFAULT 0 NOT NULL,
	`topics_mastered` integer DEFAULT 0 NOT NULL,
	`reviews_completed` integer DEFAULT 0 NOT NULL,
	`average_accuracy` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `learn_sessions_user_idx` ON `learn_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_cents` real NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `llm_usage_user_idx` ON `llm_usage` (`user_id`);--> statement-breakpoint
CREATE TABLE `prerequisites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_topic_id` text NOT NULL,
	`to_topic_id` text NOT NULL,
	`strength` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`from_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prereq_unique_idx` ON `prerequisites` (`from_topic_id`,`to_topic_id`);--> statement-breakpoint
CREATE INDEX `prereq_to_idx` ON `prerequisites` (`to_topic_id`);--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`rating` integer NOT NULL,
	`confidence` integer,
	`correct` integer NOT NULL,
	`response_ms` integer NOT NULL,
	`phase` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_user_idx` ON `review_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `review_topic_idx` ON `review_log` (`topic_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_idx` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`grade_range` text NOT NULL,
	`topic_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`grade_level` integer NOT NULL,
	`standard_code` text,
	`problems_json` text,
	`examples_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `topics_subject_idx` ON `topics` (`subject_id`);--> statement-breakpoint
CREATE INDEX `topics_depth_idx` ON `topics` (`depth`);--> statement-breakpoint
CREATE TABLE `user_topic_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`due` text NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`mastered` integer DEFAULT false NOT NULL,
	`frontier` integer DEFAULT false NOT NULL,
	`confidence_accuracy` real,
	`last_review` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uts_user_topic_idx` ON `user_topic_state` (`user_id`,`topic_id`);--> statement-breakpoint
CREATE INDEX `uts_user_frontier_idx` ON `user_topic_state` (`user_id`,`frontier`);--> statement-breakpoint
CREATE INDEX `uts_user_due_idx` ON `user_topic_state` (`user_id`,`due`);--> statement-breakpoint
CREATE INDEX `uts_user_mastered_idx` ON `user_topic_state` (`user_id`,`mastered`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`birth_year` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
