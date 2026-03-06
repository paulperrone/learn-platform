-- Add content_depth dimension to instructional and assessment content
-- Values: 'survey' | 'contextual' | 'analytical' | 'synthesis'
-- All existing content is survey-level (the default)

ALTER TABLE `instructional_content` ADD COLUMN `content_depth` text NOT NULL DEFAULT 'survey';
CREATE INDEX `ic_depth_idx` ON `instructional_content` (`topic_id`, `content_depth`);

ALTER TABLE `assessment_content` ADD COLUMN `content_depth` text NOT NULL DEFAULT 'survey';
CREATE INDEX `ac_depth_idx` ON `assessment_content` (`topic_id`, `content_depth`);
