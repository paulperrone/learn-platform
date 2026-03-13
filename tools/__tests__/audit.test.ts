#!/usr/bin/env npx tsx
/**
 * Tests for the audit orchestrator, report schema, and refactored tools.
 *
 * Usage: npx tsx tools/__tests__/audit.test.ts
 */
import { runAudit } from "../audit.js";
import { generateContentStatus } from "../content-status.js";
import { detectContentGaps } from "../content-gaps.js";
import { generateDisciplineReport, listDisciplines } from "../content-report.js";
import { renderAuditMarkdown } from "../audit-render.js";
import type { AuditReport, ItemStatus, EffectivenessRollup } from "../audit-types.js";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
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

async function main() {

// ── Report schema tests ──

console.log("\n=== Audit Report Schema ===");

const report = await runAudit();

assert(report.metadata !== undefined, "report has metadata");
assert(report.metadata.timestamp.length > 0, "metadata has timestamp");
assert(report.metadata.mode === "offline", "mode is offline");
assert(report.metadata.auditVersion === 2, "audit version is 2");
assert(typeof report.overallStatus === "string", "overall status is string");
assert(["pass", "warn", "fail", "info", "pending"].includes(report.overallStatus), "overall status is valid ItemStatus");

assert(report.summary !== undefined, "report has summary");
assert(typeof report.summary.passCount === "number", "summary has passCount");
assert(typeof report.summary.warnCount === "number", "summary has warnCount");
assert(typeof report.summary.failCount === "number", "summary has failCount");
assert(report.summary.passCount + report.summary.warnCount + report.summary.failCount + report.summary.pendingCount > 0, "summary counts are non-zero total");

assert(report.sections !== undefined, "report has sections");
assert(Object.keys(report.sections).length === 7, "report has 7 sections");

// ── Graph integrity tests ──

console.log("\n=== Graph Integrity Section ===");

const graph = report.sections.graphIntegrity;
assert(graph.topicCount === 705, `graph has 705 topics (got ${graph.topicCount})`);
assert(graph.dagValid === true, "DAG is valid");
assert(graph.cycleCount === 0, "no cycles");
assert(graph.prereqDensity > 1, `prereq density > 1 (got ${graph.prereqDensity})`);
assert(graph.encompassingDensity > 0, `encompassing density > 0 (got ${graph.encompassingDensity})`);
assert(graph.maxDepth > 0, `max depth > 0 (got ${graph.maxDepth})`);
assert(graph.progressionModel === "mastery-gated", "math is mastery-gated");
assert(graph.edgeTypes.required > 0, "has required edges");
assert(graph.bottlenecks.length > 0, "has bottleneck topics");
assert(graph.items.length > 0, "has status items");
assert(graph.fireReadiness !== undefined, "has FIRe readiness");

// ── Content quality tests ──

console.log("\n=== Content Quality Section ===");

const content = report.sections.contentQuality;
assert(content.totalProblems > 0, `has problems (got ${content.totalProblems})`);
assert(content.totalExamples > 0, `has examples (got ${content.totalExamples})`);
assert(content.topicsWithProblems === 705, `all topics have problems (got ${content.topicsWithProblems})`);
assert(content.topicsWithExamples === 705, `all topics have examples (got ${content.topicsWithExamples})`);
assert(content.healthDistribution.average > 0, `average health > 0 (got ${content.healthDistribution.average})`);
assert(content.gapSummary.total > 0, `has gaps (got ${content.gapSummary.total})`);
assert(content.topGaps.length > 0, "has top gaps");

// ── Simulation results tests ──

console.log("\n=== Simulation Results Section ===");

const sim = report.sections.simulationResults;
assert(sim.evaluationTimestamp !== null, "has evaluation timestamp");
assert(sim.systems.length > 0, `has systems (got ${sim.systems.length})`);
assert(sim.passCount + sim.failCount === sim.systems.length, "pass + fail = total systems");
assert(sim.systems.every(s => s.systemId && s.name), "all systems have id and name");

// ── Content effectiveness tests ──

console.log("\n=== Content Effectiveness Section ===");

const eff = report.sections.contentEffectiveness;
assert(eff.status === "pending", "offline mode shows pending");
assert(eff.mode === "offline", "mode is offline");
assert(eff.overallAccuracy === null, "no accuracy in offline mode");

// ── LLM tracking tests ──

console.log("\n=== LLM Tracking Section ===");

const llm = report.sections.llmTracking;
assert(llm.instrumentation !== undefined, "has instrumentation checks");
assert(llm.instrumentation.llmUsageTopicId === true, "llm_usage has topic_id");
assert(llm.instrumentation.llmUsageProblemId === true, "llm_usage has problem_id");
assert(llm.instrumentation.reviewLogLlmAssisted === true, "review_log has llm_assisted");
assert(llm.instrumentation.reviewLogHintSource === true, "review_log has hint_source");
assert(llm.instrumentation.aeBlob13LlmAssisted === true, "AE has llmAssisted");
assert(llm.instrumentationComplete === true, "instrumentation is complete");

// ── Media readiness tests ──

console.log("\n=== Media Readiness Section ===");

const media = report.sections.mediaReadiness;
assert(media.status === "info", "media status is info");
assert(Array.isArray(media.visualComponents), "has visual components array");
assert(typeof media.totalMediaReferences === "number", "has total media references");

// ── Multi-discipline tests ──

console.log("\n=== Multi-Discipline Section ===");

const multi = report.sections.multiDiscipline;
assert(multi.disciplines.length > 0, `has disciplines (got ${multi.disciplines.length})`);
assert(multi.totalTopics > 0, `total topics > 0 (got ${multi.totalTopics})`);
const mathDisc = multi.disciplines.find(d => d.disciplineId === "math");
assert(mathDisc !== undefined, "has math discipline");
assert(mathDisc!.topicCount === 705, "math has 705 topics");

// ── Markdown renderer tests ──

console.log("\n=== Markdown Renderer ===");

const markdown = renderAuditMarkdown(report);
assert(markdown.includes("# System Audit Report"), "has title");
assert(markdown.includes("## 1. Graph Integrity"), "has graph section");
assert(markdown.includes("## 2. Content Quality"), "has content section");
assert(markdown.includes("## 3. Simulation Results"), "has simulation section");
assert(markdown.includes("## 4. Content Effectiveness"), "has effectiveness section");
assert(markdown.includes("## 5. LLM Tracking"), "has LLM section");
assert(markdown.includes("## 6. Media Readiness"), "has media section");
assert(markdown.includes("## 7. Multi-Discipline Coverage"), "has multi-discipline section");
assert(markdown.includes("## Recommendations"), "has recommendations");
assert(markdown.includes("✅") || markdown.includes("❌") || markdown.includes("⚠️"), "has status icons");

// ── Refactored tool function tests ──

console.log("\n=== Refactored Tool Functions ===");

// content-status
const statusResult = generateContentStatus("math");
assert(statusResult !== null, "generateContentStatus returns result for math");
assert(statusResult!.topicCount === 705, "content status has 705 topics");
assert(statusResult!.topics.length === 705, "content status has 705 topic healths");
assert(statusResult!.averageHealth > 0, "content status has positive average health");

const nullStatus = generateContentStatus("nonexistent-subject");
assert(nullStatus === null, "generateContentStatus returns null for missing subject");

// content-gaps
const gapResult = detectContentGaps("math");
assert(gapResult !== null, "detectContentGaps returns result for math");
assert(gapResult!.totalGaps > 0, "has gaps");
assert(gapResult!.gaps.length === gapResult!.totalGaps, "gap count matches array length");
assert(gapResult!.gaps[0].impact >= gapResult!.gaps[gapResult!.gaps.length - 1].impact, "gaps sorted by impact descending");

const nullGaps = detectContentGaps("nonexistent-subject");
assert(nullGaps === null, "detectContentGaps returns null for missing subject");

// content-report
const discReport = generateDisciplineReport("math");
assert(discReport !== null, "generateDisciplineReport returns result for math");
assert(discReport!.topicCount === 705, "discipline report has 705 topics");
assert(discReport!.prereqDensity > 0, "discipline report has positive prereq density");
assert(discReport!.strands.length > 0, "discipline report has strands");

const nullReport = generateDisciplineReport("nonexistent-subject");
assert(nullReport === null, "generateDisciplineReport returns null for missing subject");

// listDisciplines
const disciplines = listDisciplines();
assert(disciplines.length > 0, "listDisciplines returns disciplines");
assert(disciplines.includes("math"), "listDisciplines includes math");

// ── Phase 2: R2 manifest & live analytics tests ──

console.log("\n=== R2 Manifest Scanner ===");

// Content quality should include manifest/version fields
assert(typeof content.manifestCount === "number", "content quality has manifestCount");
assert(typeof content.staleDeployCount === "number", "content quality has staleDeployCount");
assert(Array.isArray(content.contentVersions), "content quality has contentVersions array");
// dimensionCoverage may or may not be populated depending on whether bundles exist
assert(content.dimensionCoverage === null || typeof content.dimensionCoverage === "object", "dimensionCoverage is null or object");

console.log("\n=== Content Effectiveness (offline) ===");

assert(eff.totalUsers === null, "totalUsers is null in offline mode");
assert(eff.totalReviews === null, "totalReviews is null in offline mode");
assert(Array.isArray(eff.strugglingTopics), "strugglingTopics is array in offline mode");
assert(eff.strugglingTopics.length === 0, "no struggling topics in offline mode");

console.log("\n=== LLM Tracking (offline) ===");

assert(llm.totalCost === null, "totalCost is null in offline mode");
assert(llm.totalCalls === null, "totalCalls is null in offline mode");
assert(llm.llmAccuracyDelta === null, "llmAccuracyDelta is null in offline mode");

console.log("\n=== Markdown Renderer (Phase 2 fields) ===");

const markdown2 = renderAuditMarkdown(report);
assert(markdown2.includes("Mode:") && markdown2.includes("offline"), "renderer shows mode");
// Stale deploy rendering (may or may not have stale deploys)
if (content.staleDeployCount > 0) {
  assert(markdown2.includes("Stale deploys"), "renderer shows stale deploys when present");
}

// Test that live mode report structure works with mock-like data
const liveReport = await runAudit({ mode: "live", apiUrl: "http://localhost:99999" });
assert(liveReport.metadata.mode === "live", "live report has live mode");
// The API is unreachable, so live sections should gracefully degrade
const liveEff = liveReport.sections.contentEffectiveness;
assert(liveEff.mode === "live", "live effectiveness section has live mode");
// Should not crash even with unreachable API

console.log("\n=== LLM Instrumentation Completeness ===");

// Verify instrumentation checks detect schema columns
assert(typeof llm.instrumentation.llmUsageTopicId === "boolean", "llmUsageTopicId check is boolean");
assert(typeof llm.instrumentation.aeBlob13LlmAssisted === "boolean", "aeBlob13LlmAssisted check is boolean");

// ── Phase 3: Thresholds, comparison, rollup ──

console.log("\n=== Configurable Thresholds ===");

// Report uses thresholds (auditVersion bumped to 2)
assert(report.metadata.auditVersion === 2, "audit version is 2 (thresholds support)");

// Custom threshold test: make a strict threshold that would change graph status
const tmpThresholds = "/tmp/test-thresholds.json";
writeFileSync(tmpThresholds, JSON.stringify({
  graph: { prereqDensityMin: { warn: 5.0, fail: 4.0 }, encompassingDensityMin: { warn: 5.0, fail: 4.0 }, bottleneckMax: { warn: 0, fail: 1 } },
  content: { healthScoreMin: { warn: 99, fail: 90 }, problemsPerTopicMin: { warn: 100, fail: 50 }, demandDiversityMin: { warn: 0.99, fail: 0.9 } },
  simulation: { masteryConvergenceMin: { warn: 15, fail: 10 }, difficultyTargetingMin: { warn: 15, fail: 10 } },
  live: { topicAccuracyMin: { warn: 0.70, fail: 0.50 }, hintRateMax: { warn: 0.40, fail: 0.60 }, difficultySpikeDeltaMax: { warn: 0.15, fail: 0.25 } },
  llm: { llmAccuracyDeltaMin: { warn: 0.05, fail: -0.05 } },
}));

const strictReport = await runAudit({ thresholdsFile: tmpThresholds });
assert(strictReport.metadata.thresholdsFile === tmpThresholds, "custom thresholds file recorded in metadata");
// With strict thresholds, graph density 1.42 < warn:5.0 should fail
assert(strictReport.sections.graphIntegrity.status === "fail", "strict thresholds cause graph to fail");
// Content demand diversity 0.37 < fail:0.9 should fail
const strictDemandItem = strictReport.sections.contentQuality.items.find(i => i.label === "Demand diversity");
assert(strictDemandItem?.status === "fail", "strict thresholds cause demand diversity to fail");
unlinkSync(tmpThresholds);

console.log("\n=== Historical Comparison ===");

// Save current report, then compare with itself (should show all unchanged)
const tmpPrevious = "/tmp/test-previous-audit.json";
writeFileSync(tmpPrevious, JSON.stringify(report));

const comparedReport = await runAudit({ compareWith: tmpPrevious });

assert(comparedReport.delta !== undefined, "comparison produces delta");
assert(comparedReport.delta!.sectionDeltas.length === 7, "delta has 7 section comparisons");
assert(comparedReport.delta!.summary.unchanged === 7, "all sections unchanged when comparing with self");
assert(comparedReport.delta!.summary.improved === 0, "no improvements when comparing with self");
assert(comparedReport.delta!.summary.regressed === 0, "no regressions when comparing with self");
assert(comparedReport.delta!.previousTimestamp === report.metadata.timestamp, "delta has correct previous timestamp");

// Test delta rendering
const comparedMarkdown = renderAuditMarkdown(comparedReport);
assert(comparedMarkdown.includes("improved"), "comparison markdown shows improved count");
assert(comparedMarkdown.includes("regressed"), "comparison markdown shows regressed count");
assert(comparedMarkdown.includes("unchanged"), "comparison markdown shows unchanged count");
assert(comparedMarkdown.includes("→"), "comparison markdown shows unchanged arrow");
unlinkSync(tmpPrevious);

console.log("\n=== Rollup Types ===");

// Just verify the type structure exists (actual rollup needs live API)
const mockRollup: EffectivenessRollup = {
  timestamp: new Date().toISOString(),
  period: { from: "2026-01-01", to: "2026-03-13" },
  topics: [{ topicId: "test", accuracy: 0.8, hintRate: 0.1, avgResponseTime: 5000, attempts: 100, contentVersion: null }],
  overall: { accuracy: 0.8, hintRate: 0.1, avgResponseTime: 5000, totalAttempts: 100 },
};
assert(mockRollup.topics.length === 1, "rollup type has correct structure");
assert(mockRollup.overall.accuracy === 0.8, "rollup overall accuracy correct");

// ── Summary ──

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

} // end main

main().catch(err => { console.error(err); process.exit(1); });
