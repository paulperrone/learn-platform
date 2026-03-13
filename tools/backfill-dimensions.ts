/**
 * Backfill dimension fields on all content items across disciplines.
 *
 * Adds presentation, contentDepth, locale, flavor, source, and type to every
 * problem/example that is missing them. Also remaps non-standard cognitiveDemand
 * values to the canonical set.
 *
 * Usage:
 *   npx tsx tools/backfill-dimensions.ts [--discipline <name>] [--dry-run]
 *
 * Flags:
 *   --discipline <name>  Process only this discipline (default: all)
 *   --dry-run            Preview changes without writing files
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const disciplineIdx = args.indexOf("--discipline");
const targetDiscipline = disciplineIdx !== -1 ? args[disciplineIdx + 1] : null;

const VALID_DEMANDS = new Set(["procedural", "conceptual", "application", "reasoning", "error_analysis", "recall"]);
const DEMAND_REMAP: Record<string, string> = {
  analysis: "reasoning",
  "problem-solving": "application",
  "error-analysis": "error_analysis",
  synthesis: "reasoning",
};

const contentDir = getContentDir();
const disciplines = targetDiscipline
  ? [targetDiscipline]
  : readdirSync(contentDir).filter((d) => {
      const graphPath = join(contentDir, d, "graph.json");
      return existsSync(graphPath);
    });

let totalFilesUpdated = 0;
let totalDimensionFieldsAdded = 0;
let totalDemandsRemapped = 0;
let totalFilesSkipped = 0;

for (const discipline of disciplines) {
  const disciplineDir = join(contentDir, discipline);
  const graphPath = join(disciplineDir, "graph.json");

  if (!existsSync(graphPath)) {
    console.warn(`WARN: No graph.json for ${discipline}, skipping`);
    continue;
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topicMeta = new Map<string, { defaultPresentation: string; contentDepth: string }>();
  for (const topic of graph.topics ?? []) {
    topicMeta.set(topic.id, {
      defaultPresentation: topic.defaultPresentation ?? "standard",
      contentDepth: topic.contentDepth ?? "survey",
    });
  }

  console.log(`\n=== ${discipline} (${topicMeta.size} topics) ===`);

  // Process problems (hand-authored)
  const problemsDir = join(disciplineDir, "problems");
  if (existsSync(problemsDir)) {
    processDir(problemsDir, topicMeta, "hand-authored", true);
  }

  // Process generated problems
  const generatedDir = join(disciplineDir, "problems-generated");
  if (existsSync(generatedDir)) {
    processDir(generatedDir, topicMeta, "generated", true);
  }

  // Process examples
  const examplesDir = join(disciplineDir, "examples");
  if (existsSync(examplesDir)) {
    processDir(examplesDir, topicMeta, null, false);
  }
}

function processDir(
  dir: string,
  topicMeta: Map<string, { defaultPresentation: string; contentDepth: string }>,
  defaultSource: string | null,
  isProblems: boolean
): void {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let dirFilesUpdated = 0;
  let dirFieldsAdded = 0;
  let dirDemandsRemapped = 0;

  for (const file of files) {
    const filePath = join(dir, file);
    const topicId = file.replace(".json", "");
    const meta = topicMeta.get(topicId);

    if (!meta) {
      console.warn(`  WARN: No topic metadata for ${topicId}, skipping`);
      totalFilesSkipped++;
      continue;
    }

    const items: Record<string, unknown>[] = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileChanged = false;
    let fileFieldsAdded = 0;
    let fileDemandsRemapped = 0;

    for (const item of items) {
      // Add presentation if missing
      if (item.presentation === undefined) {
        item.presentation = meta.defaultPresentation;
        fileFieldsAdded++;
        fileChanged = true;
      }
      // Add contentDepth if missing
      if (item.contentDepth === undefined) {
        item.contentDepth = meta.contentDepth;
        fileFieldsAdded++;
        fileChanged = true;
      }
      // Add locale if missing
      if (item.locale === undefined) {
        item.locale = "en";
        fileFieldsAdded++;
        fileChanged = true;
      }
      // Add flavor if missing
      if (item.flavor === undefined) {
        item.flavor = "classic";
        fileFieldsAdded++;
        fileChanged = true;
      }

      if (isProblems) {
        // Add source if missing
        if (item.source === undefined && defaultSource !== null) {
          item.source = defaultSource;
          fileFieldsAdded++;
          fileChanged = true;
        }
        // Add type if missing
        if (item.type === undefined) {
          item.type = "text-qa";
          fileFieldsAdded++;
          fileChanged = true;
        }
        // Remap non-standard cognitiveDemand
        if (item.cognitiveDemand !== undefined && !VALID_DEMANDS.has(item.cognitiveDemand as string)) {
          const remapped = DEMAND_REMAP[item.cognitiveDemand as string];
          if (remapped) {
            item.cognitiveDemand = remapped;
            fileDemandsRemapped++;
            fileChanged = true;
          } else {
            console.warn(`  WARN: Unknown cognitiveDemand "${item.cognitiveDemand}" in ${file} (${item.id}), no remap`);
          }
        }
      }
    }

    if (fileChanged) {
      dirFilesUpdated++;
      dirFieldsAdded += fileFieldsAdded;
      dirDemandsRemapped += fileDemandsRemapped;
      totalFilesUpdated++;
      totalDimensionFieldsAdded += fileFieldsAdded;
      totalDemandsRemapped += fileDemandsRemapped;
      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(items, null, 2) + "\n", "utf-8");
      }
    } else {
      totalFilesSkipped++;
    }
  }

  const label = dir.split("/").slice(-2).join("/");
  console.log(`  ${label}: ${dirFilesUpdated}/${files.length} files updated, +${dirFieldsAdded} fields, ${dirDemandsRemapped} demands remapped`);
}

console.log(`\n${"=".repeat(50)}`);
if (dryRun) console.log("DRY RUN — no files written");
console.log(`Files updated:          ${totalFilesUpdated}`);
console.log(`Files skipped:          ${totalFilesSkipped}`);
console.log(`Dimension fields added: ${totalDimensionFieldsAdded}`);
console.log(`Demands remapped:       ${totalDemandsRemapped}`);
console.log(dryRun ? "\nRe-run without --dry-run to apply changes." : "\nBackfill complete.");
