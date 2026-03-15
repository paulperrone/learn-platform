-- Add implicit column to review_log
-- 1 = system-generated credit event (FIRe prereq), 0 = real review
-- Existing rows default to 0 (all prior entries are real reviews).
ALTER TABLE review_log ADD COLUMN implicit INTEGER NOT NULL DEFAULT 0;
