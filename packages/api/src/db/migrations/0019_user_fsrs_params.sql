CREATE TABLE `user_fsrs_params` (
	`user_id` text PRIMARY KEY NOT NULL,
	`request_retention` real DEFAULT 0.9 NOT NULL,
	`w_json` text,
	`review_count` integer DEFAULT 0 NOT NULL,
	`computed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
