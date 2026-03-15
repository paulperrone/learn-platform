/**
 * Markdown renderer for AuditReport — produces human-readable output with
 * pass/warn/fail indicators and actionable recommendations.
 */
import type { AuditReport, AuditDelta, ItemStatus, StatusItem } from "./types.js";

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
  if (report.metadata.thresholdsFile) {
    lines.push(`- **Thresholds:** ${report.metadata.thresholdsFile}`);
  }
  lines.push(``);

  // Delta comparison
  if (report.delta) {
    const d = report.delta;
    const trendIcon = (t: string) => t === "improved" ? "↑" : t === "regressed" ? "↓" : "→";
    lines.push(`### vs ${d.previousTimestamp.split("T")[0]}: ${d.summary.improved} improved, ${d.summary.regressed} regressed, ${d.summary.unchanged} unchanged`);
    lines.push(``);
    lines.push(`| Section | Previous | Current | Trend | Changes |`);
    lines.push(`|---------|----------|---------|-------|---------|`);
    for (const sd of d.sectionDeltas) {
      const changes = sd.details.length > 0 ? sd.details.join("; ") : "—";
      lines.push(`| ${sd.section} | ${statusIcon(sd.previousStatus)} ${sd.previousStatus} | ${statusIcon(sd.currentStatus)} ${sd.currentStatus} | ${trendIcon(sd.trend)} | ${changes} |`);
    }
    lines.push(``);
  }

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
  lines.push(`| Lesson coverage | ${s.contentQuality.lessonCoverage?.topicsWithLessons ?? s.contentQuality.topicsWithExamples}/${s.contentQuality.totalTopics} (${s.contentQuality.lessonCoverage?.pct ?? 0}%) |`);
  lines.push(`| Average health | ${s.contentQuality.healthDistribution.average}/100 |`);
  lines.push(`| Demand diversity | ${s.contentQuality.demandDiversity} |`);
  if (s.contentQuality.manifestCount > 0) {
    lines.push(`| Bundle manifests | ${s.contentQuality.manifestCount} |`);
    lines.push(`| Stale deploys | ${s.contentQuality.staleDeployCount} |`);
  }
  lines.push(``);
  lines.push(renderItems(s.contentQuality.items));
  lines.push(``);

  // Dimension coverage from R2 manifests
  if (s.contentQuality.dimensionCoverage) {
    const dc = s.contentQuality.dimensionCoverage;
    lines.push(`**Dimension coverage (from bundles):**`);
    lines.push(``);
    const renderDim = (label: string, data: Record<string, number>) => {
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
      if (entries.length > 0) {
        lines.push(`*${label}:* ${entries.map(([k, v]) => `${k} (${v})`).join(", ")}`);
      }
    };
    renderDim("Presentation", dc.presentation);
    renderDim("Depth", dc.depth);
    renderDim("Locale", dc.locale);
    renderDim("Flavor", dc.flavor);
    lines.push(``);
  }

  // Stale deploy warnings
  if (s.contentQuality.staleDeployCount > 0) {
    const stale = s.contentQuality.contentVersions.filter(v => v.stale).slice(0, 10);
    lines.push(`**Stale deploys** (source newer than bundle):`);
    for (const v of stale) {
      lines.push(`- \`${v.discipline}/${v.topicId}\``);
    }
    if (s.contentQuality.staleDeployCount > 10) {
      lines.push(`- ... and ${s.contentQuality.staleDeployCount - 10} more`);
    }
    lines.push(``);
  }

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
  lines.push(`- **Mode:** ${s.contentEffectiveness.mode}`);

  if (s.contentEffectiveness.mode === "live" && s.contentEffectiveness.overallAccuracy != null) {
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall accuracy | ${(s.contentEffectiveness.overallAccuracy * 100).toFixed(0)}% |`);
    if (s.contentEffectiveness.topicAccuracyRange) {
      lines.push(`| Accuracy range | ${(s.contentEffectiveness.topicAccuracyRange.min * 100).toFixed(0)}%–${(s.contentEffectiveness.topicAccuracyRange.max * 100).toFixed(0)}% |`);
    }
    if (s.contentEffectiveness.difficultySpikeCount != null) {
      lines.push(`| Difficulty spikes | ${s.contentEffectiveness.difficultySpikeCount} |`);
    }
    if (s.contentEffectiveness.hintEscalationRate != null) {
      lines.push(`| Hint escalation rate | ${(s.contentEffectiveness.hintEscalationRate * 100).toFixed(0)}% |`);
    }
    lines.push(`| Total users | ${s.contentEffectiveness.totalUsers ?? "—"} |`);
    lines.push(`| Total reviews | ${s.contentEffectiveness.totalReviews ?? "—"} |`);
  }
  lines.push(``);
  lines.push(renderItems(s.contentEffectiveness.items));
  lines.push(``);

  // Struggling topics
  if (s.contentEffectiveness.strugglingTopics.length > 0) {
    lines.push(`**Struggling topics:**`);
    lines.push(`| Topic | Accuracy | Attempts |`);
    lines.push(`|-------|----------|----------|`);
    for (const t of s.contentEffectiveness.strugglingTopics) {
      lines.push(`| \`${t.topicId}\` | ${(t.accuracy * 100).toFixed(0)}% | ${t.attempts} |`);
    }
    lines.push(``);
  }

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

  // Section 8: Content Review
  if (s.contentReview) {
    lines.push(`## 8. Content Review ${statusIcon(s.contentReview.status)}`);
    lines.push(``);

    if (s.contentReview.topicsReviewed === 0) {
      lines.push(`No content reviews found. Run \`/content-review\` in Claude Code to generate.`);
    } else {
      // Grade distribution
      const gd = s.contentReview.gradeDistribution;
      lines.push(`| Grade | Count |`);
      lines.push(`|-------|-------|`);
      for (const grade of ["A", "B", "C", "D", "F"]) {
        if (gd[grade]) lines.push(`| ${grade} | ${gd[grade]} |`);
      }
      lines.push(``);
      lines.push(`**Topics reviewed:** ${s.contentReview.topicsReviewed}`);
      lines.push(`**High-confidence issues:** ${s.contentReview.highConfidenceIssues}`);
      if (s.contentReview.lastReviewTimestamp) {
        lines.push(`**Last review:** ${s.contentReview.lastReviewTimestamp}`);
      }
      lines.push(``);

      // Worst topics
      if (s.contentReview.worstTopics.length > 0) {
        lines.push(`### Worst Topics`);
        lines.push(``);
        lines.push(`| Topic | Discipline | Grade | Top Issues |`);
        lines.push(`|-------|-----------|-------|------------|`);
        for (const t of s.contentReview.worstTopics) {
          lines.push(`| ${t.topicId} | ${t.discipline} | ${t.grade} | ${t.topFindings.join("; ")} |`);
        }
        lines.push(``);
      }

      // Recurring issues
      if (s.contentReview.topRecurringIssues.length > 0) {
        lines.push(`### Recurring Issues`);
        lines.push(``);
        lines.push(`| Criterion | Count | Severity |`);
        lines.push(`|-----------|-------|----------|`);
        for (const i of s.contentReview.topRecurringIssues) {
          lines.push(`| ${i.criterion} | ${i.count} | ${i.severity} |`);
        }
        lines.push(``);
      }
    }

    lines.push(renderItems(s.contentReview.items));
    lines.push(``);
  }

  // Section 9: Assessment Health
  if (s.assessmentHealth) {
    lines.push(`## 9. Assessment Health ${statusIcon(s.assessmentHealth.status)}`);
    lines.push(``);
    lines.push(`**Assessable topics (with standard code):** ${s.assessmentHealth.topicsWithStandardCode}/${s.assessmentHealth.totalTopics} (${s.assessmentHealth.standardCodePct}%)`);
    lines.push(`**Unique standards covered:** ${s.assessmentHealth.uniqueStandards}`);
    lines.push(`**Avg topics per standard:** ${s.assessmentHealth.topicsPerStandardAvg}`);
    lines.push(``);
    lines.push(renderItems(s.assessmentHealth.items));
    lines.push(``);
  }

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
  if (s.contentQuality.staleDeployCount > 0) {
    recs.push(`${s.contentQuality.staleDeployCount} stale deploy(s) — run \`just deploy-content\` to update bundles`);
  }
  if (s.contentEffectiveness.status === "pending") {
    recs.push(`Content effectiveness data pending — deploy and collect user data, then run \`just audit --live\``);
  }
  if (s.contentEffectiveness.strugglingTopics.length > 3) {
    recs.push(`${s.contentEffectiveness.strugglingTopics.length} struggling topics — investigate with \`/content-health\``);
  }

  if (s.contentReview?.status === "pending") {
    recs.push(`Content review pending — run \`/content-review\` in Claude Code to evaluate content quality`);
  }
  if (s.contentReview && s.contentReview.worstTopics.length > 0) {
    recs.push(`${s.contentReview.worstTopics.length} topics graded D/F — review findings and run \`/generate-content\` to fix`);
  }

  if (s.assessmentHealth && s.assessmentHealth.standardCodePct < 50) {
    recs.push(`Only ${s.assessmentHealth.standardCodePct}% of topics have standard codes — add standardCode to graph.json topics to enable assessment scoping`);
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
