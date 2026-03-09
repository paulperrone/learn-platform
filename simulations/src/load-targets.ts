/**
 * Load and validate targets.json for the healing loop.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import type {
  TargetFile,
  TargetDefinition,
  ProfileExpectation,
  TargetDirection,
} from "./types.js";

const TARGETS_PATH = join(process.cwd(), "simulations", "targets.json");

type ValidationError = {
  field: string;
  message: string;
};

type LoadResult = {
  targets: TargetFile;
  errors: ValidationError[];
  warnings: string[];
};

const VALID_DIRECTIONS: TargetDirection[] = ["higher_better", "lower_better", "in_range"];
const VALID_PRIORITIES = ["P0", "P1", "P2"];
const VALID_UNITS = ["percent", "count", "ratio", "bits", "grade_levels"];
const VALID_REMEDIATION = ["none", "low", "moderate", "high"];
const VALID_SIGNAL_SOURCES = ["engine", "content", "bridge"];

function validateSystemTarget(id: string, target: TargetDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `systems.${id}`;

  if (!target.name) errors.push({ field: `${prefix}.name`, message: "Required" });
  if (!target.description) errors.push({ field: `${prefix}.description`, message: "Required" });
  if (!VALID_PRIORITIES.includes(target.priority)) {
    errors.push({ field: `${prefix}.priority`, message: `Must be one of: ${VALID_PRIORITIES.join(", ")}` });
  }
  if (!target.metric) errors.push({ field: `${prefix}.metric`, message: "Required" });
  if (typeof target.target !== "number") {
    errors.push({ field: `${prefix}.target`, message: "Must be a number" });
  }
  if (typeof target.tolerance !== "number") {
    errors.push({ field: `${prefix}.tolerance`, message: "Must be a number" });
  }
  if (!VALID_UNITS.includes(target.unit)) {
    errors.push({ field: `${prefix}.unit`, message: `Must be one of: ${VALID_UNITS.join(", ")}` });
  }
  if (!VALID_DIRECTIONS.includes(target.direction)) {
    errors.push({ field: `${prefix}.direction`, message: `Must be one of: ${VALID_DIRECTIONS.join(", ")}` });
  }
  if (target.direction === "in_range") {
    if (typeof target.range_min !== "number") {
      errors.push({ field: `${prefix}.range_min`, message: "Required when direction is in_range" });
    }
    if (typeof target.range_max !== "number") {
      errors.push({ field: `${prefix}.range_max`, message: "Required when direction is in_range" });
    }
  }
  if (!target.science_ref) errors.push({ field: `${prefix}.science_ref`, message: "Required" });
  if (!target.rationale) errors.push({ field: `${prefix}.rationale`, message: "Required" });
  if (!Array.isArray(target.source_files) || target.source_files.length === 0) {
    errors.push({ field: `${prefix}.source_files`, message: "Must be a non-empty array" });
  }
  if (!Array.isArray(target.evaluation_profiles) || target.evaluation_profiles.length === 0) {
    errors.push({ field: `${prefix}.evaluation_profiles`, message: "Must be a non-empty array" });
  }
  if (!VALID_SIGNAL_SOURCES.includes(target.signal_source)) {
    errors.push({ field: `${prefix}.signal_source`, message: `Must be one of: ${VALID_SIGNAL_SOURCES.join(", ")}` });
  }

  return errors;
}

function validateProfileExpectation(id: string, exp: ProfileExpectation): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `profile_expectations.${id}`;

  if (!exp.description) errors.push({ field: `${prefix}.description`, message: "Required" });
  if (!exp.behavioral_signature) errors.push({ field: `${prefix}.behavioral_signature`, message: "Required" });
  if (typeof exp.min_final_mastery !== "number") {
    errors.push({ field: `${prefix}.min_final_mastery`, message: "Must be a number" });
  }
  if (typeof exp.max_final_mastery !== "number") {
    errors.push({ field: `${prefix}.max_final_mastery`, message: "Must be a number" });
  }
  if (exp.min_final_mastery > exp.max_final_mastery) {
    errors.push({ field: `${prefix}.min_final_mastery`, message: "Must be <= max_final_mastery" });
  }
  if (typeof exp.expected_frontier_grade !== "number") {
    errors.push({ field: `${prefix}.expected_frontier_grade`, message: "Must be a number" });
  }
  if (!exp.expected_presentation_center) {
    errors.push({ field: `${prefix}.expected_presentation_center`, message: "Required" });
  }
  if (!VALID_REMEDIATION.includes(exp.expected_remediation_events)) {
    errors.push({ field: `${prefix}.expected_remediation_events`, message: `Must be one of: ${VALID_REMEDIATION.join(", ")}` });
  }
  if (typeof exp.mastery_growth_rate !== "number") {
    errors.push({ field: `${prefix}.mastery_growth_rate`, message: "Must be a number" });
  }
  if (typeof exp.difficulty_convergence_by !== "number") {
    errors.push({ field: `${prefix}.difficulty_convergence_by`, message: "Must be a number" });
  }

  return errors;
}

function validateProfileReferences(targets: TargetFile): ValidationError[] {
  const errors: ValidationError[] = [];
  const profileIds = Object.keys(targets.profile_expectations);

  // Check that profiles referenced in system targets exist
  for (const [sysId, sys] of Object.entries(targets.systems)) {
    for (const profileRef of sys.evaluation_profiles) {
      if (profileRef === "all") continue;
      if (!profileIds.includes(profileRef)) {
        errors.push({
          field: `systems.${sysId}.evaluation_profiles`,
          message: `Profile "${profileRef}" not found in profile_expectations`,
        });
      }
    }
  }

  // Check that profile JSON files exist
  const profilesDir = join(process.cwd(), "simulations", "profiles");
  for (const profileId of profileIds) {
    const profilePath = join(profilesDir, `${profileId}.json`);
    if (!existsSync(profilePath)) {
      errors.push({
        field: `profile_expectations.${profileId}`,
        message: `Profile file not found: ${profilePath}`,
      });
    }
  }

  return errors;
}

function validateSourceFiles(targets: TargetFile): string[] {
  const warnings: string[] = [];

  for (const [sysId, sys] of Object.entries(targets.systems)) {
    for (const file of sys.source_files) {
      const fullPath = join(process.cwd(), file);
      if (!existsSync(fullPath)) {
        warnings.push(`systems.${sysId}: Source file not found: ${file}`);
      }
    }
  }

  return warnings;
}

function checkStaleness(targets: TargetFile): string[] {
  const warnings: string[] = [];
  const targetsDate = new Date(targets.lastUpdated);
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - targetsDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > 14) {
    warnings.push(
      `targets.json last updated ${Math.floor(daysSinceUpdate)} days ago (${targets.lastUpdated}). ` +
      `Consider running /heal-update to check for needed changes.`
    );
  }

  // Check if any source files are newer than targets.json
  const targetsFileStat = statSync(TARGETS_PATH);
  for (const sys of Object.values(targets.systems)) {
    for (const file of sys.source_files) {
      const fullPath = join(process.cwd(), file);
      if (existsSync(fullPath)) {
        const fileStat = statSync(fullPath);
        if (fileStat.mtimeMs > targetsFileStat.mtimeMs) {
          warnings.push(`Source file ${file} is newer than targets.json — targets may be stale`);
        }
      }
    }
  }

  return warnings;
}

export function loadTargets(path?: string): LoadResult {
  const targetsPath = path ?? TARGETS_PATH;

  if (!existsSync(targetsPath)) {
    throw new Error(`targets.json not found at ${targetsPath}`);
  }

  const raw = readFileSync(targetsPath, "utf-8");
  let targets: TargetFile;
  try {
    targets = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse targets.json: ${(e as Error).message}`);
  }

  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Validate version
  if (typeof targets.version !== "number") {
    errors.push({ field: "version", message: "Must be a number" });
  }
  if (!targets.lastUpdated) {
    errors.push({ field: "lastUpdated", message: "Required" });
  }

  // Validate systems
  if (!targets.systems || typeof targets.systems !== "object") {
    errors.push({ field: "systems", message: "Required and must be an object" });
  } else {
    for (const [id, sys] of Object.entries(targets.systems)) {
      errors.push(...validateSystemTarget(id, sys));
    }
  }

  // Validate profile expectations
  if (!targets.profile_expectations || typeof targets.profile_expectations !== "object") {
    errors.push({ field: "profile_expectations", message: "Required and must be an object" });
  } else {
    for (const [id, exp] of Object.entries(targets.profile_expectations)) {
      errors.push(...validateProfileExpectation(id, exp));
    }
    errors.push(...validateProfileReferences(targets));
  }

  // Validate content quality
  if (!targets.content_quality) {
    errors.push({ field: "content_quality", message: "Required" });
  }

  // Check source files and staleness (warnings only)
  if (targets.systems) {
    warnings.push(...validateSourceFiles(targets));
  }
  warnings.push(...checkStaleness(targets));

  return { targets, errors, warnings };
}

// CLI: validate targets.json
if (process.argv[1]?.endsWith("load-targets.ts") || process.argv[1]?.endsWith("load-targets.js")) {
  try {
    const result = loadTargets();

    if (result.errors.length > 0) {
      console.error("Validation ERRORS:");
      for (const err of result.errors) {
        console.error(`  ${err.field}: ${err.message}`);
      }
    }

    if (result.warnings.length > 0) {
      console.warn("\nWarnings:");
      for (const warn of result.warnings) {
        console.warn(`  ${warn}`);
      }
    }

    const systemCount = Object.keys(result.targets.systems).length;
    const profileCount = Object.keys(result.targets.profile_expectations).length;

    if (result.errors.length === 0) {
      console.log(`\ntargets.json valid: ${systemCount} systems, ${profileCount} profiles (v${result.targets.version})`);
    } else {
      console.error(`\ntargets.json has ${result.errors.length} errors`);
      process.exit(1);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
