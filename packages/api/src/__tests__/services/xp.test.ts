import { describe, it, expect } from "vitest";
import {
  computeProblemXP,
  detectRushing,
  computeSessionBonus,
  computeSessionXP,
  estimateTopicXP,
  LESSON_COMPLETE_XP,
} from "../../services/xp.js";

describe("computeProblemXP", () => {
  it("returns 3 XP for lesson phase", () => {
    expect(computeProblemXP({ phase: "lesson", correct: true })).toBe(3);
  });

  it("returns 5 XP for review phase", () => {
    expect(computeProblemXP({ phase: "review", correct: true })).toBe(5);
  });

  it("returns 4 XP for remediation phase", () => {
    expect(computeProblemXP({ phase: "remediation", correct: true })).toBe(4);
  });

  it("returns 5 XP for diagnostic/other phases", () => {
    expect(computeProblemXP({ phase: "diagnostic", correct: true })).toBe(5);
  });

  it("returns 2 XP for worked examples", () => {
    expect(computeProblemXP({ phase: "lesson", correct: true, isExample: true })).toBe(2);
  });

  it("gives same base XP regardless of correctness", () => {
    expect(computeProblemXP({ phase: "review", correct: false })).toBe(5);
  });

  it("lesson complete XP constant is 5", () => {
    expect(LESSON_COMPLETE_XP).toBe(5);
  });
});

describe("detectRushing", () => {
  it("detects rushing when response < 3s", () => {
    expect(detectRushing({ responseMs: 1500 })).toBe(true);
  });

  it("does not flag responses >= 3s", () => {
    expect(detectRushing({ responseMs: 3000 })).toBe(false);
    expect(detectRushing({ responseMs: 5000 })).toBe(false);
  });

  it("does not flag trivial problems even if fast", () => {
    expect(detectRushing({ responseMs: 500, trivial: true })).toBe(false);
  });
});

describe("computeSessionBonus", () => {
  it("returns +0.2 for perfect session (all correct, no hints)", () => {
    const results = [
      { correct: true, hintsUsed: 0 },
      { correct: true, hintsUsed: 0 },
      { correct: true, hintsUsed: 0 },
    ];
    expect(computeSessionBonus(results)).toBe(0.2);
  });

  it("returns 0 for all correct with hints", () => {
    const results = [
      { correct: true, hintsUsed: 1 },
      { correct: true, hintsUsed: 0 },
    ];
    expect(computeSessionBonus(results)).toBe(0);
  });

  it("returns -0.2 for >=75% accuracy", () => {
    const results = [
      { correct: true, hintsUsed: 0 },
      { correct: true, hintsUsed: 0 },
      { correct: true, hintsUsed: 0 },
      { correct: false, hintsUsed: 0 },
    ];
    expect(computeSessionBonus(results)).toBe(-0.2);
  });

  it("returns -0.5 for >=50% accuracy", () => {
    const results = [
      { correct: true, hintsUsed: 0 },
      { correct: false, hintsUsed: 0 },
    ];
    expect(computeSessionBonus(results)).toBe(-0.5);
  });

  it("returns -0.8 for <50% accuracy", () => {
    const results = [
      { correct: true, hintsUsed: 0 },
      { correct: false, hintsUsed: 0 },
      { correct: false, hintsUsed: 0 },
      { correct: false, hintsUsed: 0 },
    ];
    expect(computeSessionBonus(results)).toBe(-0.8);
  });

  it("returns 0 for empty session", () => {
    expect(computeSessionBonus([])).toBe(0);
  });
});

describe("computeSessionXP", () => {
  it("computes XP for a perfect review session", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "review", correct: true, responseMs: 5000, hintsUsed: 0 },
        { phase: "review", correct: true, responseMs: 4000, hintsUsed: 0 },
        { phase: "review", correct: true, responseMs: 6000, hintsUsed: 0 },
      ],
    });
    // base: 5+5+5 = 15, bonus: ×1.2 → 18, no rushing
    expect(result.baseTotal).toBe(15);
    expect(result.bonusMultiplier).toBe(0.2);
    expect(result.rushingPenalty).toBe(0);
    expect(result.totalXP).toBe(18);
  });

  it("applies rushing penalty", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "review", correct: true, responseMs: 1000, hintsUsed: 0 },
        { phase: "review", correct: true, responseMs: 5000, hintsUsed: 0 },
      ],
    });
    // base: 5+5 = 10, bonus: ×1.2 → 12, rushing: -1
    expect(result.rushingPenalty).toBe(1);
    expect(result.totalXP).toBe(11);
  });

  it("never goes below 0", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "lesson", correct: false, responseMs: 500, hintsUsed: 0 },
      ],
    });
    // base: 3, bonus: ×0.2 → 0.6, rushing: -1 → -0.4 → clamped to 0
    expect(result.totalXP).toBe(0);
  });

  it("handles empty session", () => {
    const result = computeSessionXP({ problemResults: [] });
    expect(result.totalXP).toBe(0);
    expect(result.problemXPs).toEqual([]);
  });

  it("handles mixed phases", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "lesson", correct: true, responseMs: 5000, hintsUsed: 0 },
        { phase: "review", correct: true, responseMs: 4000, hintsUsed: 0 },
        { phase: "remediation", correct: false, responseMs: 8000, hintsUsed: 0 },
      ],
    });
    // base: 3+5+4 = 12, accuracy 66% → ×0.5 bonus → 6, no rushing
    expect(result.baseTotal).toBe(12);
    expect(result.bonusMultiplier).toBe(-0.5);
    expect(result.totalXP).toBe(6);
  });

  it("does not penalize rushing on trivial problems", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "review", correct: true, responseMs: 500, hintsUsed: 0, trivial: true },
        { phase: "review", correct: true, responseMs: 5000, hintsUsed: 0 },
      ],
    });
    expect(result.rushingPenalty).toBe(0);
    expect(result.totalXP).toBe(12); // 10 × 1.2
  });

  it("all wrong gives minimal XP", () => {
    const result = computeSessionXP({
      problemResults: [
        { phase: "review", correct: false, responseMs: 5000, hintsUsed: 0 },
        { phase: "review", correct: false, responseMs: 4000, hintsUsed: 0 },
        { phase: "review", correct: false, responseMs: 6000, hintsUsed: 0 },
      ],
    });
    // base: 15, bonus: ×0.2 → 3
    expect(result.totalXP).toBe(3);
  });
});

describe("estimateTopicXP", () => {
  it("returns 25 XP for review topics (5 problems x 5 XP)", () => {
    expect(estimateTopicXP(true)).toBe(25);
  });

  it("returns 25 XP for new topics (5 problems x 5 XP)", () => {
    expect(estimateTopicXP(false)).toBe(25);
  });
});
