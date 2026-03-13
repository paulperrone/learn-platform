/**
 * AE effectiveness rollup — aggregates Analytics Engine per-topic data into
 * permanent filesystem storage, solving the 90-day TTL problem.
 *
 * Usage:
 *   npx tsx tools/rollup-effectiveness.ts              # Rollup from deployed API
 *   npx tsx tools/rollup-effectiveness.ts --json       # JSON only to stdout
 *
 * Requires: AUDIT_API_URL and optionally AUDIT_API_TOKEN env vars.
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { EffectivenessRollup } from "./audit-types.js";

async function fetchAPI(baseUrl: string, path: string, token?: string): Promise<any | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Cookie"] = `better-auth.session_token=${token}`;
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function rollupEffectiveness(apiUrl: string, apiToken?: string): Promise<EffectivenessRollup | null> {
  // Query content effectiveness endpoint
  const data = await fetchAPI(apiUrl, "/admin/analytics/content-effectiveness", apiToken);
  if (!data?.topicReviewStats?.length) return null;

  const topicStats = data.topicReviewStats as any[];
  const now = new Date().toISOString();

  const topics = topicStats
    .filter((t: any) => t.totalAttempts >= 5)
    .map((t: any) => ({
      topicId: t.topicId as string,
      accuracy: t.totalAttempts > 0 ? Math.round((t.correctAttempts / t.totalAttempts) * 1000) / 1000 : 0,
      hintRate: t.totalAttempts > 0 ? Math.round((t.hintedAttempts ?? 0) / t.totalAttempts * 1000) / 1000 : 0,
      avgResponseTime: Math.round(t.avgResponseTime ?? 0),
      attempts: t.totalAttempts as number,
      contentVersion: (t.contentVersion as string) ?? null,
    }));

  const totalAttempts = topics.reduce((s, t) => s + t.attempts, 0);
  const weightedAccuracy = totalAttempts > 0
    ? Math.round(topics.reduce((s, t) => s + t.accuracy * t.attempts, 0) / totalAttempts * 1000) / 1000
    : 0;
  const weightedHintRate = totalAttempts > 0
    ? Math.round(topics.reduce((s, t) => s + t.hintRate * t.attempts, 0) / totalAttempts * 1000) / 1000
    : 0;
  const weightedResponseTime = totalAttempts > 0
    ? Math.round(topics.reduce((s, t) => s + t.avgResponseTime * t.attempts, 0) / totalAttempts)
    : 0;

  return {
    timestamp: now,
    period: { from: now, to: now }, // AE doesn't expose exact time range; snapshot time
    topics,
    overall: {
      accuracy: weightedAccuracy,
      hintRate: weightedHintRate,
      avgResponseTime: weightedResponseTime,
      totalAttempts,
    },
  };
}

// ── CLI entry point ──

const isCLI = process.argv[1]?.includes("rollup-effectiveness");
if (isCLI) {
  (async () => {
    const args = process.argv.slice(2);
    const jsonOnly = args.includes("--json");

    const apiUrl = process.env.AUDIT_API_URL;
    const apiToken = process.env.AUDIT_API_TOKEN;

    if (!apiUrl) {
      console.error("Error: AUDIT_API_URL environment variable required");
      process.exit(1);
    }

    console.error("Querying AE effectiveness data...");
    const rollup = await rollupEffectiveness(apiUrl, apiToken);

    if (!rollup) {
      console.error("No effectiveness data available from API");
      process.exit(1);
    }

    // Save to filesystem
    const rollupsDir = join(process.cwd(), "simulations", "reports", "effectiveness-rollups");
    if (!existsSync(rollupsDir)) mkdirSync(rollupsDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const filePath = join(rollupsDir, `${date}.json`);
    writeFileSync(filePath, JSON.stringify(rollup, null, 2));
    console.error(`Saved rollup to ${filePath}`);
    console.error(`  Topics: ${rollup.topics.length}, Overall accuracy: ${(rollup.overall.accuracy * 100).toFixed(1)}%`);

    if (jsonOnly) {
      console.log(JSON.stringify(rollup, null, 2));
    }
  })();
}
