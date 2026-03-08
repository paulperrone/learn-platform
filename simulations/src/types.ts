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

// --- Simulation Config ---

export type SimulationConfig = {
  profile: LearnerProfile;
  subject: string;
  sessionCount: number;
  seed: number;
  /** Time between sessions in ms (default: 24 hours) */
  sessionIntervalMs?: number;
};

export type SimulationResult = {
  profileId: string;
  subject: string;
  sessionsCompleted: number;
  diagnosticQuestionsAsked: number;
  totalEvents: number;
  runDir: string;
};
