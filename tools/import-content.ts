/**
 * Import validated content/ JSON files into local D1 database.
 * Usage: npx tsx tools/import-content.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";

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
  subjectId: string;
  subjectName: string;
  description?: string;
  gradeRange?: string;
  topics: {
    id: string;
    name: string;
    description: string;
    gradeLevel: number;
    standardCode: string | null;
    problemIds?: string[];
    exampleIds?: string[];
  }[];
  prerequisites: {
    from: string;
    to: string;
    strength: number;
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
};

function main() {
  const contentDir = join(process.cwd(), "content", "math-k5");
  const graphPath = join(contentDir, "graph.json");

  if (!existsSync(graphPath)) {
    console.error(`graph.json not found at ${graphPath}`);
    process.exit(1);
  }

  const graph: GraphDefinition = JSON.parse(readFileSync(graphPath, "utf-8"));

  // Load problems
  const problemsDir = join(contentDir, "problems");
  const problems = new Map<string, Problem[]>();
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

  // Load examples
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

  // Connect to D1 SQLite
  const dbPath = findDbFile();
  console.log(`Using database: ${dbPath}`);
  const db = new Database(dbPath);

  // Clear existing data for this subject
  db.exec("DELETE FROM encompassings WHERE parent_topic_id IN (SELECT id FROM topics WHERE subject_id = ?)".replace("?", `'${graph.subjectId}'`));
  db.exec("DELETE FROM prerequisites WHERE from_topic_id IN (SELECT id FROM topics WHERE subject_id = ?)".replace("?", `'${graph.subjectId}'`));
  db.exec(`DELETE FROM topics WHERE subject_id = '${graph.subjectId}'`);
  db.exec(`DELETE FROM subjects WHERE id = '${graph.subjectId}'`);

  // Insert subject
  const insertSubject = db.prepare(
    "INSERT INTO subjects (id, name, description, grade_range, topic_count, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  insertSubject.run(
    graph.subjectId,
    graph.subjectName,
    graph.description ?? "",
    graph.gradeRange ?? "K-5",
    graph.topics.length,
    new Date().toISOString()
  );
  console.log(`Inserted subject: ${graph.subjectName}`);

  // Insert topics
  const insertTopic = db.prepare(
    "INSERT INTO topics (id, subject_id, name, description, depth, grade_level, standard_code, problems_json, examples_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertTopics = db.transaction((topics: typeof graph.topics) => {
    for (const t of topics) {
      const topicProblems = problems.get(t.id) ?? [];
      const topicExamples = examples.get(t.id) ?? [];
      insertTopic.run(
        t.id,
        graph.subjectId,
        t.name,
        t.description,
        0, // depth computed later
        t.gradeLevel,
        t.standardCode,
        JSON.stringify(topicProblems),
        JSON.stringify(topicExamples),
        new Date().toISOString()
      );
    }
  });
  insertTopics(graph.topics);
  console.log(`Inserted ${graph.topics.length} topics`);

  // Insert prerequisites
  const insertPrereq = db.prepare(
    "INSERT INTO prerequisites (from_topic_id, to_topic_id, strength) VALUES (?, ?, ?)"
  );
  const insertPrereqs = db.transaction((prereqs: typeof graph.prerequisites) => {
    for (const p of prereqs) {
      insertPrereq.run(p.from, p.to, p.strength);
    }
  });
  insertPrereqs(graph.prerequisites);
  console.log(`Inserted ${graph.prerequisites.length} prerequisite edges`);

  // Insert encompassings
  if (graph.encompassings && graph.encompassings.length > 0) {
    const insertEncomp = db.prepare(
      "INSERT INTO encompassings (parent_topic_id, child_topic_id, weight) VALUES (?, ?, ?)"
    );
    const insertEncomps = db.transaction((encompassings: NonNullable<typeof graph.encompassings>) => {
      for (const e of encompassings) {
        insertEncomp.run(e.parent, e.child, e.weight);
      }
    });
    insertEncomps(graph.encompassings);
    console.log(`Inserted ${graph.encompassings.length} encompassing edges`);
  }

  // Validate DAG
  const topicIds = new Set(graph.topics.map((t) => t.id));
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of topicIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const p of graph.prerequisites) {
    adjacency.get(p.from)!.push(p.to);
    inDegree.set(p.to, (inDegree.get(p.to) ?? 0) + 1);
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

  // Update depths
  const updateDepth = db.prepare("UPDATE topics SET depth = ? WHERE id = ?");
  const updateDepths = db.transaction(() => {
    for (const [id, depth] of depths) {
      updateDepth.run(depth, id);
    }
  });
  updateDepths();

  const maxDepth = Math.max(...depths.values());
  console.log(`Computed depths: max depth = ${maxDepth}`);
  console.log("Import complete!");
}

main();
