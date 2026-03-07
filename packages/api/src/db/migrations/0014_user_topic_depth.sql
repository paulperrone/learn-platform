-- Track per-depth completion for spiral curriculum (context-layered disciplines)
CREATE TABLE user_topic_depth (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id text NOT NULL,
  topic_id text NOT NULL,
  content_depth text NOT NULL,
  completed integer DEFAULT 0 NOT NULL,
  completed_at text,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);
CREATE UNIQUE INDEX utd_user_topic_depth_idx ON user_topic_depth (user_id, topic_id, content_depth);
CREATE INDEX utd_user_topic_idx ON user_topic_depth (user_id, topic_id);
