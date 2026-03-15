import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
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
    "assessment_responses",
    "assessment_sessions",
    "daily_activity",
    "group_session_participants",
    "group_sessions",
    "onboarding_state",
    "diagnostic_sessions",
    "assignment_responses",
    "assignments",
    "teach_sessions",
    "account_links",
    "collection_topics",
    "presentation_drift_log",
    "user_fsrs_params",
    "user_discipline_presentation",
    "llm_model_config",
    "llm_usage",
    "review_log",
    "user_topic_depth",
    "user_topic_state",
    "learn_sessions",
    "invitation",
    "member",
    "organization",
    "accounts",
    "verifications",
    "sessions",
    "user_preferences",
    "topic_content_versions",
    "assessment_content",
    "instructional_content",
    "encompassings",
    "prerequisites",
    "topics",
    "collections",
    "disciplines",
    "users",
  ];
  for (const t of tables) {
    await env.DB.exec(`DROP TABLE IF EXISTS "${t}"`);
  }
}

// --- R2 Mock ---

/**
 * Create an in-memory R2 bucket mock for testing.
 * Pass a map of R2 key → JSON content.
 */
export function createMockR2Bucket(objects: Record<string, string> = {}): R2Bucket {
  return {
    get(key: string) {
      const data = objects[key];
      if (!data) return Promise.resolve(null);
      return Promise.resolve({
        text: () => Promise.resolve(data),
        json: () => Promise.resolve(JSON.parse(data)),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
      } as unknown as R2ObjectBody);
    },
    put: () => Promise.resolve(null as any),
    delete: () => Promise.resolve(),
    list: () => Promise.resolve({ objects: [], truncated: false, delimitedPrefixes: [] } as any),
    head: () => Promise.resolve(null),
    createMultipartUpload: () => Promise.resolve(null as any),
    resumeMultipartUpload: () => Promise.resolve(null as any),
  } as unknown as R2Bucket;
}

/**
 * Create a mock R2 bucket pre-populated with standard test problems for a topic.
 * Problems have easy/medium/hard difficulties with standard presentation.
 */
export function createTestR2Bucket(topicId: string, disciplineId = "math"): R2Bucket {
  const problems = [
    { id: `${topicId}-p1`, topicId, difficulty: "easy", question: "What is 2 + 2?", answer: "4", hints: ["Think about counting."], solution: "2 + 2 = 4", flavor: "classic", locale: "en", presentation: "standard", contentDepth: "survey", type: "text-qa", cognitiveDemand: "procedural" },
    { id: `${topicId}-p2`, topicId, difficulty: "medium", question: "What is 5 + 3?", answer: "8", hints: ["Count on from 5."], solution: "5 + 3 = 8", flavor: "classic", locale: "en", presentation: "standard", contentDepth: "survey", type: "text-qa", cognitiveDemand: "procedural" },
    { id: `${topicId}-p3`, topicId, difficulty: "hard", question: "What is 7 + 8?", answer: "15", hints: ["Make a 10 first."], solution: "7 + 3 + 5 = 15", flavor: "classic", locale: "en", presentation: "standard", contentDepth: "survey", type: "text-qa", cognitiveDemand: "procedural" },
  ];
  const examples = [
    { id: `${topicId}-ex1`, topicId, title: "Example", steps: [{ subgoalLabel: "Step 1", instruction: "Count", work: "1, 2, 3", explanation: "Count one at a time." }], flavor: "classic", locale: "en", presentation: "standard", contentDepth: "survey" },
  ];
  return createMockR2Bucket({
    [`${disciplineId}/${topicId}/problems.json`]: JSON.stringify(problems),
    [`${disciplineId}/${topicId}/examples.json`]: JSON.stringify(examples),
  });
}

/** Get the test R2 bucket (miniflare in-memory R2) */
export function getTestR2Bucket(): R2Bucket {
  return env.CONTENT;
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

export async function seedDiscipline(overrides: Partial<typeof schema.disciplines.$inferInsert> = {}) {
  const db = getTestDb();
  const id = overrides.id ?? "math";
  // Upsert: if discipline already exists, skip
  const existing = await db.select().from(schema.disciplines).where(eq(schema.disciplines.id, id));
  if (existing.length > 0) return existing[0];
  const [disc] = await db
    .insert(schema.disciplines)
    .values({
      id,
      name: overrides.name ?? "Mathematics",
      description: overrides.description ?? "Test discipline",
      progressionModel: overrides.progressionModel ?? "mastery-gated",
      createdAt: new Date().toISOString(),
      ...overrides,
    })
    .returning();
  return disc;
}


export async function seedTopic(
  disciplineId: string,
  overrides: Partial<typeof schema.topics.$inferInsert> = {}
) {
  const db = getTestDb();
  const id = overrides.id ?? `topic-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  // Ensure discipline exists
  await seedDiscipline({ id: disciplineId });
  const [topic] = await db
    .insert(schema.topics)
    .values({
      id,
      disciplineId,
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

export async function seedTopicContentVersion(
  topicId: string,
  overrides: Partial<typeof schema.topicContentVersions.$inferInsert> = {}
) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.topicContentVersions)
    .values({
      topicId,
      contentHash: overrides.contentHash ?? `hash-${topicId}`,
      bundleVersion: overrides.bundleVersion ?? 1,
      problemsCount: overrides.problemsCount ?? 15,
      examplesCount: overrides.examplesCount ?? 2,
      generatedAt: overrides.generatedAt ?? now,
      ...overrides,
    })
    .onConflictDoUpdate({
      target: schema.topicContentVersions.topicId,
      set: {
        contentHash: overrides.contentHash ?? `hash-${topicId}`,
        problemsCount: overrides.problemsCount ?? 15,
        examplesCount: overrides.examplesCount ?? 2,
      },
    })
    .returning();
  return row;
}

/**
 * Seed test content into R2 + topic_content_versions for a topic.
 * This populates the miniflare R2 bucket so content is available via the content service.
 * Also backward-compatible with seedAssessmentContent/seedInstructionalContent call sites.
 */
export async function seedAssessmentContent(
  topicId: string,
  overrides: Record<string, unknown> = {}
) {
  const disciplineId = (overrides.disciplineId as string) ?? "math";
  const difficulty = (overrides.difficulty as string) ?? "medium";
  const id = (overrides.id as string) ?? `ac-${crypto.randomUUID().slice(0, 8)}`;
  const problems = [{
    id,
    topicId,
    difficulty,
    question: (overrides.question as string) ?? "What is 2 + 2?",
    answer: (overrides.answer as string) ?? "4",
    hints: overrides.hintsJson ? JSON.parse(overrides.hintsJson as string) : ["Think about counting."],
    solution: (overrides.solution as string) ?? "2 + 2 = 4",
    flavor: "classic",
    locale: "en",
    presentation: (overrides.presentation as string) ?? "standard",
    contentDepth: (overrides.contentDepth as string) ?? "survey",
    type: "text-qa",
    cognitiveDemand: (overrides.cognitiveDemand as string | undefined) ?? undefined,
    keyPrerequisiteId: (overrides.keyPrerequisiteId as string) ?? undefined,
    source: (overrides.source as string) ?? "hand-authored",
  }];

  // Merge with existing R2 content (so multiple calls for same topic accumulate)
  const r2Key = `${disciplineId}/${topicId}/problems.json`;
  const existing = await env.CONTENT.get(r2Key);
  if (existing) {
    const prev = await existing.json() as unknown[];
    prev.push(...problems);
    await env.CONTENT.put(r2Key, JSON.stringify(prev));
  } else {
    await env.CONTENT.put(r2Key, JSON.stringify(problems));
  }

  // Also update topic_content_versions
  const result = await seedTopicContentVersion(topicId, {
    problemsCount: existing ? ((await (await env.CONTENT.get(r2Key))!.json()) as unknown[]).length : 1,
  });

  return { ...result, id, topicId };
}

/**
 * Seed worked example into R2 + topic_content_versions for a topic.
 */
export async function seedInstructionalContent(
  topicId: string,
  overrides: Record<string, unknown> = {}
) {
  const disciplineId = (overrides.disciplineId as string) ?? "math";
  const id = (overrides.id as string) ?? `ic-${crypto.randomUUID().slice(0, 8)}`;
  const examples = [{
    id,
    topicId,
    title: (overrides.title as string) ?? "Example: Counting",
    steps: overrides.stepsJson ? JSON.parse(overrides.stepsJson as string) : [{ subgoalLabel: "Step 1", instruction: "Count objects", work: "1, 2, 3", explanation: "We count one at a time." }],
    flavor: "classic",
    locale: "en",
    presentation: (overrides.presentation as string) ?? "standard",
    contentDepth: (overrides.contentDepth as string) ?? "survey",
  }];

  const r2Key = `${disciplineId}/${topicId}/examples.json`;
  const existing = await env.CONTENT.get(r2Key);
  if (existing) {
    const prev = await existing.json() as unknown[];
    prev.push(...examples);
    await env.CONTENT.put(r2Key, JSON.stringify(prev));
  } else {
    await env.CONTENT.put(r2Key, JSON.stringify(examples));
  }

  const result = await seedTopicContentVersion(topicId, {
    examplesCount: existing ? ((await (await env.CONTENT.get(r2Key))!.json()) as unknown[]).length : 1,
  });

  return { ...result, id, topicId };
}

export async function seedPrerequisite(
  fromTopicId: string,
  toTopicId: string,
  strength = 1.0,
  type: "required" | "recommended" | "enriching" = "required"
) {
  const db = getTestDb();
  const [row] = await db
    .insert(schema.prerequisites)
    .values({ fromTopicId, toTopicId, strength, type })
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

export async function seedUserTopicDepth(
  userId: string,
  topicId: string,
  contentDepth: string,
  completed = true
) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.userTopicDepth)
    .values({
      userId,
      topicId,
      contentDepth,
      completed,
      completedAt: completed ? now : null,
    })
    .returning();
  return row;
}

export async function seedUserDisciplinePresentation(
  userId: string,
  disciplineId: string,
  weights: { primary: number; intermediate: number; standard: number; advanced: number },
  centerLevel = "standard"
) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.userDisciplinePresentation)
    .values({
      userId,
      disciplineId,
      primaryWeight: weights.primary,
      intermediateWeight: weights.intermediate,
      standardWeight: weights.standard,
      advancedWeight: weights.advanced,
      centerLevel,
      lastAdjustedAt: now,
    })
    .returning();
  return row;
}

/** @deprecated Use seedUserDisciplinePresentation() */
export const seedUserSubjectPresentation = seedUserDisciplinePresentation;

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

export async function seedUserTopicState(
  userId: string,
  topicId: string,
  overrides: Partial<typeof schema.userTopicState.$inferInsert> = {}
) {
  const db = getTestDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(schema.userTopicState)
    .values({
      userId,
      topicId,
      stability: overrides.stability ?? 0,
      difficulty: overrides.difficulty ?? 0,
      due: overrides.due ?? now,
      state: overrides.state ?? 0,
      reps: overrides.reps ?? 0,
      lapses: overrides.lapses ?? 0,
      mastered: overrides.mastered ?? false,
      frontier: overrides.frontier ?? false,
      consecutiveCorrectReviews: overrides.consecutiveCorrectReviews ?? 0,
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

export async function seedDailyActivity(
  userId: string,
  date: string,
  overrides: Partial<typeof schema.dailyActivity.$inferInsert> = {}
) {
  const db = getTestDb();
  const [row] = await db
    .insert(schema.dailyActivity)
    .values({
      userId,
      date,
      minutesActive: overrides.minutesActive ?? 0,
      problemsCompleted: overrides.problemsCompleted ?? 0,
      topicsMastered: overrides.topicsMastered ?? 0,
      goalMet: overrides.goalMet ?? false,
      updatedAt: new Date().toISOString(),
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

  // disciplines (no FK deps)
  'CREATE TABLE disciplines (id text PRIMARY KEY NOT NULL, name text NOT NULL, description text NOT NULL, progression_model text DEFAULT \'mastery-gated\' NOT NULL, created_at text NOT NULL)',

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

  // collections (FK → disciplines)
  'CREATE TABLE collections (id text PRIMARY KEY NOT NULL, primary_discipline_id text NOT NULL, name text NOT NULL, description text NOT NULL, kind text DEFAULT \'grade-band\' NOT NULL, grade_range text, display_order integer DEFAULT 0 NOT NULL, visibility text DEFAULT \'published\' NOT NULL, created_at text NOT NULL, FOREIGN KEY (primary_discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX collections_discipline_idx ON collections (primary_discipline_id)',

  // topics (FK → disciplines) — graph nodes only, no content
  'CREATE TABLE topics (id text PRIMARY KEY NOT NULL, discipline_id text NOT NULL, name text NOT NULL, description text NOT NULL, depth integer DEFAULT 0 NOT NULL, grade_level integer NOT NULL, strand text, standard_code text, created_at text NOT NULL, FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX topics_discipline_idx ON topics (discipline_id)',
  'CREATE INDEX topics_depth_idx ON topics (depth)',

  // collection_topics (FK → collections, topics)
  'CREATE TABLE collection_topics (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, collection_id text NOT NULL, topic_id text NOT NULL, sort_order integer DEFAULT 0 NOT NULL, FOREIGN KEY (collection_id) REFERENCES collections(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX ct_collection_topic_idx ON collection_topics (collection_id, topic_id)',
  'CREATE INDEX ct_topic_idx ON collection_topics (topic_id)',

  // instructional_content (FK → topics)
  'CREATE TABLE instructional_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'standard\' NOT NULL, content_depth text DEFAULT \'survey\' NOT NULL, version integer DEFAULT 1 NOT NULL, title text NOT NULL, steps_json text NOT NULL, assets_json text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ic_topic_idx ON instructional_content (topic_id)',
  'CREATE INDEX ic_dimensions_idx ON instructional_content (topic_id, flavor, locale, presentation, version)',
  'CREATE INDEX ic_depth_idx ON instructional_content (topic_id, content_depth)',

  // assessment_content (FK → topics)
  'CREATE TABLE assessment_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'standard\' NOT NULL, content_depth text DEFAULT \'survey\' NOT NULL, version integer DEFAULT 1 NOT NULL, type text DEFAULT \'text-qa\' NOT NULL, difficulty text NOT NULL, question text NOT NULL, answer text NOT NULL, hints_json text DEFAULT \'[]\' NOT NULL, solution text DEFAULT \'\' NOT NULL, type_properties text, cognitive_demand text, key_prerequisite_id text, source text DEFAULT \'hand-authored\' NOT NULL, created_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ac_topic_idx ON assessment_content (topic_id)',
  'CREATE INDEX ac_dimensions_idx ON assessment_content (topic_id, flavor, locale, presentation, version)',
  'CREATE INDEX ac_type_idx ON assessment_content (topic_id, type)',
  'CREATE INDEX ac_depth_idx ON assessment_content (topic_id, content_depth)',

  // topic_content_versions (FK → topics)
  'CREATE TABLE topic_content_versions (topic_id text PRIMARY KEY NOT NULL, content_hash text NOT NULL, bundle_version integer DEFAULT 1 NOT NULL, problems_count integer DEFAULT 0 NOT NULL, examples_count integer DEFAULT 0 NOT NULL, lessons_count integer DEFAULT 0 NOT NULL, generated_at text NOT NULL, uploaded_at text, FOREIGN KEY (topic_id) REFERENCES topics(id))',

  // prerequisites (FK → topics)
  'CREATE TABLE prerequisites (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, from_topic_id text NOT NULL, to_topic_id text NOT NULL, strength real DEFAULT 1 NOT NULL, type text DEFAULT \'required\' NOT NULL, FOREIGN KEY (from_topic_id) REFERENCES topics(id), FOREIGN KEY (to_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX prereq_unique_idx ON prerequisites (from_topic_id, to_topic_id)',
  'CREATE INDEX prereq_to_idx ON prerequisites (to_topic_id)',

  // encompassings (FK → topics)
  'CREATE TABLE encompassings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, parent_topic_id text NOT NULL, child_topic_id text NOT NULL, weight real DEFAULT 0.5 NOT NULL, FOREIGN KEY (parent_topic_id) REFERENCES topics(id), FOREIGN KEY (child_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX encomp_unique_idx ON encompassings (parent_topic_id, child_topic_id)',
  'CREATE INDEX encomp_parent_idx ON encompassings (parent_topic_id)',

  // user_topic_state (FK → users, topics)
  'CREATE TABLE user_topic_state (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, stability real DEFAULT 0 NOT NULL, difficulty real DEFAULT 0 NOT NULL, due text NOT NULL, state integer DEFAULT 0 NOT NULL, reps integer DEFAULT 0 NOT NULL, lapses integer DEFAULT 0 NOT NULL, mastered integer DEFAULT 0 NOT NULL, frontier integer DEFAULT 0 NOT NULL, consecutive_correct_reviews integer DEFAULT 0 NOT NULL, consecutive_incorrect_reviews integer DEFAULT 0 NOT NULL, confidence_accuracy real, last_review text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX uts_user_topic_idx ON user_topic_state (user_id, topic_id)',
  'CREATE INDEX uts_user_frontier_idx ON user_topic_state (user_id, frontier)',
  'CREATE INDEX uts_user_due_idx ON user_topic_state (user_id, due)',
  'CREATE INDEX uts_user_mastered_idx ON user_topic_state (user_id, mastered)',

  // user_topic_depth (FK → users, topics)
  'CREATE TABLE user_topic_depth (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, content_depth text NOT NULL, completed integer DEFAULT 0 NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX utd_user_topic_depth_idx ON user_topic_depth (user_id, topic_id, content_depth)',
  'CREATE INDEX utd_user_topic_idx ON user_topic_depth (user_id, topic_id)',

  // review_log (FK → users, topics)
  'CREATE TABLE review_log (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, assessment_content_id text, rating integer NOT NULL, confidence integer, correct integer NOT NULL, response_ms integer NOT NULL, phase text NOT NULL, hints_used integer, misconception integer, content_version text, llm_assisted integer DEFAULT 0, hint_source text, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX review_user_idx ON review_log (user_id)',
  'CREATE INDEX review_topic_idx ON review_log (topic_id)',
  'CREATE INDEX review_assessment_idx ON review_log (assessment_content_id)',

  // learn_sessions (FK → users, nullable for anonymous)
  'CREATE TABLE learn_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, started_at text NOT NULL, ended_at text, state_json text, updated_at text NOT NULL DEFAULT \'\', topics_attempted integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, reviews_completed integer DEFAULT 0 NOT NULL, average_accuracy real, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX learn_sessions_user_idx ON learn_sessions (user_id)',
  'CREATE INDEX learn_sessions_active_idx ON learn_sessions (user_id, ended_at)',
  'CREATE INDEX learn_sessions_anon_idx ON learn_sessions (anonymous_token)',

  // llm_usage (FK → users)
  'CREATE TABLE llm_usage (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cost_cents real NOT NULL, purpose text NOT NULL, topic_id text, problem_id text, session_id text, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX llm_usage_user_idx ON llm_usage (user_id)',
  'CREATE INDEX llm_usage_topic_idx ON llm_usage (topic_id)',

  // user_discipline_presentation (FK → users, disciplines)
  'CREATE TABLE user_discipline_presentation (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, discipline_id text NOT NULL, primary_weight real DEFAULT 0 NOT NULL, intermediate_weight real DEFAULT 0 NOT NULL, standard_weight real DEFAULT 0 NOT NULL, advanced_weight real DEFAULT 0 NOT NULL, center_level text DEFAULT \'standard\' NOT NULL, drift_signal real DEFAULT 0 NOT NULL, last_adjusted_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE UNIQUE INDEX udp_user_discipline_idx ON user_discipline_presentation (user_id, discipline_id)',

  // presentation_drift_log (FK → users, disciplines)
  'CREATE TABLE presentation_drift_log (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, discipline_id text NOT NULL, from_weights text NOT NULL, to_weights text NOT NULL, from_center text NOT NULL, to_center text NOT NULL, trigger text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX pdl_user_discipline_idx ON presentation_drift_log (user_id, discipline_id)',

  // user_preferences (FK → users)
  'CREATE TABLE user_preferences (user_id text PRIMARY KEY NOT NULL, tts_enabled integer DEFAULT true NOT NULL, tts_rate real DEFAULT 0.9 NOT NULL, tts_voice_name text, tts_auto_read integer DEFAULT false NOT NULL, stt_enabled integer DEFAULT true NOT NULL, presentation_override text, daily_goal_type text DEFAULT \'minutes\' NOT NULL, daily_goal_target integer DEFAULT 20 NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

  // user_fsrs_params (FK → users)
  'CREATE TABLE user_fsrs_params (user_id text PRIMARY KEY NOT NULL, request_retention real DEFAULT 0.9 NOT NULL, w_json text, review_count integer DEFAULT 0 NOT NULL, computed_at text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

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

  // diagnostic_sessions (FK → users, disciplines)
  'CREATE TABLE diagnostic_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, discipline_id text NOT NULL, status text DEFAULT \'active\' NOT NULL, questions_asked integer DEFAULT 0 NOT NULL, questions_correct integer DEFAULT 0 NOT NULL, estimated_frontier_json text, topic_estimates_json text, state_json text, is_taste integer DEFAULT 0 NOT NULL, created_at text NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX diag_user_idx ON diagnostic_sessions (user_id)',
  'CREATE INDEX diag_anon_idx ON diagnostic_sessions (anonymous_token)',

  // onboarding_state (FK → users)
  'CREATE TABLE onboarding_state (user_id text PRIMARY KEY NOT NULL, step integer DEFAULT 0 NOT NULL, diagnostic_session_id text, completed_at text, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',

  // group_sessions (FK → users, topics)
  'CREATE TABLE group_sessions (id text PRIMARY KEY NOT NULL, facilitator_id text NOT NULL, type text NOT NULL, topic_id text, join_code text, status text DEFAULT \'active\' NOT NULL, settings_json text, started_at text NOT NULL, ended_at text, FOREIGN KEY (facilitator_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX gs_facilitator_idx ON group_sessions (facilitator_id)',
  'CREATE UNIQUE INDEX gs_join_code_idx ON group_sessions (join_code)',
  'CREATE INDEX gs_status_idx ON group_sessions (facilitator_id, status)',

  // daily_activity (FK → users)
  'CREATE TABLE daily_activity (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, date text NOT NULL, minutes_active integer DEFAULT 0 NOT NULL, problems_completed integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, goal_met integer DEFAULT 0 NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX da_user_date_idx ON daily_activity (user_id, date)',
  'CREATE INDEX da_user_goal_idx ON daily_activity (user_id, goal_met)',

  // group_session_participants (FK → group_sessions, users, topics)
  'CREATE TABLE group_session_participants (id text PRIMARY KEY NOT NULL, group_session_id text NOT NULL, user_id text, anonymous_token text, display_name text, role text DEFAULT \'student\' NOT NULL, current_topic_id text, current_phase text, total_correct integer DEFAULT 0 NOT NULL, total_attempts integer DEFAULT 0 NOT NULL, joined_at text NOT NULL, left_at text, FOREIGN KEY (group_session_id) REFERENCES group_sessions(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (current_topic_id) REFERENCES topics(id))',
  'CREATE INDEX gsp_session_idx ON group_session_participants (group_session_id)',
  'CREATE INDEX gsp_user_idx ON group_session_participants (user_id)',

  // assessment_sessions (FK → users)
  'CREATE TABLE assessment_sessions (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, scope_json text NOT NULL, config_json text NOT NULL, status text DEFAULT \'active\' NOT NULL, questions_asked integer DEFAULT 0 NOT NULL, questions_correct integer DEFAULT 0 NOT NULL, raw_score real, strand_scores_json text, standard_scores_json text, questions_json text NOT NULL, time_limit_minutes integer, started_at text NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX as_user_idx ON assessment_sessions (user_id)',
  'CREATE INDEX as_status_idx ON assessment_sessions (user_id, status)',

  // assessment_responses (FK → assessment_sessions)
  'CREATE TABLE assessment_responses (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, assessment_session_id text NOT NULL, question_number integer NOT NULL, topic_id text NOT NULL, problem_id text NOT NULL, answer text NOT NULL, correct integer NOT NULL, response_ms integer, created_at text NOT NULL, FOREIGN KEY (assessment_session_id) REFERENCES assessment_sessions(id))',
  'CREATE INDEX ar_session_idx ON assessment_responses (assessment_session_id)',
  'CREATE UNIQUE INDEX ar_session_qnum_idx ON assessment_responses (assessment_session_id, question_number)',
];
