/**
 * Grades 6-8 rational number and integer generators.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";
import { fractionToString, gcd, roundTo } from "./math-utils.js";

function makeProblem(topicId: string, difficulty: Difficulty, index: number, q: string, a: string, hints: string[], solution: string): Problem {
  return {
    id: `${topicId}-gen-${difficulty[0]}${index}`,
    topicId, difficulty, question: q, answer: a, hints, solution,
    cognitiveDemand: "procedural", source: "generated",
  };
}

export const absoluteValue: Generator = {
  topicId: "absolute-value",
  generate(difficulty, index, rng) {
    let n: number;
    if (difficulty === "easy") n = rng.int(-10, 10);
    else if (difficulty === "medium") n = rng.int(-50, 50);
    else n = rng.int(-100, 100);
    const q = `What is |${n}|?`;
    const ans = `${Math.abs(n)}`;
    const hints = [`Absolute value is the distance from zero. It's always positive or zero.`];
    const sol = `|${n}| = ${Math.abs(n)}.`;
    return makeProblem("absolute-value", difficulty, index, q, ans, hints, sol);
  },
};

export const compareOrderIntegers: Generator = {
  topicId: "compare-order-integers",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      const a = rng.int(-10, 10);
      let b = rng.int(-10, 10);
      while (a === b) b = rng.int(-10, 10);
      const sym = a > b ? ">" : "<";
      const q = `Compare: ${a} ___ ${b}`;
      return makeProblem("compare-order-integers", difficulty, index, q, sym, [`On a number line, which is farther right?`], `${a} ${sym} ${b}.`);
    } else {
      const len = difficulty === "medium" ? 4 : 6;
      const nums = Array.from({ length: len }, () => rng.int(-20, 20));
      const sorted = [...nums].sort((a, b) => a - b);
      const q = `Order from least to greatest: ${nums.join(", ")}`;
      const ans = sorted.join(", ");
      return makeProblem("compare-order-integers", difficulty, index, q, ans, [`Negative numbers are less than positive. More negative = less.`], `Ordered: ${ans}.`);
    }
  },
};

export const integerAddition: Generator = {
  topicId: "integer-addition",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") { a = rng.int(-10, 10); b = rng.int(-10, 10); }
    else if (difficulty === "medium") { a = rng.int(-50, 50); b = rng.int(-50, 50); }
    else { a = rng.int(-100, 100); b = rng.int(-100, 100); }
    const result = a + b;
    const bStr = b >= 0 ? `+ ${b}` : `− ${Math.abs(b)}`;
    const q = `What is ${a} ${bStr}?`;
    return makeProblem("integer-addition", difficulty, index, q, `${result}`, [`When adding integers, same signs: add and keep sign. Different signs: subtract and keep the sign of the larger absolute value.`], `${a} + (${b}) = ${result}.`);
  },
};

export const integerSubtraction: Generator = {
  topicId: "integer-subtraction",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") { a = rng.int(-10, 10); b = rng.int(-10, 10); }
    else if (difficulty === "medium") { a = rng.int(-50, 50); b = rng.int(-50, 50); }
    else { a = rng.int(-100, 100); b = rng.int(-100, 100); }
    const result = a - b;
    const q = `What is ${a} − (${b})?`;
    return makeProblem("integer-subtraction", difficulty, index, q, `${result}`, [`Subtracting is the same as adding the opposite: ${a} + (${-b}).`], `${a} − (${b}) = ${a} + (${-b}) = ${result}.`);
  },
};

export const integerMultiplication: Generator = {
  topicId: "integer-multiplication",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") { a = rng.int(-5, 5); b = rng.int(-5, 5); }
    else if (difficulty === "medium") { a = rng.int(-12, 12); b = rng.int(-12, 12); }
    else { a = rng.int(-20, 20); b = rng.int(-12, 12); }
    const result = a * b;
    const q = `What is ${a} × (${b})?`;
    return makeProblem("integer-multiplication", difficulty, index, q, `${result}`, [`Positive × positive = positive. Negative × negative = positive. Different signs = negative.`], `${a} × (${b}) = ${result}.`);
  },
};

export const integerDivision: Generator = {
  topicId: "integer-division",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") { divisor = rng.pick([-5, -4, -3, -2, 2, 3, 4, 5]); quotient = rng.int(-5, 5); }
    else if (difficulty === "medium") { divisor = rng.pick([-10, -8, -6, -4, -3, 3, 4, 6, 8, 10]); quotient = rng.int(-10, 10); }
    else { divisor = rng.int(-12, 12); if (divisor === 0) divisor = 3; quotient = rng.int(-15, 15); }
    const dividend = divisor * quotient;
    const q = `What is ${dividend} ÷ (${divisor})?`;
    return makeProblem("integer-division", difficulty, index, q, `${quotient}`, [`Divide the absolute values, then determine the sign.`], `${dividend} ÷ (${divisor}) = ${quotient}.`);
  },
};

export const compareOrderRationals: Generator = {
  topicId: "compare-order-rationals",
  generate(difficulty, index, rng) {
    const makeRational = () => {
      const d = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const n = rng.int(-d * 2, d * 2);
      return { n, d, val: n / d, str: n === 0 ? "0" : fractionToString(n, d) };
    };
    if (difficulty === "easy") {
      const a = makeRational();
      let b = makeRational();
      while (Math.abs(a.val - b.val) < 0.01) b = makeRational();
      const sym = a.val > b.val ? ">" : "<";
      const q = `Compare: ${a.str} ___ ${b.str}`;
      return makeProblem("compare-order-rationals", difficulty, index, q, sym, [`Convert to decimals or find a common denominator.`], `${a.str} ≈ ${roundTo(a.val, 3)}, ${b.str} ≈ ${roundTo(b.val, 3)}. So ${a.str} ${sym} ${b.str}.`);
    } else {
      const count = difficulty === "medium" ? 4 : 5;
      const nums = Array.from({ length: count }, makeRational);
      const sorted = [...nums].sort((a, b) => a.val - b.val);
      const q = `Order from least to greatest: ${nums.map(n => n.str).join(", ")}`;
      const ans = sorted.map(n => n.str).join(", ");
      return makeProblem("compare-order-rationals", difficulty, index, q, ans, [`Convert each to a decimal to compare.`], `Ordered: ${ans}.`);
    }
  },
};

export const addSubtractRationals: Generator = {
  topicId: "add-subtract-rationals",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.4;
    const d1 = rng.pick(difficulty === "easy" ? [2, 4] : [3, 4, 5, 6]);
    const d2 = rng.pick(difficulty === "easy" ? [2, 4] : [3, 4, 5, 6]);
    const n1 = rng.int(-d1 * 2, d1 * 2);
    const n2 = rng.int(-d2 * 2, d2 * 2);
    const commonD = d1 * d2 / gcd(d1, d2);
    const adj1 = n1 * (commonD / d1);
    const adj2 = n2 * (commonD / d2);
    const resN = isAdd ? adj1 + adj2 : adj1 - adj2;
    const op = isAdd ? "+" : "−";
    const q = `What is ${fractionToString(n1, d1)} ${op} ${fractionToString(n2, d2)}?`;
    const ans = fractionToString(resN, commonD);
    return makeProblem("add-subtract-rationals", difficulty, index, q, ans,
      [`Find a common denominator: ${commonD}.`],
      `${fractionToString(n1, d1)} ${op} ${fractionToString(n2, d2)} = ${fractionToString(adj1, commonD)} ${op} ${fractionToString(adj2, commonD)} = ${ans}.`);
  },
};

export const multiplyDivideRationals: Generator = {
  topicId: "multiply-divide-rationals",
  generate(difficulty, index, rng) {
    const isMultiply = rng.next() > 0.5;
    const d1 = rng.pick(difficulty === "easy" ? [2, 3] : [2, 3, 4, 5]);
    const d2 = rng.pick(difficulty === "easy" ? [2, 3] : [2, 3, 4, 5]);
    const sign1 = rng.pick([-1, 1]);
    const sign2 = rng.pick([-1, 1]);
    const n1 = sign1 * rng.int(1, d1);
    const n2 = sign2 * rng.int(1, d2);
    const op = isMultiply ? "×" : "÷";
    let resN: number, resD: number;
    if (isMultiply) { resN = n1 * n2; resD = d1 * d2; }
    else { resN = n1 * d2; resD = d1 * n2; }
    if (resD < 0) { resN = -resN; resD = -resD; }
    const q = `What is ${fractionToString(n1, d1)} ${op} ${fractionToString(n2, d2)}?`;
    const ans = fractionToString(resN, resD);
    const hints = isMultiply
      ? [`Multiply numerators and denominators. Determine sign.`]
      : [`Flip the second fraction and multiply.`];
    return makeProblem("multiply-divide-rationals", difficulty, index, q, ans, hints,
      `${fractionToString(n1, d1)} ${op} ${fractionToString(n2, d2)} = ${ans}.`);
  },
};

export const convertRationalForms: Generator = {
  topicId: "convert-rational-forms",
  generate(difficulty, index, rng) {
    // Fraction to decimal or decimal to fraction
    const toDecimal = rng.next() > 0.5;
    const d = rng.pick(difficulty === "easy" ? [2, 4, 5] : difficulty === "medium" ? [4, 5, 8, 10] : [3, 6, 8, 9, 11]);
    const n = rng.int(1, d * 2);
    if (toDecimal) {
      const dec = roundTo(n / d, 3);
      const q = `Convert ${fractionToString(n, d)} to a decimal.`;
      return makeProblem("convert-rational-forms", difficulty, index, q, `${dec}`, [`Divide ${n} by ${d}.`], `${n} ÷ ${d} = ${dec}.`);
    } else {
      const dec = roundTo(n / d, 3);
      const q = `Convert ${dec} to a fraction in simplest form.`;
      return makeProblem("convert-rational-forms", difficulty, index, q, fractionToString(n, d), [`Write as a fraction over a power of 10, then simplify.`], `${dec} = ${fractionToString(n, d)}.`);
    }
  },
};

export const operationsRationalPractice: Generator = {
  topicId: "operations-rational-practice",
  generate(difficulty, index, rng) {
    // Multi-step: two operations with rationals
    const d1 = rng.pick([2, 3, 4]);
    const d2 = rng.pick([2, 3, 4]);
    const n1 = rng.int(-4, 4);
    const n2 = rng.int(1, 4);
    const whole = rng.int(-3, 3);
    const step1 = n1 * d2 + n2 * d1;
    const step1D = d1 * d2;
    const resN = step1 + whole * step1D;
    const q = `What is ${fractionToString(n1, d1)} + ${fractionToString(n2, d2)} + ${whole}?`;
    const ans = fractionToString(resN, step1D);
    return makeProblem("operations-rational-practice", difficulty, index, q, ans,
      [`First add the fractions, then add the whole number.`],
      `${fractionToString(n1, d1)} + ${fractionToString(n2, d2)} = ${fractionToString(step1, step1D)}. Then + ${whole} = ${ans}.`);
  },
};

export const numberLineOpposites: Generator = {
  topicId: "number-line-opposites",
  generate(difficulty, index, rng) {
    let n: number;
    if (difficulty === "easy") n = rng.int(1, 10);
    else if (difficulty === "medium") n = rng.int(-20, 20);
    else n = rng.int(-50, 50);
    if (rng.next() > 0.5) {
      const q = `What is the opposite of ${n}?`;
      return makeProblem("number-line-opposites", difficulty, index, q, `${-n}`, [`The opposite of a number is the same distance from 0 but on the other side.`], `The opposite of ${n} is ${-n}.`);
    } else {
      const q = `What is ${n} + (${-n})?`;
      return makeProblem("number-line-opposites", difficulty, index, q, "0", [`A number plus its opposite (additive inverse) always equals 0.`], `${n} + (${-n}) = 0.`);
    }
  },
};

export const gcfLcmApplications: Generator = {
  topicId: "gcf-lcm-applications",
  generate(difficulty, index, rng) {
    const a = rng.int(difficulty === "easy" ? 4 : 8, difficulty === "easy" ? 12 : 30);
    const b = rng.int(difficulty === "easy" ? 4 : 8, difficulty === "easy" ? 12 : 30);
    if (rng.next() > 0.5) {
      const g = gcd(a, b);
      const q = `What is the GCF of ${a} and ${b}?`;
      return makeProblem("gcf-lcm-applications", difficulty, index, q, `${g}`, [`List factors or use prime factorization.`], `GCF(${a}, ${b}) = ${g}.`);
    } else {
      const l = a * b / gcd(a, b);
      const q = `What is the LCM of ${a} and ${b}?`;
      return makeProblem("gcf-lcm-applications", difficulty, index, q, `${l}`, [`LCM = (${a} × ${b}) ÷ GCF.`], `LCM(${a}, ${b}) = ${l}.`);
    }
  },
};

export const divideMultiDigit6: Generator = {
  topicId: "divide-multi-digit-6",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") { divisor = rng.int(10, 20); quotient = rng.int(10, 50); }
    else if (difficulty === "medium") { divisor = rng.int(10, 50); quotient = rng.int(10, 200); }
    else { divisor = rng.int(20, 99); quotient = rng.int(50, 500); }
    const dividend = divisor * quotient;
    const q = `What is ${dividend} ÷ ${divisor}?`;
    return makeProblem("divide-multi-digit-6", difficulty, index, q, `${quotient}`, [`Use long division.`], `${dividend} ÷ ${divisor} = ${quotient}.`);
  },
};

export const decimalDivision6: Generator = {
  topicId: "decimal-division-6",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") {
      divisor = rng.pick([2, 4, 5]);
      quotient = rng.int(1, 20);
    } else if (difficulty === "medium") {
      divisor = rng.pick([0.2, 0.4, 0.5, 2.5]);
      quotient = rng.int(1, 30);
    } else {
      divisor = roundTo(rng.int(1, 9) / 10, 1);
      quotient = roundTo(rng.int(10, 99) / 10, 1);
    }
    const dividend = roundTo(divisor * quotient, 2);
    const q = `What is ${dividend} ÷ ${divisor}?`;
    return makeProblem("decimal-division-6", difficulty, index, q, `${quotient}`, [`Move the decimal to make the divisor a whole number, then divide.`], `${dividend} ÷ ${divisor} = ${quotient}.`);
  },
};

export const middleRationalGenerators: Generator[] = [
  absoluteValue, compareOrderIntegers,
  integerAddition, integerSubtraction, integerMultiplication, integerDivision,
  compareOrderRationals, addSubtractRationals, multiplyDivideRationals,
  convertRationalForms, operationsRationalPractice, numberLineOpposites,
  gcfLcmApplications, divideMultiDigit6, decimalDivision6,
];
