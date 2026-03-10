/**
 * K-5 fraction and decimal generators.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";
import { fractionToString, gcd, lcm, simplifyFraction, roundTo } from "./math-utils.js";

function makeProblem(topicId: string, difficulty: Difficulty, index: number, q: string, a: string, hints: string[], solution: string): Problem {
  return {
    id: `${topicId}-gen-${difficulty[0]}${index}`,
    topicId, difficulty, question: q, answer: a, hints, solution,
    cognitiveDemand: "procedural", source: "generated",
  };
}

// --- Fraction generators ---

export const fractionsNumberLine: Generator = {
  topicId: "fractions-number-line",
  generate(difficulty, index, rng) {
    let d: number, n: number;
    if (difficulty === "easy") { d = rng.pick([2, 4]); n = rng.int(1, d - 1); }
    else if (difficulty === "medium") { d = rng.pick([3, 4, 6, 8]); n = rng.int(1, d - 1); }
    else { d = rng.pick([5, 6, 8, 10]); n = rng.int(1, d); }
    const q = `A number line from 0 to 1 is divided into ${d} equal parts. What fraction is at the ${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} mark?`;
    const ans = fractionToString(n, d);
    const hints = [`Each part is 1/${d}. Count ${n} parts from 0.`];
    const sol = `The ${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} mark out of ${d} parts is ${fractionToString(n, d)}.`;
    return makeProblem("fractions-number-line", difficulty, index, q, ans, hints, sol);
  },
};

export const equivalentFractions3: Generator = {
  topicId: "equivalent-fractions-3",
  generate(difficulty, index, rng) {
    let n: number, d: number, mult: number;
    if (difficulty === "easy") { d = rng.pick([2, 3, 4]); n = 1; mult = rng.int(2, 3); }
    else if (difficulty === "medium") { d = rng.pick([2, 3, 4, 6]); n = rng.int(1, d - 1); mult = rng.int(2, 4); }
    else { d = rng.pick([3, 4, 5, 6]); n = rng.int(1, d - 1); mult = rng.int(3, 5); }
    const q = `Find the missing number: ${n}/${d} = ?/${d * mult}`;
    const ans = `${n * mult}`;
    const hints = [`The denominator was multiplied by ${mult}. Do the same to the numerator.`];
    const sol = `${n}/${d} = ${n * mult}/${d * mult}. Both parts were multiplied by ${mult}.`;
    return makeProblem("equivalent-fractions-3", difficulty, index, q, ans, hints, sol);
  },
};

export const compareFractions3: Generator = {
  topicId: "compare-fractions-3",
  generate(difficulty, index, rng) {
    let n1: number, n2: number, d: number;
    if (difficulty === "easy") { d = rng.pick([4, 6, 8]); n1 = rng.int(1, d - 2); n2 = n1 + rng.int(1, d - n1 - 1); }
    else if (difficulty === "medium") { d = rng.pick([3, 5, 6, 8]); n1 = rng.int(1, d - 1); n2 = rng.int(1, d - 1); while (n1 === n2) n2 = rng.int(1, d - 1); }
    else { const d1 = rng.pick([4, 6, 8]); const d2 = d1; n1 = rng.int(1, d1 - 1); n2 = rng.int(1, d2 - 1); d = d1; while (n1 === n2) n2 = rng.int(1, d2 - 1); }
    const symbol = n1 > n2 ? ">" : n1 < n2 ? "<" : "=";
    const q = `Compare: ${n1}/${d} ___ ${n2}/${d}`;
    const ans = symbol;
    const hints = [`Both fractions have the same denominator (${d}). Compare the numerators.`];
    const sol = `${n1}/${d} ${symbol} ${n2}/${d} because ${n1} ${symbol} ${n2}.`;
    return makeProblem("compare-fractions-3", difficulty, index, q, ans, hints, sol);
  },
};

export const equivalentFractions4: Generator = {
  topicId: "equivalent-fractions-4",
  generate(difficulty, index, rng) {
    let n: number, d: number, mult: number;
    if (difficulty === "easy") { d = rng.pick([2, 3, 4, 5]); n = rng.int(1, d - 1); mult = rng.int(2, 4); }
    else if (difficulty === "medium") { d = rng.pick([3, 4, 6, 8]); n = rng.int(1, d - 1); mult = rng.int(2, 5); }
    else { d = rng.pick([5, 6, 7, 8, 9]); n = rng.int(2, d - 1); mult = rng.int(3, 6); }
    // Simplify: given n*mult/d*mult, simplify to n/d
    const bigN = n * mult;
    const bigD = d * mult;
    const q = `Simplify: ${bigN}/${bigD}`;
    const [sn, sd] = simplifyFraction(bigN, bigD);
    const ans = fractionToString(sn, sd);
    const g = gcd(bigN, bigD);
    const hints = [`Find the GCF of ${bigN} and ${bigD}: ${g}.`, `Divide both by ${g}.`];
    const sol = `${bigN}/${bigD} = ${sn}/${sd}. Divided both by ${g}.`;
    return makeProblem("equivalent-fractions-4", difficulty, index, q, ans, hints, sol);
  },
};

export const compareFractions4: Generator = {
  topicId: "compare-fractions-4",
  generate(difficulty, index, rng) {
    let n1: number, d1: number, n2: number, d2: number;
    if (difficulty === "easy") {
      d1 = rng.pick([2, 3, 4]); n1 = rng.int(1, d1 - 1);
      d2 = rng.pick([2, 3, 4].filter(x => x !== d1)); n2 = rng.int(1, d2 - 1);
    } else if (difficulty === "medium") {
      d1 = rng.pick([3, 4, 5, 6]); n1 = rng.int(1, d1 - 1);
      d2 = rng.pick([3, 4, 5, 6].filter(x => x !== d1)); n2 = rng.int(1, d2 - 1);
    } else {
      d1 = rng.pick([5, 6, 7, 8]); n1 = rng.int(1, d1 - 1);
      d2 = rng.pick([5, 6, 7, 8].filter(x => x !== d1)); n2 = rng.int(1, d2 - 1);
    }
    const commonD = lcm(d1, d2);
    const cross1 = n1 * (commonD / d1);
    const cross2 = n2 * (commonD / d2);
    const symbol = cross1 > cross2 ? ">" : cross1 < cross2 ? "<" : "=";
    const q = `Compare: ${n1}/${d1} ___ ${n2}/${d2}`;
    const ans = symbol;
    const hints = [`Find a common denominator: LCD of ${d1} and ${d2} is ${commonD}.`, `${n1}/${d1} = ${cross1}/${commonD} and ${n2}/${d2} = ${cross2}/${commonD}.`];
    const sol = `${n1}/${d1} = ${cross1}/${commonD}, ${n2}/${d2} = ${cross2}/${commonD}. Since ${cross1} ${symbol} ${cross2}, ${n1}/${d1} ${symbol} ${n2}/${d2}.`;
    return makeProblem("compare-fractions-4", difficulty, index, q, ans, hints, sol);
  },
};

export const addSubtractFractions: Generator = {
  topicId: "add-subtract-fractions",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.4;
    let d: number, n1: number, n2: number;
    if (difficulty === "easy") { d = rng.pick([4, 6, 8]); n1 = rng.int(1, 2); n2 = rng.int(1, 2); }
    else if (difficulty === "medium") { d = rng.pick([4, 5, 6, 8]); n1 = rng.int(1, d - 2); n2 = rng.int(1, d - n1 - 1); }
    else { d = rng.pick([6, 8, 10, 12]); n1 = rng.int(2, d - 2); n2 = rng.int(1, d - n1 - 1); }
    if (!isAdd && n2 > n1) [n1, n2] = [n2, n1];
    const resN = isAdd ? n1 + n2 : n1 - n2;
    const op = isAdd ? "+" : "−";
    const q = `What is ${n1}/${d} ${op} ${n2}/${d}?`;
    const ans = fractionToString(resN, d);
    const hints = [`The denominators are the same. Just ${isAdd ? "add" : "subtract"} the numerators: ${n1} ${op} ${n2}.`];
    const sol = `${n1}/${d} ${op} ${n2}/${d} = ${resN}/${d}${gcd(resN, d) > 1 ? ` = ${fractionToString(resN, d)}` : ""}.`;
    return makeProblem("add-subtract-fractions", difficulty, index, q, ans, hints, sol);
  },
};

export const multiplyFractionByWhole: Generator = {
  topicId: "multiply-fraction-by-whole",
  generate(difficulty, index, rng) {
    let n: number, d: number, whole: number;
    if (difficulty === "easy") { d = rng.pick([2, 3, 4]); n = 1; whole = rng.int(2, 4); }
    else if (difficulty === "medium") { d = rng.pick([3, 4, 5, 6]); n = rng.int(1, d - 1); whole = rng.int(2, 5); }
    else { d = rng.pick([4, 5, 6, 8]); n = rng.int(2, d - 1); whole = rng.int(3, 8); }
    const resN = n * whole;
    const q = `What is ${whole} × ${n}/${d}?`;
    const ans = fractionToString(resN, d);
    const hints = [`Multiply the numerator by the whole number: ${n} × ${whole} = ${resN}.`, `Keep the denominator: ${resN}/${d}.`];
    const sol = `${whole} × ${n}/${d} = ${resN}/${d}${gcd(resN, d) > 1 ? ` = ${fractionToString(resN, d)}` : ""}.`;
    return makeProblem("multiply-fraction-by-whole", difficulty, index, q, ans, hints, sol);
  },
};

export const addSubtractFractionsUnlike: Generator = {
  topicId: "add-subtract-fractions-unlike",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.4;
    let d1: number, d2: number, n1: number, n2: number;
    if (difficulty === "easy") {
      d1 = rng.pick([2, 3, 4]); d2 = rng.pick([2, 3, 4].filter(x => x !== d1));
      n1 = rng.int(1, d1 - 1); n2 = rng.int(1, d2 - 1);
    } else if (difficulty === "medium") {
      d1 = rng.pick([3, 4, 5, 6]); d2 = rng.pick([3, 4, 5, 6].filter(x => x !== d1));
      n1 = rng.int(1, d1 - 1); n2 = rng.int(1, d2 - 1);
    } else {
      d1 = rng.pick([4, 5, 6, 8]); d2 = rng.pick([3, 5, 6, 7, 8].filter(x => x !== d1));
      n1 = rng.int(1, d1 - 1); n2 = rng.int(1, d2 - 1);
    }
    const commonD = lcm(d1, d2);
    const adj1 = n1 * (commonD / d1);
    const adj2 = n2 * (commonD / d2);
    if (!isAdd && adj2 > adj1) { /* swap so result is positive */ }
    const resN = isAdd ? adj1 + adj2 : Math.abs(adj1 - adj2);
    const op = isAdd ? "+" : "−";
    const q = `What is ${n1}/${d1} ${op} ${n2}/${d2}?`;
    const ans = fractionToString(resN, commonD);
    const hints = [`Find a common denominator: LCD of ${d1} and ${d2} is ${commonD}.`, `${n1}/${d1} = ${adj1}/${commonD}, ${n2}/${d2} = ${adj2}/${commonD}.`];
    const sol = `${n1}/${d1} ${op} ${n2}/${d2} = ${adj1}/${commonD} ${op} ${adj2}/${commonD} = ${resN}/${commonD}${gcd(resN, commonD) > 1 ? ` = ${fractionToString(resN, commonD)}` : ""}.`;
    return makeProblem("add-subtract-fractions-unlike", difficulty, index, q, ans, hints, sol);
  },
};

export const multiplyFractions: Generator = {
  topicId: "multiply-fractions",
  generate(difficulty, index, rng) {
    let n1: number, d1: number, n2: number, d2: number;
    if (difficulty === "easy") {
      d1 = rng.pick([2, 3, 4]); n1 = 1;
      d2 = rng.pick([2, 3, 4]); n2 = 1;
    } else if (difficulty === "medium") {
      d1 = rng.pick([2, 3, 4, 5]); n1 = rng.int(1, d1 - 1);
      d2 = rng.pick([2, 3, 4, 5]); n2 = rng.int(1, d2 - 1);
    } else {
      d1 = rng.pick([3, 4, 5, 6, 8]); n1 = rng.int(2, d1 - 1);
      d2 = rng.pick([3, 4, 5, 6, 8]); n2 = rng.int(2, d2 - 1);
    }
    const resN = n1 * n2;
    const resD = d1 * d2;
    const q = `What is ${n1}/${d1} × ${n2}/${d2}?`;
    const ans = fractionToString(resN, resD);
    const hints = [`Multiply numerators: ${n1} × ${n2} = ${resN}.`, `Multiply denominators: ${d1} × ${d2} = ${resD}.`];
    const sol = `${n1}/${d1} × ${n2}/${d2} = ${resN}/${resD}${gcd(resN, resD) > 1 ? ` = ${fractionToString(resN, resD)}` : ""}.`;
    return makeProblem("multiply-fractions", difficulty, index, q, ans, hints, sol);
  },
};

export const divideFractions: Generator = {
  topicId: "divide-fractions",
  generate(difficulty, index, rng) {
    let n1: number, d1: number, n2: number, d2: number;
    if (difficulty === "easy") {
      d1 = rng.pick([2, 3, 4]); n1 = rng.int(1, d1);
      d2 = rng.pick([2, 3]); n2 = rng.int(1, d2);
    } else if (difficulty === "medium") {
      d1 = rng.pick([2, 3, 4, 5]); n1 = rng.int(1, d1);
      d2 = rng.pick([2, 3, 4, 5]); n2 = rng.int(1, d2);
    } else {
      d1 = rng.pick([3, 4, 5, 6]); n1 = rng.int(2, d1);
      d2 = rng.pick([3, 4, 5, 6]); n2 = rng.int(2, d2);
    }
    // n1/d1 ÷ n2/d2 = n1*d2 / d1*n2
    const resN = n1 * d2;
    const resD = d1 * n2;
    const q = `What is ${n1}/${d1} ÷ ${n2}/${d2}?`;
    const ans = fractionToString(resN, resD);
    const hints = [`Keep the first fraction, flip the second, then multiply.`, `${n1}/${d1} × ${d2}/${n2} = ?`];
    const sol = `${n1}/${d1} ÷ ${n2}/${d2} = ${n1}/${d1} × ${d2}/${n2} = ${resN}/${resD}${gcd(resN, resD) > 1 ? ` = ${fractionToString(resN, resD)}` : ""}.`;
    return makeProblem("divide-fractions", difficulty, index, q, ans, hints, sol);
  },
};

// --- Improper fractions / mixed numbers ---

export const improperFractionsMixed: Generator = {
  topicId: "improper-fractions-mixed-numbers",
  generate(difficulty, index, rng) {
    const toMixed = rng.next() > 0.5;
    let whole: number, n: number, d: number;
    if (difficulty === "easy") { whole = rng.int(1, 3); d = rng.pick([2, 3, 4]); n = rng.int(1, d - 1); }
    else if (difficulty === "medium") { whole = rng.int(2, 5); d = rng.pick([3, 4, 5, 6]); n = rng.int(1, d - 1); }
    else { whole = rng.int(3, 8); d = rng.pick([4, 5, 6, 8]); n = rng.int(1, d - 1); }
    const improperN = whole * d + n;
    if (toMixed) {
      const q = `Convert ${improperN}/${d} to a mixed number.`;
      const ans = `${whole} ${n}/${d}`;
      const hints = [`Divide ${improperN} by ${d}. The quotient is the whole number, the remainder is the numerator.`];
      const sol = `${improperN} ÷ ${d} = ${whole} remainder ${n}. So ${improperN}/${d} = ${whole} ${n}/${d}.`;
      return makeProblem("improper-fractions-mixed-numbers", difficulty, index, q, ans, hints, sol);
    } else {
      const q = `Convert ${whole} ${n}/${d} to an improper fraction.`;
      const ans = `${improperN}/${d}`;
      const hints = [`Multiply the whole number by the denominator, then add the numerator.`, `${whole} × ${d} + ${n} = ?`];
      const sol = `${whole} × ${d} + ${n} = ${improperN}. So ${whole} ${n}/${d} = ${improperN}/${d}.`;
      return makeProblem("improper-fractions-mixed-numbers", difficulty, index, q, ans, hints, sol);
    }
  },
};

export const addSubtractMixedNumbers: Generator = {
  topicId: "add-subtract-mixed-numbers",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.4;
    const d = rng.pick(difficulty === "easy" ? [2, 4] : difficulty === "medium" ? [3, 4, 6] : [4, 6, 8]);
    const w1 = rng.int(1, difficulty === "easy" ? 3 : 5);
    const n1 = rng.int(1, d - 1);
    const w2 = rng.int(1, difficulty === "easy" ? 2 : 4);
    const n2 = rng.int(1, d - 1);
    const imp1 = w1 * d + n1;
    const imp2 = w2 * d + n2;
    const resImp = isAdd ? imp1 + imp2 : Math.abs(imp1 - imp2);
    const resW = Math.floor(resImp / d);
    const resN = resImp % d;
    const op = isAdd ? "+" : "−";
    const q = `What is ${w1} ${n1}/${d} ${op} ${w2} ${n2}/${d}?`;
    const ans = resN === 0 ? `${resW}` : `${resW} ${fractionToString(resN, d)}`;
    const hints = [`Convert to improper fractions: ${imp1}/${d} and ${imp2}/${d}.`, `${op === "+" ? "Add" : "Subtract"} the numerators.`];
    const sol = `${imp1}/${d} ${op} ${imp2}/${d} = ${resImp}/${d} = ${ans}.`;
    return makeProblem("add-subtract-mixed-numbers", difficulty, index, q, ans, hints, sol);
  },
};

export const addSubtractMixedNumbersUnlike: Generator = {
  topicId: "add-subtract-mixed-numbers-unlike",
  generate(difficulty, index, rng) {
    const isAdd = rng.next() > 0.4;
    const d1 = rng.pick(difficulty === "easy" ? [2, 3] : difficulty === "medium" ? [3, 4, 5] : [4, 5, 6]);
    const d2 = rng.pick([2, 3, 4, 5, 6].filter(x => x !== d1));
    const commonD = lcm(d1, d2);
    const w1 = rng.int(1, 4); const n1 = rng.int(1, d1 - 1);
    const w2 = rng.int(1, 3); const n2 = rng.int(1, d2 - 1);
    const imp1 = (w1 * d1 + n1) * (commonD / d1);
    const imp2 = (w2 * d2 + n2) * (commonD / d2);
    const resImp = isAdd ? imp1 + imp2 : Math.abs(imp1 - imp2);
    const resW = Math.floor(resImp / commonD);
    const resN = resImp % commonD;
    const op = isAdd ? "+" : "−";
    const q = `What is ${w1} ${n1}/${d1} ${op} ${w2} ${n2}/${d2}?`;
    const ans = resN === 0 ? `${resW}` : `${resW} ${fractionToString(resN, commonD)}`;
    const hints = [`Find a common denominator: LCD = ${commonD}.`, `Convert and ${isAdd ? "add" : "subtract"}.`];
    const sol = `Using LCD ${commonD}: ${imp1}/${commonD} ${op} ${imp2}/${commonD} = ${resImp}/${commonD} = ${ans}.`;
    return makeProblem("add-subtract-mixed-numbers-unlike", difficulty, index, q, ans, hints, sol);
  },
};

export const multiplyMixedNumbers: Generator = {
  topicId: "multiply-mixed-numbers",
  generate(difficulty, index, rng) {
    const d1 = rng.pick(difficulty === "easy" ? [2, 3] : [3, 4, 5]);
    const d2 = rng.pick(difficulty === "easy" ? [2, 3] : [2, 3, 4]);
    const w1 = rng.int(1, difficulty === "easy" ? 2 : 4);
    const n1 = rng.int(1, d1 - 1);
    const w2 = rng.int(1, difficulty === "easy" ? 2 : 3);
    const n2 = rng.int(1, d2 - 1);
    const imp1 = w1 * d1 + n1;
    const imp2 = w2 * d2 + n2;
    const resN = imp1 * imp2;
    const resD = d1 * d2;
    const resW = Math.floor(resN / resD);
    const remN = resN % resD;
    const q = `What is ${w1} ${n1}/${d1} × ${w2} ${n2}/${d2}?`;
    const ans = remN === 0 ? `${resW}` : `${resW} ${fractionToString(remN, resD)}`;
    const hints = [`Convert to improper fractions: ${imp1}/${d1} × ${imp2}/${d2}.`, `Multiply: ${imp1 * imp2}/${resD}.`];
    const sol = `${imp1}/${d1} × ${imp2}/${d2} = ${resN}/${resD} = ${ans}.`;
    return makeProblem("multiply-mixed-numbers", difficulty, index, q, ans, hints, sol);
  },
};

// --- Decimal generators ---

export const fractionDecimalEquivalence: Generator = {
  topicId: "fraction-decimal-equivalence",
  generate(difficulty, index, rng) {
    const pairs: [number, number, string][] = difficulty === "easy"
      ? [[1, 2, "0.5"], [1, 4, "0.25"], [3, 4, "0.75"], [1, 5, "0.2"]]
      : difficulty === "medium"
      ? [[1, 8, "0.125"], [3, 8, "0.375"], [2, 5, "0.4"], [3, 5, "0.6"], [7, 8, "0.875"]]
      : [[1, 3, "0.333"], [2, 3, "0.667"], [5, 6, "0.833"], [1, 6, "0.167"], [5, 8, "0.625"]];
    const [n, d, dec] = rng.pick(pairs);
    const toDecimal = rng.next() > 0.5;
    if (toDecimal) {
      const q = `Convert ${n}/${d} to a decimal.`;
      const ans = dec;
      const hints = [`Divide ${n} by ${d}.`];
      const sol = `${n} ÷ ${d} = ${dec}.`;
      return makeProblem("fraction-decimal-equivalence", difficulty, index, q, ans, hints, sol);
    } else {
      const q = `Convert ${dec} to a fraction in simplest form.`;
      const ans = `${n}/${d}`;
      const hints = [`${dec} means ${dec.replace("0.", "")} out of ${Math.pow(10, dec.length - 2)}. Simplify.`];
      const sol = `${dec} = ${n}/${d}.`;
      return makeProblem("fraction-decimal-equivalence", difficulty, index, q, ans, hints, sol);
    }
  },
};

export const compareDecimals: Generator = {
  topicId: "compare-decimals",
  generate(difficulty, index, rng) {
    let a: number, b: number, places: number;
    if (difficulty === "easy") { places = 1; a = rng.int(1, 9) / 10; b = rng.int(1, 9) / 10; while (a === b) b = rng.int(1, 9) / 10; }
    else if (difficulty === "medium") { places = 2; a = rng.int(10, 99) / 100; b = rng.int(10, 99) / 100; while (a === b) b = rng.int(10, 99) / 100; }
    else { places = 3; a = rng.int(100, 999) / 1000; b = rng.int(100, 999) / 1000; while (a === b) b = rng.int(100, 999) / 1000; }
    const symbol = a > b ? ">" : "<";
    const aStr = a.toFixed(places);
    const bStr = b.toFixed(places);
    const q = `Compare: ${aStr} ___ ${bStr}`;
    const ans = symbol;
    const hints = [`Compare digit by digit from left to right.`];
    const sol = `${aStr} ${symbol} ${bStr}.`;
    return makeProblem("compare-decimals", difficulty, index, q, ans, hints, sol);
  },
};

export const roundDecimals: Generator = {
  topicId: "round-decimals",
  generate(difficulty, index, rng) {
    let n: number, roundToPlace: string, places: number;
    if (difficulty === "easy") {
      n = rng.int(10, 99) / 10;
      roundToPlace = "ones";
      places = 0;
    } else if (difficulty === "medium") {
      n = rng.int(100, 999) / 100;
      roundToPlace = "tenths";
      places = 1;
    } else {
      n = rng.int(1000, 9999) / 1000;
      roundToPlace = rng.pick(["tenths", "hundredths"]);
      places = roundToPlace === "tenths" ? 1 : 2;
    }
    const rounded = roundTo(n, places);
    const q = `Round ${n} to the nearest ${roundToPlace}.`;
    const ans = rounded.toFixed(places);
    const hints = [`Look at the digit to the right of the ${roundToPlace} place.`];
    const sol = `${n} rounded to the nearest ${roundToPlace} is ${rounded.toFixed(places)}.`;
    return makeProblem("round-decimals", difficulty, index, q, ans, hints, sol);
  },
};

export const decimalOperations: Generator = {
  topicId: "decimal-operations",
  generate(difficulty, index, rng) {
    const ops = ["+", "−", "×"];
    const op = rng.pick(difficulty === "easy" ? ["+", "−"] : ops);
    let a: number, b: number, result: number;
    if (difficulty === "easy") {
      a = roundTo(rng.int(10, 99) / 10, 1);
      b = roundTo(rng.int(10, 99) / 10, 1);
      if (op === "−" && b > a) [a, b] = [b, a];
      result = op === "+" ? roundTo(a + b, 1) : roundTo(a - b, 1);
    } else if (difficulty === "medium") {
      a = roundTo(rng.int(100, 999) / 100, 2);
      b = roundTo(rng.int(100, 999) / 100, 2);
      if (op === "−" && b > a) [a, b] = [b, a];
      result = op === "+" ? roundTo(a + b, 2) : op === "−" ? roundTo(a - b, 2) : roundTo(a * b, 4);
    } else {
      a = roundTo(rng.int(10, 999) / 100, 2);
      b = roundTo(rng.int(10, 99) / 10, 1);
      if (op === "−" && b > a) [a, b] = [b, a];
      result = op === "+" ? roundTo(a + b, 2) : op === "−" ? roundTo(a - b, 2) : roundTo(a * b, 3);
    }
    const opSym = op === "×" ? "×" : op;
    const q = `What is ${a} ${opSym} ${b}?`;
    const ans = `${result}`;
    const hints = op === "×"
      ? [`Multiply as whole numbers, then count total decimal places.`]
      : [`Line up the decimal points, then ${op === "+" ? "add" : "subtract"}.`];
    const sol = `${a} ${opSym} ${b} = ${result}.`;
    return makeProblem("decimal-operations", difficulty, index, q, ans, hints, sol);
  },
};

// --- Measurement ---

export const moneyCoins: Generator = {
  topicId: "money-coins-bills",
  generate(difficulty, index, rng) {
    const coins = difficulty === "easy"
      ? { quarters: rng.int(0, 2), dimes: rng.int(0, 3), nickels: rng.int(0, 2), pennies: rng.int(0, 4) }
      : difficulty === "medium"
      ? { quarters: rng.int(1, 4), dimes: rng.int(0, 5), nickels: rng.int(0, 4), pennies: rng.int(0, 9) }
      : { quarters: rng.int(2, 6), dimes: rng.int(1, 8), nickels: rng.int(1, 6), pennies: rng.int(0, 9) };
    const total = coins.quarters * 25 + coins.dimes * 10 + coins.nickels * 5 + coins.pennies;
    const dollars = Math.floor(total / 100);
    const cents = total % 100;
    const parts: string[] = [];
    if (coins.quarters) parts.push(`${coins.quarters} quarter${coins.quarters > 1 ? "s" : ""}`);
    if (coins.dimes) parts.push(`${coins.dimes} dime${coins.dimes > 1 ? "s" : ""}`);
    if (coins.nickels) parts.push(`${coins.nickels} nickel${coins.nickels > 1 ? "s" : ""}`);
    if (coins.pennies) parts.push(`${coins.pennies} penn${coins.pennies > 1 ? "ies" : "y"}`);
    const q = `How much money is ${parts.join(", ")}?`;
    const ans = dollars > 0 ? `$${dollars}.${cents.toString().padStart(2, "0")}` : `${total}¢`;
    const hints = [`Quarters = ${coins.quarters * 25}¢, dimes = ${coins.dimes * 10}¢, nickels = ${coins.nickels * 5}¢, pennies = ${coins.pennies}¢.`];
    const sol = `${coins.quarters * 25} + ${coins.dimes * 10} + ${coins.nickels * 5} + ${coins.pennies} = ${total}¢ = ${ans}.`;
    return makeProblem("money-coins-bills", difficulty, index, q, ans, hints, sol);
  },
};

export const unitConversion: Generator = {
  topicId: "unit-conversion",
  generate(difficulty, index, rng) {
    type Conv = { from: string; to: string; factor: number };
    const easy: Conv[] = [
      { from: "feet", to: "inches", factor: 12 },
      { from: "yards", to: "feet", factor: 3 },
      { from: "meters", to: "centimeters", factor: 100 },
    ];
    const medium: Conv[] = [
      ...easy,
      { from: "kilometers", to: "meters", factor: 1000 },
      { from: "pounds", to: "ounces", factor: 16 },
      { from: "gallons", to: "quarts", factor: 4 },
    ];
    const hard: Conv[] = [
      ...medium,
      { from: "miles", to: "feet", factor: 5280 },
      { from: "tons", to: "pounds", factor: 2000 },
    ];
    const conv = rng.pick(difficulty === "easy" ? easy : difficulty === "medium" ? medium : hard);
    const n = rng.int(1, difficulty === "easy" ? 5 : difficulty === "medium" ? 10 : 20);
    const result = n * conv.factor;
    const q = `Convert ${n} ${conv.from} to ${conv.to}.`;
    const ans = `${result}`;
    const hints = [`1 ${conv.from.replace(/s$/, "")} = ${conv.factor} ${conv.to}.`, `Multiply: ${n} × ${conv.factor}.`];
    const sol = `${n} ${conv.from} × ${conv.factor} = ${result} ${conv.to}.`;
    return makeProblem("unit-conversion", difficulty, index, q, ans, hints, sol);
  },
};

export const meanMedianMode: Generator = {
  topicId: "mean-median-mode",
  generate(difficulty, index, rng) {
    const stat = rng.pick(["mean", "median", "mode"]);
    const len = difficulty === "easy" ? 3 : difficulty === "medium" ? 5 : 7;
    let data: number[];
    if (stat === "mode") {
      // Ensure there's a mode
      data = Array.from({ length: len }, () => rng.int(1, difficulty === "easy" ? 10 : 20));
      const modeVal = rng.pick(data);
      data[rng.int(0, len - 1)] = modeVal; // ensure at least 2 of the same
      if (data.filter(x => x === modeVal).length < 2) data[0] = modeVal;
    } else {
      data = Array.from({ length: len }, () => rng.int(1, difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 50));
    }
    const sorted = [...data].sort((a, b) => a - b);
    let ans: string;
    if (stat === "mean") {
      const sum = data.reduce((a, b) => a + b, 0);
      const mean = roundTo(sum / len, 1);
      ans = mean % 1 === 0 ? `${mean}` : `${mean}`;
    } else if (stat === "median") {
      ans = len % 2 === 1
        ? `${sorted[Math.floor(len / 2)]}`
        : `${roundTo((sorted[len / 2 - 1] + sorted[len / 2]) / 2, 1)}`;
    } else {
      const freq = new Map<number, number>();
      data.forEach(x => freq.set(x, (freq.get(x) ?? 0) + 1));
      const maxFreq = Math.max(...freq.values());
      const modes = [...freq.entries()].filter(([, v]) => v === maxFreq && v > 1).map(([k]) => k).sort((a, b) => a - b);
      ans = modes.length > 0 ? modes.join(", ") : "no mode";
    }
    const q = `Find the ${stat} of: ${data.join(", ")}`;
    const hints = stat === "mean"
      ? [`Add all numbers, then divide by ${len}.`]
      : stat === "median"
      ? [`First, put the numbers in order: ${sorted.join(", ")}.`]
      : [`Count how often each number appears.`];
    const sol = stat === "mean"
      ? `Sum = ${data.reduce((a, b) => a + b, 0)}. Mean = ${data.reduce((a, b) => a + b, 0)} ÷ ${len} = ${ans}.`
      : stat === "median"
      ? `Ordered: ${sorted.join(", ")}. Median = ${ans}.`
      : `${ans === "no mode" ? "No number appears more than once." : `${ans} appears most often.`}`;
    return makeProblem("mean-median-mode", difficulty, index, q, ans, hints, sol);
  },
};

// --- Geometry ---

export const perimeter: Generator = {
  topicId: "perimeter",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      // Rectangle with small numbers
      const l = rng.int(2, 8);
      const w = rng.int(2, 8);
      const p = 2 * (l + w);
      const q = `What is the perimeter of a rectangle with length ${l} and width ${w}?`;
      return makeProblem("perimeter", difficulty, index, q, `${p}`, [`Perimeter = 2 × (length + width).`], `P = 2 × (${l} + ${w}) = 2 × ${l + w} = ${p}.`);
    } else if (difficulty === "medium") {
      const s = rng.int(3, 15);
      const p = 4 * s;
      const q = `What is the perimeter of a square with side length ${s}?`;
      return makeProblem("perimeter", difficulty, index, q, `${p}`, [`A square has 4 equal sides.`], `P = 4 × ${s} = ${p}.`);
    } else {
      // Triangle
      const a = rng.int(3, 12);
      const b = rng.int(3, 12);
      const c = rng.int(Math.abs(a - b) + 1, a + b - 1);
      const p = a + b + c;
      const q = `What is the perimeter of a triangle with sides ${a}, ${b}, and ${c}?`;
      return makeProblem("perimeter", difficulty, index, q, `${p}`, [`Add all three sides.`], `P = ${a} + ${b} + ${c} = ${p}.`);
    }
  },
};

export const areaMultiply: Generator = {
  topicId: "area-multiply",
  generate(difficulty, index, rng) {
    let l: number, w: number;
    if (difficulty === "easy") { l = rng.int(2, 6); w = rng.int(2, 6); }
    else if (difficulty === "medium") { l = rng.int(5, 15); w = rng.int(5, 15); }
    else { l = rng.int(10, 30); w = rng.int(10, 30); }
    const area = l * w;
    const q = `What is the area of a rectangle with length ${l} and width ${w}?`;
    const ans = `${area}`;
    const hints = [`Area = length × width.`];
    const sol = `Area = ${l} × ${w} = ${area} square units.`;
    return makeProblem("area-multiply", difficulty, index, q, ans, hints, sol);
  },
};

export const volume: Generator = {
  topicId: "volume",
  generate(difficulty, index, rng) {
    let l: number, w: number, h: number;
    if (difficulty === "easy") { l = rng.int(2, 5); w = rng.int(2, 5); h = rng.int(2, 5); }
    else if (difficulty === "medium") { l = rng.int(3, 10); w = rng.int(3, 10); h = rng.int(3, 10); }
    else { l = rng.int(5, 15); w = rng.int(5, 15); h = rng.int(2, 10); }
    const v = l * w * h;
    const q = `What is the volume of a rectangular prism with length ${l}, width ${w}, and height ${h}?`;
    const ans = `${v}`;
    const hints = [`Volume = length × width × height.`];
    const sol = `V = ${l} × ${w} × ${h} = ${v} cubic units.`;
    return makeProblem("volume", difficulty, index, q, ans, hints, sol);
  },
};

export const coordinatePlane: Generator = {
  topicId: "coordinate-plane",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      const x = rng.int(0, 5);
      const y = rng.int(0, 5);
      const q = `What are the coordinates of a point that is ${x} units right and ${y} units up from the origin?`;
      return makeProblem("coordinate-plane", difficulty, index, q, `(${x}, ${y})`, [`The x-coordinate is how far right, the y-coordinate is how far up.`], `The point is at (${x}, ${y}).`);
    } else if (difficulty === "medium") {
      const x1 = rng.int(1, 8); const y1 = rng.int(1, 8);
      const x2 = rng.int(1, 8); const y2 = rng.int(1, 8);
      const dist = Math.abs(x1 - x2) + Math.abs(y1 - y2);
      const q = `What is the distance between (${x1}, ${y1}) and (${x2}, ${y2}) on a grid (counting horizontal and vertical)?`;
      return makeProblem("coordinate-plane", difficulty, index, q, `${dist}`, [`Count horizontal distance + vertical distance.`], `Horizontal: |${x1} − ${x2}| = ${Math.abs(x1 - x2)}. Vertical: |${y1} − ${y2}| = ${Math.abs(y1 - y2)}. Total = ${dist}.`);
    } else {
      const x = rng.int(1, 10); const y = rng.int(1, 10);
      const dir = rng.pick(["right", "left", "up", "down"]);
      const amt = rng.int(1, 5);
      const nx = dir === "right" ? x + amt : dir === "left" ? x - amt : x;
      const ny = dir === "up" ? y + amt : dir === "down" ? y - amt : y;
      const q = `Start at (${x}, ${y}) and move ${amt} units ${dir}. What is the new point?`;
      return makeProblem("coordinate-plane", difficulty, index, q, `(${nx}, ${ny})`, [`Moving ${dir} changes the ${dir === "right" || dir === "left" ? "x" : "y"}-coordinate.`], `(${x}, ${y}) → (${nx}, ${ny}).`);
    }
  },
};

export const areaCompositeShapes: Generator = {
  topicId: "area-composite-shapes",
  generate(difficulty, index, rng) {
    // L-shape: two rectangles
    const l1 = rng.int(3, difficulty === "easy" ? 6 : 10);
    const w1 = rng.int(2, difficulty === "easy" ? 5 : 8);
    const l2 = rng.int(2, l1 - 1);
    const w2 = rng.int(2, difficulty === "easy" ? 4 : 7);
    const area = l1 * w1 + l2 * w2;
    const q = `An L-shaped figure is made of two rectangles. Rectangle 1 is ${l1} by ${w1}. Rectangle 2 is ${l2} by ${w2}. What is the total area?`;
    const ans = `${area}`;
    const hints = [`Find the area of each rectangle and add them.`];
    const sol = `Area = ${l1} × ${w1} + ${l2} × ${w2} = ${l1 * w1} + ${l2 * w2} = ${area} square units.`;
    return makeProblem("area-composite-shapes", difficulty, index, q, ans, hints, sol);
  },
};

// --- Order of operations / expressions ---

export const orderOfOperations: Generator = {
  topicId: "order-of-operations",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      const a = rng.int(2, 9); const b = rng.int(1, 5); const c = rng.int(1, 5);
      const result = a + b * c;
      const q = `What is ${a} + ${b} × ${c}?`;
      return makeProblem("order-of-operations", difficulty, index, q, `${result}`, [`Multiply first, then add.`], `${b} × ${c} = ${b * c}. Then ${a} + ${b * c} = ${result}.`);
    } else if (difficulty === "medium") {
      const a = rng.int(2, 8); const b = rng.int(2, 6); const c = rng.int(1, 5); const d = rng.int(1, 5);
      const result = a * b + c * d;
      const q = `What is ${a} × ${b} + ${c} × ${d}?`;
      return makeProblem("order-of-operations", difficulty, index, q, `${result}`, [`Do multiplication before addition.`], `${a} × ${b} = ${a * b}. ${c} × ${d} = ${c * d}. ${a * b} + ${c * d} = ${result}.`);
    } else {
      const a = rng.int(2, 5); const b = rng.int(1, 9); const c = rng.int(2, 5);
      const result = Math.pow(a, 2) + b * c;
      const q = `What is ${a}² + ${b} × ${c}?`;
      return makeProblem("order-of-operations", difficulty, index, q, `${result}`, [`Exponents first, then multiply, then add.`], `${a}² = ${a * a}. ${b} × ${c} = ${b * c}. ${a * a} + ${b * c} = ${result}.`);
    }
  },
};

export const numericalExpressionsGrouping: Generator = {
  topicId: "numerical-expressions-grouping",
  generate(difficulty, index, rng) {
    if (difficulty === "easy") {
      const a = rng.int(2, 8); const b = rng.int(1, 5); const c = rng.int(1, 5);
      const inner = b + c;
      const result = a * inner;
      const q = `What is ${a} × (${b} + ${c})?`;
      return makeProblem("numerical-expressions-grouping", difficulty, index, q, `${result}`, [`Do the parentheses first: ${b} + ${c} = ${inner}.`], `(${b} + ${c}) = ${inner}. ${a} × ${inner} = ${result}.`);
    } else if (difficulty === "medium") {
      const a = rng.int(2, 6); const b = rng.int(1, 5); const c = rng.int(2, 6); const d = rng.int(1, 5);
      const result = (a + b) * (c - d > 0 ? c - d : d - c);
      const inner1 = a + b;
      const inner2 = Math.abs(c - d);
      const q = `What is (${a} + ${b}) × ${inner2}?`;
      return makeProblem("numerical-expressions-grouping", difficulty, index, q, `${result}`, [`Parentheses first: ${a} + ${b} = ${inner1}.`], `(${a} + ${b}) = ${inner1}. ${inner1} × ${inner2} = ${result}.`);
    } else {
      const a = rng.int(2, 5); const b = rng.int(1, 4); const c = rng.int(2, 5);
      const inner = a + b;
      const result = Math.pow(inner, 2) - c;
      const q = `What is (${a} + ${b})² − ${c}?`;
      return makeProblem("numerical-expressions-grouping", difficulty, index, q, `${result}`, [`Parentheses: ${a} + ${b} = ${inner}. Then square it.`], `(${inner})² = ${inner * inner}. ${inner * inner} − ${c} = ${result}.`);
    }
  },
};

export const k5FractionDecimalGenerators: Generator[] = [
  fractionsNumberLine, equivalentFractions3, compareFractions3,
  equivalentFractions4, compareFractions4,
  addSubtractFractions, multiplyFractionByWhole, addSubtractFractionsUnlike,
  multiplyFractions, divideFractions,
  improperFractionsMixed, addSubtractMixedNumbers, addSubtractMixedNumbersUnlike, multiplyMixedNumbers,
  fractionDecimalEquivalence, compareDecimals, roundDecimals, decimalOperations,
  moneyCoins, unitConversion, meanMedianMode,
  perimeter, areaMultiply, volume, coordinatePlane, areaCompositeShapes,
  orderOfOperations, numericalExpressionsGrouping,
];
