/**
 * Review cache — stores per-topic LLM review results on disk.
 *
 * Cache directory: audit/reports/content-reviews/{discipline}/
 * Per-topic file: {topic-id}.json containing TopicReviewCache
 *
 * Supports up to 3 reviews per content hash. When content changes
 * (hash mismatch), all cached reviews are invalidated.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import type {
  TopicReview, TopicReviewCache, ReviewFinding, ReviewConfidence,
} from "./review-types.js";

const MAX_REVIEWS_PER_HASH = 3;

function cacheDir(discipline: string): string {
  return join(process.cwd(), "audit", "reports", "content-reviews", discipline);
}

function cachePath(topicId: string, discipline: string): string {
  return join(cacheDir(discipline), `${topicId}.json`);
}

export function getCache(topicId: string, discipline: string): TopicReviewCache | null {
  const path = cachePath(topicId, discipline);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function isFresh(topicId: string, discipline: string, contentHash: string): boolean {
  const cache = getCache(topicId, discipline);
  return cache !== null && cache.contentHash === contentHash && cache.reviews.length > 0;
}

export function isFull(topicId: string, discipline: string, contentHash: string): boolean {
  const cache = getCache(topicId, discipline);
  return cache !== null
    && cache.contentHash === contentHash
    && cache.reviews.length >= MAX_REVIEWS_PER_HASH;
}

export function appendReview(topicId: string, discipline: string, review: TopicReview): void {
  const dir = cacheDir(discipline);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let cache = getCache(topicId, discipline);

  // Hash changed — invalidate all
  if (cache && cache.contentHash !== review.contentHash) {
    cache = null;
  }

  if (!cache) {
    cache = { contentHash: review.contentHash, reviews: [] };
  }

  cache.reviews.push(review);

  // Cap at MAX_REVIEWS_PER_HASH, drop oldest
  if (cache.reviews.length > MAX_REVIEWS_PER_HASH) {
    cache.reviews = cache.reviews.slice(-MAX_REVIEWS_PER_HASH);
  }

  writeFileSync(cachePath(topicId, discipline), JSON.stringify(cache, null, 2));
}

export function loadAllCached(discipline: string): TopicReviewCache[] {
  const dir = cacheDir(discipline);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(dir, f), "utf-8")) as TopicReviewCache);
}

/**
 * Aggregate findings across multiple reviews of the same topic.
 * Findings appearing in 2+ reviews = "high" confidence, 1 = "low".
 */
export function aggregateFindings(cache: TopicReviewCache): ReviewFinding[] {
  if (cache.reviews.length === 0) return [];
  if (cache.reviews.length === 1) {
    return cache.reviews[0].findings.map(f => ({ ...f, confidence: "low" as ReviewConfidence }));
  }

  // Group findings by criterion + status + detail key
  const findingKey = (f: ReviewFinding) =>
    `${f.criterion}|${f.status}|${f.problemId ?? ""}`;

  const counts = new Map<string, { finding: ReviewFinding; count: number }>();
  for (const review of cache.reviews) {
    for (const f of review.findings) {
      const key = findingKey(f);
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { finding: f, count: 1 });
      }
    }
  }

  return [...counts.values()].map(({ finding, count }) => ({
    ...finding,
    confidence: (count >= 2 ? "high" : "low") as ReviewConfidence,
  }));
}
