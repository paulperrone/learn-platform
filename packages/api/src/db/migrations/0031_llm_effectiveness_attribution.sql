-- LLM effectiveness instrumentation: add attribution columns to llm_usage and review_log

-- llm_usage: track which topic/problem/session each LLM call relates to
ALTER TABLE `llm_usage` ADD COLUMN `topic_id` TEXT;--> statement-breakpoint
ALTER TABLE `llm_usage` ADD COLUMN `problem_id` TEXT;--> statement-breakpoint
ALTER TABLE `llm_usage` ADD COLUMN `session_id` TEXT;--> statement-breakpoint
CREATE INDEX `llm_usage_topic_idx` ON `llm_usage` (`topic_id`);--> statement-breakpoint

-- review_log: track whether LLM was used during this problem attempt
ALTER TABLE `review_log` ADD COLUMN `llm_assisted` INTEGER DEFAULT 0;--> statement-breakpoint
ALTER TABLE `review_log` ADD COLUMN `hint_source` TEXT;
