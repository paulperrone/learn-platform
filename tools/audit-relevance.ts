/**
 * Audit relevance guard — maps changed files to affected audit sections.
 * Advisory only: prints recommendations, doesn't block anything.
 *
 * Usage:
 *   npx tsx tools/audit-relevance.ts                       # Check uncommitted changes
 *   npx tsx tools/audit-relevance.ts --content-dir <path>  # Override content dir
 *   npx tsx tools/audit-relevance.ts --files file1 file2   # Check specific files
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, relative } from "path";

// ── Audit section definitions ──

export type AuditSection = {
  id: number;
  name: string;
};

export const AUDIT_SECTIONS: AuditSection[] = [
  { id: 1, name: "Graph Integrity" },
  { id: 2, name: "Content Quality" },
  { id: 3, name: "Simulation Results" },
  { id: 4, name: "Content Effectiveness" },
  { id: 5, name: "LLM Tracking" },
  { id: 6, name: "Media Readiness" },
  { id: 7, name: "Multi-Discipline Coverage" },
  { id: 8, name: "Content Review" },
];

// ── File-to-section mapping rules ──

type MappingRule = {
  pattern: RegExp;
  sections: number[];
  reason: string;
  recommendations: string[];
};

const MAPPING_RULES: MappingRule[] = [
  {
    pattern: /packages\/api\/src\/services\/srs\.ts$/,
    sections: [3, 4],
    reason: "SRS engine code changed",
    recommendations: ["just regression", "just evaluate"],
  },
  {
    pattern: /packages\/api\/src\/services\/graph\.ts$/,
    sections: [1, 3],
    reason: "graph service code changed",
    recommendations: ["just audit", "just regression"],
  },
  {
    pattern: /packages\/api\/src\/services\/session\.ts$/,
    sections: [3],
    reason: "session service code changed",
    recommendations: ["just regression"],
  },
  {
    pattern: /packages\/api\/src\/services\/diagnostic\.ts$/,
    sections: [3],
    reason: "diagnostic service code changed",
    recommendations: ["just regression"],
  },
  {
    pattern: /packages\/api\/src\/services\/llm\.ts$/,
    sections: [5],
    reason: "LLM service code changed",
    recommendations: ["just audit"],
  },
  {
    pattern: /packages\/api\/src\/services\/content-r2\.ts$/,
    sections: [2],
    reason: "content delivery code changed",
    recommendations: ["just audit"],
  },
  {
    pattern: /graph\.json$/,
    sections: [1, 2, 8],
    reason: "graph structure changed",
    recommendations: ["just audit", "/content-review"],
  },
  {
    pattern: /problems\/[^/]+\.json$/,
    sections: [2, 8],
    reason: "problem content changed",
    recommendations: ["just audit", "/content-review"],
  },
  {
    pattern: /examples\/[^/]+\.json$/,
    sections: [2, 8],
    reason: "example content changed",
    recommendations: ["just audit", "/content-review"],
  },
  {
    pattern: /simulations\/targets\.json$/,
    sections: [3],
    reason: "simulation targets changed",
    recommendations: ["just evaluate"],
  },
  {
    pattern: /simulations\/profiles\/[^/]+\.json$/,
    sections: [3],
    reason: "simulation profile changed",
    recommendations: ["just regression"],
  },
  {
    pattern: /tools\/audit[^/]*\.ts$/,
    sections: [1, 2, 3, 4, 5, 6, 7, 8],
    reason: "audit tool code changed",
    recommendations: ["just audit"],
  },
  {
    pattern: /tools\/content-[^/]*\.ts$/,
    sections: [2],
    reason: "content tool code changed",
    recommendations: ["just audit"],
  },
  {
    pattern: /packages\/api\/src\/db\/schema\.ts$/,
    sections: [1, 2, 3, 4, 5, 6, 7, 8],
    reason: "database schema changed",
    recommendations: ["just audit"],
  },
];

// ── Core logic ──

export type AuditRelevance = {
  changedFiles: string[];
  affectedSections: { section: AuditSection; reasons: string[] }[];
  unaffectedSections: AuditSection[];
  recommendations: string[];
};

export function checkRelevance(changedFiles: string[]): AuditRelevance {
  const sectionReasons = new Map<number, Set<string>>();
  const allRecommendations = new Set<string>();

  for (const file of changedFiles) {
    // Normalize path separators
    const normalized = file.replace(/\\/g, "/");
    for (const rule of MAPPING_RULES) {
      if (rule.pattern.test(normalized)) {
        for (const sectionId of rule.sections) {
          if (!sectionReasons.has(sectionId)) {
            sectionReasons.set(sectionId, new Set());
          }
          sectionReasons.get(sectionId)!.add(rule.reason);
        }
        for (const rec of rule.recommendations) {
          allRecommendations.add(rec);
        }
      }
    }
  }

  const affectedSections = AUDIT_SECTIONS
    .filter((s) => sectionReasons.has(s.id))
    .map((s) => ({
      section: s,
      reasons: [...sectionReasons.get(s.id)!],
    }));

  const unaffectedSections = AUDIT_SECTIONS.filter(
    (s) => !sectionReasons.has(s.id)
  );

  return {
    changedFiles,
    affectedSections,
    unaffectedSections,
    recommendations: [...allRecommendations],
  };
}

// ── Git diff helpers ──

function getChangedFiles(contentDir?: string): string[] {
  const files: string[] = [];

  // Platform repo changes
  try {
    const diff = execSync("git diff --name-only HEAD", {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();
    const staged = execSync("git diff --name-only --cached", {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();

    if (diff) files.push(...diff.split("\n"));
    if (staged) files.push(...staged.split("\n").filter((f) => !files.includes(f)));
  } catch {
    // Not a git repo or no changes
  }

  // Content repo changes
  const resolvedContentDir = contentDir || process.env.CONTENT_DIR || resolve(process.cwd(), "..", "learn-content");
  if (existsSync(resolvedContentDir)) {
    try {
      const diff = execSync("git diff --name-only HEAD", {
        encoding: "utf-8",
        cwd: resolvedContentDir,
      }).trim();
      const staged = execSync("git diff --name-only --cached", {
        encoding: "utf-8",
        cwd: resolvedContentDir,
      }).trim();

      // Prefix with relative path from platform repo
      const rel = relative(process.cwd(), resolvedContentDir);
      const contentFiles: string[] = [];
      if (diff) contentFiles.push(...diff.split("\n"));
      if (staged) contentFiles.push(...staged.split("\n").filter((f) => !contentFiles.includes(f)));

      files.push(...contentFiles.map((f) => `${rel}/${f}`));
    } catch {
      // Not a git repo or no changes
    }
  }

  return files.filter((f) => f.length > 0);
}

// ── CLI output ──

function formatOutput(result: AuditRelevance): string {
  const lines: string[] = [];

  if (result.changedFiles.length === 0) {
    lines.push("No uncommitted changes detected.");
    return lines.join("\n");
  }

  lines.push(`Changed files (${result.changedFiles.length}):`);
  for (const f of result.changedFiles) {
    lines.push(`  ${f}`);
  }
  lines.push("");

  if (result.affectedSections.length === 0) {
    lines.push("No audit sections affected by these changes.");
    return lines.join("\n");
  }

  lines.push("Affected audit sections:");
  for (const { section, reasons } of result.affectedSections) {
    const reasonStr = reasons.join(", ");
    lines.push(`  \u26A0\uFE0F  Section ${section.id}: ${section.name} \u2014 ${reasonStr}`);
  }
  lines.push("");

  lines.push("Recommended:");
  for (const rec of result.recommendations) {
    lines.push(`  ${rec}`);
  }
  lines.push("");

  if (result.unaffectedSections.length > 0) {
    const names = result.unaffectedSections.map((s) => `${s.id} (${s.name})`).join(", ");
    lines.push(`Unaffected sections: ${names}`);
  }

  return lines.join("\n");
}

// ── CLI entry ──

const isCLI = process.argv[1]?.endsWith("audit-relevance.ts");

if (isCLI) {
  const args = process.argv.slice(2);
  let contentDir: string | undefined;
  let explicitFiles: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--content-dir" && args[i + 1]) {
      contentDir = args[++i];
    } else if (args[i] === "--files") {
      explicitFiles = args.slice(i + 1);
      break;
    }
  }

  console.log("Checking changes against audit relevance map...\n");

  const files = explicitFiles ?? getChangedFiles(contentDir);
  const result = checkRelevance(files);
  console.log(formatOutput(result));

  // Always exit 0 — advisory only
  process.exit(0);
}
