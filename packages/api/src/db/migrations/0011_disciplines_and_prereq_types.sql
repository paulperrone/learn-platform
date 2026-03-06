-- Disciplines table: groups subjects by knowledge domain
CREATE TABLE `disciplines` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL,
  `progression_model` text NOT NULL DEFAULT 'mastery-gated',
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);

-- Seed core disciplines
INSERT INTO `disciplines` (`id`, `name`, `description`, `progression_model`, `created_at`) VALUES
  ('math', 'Mathematics', 'Quantitative reasoning, arithmetic, algebra, geometry, calculus, and statistics. Skills compound strictly — each concept builds on prior mastery.', 'mastery-gated', datetime('now')),
  ('ela', 'English Language Arts', 'Reading, writing, grammar, vocabulary, and literary analysis. Grammar and phonics are compounding; comprehension and analysis deepen in layers.', 'mastery-gated', datetime('now')),
  ('science', 'Science', 'Physical, life, and earth sciences. Requires math skills (compounding) layered with conceptual understanding that deepens over time.', 'mastery-gated', datetime('now')),
  ('history', 'History & Social Studies', 'World history, regional histories, civics, geography, and economics. Knowledge deepens through context layers — surveys first, then causes, analysis, and synthesis.', 'context-layered', datetime('now')),
  ('languages', 'World Languages', 'Foreign and second language acquisition. Grammar is compounding; vocabulary and cultural knowledge are more flexible.', 'mastery-gated', datetime('now')),
  ('philosophy', 'Philosophy & Ethics', 'Philosophical traditions, logic, ethics, epistemology. Thinkers respond to predecessors — context enriches but rarely gates understanding.', 'context-layered', datetime('now')),
  ('arts', 'Arts & Music', 'Visual arts, music theory, performance, and appreciation. Technique is compounding; appreciation and history are context-layered.', 'mastery-gated', datetime('now')),
  ('cs', 'Computer Science', 'Programming, algorithms, data structures, systems. Strongly compounding — cannot write algorithms without control flow.', 'mastery-gated', datetime('now'));

-- Add discipline_id to subjects (no FK constraint in ALTER TABLE for SQLite compatibility)
ALTER TABLE `subjects` ADD COLUMN `discipline_id` text NOT NULL DEFAULT 'math';
CREATE INDEX `subjects_discipline_idx` ON `subjects` (`discipline_id`);

-- Add prerequisite type column
ALTER TABLE `prerequisites` ADD COLUMN `type` text NOT NULL DEFAULT 'required';
