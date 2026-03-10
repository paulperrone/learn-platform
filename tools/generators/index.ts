/**
 * Generator registry — maps topic IDs to their generators.
 */
import type { Generator } from "./types.js";
import { k5ArithmeticGenerators } from "./k5-arithmetic.js";
import { k5NumberGenerators } from "./k5-numbers.js";
import { k5FractionDecimalGenerators } from "./k5-fractions.js";
import { middleRationalGenerators } from "./middle-rational.js";
import { middleAlgebraGenerators } from "./middle-algebra.js";
import { middleGeometryGenerators } from "./middle-geometry.js";

const allGenerators: Generator[] = [
  ...k5ArithmeticGenerators,
  ...k5NumberGenerators,
  ...k5FractionDecimalGenerators,
  ...middleRationalGenerators,
  ...middleAlgebraGenerators,
  ...middleGeometryGenerators,
];

/** Map from topicId to generator */
export const generatorRegistry = new Map<string, Generator>();

for (const gen of allGenerators) {
  if (generatorRegistry.has(gen.topicId)) {
    throw new Error(`Duplicate generator for topic: ${gen.topicId}`);
  }
  generatorRegistry.set(gen.topicId, gen);
}

export { allGenerators };
export type { Generator, Problem, Difficulty, SeededRng } from "./types.js";
export { createRng } from "./types.js";
