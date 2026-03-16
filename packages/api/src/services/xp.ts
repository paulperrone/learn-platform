import type { SessionPhase } from "@learn/shared";

// === Base XP per item type ===

const BASE_XP: Record<string, number> = {
  lesson: 3,
  independent: 5,
  review: 5,
  remediation: 4,
  example: 2,
  lessonComplete: 5,
};

// === Rushing detection ===

const RUSHING_THRESHOLD_MS = 3000;
const RUSHING_PENALTY = 1;

export type ProblemXPParams = {
  phase: SessionPhase;
  correct: boolean;
  isExample?: boolean;
};

export type SessionResult = {
  correct: boolean;
  hintsUsed: number;
};

export type ResponseTiming = {
  responseMs: number;
  trivial?: boolean; // e.g., single-tap problems that are expected to be fast
};

export function computeProblemXP(params: ProblemXPParams): number {
  if (params.isExample) return BASE_XP.example;

  switch (params.phase) {
    case "lesson":
      return BASE_XP.lesson;
    case "review":
      return BASE_XP.review;
    case "remediation":
      return BASE_XP.remediation;
    default:
      // independent, diagnostic, pretest, instruction (legacy)
      return BASE_XP.independent;
  }
}

export function detectRushing(timing: ResponseTiming): boolean {
  if (timing.trivial) return false;
  return timing.responseMs < RUSHING_THRESHOLD_MS;
}

export function computeSessionBonus(results: SessionResult[]): number {
  if (results.length === 0) return 0;

  const correctCount = results.filter((r) => r.correct).length;
  const accuracy = correctCount / results.length;
  const anyHints = results.some((r) => r.hintsUsed > 0);

  let multiplier: number;
  if (accuracy === 1 && !anyHints) {
    multiplier = 0.2; // perfect bonus: ×1.2 total → 0.2 extra
  } else if (accuracy === 1) {
    multiplier = 0; // all correct with hints: ×1.0 → no bonus
  } else if (accuracy >= 0.75) {
    multiplier = -0.2; // ×0.8
  } else if (accuracy >= 0.5) {
    multiplier = -0.5; // ×0.5
  } else {
    multiplier = -0.8; // ×0.2
  }

  return multiplier;
}

export type SessionXPInput = {
  problemResults: Array<{
    phase: SessionPhase;
    correct: boolean;
    responseMs: number;
    hintsUsed: number;
    isExample?: boolean;
    trivial?: boolean;
  }>;
};

export type SessionXPResult = {
  problemXPs: number[];
  baseTotal: number;
  bonusMultiplier: number;
  rushingPenalty: number;
  totalXP: number;
};

export function computeSessionXP(input: SessionXPInput): SessionXPResult {
  const problemXPs: number[] = [];
  let rushingPenalty = 0;

  for (const r of input.problemResults) {
    const xp = computeProblemXP({
      phase: r.phase,
      correct: r.correct,
      isExample: r.isExample,
    });
    problemXPs.push(xp);

    if (detectRushing({ responseMs: r.responseMs, trivial: r.trivial })) {
      rushingPenalty += RUSHING_PENALTY;
    }
  }

  const baseTotal = problemXPs.reduce((sum, xp) => sum + xp, 0);
  const bonusMultiplier = computeSessionBonus(
    input.problemResults.map((r) => ({ correct: r.correct, hintsUsed: r.hintsUsed }))
  );

  const totalXP = Math.max(0, Math.round(baseTotal * (1 + bonusMultiplier) - rushingPenalty));

  return {
    problemXPs,
    baseTotal,
    bonusMultiplier,
    rushingPenalty,
    totalXP,
  };
}

export const LESSON_COMPLETE_XP = BASE_XP.lessonComplete;

// Average problems per topic session (for XP estimates in queue)
const TYPICAL_PROBLEMS_PER_SESSION = 5;

/**
 * Estimate XP for a topic session (used in queue preview).
 * Assumes typical performance (no bonus/penalty).
 */
export function estimateTopicXP(isReview: boolean): number {
  const basePerProblem = isReview ? BASE_XP.review : BASE_XP.independent;
  return TYPICAL_PROBLEMS_PER_SESSION * basePerProblem;
}
