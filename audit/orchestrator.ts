/**
 * Unified system audit — orchestrates all validation, content health, simulation
 * evaluation, LLM tracking, and media readiness checks into a single report.
 *
 * Usage:
 *   npx tsx audit/orchestrator.ts              # Markdown to stdout + JSON to audit/reports/latest.json
 *   npx tsx audit/orchestrator.ts --json       # JSON only
 *   npx tsx audit/orchestrator.ts --save       # Also saves timestamped snapshot
 *   npx tsx audit/orchestrator.ts --live       # Query deployed API for live analytics (requires AUDIT_API_URL)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { getContentDir } from "../tools/content-dir.js";
import { generateContentStatus } from "./content/status.js";
import { detectContentGaps } from "./content/gaps.js";
import { generateDisciplineReport, listDisciplines } from "./content/report.js";
import { renderAuditMarkdown } from "./render.js";
import type {
  AuditReport, ItemStatus, StatusItem,
  GraphIntegritySection, ContentQualitySection, SimulationResultsSection,
  ContentEffectivenessSection, LLMTrackingSection, MediaReadinessSection,
  MultiDisciplineSection, ContentReviewSection, AssessmentHealthSection, SimulationSystem,
  ManifestSummary, DimensionCoverage, ContentVersionStatus,
  AuditThresholds, ThresholdLevel, AuditDelta,
} from "./types.js";

// ── Thresholds ──

const DEFAULT_THRESHOLDS_PATH = join(process.cwd(), "audit", "thresholds.json");

function loadThresholds(customPath?: string): AuditThresholds {
  const path = customPath ?? DEFAULT_THRESHOLDS_PATH;
  if (!existsSync(path)) {
    throw new Error(`Thresholds file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** For "min" thresholds: value >= warn → pass, value >= fail → warn, else fail */
function applyMinThreshold(value: number, t: ThresholdLevel): ItemStatus {
  if (value >= t.warn) return "pass";
  if (value >= t.fail) return "warn";
  return "fail";
}

/** For "max" thresholds: value <= warn → pass, value <= fail → warn, else fail */
function applyMaxThreshold(value: number, t: ThresholdLevel): ItemStatus {
  if (value <= t.warn) return "pass";
  if (value <= t.fail) return "warn";
  return "fail";
}

// ── Historical comparison ──

function compareAudits(current: AuditReport, previous: AuditReport): AuditDelta {
  const sectionDeltas: AuditDelta["sectionDeltas"] = [];

  const comparisons: { section: string; prev: ItemStatus; curr: ItemStatus; details: () => string[] }[] = [
    {
      section: "Graph Integrity",
      prev: previous.sections.graphIntegrity.status,
      curr: current.sections.graphIntegrity.status,
      details: () => {
        const d: string[] = [];
        const pg = previous.sections.graphIntegrity;
        const cg = current.sections.graphIntegrity;
        if (cg.topicCount !== pg.topicCount) d.push(`Topics: ${pg.topicCount} → ${cg.topicCount}`);
        if (cg.prereqDensity !== pg.prereqDensity) d.push(`Prereq density: ${pg.prereqDensity} → ${cg.prereqDensity}`);
        if (cg.encompassingDensity !== pg.encompassingDensity) d.push(`Encompassing density: ${pg.encompassingDensity} → ${cg.encompassingDensity}`);
        return d;
      },
    },
    {
      section: "Content Quality",
      prev: previous.sections.contentQuality.status,
      curr: current.sections.contentQuality.status,
      details: () => {
        const d: string[] = [];
        const pc = previous.sections.contentQuality;
        const cc = current.sections.contentQuality;
        if (cc.totalProblems !== pc.totalProblems) d.push(`Problems: ${pc.totalProblems} → ${cc.totalProblems}`);
        if (cc.healthDistribution.average !== pc.healthDistribution.average) d.push(`Avg health: ${pc.healthDistribution.average} → ${cc.healthDistribution.average}`);
        if (cc.gapSummary.total !== pc.gapSummary.total) d.push(`Gaps: ${pc.gapSummary.total} → ${cc.gapSummary.total}`);
        return d;
      },
    },
    {
      section: "Simulation Results",
      prev: previous.sections.simulationResults.status,
      curr: current.sections.simulationResults.status,
      details: () => {
        const d: string[] = [];
        const ps = previous.sections.simulationResults;
        const cs = current.sections.simulationResults;
        if (cs.passCount !== ps.passCount) d.push(`Pass: ${ps.passCount} → ${cs.passCount}`);
        if (cs.failCount !== ps.failCount) d.push(`Fail: ${ps.failCount} → ${cs.failCount}`);
        return d;
      },
    },
    {
      section: "Content Effectiveness",
      prev: previous.sections.contentEffectiveness.status,
      curr: current.sections.contentEffectiveness.status,
      details: () => {
        const d: string[] = [];
        const pe = previous.sections.contentEffectiveness;
        const ce = current.sections.contentEffectiveness;
        if (pe.overallAccuracy != null && ce.overallAccuracy != null && ce.overallAccuracy !== pe.overallAccuracy) {
          d.push(`Accuracy: ${(pe.overallAccuracy * 100).toFixed(0)}% → ${(ce.overallAccuracy * 100).toFixed(0)}%`);
        }
        return d;
      },
    },
    {
      section: "LLM Tracking",
      prev: previous.sections.llmTracking.status,
      curr: current.sections.llmTracking.status,
      details: () => {
        const d: string[] = [];
        const pl = previous.sections.llmTracking;
        const cl = current.sections.llmTracking;
        if (pl.totalCost != null && cl.totalCost != null && cl.totalCost !== pl.totalCost) {
          d.push(`Cost: $${pl.totalCost.toFixed(2)} → $${cl.totalCost.toFixed(2)}`);
        }
        return d;
      },
    },
    {
      section: "Media Readiness",
      prev: previous.sections.mediaReadiness.status,
      curr: current.sections.mediaReadiness.status,
      details: () => [],
    },
    {
      section: "Multi-Discipline",
      prev: previous.sections.multiDiscipline.status,
      curr: current.sections.multiDiscipline.status,
      details: () => {
        const d: string[] = [];
        const pm = previous.sections.multiDiscipline;
        const cm = current.sections.multiDiscipline;
        if (cm.totalTopics !== pm.totalTopics) d.push(`Topics: ${pm.totalTopics} → ${cm.totalTopics}`);
        return d;
      },
    },
    {
      section: "Content Review",
      prev: previous.sections.contentReview?.status ?? "pending",
      curr: current.sections.contentReview?.status ?? "pending",
      details: () => {
        const d: string[] = [];
        const pr = previous.sections.contentReview;
        const cr = current.sections.contentReview;
        if (pr && cr && cr.topicsReviewed !== pr.topicsReviewed) {
          d.push(`Topics reviewed: ${pr.topicsReviewed} → ${cr.topicsReviewed}`);
        }
        return d;
      },
    },
  ];

  let improved = 0, regressed = 0, unchanged = 0;
  const statusRank: Record<ItemStatus, number> = { fail: 0, warn: 1, pending: 2, info: 3, pass: 4 };

  for (const c of comparisons) {
    const prevRank = statusRank[c.prev] ?? 2;
    const currRank = statusRank[c.curr] ?? 2;
    const trend = currRank > prevRank ? "improved" : currRank < prevRank ? "regressed" : "unchanged";
    if (trend === "improved") improved++;
    else if (trend === "regressed") regressed++;
    else unchanged++;
    sectionDeltas.push({
      section: c.section,
      previousStatus: c.prev,
      currentStatus: c.curr,
      trend,
      details: c.details(),
    });
  }

  return {
    previousTimestamp: previous.metadata.timestamp,
    sectionDeltas,
    summary: { improved, regressed, unchanged },
  };
}

// ── Graph integrity (computed directly — avoids refactoring 577-line validate-graph.ts) ──

function auditGraphIntegrity(subject: string, thresholds: AuditThresholds): GraphIntegritySection {
  const contentDir = getContentDir();
  const graphPath = join(contentDir, subject, "graph.json");

  if (!existsSync(graphPath)) {
    return {
      status: "fail", items: [{ label: "Graph file", status: "fail", detail: `${graphPath} not found` }],
      topicCount: 0, prerequisiteCount: 0, encompassingCount: 0,
      prereqDensity: 0, encompassingDensity: 0, dagValid: false, cycleCount: 0,
      orphanCount: 0, bottlenecks: [], maxDepth: 0, fireReadiness: "LOW",
      edgeTypes: { required: 0, recommended: 0, enriching: 0 }, progressionModel: "unknown",
    };
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topics: any[] = graph.topics ?? [];
  const topicIds = new Set<string>(topics.map((t: any) => t.id));
  const localPrereqs = (graph.prerequisites ?? []).filter((p: any) => !p.from.includes(":"));
  const encompassings: any[] = graph.encompassings ?? [];

  const progressionModel = graph.progressionModel ?? (subject === "math" || subject === "ela" ? "mastery-gated" : "context-layered");

  // DAG check (Kahn's algorithm)
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of topicIds) { adjacency.set(id, []); inDegree.set(id, 0); }
  for (const p of localPrereqs) {
    if (topicIds.has(p.from) && topicIds.has(p.to)) {
      adjacency.get(p.from)!.push(p.to);
      inDegree.set(p.to, (inDegree.get(p.to) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }
  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const nd = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, nd);
      if (nd === 0) queue.push(neighbor);
    }
  }
  const dagValid = processed === topicIds.size;
  const cycleCount = dagValid ? 0 : topicIds.size - processed;

  // Orphans
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const p of localPrereqs) {
    if (!p.from.includes(":")) hasOutgoing.add(p.from);
    hasIncoming.add(p.to);
  }
  const orphanCount = topics.filter((t: any) => !hasIncoming.has(t.id) && !hasOutgoing.has(t.id)).length;

  // Densities
  const prereqDensity = topics.length > 0 ? Math.round((localPrereqs.length / topics.length) * 100) / 100 : 0;
  const encompassingDensity = topics.length > 0 ? Math.round((encompassings.length / topics.length) * 100) / 100 : 0;

  // Bottlenecks (sole prereq for >8 downstream)
  const childCount = new Map<string, number>();
  for (const p of localPrereqs) childCount.set(p.from, (childCount.get(p.from) ?? 0) + 1);
  const bottlenecks = [...childCount.entries()]
    .filter(([, count]) => count > 8)
    .map(([topicId, downstreamCount]) => ({ topicId, downstreamCount }));

  // Max depth via BFS
  const depthMap = new Map<string, number>();
  const bfsQueue: string[] = [];
  for (const t of topics) {
    if (!hasIncoming.has(t.id)) { depthMap.set(t.id, 0); bfsQueue.push(t.id); }
  }
  while (bfsQueue.length > 0) {
    const node = bfsQueue.shift()!;
    const d = depthMap.get(node) ?? 0;
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!depthMap.has(neighbor) || depthMap.get(neighbor)! < d + 1) depthMap.set(neighbor, d + 1);
      bfsQueue.push(neighbor);
    }
  }
  const maxDepth = depthMap.size > 0 ? Math.max(...depthMap.values()) : 0;

  // Edge types
  const required = localPrereqs.filter((p: any) => p.type === "required").length;
  const recommended = localPrereqs.filter((p: any) => p.type === "recommended").length;
  const enriching = localPrereqs.filter((p: any) => p.type === "enriching").length;

  // FIRe readiness
  const issues: string[] = [];
  if (encompassingDensity < 1.5) issues.push(`density ${encompassingDensity} < 1.5`);
  if (encompassings.length > 0) {
    const encParentToChildren = new Map<string, number>();
    for (const e of encompassings) encParentToChildren.set(e.parent, (encParentToChildren.get(e.parent) ?? 0) + 1);
    const parentCounts = [...encParentToChildren.values()].sort((a, b) => b - a);
    const top10Pct = Math.max(1, Math.ceil(encParentToChildren.size * 0.1));
    const top10PctEdges = parentCounts.slice(0, top10Pct).reduce((s, c) => s + c, 0);
    if (encompassings.length > 0 && top10PctEdges / encompassings.length > 0.5) issues.push("concentrated parents");
  }
  const fireReadiness = issues.length === 0 ? "GOOD" : issues.length <= 2 ? "PARTIAL" : "LOW";

  // Build status items
  const items: StatusItem[] = [
    { label: "DAG integrity", status: dagValid ? "pass" : "fail", detail: dagValid ? "No cycles" : `${cycleCount} topics in cycles` },
    { label: "Topic count", status: "info", value: topics.length },
    { label: "Prereq density", status: applyMinThreshold(prereqDensity, thresholds.graph.prereqDensityMin), value: prereqDensity, target: "1.5-3.0" },
    { label: "Encompassing density", status: applyMinThreshold(encompassingDensity, thresholds.graph.encompassingDensityMin), value: encompassingDensity, target: "1.0-2.0" },
    { label: "Orphan topics", status: orphanCount === 0 ? "pass" : "warn", value: orphanCount },
    { label: "Bottlenecks (>8 downstream)", status: applyMaxThreshold(bottlenecks.length, thresholds.graph.bottleneckMax), value: bottlenecks.length },
    { label: "Max depth", status: "info", value: maxDepth },
    { label: "FIRe readiness", status: fireReadiness === "GOOD" ? "pass" : fireReadiness === "PARTIAL" ? "warn" : "info", detail: fireReadiness },
  ];

  const failItems = items.filter(i => i.status === "fail");
  const warnItems = items.filter(i => i.status === "warn");
  const status: ItemStatus = failItems.length > 0 ? "fail" : warnItems.length > 0 ? "warn" : "pass";

  return {
    status, items, topicCount: topics.length,
    prerequisiteCount: localPrereqs.length, encompassingCount: encompassings.length,
    prereqDensity, encompassingDensity, dagValid, cycleCount, orphanCount,
    bottlenecks, maxDepth, fireReadiness,
    edgeTypes: { required, recommended, enriching }, progressionModel,
  };
}

// ── R2 manifest scanner ──

function scanManifests(): { manifests: ManifestSummary[]; dimensionCoverage: DimensionCoverage; versions: ContentVersionStatus[] } {
  const contentDir = getContentDir();
  const disciplines = listDisciplines();
  const manifests: ManifestSummary[] = [];
  const versions: ContentVersionStatus[] = [];
  const dimCov: DimensionCoverage = { presentation: {}, depth: {}, locale: {}, flavor: {} };

  // Check for generated bundles
  const bundleDir = "/tmp/learn-content-bundles";
  const hasBundles = existsSync(bundleDir);

  for (const disc of disciplines) {
    const graphPath = join(contentDir, disc, "graph.json");
    if (!existsSync(graphPath)) continue;
    const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
    const topics: any[] = graph.topics ?? [];

    for (const topic of topics) {
      // Check bundle manifest
      const manifestPath = hasBundles ? join(bundleDir, disc, topic.id, "manifest.json") : null;
      let bundleGenerated: string | null = null;

      if (manifestPath && existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        bundleGenerated = manifest.generatedAt ?? null;

        manifests.push({
          topicId: topic.id,
          discipline: disc,
          problemCount: manifest.items?.problems?.count ?? 0,
          exampleCount: manifest.items?.examples?.count ?? 0,
          contentHash: manifest.contentHash ?? "",
          generatedAt: manifest.generatedAt ?? "",
          dimensions: manifest.dimensions ?? { presentations: [], depths: [], locales: [], flavors: [] },
          difficulties: manifest.items?.problems?.difficulties ?? {},
          demands: manifest.items?.problems?.demands ?? {},
          types: manifest.items?.problems?.types ?? {},
        });

        // Aggregate dimension coverage
        for (const p of manifest.dimensions?.presentations ?? []) dimCov.presentation[p] = (dimCov.presentation[p] ?? 0) + 1;
        for (const d of manifest.dimensions?.depths ?? []) dimCov.depth[d] = (dimCov.depth[d] ?? 0) + 1;
        for (const l of manifest.dimensions?.locales ?? []) dimCov.locale[l] = (dimCov.locale[l] ?? 0) + 1;
        for (const f of manifest.dimensions?.flavors ?? []) dimCov.flavor[f] = (dimCov.flavor[f] ?? 0) + 1;
      }

      // Content version tracking — compare source file mtime vs bundle generatedAt
      const sourcePaths = [
        join(contentDir, disc, "problems", `${topic.id}.json`),
        join(contentDir, disc, "problems-generated", `${topic.id}.json`),
      ];
      let sourceModified: string | null = null;
      for (const sp of sourcePaths) {
        if (existsSync(sp)) {
          const mtime = statSync(sp).mtime.toISOString();
          if (!sourceModified || mtime > sourceModified) sourceModified = mtime;
        }
      }

      const stale = !!(sourceModified && bundleGenerated && sourceModified > bundleGenerated);

      versions.push({
        topicId: topic.id,
        discipline: disc,
        bundleExists: !!bundleGenerated,
        sourceModified,
        bundleGenerated,
        stale,
      });
    }
  }

  return { manifests, dimensionCoverage: dimCov, versions };
}

// ── Live API query helper ──

async function fetchLiveAPI(baseUrl: string, path: string, token?: string): Promise<any | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Cookie"] = `better-auth.session_token=${token}`;
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Content quality ──

function auditContentQuality(subject: string, thresholds: AuditThresholds): ContentQualitySection {
  const statusResult = generateContentStatus(subject);
  const gapResult = detectContentGaps(subject);

  if (!statusResult) {
    return {
      status: "fail", items: [{ label: "Content", status: "fail", detail: "No content found" }],
      totalProblems: 0, totalExamples: 0, topicsWithProblems: 0, topicsWithExamples: 0, totalTopics: 0,
      healthDistribution: { below50: 0, below70: 0, above70: 0, average: 0 },
      gapSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      topGaps: [], demandDiversity: 0,
      lessonCoverage: { topicsWithLessons: 0, totalTopics: 0, pct: 0 },
      dimensionCoverage: null, manifestCount: 0, staleDeployCount: 0, contentVersions: [],
    };
  }

  // Scan manifests for dimension coverage and version tracking
  const { manifests, dimensionCoverage, versions } = scanManifests();
  const staleCount = versions.filter(v => v.stale).length;

  const topicsWithProblems = statusResult.topics.filter(t => t.problemCount > 0).length;
  const topicsWithExamples = statusResult.topics.filter(t => t.exampleCount > 0).length;
  const below50 = statusResult.topicsBelow50;
  const below70 = statusResult.topics.filter(t => t.healthScore < 70).length;
  const above70 = statusResult.topicCount - below70;

  const avgDemandDiversity = statusResult.topics.length > 0
    ? Math.round((statusResult.topics.reduce((s, t) => s + t.demandDiversity, 0) / statusResult.topics.length) * 100) / 100
    : 0;

  const gapSummary = gapResult
    ? { total: gapResult.totalGaps, ...gapResult.byPriority }
    : { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

  const topGaps = (gapResult?.gaps ?? []).slice(0, 10).map(g => ({
    topicId: g.topicId, gapType: g.gapType, impact: g.impact, priority: g.priority,
  }));

  const items: StatusItem[] = [
    { label: "Average health", status: applyMinThreshold(statusResult.averageHealth, thresholds.content.healthScoreMin), value: statusResult.averageHealth, target: "70+" },
    { label: "Topics with problems", status: topicsWithProblems === statusResult.topicCount ? "pass" : topicsWithProblems >= statusResult.topicCount * 0.9 ? "warn" : "fail", value: `${topicsWithProblems}/${statusResult.topicCount}` },
    { label: "Topics with examples", status: topicsWithExamples === statusResult.topicCount ? "pass" : topicsWithExamples >= statusResult.topicCount * 0.9 ? "warn" : "fail", value: `${topicsWithExamples}/${statusResult.topicCount}` },
    { label: "Critical gaps", status: gapSummary.critical === 0 ? "pass" : "fail", value: gapSummary.critical },
    { label: "Topics below 50 health", status: applyMinThreshold(below50 === 0 ? 100 : 100 - below50, { warn: 100, fail: 90 }), value: below50 },
    { label: "Demand diversity", status: applyMinThreshold(avgDemandDiversity, thresholds.content.demandDiversityMin), value: avgDemandDiversity },
    { label: "Bundle manifests", status: manifests.length > 0 ? "info" : "pending", value: manifests.length, detail: manifests.length > 0 ? undefined : "Run `just generate-bundles` to create" },
    ...(staleCount > 0 ? [{ label: "Stale deploys", status: "warn" as ItemStatus, value: staleCount, detail: "Source changed since last bundle generation" }] : []),
  ];

  const failItems = items.filter(i => i.status === "fail");
  const warnItems = items.filter(i => i.status === "warn");
  const status: ItemStatus = failItems.length > 0 ? "fail" : warnItems.length > 0 ? "warn" : "pass";

  return {
    status, items,
    totalProblems: statusResult.totalProblems,
    totalExamples: statusResult.totalExamples,
    topicsWithProblems, topicsWithExamples,
    totalTopics: statusResult.topicCount,
    healthDistribution: { below50, below70, above70, average: statusResult.averageHealth },
    gapSummary, topGaps, demandDiversity: avgDemandDiversity,
    lessonCoverage: {
      topicsWithLessons: topicsWithExamples,
      totalTopics: statusResult.topicCount,
      pct: statusResult.topicCount > 0 ? Math.round(topicsWithExamples / statusResult.topicCount * 100) : 0,
    },
    dimensionCoverage: manifests.length > 0 ? dimensionCoverage : null,
    manifestCount: manifests.length,
    staleDeployCount: staleCount,
    contentVersions: versions.filter(v => v.stale), // only include stale ones to keep report compact
  };
}

// ── Simulation results ──

function auditSimulationResults(): SimulationResultsSection {
  const evalPath = join(process.cwd(), "audit", "reports", "evaluation.json");

  if (!existsSync(evalPath)) {
    return {
      status: "pending", items: [{ label: "Evaluation", status: "pending", detail: "No evaluation.json found — run simulations first" }],
      evaluationTimestamp: null, targetVersion: null, maturityLevel: null,
      systems: [], passCount: 0, failCount: 0,
    };
  }

  const evalData = JSON.parse(readFileSync(evalPath, "utf-8"));
  const systems: SimulationSystem[] = (evalData.systems ?? []).map((s: any) => ({
    systemId: s.systemId,
    name: s.name,
    status: s.status,
    actual: s.actual,
    target: s.target,
    tolerance: s.tolerance,
    priority: s.priority,
    unit: s.unit,
  }));

  const passCount = systems.filter(s => s.status === "PASS").length;
  const failCount = systems.filter(s => s.status === "FAIL").length;

  const items: StatusItem[] = systems.map(s => ({
    label: s.name,
    status: s.status === "PASS" ? "pass" as ItemStatus : "fail" as ItemStatus,
    value: s.actual,
    target: s.target,
    detail: `${s.priority} (${s.unit})`,
  }));

  const status: ItemStatus = failCount > 0 ? "fail" : "pass";

  return {
    status, items,
    evaluationTimestamp: evalData.timestamp ?? null,
    targetVersion: evalData.targetVersion ?? null,
    maturityLevel: evalData.maturityLevel ?? null,
    systems, passCount, failCount,
  };
}

// ── Content effectiveness ──

async function auditContentEffectiveness(thresholds: AuditThresholds, apiUrl?: string, apiToken?: string): Promise<ContentEffectivenessSection> {
  if (!apiUrl) {
    return {
      status: "pending",
      items: [{ label: "Content effectiveness", status: "pending", detail: "Awaiting user data — use --live for live analytics" }],
      mode: "offline",
      overallAccuracy: null, topicAccuracyRange: null,
      difficultySpikeCount: null, hintEscalationRate: null,
      totalUsers: null, totalReviews: null, strugglingTopics: [],
    };
  }

  // Live mode — query admin API
  const items: StatusItem[] = [];
  let overallAccuracy: number | null = null;
  let topicAccuracyRange: { min: number; max: number } | null = null;
  let difficultySpikeCount: number | null = null;
  let hintEscalationRate: number | null = null;
  let totalUsers: number | null = null;
  let totalReviews: number | null = null;
  const strugglingTopics: { topicId: string; accuracy: number; attempts: number }[] = [];

  // Stats
  const stats = await fetchLiveAPI(apiUrl, "/admin/stats", apiToken);
  if (stats) {
    totalUsers = stats.totalUsers ?? null;
    totalReviews = stats.totalReviews ?? null;
    items.push({ label: "Total users", status: "info", value: totalUsers ?? 0 });
    items.push({ label: "Total reviews", status: "info", value: totalReviews ?? 0 });
  } else {
    items.push({ label: "Stats endpoint", status: "fail", detail: "Could not reach API" });
  }

  // Content effectiveness
  const effectiveness = await fetchLiveAPI(apiUrl, "/admin/analytics/content-effectiveness", apiToken);
  if (effectiveness?.topicReviewStats?.length > 0) {
    const topicStats = effectiveness.topicReviewStats as any[];
    const accuracies = topicStats
      .filter((t: any) => t.totalAttempts >= 10)
      .map((t: any) => t.correctAttempts / t.totalAttempts);

    if (accuracies.length > 0) {
      overallAccuracy = Math.round((accuracies.reduce((a: number, b: number) => a + b, 0) / accuracies.length) * 100) / 100;
      topicAccuracyRange = { min: Math.round(Math.min(...accuracies) * 100) / 100, max: Math.round(Math.max(...accuracies) * 100) / 100 };
      items.push({ label: "Overall accuracy", status: applyMinThreshold(overallAccuracy, thresholds.live.topicAccuracyMin), value: `${(overallAccuracy * 100).toFixed(0)}%` });
    }

    // Struggling topics
    if (effectiveness.strugglingTopics?.length > 0) {
      for (const t of effectiveness.strugglingTopics.slice(0, 10)) {
        strugglingTopics.push({ topicId: t.topicId, accuracy: t.accuracy, attempts: t.totalAttempts });
      }
      items.push({ label: "Struggling topics", status: strugglingTopics.length > 5 ? "warn" : "info", value: effectiveness.strugglingTopics.length });
    }
  }

  // Difficulty spikes
  const spikes = await fetchLiveAPI(apiUrl, "/admin/analytics/difficulty-spikes", apiToken);
  if (spikes?.spikes) {
    difficultySpikeCount = spikes.spikes.length;
    items.push({ label: "Difficulty spikes", status: difficultySpikeCount > 10 ? "warn" : difficultySpikeCount > 0 ? "info" : "pass", value: difficultySpikeCount });
  }

  // Learning patterns (hint escalation)
  const patterns = await fetchLiveAPI(apiUrl, "/admin/analytics/learning-patterns", apiToken);
  if (patterns?.hintPatterns?.length > 0) {
    const totalHinted = patterns.hintPatterns.reduce((s: number, p: any) => s + (p.hintsUsed > 0 ? p.count : 0), 0);
    const totalAttempts = patterns.hintPatterns.reduce((s: number, p: any) => s + p.count, 0);
    if (totalAttempts > 0) {
      hintEscalationRate = Math.round((totalHinted / totalAttempts) * 100) / 100;
      items.push({ label: "Hint escalation rate", status: applyMaxThreshold(hintEscalationRate, thresholds.live.hintRateMax), value: `${(hintEscalationRate * 100).toFixed(0)}%` });
    }
  }

  if (items.length === 0) {
    items.push({ label: "Live data", status: "pending", detail: "No data available from API yet" });
  }

  const hasFailures = items.some(i => i.status === "fail");
  const hasWarnings = items.some(i => i.status === "warn");
  const status: ItemStatus = hasFailures ? "fail" : hasWarnings ? "warn" : totalReviews && totalReviews > 0 ? "pass" : "pending";

  return {
    status, items, mode: "live",
    overallAccuracy, topicAccuracyRange,
    difficultySpikeCount, hintEscalationRate,
    totalUsers, totalReviews, strugglingTopics,
  };
}

// ── LLM tracking ──

async function auditLLMTracking(thresholds: AuditThresholds, apiUrl?: string, apiToken?: string): Promise<LLMTrackingSection> {
  // Check schema completeness by reading the Drizzle schema file
  const schemaPath = join(process.cwd(), "packages", "api", "src", "db", "schema.ts");
  let schemaContent = "";
  if (existsSync(schemaPath)) {
    schemaContent = readFileSync(schemaPath, "utf-8");
  }

  const llmUsageTopicId = schemaContent.includes("topicId") && schemaContent.includes("llmUsage");
  const llmUsageProblemId = schemaContent.includes("problemId") && schemaContent.includes("llmUsage");
  const reviewLogLlmAssisted = schemaContent.includes("llmAssisted") && schemaContent.includes("reviewLog");
  const reviewLogHintSource = schemaContent.includes("hintSource") && schemaContent.includes("reviewLog");

  // Check analytics service for llmAssisted blob
  const analyticsPath = join(process.cwd(), "packages", "api", "src", "services", "analytics.ts");
  let analyticsContent = "";
  if (existsSync(analyticsPath)) {
    analyticsContent = readFileSync(analyticsPath, "utf-8");
  }
  const aeBlob13LlmAssisted = analyticsContent.includes("llmAssisted");

  const instrumentation = { llmUsageTopicId, llmUsageProblemId, reviewLogLlmAssisted, reviewLogHintSource, aeBlob13LlmAssisted };
  const instrumentationComplete = Object.values(instrumentation).every(Boolean);

  const items: StatusItem[] = [
    { label: "llm_usage.topic_id", status: llmUsageTopicId ? "pass" : "fail" },
    { label: "llm_usage.problem_id", status: llmUsageProblemId ? "pass" : "fail" },
    { label: "review_log.llm_assisted", status: reviewLogLlmAssisted ? "pass" : "fail" },
    { label: "review_log.hint_source", status: reviewLogHintSource ? "pass" : "fail" },
    { label: "AE blob llmAssisted", status: aeBlob13LlmAssisted ? "pass" : "fail" },
    { label: "Instrumentation complete", status: instrumentationComplete ? "pass" : "warn", detail: instrumentationComplete ? "All fields present" : "Some fields missing" },
  ];

  // Live data
  let totalCost: number | null = null;
  let totalCalls: number | null = null;
  let llmAccuracyDelta: number | null = null;

  if (apiUrl) {
    const stats = await fetchLiveAPI(apiUrl, "/admin/stats", apiToken);
    if (stats?.llmSummary) {
      totalCost = stats.llmSummary.totalCost ?? null;
      totalCalls = stats.llmSummary.totalCalls ?? null;
      if (totalCost != null) items.push({ label: "Total LLM cost", status: "info", value: `$${totalCost.toFixed(2)}` });
      if (totalCalls != null) items.push({ label: "Total LLM calls", status: "info", value: totalCalls });
    }

    const llmEff = await fetchLiveAPI(apiUrl, "/admin/analytics/llm-effectiveness", apiToken);
    if (llmEff?.overall) {
      llmAccuracyDelta = llmEff.overall.accuracyDelta ?? null;
      if (llmAccuracyDelta != null) {
        items.push({
          label: "LLM accuracy delta",
          status: applyMinThreshold(llmAccuracyDelta, thresholds.llm.llmAccuracyDeltaMin),
          value: `${llmAccuracyDelta >= 0 ? "+" : ""}${(llmAccuracyDelta * 100).toFixed(1)}%`,
        });
      }
    }
  }

  const status: ItemStatus = instrumentationComplete ? "pass" : "warn";

  return {
    status, items, instrumentation, instrumentationComplete,
    totalCost, totalCalls, llmAccuracyDelta,
  };
}

// ── Media readiness ──

function auditMediaReadiness(): MediaReadinessSection {
  const contentDir = getContentDir();
  const disciplines = listDisciplines();

  const visualComponents = new Map<string, number>();
  let totalMediaReferences = 0;
  const topicsWithMedia = new Set<string>();

  // Scan problems and examples for visual/media references
  const mediaPatterns = [
    { pattern: /number[- ]?line/i, type: "number-line" },
    { pattern: /fraction[- ]?bar/i, type: "fraction-bar" },
    { pattern: /\bdiagram\b/i, type: "diagram" },
    { pattern: /\b(chart|graph|plot)\b/i, type: "chart" },
    { pattern: /\btable\b/i, type: "table" },
    { pattern: /\bimage\b/i, type: "image" },
    { pattern: /\baudio\b/i, type: "audio" },
  ];

  for (const disc of disciplines) {
    for (const subdir of ["problems", "problems-generated", "examples"]) {
      const dir = join(contentDir, disc, subdir);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
        const content = readFileSync(join(dir, file), "utf-8");
        for (const { pattern, type } of mediaPatterns) {
          const matches = content.match(new RegExp(pattern, "gi"));
          if (matches) {
            visualComponents.set(type, (visualComponents.get(type) ?? 0) + matches.length);
            totalMediaReferences += matches.length;
            topicsWithMedia.add(file.replace(".json", ""));
          }
        }
      }
    }
  }

  const components = [...visualComponents.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const items: StatusItem[] = [
    { label: "Visual component references", status: "info", value: totalMediaReferences },
    { label: "Topics referencing media", status: "info", value: topicsWithMedia.size },
    { label: "Media types found", status: "info", value: components.length },
    { label: "Media asset pipeline", status: "pending", detail: "Text-only MVP — media pipeline not yet built" },
  ];

  return {
    status: "info", items, visualComponents: components,
    totalMediaReferences, topicsWithMedia: topicsWithMedia.size,
  };
}

// ── Multi-discipline coverage ──

function auditMultiDiscipline(): MultiDisciplineSection {
  const disciplines = listDisciplines();
  const summaries = [];
  let totalTopics = 0;
  let totalProblems = 0;
  let totalExamples = 0;

  for (const disc of disciplines) {
    const report = generateDisciplineReport(disc);
    if (!report) continue;

    const statusResult = generateContentStatus(disc);
    const problemCount = statusResult?.totalProblems ?? 0;
    const exampleCount = statusResult?.totalExamples ?? 0;
    const contentComplete = statusResult
      ? statusResult.topics.every(t => t.problemCount > 0 && t.exampleCount > 0)
      : false;

    summaries.push({
      disciplineId: disc,
      name: report.name,
      progressionModel: report.progressionModel,
      topicCount: report.topicCount,
      problemCount,
      exampleCount,
      prereqDensity: report.prereqDensity,
      encompassingDensity: report.encompassingDensity,
      collectionCount: report.collections.length,
      contentComplete,
    });

    totalTopics += report.topicCount;
    totalProblems += problemCount;
    totalExamples += exampleCount;
  }

  const items: StatusItem[] = [
    { label: "Disciplines", status: "info", value: summaries.length },
    { label: "Total topics", status: "info", value: totalTopics },
    { label: "Total problems", status: "info", value: totalProblems },
    { label: "Total examples", status: "info", value: totalExamples },
  ];

  for (const d of summaries) {
    items.push({
      label: `${d.name} content`,
      status: d.contentComplete ? "pass" : d.problemCount > 0 ? "warn" : "fail",
      value: `${d.topicCount} topics, ${d.problemCount} problems`,
    });
  }

  const incomplete = summaries.filter(d => !d.contentComplete);
  const status: ItemStatus = incomplete.length === 0 ? "pass" : incomplete.some(d => d.problemCount === 0) ? "fail" : "warn";

  return {
    status, items, disciplines: summaries,
    totalTopics, totalProblems, totalExamples,
  };
}

// ── Content Review (Section 8) ──

function auditContentReview(): ContentReviewSection {
  const reviewsDir = join(process.cwd(), "audit", "reports", "content-reviews");
  if (!existsSync(reviewsDir)) {
    return {
      status: "pending",
      items: [{ label: "Content Review", status: "pending", detail: "No reviews found — run `/content-review` to generate" }],
      topicsReviewed: 0,
      gradeDistribution: {},
      highConfidenceIssues: 0,
      worstTopics: [],
      topRecurringIssues: [],
      lastReviewTimestamp: null,
    };
  }

  // Scan all discipline subdirectories
  const disciplines = readdirSync(reviewsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let topicsReviewed = 0;
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let highConfidenceIssues = 0;
  const worstTopics: ContentReviewSection["worstTopics"] = [];
  const issueCounts = new Map<string, { count: number; severity: string }>();
  let lastTimestamp: string | null = null;

  for (const disc of disciplines) {
    const discDir = join(reviewsDir, disc);
    const files = readdirSync(discDir).filter(f => f.endsWith(".json") && !f.includes("-report"));

    for (const file of files) {
      const cache = JSON.parse(readFileSync(join(discDir, file), "utf-8"));
      if (!cache.reviews || cache.reviews.length === 0) continue;

      topicsReviewed++;
      const latest = cache.reviews[cache.reviews.length - 1];
      gradeDistribution[latest.overallGrade] = (gradeDistribution[latest.overallGrade] ?? 0) + 1;

      if (latest.timestamp && (!lastTimestamp || latest.timestamp > lastTimestamp)) {
        lastTimestamp = latest.timestamp;
      }

      // Aggregate findings for confidence
      for (const review of cache.reviews) {
        for (const f of review.findings) {
          if (f.status === "error" || f.status === "warn") {
            const key = `${f.criterion}|${f.status}`;
            const existing = issueCounts.get(key);
            if (existing) existing.count++;
            else issueCounts.set(key, { count: 1, severity: f.status });
          }
        }
      }

      // High confidence: findings in 2+ reviews
      if (cache.reviews.length >= 2) {
        const findingKeys = new Map<string, number>();
        for (const review of cache.reviews) {
          const seen = new Set<string>();
          for (const f of review.findings) {
            if (f.status === "error" || f.status === "warn") {
              const key = `${f.criterion}|${f.status}|${f.problemId ?? ""}`;
              if (!seen.has(key)) {
                seen.add(key);
                findingKeys.set(key, (findingKeys.get(key) ?? 0) + 1);
              }
            }
          }
        }
        highConfidenceIssues += [...findingKeys.values()].filter(c => c >= 2).length;
      }

      // Worst topics
      if (latest.overallGrade === "D" || latest.overallGrade === "F") {
        worstTopics.push({
          topicId: latest.topicId,
          discipline: latest.discipline ?? disc,
          grade: latest.overallGrade,
          topFindings: latest.findings
            .filter((f: any) => f.status === "error")
            .slice(0, 3)
            .map((f: any) => `${f.criterion}: ${f.detail}`),
        });
      }
    }
  }

  // Top recurring issues
  const topRecurringIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, val]) => ({
      criterion: key.split("|")[0],
      count: val.count,
      severity: val.severity,
    }));

  // Status
  const hasErrors = (gradeDistribution["D"] ?? 0) + (gradeDistribution["F"] ?? 0) > 0;
  const hasWarns = (gradeDistribution["C"] ?? 0) > 0;
  const status: ItemStatus = topicsReviewed === 0 ? "pending" : hasErrors ? "fail" : hasWarns ? "warn" : "pass";

  const items: StatusItem[] = [];
  items.push({ label: "Topics Reviewed", status: "info", value: topicsReviewed });
  if (topicsReviewed > 0) {
    items.push({ label: "Grade A/B", status: "pass", value: (gradeDistribution["A"] ?? 0) + (gradeDistribution["B"] ?? 0) });
    if (hasWarns) items.push({ label: "Grade C", status: "warn", value: gradeDistribution["C"] ?? 0 });
    if (hasErrors) items.push({ label: "Grade D/F", status: "fail", value: (gradeDistribution["D"] ?? 0) + (gradeDistribution["F"] ?? 0) });
    items.push({ label: "High Confidence Issues", status: highConfidenceIssues > 0 ? "warn" : "pass", value: highConfidenceIssues });
  }

  return {
    status,
    items,
    topicsReviewed,
    gradeDistribution,
    highConfidenceIssues,
    worstTopics: worstTopics.slice(0, 10),
    topRecurringIssues,
    lastReviewTimestamp: lastTimestamp,
  };
}

// ── Assessment health ──

function auditAssessmentHealth(subject: string): AssessmentHealthSection {
  const contentDir = getContentDir();
  const graphPath = join(contentDir, subject, "graph.json");

  if (!existsSync(graphPath)) {
    return {
      status: "pending",
      items: [{ label: "Graph", status: "pending", detail: `${subject}/graph.json not found` }],
      topicsWithStandardCode: 0, totalTopics: 0, standardCodePct: 0,
      uniqueStandards: 0, topicsPerStandardAvg: 0,
    };
  }

  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  const topics: any[] = graph.topics ?? [];
  const totalTopics = topics.length;

  const topicsWithCode = topics.filter((t: any) => t.standardCode && t.standardCode.trim() !== "");
  const topicsWithStandardCode = topicsWithCode.length;
  const standardCodePct = totalTopics > 0 ? Math.round(topicsWithStandardCode / totalTopics * 100) : 0;

  const standardCounts = new Map<string, number>();
  for (const t of topicsWithCode) {
    const code = t.standardCode as string;
    standardCounts.set(code, (standardCounts.get(code) ?? 0) + 1);
  }
  const uniqueStandards = standardCounts.size;
  const topicsPerStandardAvg = uniqueStandards > 0
    ? Math.round((topicsWithStandardCode / uniqueStandards) * 10) / 10
    : 0;

  const items: StatusItem[] = [
    {
      label: "Topics with standard code",
      status: standardCodePct >= 90 ? "pass" : standardCodePct >= 50 ? "warn" : "fail",
      value: `${topicsWithStandardCode}/${totalTopics} (${standardCodePct}%)`,
    },
    {
      label: "Unique standards covered",
      status: uniqueStandards > 0 ? "pass" : "warn",
      value: uniqueStandards,
    },
    {
      label: "Avg topics per standard",
      status: "info",
      value: topicsPerStandardAvg,
    },
  ];

  const failItems = items.filter(i => i.status === "fail");
  const warnItems = items.filter(i => i.status === "warn");
  const status: ItemStatus = failItems.length > 0 ? "fail" : warnItems.length > 0 ? "warn" : "pass";

  return { status, items, topicsWithStandardCode, totalTopics, standardCodePct, uniqueStandards, topicsPerStandardAvg };
}

// ── Main orchestrator ──

export async function runAudit(opts: {
  mode?: "offline" | "live";
  primarySubject?: string;
  apiUrl?: string;
  apiToken?: string;
  thresholdsFile?: string;
  compareWith?: string;
} = {}): Promise<AuditReport> {
  const mode = opts.mode ?? "offline";
  const primarySubject = opts.primarySubject ?? "math";
  const apiUrl = mode === "live" ? opts.apiUrl : undefined;
  const apiToken = opts.apiToken;
  const thresholds = loadThresholds(opts.thresholdsFile);

  const graphIntegrity = auditGraphIntegrity(primarySubject, thresholds);
  const contentQuality = auditContentQuality(primarySubject, thresholds);
  const simulationResults = auditSimulationResults();
  const contentEffectiveness = await auditContentEffectiveness(thresholds, apiUrl, apiToken);
  const llmTracking = await auditLLMTracking(thresholds, apiUrl, apiToken);
  const mediaReadiness = auditMediaReadiness();
  const multiDiscipline = auditMultiDiscipline();
  const contentReview = auditContentReview();
  const assessmentHealth = auditAssessmentHealth(primarySubject);

  // Overall status
  const sectionStatuses = [
    graphIntegrity.status,
    contentQuality.status,
    simulationResults.status,
    llmTracking.status,
  ];
  const passCount = sectionStatuses.filter(s => s === "pass").length;
  const warnCount = sectionStatuses.filter(s => s === "warn").length;
  const failCount = sectionStatuses.filter(s => s === "fail").length;
  const pendingCount = sectionStatuses.filter(s => s === "pending").length;

  const overallStatus: ItemStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  const report: AuditReport = {
    metadata: {
      timestamp: new Date().toISOString(),
      mode,
      contentDir: getContentDir(),
      platformVersion: "0.1.0",
      auditVersion: 2,
      thresholdsFile: opts.thresholdsFile,
    },
    overallStatus,
    summary: { passCount, warnCount, failCount, pendingCount },
    sections: {
      graphIntegrity,
      contentQuality,
      simulationResults,
      contentEffectiveness,
      llmTracking,
      mediaReadiness,
      multiDiscipline,
      contentReview,
      assessmentHealth,
    },
  };

  // Historical comparison
  if (opts.compareWith && existsSync(opts.compareWith)) {
    const previous: AuditReport = JSON.parse(readFileSync(opts.compareWith, "utf-8"));
    report.delta = compareAudits(report, previous);
  }

  return report;
}

// ── CLI entry point ──

const isCLI = process.argv[1]?.endsWith("orchestrator.ts") || process.argv[1]?.endsWith("orchestrator.js");
if (isCLI) {
  (async () => {
    const args = process.argv.slice(2);
    const jsonOnly = args.includes("--json");
    const save = args.includes("--save");
    const live = args.includes("--live");

    // Parse --thresholds <file>
    const thresholdsIdx = args.indexOf("--thresholds");
    const thresholdsFile = thresholdsIdx >= 0 ? args[thresholdsIdx + 1] : undefined;

    // Parse --compare <file>
    const compareIdx = args.indexOf("--compare");
    const compareWith = compareIdx >= 0 ? args[compareIdx + 1] : undefined;

    const apiUrl = live ? (process.env.AUDIT_API_URL || undefined) : undefined;
    const apiToken = process.env.AUDIT_API_TOKEN || undefined;

    if (live && !apiUrl) {
      console.error("Error: --live requires AUDIT_API_URL environment variable");
      process.exit(1);
    }

    const report = await runAudit({
      mode: live ? "live" : "offline",
      apiUrl,
      apiToken,
      thresholdsFile,
      compareWith,
    });

    // Always save latest JSON
    const reportsDir = join(process.cwd(), "audit", "reports");
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, "latest.json"), JSON.stringify(report, null, 2));

    // Save timestamped snapshot
    if (save) {
      const auditsDir = join(reportsDir, "snapshots");
      if (!existsSync(auditsDir)) mkdirSync(auditsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(join(auditsDir, `${timestamp}.json`), JSON.stringify(report, null, 2));
    }

    if (jsonOnly) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderAuditMarkdown(report));
    }
  })();
}
