#!/usr/bin/env npx tsx
/**
 * Simulation run cleanup tool.
 *
 * Usage:
 *   npx tsx audit/learner-simulations/src/clean.ts                      # Keep latest run per profile
 *   npx tsx audit/learner-simulations/src/clean.ts --keep 3             # Keep 3 most recent per profile
 *   npx tsx audit/learner-simulations/src/clean.ts --older-than 7d      # Delete runs older than 7 days
 *   npx tsx audit/learner-simulations/src/clean.ts --dry-run             # Show what would be deleted
 */
import { readdirSync, statSync, rmSync, existsSync } from "fs";
import { join } from "path";

type CleanArgs = {
  keep: number;
  olderThanMs: number | null;
  dryRun: boolean;
};

function parseArgs(): CleanArgs {
  const args = process.argv.slice(2);
  let keep = 1;
  let olderThanMs: number | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep" && args[i + 1]) {
      keep = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--older-than" && args[i + 1]) {
      const match = args[i + 1].match(/^(\d+)([dhm])$/);
      if (!match) {
        console.error(`Invalid --older-than format: ${args[i + 1]} (use e.g. 7d, 24h, 30m)`);
        process.exit(1);
      }
      const val = parseInt(match[1], 10);
      const unit = match[2];
      const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000 };
      olderThanMs = val * multipliers[unit];
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { keep, olderThanMs, dryRun };
}

function getDirSize(dirPath: string): number {
  let size = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += statSync(fullPath).size;
    }
  }
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function main() {
  const { keep, olderThanMs, dryRun } = parseArgs();
  const runsDir = join(process.cwd(), "audit", "learner-simulations", "runs");

  if (!existsSync(runsDir)) {
    console.log("No runs directory found.");
    return;
  }

  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  if (entries.length === 0) {
    console.log("No simulation runs found.");
    return;
  }

  // Group runs by profile prefix (directories are named like: profileId-timestamp)
  const byProfile = new Map<string, { name: string; path: string; mtime: number; size: number }[]>();

  for (const entry of entries) {
    const fullPath = join(runsDir, entry.name);
    const stat = statSync(fullPath);
    // Profile ID is everything before the ISO timestamp suffix
    // Run dirs: profileId-2026-03-08T22-34-06-481Z
    // Match the ISO-like timestamp: YYYY-MM-DDTHH-MM-SS-MMMZ
    const timestampMatch = entry.name.match(/^(.+?)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)$/);
    const profileId = timestampMatch ? timestampMatch[1] : entry.name;

    if (!byProfile.has(profileId)) {
      byProfile.set(profileId, []);
    }
    byProfile.get(profileId)!.push({
      name: entry.name,
      path: fullPath,
      mtime: stat.mtimeMs,
      size: getDirSize(fullPath),
    });
  }

  // Sort each profile's runs by mtime (newest first)
  for (const runs of byProfile.values()) {
    runs.sort((a, b) => b.mtime - a.mtime);
  }

  const toDelete: { name: string; path: string; size: number }[] = [];
  const now = Date.now();

  for (const [profileId, runs] of byProfile) {
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      let shouldDelete = false;

      if (olderThanMs !== null) {
        shouldDelete = (now - run.mtime) > olderThanMs;
      } else {
        shouldDelete = i >= keep;
      }

      if (shouldDelete) {
        toDelete.push(run);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log("Nothing to clean up.");
    printSize(runsDir);
    return;
  }

  const totalSize = toDelete.reduce((sum, r) => sum + r.size, 0);

  if (dryRun) {
    console.log(`[dry-run] Would delete ${toDelete.length} run(s), freeing ${formatBytes(totalSize)}:\n`);
    for (const r of toDelete) {
      console.log(`  ${r.name}  (${formatBytes(r.size)})`);
    }
  } else {
    for (const r of toDelete) {
      rmSync(r.path, { recursive: true, force: true });
    }
    console.log(`Deleted ${toDelete.length} run(s), freed ${formatBytes(totalSize)}.`);
  }

  printSize(runsDir);
}

function printSize(runsDir: string) {
  if (existsSync(runsDir)) {
    const totalSize = getDirSize(runsDir);
    console.log(`\nTotal audit/learner-simulations/runs/ size: ${formatBytes(totalSize)}`);
    if (totalSize > 500 * 1024 * 1024) {
      console.warn(`⚠ Runs directory exceeds 500MB. Consider running: just simulate-clean`);
    }
  }
}

main();
