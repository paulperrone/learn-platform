/**
 * Analytics Engine service — records rich per-problem/per-example events
 * to Cloudflare Analytics Engine for content effectiveness tracking.
 *
 * Gracefully degrades when AE binding is unavailable (local dev, simulations).
 */

// ── Event types ──

export type ProblemAttemptEvent = {
  userId: string;
  topicId: string;
  problemId: string;
  contentVersion: string | null;
  phase: string;
  difficulty: string;
  cognitiveDemand: string;
  presentation: string;
  contentDepth: string;
  disciplineId: string;
  blendRole: string;
  difficultyBias: string;
  llmAssisted: boolean;
  correct: boolean;
  responseMs: number;
  hintsUsed: number;
  confidence: number;
  rating: number;
  misconception: boolean;
};

export type ExampleViewEvent = {
  userId: string;
  topicId: string;
  exampleId: string;
  contentVersion: string | null;
  presentation: string;
  contentDepth: string;
  stepsViewed: number;
  totalSteps: number;
  totalTimeMs: number;
  fadingLevel: number;
  selfExplanationQuality: number;
};

// ── Service factory ──

export function createAnalyticsService(ae: AnalyticsEngineDataset | null | undefined) {
  return {
    recordProblemAttempt(event: ProblemAttemptEvent): void {
      if (!ae) return;
      ae.writeDataPoint({
        blobs: [
          event.userId,
          event.topicId,
          event.problemId,
          event.contentVersion ?? "",
          event.phase,
          event.difficulty,
          event.cognitiveDemand,
          event.presentation,
          event.contentDepth,
          event.disciplineId,
          event.blendRole,
          event.difficultyBias,
          event.llmAssisted ? "true" : "false",
        ],
        doubles: [
          event.correct ? 1 : 0,
          event.responseMs,
          event.hintsUsed,
          event.confidence,
          event.rating,
          event.misconception ? 1 : 0,
        ],
        indexes: [event.topicId],
      });
    },

    recordExampleView(event: ExampleViewEvent): void {
      if (!ae) return;
      ae.writeDataPoint({
        blobs: [
          event.userId,
          event.topicId,
          event.exampleId,
          event.contentVersion ?? "",
          event.presentation,
          event.contentDepth,
          "example-view",
        ],
        doubles: [
          event.stepsViewed,
          event.totalSteps,
          event.totalTimeMs,
          event.fadingLevel,
          event.selfExplanationQuality,
        ],
        indexes: [event.topicId],
      });
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
