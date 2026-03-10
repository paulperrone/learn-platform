/**
 * Types for procedural problem generators.
 */

export type Difficulty = "easy" | "medium" | "hard";

export type Problem = {
  id: string;
  topicId: string;
  difficulty: Difficulty;
  question: string;
  answer: string;
  hints: string[];
  solution: string;
  cognitiveDemand: string;
  source: "generated";
};

export type GeneratorConfig = {
  topicId: string;
  subject: "math-foundations" | "math-middle";
  /** Number of problems per difficulty level */
  countPerDifficulty: { easy: number; medium: number; hard: number };
};

export type Generator = {
  topicId: string;
  generate: (difficulty: Difficulty, index: number, rng: SeededRng) => Problem;
};

/**
 * Seeded PRNG (Mulberry32) for reproducible problem generation.
 */
export type SeededRng = {
  /** Returns a float in [0, 1) */
  next: () => number;
  /** Returns an integer in [min, max] inclusive */
  int: (min: number, max: number) => number;
  /** Pick a random element from an array */
  pick: <T>(arr: T[]) => T;
  /** Shuffle an array (Fisher-Yates) */
  shuffle: <T>(arr: T[]) => T[];
};

export function createRng(seed: number): SeededRng {
  let state = seed | 0;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(arr: T[]): T {
    return arr[int(0, arr.length - 1)];
  }

  function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  return { next, int, pick, shuffle };
}
