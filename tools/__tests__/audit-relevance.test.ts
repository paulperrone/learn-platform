#!/usr/bin/env npx tsx
/**
 * Tests for the audit relevance guard (file-to-section mapping).
 * This is a CODE TEST — it validates that the relevance mapping works
 * correctly, not whether audit sections are stale.
 *
 * Usage: npx tsx tools/__tests__/audit-relevance.test.ts
 */
import { checkRelevance, AUDIT_SECTIONS } from "../audit-relevance.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    console.error(`  \u2717 ${message}`);
  }
}

function sectionIds(result: ReturnType<typeof checkRelevance>): number[] {
  return result.affectedSections.map((s) => s.section.id).sort();
}

console.log("\n=== SRS file change ===");

const srsResult = checkRelevance(["packages/api/src/services/srs.ts"]);
assert(sectionIds(srsResult).includes(3), "SRS maps to section 3 (Simulation)");
assert(sectionIds(srsResult).includes(4), "SRS maps to section 4 (Effectiveness)");
assert(srsResult.recommendations.length > 0, "has recommendations");

console.log("\n=== Problem file change ===");

const problemResult = checkRelevance(["../learn-content/math/problems/add-within-20.json"]);
assert(sectionIds(problemResult).includes(2), "problem maps to section 2 (Content Quality)");
assert(sectionIds(problemResult).includes(8), "problem maps to section 8 (Content Review)");

console.log("\n=== Schema change ===");

const schemaResult = checkRelevance(["packages/api/src/db/schema.ts"]);
assert(sectionIds(schemaResult).length === 8, "schema change maps to all 8 sections");

console.log("\n=== Unrelated file ===");

const readmeResult = checkRelevance(["README.md"]);
assert(readmeResult.affectedSections.length === 0, "README maps to no sections");
assert(readmeResult.unaffectedSections.length === 8, "all sections unaffected");
assert(readmeResult.recommendations.length === 0, "no recommendations");

console.log("\n=== Content dir changes ===");

const graphResult = checkRelevance(["../learn-content/math/graph.json"]);
assert(sectionIds(graphResult).includes(1), "graph.json maps to section 1 (Graph)");
assert(sectionIds(graphResult).includes(2), "graph.json maps to section 2 (Content)");
assert(sectionIds(graphResult).includes(8), "graph.json maps to section 8 (Review)");

console.log("\n=== Example file change ===");

const exampleResult = checkRelevance(["../learn-content/math/examples/add-within-20.json"]);
assert(sectionIds(exampleResult).includes(2), "example maps to section 2 (Content Quality)");
assert(sectionIds(exampleResult).includes(8), "example maps to section 8 (Content Review)");

console.log("\n=== Multiple files ===");

const multiResult = checkRelevance([
  "packages/api/src/services/srs.ts",
  "packages/api/src/services/llm.ts",
  "../learn-content/math/problems/fractions.json",
]);
assert(sectionIds(multiResult).includes(2), "multi: content quality");
assert(sectionIds(multiResult).includes(3), "multi: simulation");
assert(sectionIds(multiResult).includes(4), "multi: effectiveness");
assert(sectionIds(multiResult).includes(5), "multi: LLM tracking");
assert(sectionIds(multiResult).includes(8), "multi: content review");
assert(multiResult.recommendations.length > 0, "multi: has recommendations");

console.log("\n=== Audit tool code change ===");

const auditToolResult = checkRelevance(["tools/audit.ts"]);
assert(sectionIds(auditToolResult).length === 8, "audit tool change maps to all sections");

console.log("\n=== Graph service change ===");

const graphServiceResult = checkRelevance(["packages/api/src/services/graph.ts"]);
assert(sectionIds(graphServiceResult).includes(1), "graph service maps to section 1");
assert(sectionIds(graphServiceResult).includes(3), "graph service maps to section 3");

console.log("\n=== Empty file list ===");

const emptyResult = checkRelevance([]);
assert(emptyResult.affectedSections.length === 0, "empty list: no affected sections");
assert(emptyResult.changedFiles.length === 0, "empty list: no changed files");

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
