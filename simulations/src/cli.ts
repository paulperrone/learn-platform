#!/usr/bin/env npx tsx
/**
 * Simulation CLI — run synthetic learners through the learning engine.
 *
 * Usage:
 *   npx tsx simulations/src/cli.ts <profile> [--sessions N] [--seed S]
 *   npx tsx simulations/src/cli.ts --all [--sessions N] [--seed S]
 */
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { SimulationRunner } from "./runner.js";
import { createMultiSubjectSimulationDb } from "./db-setup.js";
import type { LearnerProfile, SimulationConfig } from "./types.js";

function loadProfile(profileId: string): LearnerProfile {
  const profilePath = join(process.cwd(), "simulations", "profiles", `${profileId}.json`);
  if (!existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  return JSON.parse(readFileSync(profilePath, "utf-8"));
}

function loadAllProfiles(): LearnerProfile[] {
  const profilesDir = join(process.cwd(), "simulations", "profiles");
  if (!existsSync(profilesDir)) {
    throw new Error(`Profiles directory not found: ${profilesDir}`);
  }
  return readdirSync(profilesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(profilesDir, f), "utf-8")));
}

function parseArgs(): { profiles: string[]; sessions: number; seed: number; all: boolean; schedule: string | undefined; subject: string | undefined } {
  const args = process.argv.slice(2);
  let profiles: string[] = [];
  let sessions = 5;
  let seed = 42;
  let all = false;
  let schedule: string | undefined;
  let subject: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") {
      all = true;
    } else if (args[i] === "--sessions" && args[i + 1]) {
      sessions = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--seed" && args[i + 1]) {
      seed = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--schedule" && args[i + 1]) {
      schedule = args[i + 1];
      i++;
    } else if (args[i] === "--subject" && args[i + 1]) {
      subject = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--")) {
      profiles.push(args[i]);
    }
  }

  return { profiles, sessions, seed, all, schedule, subject };
}

async function main() {
  const { profiles, sessions, seed, all, schedule, subject } = parseArgs();

  if (!all && profiles.length === 0) {
    console.log("Usage: npx tsx simulations/src/cli.ts <profile> [--sessions N] [--seed S] [--schedule TYPE] [--subject SUBJECT]");
    console.log("       npx tsx simulations/src/cli.ts --all [--sessions N] [--seed S] [--schedule TYPE] [--subject SUBJECT]");
    console.log("\nSchedule types: daily, irregular, weekday, gap-and-return, burst, weekend-only, decay, completion-break");
    console.log("\nSubject: math-foundations (default), math-middle, ela-k5, us-history, or comma-separated for multi-subject");
    console.log("\nAvailable profiles:");
    const profilesDir = join(process.cwd(), "simulations", "profiles");
    if (existsSync(profilesDir)) {
      for (const f of readdirSync(profilesDir).filter((f) => f.endsWith(".json"))) {
        const p: LearnerProfile = JSON.parse(readFileSync(join(profilesDir, f), "utf-8"));
        console.log(`  ${f.replace(".json", "").padEnd(30)} ${p.description}`);
      }
    }
    process.exit(1);
  }

  const profilesToRun = all
    ? loadAllProfiles()
    : profiles.map(loadProfile);

  console.log(`Running ${profilesToRun.length} profile(s), ${sessions} sessions each, seed=${seed}\n`);

  // Parse --subject flag: comma-separated list or single subject
  const cliSubjects = subject ? subject.split(",").map(s => s.trim()) : undefined;

  const results = [];
  for (const profile of profilesToRun) {
    if (schedule) {
      profile.scheduling = { type: schedule as any };
    }

    // Determine subjects: profile.subjects > --subject flag > default "math-foundations"
    const subjects = profile.subjects ?? cliSubjects ?? ["math-foundations"];
    const primarySubject = subjects[0];

    const config: SimulationConfig = {
      profile,
      subject: primarySubject,
      subjects: subjects.length > 1 ? subjects : undefined,
      sessionCount: sessions,
      seed,
    };

    const runner = new SimulationRunner(config);
    const result = await runner.run();
    results.push(result);
    console.log();
  }

  // Print summary table
  console.log("=== Simulation Summary ===");
  console.log(
    "Profile".padEnd(30) +
    "Sessions".padEnd(10) +
    "Diag Qs".padEnd(10) +
    "Events".padEnd(10)
  );
  console.log("-".repeat(60));
  for (const r of results) {
    console.log(
      r.profileId.padEnd(30) +
      String(r.sessionsCompleted).padEnd(10) +
      String(r.diagnosticQuestionsAsked).padEnd(10) +
      String(r.totalEvents).padEnd(10)
    );
  }

  // Report runs directory size
  const totalSize = getRunsDirSize();
  console.log(`\nTotal simulations/runs/ size: ${formatBytes(totalSize)}`);
  if (totalSize > 500 * 1024 * 1024) {
    console.warn(`⚠ Runs directory exceeds 500MB. Run: just simulate-clean`);
  }
}

function getRunsDirSize(): number {
  const runsDir = join(process.cwd(), "simulations", "runs");
  if (!existsSync(runsDir)) return 0;
  let size = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else size += statSync(p).size;
    }
  };
  walk(runsDir);
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
