-- Add presentation_override to user_preferences
-- Allows users to override the age-based presentation level
-- Values: 'primary' | 'intermediate' | 'standard' | 'advanced' | NULL (use age default)

ALTER TABLE `user_preferences` ADD COLUMN `presentation_override` text;
