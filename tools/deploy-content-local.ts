/**
 * Deploy content bundles to local R2 + D1 for development.
 *
 * Directly writes to miniflare's SQLite-backed R2 and D1, much faster than
 * calling `wrangler r2 object put` per file.
 *
 * Usage:
 *   npx tsx tools/deploy-content-local.ts [--discipline <name>]
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash, randomUUID } from "crypto";
import Database from "better-sqlite3";
import { getContentDir } from "./content-dir.js";
import { execSync } from "child_process";

function parseArgs(): { discipline?: string } {
  const args = process.argv.slice(2);
  let discipline: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--discipline" && args[i + 1]) {
      discipline = args[++i];
    }
  }
  return { discipline };
}

function findFile(dir: string, pattern: string): string | null {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir);
  const match = entries.find((e) => e.endsWith(".sqlite"));
  return match ? join(dir, match) : null;
}

function main() {
  const { discipline } = parseArgs();
  const contentDir = getContentDir();

  // Step 1: Generate bundles to temp dir
  const bundleDir = "/tmp/learn-content-bundles";
  console.log("Generating bundles...");
  execSync(
    `CONTENT_DIR="${contentDir}" npx tsx tools/generate-bundles.ts --out ${bundleDir}${discipline ? ` --discipline ${discipline}` : ""}`,
    { stdio: "inherit" }
  );

  // Step 2: Import graph structure into local D1 (topics must exist before content versions)
  console.log("\nImporting graph...");
  execSync(
    `CONTENT_DIR="${contentDir}" npx tsx tools/import-content.ts`,
    { stdio: "inherit" }
  );

  // Find miniflare R2 SQLite + blob dir
  const r2Dir = ".wrangler/state/v3/r2/miniflare-R2BucketObject";
  const r2SqlitePath = findFile(r2Dir, "*.sqlite");
  if (!r2SqlitePath) {
    console.error("Local R2 database not found. Run `just dev` once first to initialize it.");
    process.exit(1);
  }
  const blobDir = ".wrangler/state/v3/r2/learn-content/blobs";
  mkdirSync(blobDir, { recursive: true });

  // Find miniflare D1 SQLite
  const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const d1SqlitePath = findFile(d1Dir, "*.sqlite");
  if (!d1SqlitePath) {
    console.error("Local D1 database not found. Run `just dev` once first to initialize it.");
    process.exit(1);
  }

  const r2Db = new Database(r2SqlitePath);
  const d1Db = new Database(d1SqlitePath);

  // Prepare statements
  const insertObj = r2Db.prepare(`
    INSERT OR REPLACE INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
    VALUES (?, ?, ?, ?, ?, ?, '{}', '{"contentType":"application/json"}', '{}')
  `);

  const insertVersion = d1Db.prepare(`
    INSERT OR REPLACE INTO topic_content_versions (topic_id, content_hash, bundle_version, problems_count, examples_count, lessons_count, generated_at, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Discover disciplines
  const disciplines: string[] = [];
  if (discipline) {
    disciplines.push(discipline);
  } else {
    for (const entry of readdirSync(bundleDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "_meta") {
        disciplines.push(entry.name);
      }
    }
  }

  let uploaded = 0;

  const uploadFile = (localPath: string, r2Key: string) => {
    const content = readFileSync(localPath);
    const blobId = createHash("sha256").update(content).digest("hex") + Date.now().toString(16).padStart(16, "0");
    const etag = createHash("md5").update(content).digest("hex");

    // Write blob file
    writeFileSync(join(blobDir, blobId), content);

    // Insert object record
    insertObj.run(r2Key, blobId, randomUUID(), content.length, etag, Date.now());
  };

  // Collect all topic data first
  type TopicData = { disc: string; topicId: string; topicDir: string };
  const allTopics: TopicData[] = [];

  for (const disc of disciplines) {
    const discDir = join(bundleDir, disc);
    if (!existsSync(discDir)) continue;

    const topics = readdirSync(discDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    console.log(`${disc}: ${topics.length} topics`);

    for (const topicId of topics) {
      allTopics.push({ disc, topicId, topicDir: join(discDir, topicId) });
    }
  }

  // Upload R2 blobs in a single transaction
  const uploadR2 = r2Db.transaction(() => {
    for (const { disc, topicId, topicDir } of allTopics) {
      for (const file of ["manifest.json", "problems.json", "examples.json", "lessons.json"]) {
        const localPath = join(topicDir, file);
        if (existsSync(localPath)) {
          uploadFile(localPath, `${disc}/${topicId}/${file}`);
        }
      }
    }
  });
  uploadR2();

  // Update D1 content versions — skip topics not in D1 (FK constraint)
  const topicExists = d1Db.prepare("SELECT 1 FROM topics WHERE id = ?");
  const updateD1 = d1Db.transaction(() => {
    let d1Skipped = 0;
    for (const { topicId, topicDir } of allTopics) {
      const manifestPath = join(topicDir, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      if (!topicExists.get(topicId)) { d1Skipped++; continue; }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      insertVersion.run(
        topicId,
        manifest.contentHash,
        manifest.version,
        manifest.items.problems.count,
        manifest.items.examples.count,
        manifest.items.lessons?.count ?? 0,
        manifest.generatedAt,
        new Date().toISOString()
      );
    }
    if (d1Skipped > 0) console.log(`Skipped ${d1Skipped} topics not in D1 graph`);
  });
  updateD1();

  uploaded = allTopics.length;

  r2Db.close();
  d1Db.close();

  console.log(`\nUploaded ${uploaded} topics to local R2 + D1.`);
}

main();
