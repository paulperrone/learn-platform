ALTER TABLE `review_log` ADD COLUMN `assessment_content_id` text;
--> statement-breakpoint
CREATE INDEX `review_assessment_idx` ON `review_log` (`assessment_content_id`);
