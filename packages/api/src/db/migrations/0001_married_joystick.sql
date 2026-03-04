ALTER TABLE `learn_sessions` ADD `state_json` text;--> statement-breakpoint
ALTER TABLE `learn_sessions` ADD `updated_at` text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX `learn_sessions_active_idx` ON `learn_sessions` (`user_id`,`ended_at`);