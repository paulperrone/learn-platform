-- Plan 031 Phase 4: user_learning_state table
-- Tracks per-user assessment scheduling state and pacing factor
CREATE TABLE user_learning_state (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  pending_assessment_id TEXT REFERENCES assessment_sessions(id),
  topics_introduced_since_assessment INTEGER NOT NULL DEFAULT 0,
  pacing_factor REAL NOT NULL DEFAULT 1.0,
  last_assessment_at TEXT,
  updated_at TEXT NOT NULL DEFAULT ''
);
