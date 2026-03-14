#!/usr/bin/env npx tsx
/**
 * Tests for the content review tool code (context assembly, cache logic,
 * finding aggregation). This tests the TOOL, not content quality.
 *
 * Usage: npx tsx audit/content/__tests__/review.test.ts
 */
import { assembleTopicContext, assembleReviewBatch, listDisciplines } from "../review-context.js";
import { getCache, appendReview, isFresh, isFull, aggregateFindings } from "../review-cache.js";
import type { TopicReview, TopicReviewCache, ReviewFinding } from "../review-types.js";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

// ── Context Assembler Tests ──

console.log("\n=== Context Assembler ===");

const mathCtx = assembleTopicContext("add-within-20", "math");
assert(mathCtx !== null, "loads math topic add-within-20");
if (mathCtx) {
  assert(mathCtx.topicId === "add-within-20", "topicId correct");
  assert(mathCtx.discipline === "math", "discipline correct");
  assert(mathCtx.name.length > 0, "has name");
  assert(mathCtx.progressionModel === "mastery-gated", "math is mastery-gated");
  assert(Array.isArray(mathCtx.problems), "has problems array");
  assert(Array.isArray(mathCtx.examples), "has examples array");
  assert(mathCtx.contentHash.length > 0, "has content hash");
  assert(typeof mathCtx.gradeLevel === "number", "has gradeLevel");
  assert(typeof mathCtx.strand === "string", "has strand");
}

const nonexistent = assembleTopicContext("does-not-exist", "math");
assert(nonexistent === null, "returns null for nonexistent topic");

const noDisc = assembleTopicContext("anything", "nonexistent-discipline");
assert(noDisc === null, "returns null for nonexistent discipline");

console.log("\n=== Batch Assembly ===");

const batch = assembleReviewBatch("math", { strand: "counting-cardinality" });
assert(batch.length > 0, "batch has topics for counting-cardinality strand");
assert(batch.every(t => t.strand === "counting-cardinality"), "all topics in correct strand");
assert(batch.every(t => t.discipline === "math"), "all topics have discipline=math");

const byIds = assembleReviewBatch("math", { topicIds: ["add-within-20", "count-to-10"] });
assert(byIds.length === 2, "batch by IDs returns exactly 2 topics");

console.log("\n=== List Disciplines ===");

const disciplines = listDisciplines();
assert(disciplines.includes("math"), "lists math discipline");

// ── Content Hash Tests ──

console.log("\n=== Content Hash ===");

const ctx1 = assembleTopicContext("add-within-20", "math");
const ctx2 = assembleTopicContext("add-within-20", "math");
assert(ctx1 !== null && ctx2 !== null && ctx1.contentHash === ctx2.contentHash,
  "same content produces same hash");

const ctxDiff = assembleTopicContext("count-to-10", "math");
assert(ctx1 !== null && ctxDiff !== null && ctx1.contentHash !== ctxDiff.contentHash,
  "different topics produce different hashes");

// ── Cache Tests ──

console.log("\n=== Cache Logic ===");

// Use a temp directory for cache tests
const tmpDir = join(process.cwd(), "audit", "content", "__tests__", "tmp-review-cache");
const origCwd = process.cwd();

// Create a fake cwd structure for cache to write to
const fakeCwd = tmpDir;
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(join(tmpDir, "audit", "reports", "content-reviews", "test-disc"), { recursive: true });

// Monkey-patch process.cwd for cache tests
const realCwd = process.cwd;
process.cwd = () => fakeCwd;

try {
  const testReview: TopicReview = {
    topicId: "test-topic",
    discipline: "test-disc",
    timestamp: new Date().toISOString(),
    findings: [
      { criterion: "answer-correctness", status: "pass", detail: "All correct" },
      { criterion: "difficulty-calibration", status: "warn", detail: "Slight inversion" },
    ],
    overallGrade: "B",
    summary: "Good content with minor calibration issue",
    contentHash: "abc123",
  };

  // Initially empty
  assert(getCache("test-topic", "test-disc") === null, "cache starts empty");
  assert(!isFresh("test-topic", "test-disc", "abc123"), "not fresh when empty");
  assert(!isFull("test-topic", "test-disc", "abc123"), "not full when empty");

  // Append first review
  appendReview("test-topic", "test-disc", testReview);
  assert(isFresh("test-topic", "test-disc", "abc123"), "fresh after first review");
  assert(!isFull("test-topic", "test-disc", "abc123"), "not full after 1 review");

  const cache1 = getCache("test-topic", "test-disc");
  assert(cache1 !== null && cache1.reviews.length === 1, "cache has 1 review");

  // Append second and third
  appendReview("test-topic", "test-disc", { ...testReview, timestamp: "t2" });
  appendReview("test-topic", "test-disc", { ...testReview, timestamp: "t3" });
  assert(isFull("test-topic", "test-disc", "abc123"), "full after 3 reviews");

  const cache3 = getCache("test-topic", "test-disc");
  assert(cache3 !== null && cache3.reviews.length === 3, "cache has 3 reviews");

  // Append 4th — should drop oldest
  appendReview("test-topic", "test-disc", { ...testReview, timestamp: "t4" });
  const cache4 = getCache("test-topic", "test-disc");
  assert(cache4 !== null && cache4.reviews.length === 3, "capped at 3 reviews");
  assert(cache4 !== null && cache4.reviews[0].timestamp === "t2", "oldest dropped");

  // Hash change invalidates
  appendReview("test-topic", "test-disc", { ...testReview, contentHash: "xyz999", timestamp: "t5" });
  const cache5 = getCache("test-topic", "test-disc");
  assert(cache5 !== null && cache5.contentHash === "xyz999", "hash updated on change");
  assert(cache5 !== null && cache5.reviews.length === 1, "old reviews invalidated on hash change");
  assert(!isFresh("test-topic", "test-disc", "abc123"), "not fresh for old hash");
  assert(isFresh("test-topic", "test-disc", "xyz999"), "fresh for new hash");

  // ── Aggregation Tests ──

  console.log("\n=== Finding Aggregation ===");

  const multiCache: TopicReviewCache = {
    contentHash: "hash1",
    reviews: [
      {
        topicId: "t1", discipline: "math", timestamp: "t1",
        findings: [
          { criterion: "answer-correctness", status: "error", detail: "Wrong answer", problemId: "p1" },
          { criterion: "difficulty-calibration", status: "pass", detail: "OK" },
        ],
        overallGrade: "C", summary: "", contentHash: "hash1",
      },
      {
        topicId: "t1", discipline: "math", timestamp: "t2",
        findings: [
          { criterion: "answer-correctness", status: "error", detail: "Wrong answer", problemId: "p1" },
          { criterion: "difficulty-calibration", status: "warn", detail: "Slight issue" },
        ],
        overallGrade: "C", summary: "", contentHash: "hash1",
      },
    ],
  };

  const agg = aggregateFindings(multiCache);
  const highConf = agg.filter(f => f.confidence === "high");
  const lowConf = agg.filter(f => f.confidence === "low");

  assert(highConf.length >= 1, "has high-confidence findings (2+ runs)");
  assert(highConf.some(f => f.criterion === "answer-correctness" && f.status === "error"),
    "answer error is high confidence");
  assert(lowConf.length >= 1, "has low-confidence findings (1 run)");

  // Single review → all low confidence
  const singleCache: TopicReviewCache = {
    contentHash: "hash1",
    reviews: [multiCache.reviews[0]],
  };
  const singleAgg = aggregateFindings(singleCache);
  assert(singleAgg.every(f => f.confidence === "low"), "single review → all low confidence");

  // Empty cache
  const emptyAgg = aggregateFindings({ contentHash: "x", reviews: [] });
  assert(emptyAgg.length === 0, "empty cache → no findings");

} finally {
  process.cwd = realCwd;
  rmSync(tmpDir, { recursive: true, force: true });
}

// ── Results ──

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
