/**
 * K-5 number sense generators: place value, comparison, odd/even, skip counting,
 * factors/multiples, prime/composite, GCF, LCM, rounding, multi-digit add/sub.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";
import { allFactors, gcd, isPrime, lcm } from "./math-utils.js";

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

export const compareNumbersK: Generator = {
  topicId: "compare-numbers-k",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(1, 5);
      b = rng.int(1, 5);
      while (a === b) b = rng.int(1, 5);
    } else if (difficulty === "medium") {
      a = rng.int(1, 10);
      b = rng.int(1, 10);
      while (a === b) b = rng.int(1, 10);
    } else {
      a = rng.int(5, 20);
      b = rng.int(5, 20);
      while (a === b) b = rng.int(5, 20);
    }
    const q = `Which is greater, ${a} or ${b}?`;
    const ans = `${Math.max(a, b)}`;
    const hints = [`Count: which number comes later when you count up?`];
    const sol = `${Math.max(a, b)} is greater than ${Math.min(a, b)}.`;
    return makeProblem("compare-numbers-k", difficulty, index, q, ans, hints, sol);
  },
};

export const compareTwoDigit: Generator = {
  topicId: "compare-two-digit",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      // Different tens digit
      a = rng.int(10, 50);
      b = rng.int(51, 99);
    } else if (difficulty === "medium") {
      // Same tens digit
      const tens = rng.int(1, 8) * 10;
      a = tens + rng.int(0, 9);
      b = tens + rng.int(0, 9);
      while (a === b) b = tens + rng.int(0, 9);
    } else {
      a = rng.int(10, 99);
      b = rng.int(10, 99);
      while (a === b) b = rng.int(10, 99);
    }
    const symbol = a > b ? ">" : a < b ? "<" : "=";
    const q = `Compare using <, >, or =: ${a} ___ ${b}`;
    const ans = symbol;
    const hints = [`Compare the tens digits first. If they are the same, compare the ones digits.`];
    const sol = `${a} ${symbol} ${b}.`;
    return makeProblem("compare-two-digit", difficulty, index, q, ans, hints, sol);
  },
};

export const skipCount: Generator = {
  topicId: "skip-count-2-5-10",
  generate(difficulty, index, rng) {
    let by: number, start: number, count: number;
    if (difficulty === "easy") {
      by = rng.pick([2, 5, 10]);
      start = 0;
      count = rng.int(3, 5);
    } else if (difficulty === "medium") {
      by = rng.pick([2, 5, 10]);
      start = by * rng.int(1, 5);
      count = rng.int(4, 6);
    } else {
      by = rng.pick([2, 5, 10]);
      start = by * rng.int(3, 10);
      count = rng.int(5, 8);
    }
    const seq = Array.from({ length: count }, (_, i) => start + by * i);
    const next = start + by * count;
    const q = `What comes next? ${seq.join(", ")}, ___`;
    const ans = `${next}`;
    const hints = [`These numbers go up by ${by} each time.`];
    const sol = `Counting by ${by}s: the next number is ${seq[seq.length - 1]} + ${by} = ${next}.`;
    return makeProblem("skip-count-2-5-10", difficulty, index, q, ans, hints, sol);
  },
};

export const oddEven: Generator = {
  topicId: "odd-even",
  generate(difficulty, index, rng) {
    let n: number;
    if (difficulty === "easy") {
      n = rng.int(1, 20);
    } else if (difficulty === "medium") {
      n = rng.int(20, 100);
    } else {
      n = rng.int(100, 500);
    }
    const isEven = n % 2 === 0;
    const q = `Is ${n} odd or even?`;
    const ans = isEven ? "even" : "odd";
    const hints = [`Look at the ones digit: ${n % 10}. Is it 0, 2, 4, 6, or 8?`];
    const sol = `${n} is ${ans} because its ones digit (${n % 10}) is ${isEven ? "even" : "odd"}.`;
    return makeProblem("odd-even", difficulty, index, q, ans, hints, sol);
  },
};

export const placeValueRounding: Generator = {
  topicId: "place-value-rounding",
  generate(difficulty, index, rng) {
    let n: number, roundTo: number;
    if (difficulty === "easy") {
      n = rng.int(10, 99);
      roundTo = 10;
    } else if (difficulty === "medium") {
      n = rng.int(100, 999);
      roundTo = rng.pick([10, 100]);
    } else {
      n = rng.int(1000, 9999);
      roundTo = rng.pick([10, 100, 1000]);
    }
    const rounded = Math.round(n / roundTo) * roundTo;
    const q = `Round ${n} to the nearest ${roundTo}.`;
    const ans = `${rounded}`;
    const digit = Math.floor(n / (roundTo / 10)) % 10;
    const hints = [`Look at the digit in the ${roundTo === 10 ? "ones" : roundTo === 100 ? "tens" : "hundreds"} place: ${digit}. Is it 5 or more?`];
    const sol = `The digit is ${digit}, which is ${digit >= 5 ? "5 or more, so round up" : "less than 5, so round down"}. ${n} rounds to ${rounded}.`;
    return makeProblem("place-value-rounding", difficulty, index, q, ans, hints, sol);
  },
};

export const multiDigitAddSub: Generator = {
  topicId: "multi-digit-add-sub",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.5;
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(100, 500);
      b = rng.int(100, 400);
    } else if (difficulty === "medium") {
      a = rng.int(100, 999);
      b = rng.int(100, 999);
    } else {
      a = rng.int(1000, 9999);
      b = rng.int(1000, 9999);
    }
    if (!isAdd && b > a) [a, b] = [b, a];
    const result = isAdd ? a + b : a - b;
    const op = isAdd ? "+" : "−";
    const q = `What is ${a} ${op} ${b}?`;
    const ans = `${result}`;
    const hints = [isAdd ? `Line up the digits by place value and add from right to left.` : `Line up the digits and subtract from right to left. Regroup if needed.`];
    const sol = `${a} ${op} ${b} = ${result}.`;
    return makeProblem("multi-digit-add-sub", difficulty, index, q, ans, hints, sol);
  },
};

export const factorsMultiples: Generator = {
  topicId: "factors-multiples",
  generate(difficulty, index, rng) {
    if (rng.next() > 0.5) {
      // Factor question
      let n: number;
      if (difficulty === "easy") n = rng.pick([6, 8, 10, 12]);
      else if (difficulty === "medium") n = rng.pick([18, 24, 30, 36]);
      else n = rng.pick([48, 56, 60, 72, 84]);
      const factors = allFactors(n);
      const testFactor = rng.pick(factors.filter(f => f > 1 && f < n));
      const q = `Is ${testFactor} a factor of ${n}?`;
      const ans = "yes";
      const hints = [`Does ${n} ÷ ${testFactor} have no remainder?`];
      const sol = `Yes, ${testFactor} is a factor of ${n} because ${n} ÷ ${testFactor} = ${n / testFactor}.`;
      return makeProblem("factors-multiples", difficulty, index, q, ans, hints, sol);
    } else {
      // Multiple question
      let n: number, multiplier: number;
      if (difficulty === "easy") { n = rng.int(2, 5); multiplier = rng.int(2, 5); }
      else if (difficulty === "medium") { n = rng.int(3, 9); multiplier = rng.int(3, 10); }
      else { n = rng.int(6, 12); multiplier = rng.int(5, 15); }
      const multiple = n * multiplier;
      const q = `What is the ${multiplier}${multiplier === 2 ? "nd" : multiplier === 3 ? "rd" : "th"} multiple of ${n}?`;
      const ans = `${multiple}`;
      const hints = [`Multiply: ${n} × ${multiplier}.`];
      const sol = `The ${multiplier}${multiplier === 2 ? "nd" : multiplier === 3 ? "rd" : "th"} multiple of ${n} is ${n} × ${multiplier} = ${multiple}.`;
      return makeProblem("factors-multiples", difficulty, index, q, ans, hints, sol);
    }
  },
};

export const primeComposite: Generator = {
  topicId: "prime-composite-numbers",
  generate(difficulty, index, rng) {
    let n: number;
    if (difficulty === "easy") n = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    else if (difficulty === "medium") n = rng.int(11, 50);
    else n = rng.int(51, 100);
    const prime = isPrime(n);
    const q = `Is ${n} prime or composite?`;
    const ans = prime ? "prime" : "composite";
    const hints = prime
      ? [`Check: can any number other than 1 and ${n} divide it evenly?`]
      : [`Try dividing by small numbers: 2, 3, 5...`];
    const sol = prime
      ? `${n} is prime — its only factors are 1 and ${n}.`
      : `${n} is composite. ${allFactors(n).filter(f => f > 1 && f < n).slice(0, 2).map(f => `${n} ÷ ${f} = ${n / f}`).join("; ")}.`;
    return makeProblem("prime-composite-numbers", difficulty, index, q, ans, hints, sol);
  },
};

export const greatestCommonFactor: Generator = {
  topicId: "greatest-common-factor",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      const g = rng.int(2, 5);
      a = g * rng.int(1, 4);
      b = g * rng.int(1, 4);
      while (a === b) b = g * rng.int(1, 4);
    } else if (difficulty === "medium") {
      const g = rng.int(2, 8);
      a = g * rng.int(2, 8);
      b = g * rng.int(2, 8);
      while (a === b) b = g * rng.int(2, 8);
    } else {
      const g = rng.int(3, 12);
      a = g * rng.int(3, 10);
      b = g * rng.int(3, 10);
      while (a === b) b = g * rng.int(3, 10);
    }
    const g = gcd(a, b);
    const q = `What is the greatest common factor (GCF) of ${a} and ${b}?`;
    const ans = `${g}`;
    const hints = [`List the factors of ${a} and ${b}. Find the largest one they share.`];
    const sol = `Factors of ${a}: ${allFactors(a).join(", ")}. Factors of ${b}: ${allFactors(b).join(", ")}. GCF = ${g}.`;
    return makeProblem("greatest-common-factor", difficulty, index, q, ans, hints, sol);
  },
};

export const leastCommonMultiple: Generator = {
  topicId: "least-common-multiple",
  generate(difficulty, index, rng) {
    let a: number, b: number;
    if (difficulty === "easy") {
      a = rng.int(2, 6);
      b = rng.int(2, 6);
      while (a === b) b = rng.int(2, 6);
    } else if (difficulty === "medium") {
      a = rng.int(3, 10);
      b = rng.int(3, 10);
      while (a === b) b = rng.int(3, 10);
    } else {
      a = rng.int(6, 15);
      b = rng.int(6, 15);
      while (a === b) b = rng.int(6, 15);
    }
    const l = lcm(a, b);
    const q = `What is the least common multiple (LCM) of ${a} and ${b}?`;
    const ans = `${l}`;
    const multA = Array.from({ length: 6 }, (_, i) => a * (i + 1));
    const multB = Array.from({ length: 6 }, (_, i) => b * (i + 1));
    const hints = [`List multiples of ${a}: ${multA.join(", ")}...`, `List multiples of ${b}: ${multB.join(", ")}... Find the smallest shared one.`];
    const sol = `Multiples of ${a}: ${multA.join(", ")}... Multiples of ${b}: ${multB.join(", ")}... LCM = ${l}.`;
    return makeProblem("least-common-multiple", difficulty, index, q, ans, hints, sol);
  },
};

export const powersOfTen: Generator = {
  topicId: "powers-of-ten",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      const exp = rng.int(1, 3);
      const result = Math.pow(10, exp);
      const q = `What is 10^${exp}?`;
      const ans = `${result}`;
      const hints = [`10^${exp} means ${exp} zeros after the 1.`];
      const sol = `10^${exp} = ${result}.`;
      return makeProblem("powers-of-ten", difficulty, index, q, ans, hints, sol);
    } else if (difficulty === "medium") {
      const n = rng.pick([3, 4, 5, 6, 7, 8, 9]);
      const exp = rng.int(1, 3);
      const multiplier = Math.pow(10, exp);
      const result = n * multiplier;
      const q = `What is ${n} × ${multiplier}?`;
      const ans = `${result}`;
      const hints = [`Multiplying by ${multiplier} moves the decimal point ${exp} place(s) to the right.`];
      const sol = `${n} × ${multiplier} = ${result}.`;
      return makeProblem("powers-of-ten", difficulty, index, q, ans, hints, sol);
    } else {
      const n = rng.int(10, 99) / 10; // one decimal place
      const exp = rng.int(2, 4);
      const multiplier = Math.pow(10, exp);
      const result = n * multiplier;
      const q = `What is ${n} × ${multiplier}?`;
      const ans = `${result}`;
      const hints = [`Move the decimal point ${exp} places to the right.`];
      const sol = `${n} × ${multiplier} = ${result}.`;
      return makeProblem("powers-of-ten", difficulty, index, q, ans, hints, sol);
    }
  },
};

export const k5NumberGenerators: Generator[] = [
  compareNumbersK, compareTwoDigit, skipCount, oddEven,
  placeValueRounding, multiDigitAddSub, factorsMultiples,
  primeComposite, greatestCommonFactor, leastCommonMultiple, powersOfTen,
];
