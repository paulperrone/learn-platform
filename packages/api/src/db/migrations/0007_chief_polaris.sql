-- Phase 5: Account Links, Teach Sessions, Assignments
-- Adds visibility layer (account_links) and teach data model.

CREATE TABLE `account_links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`type` text NOT NULL,
	`permissions` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `al_from_to_type_idx` ON `account_links` (`from_user_id`,`to_user_id`,`type`);
--> statement-breakpoint
CREATE INDEX `al_to_user_idx` ON `account_links` (`to_user_id`);
--> statement-breakpoint
CREATE INDEX `al_from_user_idx` ON `account_links` (`from_user_id`);
--> statement-breakpoint
CREATE TABLE `teach_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`notes` text,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ts_teacher_idx` ON `teach_sessions` (`teacher_id`);
--> statement-breakpoint
CREATE INDEX `ts_topic_idx` ON `teach_sessions` (`topic_id`);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`share_code` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`max_problems` integer,
	`created_at` text NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assign_code_idx` ON `assignments` (`share_code`);
--> statement-breakpoint
CREATE INDEX `assign_teacher_idx` ON `assignments` (`teacher_id`);
--> statement-breakpoint
CREATE TABLE `assignment_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`user_id` text,
	`anonymous_token` text,
	`question_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ar_assignment_idx` ON `assignment_responses` (`assignment_id`);
--> statement-breakpoint
CREATE INDEX `ar_user_idx` ON `assignment_responses` (`user_id`);
