-- Change presentation default from 'individual' to 'standard' and update existing data
UPDATE assessment_content SET presentation = 'standard' WHERE presentation = 'individual';--> statement-breakpoint
UPDATE instructional_content SET presentation = 'standard' WHERE presentation = 'individual';
