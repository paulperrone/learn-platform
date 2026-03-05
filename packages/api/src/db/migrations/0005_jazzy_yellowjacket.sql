CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tts_enabled` integer DEFAULT true NOT NULL,
	`tts_rate` real DEFAULT 0.9 NOT NULL,
	`tts_voice_name` text,
	`tts_auto_read` integer DEFAULT false NOT NULL,
	`stt_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
