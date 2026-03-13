/**
 * Markdown renderer for AuditReport — produces human-readable output with
 * pass/warn/fail indicators and actionable recommendations.
 */
import type { AuditReport, ItemStatus, StatusItem } from "./audit-types.js";

const STATUS_ICON: Record<ItemStatus, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  info: "ℹ️",
  pending: "⏳",
};

function statusIcon(status: ItemStatus): string {
  return STATUS_ICON[status] ?? "❓";
}

function renderItem(item: StatusItem): string {
  const icon = statusIcon(item.status);
  const parts = [icon, item.label];
  if (item.value !== undefined) parts.push(`**${item.value}**`);
  if (item.target !== undefined) parts.push(`(target: ${item.target})`);
  if (item.detail) parts.push(`— ${item.detail}`);
  return parts.join(" ");
}

function renderItems(items: StatusItem[]): string {
  return items.map(i => `- ${renderItem(i)}`).join("\n");
}

export function renderAuditMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  const { sections: s } = report;

  // Header
  lines.push(`# System Audit Report`);
  lines.push(``);
  lines.push(`${statusIcon(report.overallStatus)} **Overall: ${report.overallStatus.toUpperCase()}** | ${report.summary.passCount} pass, ${report.summary.warnCount} warn, ${report.summary.failCount} fail, ${report.summary.pendingCount} pending`);
  lines.push(``);
  lines.push(`- **Mode:** ${report.metadata.mode}`);
  lines.push(`- **Timestamp:** ${report.metadata.timestamp}`);
  lines.push(`- **Content dir:** ${report.metadata.contentDir}`);
  lines.push(``);

  // Section 1: Graph Integrity
  lines.push(`---`);
  lines.push(`## 1. Graph Integrity ${statusIcon(s.graphIntegrity.status)}`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Topics | ${s.graphIntegrity.topicCount} |`);
  lines.push(`| Prerequisites | ${s.graphIntegrity.prerequisiteCount} |`);
  lines.push(`| Encompassings | ${s.graphIntegrity.encompassingCount} |`);
  lines.push(`| Prereq density | ${s.graphIntegrity.prereqDensity}/topic |`);
  lines.push(`| Encompassing density | ${s.graphIntegrity.encompassingDensity}/topic |`);
  lines.push(`| Max depth | ${s.graphIntegrity.maxDepth} |`);
  lines.push(`| Progression model | ${s.graphIntegrity.progressionModel} |`);
  lines.push(`| Edge types | ${s.graphIntegrity.edgeTypes.required} req / ${s.graphIntegrity.edgeTypes.recommended} rec / ${s.graphIntegrity.edgeTypes.enriching} enr |`);
  lines.push(``);
  lines.push(renderItems(s.graphIntegrity.items));
  lines.push(``);

  if (s.graphIntegrity.bottlenecks.length > 0) {
    lines.push(`**Bottleneck topics:**`);
    for (const b of s.graphIntegrity.bottlenecks) {
      lines.push(`- \`${b.topicId}\`: ${b.downstreamCount} downstream`);
    }
    lines.push(``);
  }

  // Section 2: Content Quality
  lines.push(`---`);
  lines.push(`## 2. Content Quality ${statusIcon(s.contentQuality.status)}`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total problems | ${s.contentQuality.totalProblems} |`);
  lines.push(`| Total examples | ${s.contentQuality.totalExamples} |`);
  lines.push(`| Topics with problems | ${s.contentQuality.topicsWithProblems}/${s.contentQuality.totalTopics} |`);
  lines.push(`| Topics with examples | ${s.contentQuality.topicsWithExamples}/${s.contentQuality.totalTopics} |`);
  lines.push(`| Average health | ${s.contentQuality.healthDistribution.average}/100 |`);
  lines.push(`| Demand diversity | ${s.contentQuality.demandDiversity} |`);
  lines.push(``);
  lines.push(renderItems(s.contentQuality.items));
  lines.push(``);

  if (s.contentQuality.topGaps.length > 0) {
    lines.push(`**Top content gaps:**`);
    lines.push(`| Topic | Type | Impact | Priority |`);
    lines.push(`|-------|------|--------|----------|`);
    for (const g of s.contentQuality.topGaps) {
      lines.push(`| \`${g.topicId}\` | ${g.gapType} | ${g.impact} | ${g.priority} |`);
    }
    lines.push(``);
  }

  // Section 3: Simulation Results
  lines.push(`---`);
  lines.push(`## 3. Simulation Results ${statusIcon(s.simulationResults.status)}`);
  lines.push(``);

  if (s.simulationResults.evaluationTimestamp) {
    lines.push(`- **Last evaluation:** ${s.simulationResults.evaluationTimestamp}`);
    lines.push(`- **Target version:** ${s.simulationResults.targetVersion}`);
    lines.push(`- **Maturity level:** ${s.simulationResults.maturityLevel}`);
    lines.push(`- **Results:** ${s.simulationResults.passCount} pass, ${s.simulationResults.failCount} fail`);
    lines.push(``);

    if (s.simulationResults.systems.length > 0) {
      lines.push(`| System | Status | Actual | Target | Priority |`);
      lines.push(`|--------|--------|--------|--------|----------|`);
      for (const sys of s.simulationResults.systems) {
        const icon = sys.status === "PASS" ? "✅" : "❌";
        const actualStr = typeof sys.actual === "number" && sys.actual < 1 && sys.unit === "ratio"
          ? `${(sys.actual * 100).toFixed(1)}%`
          : String(sys.actual);
        const targetStr = typeof sys.target === "number" && sys.target < 1 && sys.unit === "ratio"
          ? `${(sys.target * 100).toFixed(1)}%`
          : String(sys.target);
        lines.push(`| ${icon} ${sys.name} | ${sys.status} | ${actualStr} | ${targetStr} | ${sys.priority} |`);
      }
      lines.push(``);
    }
  } else {
    lines.push(renderItems(s.simulationResults.items));
    lines.push(``);
  }

  // Section 4: Content Effectiveness
  lines.push(`---`);
  lines.push(`## 4. Content Effectiveness ${statusIcon(s.contentEffectiveness.status)}`);
  lines.push(``);
  lines.push(renderItems(s.contentEffectiveness.items));
  lines.push(``);

  // Section 5: LLM Tracking
  lines.push(`---`);
  lines.push(`## 5. LLM Tracking ${statusIcon(s.llmTracking.status)}`);
  lines.push(``);
  lines.push(`**Instrumentation:** ${s.llmTracking.instrumentationComplete ? "Complete" : "Incomplete"}`);
  lines.push(``);
  lines.push(renderItems(s.llmTracking.items));
  lines.push(``);

  // Section 6: Media Readiness
  lines.push(`---`);
  lines.push(`## 6. Media Readiness ${statusIcon(s.mediaReadiness.status)}`);
  lines.push(``);
  lines.push(renderItems(s.mediaReadiness.items));
  lines.push(``);

  if (s.mediaReadiness.visualComponents.length > 0) {
    lines.push(`**Visual component references:**`);
    lines.push(`| Type | Count |`);
    lines.push(`|------|-------|`);
    for (const vc of s.mediaReadiness.visualComponents) {
      lines.push(`| ${vc.type} | ${vc.count} |`);
    }
    lines.push(``);
  }

  // Section 7: Multi-Discipline Coverage
  lines.push(`---`);
  lines.push(`## 7. Multi-Discipline Coverage ${statusIcon(s.multiDiscipline.status)}`);
  lines.push(``);

  if (s.multiDiscipline.disciplines.length > 0) {
    lines.push(`| Discipline | Model | Topics | Problems | Examples | Complete |`);
    lines.push(`|------------|-------|--------|----------|----------|----------|`);
    for (const d of s.multiDiscipline.disciplines) {
      const complete = d.contentComplete ? "✅" : "❌";
      lines.push(`| ${d.name} | ${d.progressionModel} | ${d.topicCount} | ${d.problemCount} | ${d.exampleCount} | ${complete} |`);
    }
    lines.push(``);
  }

  lines.push(renderItems(s.multiDiscipline.items));
  lines.push(``);

  // Recommendations
  lines.push(`---`);
  lines.push(`## Recommendations`);
  lines.push(``);

  const recs: string[] = [];

  if (!s.graphIntegrity.dagValid) {
    recs.push(`Fix graph cycles — DAG integrity is broken`);
  }
  if (s.contentQuality.gapSummary.critical > 0) {
    recs.push(`Fix ${s.contentQuality.gapSummary.critical} critical content gaps — run \`/content-health\` to investigate`);
  }
  if (s.contentQuality.healthDistribution.below50 > 0) {
    recs.push(`${s.contentQuality.healthDistribution.below50} topics below 50 health — run \`just content-status\` for details`);
  }
  if (s.graphIntegrity.encompassingDensity < 1.0) {
    recs.push(`Encompassing density ${s.graphIntegrity.encompassingDensity} below 1.0 — add encompassing edges for FIRe effectiveness`);
  }
  if (s.simulationResults.failCount > 0) {
    recs.push(`${s.simulationResults.failCount} simulation systems failing — run \`just heal-epoch\` to investigate`);
  }
  if (!s.llmTracking.instrumentationComplete) {
    recs.push(`LLM instrumentation incomplete — verify Plan 024 was executed`);
  }
  if (s.contentEffectiveness.status === "pending") {
    recs.push(`Content effectiveness data pending — deploy and collect user data, then run \`just audit --live\``);
  }

  const incompleteDiscs = s.multiDiscipline.disciplines.filter(d => !d.contentComplete);
  if (incompleteDiscs.length > 0) {
    recs.push(`${incompleteDiscs.length} discipline(s) have incomplete content: ${incompleteDiscs.map(d => d.name).join(", ")}`);
  }

  if (recs.length === 0) {
    lines.push(`No critical recommendations — system is healthy.`);
  } else {
    for (let i = 0; i < recs.length; i++) {
      lines.push(`${i + 1}. ${recs[i]}`);
    }
  }

  lines.push(``);
  return lines.join("\n");
}
