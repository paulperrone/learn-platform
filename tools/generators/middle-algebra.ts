/**
 * Grades 6-8 algebra, equations, proportions, percent, and linear function generators.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";
import { roundTo, fractionToString, gcd } from "./math-utils.js";

function makeProblem(topicId: string, difficulty: Difficulty, index: number, q: string, a: string, hints: string[], solution: string): Problem {
  return {
    id: `${topicId}-gen-${difficulty[0]}${index}`,
    topicId, difficulty, question: q, answer: a, hints, solution,
    cognitiveDemand: "procedural", source: "generated",
  };
}

// --- Ratios and Proportions ---

export const equivalentRatios: Generator = {
  topicId: "equivalent-ratios",
  generate(difficulty, index, rng) {
    const a = rng.int(1, difficulty === "easy" ? 5 : 10);
    const b = rng.int(1, difficulty === "easy" ? 5 : 10);
    const mult = rng.int(2, difficulty === "easy" ? 4 : 8);
    const q = `Find the missing value: ${a}:${b} = ${a * mult}:?`;
    return makeProblem("equivalent-ratios", difficulty, index, q, `${b * mult}`,
      [`The first number was multiplied by ${mult}. Do the same to the second.`],
      `${a} × ${mult} = ${a * mult}, so ${b} × ${mult} = ${b * mult}. Answer: ${b * mult}.`);
  },
};

export const unitRates: Generator = {
  topicId: "unit-rates",
  generate(difficulty, index, rng) {
    const rate = rng.int(2, difficulty === "easy" ? 10 : 25);
    const quantity = rng.int(2, difficulty === "easy" ? 5 : 10);
    const total = rate * quantity;
    const units = rng.pick(["miles per hour", "dollars per item", "pages per hour", "words per minute"]);
    const unitParts = units.split(" per ");
    const q = `If you travel ${total} ${unitParts[0]} in ${quantity} ${unitParts[1]}s, what is the unit rate?`;
    return makeProblem("unit-rates", difficulty, index, q, `${rate} ${units}`,
      [`Divide ${total} by ${quantity}.`],
      `${total} ÷ ${quantity} = ${rate} ${units}.`);
  },
};

export const ratioTables: Generator = {
  topicId: "ratio-tables",
  generate(difficulty, index, rng) {
    const a = rng.int(1, 5);
    const b = rng.int(1, 5);
    const mult = rng.int(3, difficulty === "easy" ? 5 : 8);
    const q = `Complete the ratio table. If ${a}:${b}, what is ${a * mult}:?`;
    return makeProblem("ratio-tables", difficulty, index, q, `${b * mult}`,
      [`Each row multiplies both values by the same factor.`],
      `${a * mult} ÷ ${a} = ${mult}. So ? = ${b} × ${mult} = ${b * mult}.`);
  },
};

export const proportionsIntro: Generator = {
  topicId: "proportions-intro",
  generate(difficulty, index, rng) {
    const a = rng.int(2, 8);
    const b = rng.int(2, 8);
    const mult = rng.int(2, difficulty === "easy" ? 5 : 10);
    const q = `Solve: ${a}/${b} = ${a * mult}/x`;
    return makeProblem("proportions-intro", difficulty, index, q, `${b * mult}`,
      [`Cross multiply: ${a} × x = ${b} × ${a * mult}.`],
      `${a}x = ${b * a * mult}. x = ${b * mult}.`);
  },
};

export const proportionalRelationships: Generator = {
  topicId: "proportional-relationships",
  generate(difficulty, index, rng) {
    const k = rng.int(2, difficulty === "easy" ? 5 : 10);
    const x = rng.int(1, difficulty === "easy" ? 5 : 12);
    const y = k * x;
    const q = `If y is proportional to x with constant k = ${k}, what is y when x = ${x}?`;
    return makeProblem("proportional-relationships", difficulty, index, q, `${y}`,
      [`y = kx. Substitute k = ${k} and x = ${x}.`],
      `y = ${k} × ${x} = ${y}.`);
  },
};

export const constantOfProportionality: Generator = {
  topicId: "constant-of-proportionality",
  generate(difficulty, index, rng) {
    const k = rng.int(2, difficulty === "easy" ? 6 : 12);
    const x = rng.int(2, 8);
    const y = k * x;
    const q = `The table shows x = ${x} and y = ${y}. If y is proportional to x, what is the constant of proportionality?`;
    return makeProblem("constant-of-proportionality", difficulty, index, q, `${k}`,
      [`Divide y by x.`],
      `k = y/x = ${y}/${x} = ${k}.`);
  },
};

// --- Percent ---

export const percentOfANumber: Generator = {
  topicId: "percent-of-a-number",
  generate(difficulty, index, rng) {
    const pct = difficulty === "easy" ? rng.pick([10, 20, 25, 50]) : rng.int(5, 95);
    const whole = difficulty === "easy" ? rng.pick([50, 100, 200]) : rng.int(20, 500);
    const result = roundTo(pct / 100 * whole, 2);
    const q = `What is ${pct}% of ${whole}?`;
    return makeProblem("percent-of-a-number", difficulty, index, q, `${result}`,
      [`Convert ${pct}% to a decimal: ${pct / 100}. Multiply by ${whole}.`],
      `${pct}% × ${whole} = ${pct / 100} × ${whole} = ${result}.`);
  },
};

export const percentIncreaseDecrease: Generator = {
  topicId: "percent-increase-decrease",
  generate(difficulty, index, rng) {
    const isIncrease = rng.next() > 0.5;
    const pct = difficulty === "easy" ? rng.pick([10, 20, 25, 50]) : rng.int(5, 80);
    const original = difficulty === "easy" ? rng.pick([50, 100, 200]) : rng.int(20, 500);
    const change = roundTo(pct / 100 * original, 2);
    const result = isIncrease ? original + change : original - change;
    const word = isIncrease ? "increase" : "decrease";
    const q = `A number is ${original}. After a ${pct}% ${word}, what is the new number?`;
    return makeProblem("percent-increase-decrease", difficulty, index, q, `${result}`,
      [`Find ${pct}% of ${original}: ${change}. Then ${isIncrease ? "add" : "subtract"}.`],
      `${pct}% of ${original} = ${change}. ${original} ${isIncrease ? "+" : "−"} ${change} = ${result}.`);
  },
};

export const taxTipMarkup: Generator = {
  topicId: "tax-tip-markup",
  generate(difficulty, index, rng) {
    const type = rng.pick(["tax", "tip", "markup"]);
    const rate = difficulty === "easy" ? rng.pick([5, 10, 15, 20]) : rng.int(3, 25);
    const price = roundTo(rng.int(5, difficulty === "easy" ? 50 : 200) + rng.int(0, 99) / 100, 2);
    const amount = roundTo(rate / 100 * price, 2);
    const total = roundTo(price + amount, 2);
    const q = `A meal costs $${price.toFixed(2)}. With ${rate}% ${type}, what is the total?`;
    return makeProblem("tax-tip-markup", difficulty, index, q, `$${total.toFixed(2)}`,
      [`Find ${rate}% of $${price.toFixed(2)}: $${amount.toFixed(2)}. Add to original.`],
      `${rate}% × $${price.toFixed(2)} = $${amount.toFixed(2)}. Total = $${price.toFixed(2)} + $${amount.toFixed(2)} = $${total.toFixed(2)}.`);
  },
};

export const simpleInterest: Generator = {
  topicId: "simple-interest",
  generate(difficulty, index, rng) {
    const p = rng.pick(difficulty === "easy" ? [100, 200, 500] : [250, 500, 1000, 2000, 5000]);
    const r = rng.pick(difficulty === "easy" ? [5, 10] : [3, 4, 5, 6, 8, 10]);
    const t = rng.int(1, difficulty === "easy" ? 3 : 5);
    const interest = roundTo(p * r / 100 * t, 2);
    const q = `Find the simple interest on $${p} at ${r}% for ${t} year${t > 1 ? "s" : ""}.`;
    return makeProblem("simple-interest", difficulty, index, q, `$${interest.toFixed(2)}`,
      [`I = P × r × t = ${p} × ${r / 100} × ${t}.`],
      `I = $${p} × ${r / 100} × ${t} = $${interest.toFixed(2)}.`);
  },
};

export const unitRatesComplex: Generator = {
  topicId: "unit-rates-complex",
  generate(difficulty, index, rng) {
    const n1 = rng.int(1, 5); const d1 = rng.pick([2, 3, 4]);
    const n2 = rng.int(1, 5); const d2 = rng.pick([2, 3, 4]);
    const rate = roundTo((n1 / d1) / (n2 / d2), 3);
    const q = `Find the unit rate: ${fractionToString(n1, d1)} miles in ${fractionToString(n2, d2)} hours.`;
    return makeProblem("unit-rates-complex", difficulty, index, q, `${rate} miles per hour`,
      [`Divide: ${fractionToString(n1, d1)} ÷ ${fractionToString(n2, d2)}.`],
      `${fractionToString(n1, d1)} ÷ ${fractionToString(n2, d2)} = ${rate} mph.`);
  },
};

export const percentEquations: Generator = {
  topicId: "percent-equations",
  generate(difficulty, index, rng) {
    const type = rng.pick(["find-part", "find-whole", "find-percent"]);
    const pct = rng.int(10, 90);
    const whole = rng.int(20, difficulty === "easy" ? 100 : 500);
    const part = roundTo(pct / 100 * whole, 1);
    if (type === "find-part") {
      return makeProblem("percent-equations", difficulty, index,
        `What is ${pct}% of ${whole}?`, `${part}`,
        [`Multiply: ${pct/100} × ${whole}.`],
        `${pct}% of ${whole} = ${part}.`);
    } else if (type === "find-whole") {
      return makeProblem("percent-equations", difficulty, index,
        `${part} is ${pct}% of what number?`, `${whole}`,
        [`Set up: ${part} = ${pct/100} × x. Divide both sides by ${pct/100}.`],
        `${part} ÷ ${pct/100} = ${whole}.`);
    } else {
      return makeProblem("percent-equations", difficulty, index,
        `${part} is what percent of ${whole}?`, `${pct}%`,
        [`Divide: ${part} ÷ ${whole}, then multiply by 100.`],
        `${part} ÷ ${whole} = ${roundTo(pct/100, 3)} = ${pct}%.`);
    }
  },
};

export const percentError: Generator = {
  topicId: "percent-error",
  generate(difficulty, index, rng) {
    const actual = rng.int(10, difficulty === "easy" ? 50 : 200);
    const error = rng.int(1, Math.floor(actual * 0.3));
    const estimated = actual + (rng.next() > 0.5 ? error : -error);
    const pctErr = roundTo(Math.abs(estimated - actual) / actual * 100, 1);
    const q = `Estimated: ${estimated}. Actual: ${actual}. What is the percent error?`;
    return makeProblem("percent-error", difficulty, index, q, `${pctErr}%`,
      [`Percent error = |estimated − actual| / actual × 100.`],
      `|${estimated} − ${actual}| / ${actual} × 100 = ${error}/${actual} × 100 = ${pctErr}%.`);
  },
};

// --- Equations ---

export const evaluateExpressions6: Generator = {
  topicId: "evaluate-expressions-6",
  generate(difficulty, index, rng) {
    const x = rng.int(1, difficulty === "easy" ? 5 : 10);
    if (difficulty === "easy") {
      const a = rng.int(2, 6);
      const b = rng.int(1, 10);
      const result = a * x + b;
      return makeProblem("evaluate-expressions-6", difficulty, index,
        `Evaluate ${a}x + ${b} when x = ${x}.`, `${result}`,
        [`Replace x with ${x}: ${a}(${x}) + ${b}.`],
        `${a}(${x}) + ${b} = ${a * x} + ${b} = ${result}.`);
    } else {
      const a = rng.int(2, 8);
      const b = rng.int(1, 10);
      const c = rng.int(1, 5);
      const result = a * x * x + b * x - c;
      return makeProblem("evaluate-expressions-6", difficulty, index,
        `Evaluate ${a}x² + ${b}x − ${c} when x = ${x}.`, `${result}`,
        [`Substitute x = ${x}: ${a}(${x})² + ${b}(${x}) − ${c}.`],
        `${a}(${x * x}) + ${b}(${x}) − ${c} = ${a * x * x} + ${b * x} − ${c} = ${result}.`);
    }
  },
};

export const distributiveProperty: Generator = {
  topicId: "distributive-property",
  generate(difficulty, index, rng) {
    const a = rng.int(2, difficulty === "easy" ? 5 : 10);
    const b = rng.int(1, 10);
    const c = rng.int(1, 10);
    const result = a * b + a * c;
    const q = `Expand: ${a}(${b} + ${c})`;
    return makeProblem("distributive-property", difficulty, index, q, `${a * b} + ${a * c}`,
      [`Multiply ${a} by each term inside the parentheses.`],
      `${a}(${b} + ${c}) = ${a} × ${b} + ${a} × ${c} = ${a * b} + ${a * c} = ${result}.`);
  },
};

export const oneStepEquationsAddSub: Generator = {
  topicId: "one-step-equations-add-sub",
  generate(difficulty, index, rng) {
    const x = rng.int(difficulty === "easy" ? 1 : -20, difficulty === "easy" ? 10 : 20);
    const b = rng.int(difficulty === "easy" ? 1 : -15, 15);
    const isAdd = rng.next() > 0.5;
    const result = isAdd ? x + b : x - b;
    const eq = isAdd ? `x + ${b} = ${result}` : `x − ${b} = ${result}`;
    const q = `Solve: ${eq}`;
    return makeProblem("one-step-equations-add-sub", difficulty, index, q, `${x}`,
      [isAdd ? `Subtract ${b} from both sides.` : `Add ${b} to both sides.`],
      `${eq}. x = ${x}.`);
  },
};

export const oneStepEquationsMultDiv: Generator = {
  topicId: "one-step-equations-mult-div",
  generate(difficulty, index, rng) {
    const x = rng.int(difficulty === "easy" ? 1 : -10, difficulty === "easy" ? 10 : 15);
    const coeff = rng.int(2, difficulty === "easy" ? 5 : 10);
    const isMult = rng.next() > 0.5;
    if (isMult) {
      const result = coeff * x;
      const q = `Solve: ${coeff}x = ${result}`;
      return makeProblem("one-step-equations-mult-div", difficulty, index, q, `${x}`,
        [`Divide both sides by ${coeff}.`],
        `${coeff}x = ${result}. x = ${result} ÷ ${coeff} = ${x}.`);
    } else {
      const result = x;
      const dividend = x * coeff;
      const q = `Solve: x/${coeff} = ${result}`;
      return makeProblem("one-step-equations-mult-div", difficulty, index, q, `${dividend}`,
        [`Multiply both sides by ${coeff}.`],
        `x/${coeff} = ${result}. x = ${result} × ${coeff} = ${dividend}.`);
    }
  },
};

export const oneStepInequalities: Generator = {
  topicId: "one-step-inequalities",
  generate(difficulty, index, rng) {
    const x = rng.int(-10, 10);
    const b = rng.int(1, 10);
    const op = rng.pick([">", "<", "≥", "≤"]);
    const result = x + b;
    const q = `Solve: x + ${b} ${op} ${result}`;
    return makeProblem("one-step-inequalities", difficulty, index, q, `x ${op} ${x}`,
      [`Subtract ${b} from both sides.`],
      `x + ${b} ${op} ${result}. x ${op} ${x}.`);
  },
};

export const twoStepEquations: Generator = {
  topicId: "two-step-equations",
  generate(difficulty, index, rng) {
    const x = rng.int(difficulty === "easy" ? 1 : -10, difficulty === "easy" ? 10 : 15);
    const a = rng.int(2, difficulty === "easy" ? 5 : 8);
    const b = rng.int(1, difficulty === "easy" ? 10 : 20);
    const result = a * x + b;
    const q = `Solve: ${a}x + ${b} = ${result}`;
    return makeProblem("two-step-equations", difficulty, index, q, `${x}`,
      [`Subtract ${b} from both sides: ${a}x = ${result - b}.`, `Divide by ${a}.`],
      `${a}x + ${b} = ${result}. ${a}x = ${result - b}. x = ${(result - b) / a} = ${x}.`);
  },
};

export const twoStepInequalities: Generator = {
  topicId: "two-step-inequalities",
  generate(difficulty, index, rng) {
    const x = rng.int(-8, 8);
    const a = rng.int(2, 6);
    const b = rng.int(1, 10);
    const op = rng.pick([">", "<"]);
    const result = a * x + b;
    const q = `Solve: ${a}x + ${b} ${op} ${result}`;
    return makeProblem("two-step-inequalities", difficulty, index, q, `x ${op} ${x}`,
      [`Subtract ${b}: ${a}x ${op} ${result - b}. Divide by ${a}.`],
      `${a}x ${op} ${result - b}. x ${op} ${x}.`);
  },
};

export const combineLikeTerms: Generator = {
  topicId: "combine-like-terms",
  generate(difficulty, index, rng) {
    const a = rng.int(1, 8);
    const b = rng.int(1, 8);
    const c = rng.int(1, 8);
    const d = rng.int(1, 8);
    const xCoeff = a + c;
    const constant = b + d;
    const q = `Simplify: ${a}x + ${b} + ${c}x + ${d}`;
    return makeProblem("combine-like-terms", difficulty, index, q, `${xCoeff}x + ${constant}`,
      [`Combine the x terms: ${a}x + ${c}x. Combine the constants: ${b} + ${d}.`],
      `${a}x + ${c}x = ${xCoeff}x. ${b} + ${d} = ${constant}. Result: ${xCoeff}x + ${constant}.`);
  },
};

export const expandFactorExpressions: Generator = {
  topicId: "expand-factor-expressions",
  generate(difficulty, index, rng) {
    const a = rng.int(2, 6);
    const b = rng.int(1, 8);
    const c = rng.int(1, 8);
    if (rng.next() > 0.5) {
      // Expand
      const q = `Expand: ${a}(${b}x + ${c})`;
      return makeProblem("expand-factor-expressions", difficulty, index, q, `${a * b}x + ${a * c}`,
        [`Multiply ${a} by each term inside.`],
        `${a}(${b}x + ${c}) = ${a * b}x + ${a * c}.`);
    } else {
      // Factor
      const g = gcd(a * b, a * c);
      const q = `Factor: ${a * b}x + ${a * c}`;
      return makeProblem("expand-factor-expressions", difficulty, index, q, `${g}(${a * b / g}x + ${a * c / g})`,
        [`Find the GCF of ${a * b} and ${a * c}: ${g}.`],
        `GCF = ${g}. ${a * b}x + ${a * c} = ${g}(${a * b / g}x + ${a * c / g}).`);
    }
  },
};

export const multiStepEquations: Generator = {
  topicId: "multi-step-equations",
  generate(difficulty, index, rng) {
    const x = rng.int(-8, 8);
    const a = rng.int(2, 6);
    const b = rng.int(1, 10);
    const c = rng.int(2, 6);
    const d = rng.int(1, 10);
    const left = a * x + b;
    const right = c * x + d;
    const q = `Solve: ${a}x + ${b} = ${c}x + ${d}`;
    const xResult = (a !== c) ? (d - b) / (a - c) : NaN;
    if (isNaN(xResult) || !Number.isInteger(xResult)) {
      // Fallback to simpler form
      const x2 = rng.int(-5, 5);
      const result = a * x2 + b;
      const q2 = `Solve: ${a}x + ${b} = ${result}`;
      return makeProblem("multi-step-equations", difficulty, index, q2, `${x2}`,
        [`Subtract ${b}: ${a}x = ${result - b}. Divide by ${a}.`],
        `x = ${x2}.`);
    }
    return makeProblem("multi-step-equations", difficulty, index, q, `${xResult}`,
      [`Move x terms to one side: ${a - c}x = ${d - b}.`],
      `${a}x − ${c}x = ${d} − ${b}. ${a - c}x = ${d - b}. x = ${xResult}.`);
  },
};

export const equationsSpecialSolutions: Generator = {
  topicId: "equations-no-one-infinite",
  generate(difficulty, index, rng) {
    const type = rng.pick(["one", "none", "infinite"]);
    const a = rng.int(2, 6);
    const b = rng.int(1, 10);
    if (type === "one") {
      const x = rng.int(-5, 5);
      const result = a * x + b;
      return makeProblem("equations-no-one-infinite", difficulty, index,
        `Solve: ${a}x + ${b} = ${result}`, `${x}`,
        [`This equation has exactly one solution.`],
        `${a}x = ${result - b}. x = ${x}.`);
    } else if (type === "none") {
      return makeProblem("equations-no-one-infinite", difficulty, index,
        `Solve: ${a}x + ${b} = ${a}x + ${b + rng.int(1, 5)}`, "no solution",
        [`Subtract ${a}x from both sides. What do you get?`],
        `${b} ≠ ${b + 1}. No solution.`);
    } else {
      return makeProblem("equations-no-one-infinite", difficulty, index,
        `Solve: ${a}(x + ${b}) = ${a}x + ${a * b}`, "infinitely many solutions",
        [`Expand the left side. What do you notice?`],
        `${a}x + ${a * b} = ${a}x + ${a * b}. True for all x. Infinitely many solutions.`);
    }
  },
};

// --- Linear Functions ---

export const coordinatePlaneFourQuadrants: Generator = {
  topicId: "coordinate-plane-four-quadrants",
  generate(difficulty, index, rng) {
    const x = rng.int(-10, 10);
    const y = rng.int(-10, 10);
    const quadrant = x > 0 && y > 0 ? "I" : x < 0 && y > 0 ? "II" : x < 0 && y < 0 ? "III" : x > 0 && y < 0 ? "IV" : "on an axis";
    const q = `In which quadrant is the point (${x}, ${y})?`;
    return makeProblem("coordinate-plane-four-quadrants", difficulty, index, q, quadrant,
      [`Quadrant I: (+, +). II: (−, +). III: (−, −). IV: (+, −).`],
      `(${x}, ${y}): x is ${x >= 0 ? "positive" : "negative"}, y is ${y >= 0 ? "positive" : "negative"}. Quadrant ${quadrant}.`);
  },
};

export const slopeIntro: Generator = {
  topicId: "slope-intro",
  generate(difficulty, index, rng) {
    const x1 = rng.int(-5, 5); const y1 = rng.int(-5, 5);
    const x2 = rng.int(-5, 5); const y2 = rng.int(-5, 5);
    while (x1 === x2) { return slopeIntro.generate(difficulty, index, rng); }
    const rise = y2 - y1;
    const run = x2 - x1;
    const g = gcd(Math.abs(rise), Math.abs(run));
    const slopeStr = run < 0 ? fractionToString(-rise, -run) : fractionToString(rise, run);
    const q = `Find the slope between (${x1}, ${y1}) and (${x2}, ${y2}).`;
    return makeProblem("slope-intro", difficulty, index, q, slopeStr,
      [`Slope = rise/run = (y₂ − y₁)/(x₂ − x₁).`],
      `(${y2} − ${y1})/(${x2} − ${x1}) = ${rise}/${run} = ${slopeStr}.`);
  },
};

export const slopeInterceptForm: Generator = {
  topicId: "slope-intercept-form",
  generate(difficulty, index, rng) {
    const m = rng.int(-5, 5);
    const b = rng.int(-10, 10);
    const x = rng.int(1, difficulty === "easy" ? 3 : 8);
    const y = m * x + b;
    const q = `Given y = ${m}x + ${b}, find y when x = ${x}.`;
    return makeProblem("slope-intercept-form", difficulty, index, q, `${y}`,
      [`Substitute x = ${x}: y = ${m}(${x}) + ${b}.`],
      `y = ${m}(${x}) + ${b} = ${m * x} + ${b} = ${y}.`);
  },
};

export const writeLinearEquations: Generator = {
  topicId: "write-linear-equations",
  generate(difficulty, index, rng) {
    const m = rng.int(-4, 4);
    const b = rng.int(-8, 8);
    const q = `Write the equation of a line with slope ${m} and y-intercept ${b}.`;
    const bStr = b >= 0 ? `+ ${b}` : `− ${Math.abs(b)}`;
    return makeProblem("write-linear-equations", difficulty, index, q, `y = ${m}x ${bStr}`,
      [`Use slope-intercept form: y = mx + b.`],
      `y = ${m}x ${bStr}.`);
  },
};

export const functionTablesRules: Generator = {
  topicId: "function-tables-rules",
  generate(difficulty, index, rng) {
    const m = rng.int(1, difficulty === "easy" ? 5 : 8);
    const b = rng.int(0, difficulty === "easy" ? 5 : 10);
    const x = rng.int(1, 10);
    const y = m * x + b;
    const q = `If f(x) = ${m}x${b > 0 ? ` + ${b}` : b < 0 ? ` − ${Math.abs(b)}` : ""}, what is f(${x})?`;
    return makeProblem("function-tables-rules", difficulty, index, q, `${y}`,
      [`Substitute: f(${x}) = ${m}(${x})${b !== 0 ? ` + ${b}` : ""}.`],
      `f(${x}) = ${m}(${x})${b !== 0 ? ` + ${b}` : ""} = ${y}.`);
  },
};

export const exponentRules: Generator = {
  topicId: "exponent-rules",
  generate(difficulty, index, rng) {
    const rules = ["product", "quotient", "power"];
    const rule = rng.pick(rules);
    const base = rng.pick(["x", "a", "y"]);
    const m = rng.int(2, 7);
    const n = rng.int(2, 6);
    if (rule === "product") {
      const q = `Simplify: ${base}^${m} · ${base}^${n}`;
      return makeProblem("exponent-rules", difficulty, index, q, `${base}^${m + n}`,
        [`When multiplying same bases, add exponents.`],
        `${base}^${m} · ${base}^${n} = ${base}^(${m}+${n}) = ${base}^${m + n}.`);
    } else if (rule === "quotient") {
      const big = Math.max(m, n) + rng.int(1, 3);
      const small = Math.min(m, n);
      const q = `Simplify: ${base}^${big} / ${base}^${small}`;
      return makeProblem("exponent-rules", difficulty, index, q, `${base}^${big - small}`,
        [`When dividing same bases, subtract exponents.`],
        `${base}^${big} / ${base}^${small} = ${base}^(${big}−${small}) = ${base}^${big - small}.`);
    } else {
      const q = `Simplify: (${base}^${m})^${n}`;
      return makeProblem("exponent-rules", difficulty, index, q, `${base}^${m * n}`,
        [`Power of a power: multiply exponents.`],
        `(${base}^${m})^${n} = ${base}^(${m}×${n}) = ${base}^${m * n}.`);
    }
  },
};

export const negativeExponents: Generator = {
  topicId: "negative-exponents",
  generate(difficulty, index, rng) {
    const base = rng.int(2, difficulty === "easy" ? 5 : 10);
    const exp = rng.int(1, difficulty === "easy" ? 2 : 3);
    const result = Math.pow(base, exp);
    const q = `Simplify: ${base}^(−${exp})`;
    return makeProblem("negative-exponents", difficulty, index, q, `1/${result}`,
      [`A negative exponent means "1 over" the positive power.`],
      `${base}^(−${exp}) = 1/${base}^${exp} = 1/${result}.`);
  },
};

export const systemsSubstitution: Generator = {
  topicId: "systems-substitution",
  generate(difficulty, index, rng) {
    const x = rng.int(-5, 5);
    const y = rng.int(-5, 5);
    const a = rng.int(1, 4);
    const b = rng.int(1, 4);
    const c1 = a * x + b * y;
    const q = `Solve by substitution: y = ${y === 0 ? "0" : `${x > 0 ? "" : "−"}${Math.abs(x)}`}... Simplified: x = ${x}, y = ${y}. Verify: ${a}(${x}) + ${b}(${y}) = ${c1}.`;
    // Better: create a clean system
    const m = rng.int(-3, 3);
    const bIntercept = rng.int(-5, 5);
    const yVal = m * x + bIntercept;
    const a2 = rng.int(1, 4);
    const b2 = rng.int(1, 4);
    const c2 = a2 * x + b2 * yVal;
    const q2 = `Solve: y = ${m}x ${bIntercept >= 0 ? "+ " + bIntercept : "− " + Math.abs(bIntercept)} and ${a2}x + ${b2}y = ${c2}`;
    return makeProblem("systems-substitution", difficulty, index, q2, `x = ${x}, y = ${yVal}`,
      [`Substitute the first equation into the second.`],
      `Substituting y = ${m}(${x}) ${bIntercept >= 0 ? "+" : "−"} ${Math.abs(bIntercept)} = ${yVal}. x = ${x}, y = ${yVal}.`);
  },
};

export const systemsElimination: Generator = {
  topicId: "systems-elimination",
  generate(difficulty, index, rng) {
    const x = rng.int(-5, 5);
    const y = rng.int(-5, 5);
    const a1 = rng.int(1, 4);
    const b1 = rng.int(1, 4);
    const a2 = rng.int(1, 4);
    const b2 = -b1; // Make b coefficients opposites for easy elimination
    const c1 = a1 * x + b1 * y;
    const c2 = a2 * x + b2 * y;
    const q = `Solve: ${a1}x + ${b1}y = ${c1} and ${a2}x + ${b2 >= 0 ? "" : ""}${b2}y = ${c2}`;
    return makeProblem("systems-elimination", difficulty, index, q, `x = ${x}, y = ${y}`,
      [`Add the equations to eliminate y.`],
      `Adding: ${a1 + a2}x = ${c1 + c2}. x = ${x}. Then y = ${y}.`);
  },
};

export const middleAlgebraGenerators: Generator[] = [
  equivalentRatios, unitRates, ratioTables, proportionsIntro,
  proportionalRelationships, constantOfProportionality,
  percentOfANumber, percentIncreaseDecrease, taxTipMarkup, simpleInterest,
  unitRatesComplex, percentEquations, percentError,
  evaluateExpressions6, distributiveProperty,
  oneStepEquationsAddSub, oneStepEquationsMultDiv, oneStepInequalities,
  twoStepEquations, twoStepInequalities,
  combineLikeTerms, expandFactorExpressions, multiStepEquations, equationsSpecialSolutions,
  coordinatePlaneFourQuadrants, slopeIntro, slopeInterceptForm, writeLinearEquations,
  functionTablesRules, exponentRules, negativeExponents,
  systemsSubstitution, systemsElimination,
];
