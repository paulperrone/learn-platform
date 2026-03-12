/**
 * R2 content fetcher — reads problem/example bundles from Cloudflare R2.
 *
 * Bundle format (per topic):
 *   {discipline}/{topic-id}/problems.json  — BundledProblem[]
 *   {discipline}/{topic-id}/examples.json  — BundledExample[]
 *   {discipline}/{topic-id}/manifest.json  — Manifest
 *
 * Dimension fields (flavor, locale, presentation, contentDepth) are stored
 * directly on each item in the JSON. The content service applies fallback
 * ranking on the parsed array.
 */
import type { Problem, WorkedExample, PresentationLevel, ContentDepthLevel } from "@learn/shared";

// ── R2 bundle types (superset of shared types — includes dimension fields) ──

export type BundledProblem = Problem & {
  flavor: string;
  locale: string;
  presentation: string;
  contentDepth: string;
  source?: string;
};

export type BundledExample = WorkedExample & {
  flavor: string;
  locale: string;
  presentation: string;
  contentDepth: string;
};

export type BundleManifest = {
  version: number;
  contentHash: string;
  topicId: string;
  discipline: string;
  generatedAt: string;
  items: {
    problems: {
      count: number;
      hash: string;
      difficulties: Record<string, number>;
      types: Record<string, number>;
      demands: Record<string, number>;
    };
    examples: {
      count: number;
      hash: string;
    };
    media: unknown[];
  };
  dimensions: {
    presentations: string[];
    depths: string[];
    locales: string[];
    flavors: string[];
  };
};

// ── Fetch functions ──

/**
 * Fetch all problems for a topic from R2.
 * Returns empty array if the bundle doesn't exist (topic has no content yet).
 */
export async function fetchTopicProblems(
  bucket: R2Bucket,
  discipline: string,
  topicId: string,
): Promise<BundledProblem[]> {
  const key = `${discipline}/${topicId}/problems.json`;
  const obj = await bucket.get(key);
  if (!obj) return [];

  const text = await obj.text();
  return JSON.parse(text) as BundledProblem[];
}

/**
 * Fetch all worked examples for a topic from R2.
 * Returns empty array if the bundle doesn't exist.
 */
export async function fetchTopicExamples(
  bucket: R2Bucket,
  discipline: string,
  topicId: string,
): Promise<BundledExample[]> {
  const key = `${discipline}/${topicId}/examples.json`;
  const obj = await bucket.get(key);
  if (!obj) return [];

  const text = await obj.text();
  return JSON.parse(text) as BundledExample[];
}

/**
 * Fetch the manifest for a topic bundle.
 * Returns null if the bundle doesn't exist.
 */
export async function fetchManifest(
  bucket: R2Bucket,
  discipline: string,
  topicId: string,
): Promise<BundleManifest | null> {
  const key = `${discipline}/${topicId}/manifest.json`;
  const obj = await bucket.get(key);
  if (!obj) return null;

  const text = await obj.text();
  return JSON.parse(text) as BundleManifest;
}

// ── Mappers: BundledProblem → Problem, BundledExample → WorkedExample ──

/** Strip dimension fields to produce the shared Problem type. */
export function toBareProblems(bundled: BundledProblem[]): Problem[] {
  return bundled.map(({ flavor, locale, presentation, contentDepth, source, ...problem }) => problem);
}

/** Strip dimension fields to produce the shared WorkedExample type. */
export function toBareExamples(bundled: BundledExample[]): WorkedExample[] {
  return bundled.map(({ flavor, locale, presentation, contentDepth, ...example }) => example);
}
