/**
 * Types for the LLM content review system.
 */

export type ReviewStatus = "pass" | "warn" | "error" | "skip";
export type ReviewConfidence = "high" | "low";
export type OverallGrade = "A" | "B" | "C" | "D" | "F";

export type ReviewFinding = {
  criterion: string;
  status: ReviewStatus;
  detail: string;
  evidence?: string;
  problemId?: string;
  confidence?: ReviewConfidence;
};

export type TopicReview = {
  topicId: string;
  discipline: string;
  timestamp: string;
  findings: ReviewFinding[];
  overallGrade: OverallGrade;
  summary: string;
  contentHash: string;
};

export type TopicReviewCache = {
  contentHash: string;
  reviews: TopicReview[];
};

export type ReviewReport = {
  timestamp: string;
  discipline: string | "all";
  topicsReviewed: number;
  gradeDistribution: Record<OverallGrade, number>;
  highConfidenceFindings: number;
  lowConfidenceFindings: number;
  topicReviews: TopicReview[];
};

export type TopicContext = {
  topicId: string;
  discipline: string;
  name: string;
  description: string;
  strand: string;
  gradeLevel: number;
  progressionModel: string;
  prerequisites: { id: string; name: string; description: string; type: string }[];
  encompassingEdges: { parentId: string; childId: string; weight: number }[];
  problems: any[];
  examples: any[];
  defaultPresentation: string;
  contentDepth: string;
  contentHash: string;
};
