-- Per-subject adaptive presentation distribution
CREATE TABLE user_subject_presentation (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id text NOT NULL,
  subject_id text NOT NULL,
  primary_weight real DEFAULT 0 NOT NULL,
  intermediate_weight real DEFAULT 0 NOT NULL,
  standard_weight real DEFAULT 0 NOT NULL,
  advanced_weight real DEFAULT 0 NOT NULL,
  center_level text DEFAULT 'standard' NOT NULL,
  last_adjusted_at text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE UNIQUE INDEX usp_user_subject_idx ON user_subject_presentation (user_id, subject_id);
