import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// === Core Tables ===

export const disciplines = sqliteTable("disciplines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  progressionModel: text("progression_model").notNull(), // 'mastery-gated' | 'context-layered' | 'flexible'
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  primaryDisciplineId: text("primary_discipline_id").notNull().references(() => disciplines.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  kind: text("kind").notNull().default("grade-band"), // 'grade-band' | 'strand' | 'remediation' | 'exam-prep' | 'thematic'
  gradeRange: text("grade_range"),
  displayOrder: integer("display_order").notNull().default(0),
  visibility: text("visibility").notNull().default("published"), // 'published' | 'draft' | 'archived'
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("collections_discipline_idx").on(table.primaryDisciplineId),
]);

export const collectionTopics = sqliteTable("collection_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: text("collection_id").notNull().references(() => collections.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("ct_collection_topic_idx").on(table.collectionId, table.topicId),
  index("ct_topic_idx").on(table.topicId),
]);

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  depth: integer("depth").notNull().default(0),
  gradeLevel: integer("grade_level").notNull(),
  strand: text("strand"),
  standardCode: text("standard_code"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("topics_discipline_idx").on(table.disciplineId),
  index("topics_depth_idx").on(table.depth),
]);

// assessment_content and instructional_content tables removed — content now lives in R2 bundles.
// See docs/r2-content-architecture.md for the migration rationale.

export const topicContentVersions = sqliteTable("topic_content_versions", {
  topicId: text("topic_id").primaryKey().references(() => topics.id),
  contentHash: text("content_hash").notNull(),
  bundleVersion: integer("bundle_version").notNull().default(1),
  problemsCount: integer("problems_count").notNull().default(0),
  examplesCount: integer("examples_count").notNull().default(0),
  lessonsCount: integer("lessons_count").notNull().default(0),
  generatedAt: text("generated_at").notNull(),
  uploadedAt: text("uploaded_at"),
});

export const prerequisites = sqliteTable("prerequisites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromTopicId: text("from_topic_id").notNull().references(() => topics.id),
  toTopicId: text("to_topic_id").notNull().references(() => topics.id),
  strength: real("strength").notNull().default(1.0),
  type: text("type").notNull().default("required"), // 'required' | 'recommended' | 'enriching'
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
  managedBy: text("managed_by"),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("ban_reason"),
  banExpires: text("ban_expires"),
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
  activeOrganizationId: text("active_organization_id"),
  impersonatedBy: text("impersonated_by"),
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

// === Organization Tables (Better-Auth organization plugin) ===

export const organizations = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("org_slug_idx").on(table.slug),
]);

export const members = sqliteTable("member", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("member_org_idx").on(table.organizationId),
  index("member_user_idx").on(table.userId),
]);

export const invitations = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  inviterId: text("inviter_id").notNull().references(() => users.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(),
  status: text("status").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("invitation_org_idx").on(table.organizationId),
]);

// === Learning State Tables ===

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
  consecutiveCorrectReviews: integer("consecutive_correct_reviews").notNull().default(0),
  consecutiveIncorrectReviews: integer("consecutive_incorrect_reviews").notNull().default(0),
  confidenceAccuracy: real("confidence_accuracy"),
  lastReview: text("last_review"),
}, (table) => [
  uniqueIndex("uts_user_topic_idx").on(table.userId, table.topicId),
  index("uts_user_frontier_idx").on(table.userId, table.frontier),
  index("uts_user_due_idx").on(table.userId, table.due),
  index("uts_user_mastered_idx").on(table.userId, table.mastered),
]);

export const userTopicDepth = sqliteTable("user_topic_depth", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  contentDepth: text("content_depth").notNull(), // 'survey' | 'contextual' | 'analytical' | 'synthesis'
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("utd_user_topic_depth_idx").on(table.userId, table.topicId, table.contentDepth),
  index("utd_user_topic_idx").on(table.userId, table.topicId),
]);

export const reviewLog = sqliteTable("review_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  assessmentContentId: text("assessment_content_id"),
  rating: integer("rating").notNull(),
  confidence: integer("confidence"),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  responseMs: integer("response_ms").notNull(),
  phase: text("phase").notNull(), // SessionPhase
  hintsUsed: integer("hints_used"),
  misconception: integer("misconception", { mode: "boolean" }),
  contentVersion: text("content_version"),
  llmAssisted: integer("llm_assisted", { mode: "boolean" }).default(false),
  hintSource: text("hint_source"), // 'static' | 'llm' | null
  scaffolding: text("scaffolding"), // ReviewScaffolding: 'none' | 'example' | 'hints-only' | 'solution' | null
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("review_user_idx").on(table.userId),
  index("review_topic_idx").on(table.topicId),
  index("review_assessment_idx").on(table.assessmentContentId),
]);

export const learnSessions = sqliteTable("learn_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  anonymousToken: text("anonymous_token"),
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  endedAt: text("ended_at"),
  stateJson: text("state_json"),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
  topicsAttempted: integer("topics_attempted").notNull().default(0),
  topicsMastered: integer("topics_mastered").notNull().default(0),
  reviewsCompleted: integer("reviews_completed").notNull().default(0),
  averageAccuracy: real("average_accuracy"),
}, (table) => [
  index("learn_sessions_user_idx").on(table.userId),
  index("learn_sessions_active_idx").on(table.userId, table.endedAt),
  index("learn_sessions_anon_idx").on(table.anonymousToken),
]);

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id),
  ttsEnabled: integer("tts_enabled", { mode: "boolean" }).notNull().default(true),
  ttsRate: real("tts_rate").notNull().default(0.9),
  ttsVoiceName: text("tts_voice_name"),
  ttsAutoRead: integer("tts_auto_read", { mode: "boolean" }).notNull().default(false),
  sttEnabled: integer("stt_enabled", { mode: "boolean" }).notNull().default(true),
  presentationOverride: text("presentation_override"), // 'primary' | 'intermediate' | 'standard' | 'advanced' — overrides age-based default
  dailyGoalType: text("daily_goal_type").notNull().default("minutes"), // 'minutes' | 'problems'
  dailyGoalTarget: integer("daily_goal_target").notNull().default(20), // 20 minutes or N problems
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const userFsrsParams = sqliteTable("user_fsrs_params", {
  userId: text("user_id").primaryKey().references(() => users.id),
  requestRetention: real("request_retention").notNull().default(0.9),
  wJson: text("w_json"), // JSON array of custom FSRS weights (null = use defaults)
  reviewCount: integer("review_count").notNull().default(0), // cached count for threshold check
  computedAt: text("computed_at"), // when params were last optimized
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const userDisciplinePresentation = sqliteTable("user_discipline_presentation", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id),
  primaryWeight: real("primary_weight").notNull().default(0),
  intermediateWeight: real("intermediate_weight").notNull().default(0),
  standardWeight: real("standard_weight").notNull().default(0),
  advancedWeight: real("advanced_weight").notNull().default(0),
  centerLevel: text("center_level").notNull().default("standard"),
  driftSignal: real("drift_signal").notNull().default(0),
  lastAdjustedAt: text("last_adjusted_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("udp_user_discipline_idx").on(table.userId, table.disciplineId),
]);

export const presentationDriftLog = sqliteTable("presentation_drift_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id),
  fromWeights: text("from_weights").notNull(), // JSON: {primary, intermediate, standard, advanced}
  toWeights: text("to_weights").notNull(), // JSON: {primary, intermediate, standard, advanced}
  fromCenter: text("from_center").notNull(),
  toCenter: text("to_center").notNull(),
  trigger: text("trigger").notNull(), // 'center_shift' | 'level_emerged' | 'level_dropped'
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("pdl_user_discipline_idx").on(table.userId, table.disciplineId),
]);

export const llmModelConfig = sqliteTable("llm_model_config", {
  tier: text("tier").primaryKey(), // 'cheap' | 'capable'
  modelId: text("model_id").notNull(),
  costInputPerM: real("cost_input_per_m").notNull(), // cents per million input tokens
  costOutputPerM: real("cost_output_per_m").notNull(), // cents per million output tokens
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const llmUsage = sqliteTable("llm_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costCents: real("cost_cents").notNull(),
  purpose: text("purpose").notNull(),
  topicId: text("topic_id"),
  problemId: text("problem_id"),
  sessionId: text("session_id"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("llm_usage_user_idx").on(table.userId),
  index("llm_usage_topic_idx").on(table.topicId),
]);

// === Account Links (visibility/tracking layer) ===

export const accountLinks = sqliteTable("account_links", {
  id: text("id").primaryKey(),
  fromUserId: text("from_user_id").notNull().references(() => users.id),
  toUserId: text("to_user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'parent' | 'teacher' | 'tutor' | 'guardian'
  permissions: text("permissions"), // JSON
  status: text("status").notNull().default("active"), // 'active' | 'pending' | 'revoked'
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("al_from_to_type_idx").on(table.fromUserId, table.toUserId, table.type),
  index("al_to_user_idx").on(table.toUserId),
  index("al_from_user_idx").on(table.fromUserId),
]);

// === Teach Data Model ===

export const teachSessions = sqliteTable("teach_sessions", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  endedAt: text("ended_at"),
  notes: text("notes"),
}, (table) => [
  index("ts_teacher_idx").on(table.teacherId),
  index("ts_topic_idx").on(table.topicId),
]);

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  topicId: text("topic_id").notNull().references(() => topics.id),
  shareCode: text("share_code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  maxProblems: integer("max_problems"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at"),
}, (table) => [
  uniqueIndex("assign_code_idx").on(table.shareCode),
  index("assign_teacher_idx").on(table.teacherId),
]);

export const assignmentResponses = sqliteTable("assignment_responses", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => assignments.id),
  userId: text("user_id"),
  anonymousToken: text("anonymous_token"),
  questionId: text("question_id").notNull(),
  answer: text("answer").notNull(),
  correct: integer("correct", { mode: "boolean" }),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("ar_assignment_idx").on(table.assignmentId),
  index("ar_user_idx").on(table.userId),
]);

// === Diagnostic Sessions ===

export const diagnosticSessions = sqliteTable("diagnostic_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  anonymousToken: text("anonymous_token"),
  disciplineId: text("discipline_id").notNull().references(() => disciplines.id),
  status: text("status").notNull().default("active"), // 'active' | 'completed'
  questionsAsked: integer("questions_asked").notNull().default(0),
  questionsCorrect: integer("questions_correct").notNull().default(0),
  estimatedFrontierJson: text("estimated_frontier_json"), // JSON array of topicIds
  topicEstimatesJson: text("topic_estimates_json"), // JSON: { topicId: probability }
  stateJson: text("state_json"), // adaptive algorithm state
  isTaste: integer("is_taste", { mode: "boolean" }).notNull().default(false), // short 5-10q version
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
}, (table) => [
  index("diag_user_idx").on(table.userId),
  index("diag_anon_idx").on(table.anonymousToken),
]);

// === Group Sessions ===

export const groupSessions = sqliteTable("group_sessions", {
  id: text("id").primaryKey(),
  facilitatorId: text("facilitator_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'family' | 'classroom' | 'peer-pair'
  topicId: text("topic_id").references(() => topics.id),
  joinCode: text("join_code"),
  status: text("status").notNull().default("active"), // 'active' | 'completed'
  settingsJson: text("settings_json"), // JSON: { topicOverride?, difficultyOverride? }
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  endedAt: text("ended_at"),
}, (table) => [
  index("gs_facilitator_idx").on(table.facilitatorId),
  uniqueIndex("gs_join_code_idx").on(table.joinCode),
  index("gs_status_idx").on(table.facilitatorId, table.status),
]);

export const groupSessionParticipants = sqliteTable("group_session_participants", {
  id: text("id").primaryKey(),
  groupSessionId: text("group_session_id").notNull().references(() => groupSessions.id),
  userId: text("user_id").references(() => users.id),
  anonymousToken: text("anonymous_token"),
  displayName: text("display_name"),
  role: text("role").notNull().default("student"), // 'student' | 'facilitator'
  currentTopicId: text("current_topic_id").references(() => topics.id),
  currentPhase: text("current_phase"),
  totalCorrect: integer("total_correct").notNull().default(0),
  totalAttempts: integer("total_attempts").notNull().default(0),
  joinedAt: text("joined_at").notNull().$defaultFn(() => new Date().toISOString()),
  leftAt: text("left_at"),
}, (table) => [
  index("gsp_session_idx").on(table.groupSessionId),
  index("gsp_user_idx").on(table.userId),
]);

// === Daily Activity Tracking ===

export const dailyActivity = sqliteTable("daily_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD (user's local date)
  minutesActive: integer("minutes_active").notNull().default(0),
  problemsCompleted: integer("problems_completed").notNull().default(0),
  topicsMastered: integer("topics_mastered").notNull().default(0),
  goalMet: integer("goal_met", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex("da_user_date_idx").on(table.userId, table.date),
  index("da_user_goal_idx").on(table.userId, table.goalMet),
]);

// === Onboarding State ===

export const onboardingState = sqliteTable("onboarding_state", {
  userId: text("user_id").primaryKey().references(() => users.id),
  step: integer("step").notNull().default(0), // 0=not started, 1=intro, 2=diagnostic, 3=first session, 4=complete
  diagnosticSessionId: text("diagnostic_session_id"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// === Assessment Sessions ===

export const assessmentSessions = sqliteTable("assessment_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  scopeJson: text("scope_json").notNull(), // JSON: AssessmentScope
  configJson: text("config_json").notNull(), // JSON: AssessmentSessionConfig
  status: text("status").notNull().default("active"), // 'active' | 'completed' | 'timed-out'
  questionsAsked: integer("questions_asked").notNull().default(0),
  questionsCorrect: integer("questions_correct").notNull().default(0),
  rawScore: real("raw_score"),
  strandScoresJson: text("strand_scores_json"), // JSON: Record<string, {correct,total,score}>
  standardScoresJson: text("standard_scores_json"), // JSON: Record<string, {standard,correct,total,classification}>
  questionsJson: text("questions_json").notNull(), // JSON: pre-determined question sequence [{topicId,topicName,topicStrand,topicStandardCode,problem}]
  timeLimitMinutes: integer("time_limit_minutes"),
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
}, (table) => [
  index("as_user_idx").on(table.userId),
  index("as_status_idx").on(table.userId, table.status),
]);

export const assessmentResponses = sqliteTable("assessment_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assessmentSessionId: text("assessment_session_id").notNull().references(() => assessmentSessions.id),
  questionNumber: integer("question_number").notNull(),
  topicId: text("topic_id").notNull(),
  problemId: text("problem_id").notNull(),
  answer: text("answer").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  responseMs: integer("response_ms"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("ar_session_idx").on(table.assessmentSessionId),
  uniqueIndex("ar_session_qnum_idx").on(table.assessmentSessionId, table.questionNumber),
]);
