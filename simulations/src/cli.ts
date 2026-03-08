#!/usr/bin/env npx tsx
/**
 * Simulation CLI — run synthetic learners through the learning engine.
 *
 * Usage:
 *   npx tsx simulations/src/cli.ts <profile> [--sessions N] [--seed S]
 *   npx tsx simulations/src/cli.ts --all [--sessions N] [--seed S]
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { SimulationRunner } from "./runner.js";
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

function parseArgs(): { profiles: string[]; sessions: number; seed: number; all: boolean } {
  const args = process.argv.slice(2);
  let profiles: string[] = [];
  let sessions = 5;
  let seed = 42;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") {
      all = true;
    } else if (args[i] === "--sessions" && args[i + 1]) {
      sessions = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--seed" && args[i + 1]) {
      seed = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith("--")) {
      profiles.push(args[i]);
    }
  }

  return { profiles, sessions, seed, all };
}

async function main() {
  const { profiles, sessions, seed, all } = parseArgs();

  if (!all && profiles.length === 0) {
    console.log("Usage: npx tsx simulations/src/cli.ts <profile> [--sessions N] [--seed S]");
    console.log("       npx tsx simulations/src/cli.ts --all [--sessions N] [--seed S]");
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

  const results = [];
  for (const profile of profilesToRun) {
    const config: SimulationConfig = {
      profile,
      subject: "math-foundations",
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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
