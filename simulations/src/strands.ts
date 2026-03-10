/**
 * Load strand assignments from graph.json files (authoritative source).
 * Replaces hardcoded STRAND_PATTERNS regex arrays.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SUBJECTS = ["math-foundations", "math-middle", "ela-k5", "us-history"];

let strandMap: Map<string, string> | null = null;

/**
 * Build a topicId → strand map from all subject graph.json files.
 * Prefixes strands with subject to avoid cross-subject collisions.
 * Caches the result for subsequent calls.
 */
export function loadStrandMap(): Map<string, string> {
  if (strandMap) return strandMap;

  strandMap = new Map();
  const contentDir = join(process.cwd(), "content");

  for (const subject of SUBJECTS) {
    const graphPath = join(contentDir, subject, "graph.json");
    if (!existsSync(graphPath)) continue;

    const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
    for (const topic of graph.topics) {
      if (topic.strand) {
        strandMap.set(topic.id, `${subject}:${topic.strand}`);
      }
    }
  }

  return strandMap;
}

/**
 * Get the strand for a topic ID from the authoritative graph.json data.
 * Returns "other" if the topic is not found in any graph.
 */
export function getStrand(topicId: string): string {
  const map = loadStrandMap();
  return map.get(topicId) ?? "other";
}

/**
 * Reset the cached strand map (for testing or after content changes).
 */
export function resetStrandMap(): void {
  strandMap = null;
}
