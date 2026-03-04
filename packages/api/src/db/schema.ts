import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// === Core Tables ===

export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  gradeRange: text("grade_range").notNull(),
  topicCount: integer("topic_count").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  depth: integer("depth").notNull().default(0),
  gradeLevel: integer("grade_level").notNull(),
  standardCode: text("standard_code"),
  problemsJson: text("problems_json"), // JSON array of Problem objects
  examplesJson: text("examples_json"), // JSON array of WorkedExample objects
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("topics_subject_idx").on(table.subjectId),
  index("topics_depth_idx").on(table.depth),
]);

export const prerequisites = sqliteTable("prerequisites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromTopicId: text("from_topic_id").notNull().references(() => topics.id),
  toTopicId: text("to_topic_id").notNull().references(() => topics.id),
  strength: real("strength").notNull().default(1.0),
}, (table) => [
  uniqueIndex("prereq_unique_idx").on(table.fromTopicId, table.toTopicId),
  index("prereq_to_idx").on(table.toTopicId),
]);

export const encompassings = sqliteTable("encompassings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentTopicId: text("parent_topic_id").notNull().references(() => topics.id),
  childTopicId: text("child_topic_id").notNull().references(() => topics.id),
  weight: real("weight").notNull().default(0.5),
}, (table) => [
  uniqueIndex("encomp_unique_idx").on(table.parentTopicId, table.childTopicId),
  index("encomp_parent_idx").on(table.parentTopicId),
]);

// === User Tables ===

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  birthYear: integer("birth_year"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("sessions_token_idx").on(table.token),
  index("sessions_user_idx").on(table.userId),
]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: text("access_token_expires_at"),
  refreshTokenExpiresAt: text("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const userTopicState = sqliteTable("user_topic_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  due: text("due").notNull().$defaultFn(() => new Date().toISOString()),
  state: integer("state").notNull().default(0), // FSRS State enum: New=0, Learning=1, Review=2, Relearning=3
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  mastered: integer("mastered", { mode: "boolean" }).notNull().default(false),
  frontier: integer("frontier", { mode: "boolean" }).notNull().default(false),
  confidenceAccuracy: real("confidence_accuracy"),
  lastReview: text("last_review"),
}, (table) => [
  uniqueIndex("uts_user_topic_idx").on(table.userId, table.topicId),
  index("uts_user_frontier_idx").on(table.userId, table.frontier),
  index("uts_user_due_idx").on(table.userId, table.due),
  index("uts_user_mastered_idx").on(table.userId, table.mastered),
]);

export const reviewLog = sqliteTable("review_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  rating: integer("rating").notNull(),
  confidence: integer("confidence"),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  responseMs: integer("response_ms").notNull(),
  phase: text("phase").notNull(), // SessionPhase
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("review_user_idx").on(table.userId),
  index("review_topic_idx").on(table.topicId),
]);

export const learnSessions = sqliteTable("learn_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  endedAt: text("ended_at"),
  topicsAttempted: integer("topics_attempted").notNull().default(0),
  topicsMastered: integer("topics_mastered").notNull().default(0),
  reviewsCompleted: integer("reviews_completed").notNull().default(0),
  averageAccuracy: real("average_accuracy"),
}, (table) => [
  index("learn_sessions_user_idx").on(table.userId),
]);

export const llmUsage = sqliteTable("llm_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costCents: real("cost_cents").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("llm_usage_user_idx").on(table.userId),
]);
