#!/usr/bin/env npx tsx
/**
 * Healing Loop Orchestrator
 *
 * Runs the full simulate → evaluate → report → checkpoint cycle.
 * The orchestrator does NOT make code changes — it runs simulations,
 * evaluates, and reports. Code changes are made by Claude Code (via /heal)
 * or by the user.
 *
 * Usage:
 *   npx tsx simulations/src/heal-loop.ts --epoch                    # Run single epoch
 *   npx tsx simulations/src/heal-loop.ts --status                   # Show healing status
 *   npx tsx simulations/src/heal-loop.ts --checkpoint               # Force checkpoint
 *   npx tsx simulations/src/heal-loop.ts --verify-fix --system <id> [--profiles <ids>] [--sessions <n>]
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { loadTargets } from "./load-targets.js";
import {
  loadRuns,
  evaluateSystems,
  evaluateProfiles,
  evaluateContentQuality,
  buildHealingReport,
  generateMarkdownReport,
  printConsoleReport,
  classifyResult,
} from "./evaluate.js";
import type {
  HealEpoch,
  HealingHistory,
  HealingHistoryStatus,
  HealingReport,
  ConvergenceState,
  MiniSimResult,
  EvaluationStatus,
  SignalSource,
  SystemEvaluationResult,
} from "./types.js";

// ── Constants ────────────────────────────────────────────────────────

const SIMULATIONS_DIR = join(process.cwd(), "simulations");
const RUNS_DIR = join(SIMULATIONS_DIR, "runs");
const REPORTS_DIR = join(SIMULATIONS_DIR, "reports");
const HEALING_DIR = join(REPORTS_DIR, "healing");
const HISTORY_PATH = join(HEALING_DIR, "history.json");

const DEFAULT_SEED = 42;
const DEFAULT_SESSIONS = 30;
const CHECKPOINT_INTERVAL = 3;
const STALL_THRESHOLD = 2;

// ── ANSI colors ──────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── History Management ───────────────────────────────────────────────

function loadHistory(): HealingHistory | null {
  if (!existsSync(HISTORY_PATH)) return null;
  return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
}

function saveHistory(history: HealingHistory): void {
  mkdirSync(HEALING_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
}

function initHistory(targetVersion: number): HealingHistory {
  return {
    epochs: [],
    startedAt: new Date().toISOString(),
    targetVersion,
    currentStatus: "running",
  };
}

// ── Delta Computation ────────────────────────────────────────────────

function computeDelta(
  current: HealingReport,
  previous: HealingReport | null
): Record<string, number> {
  if (!previous) return {};

  const deltas: Record<string, number> = {};
  for (const sys of current.systems) {
    const prev = previous.systems.find((s) => s.systemId === sys.systemId);
    if (prev) {
      deltas[sys.systemId] = sys.actual - prev.actual;
    }
  }
  return deltas;
}

// ── Convergence Detection ────────────────────────────────────────────

function detectConvergence(history: HealingHistory): ConvergenceState {
  const epochs = history.epochs;
  if (epochs.length === 0) {
    return {
      status: "running",
      reason: "No epochs recorded yet",
      recommendedAction: "Run `just heal-epoch` to start",
    };
  }

  const latest = epochs[epochs.length - 1];

  // Converged: all systems PASS or WARN
  if (latest.systemsFailCount === 0) {
    return {
      status: "converged",
      reason: `All ${latest.systemsPassCount + latest.systemsWarnCount} systems passing (${latest.systemsPassCount} PASS, ${latest.systemsWarnCount} WARN)`,
      recommendedAction:
        "System is healthy. Run `/heal-update` after code changes to verify.",
    };
  }

  // Check for regression: any system went PASS → FAIL between last 2 epochs
  if (epochs.length >= 2) {
    const prev = epochs[epochs.length - 2];
    const regressions: string[] = [];
    for (const sys of latest.evaluationResult.systems) {
      const prevSys = prev.evaluationResult.systems.find(
        (s) => s.systemId === sys.systemId
      );
      if (prevSys && prevSys.status === "PASS" && sys.status === "FAIL") {
        regressions.push(sys.systemId);
      }
    }
    if (regressions.length > 0) {
      return {
        status: "user_review_needed",
        reason: `Regression detected: ${regressions.join(", ")} went from PASS → FAIL`,
        recommendedAction:
          "Review recent code changes. Run `/heal` to diagnose and fix regressions.",
      };
    }
  }

  // Check for stall: no system improved in N consecutive epochs
  if (epochs.length >= STALL_THRESHOLD) {
    const recentEpochs = epochs.slice(-STALL_THRESHOLD);
    const anyImprovement = recentEpochs.some((e) => {
      const deltas = Object.values(e.deltaFromPreviousEpoch);
      return deltas.some((d) => d > 0);
    });
    if (!anyImprovement) {
      return {
        status: "stalled",
        reason: `No system improved in the last ${STALL_THRESHOLD} epochs`,
        recommendedAction:
          "Review failing systems. Consider alternative fix approaches or adjust targets.",
      };
    }
  }

  return {
    status: "running",
    reason: `${latest.systemsFailCount} system(s) still failing`,
    recommendedAction: "Run `/heal` to diagnose and fix failing systems.",
  };
}

// ── Git Helpers ──────────────────────────────────────────────────────

function getFixesSinceLastEpoch(history: HealingHistory): string[] {
  const epochs = history.epochs;
  if (epochs.length === 0) return [];

  const lastTimestamp = epochs[epochs.length - 1].timestamp;
  try {
    const log = execSync(
      `git log --since="${lastTimestamp}" --oneline --no-merges 2>/dev/null`,
      { encoding: "utf-8" }
    ).trim();
    if (!log) return [];
    return log.split("\n").map((line) => line.trim());
  } catch {
    return [];
  }
}

function getCurrentCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

// ── Epoch Runner ─────────────────────────────────────────────────────

async function runEpoch(
  seed: number = DEFAULT_SEED,
  sessions: number = DEFAULT_SESSIONS
): Promise<HealEpoch> {
  const { targets, errors } = loadTargets();
  if (errors.length > 0) {
    console.error("Target validation errors:");
    for (const err of errors) {
      console.error(`  ${err.field}: ${err.message}`);
    }
    throw new Error("Invalid targets.json");
  }

  // Load or init history
  let history = loadHistory() ?? initHistory(targets.version);

  const epochNumber = history.epochs.length + 1;
  const timestamp = new Date().toISOString();

  console.log(
    `\n${BOLD}${CYAN}═══ Healing Epoch ${epochNumber} ═══${RESET}`
  );
  console.log(`${DIM}Timestamp: ${timestamp}${RESET}`);
  console.log(`${DIM}Seed: ${seed}, Sessions: ${sessions}${RESET}\n`);

  // Step 1: Run full simulation
  console.log(`${BOLD}Step 1: Running simulations...${RESET}`);
  const startSim = Date.now();
  try {
    execSync(
      `npx tsx simulations/src/cli.ts --all --sessions ${sessions} --seed ${seed}`,
      { stdio: "inherit", cwd: process.cwd() }
    );
  } catch (err) {
    throw new Error(`Simulation failed: ${err}`);
  }
  const simDuration = ((Date.now() - startSim) / 1000).toFixed(1);
  console.log(`${DIM}Simulation completed in ${simDuration}s${RESET}\n`);

  // Step 2: Evaluate against targets
  console.log(`${BOLD}Step 2: Evaluating against targets...${RESET}`);
  const runs = loadRuns(RUNS_DIR);
  if (runs.length === 0) {
    throw new Error(
      "No simulation runs found after running. Check cli.ts output."
    );
  }

  const systemResults = evaluateSystems(runs, targets);
  const profileResults = evaluateProfiles(
    runs,
    targets.profile_expectations
  );
  const contentQuality = evaluateContentQuality(runs, targets);
  const report = buildHealingReport(
    systemResults,
    profileResults,
    contentQuality,
    targets.version
  );

  // Step 3: Compute delta from previous epoch
  const previousEpoch =
    history.epochs.length > 0
      ? history.epochs[history.epochs.length - 1]
      : null;
  const delta = computeDelta(
    report,
    previousEpoch?.evaluationResult ?? null
  );

  // Step 4: Get fixes applied since last epoch
  const fixes = getFixesSinceLastEpoch(history);

  // Step 5: Build epoch record
  const epoch: HealEpoch = {
    epochNumber,
    timestamp,
    simulationSeed: seed,
    sessions,
    evaluationResult: report,
    systemsPassCount: report.summary.passCount,
    systemsFailCount: report.summary.failCount,
    systemsWarnCount: report.summary.warnCount,
    deltaFromPreviousEpoch: delta,
    fixesApplied: fixes,
  };

  // Step 6: Save epoch report
  mkdirSync(HEALING_DIR, { recursive: true });
  writeFileSync(
    join(HEALING_DIR, `epoch-${epochNumber}.json`),
    JSON.stringify(epoch, null, 2) + "\n"
  );

  // Save evaluation report
  writeFileSync(
    join(REPORTS_DIR, "evaluation.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  writeFileSync(
    join(REPORTS_DIR, "evaluation.md"),
    generateMarkdownReport(report) + "\n"
  );

  // Step 7: Update history
  history.epochs.push(epoch);
  const convergence = detectConvergence(history);
  history.currentStatus = convergence.status;
  history.targetVersion = targets.version;
  saveHistory(history);

  // Step 8: Console output
  console.log("");
  printConsoleReport(report);

  // Delta summary
  if (Object.keys(delta).length > 0) {
    console.log(`${BOLD}Changes from epoch ${epochNumber - 1}:${RESET}`);
    for (const [sysId, d] of Object.entries(delta)) {
      const color = d > 0 ? GREEN : d < 0 ? RED : DIM;
      const sign = d > 0 ? "+" : "";
      console.log(`  ${color}${sysId}: ${sign}${d}${RESET}`);
    }
    console.log("");
  }

  // Convergence status
  const statusColor =
    convergence.status === "converged"
      ? GREEN
      : convergence.status === "stalled" ||
          convergence.status === "user_review_needed"
        ? RED
        : YELLOW;
  console.log(
    `${BOLD}Status: ${statusColor}${convergence.status.toUpperCase()}${RESET}`
  );
  console.log(`  ${convergence.reason}`);
  console.log(`  ${DIM}${convergence.recommendedAction}${RESET}`);

  // Fixes applied
  if (fixes.length > 0) {
    console.log(`\n${BOLD}Fixes applied since last epoch:${RESET}`);
    for (const fix of fixes.slice(0, 10)) {
      console.log(`  ${DIM}${fix}${RESET}`);
    }
    if (fixes.length > 10) {
      console.log(`  ${DIM}... and ${fixes.length - 10} more${RESET}`);
    }
  }

  console.log(
    `\n${DIM}Epoch report: ${join(HEALING_DIR, `epoch-${epochNumber}.json`)}${RESET}`
  );
  console.log(
    `${DIM}Evaluation: ${join(REPORTS_DIR, "evaluation.json")}${RESET}\n`
  );

  // Auto-checkpoint at interval
  if (epochNumber % CHECKPOINT_INTERVAL === 0) {
    console.log(
      `${YELLOW}Checkpoint interval reached (every ${CHECKPOINT_INTERVAL} epochs). Run \`just heal-checkpoint\` to commit.${RESET}\n`
    );
  }

  return epoch;
}

// ── Mini-Simulation Verification ─────────────────────────────────────

async function verifyFix(
  systemId: string,
  profiles: string[] | "all",
  sessions: number = 10,
  seed: number = DEFAULT_SEED
): Promise<MiniSimResult> {
  const { targets, errors } = loadTargets();
  if (errors.length > 0) {
    throw new Error("Invalid targets.json");
  }

  const targetDef = targets.systems[systemId];
  if (!targetDef) {
    throw new Error(
      `Unknown system: ${systemId}. Available: ${Object.keys(targets.systems).join(", ")}`
    );
  }

  // Determine profiles to run
  const profileIds =
    profiles === "all"
      ? targetDef.evaluation_profiles.includes("all")
        ? getAllProfileIds()
        : targetDef.evaluation_profiles
      : profiles;

  console.log(`\n${BOLD}${CYAN}═══ Fix Verification: ${systemId} ═══${RESET}`);
  console.log(
    `${DIM}Profiles: ${profileIds.join(", ")} | Sessions: ${sessions} | Seed: ${seed}${RESET}\n`
  );

  // Load "before" from latest evaluation
  const beforeReport = loadLatestEvaluation();
  const beforeSys = beforeReport?.systems.find(
    (s) => s.systemId === systemId
  );
  const beforeActual = beforeSys?.actual ?? 0;
  const beforeStatus = beforeSys?.status ?? "FAIL";

  console.log(
    `${BOLD}Before:${RESET} ${formatStatus(beforeStatus)} (actual: ${beforeActual}, target: ${targetDef.target})`
  );

  // Run mini-sim for affected profiles
  console.log(`\n${BOLD}Running mini-simulation...${RESET}`);
  const profileArgs = profileIds
    .map((p) => `npx tsx simulations/src/cli.ts ${p} --sessions ${sessions} --seed ${seed}`)
    .join(" && ");
  try {
    execSync(profileArgs, { stdio: "inherit", cwd: process.cwd() });
  } catch (err) {
    throw new Error(`Mini-simulation failed: ${err}`);
  }

  // Evaluate after
  console.log(`\n${BOLD}Evaluating...${RESET}`);
  const runs = loadRuns(RUNS_DIR, profileIds);
  const systemResults = evaluateSystems(runs, targets);
  const afterSys = systemResults.find((s) => s.systemId === systemId);
  const afterActual = afterSys?.actual ?? 0;
  const afterStatus = afterSys?.status ?? "FAIL";

  const delta = afterActual - beforeActual;
  const improved = delta > 0;

  console.log(
    `${BOLD}After:${RESET}  ${formatStatus(afterStatus)} (actual: ${afterActual}, target: ${targetDef.target})`
  );

  const deltaColor = improved ? GREEN : delta < 0 ? RED : YELLOW;
  const deltaSign = delta > 0 ? "+" : "";
  console.log(
    `${BOLD}Delta:${RESET}  ${deltaColor}${deltaSign}${delta}${RESET}`
  );

  if (improved) {
    console.log(
      `\n${GREEN}${BOLD}Fix verified: ${systemId} improved from ${beforeActual} → ${afterActual}${RESET}`
    );
  } else if (delta === 0) {
    console.log(
      `\n${YELLOW}${BOLD}Fix not effective: ${systemId} unchanged at ${afterActual}${RESET}`
    );
  } else {
    console.log(
      `\n${RED}${BOLD}Fix regressed: ${systemId} worsened from ${beforeActual} → ${afterActual}${RESET}`
    );
  }

  const result: MiniSimResult = {
    system: systemId,
    profiles: profileIds,
    sessions,
    seed,
    before: { actual: beforeActual, status: beforeStatus },
    after: { actual: afterActual, status: afterStatus },
    improved,
    delta,
  };

  // Save verification result
  mkdirSync(HEALING_DIR, { recursive: true });
  writeFileSync(
    join(HEALING_DIR, `verify-${systemId}-${Date.now()}.json`),
    JSON.stringify(result, null, 2) + "\n"
  );

  return result;
}

// ── Checkpoint ───────────────────────────────────────────────────────

function createCheckpoint(): void {
  const history = loadHistory();
  if (!history || history.epochs.length === 0) {
    console.error("No epochs to checkpoint. Run `just heal-epoch` first.");
    process.exit(1);
  }

  const latest = history.epochs[history.epochs.length - 1];
  const convergence = detectConvergence(history);

  // Generate checkpoint summary
  const epochsSinceLastCheckpoint = history.epochs.filter(
    (e) => !e.checkpointCommit
  );
  const checkpointNumber = history.epochs.filter(
    (e) => e.checkpointCommit
  ).length + 1;

  const summary = generateCheckpointSummary(
    checkpointNumber,
    epochsSinceLastCheckpoint,
    convergence
  );

  // Write checkpoint report
  mkdirSync(HEALING_DIR, { recursive: true });
  writeFileSync(
    join(HEALING_DIR, `checkpoint-${checkpointNumber}.md`),
    summary
  );

  // Update regression baseline if system improved
  const firstEpoch = epochsSinceLastCheckpoint[0];
  const lastEpoch = epochsSinceLastCheckpoint[epochsSinceLastCheckpoint.length - 1];
  if (
    lastEpoch.systemsPassCount > firstEpoch.systemsPassCount ||
    lastEpoch.systemsFailCount < firstEpoch.systemsFailCount
  ) {
    console.log(
      `${GREEN}System improved — consider updating regression baseline.${RESET}`
    );
  }

  // Record checkpoint commit
  const commitHash = getCurrentCommitHash();
  latest.checkpointCommit = commitHash;
  saveHistory(history);

  console.log(
    `\n${GREEN}${BOLD}Checkpoint ${checkpointNumber} created${RESET}`
  );
  console.log(
    `  ${DIM}Report: ${join(HEALING_DIR, `checkpoint-${checkpointNumber}.md`)}${RESET}`
  );
  console.log(
    `  ${DIM}Commit: ${commitHash}${RESET}`
  );
  console.log(
    `\n${DIM}To commit checkpoint: git add simulations/ && git commit -m "feat(heal): checkpoint ${checkpointNumber} — ${latest.systemsPassCount}/${latest.evaluationResult.systems.length} systems passing"${RESET}\n`
  );
}

function generateCheckpointSummary(
  checkpointNumber: number,
  epochs: HealEpoch[],
  convergence: ConvergenceState
): string {
  const latest = epochs[epochs.length - 1];
  const first = epochs[0];

  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  for (const sys of latest.evaluationResult.systems) {
    const firstSys = first.evaluationResult.systems.find(
      (s) => s.systemId === sys.systemId
    );
    if (!firstSys) {
      improved.push(sys.systemId);
      continue;
    }
    if (sys.actual > firstSys.actual) improved.push(sys.systemId);
    else if (sys.actual < firstSys.actual) regressed.push(sys.systemId);
    else unchanged.push(sys.systemId);
  }

  let md = `# Checkpoint ${checkpointNumber}\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n`;
  md += `**Epochs covered:** ${first.epochNumber} — ${latest.epochNumber}\n`;
  md += `**Status:** ${convergence.status}\n\n`;

  md += `## Systems Summary\n\n`;
  md += `| System | Status | Actual | Target | Delta |\n`;
  md += `|--------|--------|--------|--------|-------|\n`;
  for (const sys of latest.evaluationResult.systems) {
    md += `| ${sys.systemId} | ${sys.status} | ${sys.actual} | ${sys.target} | ${sys.delta >= 0 ? "+" : ""}${sys.delta} |\n`;
  }

  if (improved.length > 0) {
    md += `\n**Improved:** ${improved.join(", ")}\n`;
  }
  if (regressed.length > 0) {
    md += `**Regressed:** ${regressed.join(", ")}\n`;
  }
  if (unchanged.length > 0) {
    md += `**Unchanged:** ${unchanged.join(", ")}\n`;
  }

  md += `\n## Score\n\n`;
  md += `- PASS: ${latest.systemsPassCount}\n`;
  md += `- WARN: ${latest.systemsWarnCount}\n`;
  md += `- FAIL: ${latest.systemsFailCount}\n`;

  const allFixes = epochs.flatMap((e) => e.fixesApplied);
  if (allFixes.length > 0) {
    md += `\n## Fixes Applied\n\n`;
    for (const fix of allFixes) {
      md += `- ${fix}\n`;
    }
  }

  md += `\n## Next Steps\n\n`;
  md += `${convergence.recommendedAction}\n`;

  return md;
}

// ── Status Display ───────────────────────────────────────────────────

function showStatus(): void {
  const history = loadHistory();

  if (!history) {
    console.log(
      "\nNo healing history found. Run `just heal-epoch` to start.\n"
    );
    return;
  }

  const convergence = detectConvergence(history);

  console.log(`\n${BOLD}${CYAN}═══ Healing Loop Status ═══${RESET}\n`);
  console.log(`Started: ${DIM}${history.startedAt}${RESET}`);
  console.log(`Target version: ${DIM}${history.targetVersion}${RESET}`);
  console.log(`Epochs: ${BOLD}${history.epochs.length}${RESET}`);

  const statusColor =
    convergence.status === "converged"
      ? GREEN
      : convergence.status === "stalled" ||
          convergence.status === "user_review_needed"
        ? RED
        : YELLOW;
  console.log(
    `Status: ${statusColor}${BOLD}${convergence.status.toUpperCase()}${RESET}`
  );
  console.log(`  ${convergence.reason}`);
  console.log(`  ${DIM}${convergence.recommendedAction}${RESET}\n`);

  if (history.epochs.length === 0) return;

  // Epoch history table
  console.log(`${BOLD}Epoch History:${RESET}`);
  console.log(
    "Epoch".padEnd(8) +
    "Date".padEnd(22) +
    "PASS".padEnd(7) +
    "WARN".padEnd(7) +
    "FAIL".padEnd(7) +
    "Fixes".padEnd(7) +
    "Checkpoint"
  );
  console.log("-".repeat(70));

  for (const epoch of history.epochs) {
    const date = epoch.timestamp.replace("T", " ").slice(0, 19);
    const cp = epoch.checkpointCommit ?? "";
    console.log(
      String(epoch.epochNumber).padEnd(8) +
      date.padEnd(22) +
      `${GREEN}${String(epoch.systemsPassCount).padEnd(7)}${RESET}` +
      `${YELLOW}${String(epoch.systemsWarnCount).padEnd(7)}${RESET}` +
      `${RED}${String(epoch.systemsFailCount).padEnd(7)}${RESET}` +
      String(epoch.fixesApplied.length).padEnd(7) +
      `${DIM}${cp}${RESET}`
    );
  }

  // Per-system trend (last 5 epochs)
  const recentEpochs = history.epochs.slice(-5);
  if (recentEpochs.length > 1) {
    console.log(`\n${BOLD}System Trends (last ${recentEpochs.length} epochs):${RESET}`);

    const systemIds = recentEpochs[0].evaluationResult.systems.map(
      (s) => s.systemId
    );
    for (const sysId of systemIds) {
      const values = recentEpochs.map((e) => {
        const sys = e.evaluationResult.systems.find(
          (s) => s.systemId === sysId
        );
        return sys ? formatStatus(sys.status) : `${DIM}?${RESET}`;
      });
      console.log(`  ${sysId.padEnd(25)} ${values.join(" → ")}`);
    }
  }

  console.log("");
}

// ── Helpers ──────────────────────────────────────────────────────────

function getAllProfileIds(): string[] {
  const profilesDir = join(SIMULATIONS_DIR, "profiles");
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

function loadLatestEvaluation(): HealingReport | null {
  const path = join(REPORTS_DIR, "evaluation.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function formatStatus(status: EvaluationStatus): string {
  switch (status) {
    case "PASS":
      return `${GREEN}PASS${RESET}`;
    case "WARN":
      return `${YELLOW}WARN${RESET}`;
    case "FAIL":
      return `${RED}FAIL${RESET}`;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

function parseArgs(): {
  mode: "epoch" | "verify" | "checkpoint" | "status";
  system?: string;
  profiles?: string[];
  sessions: number;
  seed: number;
} {
  const args = process.argv.slice(2);

  if (args.includes("--status")) {
    return { mode: "status", sessions: DEFAULT_SESSIONS, seed: DEFAULT_SEED };
  }
  if (args.includes("--checkpoint")) {
    return {
      mode: "checkpoint",
      sessions: DEFAULT_SESSIONS,
      seed: DEFAULT_SEED,
    };
  }
  if (args.includes("--verify-fix")) {
    const sysIdx = args.indexOf("--system");
    if (sysIdx < 0 || !args[sysIdx + 1]) {
      console.error("--verify-fix requires --system <id>");
      process.exit(1);
    }

    const profIdx = args.indexOf("--profiles");
    const profiles = profIdx >= 0 ? args[profIdx + 1].split(",") : undefined;

    const sessIdx = args.indexOf("--sessions");
    const sessions = sessIdx >= 0 ? parseInt(args[sessIdx + 1], 10) : 10;

    const seedIdx = args.indexOf("--seed");
    const seed = seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : DEFAULT_SEED;

    return {
      mode: "verify",
      system: args[sysIdx + 1],
      profiles,
      sessions,
      seed,
    };
  }

  // Default: epoch
  const sessIdx = args.indexOf("--sessions");
  const sessions =
    sessIdx >= 0 ? parseInt(args[sessIdx + 1], 10) : DEFAULT_SESSIONS;

  const seedIdx = args.indexOf("--seed");
  const seed =
    seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : DEFAULT_SEED;

  return { mode: "epoch", sessions, seed };
}

async function main() {
  const opts = parseArgs();

  switch (opts.mode) {
    case "epoch":
      await runEpoch(opts.seed, opts.sessions);
      break;
    case "verify":
      await verifyFix(
        opts.system!,
        opts.profiles ?? "all",
        opts.sessions,
        opts.seed
      );
      break;
    case "checkpoint":
      createCheckpoint();
      break;
    case "status":
      showStatus();
      break;
  }
}

if (
  process.argv[1]?.endsWith("heal-loop.ts") ||
  process.argv[1]?.endsWith("heal-loop.js")
) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

// ── Training Loop Utilities ──────────────────────────────────────────

type FailedApproach = {
  system: string;
  approach: string;
  result: string;
  epoch: number;
};

/**
 * Select the highest-priority fix target from failing systems.
 *
 * Priority ordering: P0 > P1 > P2, then by normalized delta (worst first).
 * Skips systems with non-engine signal_source and systems that have
 * exhausted their fix attempts (≥ maxAttempts failed approaches).
 */
function selectFixTarget(
  systems: SystemEvaluationResult[],
  signalSources: Record<string, SignalSource>,
  failedApproaches: Record<string, FailedApproach[]>,
  maxAttempts: number = 2,
  targetSystem?: string
): SystemEvaluationResult | null {
  const failing = systems.filter((s) => s.status === "FAIL");
  if (failing.length === 0) return null;

  // If targeting a specific system, use it if it's failing
  if (targetSystem) {
    return failing.find((s) => s.systemId === targetSystem) ?? null;
  }

  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

  const candidates = failing
    .filter((s) => {
      // Skip non-engine signal sources
      const source = signalSources[s.systemId];
      if (source && source !== "engine") return false;
      // Skip systems with exhausted attempts
      const attempts = failedApproaches[s.systemId] ?? [];
      if (attempts.length >= maxAttempts) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by priority first
      const pDiff = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (pDiff !== 0) return pDiff;
      // Then by normalized delta magnitude (worst first)
      const aDelta = Math.abs(a.delta) / (a.target || 1);
      const bDelta = Math.abs(b.delta) / (b.target || 1);
      return bDelta - aDelta;
    });

  return candidates[0] ?? null;
}

/**
 * Check if all remaining failures are content/bridge signal source
 * (i.e., the engine is fully optimized, only content changes can help).
 */
function isContentConverged(
  systems: SystemEvaluationResult[],
  signalSources: Record<string, SignalSource>
): boolean {
  const failing = systems.filter((s) => s.status === "FAIL");
  if (failing.length === 0) return false; // Not content-converged, just converged
  return failing.every((s) => {
    const source = signalSources[s.systemId];
    return source === "content" || source === "bridge";
  });
}

/**
 * Detect soft regressions: systems whose metrics worsened beyond tolerance
 * between two evaluations, even if their status didn't change.
 */
function detectSoftRegressions(
  current: SystemEvaluationResult[],
  previous: SystemEvaluationResult[],
  fixTarget?: string
): Array<{ systemId: string; before: number; after: number; tolerance: number }> {
  const regressions: Array<{ systemId: string; before: number; after: number; tolerance: number }> = [];

  for (const sys of current) {
    if (sys.systemId === fixTarget) continue; // Skip the fix target itself
    const prev = previous.find((s) => s.systemId === sys.systemId);
    if (!prev) continue;

    // Check if metric worsened beyond tolerance
    let worsened = false;
    if (sys.direction === "higher_better") {
      worsened = prev.actual - sys.actual > sys.tolerance;
    } else if (sys.direction === "lower_better") {
      worsened = sys.actual - prev.actual > sys.tolerance;
    } else if (sys.direction === "in_range") {
      // For in_range, check if it moved further from the range
      const prevDist = Math.max(0, prev.actual - (prev.target + prev.tolerance), (prev.target - prev.tolerance) - prev.actual);
      const curDist = Math.max(0, sys.actual - (sys.target + sys.tolerance), (sys.target - sys.tolerance) - sys.actual);
      worsened = curDist - prevDist > sys.tolerance;
    }

    if (worsened) {
      regressions.push({
        systemId: sys.systemId,
        before: prev.actual,
        after: sys.actual,
        tolerance: sys.tolerance,
      });
    }
  }

  return regressions;
}

// ── Exports ──────────────────────────────────────────────────────────

export {
  runEpoch,
  verifyFix,
  createCheckpoint,
  showStatus,
  loadHistory,
  saveHistory,
  computeDelta,
  detectConvergence,
  generateCheckpointSummary,
  selectFixTarget,
  isContentConverged,
  detectSoftRegressions,
};
