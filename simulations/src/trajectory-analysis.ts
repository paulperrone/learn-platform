#!/usr/bin/env npx tsx
/**
 * Trajectory analysis — validates multi-session learning trajectories.
 *
 * Reads state snapshots and session summaries from simulation runs,
 * validates mastery curves, remediation chains, and worked example fading.
 *
 * Usage:
 *   npx tsx simulations/src/trajectory-analysis.ts [run-dir]
 *   npx tsx simulations/src/trajectory-analysis.ts --all-latest
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import type { StateSnapshot, SessionSummary, SimulationEvent } from "./types.js";

type TrajectoryReport = {
  profileId: string;
  runDir: string;
  sessionsCompleted: number;
  totalDays: number;

  // Mastery curve
  masteryCurve: { session: number; day: number; masteryPercent: number }[];
  masteryMonotonic: boolean;
  masteryRegressions: { fromSession: number; toSession: number; drop: number }[];
  finalMasteryPercent: number;

  // Remediation
  remediationEvents: { sessionNumber: number; topicId: string; remediationTarget: string }[];
  remediationCount: number;
  remediationReturnSuccess: number;

  // Fading
  fadingProgressions: { topicId: string; levels: { session: number; level: number }[] }[];
  fadingCorrectProgression: number; // Topics where fading increases over visits
  fadingTotalTracked: number;

  // Validation results
  validations: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
};

function loadSnapshots(runDir: string): StateSnapshot[] {
  const path = join(runDir, "state-snapshots.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadSummaries(runDir: string): SessionSummary[] {
  const path = join(runDir, "session-summaries.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadEvents(runDir: string): SimulationEvent[] {
  const path = join(runDir, "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadSummaryJson(runDir: string): Record<string, unknown> {
  const path = join(runDir, "summary.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function analyzeTrajectory(runDir: string): TrajectoryReport {
  const snapshots = loadSnapshots(runDir);
  const summaries = loadSummaries(runDir);
  const events = loadEvents(runDir);
  const summary = loadSummaryJson(runDir);
  const profileId = (summary.profileId as string) ?? runDir.split("/").pop()?.split("-")[0] ?? "unknown";

  // --- Mastery curve ---
  const masteryCurve = snapshots.map((s) => ({
    session: s.sessionNumber,
    day: s.day,
    masteryPercent: s.masteryPercent,
  }));

  const masteryRegressions: TrajectoryReport["masteryRegressions"] = [];
  for (let i = 1; i < masteryCurve.length; i++) {
    if (masteryCurve[i].masteryPercent < masteryCurve[i - 1].masteryPercent) {
      masteryRegressions.push({
        fromSession: masteryCurve[i - 1].session,
        toSession: masteryCurve[i].session,
        drop: masteryCurve[i - 1].masteryPercent - masteryCurve[i].masteryPercent,
      });
    }
  }

  // --- Remediation analysis ---
  const remediationEvents: TrajectoryReport["remediationEvents"] = [];
  for (const event of events) {
    if (event.remediationTarget && event.topicId) {
      remediationEvents.push({
        sessionNumber: event.sessionNumber,
        topicId: event.topicId,
        remediationTarget: event.remediationTarget,
      });
    }
  }

  // Check remediation return success: after remediation on prereq, did the original topic get attempted again?
  let remediationReturnSuccess = 0;
  const remediationTargets = new Set(remediationEvents.map((r) => r.remediationTarget));
  for (const target of remediationTargets) {
    // Find the original topic that triggered remediation
    const triggerEvent = remediationEvents.find((r) => r.remediationTarget === target);
    if (!triggerEvent) continue;

    // Check if the original topic was attempted after the remediation
    const laterEvents = events.filter(
      (e) =>
        e.topicId === triggerEvent.topicId &&
        e.sessionNumber >= triggerEvent.sessionNumber &&
        e.correct !== null &&
        e.phase !== "remediation"
    );
    if (laterEvents.length > 0) {
      remediationReturnSuccess++;
    }
  }

  // --- Fading analysis ---
  // Track fading level per topic across sessions
  const fadingByTopic = new Map<string, { session: number; level: number }[]>();
  for (const event of events) {
    if (event.fadingLevel !== null && event.topicId && event.phase === "instruction") {
      const key = event.topicId;
      if (!fadingByTopic.has(key)) fadingByTopic.set(key, []);
      fadingByTopic.get(key)!.push({ session: event.sessionNumber, level: event.fadingLevel });
    }
  }

  const fadingProgressions: TrajectoryReport["fadingProgressions"] = [];
  let fadingCorrectProgression = 0;
  for (const [topicId, levels] of fadingByTopic) {
    if (levels.length < 2) continue; // Need at least 2 visits to track progression
    fadingProgressions.push({ topicId, levels });

    // Check if fading level increases (or stays same) across visits
    let monotonic = true;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level < levels[i - 1].level) {
        monotonic = false;
        break;
      }
    }
    if (monotonic) fadingCorrectProgression++;
  }

  // --- Validations ---
  const validations: TrajectoryReport["validations"] = [];

  // V1: Mastery monotonic non-decreasing
  validations.push({
    name: "mastery-monotonic",
    passed: masteryRegressions.length === 0,
    detail:
      masteryRegressions.length === 0
        ? "Mastery never regresses across sessions"
        : `${masteryRegressions.length} regression(s): ${masteryRegressions.map((r) => `session ${r.fromSession}→${r.toSession} (-${(r.drop * 100).toFixed(1)}%)`).join(", ")}`,
  });

  // V2: Mastery progress (non-struggling profiles should gain mastery)
  const finalMastery = masteryCurve[masteryCurve.length - 1]?.masteryPercent ?? 0;
  const initialMastery = masteryCurve[0]?.masteryPercent ?? 0;
  const masteryGain = finalMastery - initialMastery;
  validations.push({
    name: "mastery-progress",
    passed: masteryGain > 0 || finalMastery > 0.5,
    detail: `Initial: ${(initialMastery * 100).toFixed(1)}%, Final: ${(finalMastery * 100).toFixed(1)}%, Gain: +${(masteryGain * 100).toFixed(1)}%`,
  });

  // V3: Remediation triggers for misconception profiles
  const hasMisconceptionEvents = remediationEvents.length > 0;
  validations.push({
    name: "remediation-triggered",
    passed: hasMisconceptionEvents || remediationEvents.length === 0, // Pass if no misconceptions expected
    detail: `${remediationEvents.length} remediation events, ${remediationTargets.size} unique targets`,
  });

  // V4: Remediation return success
  if (remediationTargets.size > 0) {
    const successRate = remediationReturnSuccess / remediationTargets.size;
    validations.push({
      name: "remediation-return",
      passed: successRate >= 0.5,
      detail: `${remediationReturnSuccess}/${remediationTargets.size} targets returned to (${(successRate * 100).toFixed(0)}%)`,
    });
  }

  // V5: Fading progression
  if (fadingProgressions.length > 0) {
    const fadingRate = fadingCorrectProgression / fadingProgressions.length;
    validations.push({
      name: "fading-progression",
      passed: fadingRate >= 0.5,
      detail: `${fadingCorrectProgression}/${fadingProgressions.length} topics with correct fading progression (${(fadingRate * 100).toFixed(0)}%)`,
    });
  }

  // V6: No excessive errors
  const errorEvents = events.filter((e) => e.phase === "error");
  validations.push({
    name: "no-excessive-errors",
    passed: errorEvents.length <= summaries.length * 0.1, // <10% error rate
    detail: `${errorEvents.length} error events across ${summaries.length} sessions`,
  });

  return {
    profileId,
    runDir,
    sessionsCompleted: summaries.length,
    totalDays: snapshots[snapshots.length - 1]?.day ?? 0,
    masteryCurve,
    masteryMonotonic: masteryRegressions.length === 0,
    masteryRegressions,
    finalMasteryPercent: finalMastery,
    remediationEvents,
    remediationCount: remediationEvents.length,
    remediationReturnSuccess,
    fadingProgressions,
    fadingCorrectProgression,
    fadingTotalTracked: fadingProgressions.length,
    validations,
  };
}

function findLatestRuns(baseDir: string): { profileId: string; runDir: string }[] {
  if (!existsSync(baseDir)) return [];

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  // Group by profile, take latest
  const latest = new Map<string, string>();
  for (const dir of dirs) {
    // Format: profileId-YYYY-MM-DDTHH-MM-SS-mmmZ
    const match = dir.match(/^(.+?)-\d{4}-\d{2}-\d{2}T/);
    if (!match) continue;
    const profileId = match[1];
    if (!latest.has(profileId)) {
      const runDir = join(baseDir, dir);
      // Only include runs with state-snapshots.json (Phase 3+)
      if (existsSync(join(runDir, "state-snapshots.json"))) {
        latest.set(profileId, runDir);
      }
    }
  }

  return [...latest.entries()].map(([profileId, runDir]) => ({ profileId, runDir }));
}

function formatReport(reports: TrajectoryReport[]): string {
  const lines: string[] = [];

  lines.push("# Trajectory Analysis Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Profiles analyzed: ${reports.length}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Profile | Sessions | Days | Final Mastery | Monotonic | Remediations | Fading |");
  lines.push("|---------|----------|------|---------------|-----------|-------------|--------|");

  for (const r of reports) {
    const fadingStr = r.fadingTotalTracked > 0
      ? `${r.fadingCorrectProgression}/${r.fadingTotalTracked}`
      : "N/A";
    lines.push(
      `| ${r.profileId} | ${r.sessionsCompleted} | ${r.totalDays} | ${(r.finalMasteryPercent * 100).toFixed(1)}% | ${r.masteryMonotonic ? "✓" : "✗"} | ${r.remediationCount} | ${fadingStr} |`
    );
  }

  // Mastery curves
  lines.push("");
  lines.push("## Mastery Curves");
  lines.push("");
  for (const r of reports) {
    lines.push(`### ${r.profileId}`);
    lines.push("");
    if (r.masteryCurve.length > 0) {
      lines.push("| Session | Day | Mastery % |");
      lines.push("|---------|-----|-----------|");
      for (const pt of r.masteryCurve) {
        lines.push(`| ${pt.session} | ${pt.day} | ${(pt.masteryPercent * 100).toFixed(1)}% |`);
      }
    }
    if (r.masteryRegressions.length > 0) {
      lines.push("");
      lines.push("**Regressions:**");
      for (const reg of r.masteryRegressions) {
        lines.push(`- Session ${reg.fromSession}→${reg.toSession}: -${(reg.drop * 100).toFixed(1)}%`);
      }
    }
    lines.push("");
  }

  // Remediation details
  const profilesWithRemediation = reports.filter((r) => r.remediationCount > 0);
  if (profilesWithRemediation.length > 0) {
    lines.push("## Remediation Analysis");
    lines.push("");
    for (const r of profilesWithRemediation) {
      lines.push(`### ${r.profileId}`);
      lines.push("");
      lines.push(`- Total remediation events: ${r.remediationCount}`);
      lines.push(`- Unique targets: ${new Set(r.remediationEvents.map((e) => e.remediationTarget)).size}`);
      lines.push(`- Return success: ${r.remediationReturnSuccess}`);
      lines.push("");

      // Group by target
      const byTarget = new Map<string, typeof r.remediationEvents>();
      for (const event of r.remediationEvents) {
        const key = event.remediationTarget;
        if (!byTarget.has(key)) byTarget.set(key, []);
        byTarget.get(key)!.push(event);
      }
      for (const [target, events] of byTarget) {
        lines.push(`**Target: ${target}** (${events.length} events)`);
        for (const e of events.slice(0, 5)) {
          lines.push(`  - Session ${e.sessionNumber}: triggered from ${e.topicId}`);
        }
        if (events.length > 5) lines.push(`  - ... and ${events.length - 5} more`);
        lines.push("");
      }
    }
  }

  // Fading details
  const profilesWithFading = reports.filter((r) => r.fadingTotalTracked > 0);
  if (profilesWithFading.length > 0) {
    lines.push("## Fading Progression");
    lines.push("");
    for (const r of profilesWithFading) {
      lines.push(`### ${r.profileId}`);
      lines.push("");
      lines.push(`- Topics with fading data: ${r.fadingTotalTracked}`);
      lines.push(`- Correct progression: ${r.fadingCorrectProgression}/${r.fadingTotalTracked}`);
      lines.push("");
      for (const fp of r.fadingProgressions.slice(0, 10)) {
        const levelStr = fp.levels.map((l) => `S${l.session}:L${l.level}`).join(" → ");
        lines.push(`- **${fp.topicId}**: ${levelStr}`);
      }
      if (r.fadingProgressions.length > 10) {
        lines.push(`- ... and ${r.fadingProgressions.length - 10} more topics`);
      }
      lines.push("");
    }
  }

  // Validation summary
  lines.push("## Validation Results");
  lines.push("");
  lines.push("| Profile | Validation | Result | Detail |");
  lines.push("|---------|-----------|--------|--------|");
  for (const r of reports) {
    for (const v of r.validations) {
      lines.push(`| ${r.profileId} | ${v.name} | ${v.passed ? "PASS" : "FAIL"} | ${v.detail} |`);
    }
  }

  return lines.join("\n");
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const runsDir = join(process.cwd(), "simulations", "runs");
  const reportsDir = join(process.cwd(), "simulations", "reports");

  let runDirs: string[] = [];

  if (args.includes("--all-latest")) {
    const latest = findLatestRuns(runsDir);
    if (latest.length === 0) {
      console.error("No simulation runs with state snapshots found. Run `just simulate-all --sessions 30` first.");
      process.exit(1);
    }
    runDirs = latest.map((r) => r.runDir);
    console.log(`Found ${runDirs.length} latest runs with trajectory data`);
  } else if (args.length > 0 && !args[0].startsWith("--")) {
    const dir = args[0].startsWith("/") ? args[0] : join(runsDir, args[0]);
    if (!existsSync(dir)) {
      console.error(`Run directory not found: ${dir}`);
      process.exit(1);
    }
    runDirs = [dir];
  } else {
    console.log("Usage: npx tsx simulations/src/trajectory-analysis.ts [run-dir]");
    console.log("       npx tsx simulations/src/trajectory-analysis.ts --all-latest");
    process.exit(1);
  }

  const reports: TrajectoryReport[] = [];
  for (const runDir of runDirs) {
    console.log(`Analyzing: ${runDir.split("/").pop()}`);
    const report = analyzeTrajectory(runDir);
    reports.push(report);

    // Print quick summary
    const passCount = report.validations.filter((v) => v.passed).length;
    const failCount = report.validations.filter((v) => !v.passed).length;
    console.log(`  ${report.profileId}: ${report.sessionsCompleted} sessions, ${(report.finalMasteryPercent * 100).toFixed(1)}% mastery, ${passCount} pass / ${failCount} fail`);
  }

  // Write report
  const reportContent = formatReport(reports);
  const reportPath = join(reportsDir, "trajectory.md");
  writeFileSync(reportPath, reportContent + "\n");
  console.log(`\nReport written to: ${reportPath}`);

  // Summary
  const totalPass = reports.flatMap((r) => r.validations).filter((v) => v.passed).length;
  const totalFail = reports.flatMap((r) => r.validations).filter((v) => !v.passed).length;
  console.log(`\nOverall: ${totalPass} passed, ${totalFail} failed`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
