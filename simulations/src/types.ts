/**
 * Simulation framework types.
 */

// --- Learner Profile ---

export type AbilityCurve = {
  /** Per-grade-level accuracy probability (0-1). Key is grade level. */
  [gradeLevel: number]: number;
};

export type MisconceptionEntry = {
  /** Specific topic IDs or "grade:N" patterns where ability drops sharply */
  target: string;
  /** Accuracy override (0-1) when this misconception applies */
  accuracy: number;
};

export type ConfidenceTendency = "overconfident" | "underconfident" | "calibrated";

export type LearnerProfile = {
  id: string;
  name: string;
  description: string;

  /** Simulated age (used for birthYear calculation) */
  age: number;

  /** Per-grade accuracy probabilities */
  abilityCurve: AbilityCurve;

  /** Mean response time in ms and standard deviation */
  responseSpeed: { meanMs: number; stddevMs: number };

  /** Probability of requesting hints per problem (0-1) */
  hintSeekingProbability: number;

  /** How confidence relates to actual performance */
  confidenceTendency: ConfidenceTendency;

  /** Topics or grade ranges where ability drops sharply */
  misconceptions: MisconceptionEntry[];

  /** Per-session learning gain: ability increases by this amount per N sessions */
  learningGain?: { abilityDeltaPerSession: number };

  /** Scheduling preset for non-daily practice patterns */
  scheduling?: {
    type: "daily" | "irregular" | "weekday" | "gap-and-return" | "burst" | "weekend-only" | "decay" | "completion-break";
    params?: Record<string, number>;
  };

  /** Subjects this profile works on. If omitted, uses the CLI --subject flag. */
  subjects?: string[];

  /** Per-subject ability curve overrides. Key is subject ID, value overrides abilityCurve for that subject. */
  subjectAbility?: Record<string, AbilityCurve>;
};

// --- Answer Result ---

export type AnswerResult = {
  correct: boolean;
  responseMs: number;
  confidence: number;
  hintsToRequest: number;
};

// --- Simulation Event ---

export type SimulationEvent = {
  tick: number;
  sessionNumber: number;
  phase: string;
  topicId: string | null;
  problemId: string | null;
  difficulty: string | null;
  cognitiveDemand: string | null;
  presentation: string | null;
  contentDepth: string | null;
  correct: boolean | null;
  confidence: number | null;
  hintsUsed: number | null;
  rating: number | null;
  stabilityBefore: number | null;
  stabilityAfter: number | null;
  difficultyBefore: number | null;
  difficultyAfter: number | null;
  masteredBefore: boolean | null;
  masteredAfter: boolean | null;
  frontierBefore: boolean | null;
  frontierAfter: boolean | null;
  rollingAccuracy: number | null;
  presentationWeights: Record<string, number> | null;
  remediationTarget: string | null;
  fireCreditApplied: boolean | null;
  fadingLevel: number | null;
  interleaveStrand: string | null;
};

// --- Session Summary ---

export type SessionSummary = {
  sessionNumber: number;
  day: number;
  topicsAttempted: string[];
  topicsMastered: string[];
  reviewsCompleted: number;
  newTopicsIntroduced: number;
  remediationsTriggered: number;
  averageAccuracy: number;
  presentationCenter: string | null;
  fireReviewsSkipped: number;
  fadingLevels: Record<string, number>;
  cognitiveDemandDistribution: Record<string, number>;
  errors: number;
};

// --- State Snapshot ---

export type TopicStateSnapshot = {
  topicId: string;
  stability: number;
  difficulty: number;
  due: string;
  state: number;
  reps: number;
  lapses: number;
  mastered: boolean;
  frontier: boolean;
  consecutiveCorrectReviews: number;
  consecutiveIncorrectReviews: number;
};

export type PresentationSnapshot = {
  centerLevel: string;
  primaryWeight: number;
  intermediateWeight: number;
  standardWeight: number;
  advancedWeight: number;
};

export type StateSnapshot = {
  sessionNumber: number;
  day: number;
  simulatedTime: string;
  masteryCount: number;
  masteryPercent: number;
  materializedMasteryCount: number;
  totalTopics: number;
  topicStates: TopicStateSnapshot[];
  presentation: PresentationSnapshot | null;
};

// --- Simulation Config ---

export type TimeSchedule = {
  /** Type of schedule: 'fixed' (same interval), 'weekdays' (skip weekends), 'variable' (custom per-session) */
  type: "fixed" | "weekdays" | "variable";
  /** Base interval in ms (used by 'fixed' and 'weekdays') */
  baseIntervalMs?: number;
  /** Per-session intervals in ms (used by 'variable') */
  intervals?: number[];
};

/** Diagnostic mode for FIRe isolation experiments (Phase 2.7). */
export type FIReMode = "both" | "credit-only" | "ordering-only" | "neither";

export type SimulationConfig = {
  profile: LearnerProfile;
  subject: string;
  /** All subjects to load into the simulation DB. Defaults to [subject]. */
  subjects?: string[];
  sessionCount: number;
  seed: number;
  /** Time between sessions in ms (default: 24 hours). Simple fixed interval. */
  sessionIntervalMs?: number;
  /** Advanced time schedule. Overrides sessionIntervalMs if provided. */
  timeSchedule?: TimeSchedule;
  /** Diagnostic: control FIRe credit and ordering independently. Default: "both". */
  fireMode?: FIReMode;
};

export type SimulationResult = {
  profileId: string;
  subject: string;
  sessionsCompleted: number;
  diagnosticQuestionsAsked: number;
  totalEvents: number;
  runDir: string;
  sessionSummaries: SessionSummary[];
};

/** Diagnostic result data saved after each simulation run */
export type DiagnosticRunResult = {
  profileId: string;
  questionsAsked: number;
  questionsCorrect: number;
  searchLow: number;
  searchHigh: number;
  phase: "search" | "refine";
  /** Topic estimates at end of diagnostic: topicId → P(mastery) */
  topicEstimates: Record<string, number>;
  /** Topic IDs identified as frontier */
  estimatedFrontier: string[];
  /** Materialized mastery: topic IDs the diagnostic considered mastered */
  masteredTopicIds: string[];
  /** Presentation distribution seeded by diagnostic */
  presentationDistribution: {
    centerLevel: string;
    primary: number;
    intermediate: number;
    standard: number;
    advanced: number;
  } | null;
  /** Per-question trace with grade levels */
  questionTrace: {
    questionNumber: number;
    topicId: string;
    gradeLevel: number;
    correct: boolean;
    searchLowAfter: number;
    searchHighAfter: number;
    phaseAfter: "search" | "refine";
  }[];
};

// --- Target System (Healing Loop) ---

export type TargetDirection = "higher_better" | "lower_better" | "in_range";

export type SignalSource = "engine" | "content" | "bridge";

export type TargetDefinition = {
  name: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  metric: string;
  target: number;
  tolerance: number;
  unit: "percent" | "count" | "ratio" | "bits" | "grade_levels";
  direction: TargetDirection;
  range_min?: number;
  range_max?: number;
  science_ref: string;
  rationale: string;
  source_files: string[];
  evaluation_profiles: string[];
  /** Whether this target is validated by simulations (engine), live data (content), or both (bridge) */
  signal_source: SignalSource;
};

export type RemediationExpectation = "none" | "low" | "moderate" | "high";

export type ProfileExpectation = {
  description: string;
  behavioral_signature: string;
  min_final_mastery: number;
  max_final_mastery: number;
  expected_frontier_grade: number;
  expected_presentation_center: string;
  expected_remediation_events: RemediationExpectation;
  mastery_growth_rate: number;
  difficulty_convergence_by: number;
  metrics?: Record<string, { target: number; tolerance: number; direction: TargetDirection }>;
};

export type ContentQualityTargets = {
  too_hard_threshold: { strong_profile_min_accuracy: number; min_attempts: number };
  too_easy_threshold: { all_profile_max_accuracy: number; min_attempts: number };
  difficulty_calibration: Record<string, { expected_min: number; expected_max: number }>;
};

export type TargetFile = {
  version: number;
  lastUpdated: string;
  lastUpdatedReason: string;
  systems: Record<string, TargetDefinition>;
  profile_expectations: Record<string, ProfileExpectation>;
  content_quality: ContentQualityTargets;
};

export type EvaluationStatus = "PASS" | "WARN" | "FAIL";

export type SystemEvaluationResult = {
  systemId: string;
  name: string;
  priority: "P0" | "P1" | "P2";
  status: EvaluationStatus;
  actual: number;
  target: number;
  tolerance: number;
  delta: number;
  direction: TargetDirection;
  unit: string;
  contributingProfiles: string[];
  investigationArea?: {
    files: string[];
    functions: string[];
    relevantEvents: string[];
  };
};

export type ProfileEvaluationResult = {
  profileId: string;
  metrics: Record<string, {
    actual: number;
    expected: number;
    tolerance: number;
    status: EvaluationStatus;
  }>;
  behavioralMatch: boolean;
  notes: string[];
};

export type ContentQualityResult = {
  tooHard: { topicId: string; strongAccuracy: number; allAccuracy: number }[];
  tooEasy: { topicId: string; accuracy: number }[];
  miscalibrated: { topicId: string; difficulty: string; expectedRange: [number, number]; actual: number }[];
};

export type MaturityLevel = "l1" | "l2" | "l3" | "l4" | "l5";

export type L3Metrics = {
  /** Session number where mastery % growth drops below 1% per session (0 = no plateau) */
  masteryPlateauSession: number;
  /** Content ceiling: final mastery % — is it capped by available content or system behavior? */
  masteryPlateauPercent: number;
  /** Average reviews per session in final third of sessions (trend indicator) */
  reviewsPerSessionFinalThird: number;
  /** Average reviews per session in first third (for trend comparison) */
  reviewsPerSessionFirstThird: number;
  /** Review scaling direction: "decreasing" | "stable" | "increasing" */
  reviewScalingTrend: string;
  /** Rolling accuracy in final third: should stay in [0.80, 0.90] if targeting works */
  difficultyTargetingStabilityFinalThird: number;
  /** Per-profile breakdown */
  perProfile: Record<string, {
    finalMastery: number;
    plateauSession: number;
    reviewTrend: string;
    reviewsFirstThird: number;
    reviewsFinalThird: number;
    finalAccuracy: number;
  }>;
};

export type HealingReport = {
  timestamp: string;
  targetVersion: number;
  maturityLevel?: MaturityLevel;
  sessionCount?: number;
  systems: SystemEvaluationResult[];
  profiles: ProfileEvaluationResult[];
  contentQuality: ContentQualityResult;
  l3Metrics?: L3Metrics;
  summary: {
    passCount: number;
    warnCount: number;
    failCount: number;
    overallStatus: EvaluationStatus;
  };
};

// --- Healing Loop Orchestrator ---

export type HealEpoch = {
  epochNumber: number;
  timestamp: string;
  simulationSeed: number;
  sessions: number;
  evaluationResult: HealingReport;
  systemsPassCount: number;
  systemsFailCount: number;
  systemsWarnCount: number;
  deltaFromPreviousEpoch: Record<string, number>;
  fixesApplied: string[];
  checkpointCommit?: string;
};

export type HealingHistoryStatus =
  | "running"
  | "converged"
  | "stalled"
  | "user_review_needed";

export type HealingHistory = {
  epochs: HealEpoch[];
  startedAt: string;
  targetVersion: number;
  currentStatus: HealingHistoryStatus;
};

export type ConvergenceState = {
  status: HealingHistoryStatus;
  reason: string;
  recommendedAction: string;
};

export type MiniSimResult = {
  system: string;
  profiles: string[];
  sessions: number;
  seed: number;
  before: { actual: number; status: EvaluationStatus };
  after: { actual: number; status: EvaluationStatus };
  improved: boolean;
  delta: number;
};
