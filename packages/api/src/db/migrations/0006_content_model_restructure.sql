-- Phase 1: Content Model Restructure
-- Separates content from the knowledge graph (topics table) into normalized tables.

CREATE TABLE `instructional_content` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`flavor` text DEFAULT 'classic' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`presentation` text DEFAULT 'individual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`steps_json` text NOT NULL,
	`assets_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ic_topic_idx` ON `instructional_content` (`topic_id`);
--> statement-breakpoint
CREATE INDEX `ic_dimensions_idx` ON `instructional_content` (`topic_id`, `flavor`, `locale`, `presentation`, `version`);
--> statement-breakpoint

CREATE TABLE `assessment_content` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`flavor` text DEFAULT 'classic' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`presentation` text DEFAULT 'individual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`type` text DEFAULT 'text-qa' NOT NULL,
	`difficulty` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`hints_json` text DEFAULT '[]' NOT NULL,
	`solution` text DEFAULT '' NOT NULL,
	`type_properties` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ac_topic_idx` ON `assessment_content` (`topic_id`);
--> statement-breakpoint
CREATE INDEX `ac_dimensions_idx` ON `assessment_content` (`topic_id`, `flavor`, `locale`, `presentation`, `version`);
--> statement-breakpoint
CREATE INDEX `ac_type_idx` ON `assessment_content` (`topic_id`, `type`);
--> statement-breakpoint

-- Migrate existing worked examples from topics.examples_json into instructional_content
INSERT INTO `instructional_content` (`id`, `topic_id`, `flavor`, `locale`, `presentation`, `version`, `title`, `steps_json`, `created_at`, `updated_at`)
SELECT
  json_extract(value, '$.id'),
  json_extract(value, '$.topicId'),
  'classic',
  'en',
  'individual',
  1,
  json_extract(value, '$.title'),
  json_extract(value, '$.steps'),
  datetime('now'),
  datetime('now')
FROM `topics`, json_each(`topics`.`examples_json`)
WHERE `topics`.`examples_json` IS NOT NULL
  AND `topics`.`examples_json` != '[]'
  AND `topics`.`examples_json` != '';
--> statement-breakpoint

-- Migrate existing problems from topics.problems_json into assessment_content
INSERT INTO `assessment_content` (`id`, `topic_id`, `flavor`, `locale`, `presentation`, `version`, `type`, `difficulty`, `question`, `answer`, `hints_json`, `solution`, `created_at`)
SELECT
  json_extract(value, '$.id'),
  json_extract(value, '$.topicId'),
  'classic',
  'en',
  'individual',
  1,
  'text-qa',
  json_extract(value, '$.difficulty'),
  json_extract(value, '$.question'),
  json_extract(value, '$.answer'),
  json_extract(value, '$.hints'),
  json_extract(value, '$.solution'),
  datetime('now')
FROM `topics`, json_each(`topics`.`problems_json`)
WHERE `topics`.`problems_json` IS NOT NULL
  AND `topics`.`problems_json` != '[]'
  AND `topics`.`problems_json` != '';
--> statement-breakpoint

-- Drop old JSON columns from topics
ALTER TABLE `topics` DROP COLUMN `problems_json`;
--> statement-breakpoint
ALTER TABLE `topics` DROP COLUMN `examples_json`;
