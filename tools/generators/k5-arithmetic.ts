/**
 * K-5 arithmetic generators: addition, subtraction, multiplication, division.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";

function makeProblem(topicId: string, difficulty: Difficulty, index: number, q: string, a: string, hints: string[], solution: string): Problem {
  return {
    id: `${topicId}-gen-${difficulty[0]}${index}`,
    topicId,
    difficulty,
    question: q,
    answer: a,
    hints,
    solution,
    cognitiveDemand: "procedural",
    source: "generated",
  };
}

// --- Addition generators ---

function additionGenerator(topicId: string, min: number, max: number, maxSum: number): Generator {
  return {
    topicId,
    generate(difficulty, index, rng) {
      let a: number, b: number;
      if (difficulty === "easy") {
        // Round numbers, no regrouping
        a = rng.int(min, Math.floor(maxSum * 0.4));
        b = rng.int(min, Math.floor(maxSum * 0.3));
        if (max <= 10) { a = rng.int(0, Math.floor(maxSum / 2)); b = rng.int(0, maxSum - a); }
      } else if (difficulty === "medium") {
        a = rng.int(Math.floor(maxSum * 0.2), Math.floor(maxSum * 0.6));
        b = rng.int(Math.floor(maxSum * 0.1), Math.min(max, maxSum - a));
      } else {
        // May require regrouping
        a = rng.int(Math.floor(maxSum * 0.3), Math.floor(maxSum * 0.7));
        b = rng.int(Math.floor(maxSum * 0.2), Math.min(max, maxSum - a));
      }
      b = Math.max(min, Math.min(b, maxSum - a));
      const sum = a + b;
      const q = `What is ${a} + ${b}?`;
      const ans = `${sum}`;
      const hints = [`Start with ${a} and count up ${b} more.`];
      if (maxSum >= 100) hints.push(`Add tens first: ${Math.floor(a / 10) * 10} + ${Math.floor(b / 10) * 10} = ${Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10}.`);
      const sol = `${a} + ${b} = ${sum}.`;
      return makeProblem(topicId, difficulty, index, q, ans, hints, sol);
    },
  };
}

export const addWithin5 = additionGenerator("add-within-5", 0, 5, 5);
export const addWithin10 = additionGenerator("add-within-10", 0, 10, 10);
export const addWithin20 = additionGenerator("add-within-20", 0, 20, 20);
export const addWithin100 = additionGenerator("add-within-100", 1, 99, 100);
export const addWithin100Fluent = additionGenerator("add-within-100-fluent", 1, 99, 100);
export const addWithin1000 = additionGenerator("add-within-1000", 10, 999, 1000);

// --- Subtraction generators ---

function subtractionGenerator(topicId: string, min: number, maxMinuend: number): Generator {
  return {
    topicId,
    generate(difficulty, index, rng) {
      let a: number, b: number;
      if (difficulty === "easy") {
        a = rng.int(Math.max(min, 2), Math.floor(maxMinuend * 0.5));
        b = rng.int(min, Math.floor(a * 0.5));
      } else if (difficulty === "medium") {
        a = rng.int(Math.floor(maxMinuend * 0.3), Math.floor(maxMinuend * 0.7));
        b = rng.int(Math.floor(a * 0.2), Math.floor(a * 0.7));
      } else {
        a = rng.int(Math.floor(maxMinuend * 0.5), maxMinuend);
        b = rng.int(Math.floor(a * 0.3), Math.floor(a * 0.8));
      }
      b = Math.max(min, b);
      const diff = a - b;
      const q = `What is ${a} − ${b}?`;
      const ans = `${diff}`;
      const hints = [`Start at ${a} and count back ${b}.`];
      if (maxMinuend >= 100) hints.push(`Subtract tens: ${Math.floor(a / 10) * 10} − ${Math.floor(b / 10) * 10} = ${Math.floor(a / 10) * 10 - Math.floor(b / 10) * 10}.`);
      const sol = `${a} − ${b} = ${diff}.`;
      return makeProblem(topicId, difficulty, index, q, ans, hints, sol);
    },
  };
}

export const subtractWithin5 = subtractionGenerator("subtract-within-5", 0, 5);
export const subtractWithin10 = subtractionGenerator("subtract-within-10", 0, 10);
export const subtractWithin20 = subtractionGenerator("subtract-within-20", 0, 20);
export const subtractWithin100Fluent = subtractionGenerator("subtract-within-100-fluent", 1, 100);
export const subtractWithin1000 = subtractionGenerator("subtract-within-1000", 10, 1000);

// --- Estimation addition/subtraction ---

export const estimationAddSub: Generator = {
  topicId: "estimation-addition-subtraction",
  generate(difficulty, index, rng) {
    const op = rng.pick(["+", "−"]);
    let a: number, b: number, roundTo: number;
    if (difficulty === "easy") {
      roundTo = 10;
      a = rng.int(10, 90);
      b = rng.int(10, 90);
    } else if (difficulty === "medium") {
      roundTo = 100;
      a = rng.int(100, 900);
      b = rng.int(100, 900);
    } else {
      roundTo = 100;
      a = rng.int(100, 9000);
      b = rng.int(100, Math.min(9000, a));
    }
    if (op === "−" && b > a) [a, b] = [b, a];
    const aRound = Math.round(a / roundTo) * roundTo;
    const bRound = Math.round(b / roundTo) * roundTo;
    const est = op === "+" ? aRound + bRound : aRound - bRound;
    const q = `Estimate ${a} ${op} ${b} by rounding to the nearest ${roundTo}.`;
    const ans = `${est}`;
    const hints = [`Round ${a} to the nearest ${roundTo}: ${aRound}.`, `Round ${b} to the nearest ${roundTo}: ${bRound}.`];
    const sol = `${a} rounds to ${aRound}. ${b} rounds to ${bRound}. ${aRound} ${op} ${bRound} = ${est}.`;
    return makeProblem("estimation-addition-subtraction", difficulty, index, q, ans, hints, sol);
  },
};

// --- Multiplication generators ---

export const multiplyWithin100: Generator = {
  topicId: "multiply-within-100",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(1, 5);
      b = rng.int(1, 5);
    } else if (difficulty === "medium") {
      a = rng.int(2, 9);
      b = rng.int(2, 9);
    } else {
      a = rng.int(6, 12);
      b = rng.int(6, 12);
    }
    const product = a * b;
    const q = `What is ${a} × ${b}?`;
    const ans = `${product}`;
    const hints = [`Think of ${a} groups of ${b}.`];
    const sol = `${a} × ${b} = ${product}.`;
    return makeProblem("multiply-within-100", difficulty, index, q, ans, hints, sol);
  },
};

export const multiDigitMultiply: Generator = {
  topicId: "multi-digit-multiply",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(10, 99);
      b = rng.int(2, 9);
    } else if (difficulty === "medium") {
      a = rng.int(10, 99);
      b = rng.int(10, 99);
    } else {
      a = rng.int(100, 999);
      b = rng.int(2, 9);
    }
    const product = a * b;
    const q = `What is ${a} × ${b}?`;
    const ans = `${product}`;
    const hints = [`Break ${a} into place values and multiply each by ${b}.`];
    const sol = `${a} × ${b} = ${product}.`;
    return makeProblem("multi-digit-multiply", difficulty, index, q, ans, hints, sol);
  },
};

export const multiplyMultiDigit: Generator = {
  topicId: "multiply-multi-digit",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(10, 50);
      b = rng.int(10, 30);
    } else if (difficulty === "medium") {
      a = rng.int(20, 99);
      b = rng.int(10, 99);
    } else {
      a = rng.int(100, 999);
      b = rng.int(10, 99);
    }
    const product = a * b;
    const q = `What is ${a} × ${b}?`;
    const ans = `${product}`;
    const hints = [`Use partial products: multiply ${b} by each digit of ${a}.`];
    const sol = `${a} × ${b} = ${product}.`;
    return makeProblem("multiply-multi-digit", difficulty, index, q, ans, hints, sol);
  },
};

export const estimationMultDiv: Generator = {
  topicId: "estimation-multiplication-division",
  generate(difficulty, index, rng) {
    const isMultiply = rng.next() > 0.5;
    let a: number, b: number, roundTo: number;
    if (difficulty === "easy") {
      roundTo = 10;
      a = rng.int(10, 50);
      b = rng.int(2, 9);
    } else if (difficulty === "medium") {
      roundTo = 10;
      a = rng.int(10, 99);
      b = rng.int(10, 50);
    } else {
      roundTo = 100;
      a = rng.int(100, 999);
      b = rng.int(2, 20);
    }
    if (isMultiply) {
      const aR = Math.round(a / roundTo) * roundTo || roundTo;
      const est = aR * b;
      const q = `Estimate ${a} × ${b} by rounding ${a} to the nearest ${roundTo}.`;
      const ans = `${est}`;
      const hints = [`Round ${a} to ${aR}.`, `${aR} × ${b} = ?`];
      const sol = `${a} ≈ ${aR}. ${aR} × ${b} = ${est}.`;
      return makeProblem("estimation-multiplication-division", difficulty, index, q, ans, hints, sol);
    } else {
      // Division estimation — make sure a is divisible after rounding
      const aR = Math.round(a / roundTo) * roundTo || roundTo;
      const est = Math.round(aR / b);
      const q = `Estimate ${a} ÷ ${b} by rounding ${a} to the nearest ${roundTo}.`;
      const ans = `${est}`;
      const hints = [`Round ${a} to ${aR}.`, `${aR} ÷ ${b} ≈ ?`];
      const sol = `${a} ≈ ${aR}. ${aR} ÷ ${b} ≈ ${est}.`;
      return makeProblem("estimation-multiplication-division", difficulty, index, q, ans, hints, sol);
    }
  },
};

export const exponentsIntro: Generator = {
  topicId: "exponents-intro",
  generate(difficulty, index, rng) {
    let base: number, exp: number;
    if (difficulty === "easy") {
      base = rng.int(2, 5);
      exp = 2;
    } else if (difficulty === "medium") {
      base = rng.int(2, 10);
      exp = rng.pick([2, 3]);
    } else {
      base = rng.int(2, 6);
      exp = rng.int(3, 4);
    }
    const result = Math.pow(base, exp);
    const q = `What is ${base}^${exp}?`;
    const ans = `${result}`;
    const expanded = Array(exp).fill(`${base}`).join(" × ");
    const hints = [`${base}^${exp} means ${expanded}.`];
    const sol = `${base}^${exp} = ${expanded} = ${result}.`;
    return makeProblem("exponents-intro", difficulty, index, q, ans, hints, sol);
  },
};

// --- Division generators ---

export const divideWithin100: Generator = {
  topicId: "divide-within-100",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") {
      divisor = rng.int(2, 5);
      quotient = rng.int(1, 5);
    } else if (difficulty === "medium") {
      divisor = rng.int(2, 9);
      quotient = rng.int(2, 9);
    } else {
      divisor = rng.int(6, 12);
      quotient = rng.int(6, 12);
    }
    const dividend = divisor * quotient;
    const q = `What is ${dividend} ÷ ${divisor}?`;
    const ans = `${quotient}`;
    const hints = [`Think: ${divisor} × ? = ${dividend}.`];
    const sol = `${dividend} ÷ ${divisor} = ${quotient} because ${divisor} × ${quotient} = ${dividend}.`;
    return makeProblem("divide-within-100", difficulty, index, q, ans, hints, sol);
  },
};

export const longDivision: Generator = {
  topicId: "long-division",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") {
      divisor = rng.int(2, 9);
      quotient = rng.int(10, 50);
    } else if (difficulty === "medium") {
      divisor = rng.int(2, 9);
      quotient = rng.int(50, 200);
    } else {
      divisor = rng.int(10, 30);
      quotient = rng.int(10, 99);
    }
    const dividend = divisor * quotient;
    const q = `What is ${dividend} ÷ ${divisor}?`;
    const ans = `${quotient}`;
    const hints = [`How many times does ${divisor} go into ${dividend}?`, `Start by dividing the leftmost digits.`];
    const sol = `${dividend} ÷ ${divisor} = ${quotient}. Check: ${divisor} × ${quotient} = ${dividend}.`;
    return makeProblem("long-division", difficulty, index, q, ans, hints, sol);
  },
};

export const divideMultiDigit: Generator = {
  topicId: "divide-multi-digit",
  generate(difficulty, index, rng) {
    let divisor: number, quotient: number;
    if (difficulty === "easy") {
      divisor = rng.int(10, 20);
      quotient = rng.int(10, 50);
    } else if (difficulty === "medium") {
      divisor = rng.int(10, 50);
      quotient = rng.int(10, 99);
    } else {
      divisor = rng.int(20, 99);
      quotient = rng.int(10, 99);
    }
    const dividend = divisor * quotient;
    const q = `What is ${dividend} ÷ ${divisor}?`;
    const ans = `${quotient}`;
    const hints = [`Estimate: about how many ${divisor}s fit in ${dividend}?`];
    const sol = `${dividend} ÷ ${divisor} = ${quotient}. Check: ${divisor} × ${quotient} = ${dividend}.`;
    return makeProblem("divide-multi-digit", difficulty, index, q, ans, hints, sol);
  },
};

export const k5ArithmeticGenerators: Generator[] = [
  addWithin5, addWithin10, addWithin20, addWithin100, addWithin100Fluent, addWithin1000,
  subtractWithin5, subtractWithin10, subtractWithin20, subtractWithin100Fluent, subtractWithin1000,
  estimationAddSub,
  multiplyWithin100, multiDigitMultiply, multiplyMultiDigit, estimationMultDiv, exponentsIntro,
  divideWithin100, longDivision, divideMultiDigit,
];
