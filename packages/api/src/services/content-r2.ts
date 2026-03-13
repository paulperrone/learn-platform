/**
 * Content fetcher — reads problem/example bundles from R2 or filesystem.
 *
 * Bundle format (per topic):
 *   {discipline}/{topic-id}/problems.json  — BundledProblem[]
 *   {discipline}/{topic-id}/examples.json  — BundledExample[]
 *   {discipline}/{topic-id}/manifest.json  — Manifest
 *
 * Dimension fields (flavor, locale, presentation, contentDepth) are stored
 * directly on each item in the JSON. The content service applies fallback
 * ranking on the parsed array.
 *
 * ContentBucket is the minimal interface used for fetching — satisfied by
 * both Cloudflare R2Bucket and the file-based implementation below.
 */
import type { Problem, WorkedExample, PresentationLevel, ContentDepthLevel } from "@learn/shared";

// ── Content bucket abstraction ──

/** Minimal interface for fetching content — R2Bucket satisfies this. */
export type ContentBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

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
  bucket: ContentBucket,
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
  bucket: ContentBucket,
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
  bucket: ContentBucket,
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

// ── File-based content bucket (for simulations and local dev without R2) ──

/**
 * Create a ContentBucket that reads from the learn-content directory.
 *
 * Maps R2 keys like "math/add-within-20/problems.json" to filesystem paths:
 *   {contentDir}/math/problems/add-within-20.json
 *
 * Applies the same dimension defaults as generate-bundles.ts.
 */
export function createFileContentBucket(contentDir: string): ContentBucket {
  // Lazy import to avoid pulling Node fs into Workers runtime
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  return {
    async get(key: string): Promise<{ text(): Promise<string> } | null> {
      // Key format: "{discipline}/{topic-id}/{file}.json"
      const parts = key.split("/");
      if (parts.length !== 3) return null;

      const [discipline, topicId, file] = parts;

      if (file === "manifest.json") return null;
      if (file !== "problems.json" && file !== "examples.json") return null;

      // Determine which subdirectories to check
      const subdir = file === "problems.json" ? "problems" : "examples";
      const filePath = path.join(contentDir, discipline, subdir, `${topicId}.json`);

      // For problems, also check problems-generated (supplementary content)
      const generatedPath = file === "problems.json"
        ? path.join(contentDir, discipline, "problems-generated", `${topicId}.json`)
        : null;

      const hasMain = fs.existsSync(filePath);
      const hasGenerated = generatedPath && fs.existsSync(generatedPath);
      if (!hasMain && !hasGenerated) return null;

      let items: Record<string, unknown>[] = [];
      if (hasMain) {
        items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
      if (hasGenerated) {
        const generated = JSON.parse(fs.readFileSync(generatedPath, "utf-8")) as Record<string, unknown>[];
        items = items.concat(generated);
      }

      // Apply dimension defaults (same as generate-bundles.ts).
      // Warn in dev mode when defaults are needed — indicates content is missing fields.
      const isDev = process.env.NODE_ENV !== "production";
      const withDefaults = items.map((item) => {
        const result: Record<string, unknown> = { ...item };
        const missing: string[] = [];
        if (!result.flavor) { result.flavor = "classic"; missing.push("flavor"); }
        if (!result.locale) { result.locale = "en"; missing.push("locale"); }
        if (!result.presentation) { result.presentation = "standard"; missing.push("presentation"); }
        if (!result.contentDepth) { result.contentDepth = "survey"; missing.push("contentDepth"); }
        if (file === "problems.json" && !result.source) { result.source = "hand-authored"; missing.push("source"); }
        if (missing.length > 0 && isDev) {
          console.warn(`[content-r2] WARN: ${item.id} missing ${missing.join(", ")}, defaulting`);
        }
        return result;
      });

      const text = JSON.stringify(withDefaults);
      return { text: async () => text };
    },
  };
}
