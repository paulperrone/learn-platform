/**
 * Database setup for simulation — creates an in-memory SQLite DB
 * with full schema and content imported.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import * as schema from "../../packages/api/src/db/schema.js";
import type { DB } from "../../packages/api/src/db/index.js";

// Full schema DDL extracted from test helpers
const SCHEMA_STATEMENTS = [
  'CREATE TABLE users (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL, email_verified integer DEFAULT 0 NOT NULL, image text, birth_year integer, managed_by text, role text, banned integer, ban_reason text, ban_expires text, created_at text NOT NULL, updated_at text NOT NULL)',
  'CREATE UNIQUE INDEX users_email_idx ON users (email)',
  'CREATE TABLE disciplines (id text PRIMARY KEY NOT NULL, name text NOT NULL, description text NOT NULL, progression_model text DEFAULT \'mastery-gated\' NOT NULL, created_at text NOT NULL)',
  'CREATE TABLE subjects (id text PRIMARY KEY NOT NULL, discipline_id text DEFAULT \'math\' NOT NULL, name text NOT NULL, description text NOT NULL, grade_range text NOT NULL, topic_count integer DEFAULT 0 NOT NULL, created_at text NOT NULL, FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX subjects_discipline_idx ON subjects (discipline_id)',
  'CREATE TABLE verifications (id text PRIMARY KEY NOT NULL, identifier text NOT NULL, value text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)',
  'CREATE TABLE organization (id text PRIMARY KEY NOT NULL, name text NOT NULL, slug text NOT NULL, logo text, metadata text, created_at text NOT NULL)',
  'CREATE UNIQUE INDEX org_slug_idx ON organization (slug)',
  'CREATE TABLE sessions (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, token text NOT NULL, expires_at text NOT NULL, ip_address text, user_agent text, active_organization_id text, impersonated_by text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX sessions_token_idx ON sessions (token)',
  'CREATE INDEX sessions_user_idx ON sessions (user_id)',
  'CREATE TABLE accounts (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, account_id text NOT NULL, provider_id text NOT NULL, access_token text, refresh_token text, access_token_expires_at text, refresh_token_expires_at text, scope text, id_token text, password text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE TABLE topics (id text PRIMARY KEY NOT NULL, subject_id text NOT NULL, name text NOT NULL, description text NOT NULL, depth integer DEFAULT 0 NOT NULL, grade_level integer NOT NULL, standard_code text, created_at text NOT NULL, FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE INDEX topics_subject_idx ON topics (subject_id)',
  'CREATE INDEX topics_depth_idx ON topics (depth)',
  'CREATE TABLE instructional_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'standard\' NOT NULL, content_depth text DEFAULT \'survey\' NOT NULL, version integer DEFAULT 1 NOT NULL, title text NOT NULL, steps_json text NOT NULL, assets_json text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ic_topic_idx ON instructional_content (topic_id)',
  'CREATE INDEX ic_dimensions_idx ON instructional_content (topic_id, flavor, locale, presentation, version)',
  'CREATE INDEX ic_depth_idx ON instructional_content (topic_id, content_depth)',
  'CREATE TABLE assessment_content (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL, flavor text DEFAULT \'classic\' NOT NULL, locale text DEFAULT \'en\' NOT NULL, presentation text DEFAULT \'standard\' NOT NULL, content_depth text DEFAULT \'survey\' NOT NULL, version integer DEFAULT 1 NOT NULL, type text DEFAULT \'text-qa\' NOT NULL, difficulty text NOT NULL, question text NOT NULL, answer text NOT NULL, hints_json text DEFAULT \'[]\' NOT NULL, solution text DEFAULT \'\' NOT NULL, type_properties text, cognitive_demand text, key_prerequisite_id text, created_at text NOT NULL, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ac_topic_idx ON assessment_content (topic_id)',
  'CREATE INDEX ac_dimensions_idx ON assessment_content (topic_id, flavor, locale, presentation, version)',
  'CREATE INDEX ac_type_idx ON assessment_content (topic_id, type)',
  'CREATE INDEX ac_depth_idx ON assessment_content (topic_id, content_depth)',
  'CREATE TABLE prerequisites (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, from_topic_id text NOT NULL, to_topic_id text NOT NULL, strength real DEFAULT 1 NOT NULL, type text DEFAULT \'required\' NOT NULL, FOREIGN KEY (from_topic_id) REFERENCES topics(id), FOREIGN KEY (to_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX prereq_unique_idx ON prerequisites (from_topic_id, to_topic_id)',
  'CREATE INDEX prereq_to_idx ON prerequisites (to_topic_id)',
  'CREATE TABLE encompassings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, parent_topic_id text NOT NULL, child_topic_id text NOT NULL, weight real DEFAULT 0.5 NOT NULL, FOREIGN KEY (parent_topic_id) REFERENCES topics(id), FOREIGN KEY (child_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX encomp_unique_idx ON encompassings (parent_topic_id, child_topic_id)',
  'CREATE INDEX encomp_parent_idx ON encompassings (parent_topic_id)',
  'CREATE TABLE user_topic_state (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, stability real DEFAULT 0 NOT NULL, difficulty real DEFAULT 0 NOT NULL, due text NOT NULL, state integer DEFAULT 0 NOT NULL, reps integer DEFAULT 0 NOT NULL, lapses integer DEFAULT 0 NOT NULL, mastered integer DEFAULT 0 NOT NULL, frontier integer DEFAULT 0 NOT NULL, consecutive_correct_reviews integer DEFAULT 0 NOT NULL, confidence_accuracy real, last_review text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX uts_user_topic_idx ON user_topic_state (user_id, topic_id)',
  'CREATE INDEX uts_user_frontier_idx ON user_topic_state (user_id, frontier)',
  'CREATE INDEX uts_user_due_idx ON user_topic_state (user_id, due)',
  'CREATE INDEX uts_user_mastered_idx ON user_topic_state (user_id, mastered)',
  'CREATE TABLE user_topic_depth (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, content_depth text NOT NULL, completed integer DEFAULT 0 NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX utd_user_topic_depth_idx ON user_topic_depth (user_id, topic_id, content_depth)',
  'CREATE INDEX utd_user_topic_idx ON user_topic_depth (user_id, topic_id)',
  'CREATE TABLE review_log (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, assessment_content_id text, rating integer NOT NULL, confidence integer, correct integer NOT NULL, response_ms integer NOT NULL, phase text NOT NULL, hints_used integer, misconception integer, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX review_user_idx ON review_log (user_id)',
  'CREATE INDEX review_topic_idx ON review_log (topic_id)',
  'CREATE INDEX review_assessment_idx ON review_log (assessment_content_id)',
  'CREATE TABLE learn_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, started_at text NOT NULL, ended_at text, state_json text, updated_at text NOT NULL DEFAULT \'\', topics_attempted integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, reviews_completed integer DEFAULT 0 NOT NULL, average_accuracy real, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX learn_sessions_user_idx ON learn_sessions (user_id)',
  'CREATE INDEX learn_sessions_active_idx ON learn_sessions (user_id, ended_at)',
  'CREATE INDEX learn_sessions_anon_idx ON learn_sessions (anonymous_token)',
  'CREATE TABLE llm_usage (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cost_cents real NOT NULL, purpose text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX llm_usage_user_idx ON llm_usage (user_id)',
  'CREATE TABLE user_subject_presentation (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, subject_id text NOT NULL, primary_weight real DEFAULT 0 NOT NULL, intermediate_weight real DEFAULT 0 NOT NULL, standard_weight real DEFAULT 0 NOT NULL, advanced_weight real DEFAULT 0 NOT NULL, center_level text DEFAULT \'standard\' NOT NULL, last_adjusted_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE UNIQUE INDEX usp_user_subject_idx ON user_subject_presentation (user_id, subject_id)',
  'CREATE TABLE presentation_drift_log (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, subject_id text NOT NULL, from_weights text NOT NULL, to_weights text NOT NULL, from_center text NOT NULL, to_center text NOT NULL, trigger text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE INDEX pdl_user_subject_idx ON presentation_drift_log (user_id, subject_id)',
  'CREATE TABLE user_preferences (user_id text PRIMARY KEY NOT NULL, tts_enabled integer DEFAULT true NOT NULL, tts_rate real DEFAULT 0.9 NOT NULL, tts_voice_name text, tts_auto_read integer DEFAULT false NOT NULL, stt_enabled integer DEFAULT true NOT NULL, presentation_override text, daily_goal_type text DEFAULT \'minutes\' NOT NULL, daily_goal_target integer DEFAULT 20 NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE TABLE user_fsrs_params (user_id text PRIMARY KEY NOT NULL, request_retention real DEFAULT 0.9 NOT NULL, w_json text, review_count integer DEFAULT 0 NOT NULL, computed_at text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE TABLE llm_model_config (tier text PRIMARY KEY NOT NULL, model_id text NOT NULL, cost_input_per_m real NOT NULL, cost_output_per_m real NOT NULL, updated_at text NOT NULL)',
  'CREATE TABLE member (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, organization_id text NOT NULL, role text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (organization_id) REFERENCES organization(id))',
  'CREATE INDEX member_org_idx ON member (organization_id)',
  'CREATE INDEX member_user_idx ON member (user_id)',
  'CREATE TABLE invitation (id text PRIMARY KEY NOT NULL, email text NOT NULL, inviter_id text NOT NULL, organization_id text NOT NULL, role text NOT NULL, status text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, FOREIGN KEY (inviter_id) REFERENCES users(id), FOREIGN KEY (organization_id) REFERENCES organization(id))',
  'CREATE INDEX invitation_org_idx ON invitation (organization_id)',
  'CREATE TABLE account_links (id text PRIMARY KEY NOT NULL, from_user_id text NOT NULL, to_user_id text NOT NULL, type text NOT NULL, permissions text, status text DEFAULT \'active\' NOT NULL, created_at text NOT NULL, FOREIGN KEY (from_user_id) REFERENCES users(id), FOREIGN KEY (to_user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX al_from_to_type_idx ON account_links (from_user_id, to_user_id, type)',
  'CREATE INDEX al_to_user_idx ON account_links (to_user_id)',
  'CREATE INDEX al_from_user_idx ON account_links (from_user_id)',
  'CREATE TABLE teach_sessions (id text PRIMARY KEY NOT NULL, teacher_id text NOT NULL, topic_id text NOT NULL, started_at text NOT NULL, ended_at text, notes text, FOREIGN KEY (teacher_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX ts_teacher_idx ON teach_sessions (teacher_id)',
  'CREATE INDEX ts_topic_idx ON teach_sessions (topic_id)',
  'CREATE TABLE assignments (id text PRIMARY KEY NOT NULL, teacher_id text NOT NULL, topic_id text NOT NULL, share_code text NOT NULL, title text NOT NULL, description text, max_problems integer, created_at text NOT NULL, expires_at text, FOREIGN KEY (teacher_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX assign_code_idx ON assignments (share_code)',
  'CREATE INDEX assign_teacher_idx ON assignments (teacher_id)',
  'CREATE TABLE assignment_responses (id text PRIMARY KEY NOT NULL, assignment_id text NOT NULL, user_id text, anonymous_token text, question_id text NOT NULL, answer text NOT NULL, correct integer, created_at text NOT NULL, FOREIGN KEY (assignment_id) REFERENCES assignments(id))',
  'CREATE INDEX ar_assignment_idx ON assignment_responses (assignment_id)',
  'CREATE INDEX ar_user_idx ON assignment_responses (user_id)',
  'CREATE TABLE diagnostic_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, subject_id text NOT NULL, status text DEFAULT \'active\' NOT NULL, questions_asked integer DEFAULT 0 NOT NULL, questions_correct integer DEFAULT 0 NOT NULL, estimated_frontier_json text, topic_estimates_json text, state_json text, is_taste integer DEFAULT 0 NOT NULL, created_at text NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (subject_id) REFERENCES subjects(id))',
  'CREATE INDEX diag_user_idx ON diagnostic_sessions (user_id)',
  'CREATE INDEX diag_anon_idx ON diagnostic_sessions (anonymous_token)',
  'CREATE TABLE onboarding_state (user_id text PRIMARY KEY NOT NULL, step integer DEFAULT 0 NOT NULL, diagnostic_session_id text, completed_at text, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE TABLE group_sessions (id text PRIMARY KEY NOT NULL, facilitator_id text NOT NULL, type text NOT NULL, topic_id text, join_code text, status text DEFAULT \'active\' NOT NULL, settings_json text, started_at text NOT NULL, ended_at text, FOREIGN KEY (facilitator_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX gs_facilitator_idx ON group_sessions (facilitator_id)',
  'CREATE UNIQUE INDEX gs_join_code_idx ON group_sessions (join_code)',
  'CREATE INDEX gs_status_idx ON group_sessions (facilitator_id, status)',
  'CREATE TABLE daily_activity (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, date text NOT NULL, minutes_active integer DEFAULT 0 NOT NULL, problems_completed integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, goal_met integer DEFAULT 0 NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX da_user_date_idx ON daily_activity (user_id, date)',
  'CREATE INDEX da_user_goal_idx ON daily_activity (user_id, goal_met)',
  'CREATE TABLE group_session_participants (id text PRIMARY KEY NOT NULL, group_session_id text NOT NULL, user_id text, anonymous_token text, display_name text, role text DEFAULT \'student\' NOT NULL, current_topic_id text, current_phase text, total_correct integer DEFAULT 0 NOT NULL, total_attempts integer DEFAULT 0 NOT NULL, joined_at text NOT NULL, left_at text, FOREIGN KEY (group_session_id) REFERENCES group_sessions(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (current_topic_id) REFERENCES topics(id))',
  'CREATE INDEX gsp_session_idx ON group_session_participants (group_session_id)',
  'CREATE INDEX gsp_user_idx ON group_session_participants (user_id)',
];

type GraphDefinition = {
  subjectId: string;
  subjectName: string;
  description?: string;
  gradeRange?: string;
  disciplineId?: string;
  topics: {
    id: string;
    name: string;
    description: string;
    gradeLevel: number;
    standardCode: string | null;
  }[];
  prerequisites: {
    from: string;
    to: string;
    strength: number;
    type?: "required" | "recommended" | "enriching";
  }[];
  encompassings?: {
    parent: string;
    child: string;
    weight: number;
  }[];
};

type Problem = {
  id: string;
  topicId: string;
  difficulty: string;
  question: string;
  answer: string;
  hints: string[];
  solution: string;
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
  keyPrerequisiteId?: string;
  cognitiveDemand?: string;
};

type WorkedExample = {
  id: string;
  topicId: string;
  title: string;
  steps: { subgoalLabel: string; instruction: string; work: string; explanation: string }[];
  visuals?: { type: string; params: Record<string, unknown>; alt: string }[];
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
};

export function createSimulationDb(subject: string): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Apply schema
  for (const stmt of SCHEMA_STATEMENTS) {
    sqlite.exec(stmt);
  }

  // Import content
  const contentDir = join(process.cwd(), "content", subject);
  const graphPath = join(contentDir, "graph.json");

  if (!existsSync(graphPath)) {
    throw new Error(`graph.json not found at ${graphPath}`);
  }

  const graph: GraphDefinition = JSON.parse(readFileSync(graphPath, "utf-8"));
  const now = new Date().toISOString();

  // Insert discipline
  sqlite.prepare(
    "INSERT OR IGNORE INTO disciplines (id, name, description, progression_model, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(graph.disciplineId ?? "math", "Mathematics", "Foundational Mathematics", "mastery-gated", now);

  // Insert subject
  sqlite.prepare(
    "INSERT INTO subjects (id, discipline_id, name, description, grade_range, topic_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(graph.subjectId, graph.disciplineId ?? "math", graph.subjectName, graph.description ?? "", graph.gradeRange ?? "K-5", graph.topics.length, now);

  // Insert topics
  const insertTopic = sqlite.prepare(
    "INSERT INTO topics (id, subject_id, name, description, depth, grade_level, standard_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const t of graph.topics) {
    insertTopic.run(t.id, graph.subjectId, t.name, t.description, t.gradeLevel, t.gradeLevel, t.standardCode, now);
  }

  // Insert prerequisites
  const insertPrereq = sqlite.prepare(
    "INSERT INTO prerequisites (from_topic_id, to_topic_id, strength, type) VALUES (?, ?, ?, ?)"
  );
  for (const p of graph.prerequisites) {
    insertPrereq.run(p.from, p.to, p.strength, p.type ?? "required");
  }

  // Insert encompassings
  if (graph.encompassings) {
    const insertEncomp = sqlite.prepare(
      "INSERT INTO encompassings (parent_topic_id, child_topic_id, weight) VALUES (?, ?, ?)"
    );
    for (const e of graph.encompassings) {
      insertEncomp.run(e.parent, e.child, e.weight);
    }
  }

  // Import problems
  const problemsDir = join(contentDir, "problems");
  if (existsSync(problemsDir)) {
    const insertProblem = sqlite.prepare(
      "INSERT INTO assessment_content (id, topic_id, flavor, locale, presentation, content_depth, version, type, difficulty, question, answer, hints_json, solution, type_properties, cognitive_demand, key_prerequisite_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const file of readdirSync(problemsDir).filter((f) => f.endsWith(".json"))) {
      const problems: Problem[] = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
      for (const p of problems) {
        insertProblem.run(
          p.id, p.topicId,
          p.flavor ?? "classic", p.locale ?? "en",
          p.presentation ?? "standard", p.contentDepth ?? "survey",
          1, "text-qa", p.difficulty, p.question, p.answer,
          JSON.stringify(p.hints), p.solution,
          null, p.cognitiveDemand ?? null, p.keyPrerequisiteId ?? null,
          now
        );
      }
    }
  }

  // Import worked examples
  const examplesDir = join(contentDir, "examples");
  if (existsSync(examplesDir)) {
    const insertExample = sqlite.prepare(
      "INSERT INTO instructional_content (id, topic_id, flavor, locale, presentation, content_depth, version, title, steps_json, assets_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
      const examples: WorkedExample[] = JSON.parse(readFileSync(join(examplesDir, file), "utf-8"));
      for (const e of examples) {
        insertExample.run(
          e.id, e.topicId,
          e.flavor ?? "classic", e.locale ?? "en",
          e.presentation ?? "standard", e.contentDepth ?? "survey",
          1, e.title, JSON.stringify(e.steps),
          e.visuals ? JSON.stringify(e.visuals) : null,
          now, now
        );
      }
    }
  }

  // Create Drizzle instance — cast to DB (DrizzleD1Database) since the
  // query builder API is compatible at runtime despite different TS types
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  return db;
}

/** Create a simulated user in the database */
export function createSimUser(
  db: DB,
  userId: string,
  name: string,
  age: number
): void {
  const now = new Date().toISOString();
  const birthYear = new Date().getFullYear() - age;
  // Use raw SQL since we're casting DB types
  const rawDb = (db as any).session?.client ?? (db as any);
  if (typeof rawDb.prepare === "function") {
    rawDb.prepare(
      "INSERT INTO users (id, name, email, email_verified, birth_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(userId, name, `${userId}@simulation.local`, 1, birthYear, now, now);
  }
}
