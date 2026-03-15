/**
 * Audit report types — structured schema for the unified `just audit` report.
 *
 * 8 sections: Graph Integrity, Content Quality, Simulation Results,
 * Content Effectiveness, LLM Tracking, Media Readiness, Multi-Discipline Coverage,
 * Content Review.
 */

// ── Status types ──

export type ItemStatus = "pass" | "warn" | "fail" | "info" | "pending";

export type StatusItem = {
  label: string;
  status: ItemStatus;
  value?: string | number;
  target?: string | number;
  detail?: string;
};

// ── Section 1: Graph Integrity ──

export type GraphIntegritySection = {
  status: ItemStatus;
  items: StatusItem[];
  topicCount: number;
  prerequisiteCount: number;
  encompassingCount: number;
  prereqDensity: number;
  encompassingDensity: number;
  dagValid: boolean;
  cycleCount: number;
  orphanCount: number;
  bottlenecks: { topicId: string; downstreamCount: number }[];
  maxDepth: number;
  fireReadiness: string; // "GOOD" | "PARTIAL" | "LOW"
  edgeTypes: { required: number; recommended: number; enriching: number };
  progressionModel: string;
};

// ── R2 Manifest Data ──

export type ManifestSummary = {
  topicId: string;
  discipline: string;
  problemCount: number;
  exampleCount: number;
  contentHash: string;
  generatedAt: string;
  dimensions: {
    presentations: string[];
    depths: string[];
    locales: string[];
    flavors: string[];
  };
  difficulties: Record<string, number>;
  demands: Record<string, number>;
  types: Record<string, number>;
};

export type DimensionCoverage = {
  presentation: Record<string, number>; // presentation level → topic count
  depth: Record<string, number>;
  locale: Record<string, number>;
  flavor: Record<string, number>;
};

export type ContentVersionStatus = {
  topicId: string;
  discipline: string;
  bundleExists: boolean;
  sourceModified: string | null; // ISO date of source file mtime
  bundleGenerated: string | null; // from manifest generatedAt
  stale: boolean; // source newer than bundle
};

// ── Section 2: Content Quality ──

export type HealthDistribution = {
  below50: number;
  below70: number;
  above70: number;
  average: number;
};

export type ContentQualitySection = {
  status: ItemStatus;
  items: StatusItem[];
  totalProblems: number;
  totalExamples: number;
  topicsWithProblems: number;
  topicsWithExamples: number;
  totalTopics: number;
  healthDistribution: HealthDistribution;
  gapSummary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topGaps: { topicId: string; gapType: string; impact: number; priority: string }[];
  demandDiversity: number; // average across topics
  // Lesson coverage (lessons use worked examples; same as topicsWithExamples)
  lessonCoverage: { topicsWithLessons: number; totalTopics: number; pct: number };
  // R2 manifest data (populated when bundles exist)
  dimensionCoverage: DimensionCoverage | null;
  manifestCount: number;
  staleDeployCount: number;
  contentVersions: ContentVersionStatus[];
};

// ── Section 3: Simulation Results ──

export type SimulationSystem = {
  systemId: string;
  name: string;
  status: "PASS" | "FAIL";
  actual: number;
  target: number;
  tolerance: number;
  priority: string;
  unit: string;
};

export type SimulationResultsSection = {
  status: ItemStatus;
  items: StatusItem[];
  evaluationTimestamp: string | null;
  targetVersion: number | null;
  maturityLevel: string | null;
  systems: SimulationSystem[];
  passCount: number;
  failCount: number;
};

// ── Section 4: Content Effectiveness (live only) ──

export type ContentEffectivenessSection = {
  status: ItemStatus;
  items: StatusItem[];
  mode: "offline" | "live";
  // Live data (null in offline mode)
  overallAccuracy: number | null;
  topicAccuracyRange: { min: number; max: number } | null;
  difficultySpikeCount: number | null;
  hintEscalationRate: number | null;
  // Live stats
  totalUsers: number | null;
  totalReviews: number | null;
  strugglingTopics: { topicId: string; accuracy: number; attempts: number }[];
};

// ── Section 5: LLM Tracking ──

export type LLMTrackingSection = {
  status: ItemStatus;
  items: StatusItem[];
  instrumentation: {
    llmUsageTopicId: boolean;
    llmUsageProblemId: boolean;
    reviewLogLlmAssisted: boolean;
    reviewLogHintSource: boolean;
    aeBlob13LlmAssisted: boolean;
  };
  instrumentationComplete: boolean;
  // Live data (null in offline mode)
  totalCost: number | null;
  totalCalls: number | null;
  llmAccuracyDelta: number | null;
};

// ── Section 6: Media Readiness ──

export type MediaReadinessSection = {
  status: ItemStatus;
  items: StatusItem[];
  visualComponents: { type: string; count: number }[];
  totalMediaReferences: number;
  topicsWithMedia: number;
};

// ── Section 7: Multi-Discipline Coverage ──

export type DisciplineSummary = {
  disciplineId: string;
  name: string;
  progressionModel: string;
  topicCount: number;
  problemCount: number;
  exampleCount: number;
  prereqDensity: number;
  encompassingDensity: number;
  collectionCount: number;
  contentComplete: boolean; // all topics have problems + examples
};

export type MultiDisciplineSection = {
  status: ItemStatus;
  items: StatusItem[];
  disciplines: DisciplineSummary[];
  totalTopics: number;
  totalProblems: number;
  totalExamples: number;
};

// ── Section 8: Content Review ──

export type ContentReviewSection = {
  status: ItemStatus;
  items: StatusItem[];
  topicsReviewed: number;
  gradeDistribution: Record<string, number>;
  highConfidenceIssues: number;
  worstTopics: { topicId: string; discipline: string; grade: string; topFindings: string[] }[];
  topRecurringIssues: { criterion: string; count: number; severity: string }[];
  lastReviewTimestamp: string | null;
};

// ── Section 9: Assessment Health ──

export type AssessmentHealthSection = {
  status: ItemStatus;
  items: StatusItem[];
  topicsWithStandardCode: number;
  totalTopics: number;
  standardCodePct: number;
  uniqueStandards: number;
  topicsPerStandardAvg: number;
};

// ── Thresholds ──

export type ThresholdLevel = { warn: number; fail: number };

export type AuditThresholds = {
  graph: {
    prereqDensityMin: ThresholdLevel;
    encompassingDensityMin: ThresholdLevel;
    bottleneckMax: ThresholdLevel;
  };
  content: {
    healthScoreMin: ThresholdLevel;
    problemsPerTopicMin: ThresholdLevel;
    demandDiversityMin: ThresholdLevel;
  };
  simulation: {
    masteryConvergenceMin: ThresholdLevel;
    difficultyTargetingMin: ThresholdLevel;
  };
  live: {
    topicAccuracyMin: ThresholdLevel;
    hintRateMax: ThresholdLevel;
    difficultySpikeDeltaMax: ThresholdLevel;
  };
  llm: {
    llmAccuracyDeltaMin: ThresholdLevel;
  };
};

// ── Effectiveness Rollup ──

export type EffectivenessRollup = {
  timestamp: string;
  period: { from: string; to: string };
  topics: {
    topicId: string;
    accuracy: number;
    hintRate: number;
    avgResponseTime: number;
    attempts: number;
    contentVersion: string | null;
  }[];
  overall: {
    accuracy: number;
    hintRate: number;
    avgResponseTime: number;
    totalAttempts: number;
  };
};

// ── Audit Comparison ──

export type AuditDelta = {
  previousTimestamp: string;
  sectionDeltas: {
    section: string;
    previousStatus: ItemStatus;
    currentStatus: ItemStatus;
    trend: "improved" | "regressed" | "unchanged";
    details: string[];
  }[];
  summary: { improved: number; regressed: number; unchanged: number };
};

// ── Overall Report ──

export type AuditReport = {
  metadata: {
    timestamp: string;
    mode: "offline" | "live";
    contentDir: string;
    platformVersion: string;
    auditVersion: number;
    thresholdsFile?: string;
  };
  overallStatus: ItemStatus;
  summary: {
    passCount: number;
    warnCount: number;
    failCount: number;
    pendingCount: number;
  };
  sections: {
    graphIntegrity: GraphIntegritySection;
    contentQuality: ContentQualitySection;
    simulationResults: SimulationResultsSection;
    contentEffectiveness: ContentEffectivenessSection;
    llmTracking: LLMTrackingSection;
    mediaReadiness: MediaReadinessSection;
    multiDiscipline: MultiDisciplineSection;
    contentReview: ContentReviewSection;
    assessmentHealth: AssessmentHealthSection;
  };
  delta?: AuditDelta;
};
