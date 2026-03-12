/**
 * Unified content deployment — generates R2 bundles and uploads to R2 + updates D1.
 *
 * Replaces the old SQL batch export pipeline with:
 *   1. Generate bundles from learn-content → staging dir
 *   2. Upload bundles to R2 via wrangler
 *   3. Update topic_content_versions in remote D1
 *   4. Export graph SQL and apply to remote D1
 *
 * Usage:
 *   npx tsx tools/deploy-content.ts --env production
 *   npx tsx tools/deploy-content.ts --env preview
 *   npx tsx tools/deploy-content.ts --env production --discipline math
 */
import { execSync } from "child_process";
import { getContentDir } from "./content-dir.js";

function parseArgs(): { env: string; discipline?: string } {
  const args = process.argv.slice(2);
  let env = "production";
  let discipline: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) {
      env = args[++i];
    } else if (args[i] === "--discipline" && args[i + 1]) {
      discipline = args[++i];
    }
  }

  return { env, discipline };
}

function run(cmd: string, label: string): void {
  console.log(`\n--- ${label} ---`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error(`\nFailed: ${label}`);
    process.exit(1);
  }
}

function main() {
  const { env, discipline } = parseArgs();
  const contentDir = getContentDir();

  console.log(`Content deploy: ${env}`);
  console.log(`Content dir:    ${contentDir}`);
  if (discipline) console.log(`Discipline:     ${discipline}`);

  const discFlag = discipline ? `--discipline ${discipline}` : "";
  const bundleDir = "/tmp/learn-content-bundles";

  // Step 1: Generate bundles
  run(
    `CONTENT_DIR="${contentDir}" npx tsx tools/generate-bundles.ts --out ${bundleDir} ${discFlag}`,
    "Generate R2 bundles"
  );

  // Step 2: Upload bundles to R2 + update D1 topic_content_versions
  run(
    `npx tsx tools/upload-bundles.ts --env ${env} --dir ${bundleDir} ${discFlag}`,
    "Upload bundles to R2"
  );

  // Step 3: Export graph SQL and apply to remote D1
  const sqlDir = "/tmp/learn-content-deploy";
  run(
    `CONTENT_DIR="${contentDir}" npx tsx tools/export-sql.ts --dir ${sqlDir}`,
    "Export graph SQL"
  );

  const envFlag = env === "production" ? "--env production" : "--env preview";
  run(
    `for f in ${sqlDir}/content-*.sql; do echo "  Applying $(basename "$f")..."; npx wrangler d1 execute learn-db --remote ${envFlag} --file="$f"; done`,
    "Apply graph SQL to remote D1"
  );

  // Cleanup
  execSync(`rm -rf ${bundleDir} ${sqlDir}`, { stdio: "pipe" });

  console.log(`\nContent deployed to ${env}.`);
}

main();
