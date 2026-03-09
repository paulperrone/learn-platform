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

export type SimulationConfig = {
  profile: LearnerProfile;
  subject: string;
  sessionCount: number;
  seed: number;
  /** Time between sessions in ms (default: 24 hours). Simple fixed interval. */
  sessionIntervalMs?: number;
  /** Advanced time schedule. Overrides sessionIntervalMs if provided. */
  timeSchedule?: TimeSchedule;
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
