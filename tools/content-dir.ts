/**
 * Resolve the content directory path.
 *
 * Priority:
 * 1. CONTENT_DIR environment variable (absolute or relative to cwd)
 * 2. ../learn-content (sibling repo — default for local development)
 * 3. ./content (legacy fallback)
 */
import { existsSync } from "fs";
import { join, resolve } from "path";

export function getContentDir(): string {
  if (process.env.CONTENT_DIR) {
    return resolve(process.env.CONTENT_DIR);
  }

  const siblingRepo = join(process.cwd(), "..", "learn-content");
  if (existsSync(siblingRepo)) {
    return siblingRepo;
  }

  // Legacy fallback
  const legacyDir = join(process.cwd(), "content");
  if (existsSync(legacyDir)) {
    return legacyDir;
  }

  console.error("Content directory not found. Set CONTENT_DIR or clone learn-content as a sibling.");
  process.exit(1);
}
