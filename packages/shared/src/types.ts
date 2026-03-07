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
  | "remediation"
  | "diagnostic";

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

export type PresentationLevel = "primary" | "intermediate" | "standard" | "advanced";

export type ContentDepthLevel = "survey" | "contextual" | "analytical" | "synthesis";

export type BlendRole = "warmup" | "main" | "stretch";

export type ContentDimensions = {
  flavor: string;
  locale: string;
  presentation: PresentationLevel;
  contentDepth: ContentDepthLevel;
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

// === Account Link Types ===

export type AccountLinkType = "parent" | "teacher" | "tutor" | "guardian";
export type AccountLinkStatus = "active" | "pending" | "revoked";

export type AccountLink = {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: AccountLinkType;
  permissions: Record<string, boolean> | null;
  status: AccountLinkStatus;
  createdAt: string;
};

// === Org Types ===

export type OrgType = "family" | "school" | "tutoring";
export type OrgRole = "owner" | "admin" | "teacher" | "student";

// === Teach Data Types ===

export type TeachSession = {
  id: string;
  teacherId: string;
  topicId: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
};

export type Assignment = {
  id: string;
  teacherId: string;
  topicId: string;
  shareCode: string;
  title: string;
  description: string | null;
  maxProblems: number | null;
  createdAt: string;
  expiresAt: string | null;
};

export type AssignmentResponse = {
  id: string;
  assignmentId: string;
  userId: string | null;
  anonymousToken: string | null;
  questionId: string;
  answer: string;
  correct: boolean | null;
  createdAt: string;
};

// === Group Session Types ===

export type GroupSessionType = "family" | "classroom" | "peer-pair";
export type GroupSessionStatus = "active" | "completed";
export type GroupParticipantRole = "student" | "facilitator";

export type GroupSession = {
  id: string;
  facilitatorId: string;
  type: GroupSessionType;
  topicId: string | null;
  joinCode: string | null;
  status: GroupSessionStatus;
  startedAt: string;
  endedAt: string | null;
};

export type GroupSessionParticipant = {
  id: string;
  groupSessionId: string;
  userId: string | null;
  anonymousToken: string | null;
  displayName: string | null;
  role: GroupParticipantRole;
  currentTopicId: string | null;
  currentPhase: string | null;
  totalCorrect: number;
  totalAttempts: number;
  joinedAt: string;
  leftAt: string | null;
};

export type GroupSessionDashboard = {
  session: GroupSession;
  participants: (GroupSessionParticipant & { topicName?: string })[];
  suggestedTopics?: { id: string; name: string; reason: string }[];
};

export type PeerPairState = {
  studentA: string;
  studentB: string;
  currentStep: number;
  currentTurn: string; // userId of active student
  problem: Problem | null;
};

// === Speech Settings ===

export type SpeechSettings = {
  ttsEnabled: boolean;
  ttsRate: number;
  ttsVoiceName: string | null;
  ttsAutoRead: boolean;
  sttEnabled: boolean;
};

// === Diagnostic Types ===

export type DiagnosticSession = {
  id: string;
  userId: string | null;
  anonymousToken: string | null;
  subjectId: string;
  status: "active" | "completed";
  questionsAsked: number;
  questionsCorrect: number;
  estimatedFrontier: string[] | null;
  isTaste: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type DiagnosticResult = {
  sessionId: string;
  questionsAsked: number;
  questionsCorrect: number;
  estimatedLevel: string;
  estimatedFrontier: string[];
  topicEstimates: Record<string, number>;
};

// === Onboarding Types ===

export type OnboardingStep = 0 | 1 | 2 | 3 | 4;

export type OnboardingState = {
  userId: string;
  step: OnboardingStep;
  diagnosticSessionId: string | null;
  completedAt: string | null;
};
