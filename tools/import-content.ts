/**
 * Import validated content/ JSON files into local D1 database.
 * Content is organized by discipline (one directory per discipline).
 * Usage: npx tsx tools/import-content.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { getContentDir } from "./content-dir.js";

const DB_PATH = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

function findDbFile(): string {
  if (!existsSync(DB_PATH)) {
    throw new Error(`D1 local directory not found at ${DB_PATH}. Run 'pnpm db:migrate' first.`);
  }
  const files = readdirSync(DB_PATH).filter((f) => f.endsWith(".sqlite"));
  if (files.length === 0) {
    throw new Error("No .sqlite file found in D1 directory.");
  }
  return join(DB_PATH, files[0]);
}

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
    strand?: string;
    problemIds?: string[];
    exampleIds?: string[];
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
  collections?: {
    id: string;
    name: string;
    description?: string;
    kind?: string;
    gradeRange?: string;
    topicIds: string[];
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
  source?: string;
};

type WorkedExample = {
  id: string;
  topicId: string;
  title: string;
  steps: {
    subgoalLabel: string;
    instruction: string;
    work: string;
    explanation: string;
  }[];
  visuals?: {
    type: string;
    params: Record<string, unknown>;
    alt: string;
  }[];
  flavor?: string;
  locale?: string;
  presentation?: string;
  contentDepth?: string;
};

type DisciplineData = {
  graph: GraphDefinition;
  problems: Map<string, Problem[]>;
  examples: Map<string, WorkedExample[]>;
};

function loadDiscipline(contentDir: string): DisciplineData {
  const graphPath = join(contentDir, "graph.json");
  const graph: GraphDefinition = JSON.parse(readFileSync(graphPath, "utf-8"));

  const problemsDirs = [join(contentDir, "problems"), join(contentDir, "problems-generated")];
  const problems = new Map<string, Problem[]>();
  for (const problemsDir of problemsDirs) {
    if (existsSync(problemsDir)) {
      for (const file of readdirSync(problemsDir).filter((f) => f.endsWith(".json"))) {
        const topicProblems: Problem[] = JSON.parse(readFileSync(join(problemsDir, file), "utf-8"));
        for (const p of topicProblems) {
          const list = problems.get(p.topicId) ?? [];
          list.push(p);
          problems.set(p.topicId, list);
        }
      }
    }
  }

  const examplesDir = join(contentDir, "examples");
  const examples = new Map<string, WorkedExample[]>();
  if (existsSync(examplesDir)) {
    for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
      const topicExamples: WorkedExample[] = JSON.parse(readFileSync(join(examplesDir, file), "utf-8"));
      for (const e of topicExamples) {
        const list = examples.get(e.topicId) ?? [];
        list.push(e);
        examples.set(e.topicId, list);
      }
    }
  }

  return { graph, problems, examples };
}

function clearDiscipline(db: InstanceType<typeof Database>, disciplineId: string) {
  db.exec(`DELETE FROM collection_topics WHERE collection_id IN (SELECT id FROM collections WHERE primary_discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM collections WHERE primary_discipline_id = '${disciplineId}'`);
  db.exec(`DELETE FROM group_session_participants WHERE group_session_id IN (SELECT id FROM group_sessions WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}'))`);
  db.exec(`DELETE FROM group_sessions WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM diagnostic_sessions WHERE discipline_id = '${disciplineId}'`);
  db.exec(`DELETE FROM assignment_responses WHERE assignment_id IN (SELECT id FROM assignments WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}'))`);
  db.exec(`DELETE FROM assignments WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM teach_sessions WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM review_log WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM user_topic_state WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM assessment_content WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM instructional_content WHERE topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM encompassings WHERE parent_topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM encompassings WHERE child_topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM prerequisites WHERE from_topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM prerequisites WHERE to_topic_id IN (SELECT id FROM topics WHERE discipline_id = '${disciplineId}')`);
  db.exec(`DELETE FROM topics WHERE discipline_id = '${disciplineId}'`);
}

// Cross-discipline references use "discipline:topic-id" format — strip prefix to get actual topic ID
const resolveTopicId = (id: string, currentDiscipline: string): string => {
  if (!id.includes(":")) return id;
  const [prefix, topicId] = id.split(":", 2);
  // If the prefix matches the current discipline, it's a same-discipline ref — just use the topic ID
  if (prefix === currentDiscipline) return topicId;
  // Cross-discipline ref — strip prefix since all topics are in one DB
  return topicId;
};

// Known discipline metadata (progression model lookup)
const DISCIPLINE_META: Record<string, { name: string; description: string; progressionModel: string }> = {
  math: { name: "Mathematics", description: "Mathematics from counting through algebra and statistics", progressionModel: "mastery-gated" },
  ela: { name: "English Language Arts", description: "Reading, writing, grammar, and vocabulary", progressionModel: "mastery-gated" },
  history: { name: "History", description: "Historical events, causes, and analysis", progressionModel: "context-layered" },
};

function main() {
  // Discover all disciplines
  const contentRoot = getContentDir();
  const disciplineDirs = readdirSync(contentRoot)
    .filter((d) => existsSync(join(contentRoot, d, "graph.json")))
    .sort();

  if (disciplineDirs.length === 0) {
    console.error("No disciplines found in content/");
    process.exit(1);
  }

  console.log(`Discovered ${disciplineDirs.length} disciplines: ${disciplineDirs.join(", ")}`);

  // Load all disciplines
  const disciplines: DisciplineData[] = disciplineDirs.map((d) => loadDiscipline(join(contentRoot, d)));

  // Connect to D1 SQLite
  const dbPath = findDbFile();
  console.log(`Using database: ${dbPath}`);
  const db = new Database(dbPath);

  // Phase 1: Clear all disciplines, upsert discipline rows, insert topics + content
  // (All topics must exist before inserting cross-discipline prerequisites)
  const upsertDiscipline = db.prepare(
    "INSERT INTO disciplines (id, name, description, progression_model, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, progression_model = excluded.progression_model"
  );

  for (const { graph, problems, examples } of disciplines) {
    const disciplineId = graph.disciplineId;
    console.log(`\n--- Importing ${graph.name} (${disciplineId}) ---`);
    clearDiscipline(db, disciplineId);

    // Upsert discipline
    const meta = DISCIPLINE_META[disciplineId] ?? { name: graph.name, description: graph.description ?? "", progressionModel: "mastery-gated" };
    upsertDiscipline.run(disciplineId, meta.name, meta.description, meta.progressionModel, new Date().toISOString());
    console.log(`Upserted discipline: ${meta.name} (${meta.progressionModel})`);

    // Insert topics
    const insertTopic = db.prepare(
      "INSERT INTO topics (id, discipline_id, name, description, depth, grade_level, strand, standard_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertTopics = db.transaction((topics: typeof graph.topics) => {
      for (const t of topics) {
        insertTopic.run(t.id, disciplineId, t.name, t.description, 0, t.gradeLevel, t.strand ?? null, t.standardCode, new Date().toISOString());
      }
    });
    insertTopics(graph.topics);
    console.log(`Inserted ${graph.topics.length} topics`);

    // Insert collections
    if (graph.collections && graph.collections.length > 0) {
      const insertCollection = db.prepare(
        "INSERT INTO collections (id, primary_discipline_id, name, description, kind, grade_range, display_order, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)"
      );
      const insertCollectionTopic = db.prepare(
        "INSERT INTO collection_topics (collection_id, topic_id, sort_order) VALUES (?, ?, ?)"
      );
      const insertCollections = db.transaction(() => {
        const now = new Date().toISOString();
        for (let i = 0; i < graph.collections!.length; i++) {
          const c = graph.collections![i];
          insertCollection.run(c.id, disciplineId, c.name, c.description ?? "", c.kind ?? "grade-band", c.gradeRange ?? null, i, now);
          for (let j = 0; j < c.topicIds.length; j++) {
            insertCollectionTopic.run(c.id, c.topicIds[j], j);
          }
        }
      });
      insertCollections();
      console.log(`Inserted ${graph.collections.length} collections`);
    }

    // Insert instructional content (worked examples)
    const insertInstruction = db.prepare(
      "INSERT INTO instructional_content (id, topic_id, flavor, locale, presentation, content_depth, version, title, steps_json, assets_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)"
    );
    let instructionCount = 0;
    const insertInstructions = db.transaction(() => {
      const now = new Date().toISOString();
      for (const [, topicExamples] of examples) {
        for (const e of topicExamples) {
          const assetsJson = e.visuals?.length ? JSON.stringify(e.visuals) : null;
          insertInstruction.run(e.id, e.topicId, e.flavor ?? "classic", e.locale ?? "en", e.presentation ?? "standard", e.contentDepth ?? "survey", e.title, JSON.stringify(e.steps), assetsJson, now, now);
          instructionCount++;
        }
      }
    });
    insertInstructions();
    console.log(`Inserted ${instructionCount} instructional content rows`);

    // Insert assessment content (problems)
    const insertAssessment = db.prepare(
      "INSERT INTO assessment_content (id, topic_id, flavor, locale, presentation, content_depth, version, type, difficulty, question, answer, hints_json, solution, cognitive_demand, key_prerequisite_id, source, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'text-qa', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    let assessmentCount = 0;
    const insertAssessments = db.transaction(() => {
      const now = new Date().toISOString();
      for (const [, topicProblems] of problems) {
        for (const p of topicProblems) {
          insertAssessment.run(p.id, p.topicId, p.flavor ?? "classic", p.locale ?? "en", p.presentation ?? "standard", p.contentDepth ?? "survey", p.difficulty, p.question, p.answer, JSON.stringify(p.hints), p.solution, p.cognitiveDemand ?? null, p.keyPrerequisiteId ?? null, p.source ?? "hand-authored", now);
          assessmentCount++;
        }
      }
    });
    insertAssessments();
    console.log(`Inserted ${assessmentCount} assessment content rows`);
  }

  // Phase 2: Insert prerequisites and encompassings for all disciplines
  // (Now all topics from all disciplines exist, so cross-discipline FKs resolve)
  const insertPrereq = db.prepare(
    "INSERT INTO prerequisites (from_topic_id, to_topic_id, strength, type) VALUES (?, ?, ?, ?)"
  );
  const insertEncomp = db.prepare(
    "INSERT INTO encompassings (parent_topic_id, child_topic_id, weight) VALUES (?, ?, ?)"
  );

  for (const { graph } of disciplines) {
    console.log(`\n--- Inserting edges for ${graph.name} ---`);

    const insertPrereqs = db.transaction((prereqs: typeof graph.prerequisites) => {
      for (const p of prereqs) {
        insertPrereq.run(resolveTopicId(p.from, graph.disciplineId), resolveTopicId(p.to, graph.disciplineId), p.strength, p.type ?? "required");
      }
    });
    insertPrereqs(graph.prerequisites);
    console.log(`Inserted ${graph.prerequisites.length} prerequisite edges`);

    if (graph.encompassings && graph.encompassings.length > 0) {
      const insertEncomps = db.transaction((encompassings: NonNullable<typeof graph.encompassings>) => {
        for (const e of encompassings) {
          insertEncomp.run(e.parent, e.child, e.weight);
        }
      });
      insertEncomps(graph.encompassings);
      console.log(`Inserted ${graph.encompassings.length} encompassing edges`);
    }

    // Validate DAG and compute depths
    const topicIds = new Set(graph.topics.map((t) => t.id));
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const id of topicIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }
    for (const p of graph.prerequisites) {
      const fromId = resolveTopicId(p.from, graph.disciplineId);
      if (!topicIds.has(fromId)) continue;
      adjacency.get(fromId)!.push(resolveTopicId(p.to, graph.disciplineId));
      inDegree.set(resolveTopicId(p.to, graph.disciplineId), (inDegree.get(resolveTopicId(p.to, graph.disciplineId)) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let processed = 0;
    const depths = new Map<string, number>();
    for (const id of topicIds) depths.set(id, 0);

    while (queue.length > 0) {
      const node = queue.shift()!;
      processed++;
      const nodeDepth = depths.get(node) ?? 0;
      for (const child of adjacency.get(node) ?? []) {
        depths.set(child, Math.max(depths.get(child) ?? 0, nodeDepth + 1));
        const newDeg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) queue.push(child);
      }
    }

    if (processed !== topicIds.size) {
      console.error(`DAG VALIDATION FAILED: ${topicIds.size - processed} topics in cycles`);
      process.exit(1);
    }
    console.log("DAG validation passed (no cycles)");

    const updateDepth = db.prepare("UPDATE topics SET depth = ? WHERE id = ?");
    const updateDepths = db.transaction(() => {
      for (const [id, depth] of depths) {
        updateDepth.run(depth, id);
      }
    });
    updateDepths();

    const maxDepth = Math.max(...depths.values());
    console.log(`Computed depths: max depth = ${maxDepth}`);
  }

  // Phase 3: Insert cross-discipline edges from centralized file
  const crossEdgePath = join(contentRoot, "cross-discipline-edges.json");
  if (existsSync(crossEdgePath)) {
    const crossFile = JSON.parse(readFileSync(crossEdgePath, "utf-8"));
    const crossEdges: { from: string; to: string; type: string; strength: number; rationale: string }[] = crossFile.edges ?? [];

    if (crossEdges.length > 0) {
      console.log(`\n--- Inserting cross-discipline edges ---`);
      const insertCrossEdges = db.transaction(() => {
        for (const edge of crossEdges) {
          const fromId = edge.from.split(":", 2)[1];
          const toId = edge.to.split(":", 2)[1];
          insertPrereq.run(fromId, toId, edge.strength, edge.type ?? "required");
        }
      });
      insertCrossEdges();
      console.log(`Inserted ${crossEdges.length} cross-discipline prerequisite edges`);
    }
  }

  console.log("\nImport complete!");
}

main();
