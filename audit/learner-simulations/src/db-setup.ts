/**
 * Database setup for simulation — creates an in-memory SQLite DB
 * with full schema and content imported.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

export function resolveContentDir(): string {
  if (process.env.CONTENT_DIR) return resolve(process.env.CONTENT_DIR);
  const sibling = join(process.cwd(), "..", "learn-content");
  if (existsSync(sibling)) return sibling;
  return join(process.cwd(), "content");
}
import * as schema from "../../../packages/api/src/db/schema.js";
import type { DB } from "../../../packages/api/src/db/index.js";

// Full schema DDL extracted from test helpers
const SCHEMA_STATEMENTS = [
  'CREATE TABLE users (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL, email_verified integer DEFAULT 0 NOT NULL, image text, birth_year integer, managed_by text, role text, banned integer, ban_reason text, ban_expires text, created_at text NOT NULL, updated_at text NOT NULL)',
  'CREATE UNIQUE INDEX users_email_idx ON users (email)',
  'CREATE TABLE disciplines (id text PRIMARY KEY NOT NULL, name text NOT NULL, description text NOT NULL, progression_model text DEFAULT \'mastery-gated\' NOT NULL, created_at text NOT NULL)',
  'CREATE TABLE collections (id text PRIMARY KEY NOT NULL, primary_discipline_id text NOT NULL, name text NOT NULL, description text NOT NULL, kind text DEFAULT \'grade-band\' NOT NULL, grade_range text, display_order integer DEFAULT 0 NOT NULL, visibility text DEFAULT \'published\' NOT NULL, created_at text NOT NULL, FOREIGN KEY (primary_discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX collections_discipline_idx ON collections (primary_discipline_id)',
  'CREATE TABLE collection_topics (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, collection_id text NOT NULL, topic_id text NOT NULL, FOREIGN KEY (collection_id) REFERENCES collections(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX ct_collection_topic_idx ON collection_topics (collection_id, topic_id)',
  'CREATE INDEX ct_topic_idx ON collection_topics (topic_id)',
  'CREATE TABLE verifications (id text PRIMARY KEY NOT NULL, identifier text NOT NULL, value text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)',
  'CREATE TABLE organization (id text PRIMARY KEY NOT NULL, name text NOT NULL, slug text NOT NULL, logo text, metadata text, created_at text NOT NULL)',
  'CREATE UNIQUE INDEX org_slug_idx ON organization (slug)',
  'CREATE TABLE sessions (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, token text NOT NULL, expires_at text NOT NULL, ip_address text, user_agent text, active_organization_id text, impersonated_by text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE UNIQUE INDEX sessions_token_idx ON sessions (token)',
  'CREATE INDEX sessions_user_idx ON sessions (user_id)',
  'CREATE TABLE accounts (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, account_id text NOT NULL, provider_id text NOT NULL, access_token text, refresh_token text, access_token_expires_at text, refresh_token_expires_at text, scope text, id_token text, password text, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE TABLE topics (id text PRIMARY KEY NOT NULL, discipline_id text NOT NULL, name text NOT NULL, description text NOT NULL, depth integer DEFAULT 0 NOT NULL, grade_level integer NOT NULL, strand text, standard_code text, created_at text NOT NULL, FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX topics_discipline_idx ON topics (discipline_id)',
  'CREATE INDEX topics_depth_idx ON topics (depth)',
  'CREATE TABLE topic_content_versions (topic_id text PRIMARY KEY NOT NULL, content_hash text NOT NULL, bundle_version integer DEFAULT 1 NOT NULL, problems_count integer DEFAULT 0 NOT NULL, examples_count integer DEFAULT 0 NOT NULL, generated_at text NOT NULL, uploaded_at text, FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE TABLE prerequisites (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, from_topic_id text NOT NULL, to_topic_id text NOT NULL, strength real DEFAULT 1 NOT NULL, type text DEFAULT \'required\' NOT NULL, FOREIGN KEY (from_topic_id) REFERENCES topics(id), FOREIGN KEY (to_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX prereq_unique_idx ON prerequisites (from_topic_id, to_topic_id)',
  'CREATE INDEX prereq_to_idx ON prerequisites (to_topic_id)',
  'CREATE TABLE encompassings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, parent_topic_id text NOT NULL, child_topic_id text NOT NULL, weight real DEFAULT 0.5 NOT NULL, FOREIGN KEY (parent_topic_id) REFERENCES topics(id), FOREIGN KEY (child_topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX encomp_unique_idx ON encompassings (parent_topic_id, child_topic_id)',
  'CREATE INDEX encomp_parent_idx ON encompassings (parent_topic_id)',
  'CREATE TABLE user_topic_state (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, stability real DEFAULT 0 NOT NULL, difficulty real DEFAULT 0 NOT NULL, due text NOT NULL, state integer DEFAULT 0 NOT NULL, reps integer DEFAULT 0 NOT NULL, lapses integer DEFAULT 0 NOT NULL, mastered integer DEFAULT 0 NOT NULL, frontier integer DEFAULT 0 NOT NULL, consecutive_correct_reviews integer DEFAULT 0 NOT NULL, consecutive_incorrect_reviews integer DEFAULT 0 NOT NULL, confidence_accuracy real, last_review text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX uts_user_topic_idx ON user_topic_state (user_id, topic_id)',
  'CREATE INDEX uts_user_frontier_idx ON user_topic_state (user_id, frontier)',
  'CREATE INDEX uts_user_due_idx ON user_topic_state (user_id, due)',
  'CREATE INDEX uts_user_mastered_idx ON user_topic_state (user_id, mastered)',
  'CREATE TABLE user_topic_depth (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, content_depth text NOT NULL, completed integer DEFAULT 0 NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE UNIQUE INDEX utd_user_topic_depth_idx ON user_topic_depth (user_id, topic_id, content_depth)',
  'CREATE INDEX utd_user_topic_idx ON user_topic_depth (user_id, topic_id)',
  'CREATE TABLE review_log (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, topic_id text NOT NULL, assessment_content_id text, rating integer NOT NULL, confidence integer, correct integer NOT NULL, response_ms integer NOT NULL, phase text NOT NULL, hints_used integer, misconception integer, content_version text, llm_assisted integer DEFAULT 0, hint_source text, scaffolding text, implicit integer NOT NULL DEFAULT 0, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (topic_id) REFERENCES topics(id))',
  'CREATE INDEX review_user_idx ON review_log (user_id)',
  'CREATE INDEX review_topic_idx ON review_log (topic_id)',
  'CREATE INDEX review_assessment_idx ON review_log (assessment_content_id)',
  'CREATE TABLE learn_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, started_at text NOT NULL, ended_at text, state_json text, updated_at text NOT NULL DEFAULT \'\', topics_attempted integer DEFAULT 0 NOT NULL, topics_mastered integer DEFAULT 0 NOT NULL, reviews_completed integer DEFAULT 0 NOT NULL, average_accuracy real, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX learn_sessions_user_idx ON learn_sessions (user_id)',
  'CREATE INDEX learn_sessions_active_idx ON learn_sessions (user_id, ended_at)',
  'CREATE INDEX learn_sessions_anon_idx ON learn_sessions (anonymous_token)',
  'CREATE TABLE llm_usage (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cost_cents real NOT NULL, purpose text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))',
  'CREATE INDEX llm_usage_user_idx ON llm_usage (user_id)',
  'CREATE TABLE user_discipline_presentation (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, discipline_id text NOT NULL, primary_weight real DEFAULT 0 NOT NULL, intermediate_weight real DEFAULT 0 NOT NULL, standard_weight real DEFAULT 0 NOT NULL, advanced_weight real DEFAULT 0 NOT NULL, center_level text DEFAULT \'standard\' NOT NULL, drift_signal real DEFAULT 0 NOT NULL, last_adjusted_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE UNIQUE INDEX udp_user_discipline_idx ON user_discipline_presentation (user_id, discipline_id)',
  'CREATE TABLE presentation_drift_log (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, user_id text NOT NULL, discipline_id text NOT NULL, from_weights text NOT NULL, to_weights text NOT NULL, from_center text NOT NULL, to_center text NOT NULL, trigger text NOT NULL, created_at text NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
  'CREATE INDEX pdl_user_discipline_idx ON presentation_drift_log (user_id, discipline_id)',
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
  'CREATE TABLE diagnostic_sessions (id text PRIMARY KEY NOT NULL, user_id text, anonymous_token text, discipline_id text NOT NULL, status text DEFAULT \'active\' NOT NULL, questions_asked integer DEFAULT 0 NOT NULL, questions_correct integer DEFAULT 0 NOT NULL, estimated_frontier_json text, topic_estimates_json text, state_json text, is_taste integer DEFAULT 0 NOT NULL, created_at text NOT NULL, completed_at text, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (discipline_id) REFERENCES disciplines(id))',
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
  disciplineId: string;
  name: string;
  description?: string;
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

export function createSimulationDb(discipline: string): DB {
  return createSimulationDbMulti([discipline]);
}

/** Discipline metadata for inserting into the DB */
const DISCIPLINE_METADATA: Record<string, { name: string; description: string; progressionModel: string }> = {
  math: { name: "Mathematics", description: "Mathematics", progressionModel: "mastery-gated" },
  ela: { name: "English Language Arts", description: "English Language Arts", progressionModel: "mastery-gated" },
  history: { name: "History", description: "History & Social Studies", progressionModel: "context-layered" },
};

/**
 * Create an in-memory simulation DB with one or more disciplines loaded.
 * Cross-discipline prerequisite edges (e.g. "ela:reading-comprehension")
 * are resolved by stripping the discipline prefix — the referenced topic must be
 * loaded in one of the specified disciplines.
 */
export function createSimulationDbMulti(disciplines: string[]): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  for (const stmt of SCHEMA_STATEMENTS) {
    sqlite.exec(stmt);
  }

  const now = new Date().toISOString();
  const insertTopic = sqlite.prepare(
    "INSERT INTO topics (id, discipline_id, name, description, depth, grade_level, strand, standard_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertContentVersion = sqlite.prepare(
    "INSERT OR REPLACE INTO topic_content_versions (topic_id, content_hash, bundle_version, problems_count, examples_count, generated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  // Phase 1: Load all disciplines — graph structure only (content fetched from filesystem via ContentBucket)
  const allGraphs: GraphDefinition[] = [];
  for (const discipline of disciplines) {
    const contentDir = join(resolveContentDir(), discipline);
    const graphPath = join(contentDir, "graph.json");
    if (!existsSync(graphPath)) {
      throw new Error(`graph.json not found at ${graphPath}`);
    }

    const graph: GraphDefinition = JSON.parse(readFileSync(graphPath, "utf-8"));
    allGraphs.push(graph);

    // Insert discipline
    const discId = graph.disciplineId;
    const discMeta = DISCIPLINE_METADATA[discId] ?? { name: discId, description: discId, progressionModel: "mastery-gated" };
    sqlite.prepare(
      "INSERT OR IGNORE INTO disciplines (id, name, description, progression_model, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(discId, discMeta.name, discMeta.description, discMeta.progressionModel, now);

    // Insert topics and placeholder content versions
    const problemsDir = join(contentDir, "problems");
    const problemsGeneratedDir = join(contentDir, "problems-generated");
    const examplesDir = join(contentDir, "examples");
    for (const t of graph.topics) {
      insertTopic.run(t.id, discId, t.name, t.description, t.gradeLevel, t.gradeLevel, t.strand ?? null, t.standardCode, now);

      // Count problems/examples from filesystem for content version metadata
      let problemsCount = 0;
      let examplesCount = 0;
      const pPath = join(problemsDir, `${t.id}.json`);
      if (existsSync(pPath)) {
        problemsCount = JSON.parse(readFileSync(pPath, "utf-8")).length;
      }
      const pgPath = join(problemsGeneratedDir, `${t.id}.json`);
      if (existsSync(pgPath)) {
        problemsCount += JSON.parse(readFileSync(pgPath, "utf-8")).length;
      }
      const ePath = join(examplesDir, `${t.id}.json`);
      if (existsSync(ePath)) {
        examplesCount = JSON.parse(readFileSync(ePath, "utf-8")).length;
      }
      if (problemsCount > 0 || examplesCount > 0) {
        insertContentVersion.run(t.id, `sim:${t.id}`, 1, problemsCount, examplesCount, now);
      }
    }
  }

  // Phase 2: Insert all edges (prerequisites + encompassings) after all topics are loaded
  // This ensures cross-discipline FKs resolve correctly
  // Build set of loaded topic IDs to skip dangling cross-discipline edges
  const loadedTopicIds = new Set<string>();
  for (const graph of allGraphs) {
    for (const t of graph.topics) {
      loadedTopicIds.add(t.id);
    }
  }

  const insertPrereq = sqlite.prepare(
    "INSERT OR IGNORE INTO prerequisites (from_topic_id, to_topic_id, strength, type) VALUES (?, ?, ?, ?)"
  );
  const insertEncomp = sqlite.prepare(
    "INSERT OR IGNORE INTO encompassings (parent_topic_id, child_topic_id, weight) VALUES (?, ?, ?)"
  );

  for (const graph of allGraphs) {
    for (const p of graph.prerequisites) {
      // Resolve cross-discipline topic IDs: "ela:reading-comprehension" → "reading-comprehension"
      const fromId = resolveTopicId(p.from);
      const toId = resolveTopicId(p.to);
      // Skip edges referencing topics not loaded (cross-discipline edges in single-discipline mode)
      if (!loadedTopicIds.has(fromId) || !loadedTopicIds.has(toId)) continue;
      insertPrereq.run(fromId, toId, p.strength, p.type ?? "required");
    }

    if (graph.encompassings) {
      for (const e of graph.encompassings) {
        const parentId = resolveTopicId(e.parent);
        const childId = resolveTopicId(e.child);
        if (!loadedTopicIds.has(parentId) || !loadedTopicIds.has(childId)) continue;
        insertEncomp.run(parentId, childId, e.weight);
      }
    }
  }

  const db = drizzle(sqlite, { schema }) as unknown as DB;
  return db;
}

/** Strip cross-discipline prefix: "ela:reading-comprehension" → "reading-comprehension" */
function resolveTopicId(id: string): string {
  const colonIdx = id.indexOf(":");
  return colonIdx >= 0 ? id.substring(colonIdx + 1) : id;
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
