// === API Types ===

export type Subject = {
  id: string;
  name: string;
  description: string;
  gradeRange: string;
  topicCount: number;
};

export type Topic = {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  depth: number;
  gradeLevel: number;
  standardCode: string | null;
};

export type Prerequisite = {
  fromTopicId: string;
  toTopicId: string;
  strength: number; // 0-1: how essential is this prereq
};

export type Encompassing = {
  parentTopicId: string;
  childTopicId: string;
  weight: number; // 0-1: how much practicing parent helps child
};

// === User Types ===

export type UserTopicState = {
  userId: string;
  topicId: string;
  stability: number;
  difficulty: number;
  due: string;
  state: number; // FSRS state enum
  reps: number;
  lapses: number;
  mastered: boolean;
  frontier: boolean;
  confidenceAccuracy: number | null;
  lastReview: string | null;
};

export type ReviewLog = {
  id: string;
  userId: string;
  topicId: string;
  rating: number;
  confidence: number | null;
  correct: boolean;
  responseMs: number;
  phase: SessionPhase;
  createdAt: string;
};

export type SessionPhase =
  | "pretest"
  | "instruction"
  | "guided"
  | "independent"
  | "review"
  | "remediation";

export type Session = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  topicsAttempted: number;
  topicsMastered: number;
  reviewsCompleted: number;
  averageAccuracy: number | null;
};

export type LLMUsage = {
  id: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  purpose: string;
  createdAt: string;
};

// === API Request/Response Types ===

export type FrontierResponse = {
  topics: Topic[];
  totalMastered: number;
  totalTopics: number;
};

export type SessionMix = {
  reviewTopics: { topicId: string; due: string }[];
  newTopics: { topicId: string; depth: number }[];
};

export type ProblemDifficulty = "easy" | "medium" | "hard";

export type AssessmentType =
  | "text-qa"
  | "numerical-input"
  | "multi-step"
  | "matching"
  | "multi-select"
  | "equation-builder";

export type NumericalInputProperties = {
  tolerance?: number;
  unit?: string;
};

export type MultiStepProperties = {
  steps: {
    question: string;
    answer: string;
    hints?: string[];
  }[];
};

export type MatchingProperties = {
  pairs: {
    left: string;
    right: string;
  }[];
};

export type MultiSelectProperties = {
  options: string[];
  correctIndices: number[];
};

export type TypeProperties =
  | NumericalInputProperties
  | MultiStepProperties
  | MatchingProperties
  | MultiSelectProperties
  | Record<string, unknown>;

export type Problem = {
  id: string;
  topicId: string;
  difficulty: ProblemDifficulty;
  question: string;
  answer: string;
  hints: string[];
  solution: string;
  type?: AssessmentType;
  typeProperties?: TypeProperties;
  visuals?: VisualAsset[];
};

export type ContentDimensions = {
  flavor: string;
  locale: string;
  presentation: string;
  version: number;
};

export type VisualAssetType =
  | "number-line"
  | "base-ten-blocks"
  | "fraction-bar"
  | "array-grid"
  | "place-value-chart";

export type NumberLineParams = {
  min: number;
  max: number;
  step?: number;
  highlights?: number[];
  jumps?: { from: number; to: number; label?: string }[];
};

export type BaseTenBlocksParams = {
  hundreds?: number;
  tens?: number;
  ones?: number;
};

export type FractionBarParams = {
  numerator: number;
  denominator: number;
  compare?: { numerator: number; denominator: number };
};

export type ArrayGridParams = {
  rows: number;
  cols: number;
  highlightRows?: number;
  highlightCols?: number;
};

export type PlaceValueChartParams = {
  digits: { place: string; value: number }[];
};

export type VisualAssetParams =
  | NumberLineParams
  | BaseTenBlocksParams
  | FractionBarParams
  | ArrayGridParams
  | PlaceValueChartParams;

export type VisualAsset = {
  type: VisualAssetType;
  params: VisualAssetParams;
  alt: string;
};

export type WorkedExample = {
  id: string;
  topicId: string;
  title: string;
  steps: WorkedExampleStep[];
  visuals?: VisualAsset[];
};

export type WorkedExampleStep = {
  subgoalLabel: string;
  instruction: string;
  work: string;
  explanation: string;
};

export type ConfidenceRating = 1 | 2 | 3 | 4 | 5;

// === Speech Settings ===

export type SpeechSettings = {
  ttsEnabled: boolean;
  ttsRate: number;
  ttsVoiceName: string | null;
  ttsAutoRead: boolean;
  sttEnabled: boolean;
};
