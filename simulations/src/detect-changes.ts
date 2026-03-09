#!/usr/bin/env npx tsx
/**
 * Change Detection for Healing System
 *
 * Detects codebase changes since the last healing epoch and assesses
 * which targets might need updating.
 *
 * Usage:
 *   npx tsx simulations/src/detect-changes.ts              # Full change detection
 *   npx tsx simulations/src/detect-changes.ts --json        # JSON-only output
 *   npx tsx simulations/src/detect-changes.ts --since <ISO> # Changes since specific date
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { loadTargets } from "./load-targets.js";
import type { TargetFile, TargetDefinition } from "./types.js";

// ── Types ────────────────────────────────────────────────────────────

export type ChangeCategory =
  | "service"
  | "schema"
  | "content"
  | "simulation"
  | "config"
  | "docs"
  | "other";

export type DetectedChange = {
  file: string;
  category: ChangeCategory;
  summary: string;
  linesChanged: number;
};

export type TargetImpact = {
  targetId: string;
  targetName: string;
  reason: string;
  severity: "high" | "medium" | "low";
  affectedFiles: string[];
};

export type ChangeReport = {
  since: string;
  changes: DetectedChange[];
  impacts: TargetImpact[];
  newFiles: string[];
  staleness: {
    targetVersion: number;
    lastUpdated: string;
    daysSinceUpdate: number;
    isStale: boolean;
  };
  summary: {
    totalChanges: number;
    byCategory: Record<ChangeCategory, number>;
    highImpactCount: number;
    mediumImpactCount: number;
    lowImpactCount: number;
  };
};

// ── Constants ────────────────────────────────────────────────────────

const ROOT = process.cwd();
const HEALING_DIR = join(ROOT, "simulations", "reports", "healing");
const HISTORY_PATH = join(HEALING_DIR, "history.json");

// ── Category classification ──────────────────────────────────────────

function categorizeFile(filePath: string): ChangeCategory {
  if (filePath.startsWith("packages/api/src/services/")) return "service";
  if (filePath.startsWith("packages/api/src/db/")) return "schema";
  if (filePath.startsWith("content/")) return "content";
  if (filePath.startsWith("simulations/")) return "simulation";
  if (
    filePath.includes("wrangler") ||
    filePath.includes("vitest.config") ||
    filePath.includes("tsconfig") ||
    filePath.includes("package.json")
  )
    return "config";
  if (filePath.startsWith("docs/") || filePath.endsWith(".md")) return "docs";
  return "other";
}

// ── Git helpers ──────────────────────────────────────────────────────

function getLastHealTimestamp(): string | null {
  if (!existsSync(HISTORY_PATH)) return null;
  try {
    const history = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
    const epochs = history.epochs;
    if (epochs.length === 0) return null;
    return epochs[epochs.length - 1].timestamp;
  } catch {
    return null;
  }
}

function getGitChanges(since: string): DetectedChange[] {
  try {
    const output = execSync(
      `git log --since="${since}" --name-only --pretty=format:"" --diff-filter=ACDMR`,
      { cwd: ROOT, encoding: "utf-8" }
    );

    const files = [
      ...new Set(
        output
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      ),
    ];

    return files.map((file) => {
      let linesChanged = 0;
      try {
        const stat = execSync(
          `git log --since="${since}" --numstat --pretty=format:"" -- "${file}"`,
          { cwd: ROOT, encoding: "utf-8" }
        );
        for (const line of stat.split("\n").filter(Boolean)) {
          const parts = line.split("\t");
          if (parts.length >= 2) {
            const added = parseInt(parts[0], 10) || 0;
            const removed = parseInt(parts[1], 10) || 0;
            linesChanged += added + removed;
          }
        }
      } catch {
        // binary file or git error
      }

      return {
        file,
        category: categorizeFile(file),
        summary: summarizeChange(file),
        linesChanged,
      };
    });
  } catch {
    return [];
  }
}

function summarizeChange(file: string): string {
  const category = categorizeFile(file);
  switch (category) {
    case "service":
      return `Service code: ${file.split("/").pop()}`;
    case "schema":
      return `Schema change: ${file.split("/").pop()}`;
    case "content":
      return `Content: ${file.replace("content/", "")}`;
    case "simulation":
      return `Simulation: ${file.split("/").pop()}`;
    case "config":
      return `Config: ${file.split("/").pop()}`;
    case "docs":
      return `Documentation: ${file.split("/").pop()}`;
    default:
      return file;
  }
}

// ── Target impact assessment ─────────────────────────────────────────

function assessTargetImpact(
  changes: DetectedChange[],
  targets: TargetFile
): TargetImpact[] {
  const impacts: TargetImpact[] = [];

  const serviceChanges = changes.filter((c) => c.category === "service");
  const schemaChanges = changes.filter((c) => c.category === "schema");
  const contentChanges = changes.filter((c) => c.category === "content");
  const simChanges = changes.filter((c) => c.category === "simulation");

  // Check each target's source_files against changed files
  for (const [targetId, target] of Object.entries(targets.systems)) {
    const affectedFiles: string[] = [];

    for (const change of serviceChanges) {
      if (target.source_files.some((sf) => change.file.includes(sf) || sf.includes(change.file))) {
        affectedFiles.push(change.file);
      }
    }

    if (affectedFiles.length > 0) {
      const totalLines = affectedFiles.reduce((sum, f) => {
        const change = changes.find((c) => c.file === f);
        return sum + (change?.linesChanged ?? 0);
      }, 0);

      impacts.push({
        targetId,
        targetName: target.name,
        reason: `Source files modified: ${affectedFiles.map((f) => f.split("/").pop()).join(", ")} (${totalLines} lines changed)`,
        severity: totalLines > 50 ? "high" : totalLines > 15 ? "medium" : "low",
        affectedFiles,
      });
    }
  }

  // Schema changes affect all targets (broad impact)
  if (schemaChanges.length > 0) {
    impacts.push({
      targetId: "_schema",
      targetName: "Database Schema",
      reason: `Schema changed: ${schemaChanges.map((c) => c.file.split("/").pop()).join(", ")}. Review all targets for new/modified columns.`,
      severity: "high",
      affectedFiles: schemaChanges.map((c) => c.file),
    });
  }

  // Content changes may affect content-quality targets
  if (contentChanges.length > 0) {
    const newSubjects = new Set<string>();
    for (const c of contentChanges) {
      const parts = c.file.split("/");
      if (parts.length >= 2) newSubjects.add(parts[1]);
    }

    impacts.push({
      targetId: "_content",
      targetName: "Content Quality",
      reason: `Content changed in: ${[...newSubjects].join(", ")}. Run expansion checklist if new subjects.`,
      severity: contentChanges.length > 10 ? "high" : "medium",
      affectedFiles: contentChanges.map((c) => c.file),
    });
  }

  // Simulation changes (profiles, evaluation logic)
  const profileChanges = simChanges.filter((c) =>
    c.file.includes("profiles/")
  );
  const evalChanges = simChanges.filter(
    (c) =>
      c.file.includes("evaluate.ts") ||
      c.file.includes("load-targets.ts") ||
      c.file.includes("types.ts")
  );

  if (profileChanges.length > 0) {
    impacts.push({
      targetId: "_profiles",
      targetName: "Learner Profiles",
      reason: `Profiles changed: ${profileChanges.map((c) => c.file.split("/").pop()).join(", ")}. Update profile_expectations in targets.json.`,
      severity: "medium",
      affectedFiles: profileChanges.map((c) => c.file),
    });
  }

  if (evalChanges.length > 0) {
    impacts.push({
      targetId: "_evaluation",
      targetName: "Evaluation Logic",
      reason: `Evaluation code changed: ${evalChanges.map((c) => c.file.split("/").pop()).join(", ")}. Verify metric computations still match target definitions.`,
      severity: "medium",
      affectedFiles: evalChanges.map((c) => c.file),
    });
  }

  return impacts;
}

// ── Staleness check ──────────────────────────────────────────────────

function checkStaleness(targets: TargetFile): ChangeReport["staleness"] {
  const lastUpdated = new Date(targets.lastUpdated);
  const now = new Date();
  const daysSinceUpdate = Math.floor(
    (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    targetVersion: targets.version,
    lastUpdated: targets.lastUpdated,
    daysSinceUpdate,
    isStale: daysSinceUpdate > 7,
  };
}

// ── Report generation ────────────────────────────────────────────────

function buildReport(
  since: string,
  changes: DetectedChange[],
  impacts: TargetImpact[],
  targets: TargetFile
): ChangeReport {
  const byCategory: Record<ChangeCategory, number> = {
    service: 0,
    schema: 0,
    content: 0,
    simulation: 0,
    config: 0,
    docs: 0,
    other: 0,
  };

  for (const c of changes) {
    byCategory[c.category]++;
  }

  const newFiles = changes
    .filter((c) => {
      try {
        const out = execSync(
          `git log --since="${since}" --diff-filter=A --name-only --pretty=format:"" -- "${c.file}"`,
          { cwd: ROOT, encoding: "utf-8" }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    })
    .map((c) => c.file);

  return {
    since,
    changes,
    impacts,
    newFiles,
    staleness: checkStaleness(targets),
    summary: {
      totalChanges: changes.length,
      byCategory,
      highImpactCount: impacts.filter((i) => i.severity === "high").length,
      mediumImpactCount: impacts.filter((i) => i.severity === "medium").length,
      lowImpactCount: impacts.filter((i) => i.severity === "low").length,
    },
  };
}

// ── Console output ───────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function printReport(report: ChangeReport): void {
  console.log(
    `\n${BOLD}═══ Healing System Change Detection ═══${RESET}\n`
  );

  // Staleness
  const stale = report.staleness;
  const staleColor = stale.isStale ? RED : GREEN;
  console.log(
    `${BOLD}Targets:${RESET} v${stale.targetVersion} | Last updated: ${stale.lastUpdated} | ${staleColor}${stale.daysSinceUpdate} days ago${RESET}${stale.isStale ? ` ${RED}(STALE)${RESET}` : ""}`
  );
  console.log(`${BOLD}Changes since:${RESET} ${report.since}\n`);

  // Summary
  console.log(`${BOLD}Changes by area:${RESET}`);
  for (const [cat, count] of Object.entries(report.summary.byCategory)) {
    if (count > 0) {
      console.log(`  ${cat}: ${count} files`);
    }
  }
  console.log();

  // New files
  if (report.newFiles.length > 0) {
    console.log(`${BOLD}New files:${RESET}`);
    for (const f of report.newFiles) {
      console.log(`  ${GREEN}+ ${f}${RESET}`);
    }
    console.log();
  }

  // Impacts
  if (report.impacts.length === 0) {
    console.log(`${GREEN}No target impacts detected.${RESET}\n`);
    return;
  }

  console.log(`${BOLD}Target impacts:${RESET}`);
  const sorted = [...report.impacts].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });

  for (const impact of sorted) {
    const color =
      impact.severity === "high"
        ? RED
        : impact.severity === "medium"
          ? YELLOW
          : DIM;
    const icon =
      impact.severity === "high"
        ? "!!!"
        : impact.severity === "medium"
          ? " ! "
          : " . ";
    console.log(
      `  ${color}[${icon}]${RESET} ${BOLD}${impact.targetName}${RESET} ${DIM}(${impact.targetId})${RESET}`
    );
    console.log(`        ${impact.reason}`);
  }

  console.log(
    `\n${BOLD}Summary:${RESET} ${RED}${report.summary.highImpactCount} high${RESET}, ${YELLOW}${report.summary.mediumImpactCount} medium${RESET}, ${DIM}${report.summary.lowImpactCount} low${RESET} impacts`
  );

  if (report.summary.highImpactCount > 0) {
    console.log(
      `\n${YELLOW}Recommendation: Run /heal-update to review and apply target updates.${RESET}`
    );
  }
}

// ── Exported functions ───────────────────────────────────────────────

export function getChangesSinceLastHeal(): { since: string; changes: DetectedChange[] } {
  const lastTimestamp = getLastHealTimestamp();
  const since = lastTimestamp ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return { since, changes: getGitChanges(since) };
}

export function categorizeChanges(changes: DetectedChange[]): Record<ChangeCategory, DetectedChange[]> {
  const result: Record<ChangeCategory, DetectedChange[]> = {
    service: [],
    schema: [],
    content: [],
    simulation: [],
    config: [],
    docs: [],
    other: [],
  };
  for (const c of changes) {
    result[c.category].push(c);
  }
  return result;
}

export function assessImpact(changes: DetectedChange[], targetsOrResult: TargetFile): TargetImpact[] {
  return assessTargetImpact(changes, targetsOrResult);
}

export function detectChanges(sinceOverride?: string): ChangeReport {
  const { targets } = loadTargets();
  const lastTimestamp = getLastHealTimestamp();
  const since = sinceOverride ?? lastTimestamp ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const changes = getGitChanges(since);
  const impacts = assessTargetImpact(changes, targets);
  return buildReport(since, changes, impacts, targets);
}

// ── CLI ──────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const sinceIdx = args.indexOf("--since");
  const sinceOverride = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;

  const report = detectChanges(sinceOverride);

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main();
