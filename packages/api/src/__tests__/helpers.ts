import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.js";
import app from "../index.js";

// Re-export for convenience
export { env };

// --- DB Helpers ---

export function getTestDb() {
  return drizzle(env.DB, { schema });
}

/** Apply all migrations to the test D1 database */
export async function applyMigrations() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await env.DB.prepare(stmt).run();
  }
}

/** Drop all tables for clean test isolation */
export async function resetDb() {
  // Drop in reverse FK order
  const tables = [
    "group_session_participants",
    "group_sessions",
    "onboarding_state",
    "diagnostic_sessions",
    "assignment_responses",
    "assignments",
    "teach_sessions",
    "account_links",
    "llm_model_config",
    "llm_usage",
    "review_log",
    "user_topic_state",
    "learn_sessions",
    "invitation",
    "member",
    "organization",
    "accounts",
    "verifications",
    "sessions",
    "user_preferences",
    "assessment_content",
    "instructional_content",
    "encompassings",
    "prerequisites",
    "topics",
    "subjects",
    "users",
  ];
  for (const t of tables) {
    await env.DB.exec(`DROP TABLE IF EXISTS "${t}"`);
  }
}

// --- Request Helpers ---

type RequestInit = Parameters<typeof app.request>[1];

/** Make a request to the Hono app */
export function request(path: string, init?: RequestInit) {
  return app.request(path, init, env);
}

/** Parse JSON response with type */
export async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

/** Create an authenticated session and return headers for requests */
export async function createAuthSession(userId: string): Promise<Record<string, string>> {
  const db = getTestDb();
  const token = `test-token-${userId}-${Date.now()}`;
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await db.insert(schema.sessions).values({
    id: `sess-${userId}`,
    userId,
    token,
    expiresAt: expires,
    createdAt: now,
    updatedAt: now,
  });

  return { Cookie: `better-auth.session_token=${token}` };
}

// --- Seed Helpers ---

export async function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const db = getTestDb();
  const id = overrides.id ?? `user-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [user] = await db
    .insert(schema.users)
    .values({
      id,
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `${id}@test.com`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return user;
}

export async function seedAdminUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  return seedUser({ role: "admin", ...overrides });
}

export async function seedSubject(overrides: Partial<typeof schema.subjects.$inferInsert> = {}) {
  const db = getTestDb();
  const id = overrides.id ?? `subj-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [subj] = await db
    .insert(schema.subjects)
    .values({
      id,
      name: overrides.name ?? "Math K-5",
      description: overrides.description ?? "Test subject",
      gradeRange: overrides.gradeRange ?? "K-5",
      createdAt: now,
      ...overrides,
    })
    .returning();
  return subj;
}

export async function seedTopic(
  subjectId: string,
  overrides: Partial<typeof schema.topics.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `topic-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [topic] = await db
    .insert(schema.topics)
    .values({
      id,
      subjectId,
      name: overrides.name ?? "Counting to 10",
      description: overrides.description ?? "Test topic",
      gradeLevel: overrides.gradeLevel ?? 0,
      depth: overrides.depth ?? 0,
      createdAt: now,
      ...overrides,
    })
    .returning();
  return topic;
}

export async function seedAssessmentContent(
  topicId: string,
  overrides: Partial<typeof schema.assessmentContent.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `ac-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.assessmentContent)
    .values({
      id,
      topicId,
      difficulty: overrides.difficulty ?? "medium",
      question: overrides.question ?? "What is 2 + 2?",
      answer: overrides.answer ?? "4",
      hintsJson: overrides.hintsJson ?? JSON.stringify(["Think about counting."]),
      solution: overrides.solution ?? "2 + 2 = 4",
      createdAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedInstructionalContent(
  topicId: string,
  overrides: Partial<typeof schema.instructionalContent.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `ic-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.instructionalContent)
    .values({
      id,
      topicId,
      title: overrides.title ?? "Example: Counting",
      stepsJson: overrides.stepsJson ?? JSON.stringify([{
        subgoalLabel: "Step 1",
        instruction: "Count objects",
        work: "1, 2, 3",
        explanation: "We count one at a time.",
      }]),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedPrerequisite(fromTopicId: string, toTopicId: string, strength = 1.0) {
  const db = getTestDb();
  const [row] = await db
    .insert(schema.prerequisites)
    .values({ fromTopicId, toTopicId, strength })
    .returning();
  return row;
}

export async function seedEncompassing(parentTopicId: string, childTopicId: string, weight = 0.5) {
  const db = getTestDb();
  const [row] = await db
    .insert(schema.encompassings)
    .values({ parentTopicId, childTopicId, weight })
    .returning();
  return row;
}

export async function seedLLMUsage(userId: string, overrides: Partial<typeof schema.llmUsage.$inferInsert> = {}) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.llmUsage)
    .values({
      id: overrides.id ?? `llm-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      model: overrides.model ?? "test-model",
      inputTokens: overrides.inputTokens ?? 100,
      outputTokens: overrides.outputTokens ?? 50,
      costCents: overrides.costCents ?? 0.01,
      purpose: overrides.purpose ?? "tutor",
      createdAt: overrides.createdAt ?? now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedReviewLog(
  userId: string,
  topicId: string,
  overrides: Partial<typeof schema.reviewLog.$inferInsert> = {}
) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.reviewLog)
    .values({
      id: overrides.id ?? `rev-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      topicId,
      assessmentContentId: overrides.assessmentContentId ?? null,
      rating: overrides.rating ?? 3,
      correct: overrides.correct ?? true,
      responseMs: overrides.responseMs ?? 2000,
      phase: overrides.phase ?? "independent",
      createdAt: overrides.createdAt ?? now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedAccountLink(
  fromUserId: string,
  toUserId: string,
  type: string,
  overrides: Partial<typeof schema.accountLinks.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `link-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.accountLinks)
    .values({
      id,
      fromUserId,
      toUserId,
      type,
      status: overrides.status ?? "active",
      createdAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedOrg(overrides: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const db = getTestDb();
  const id = overrides.id ?? `org-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.organizations)
    .values({
      id,
      name: overrides.name ?? "Test Org",
      slug: overrides.slug ?? `test-org-${Date.now().toString(36)}`,
      createdAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedMember(
  userId: string,
  organizationId: string,
  role = "student",
  overrides: Partial<typeof schema.members.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `member-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.members)
    .values({
      id,
      userId,
      organizationId,
      role,
      createdAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedAssignment(
  teacherId: string,
  topicId: string,
  overrides: Partial<typeof schema.assignments.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `assign-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.assignments)
    .values({
      id,
      teacherId,
      topicId,
      shareCode: overrides.shareCode ?? `CODE${Date.now().toString(36).toUpperCase().slice(0, 4)}`,
      title: overrides.title ?? "Test Assignment",
      createdAt: now,
      ...overrides,
    })
    .returning();
  return row;
}

// --- Schema DDL (individual statements for D1 prepare/run) ---
// Tables created in FK dependency order: users first, then referencing tables

const SCHEMA_STATEMENTS = [
  // users (no FK deps)
  'CREATE TABLE users (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL, email_verified integer DEFAULT 0 NOT NULL, image text, birth_year integer, managed_by text, role text, banned integer, ban_reason text, ban_expires text, created_at text NOT NULL, updated_at text NOT NULL)',
  'CREATE UNIQUE INDEX users_email_idx ON users (email)',

  // subjects (no FK deps)
  'CREATE TABLE subjects (id text PRIMARY KEY NOT NULL, name text NOT NULL, description text NOT NULL, grade_range text NOT NULL, topic_count integer DEFAULT 0 NOT NULL, created_at text NOT NULL)',

  // verifications (no FK deps)
  'CREATE TABLE verifications (id text PRIMARY KEY NOT NULL, identifier text NOT NULL, value text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)',

  // organization (no FK deps)
  'CREATE TABLE organization (id text PRIMARY KEY NOT NULL, name text NOT NULL, slug text NOT NULL, logo text, metadata text, created_at text NOT NULL)',
  'CREATE UNIQUE INDEX org_slug_idx ON organization (slug)',

  // sessions (FK → users)
  'CREATE TABLE sessions (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, token text NOT NULL, expires_at text NOT NULL, ip_address text, user_agent text, active_organization_id text, impersonated_by text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX sessions_token_idx ON sessions (token)',
  'CREATE INDEX sessions_user_idx ON sessions (user_id)',

  // accounts (FK → users)
  'CREATE TABLE accounts (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, account_id text NOT NULL, provider_id text NOT NULL, access_token text, refresh_token text, access_token_expires_at text, refresh_token_expires_at text, scope text, id_token text, password text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

  // topics (FK → subjects) — graph nodes only, no content
  'CREATE TABLE topics (id text PRIMARY KEY NOT NULL, subject_id text NOT NULL, name text NOT NULL, description text NOT NULL, depth integer DEFAULT 0 NOT NULL, grade_level integer NOT NULL, standard_code text, created_at text NOT NULL, FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE INDEX topics_subject_idx ON topics (subject_id)',
  'CREATE INDEX topics_depth_idx ON topics (depth)',

  // instructional_content (FK → topics)
  'CREATE TABLE instructional_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'individual\' NOT NULL, version integer DEFAULT 1 NOT NULL, title text NOT NULL, steps_json text NOT NULL, assets_json text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ic_topic_idx ON instructional_content (topic_id)',
  'CREATE INDEX ic_dimensions_idx ON instructional_content (topic_id, flavor, locale, presentation, version)',

  // assessment_content (FK → topics)
  'CREATE TABLE assessment_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'individual\' NOT NULL, version integer DEFAULT 1 NOT NULL, type text DEFAULT \'text-qa\' NOT NULL, difficulty text NOT NULL, question text NOT NULL, answer text NOT NULL, hints_json text DEFAULT \'[]\' NOT NULL, solution text DEFAULT \'\' NOT NULL, type_properties text, created_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ac_topic_idx ON assessment_content (topic_id)',
  'CREATE INDEX ac_dimensions_idx ON assessment_content (topic_id, flavor, locale, presentation, version)',
  'CREATE INDEX ac_type_idx ON assessment_content (topic_id, type)',

  // prerequisites (FK → topics)
  'CREATE TABLE prerequisites (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, from_topic_id text NOT NULL, to_topic_id text NOT NULL, strength real DEFAULT 1 NOT NULL, FOREIGN KEY (from_topic_id) REFERENCES topics(id), FOREIGN KEY (to_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX prereq_unique_idx ON prerequisites (from_topic_id, to_topic_id)',
  'CREATE INDEX prereq_to_idx ON prerequisites (to_topic_id)',

  // encompassings (FK → topics)
  'CREATE TABLE encompassings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, parent_topic_id text NOT NULL, child_topic_id text NOT NULL, weight real DEFAULT 0.5 NOT NULL, FOREIGN KEY (parent_topic_id) REFERENCES topics(id), FOREIGN KEY (child_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX encomp_unique_idx ON encompassings (parent_topic_id, child_topic_id)',
  'CREATE INDEX encomp_parent_idx ON encompassings (parent_topic_id)',

  // user_topic_state (FK → users, topics)
  'CREATE TABLE user_topic_state (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, stability real DEFAULT 0 NOT NULL, difficulty real DEFAULT 0 NOT NULL, due text NOT NULL, state integer DEFAULT 0 NOT NULL, reps integer DEFAULT 0 NOT NULL, lapses integer DEFAULT 0 NOT NULL, mastered integer DEFAULT 0 NOT NULL, frontier integer DEFAULT 0 NOT NULL, confidence_accuracy real, last_review text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX uts_user_topic_idx ON user_topic_state (user_id, topic_id)',
  'CREATE INDEX uts_user_frontier_idx ON user_topic_state (user_id, frontier)',
  'CREATE INDEX uts_user_due_idx ON user_topic_state (user_id, due)',
  'CREATE INDEX uts_user_mastered_idx ON user_topic_state (user_id, mastered)',

  // review_log (FK → users, topics)
  'CREATE TABLE review_log (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, assessment_content_id text, rating integer NOT NULL, confidence integer, correct integer NOT NULL, response_ms integer NOT NULL, phase text NOT NULL, hints_used integer, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX review_user_idx ON review_log (user_id)',
  'CREATE INDEX review_topic_idx ON review_log (topic_id)',
  'CREATE INDEX review_assessment_idx ON review_log (assessment_content_id)',

  // learn_sessions (FK → users, nullable for anonymous)
  'CREATE TABLE learn_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, started_at text NOT NULL, ended_at text, state_json text, updated_at text NOT NULL DEFAULT \'\', topics_attempted integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, reviews_completed integer DEFAULT 0 NOT NULL, average_accuracy real, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX learn_sessions_user_idx ON learn_sessions (user_id)',
  'CREATE INDEX learn_sessions_active_idx ON learn_sessions (user_id, ended_at)',
  'CREATE INDEX learn_sessions_anon_idx ON learn_sessions (anonymous_token)',

  // llm_usage (FK → users)
  'CREATE TABLE llm_usage (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cost_cents real NOT NULL, purpose text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX llm_usage_user_idx ON llm_usage (user_id)',

  // user_preferences (FK → users)
  'CREATE TABLE user_preferences (user_id text PRIMARY KEY NOT NULL, tts_enabled integer DEFAULT true NOT NULL, tts_rate real DEFAULT 0.9 NOT NULL, tts_voice_name text, tts_auto_read integer DEFAULT false NOT NULL, stt_enabled integer DEFAULT true NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

  // llm_model_config (no FK deps)
  'CREATE TABLE llm_model_config (tier text PRIMARY KEY NOT NULL, model_id text NOT NULL, cost_input_per_m real NOT NULL, cost_output_per_m real NOT NULL, updated_at text NOT NULL)',

  // member (FK → users, organization)
  'CREATE TABLE member (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, organization_id text NOT NULL, role text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (organization_id) REFERENCES organization(id))',
  'CREATE INDEX member_org_idx ON member (organization_id)',
  'CREATE INDEX member_user_idx ON member (user_id)',

  // invitation (FK → users, organization)
  'CREATE TABLE invitation (id text PRIMARY KEY NOT NULL, email text NOT NULL, inviter_id text NOT NULL, organization_id text NOT NULL, role text NOT NULL, status text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, FOREIGN KEY (inviter_id) REFERENCES users(id), FOREIGN KEY (organization_id) REFERENCES organization(id))',
  'CREATE INDEX invitation_org_idx ON invitation (organization_id)',

  // account_links (FK → users)
  'CREATE TABLE account_links (id text PRIMARY KEY NOT NULL, from_user_id text NOT NULL, to_user_id text NOT NULL, type text NOT NULL, permissions text, status text DEFAULT \'active\' NOT NULL, created_at text NOT NULL, FOREIGN KEY (from_user_id) REFERENCES users(id), FOREIGN KEY (to_user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX al_from_to_type_idx ON account_links (from_user_id, to_user_id, type)',
  'CREATE INDEX al_to_user_idx ON account_links (to_user_id)',
  'CREATE INDEX al_from_user_idx ON account_links (from_user_id)',

  // teach_sessions (FK → users, topics)
  'CREATE TABLE teach_sessions (id text PRIMARY KEY NOT NULL, teacher_id text NOT NULL, topic_id text NOT NULL, started_at text NOT NULL, ended_at text, notes text, FOREIGN KEY (teacher_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ts_teacher_idx ON teach_sessions (teacher_id)',
  'CREATE INDEX ts_topic_idx ON teach_sessions (topic_id)',

  // assignments (FK → users, topics)
  'CREATE TABLE assignments (id text PRIMARY KEY NOT NULL, teacher_id text NOT NULL, topic_id text NOT NULL, share_code text NOT NULL, title text NOT NULL, description text, max_problems integer, created_at text NOT NULL, expires_at text, FOREIGN KEY (teacher_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX assign_code_idx ON assignments (share_code)',
  'CREATE INDEX assign_teacher_idx ON assignments (teacher_id)',

  // assignment_responses (FK → assignments)
  'CREATE TABLE assignment_responses (id text PRIMARY KEY NOT NULL, assignment_id text NOT NULL, user_id text, anonymous_token text, question_id text NOT NULL, answer text NOT NULL, correct integer, created_at text NOT NULL, FOREIGN KEY (assignment_id) REFERENCES assignments(id))',
  'CREATE INDEX ar_assignment_idx ON assignment_responses (assignment_id)',
  'CREATE INDEX ar_user_idx ON assignment_responses (user_id)',

  // diagnostic_sessions (FK → users, subjects)
  'CREATE TABLE diagnostic_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, subject_id text NOT NULL, status text DEFAULT \'active\' NOT NULL, questions_asked integer DEFAULT 0 NOT NULL, questions_correct integer DEFAULT 0 NOT NULL, estimated_frontier_json text, topic_estimates_json text, state_json text, is_taste integer DEFAULT 0 NOT NULL, created_at text NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE INDEX diag_user_idx ON diagnostic_sessions (user_id)',
  'CREATE INDEX diag_anon_idx ON diagnostic_sessions (anonymous_token)',

  // onboarding_state (FK → users)
  'CREATE TABLE onboarding_state (user_id text PRIMARY KEY NOT NULL, step integer DEFAULT 0 NOT NULL, diagnostic_session_id text, completed_at text, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

  // group_sessions (FK → users, topics)
  'CREATE TABLE group_sessions (id text PRIMARY KEY NOT NULL, facilitator_id text NOT NULL, type text NOT NULL, topic_id text, join_code text, status text DEFAULT \'active\' NOT NULL, settings_json text, started_at text NOT NULL, ended_at text, FOREIGN KEY (facilitator_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX gs_facilitator_idx ON group_sessions (facilitator_id)',
  'CREATE UNIQUE INDEX gs_join_code_idx ON group_sessions (join_code)',
  'CREATE INDEX gs_status_idx ON group_sessions (facilitator_id, status)',

  // group_session_participants (FK → group_sessions, users, topics)
  'CREATE TABLE group_session_participants (id text PRIMARY KEY NOT NULL, group_session_id text NOT NULL, user_id text, anonymous_token text, display_name text, role text DEFAULT \'student\' NOT NULL, current_topic_id text, current_phase text, total_correct integer DEFAULT 0 NOT NULL, total_attempts integer DEFAULT 0 NOT NULL, joined_at text NOT NULL, left_at text, FOREIGN KEY (group_session_id) REFERENCES group_sessions(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (current_topic_id) REFERENCES topics(id))',
  'CREATE INDEX gsp_session_idx ON group_session_participants (group_session_id)',
  'CREATE INDEX gsp_user_idx ON group_session_participants (user_id)',
];
