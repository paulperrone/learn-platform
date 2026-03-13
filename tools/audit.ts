/**
 * Unified system audit — orchestrates all validation, content health, simulation
 * evaluation, LLM tracking, and media readiness checks into a single report.
 *
 * Usage:
 *   npx tsx tools/audit.ts              # Markdown to stdout + JSON to simulations/reports/audit-latest.json
 *   npx tsx tools/audit.ts --json       # JSON only
 *   npx tsx tools/audit.ts --save       # Also saves timestamped snapshot
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { getContentDir } from "./content-dir.js";
import { generateContentStatus } from "./content-status.js";
import { detectContentGaps } from "./content-gaps.js";
import { generateDisciplineReport, listDisciplines } from "./content-report.js";
import { renderAuditMarkdown } from "./audit-render.js";
import type {
  AuditReport, ItemStatus, StatusItem,
  GraphIntegritySection, ContentQualitySection, SimulationResultsSection,
  ContentEffectivenessSection, LLMTrackingSection, MediaReadinessSection,
  MultiDisciplineSection, SimulationSystem,
} from "./audit-types.js";

// ── Graph integrity (computed directly — avoids refactoring 577-line validate-graph.ts) ──

function auditGraphIntegrity(subject: string): GraphIntegritySection {
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
    { label: "Prereq density", status: prereqDensity >= 1.2 ? "pass" : prereqDensity >= 0.8 ? "warn" : "fail", value: prereqDensity, target: "1.5-3.0" },
    { label: "Encompassing density", status: encompassingDensity >= 1.0 ? "pass" : encompassingDensity >= 0.5 ? "warn" : "fail", value: encompassingDensity, target: "1.0-2.0" },
    { label: "Orphan topics", status: orphanCount === 0 ? "pass" : "warn", value: orphanCount },
    { label: "Bottlenecks (>8 downstream)", status: bottlenecks.length === 0 ? "pass" : bottlenecks.length <= 3 ? "warn" : "fail", value: bottlenecks.length },
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

// ── Content quality ──

function auditContentQuality(subject: string): ContentQualitySection {
  const statusResult = generateContentStatus(subject);
  const gapResult = detectContentGaps(subject);

  if (!statusResult) {
    return {
      status: "fail", items: [{ label: "Content", status: "fail", detail: "No content found" }],
      totalProblems: 0, totalExamples: 0, topicsWithProblems: 0, topicsWithExamples: 0, totalTopics: 0,
      healthDistribution: { below50: 0, below70: 0, above70: 0, average: 0 },
      gapSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      topGaps: [], demandDiversity: 0,
    };
  }

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
    { label: "Average health", status: statusResult.averageHealth >= 70 ? "pass" : statusResult.averageHealth >= 50 ? "warn" : "fail", value: statusResult.averageHealth, target: "70+" },
    { label: "Topics with problems", status: topicsWithProblems === statusResult.topicCount ? "pass" : topicsWithProblems >= statusResult.topicCount * 0.9 ? "warn" : "fail", value: `${topicsWithProblems}/${statusResult.topicCount}` },
    { label: "Topics with examples", status: topicsWithExamples === statusResult.topicCount ? "pass" : topicsWithExamples >= statusResult.topicCount * 0.9 ? "warn" : "fail", value: `${topicsWithExamples}/${statusResult.topicCount}` },
    { label: "Critical gaps", status: gapSummary.critical === 0 ? "pass" : "fail", value: gapSummary.critical },
    { label: "Topics below 50 health", status: below50 === 0 ? "pass" : below50 <= 10 ? "warn" : "fail", value: below50 },
    { label: "Demand diversity", status: avgDemandDiversity >= 0.6 ? "pass" : avgDemandDiversity >= 0.3 ? "warn" : "fail", value: avgDemandDiversity },
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
  };
}

// ── Simulation results ──

function auditSimulationResults(): SimulationResultsSection {
  const evalPath = join(process.cwd(), "simulations", "reports", "evaluation.json");

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

// ── Content effectiveness (offline placeholder) ──

function auditContentEffectiveness(): ContentEffectivenessSection {
  return {
    status: "pending",
    items: [{ label: "Content effectiveness", status: "pending", detail: "Awaiting user data — use --live for live analytics" }],
    mode: "offline",
    overallAccuracy: null,
    topicAccuracyRange: null,
    difficultySpikeCount: null,
    hintEscalationRate: null,
  };
}

// ── LLM tracking ──

function auditLLMTracking(): LLMTrackingSection {
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

  const status: ItemStatus = instrumentationComplete ? "pass" : "warn";

  return {
    status, items, instrumentation, instrumentationComplete,
    totalCost: null, totalCalls: null, llmAccuracyDelta: null,
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

// ── Main orchestrator ──

export function runAudit(opts: { mode?: "offline" | "live"; primarySubject?: string } = {}): AuditReport {
  const mode = opts.mode ?? "offline";
  const primarySubject = opts.primarySubject ?? "math";

  const graphIntegrity = auditGraphIntegrity(primarySubject);
  const contentQuality = auditContentQuality(primarySubject);
  const simulationResults = auditSimulationResults();
  const contentEffectiveness = auditContentEffectiveness();
  const llmTracking = auditLLMTracking();
  const mediaReadiness = auditMediaReadiness();
  const multiDiscipline = auditMultiDiscipline();

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

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      mode,
      contentDir: getContentDir(),
      platformVersion: "0.1.0",
      auditVersion: 1,
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
    },
  };
}

// ── CLI entry point ──

const isCLI = process.argv[1]?.includes("audit") && !process.argv[1]?.includes("audit-");
if (isCLI) {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const save = args.includes("--save");

  const report = runAudit();

  // Always save latest JSON
  const reportsDir = join(process.cwd(), "simulations", "reports");
  if (existsSync(reportsDir)) {
    writeFileSync(join(reportsDir, "audit-latest.json"), JSON.stringify(report, null, 2));
  }

  // Save timestamped snapshot
  if (save) {
    const auditsDir = join(reportsDir, "audits");
    if (!existsSync(auditsDir)) mkdirSync(auditsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(auditsDir, `${timestamp}.json`), JSON.stringify(report, null, 2));
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderAuditMarkdown(report));
  }
}
