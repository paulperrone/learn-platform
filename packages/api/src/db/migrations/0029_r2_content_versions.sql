CREATE TABLE `topic_content_versions` (
	`topic_id` text PRIMARY KEY NOT NULL REFERENCES topics(id),
	`content_hash` text NOT NULL,
	`bundle_version` integer DEFAULT 1 NOT NULL,
	`problems_count` integer DEFAULT 0 NOT NULL,
	`examples_count` integer DEFAULT 0 NOT NULL,
	`generated_at` text NOT NULL,
	`uploaded_at` text
);
--> statement-breakpoint
ALTER TABLE `review_log` ADD `content_version` text;
