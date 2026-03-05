import { describe, it, expect } from "vitest";
import { gradeProblem } from "../../services/grading.js";
import type { Problem } from "@learn/shared";

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: "test-1",
    topicId: "topic-1",
    difficulty: "medium",
    question: "What is 2 + 2?",
    answer: "4",
    hints: [],
    solution: "2 + 2 = 4",
    ...overrides,
  };
}

describe("gradeProblem", () => {
  describe("text-qa", () => {
    it("grades correct text answer", () => {
      const result = gradeProblem(makeProblem(), "4");
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1);
    });

    it("grades incorrect text answer", () => {
      const result = gradeProblem(makeProblem(), "5");
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0);
    });

    it("normalizes whitespace and case", () => {
      const result = gradeProblem(makeProblem({ answer: "Hello World" }), "  hello   world  ");
      expect(result.correct).toBe(true);
    });

    it("defaults to text-qa when type is undefined", () => {
      const result = gradeProblem(makeProblem({ type: undefined }), "4");
      expect(result.correct).toBe(true);
    });
  });

  describe("numerical-input", () => {
    it("grades exact numeric match", () => {
      const result = gradeProblem(
        makeProblem({ type: "numerical-input", answer: "42" }),
        "42"
      );
      expect(result.correct).toBe(true);
    });

    it("grades with tolerance", () => {
      const result = gradeProblem(
        makeProblem({
          type: "numerical-input",
          answer: "3.14",
          typeProperties: { tolerance: 0.01 },
        }),
        "3.14159"
      );
      // |3.14 - 3.14159| = 0.00159, within 0.01 tolerance
      expect(result.correct).toBe(true);

      const result2 = gradeProblem(
        makeProblem({
          type: "numerical-input",
          answer: "3.14",
          typeProperties: { tolerance: 0.001 },
        }),
        "3.16"
      );
      // |3.14 - 3.16| = 0.02, exceeds 0.001 tolerance
      expect(result2.correct).toBe(false);
    });

    it("rejects non-numeric input", () => {
      const result = gradeProblem(
        makeProblem({ type: "numerical-input", answer: "42" }),
        "abc"
      );
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("multi-step", () => {
    const multiStepProblem = makeProblem({
      type: "multi-step",
      typeProperties: {
        steps: [
          { question: "Step 1: What is 2+2?", answer: "4" },
          { question: "Step 2: What is 4+3?", answer: "7" },
          { question: "Step 3: What is 7*2?", answer: "14" },
        ],
      },
    });

    it("grades all correct steps", () => {
      const result = gradeProblem(multiStepProblem, JSON.stringify(["4", "7", "14"]));
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1);
    });

    it("gives partial credit", () => {
      const result = gradeProblem(multiStepProblem, JSON.stringify(["4", "8", "14"]));
      expect(result.correct).toBe(false);
      expect(result.score).toBeCloseTo(2 / 3);
      expect(result.details).toBe("2/3 steps correct");
    });

    it("handles invalid JSON", () => {
      const result = gradeProblem(multiStepProblem, "not json");
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("matching", () => {
    const matchingProblem = makeProblem({
      type: "matching",
      typeProperties: {
        pairs: [
          { left: "cat", right: "animal" },
          { left: "rose", right: "flower" },
          { left: "oak", right: "tree" },
        ],
      },
    });

    it("grades all correct matches", () => {
      const answer = JSON.stringify([
        { left: "cat", selected: "animal" },
        { left: "rose", selected: "flower" },
        { left: "oak", selected: "tree" },
      ]);
      const result = gradeProblem(matchingProblem, answer);
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1);
    });

    it("gives partial credit for partial matches", () => {
      const answer = JSON.stringify([
        { left: "cat", selected: "animal" },
        { left: "rose", selected: "tree" },
        { left: "oak", selected: "flower" },
      ]);
      const result = gradeProblem(matchingProblem, answer);
      expect(result.correct).toBe(false);
      expect(result.score).toBeCloseTo(1 / 3);
    });
  });

  describe("multi-select", () => {
    const multiSelectProblem = makeProblem({
      type: "multi-select",
      typeProperties: {
        options: ["Mercury", "Venus", "Earth", "Mars"],
        correctIndices: [0, 2, 3],
      },
    });

    it("grades all correct selections", () => {
      const result = gradeProblem(multiSelectProblem, JSON.stringify([0, 2, 3]));
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1);
    });

    it("gives partial credit for subset", () => {
      const result = gradeProblem(multiSelectProblem, JSON.stringify([0, 3]));
      expect(result.correct).toBe(false);
      expect(result.score).toBeCloseTo(2 / 3);
    });

    it("penalizes wrong selections", () => {
      const result = gradeProblem(multiSelectProblem, JSON.stringify([0, 1, 2, 3]));
      expect(result.correct).toBe(false);
      // 3 hits - 1 miss = 2/3
      expect(result.score).toBeCloseTo(2 / 3);
    });

    it("handles no selections", () => {
      const result = gradeProblem(multiSelectProblem, JSON.stringify([]));
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});
