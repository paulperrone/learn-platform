CREATE TABLE `presentation_drift_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`subject_id` text NOT NULL REFERENCES `subjects`(`id`),
	`from_weights` text NOT NULL,
	`to_weights` text NOT NULL,
	`from_center` text NOT NULL,
	`to_center` text NOT NULL,
	`trigger` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `pdl_user_subject_idx` ON `presentation_drift_log` (`user_id`,`subject_id`);
