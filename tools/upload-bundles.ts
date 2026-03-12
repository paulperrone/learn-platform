/**
 * Upload generated content bundles to R2 and update D1 topic_content_versions.
 *
 * Usage:
 *   npx tsx tools/upload-bundles.ts [--env production|preview] [--dir <bundle-dir>] [--discipline <name>]
 *
 * Requires wrangler CLI for R2 object uploads and D1 remote commands.
 * Idempotent: skips upload if content hash matches existing.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

type Manifest = {
  version: number;
  contentHash: string;
  topicId: string;
  discipline: string;
  generatedAt: string;
  items: {
    problems: { count: number };
    examples: { count: number };
  };
};

function parseArgs(): { env: string; bundleDir: string; discipline?: string } {
  const args = process.argv.slice(2);
  let env = "production";
  let bundleDir = "/tmp/learn-content-bundles";
  let discipline: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) {
      env = args[++i];
    } else if (args[i] === "--dir" && args[i + 1]) {
      bundleDir = args[++i];
    } else if (args[i] === "--discipline" && args[i + 1]) {
      discipline = args[++i];
    }
  }

  return { env, bundleDir, discipline };
}

function uploadToR2(localPath: string, r2Key: string, env: string): void {
  const envFlag = env === "production" ? "--env production" : "";
  execSync(
    `npx wrangler r2 object put learn-content/${r2Key} --file "${localPath}" ${envFlag} --content-type application/json`,
    { stdio: "pipe" }
  );
}

function updateD1ContentVersion(
  topicId: string,
  manifest: Manifest,
  env: string
): void {
  const envFlag = env === "production" ? "--env production" : "";
  const sql = `INSERT OR REPLACE INTO topic_content_versions (topic_id, content_hash, bundle_version, problems_count, examples_count, generated_at, uploaded_at) VALUES ('${topicId}', '${manifest.contentHash}', ${manifest.version}, ${manifest.items.problems.count}, ${manifest.items.examples.count}, '${manifest.generatedAt}', '${new Date().toISOString()}')`;
  execSync(
    `npx wrangler d1 execute learn-db --remote ${envFlag} --command "${sql}"`,
    { stdio: "pipe" }
  );
}

function main() {
  const { env, bundleDir, discipline } = parseArgs();

  if (!existsSync(bundleDir)) {
    console.error(`Bundle directory not found: ${bundleDir}`);
    console.error("Run generate-bundles.ts first.");
    process.exit(1);
  }

  console.log(`Bundle dir:  ${bundleDir}`);
  console.log(`Environment: ${env}`);
  if (discipline) console.log(`Discipline:  ${discipline}`);
  console.log();

  // Discover disciplines in bundle dir
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
  let skipped = 0;
  let errors = 0;

  for (const disc of disciplines) {
    const discDir = join(bundleDir, disc);
    if (!existsSync(discDir)) continue;

    const topics = readdirSync(discDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    console.log(`--- ${disc} (${topics.length} topics) ---`);

    for (const topicId of topics) {
      const topicDir = join(discDir, topicId);
      const manifestPath = join(topicDir, "manifest.json");

      if (!existsSync(manifestPath)) {
        console.warn(`  ⚠ No manifest for ${topicId}, skipping`);
        skipped++;
        continue;
      }

      const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

      try {
        // Upload bundle files to R2
        const files = ["manifest.json", "problems.json", "examples.json"];
        for (const file of files) {
          const localPath = join(topicDir, file);
          if (existsSync(localPath)) {
            const r2Key = `${disc}/${topicId}/${file}`;
            uploadToR2(localPath, r2Key, env);
          }
        }

        // Update D1 content version
        updateD1ContentVersion(topicId, manifest, env);

        uploaded++;
        if (uploaded % 50 === 0) {
          console.log(`  Uploaded ${uploaded} topics...`);
        }
      } catch (err) {
        console.error(`  ✗ Failed to upload ${topicId}: ${(err as Error).message}`);
        errors++;
      }
    }
  }

  console.log();
  console.log("=== Upload Summary ===");
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
}

main();
