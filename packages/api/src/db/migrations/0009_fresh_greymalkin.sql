CREATE TABLE `group_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`facilitator_id` text NOT NULL,
	`type` text NOT NULL,
	`topic_id` text,
	`join_code` text,
	`status` text DEFAULT 'active' NOT NULL,
	`settings_json` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`facilitator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gs_facilitator_idx` ON `group_sessions` (`facilitator_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gs_join_code_idx` ON `group_sessions` (`join_code`);--> statement-breakpoint
CREATE INDEX `gs_status_idx` ON `group_sessions` (`facilitator_id`,`status`);--> statement-breakpoint
CREATE TABLE `group_session_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`group_session_id` text NOT NULL,
	`user_id` text,
	`anonymous_token` text,
	`display_name` text,
	`role` text DEFAULT 'student' NOT NULL,
	`current_topic_id` text,
	`current_phase` text,
	`total_correct` integer DEFAULT 0 NOT NULL,
	`total_attempts` integer DEFAULT 0 NOT NULL,
	`joined_at` text NOT NULL,
	`left_at` text,
	FOREIGN KEY (`group_session_id`) REFERENCES `group_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gsp_session_idx` ON `group_session_participants` (`group_session_id`);--> statement-breakpoint
CREATE INDEX `gsp_user_idx` ON `group_session_participants` (`user_id`);
