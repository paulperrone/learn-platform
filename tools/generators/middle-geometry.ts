/**
 * Grades 6-8 geometry, statistics, and polynomial generators.
 */
import type { Difficulty, Generator, Problem, SeededRng } from "./types.js";
import { roundTo } from "./math-utils.js";

function makeProblem(topicId: string, difficulty: Difficulty, index: number, q: string, a: string, hints: string[], solution: string): Problem {
  return {
    id: `${topicId}-gen-${difficulty[0]}${index}`,
    topicId, difficulty, question: q, answer: a, hints, solution,
    cognitiveDemand: "procedural", source: "generated",
  };
}

const PI = Math.PI;

// --- Geometry ---

export const areaTriangles: Generator = {
  topicId: "area-triangles",
  generate(difficulty, index, rng) {
    const b = rng.int(difficulty === "easy" ? 2 : 5, difficulty === "easy" ? 10 : 20);
    const h = rng.int(difficulty === "easy" ? 2 : 4, difficulty === "easy" ? 10 : 18);
    const area = b * h / 2;
    return makeProblem("area-triangles", difficulty, index,
      `What is the area of a triangle with base ${b} and height ${h}?`, `${area}`,
      [`Area = ½ × base × height.`],
      `A = ½ × ${b} × ${h} = ${area} square units.`);
  },
};

export const areaQuadrilaterals: Generator = {
  topicId: "area-quadrilaterals",
  generate(difficulty, index, rng) {
    const shape = rng.pick(difficulty === "easy" ? ["rectangle", "square"] : ["rectangle", "parallelogram", "trapezoid"]);
    if (shape === "rectangle" || shape === "square") {
      const l = rng.int(3, 15);
      const w = shape === "square" ? l : rng.int(3, 15);
      return makeProblem("area-quadrilaterals", difficulty, index,
        `What is the area of a ${shape} with ${shape === "square" ? `side ${l}` : `length ${l} and width ${w}`}?`, `${l * w}`,
        [`Area = length × width.`],
        `A = ${l} × ${w} = ${l * w} square units.`);
    } else if (shape === "parallelogram") {
      const b = rng.int(3, 15);
      const h = rng.int(3, 12);
      return makeProblem("area-quadrilaterals", difficulty, index,
        `What is the area of a parallelogram with base ${b} and height ${h}?`, `${b * h}`,
        [`Area = base × height.`],
        `A = ${b} × ${h} = ${b * h} square units.`);
    } else {
      const b1 = rng.int(3, 10);
      const b2 = rng.int(5, 15);
      const h = rng.int(3, 10);
      const area = (b1 + b2) * h / 2;
      return makeProblem("area-quadrilaterals", difficulty, index,
        `What is the area of a trapezoid with bases ${b1} and ${b2} and height ${h}?`, `${area}`,
        [`Area = ½(b₁ + b₂) × h.`],
        `A = ½(${b1} + ${b2}) × ${h} = ½ × ${b1 + b2} × ${h} = ${area} square units.`);
    }
  },
};

export const areaPolygons: Generator = {
  topicId: "area-polygons",
  generate(difficulty, index, rng) {
    // Composite: rectangle + triangle
    const l = rng.int(4, 12);
    const w = rng.int(3, 8);
    const triH = rng.int(2, 6);
    const rectArea = l * w;
    const triArea = l * triH / 2;
    const total = rectArea + triArea;
    return makeProblem("area-polygons", difficulty, index,
      `A polygon is made of a rectangle (${l} × ${w}) with a triangle on top (base ${l}, height ${triH}). What is the total area?`, `${total}`,
      [`Find rectangle area + triangle area.`],
      `Rectangle: ${l} × ${w} = ${rectArea}. Triangle: ½ × ${l} × ${triH} = ${triArea}. Total = ${total}.`);
  },
};

export const surfaceAreaPrisms: Generator = {
  topicId: "surface-area-prisms",
  generate(difficulty, index, rng) {
    const l = rng.int(2, difficulty === "easy" ? 6 : 10);
    const w = rng.int(2, difficulty === "easy" ? 6 : 10);
    const h = rng.int(2, difficulty === "easy" ? 6 : 10);
    const sa = 2 * (l * w + l * h + w * h);
    return makeProblem("surface-area-prisms", difficulty, index,
      `What is the surface area of a rectangular prism with length ${l}, width ${w}, and height ${h}?`, `${sa}`,
      [`SA = 2(lw + lh + wh).`],
      `SA = 2(${l}×${w} + ${l}×${h} + ${w}×${h}) = 2(${l * w} + ${l * h} + ${w * h}) = ${sa} square units.`);
  },
};

export const volumePrisms: Generator = {
  topicId: "volume-prisms",
  generate(difficulty, index, rng) {
    const l = rng.int(2, difficulty === "easy" ? 8 : 12);
    const w = rng.int(2, difficulty === "easy" ? 8 : 12);
    const h = rng.int(2, difficulty === "easy" ? 8 : 12);
    const v = l * w * h;
    return makeProblem("volume-prisms", difficulty, index,
      `What is the volume of a rectangular prism with length ${l}, width ${w}, and height ${h}?`, `${v}`,
      [`V = l × w × h.`],
      `V = ${l} × ${w} × ${h} = ${v} cubic units.`);
  },
};

export const angleRelationships: Generator = {
  topicId: "angle-relationships",
  generate(difficulty, index, rng) {
    const type = rng.pick(["complementary", "supplementary", "vertical"]);
    const angle = rng.int(10, type === "complementary" ? 80 : 170);
    if (type === "complementary") {
      return makeProblem("angle-relationships", difficulty, index,
        `Two angles are complementary. One is ${angle}°. What is the other?`, `${90 - angle}°`,
        [`Complementary angles add to 90°.`],
        `90° − ${angle}° = ${90 - angle}°.`);
    } else if (type === "supplementary") {
      return makeProblem("angle-relationships", difficulty, index,
        `Two angles are supplementary. One is ${angle}°. What is the other?`, `${180 - angle}°`,
        [`Supplementary angles add to 180°.`],
        `180° − ${angle}° = ${180 - angle}°.`);
    } else {
      return makeProblem("angle-relationships", difficulty, index,
        `Two vertical angles are formed. One is ${angle}°. What is the other?`, `${angle}°`,
        [`Vertical angles are equal.`],
        `Vertical angles are congruent: ${angle}°.`);
    }
  },
};

export const triangleAngleSum: Generator = {
  topicId: "triangle-angle-sum",
  generate(difficulty, index, rng) {
    const a = rng.int(20, 80);
    const b = rng.int(20, 160 - a - 20);
    const c = 180 - a - b;
    const q = `A triangle has angles of ${a}° and ${b}°. What is the third angle?`;
    return makeProblem("triangle-angle-sum", difficulty, index, q, `${c}°`,
      [`The angles of a triangle sum to 180°.`],
      `180° − ${a}° − ${b}° = ${c}°.`);
  },
};

export const exteriorAngles: Generator = {
  topicId: "exterior-angles",
  generate(difficulty, index, rng) {
    const a = rng.int(30, 80);
    const b = rng.int(30, 80);
    const exterior = a + b;
    return makeProblem("exterior-angles", difficulty, index,
      `A triangle has two remote interior angles of ${a}° and ${b}°. What is the exterior angle?`, `${exterior}°`,
      [`The exterior angle equals the sum of the two remote interior angles.`],
      `${a}° + ${b}° = ${exterior}°.`);
  },
};

export const parallelLinesTransversal: Generator = {
  topicId: "parallel-lines-transversal",
  generate(difficulty, index, rng) {
    const angle = rng.int(30, 150);
    const type = rng.pick(["alternate interior", "corresponding", "co-interior"]);
    if (type === "co-interior") {
      return makeProblem("parallel-lines-transversal", difficulty, index,
        `Parallel lines cut by a transversal form a ${angle}° angle. What is the co-interior angle?`, `${180 - angle}°`,
        [`Co-interior (same-side interior) angles are supplementary.`],
        `180° − ${angle}° = ${180 - angle}°.`);
    } else {
      return makeProblem("parallel-lines-transversal", difficulty, index,
        `Parallel lines cut by a transversal form a ${angle}° angle. What is the ${type} angle?`, `${angle}°`,
        [`${type.charAt(0).toUpperCase() + type.slice(1)} angles are equal when lines are parallel.`],
        `${type} angles are congruent: ${angle}°.`);
    }
  },
};

export const circumference: Generator = {
  topicId: "circumference",
  generate(difficulty, index, rng) {
    const r = rng.int(1, difficulty === "easy" ? 10 : 20);
    const useRadius = rng.next() > 0.5;
    const c = roundTo(useRadius ? 2 * PI * r : PI * (r * 2), 2);
    const q = useRadius
      ? `What is the circumference of a circle with radius ${r}? (Use π ≈ 3.14)`
      : `What is the circumference of a circle with diameter ${r * 2}? (Use π ≈ 3.14)`;
    const approx = roundTo(useRadius ? 2 * 3.14 * r : 3.14 * r * 2, 2);
    return makeProblem("circumference", difficulty, index, q, `${approx}`,
      [useRadius ? `C = 2πr.` : `C = πd.`],
      `C = ${useRadius ? `2 × 3.14 × ${r}` : `3.14 × ${r * 2}`} = ${approx}.`);
  },
};

export const areaCircles: Generator = {
  topicId: "area-circles",
  generate(difficulty, index, rng) {
    const r = rng.int(1, difficulty === "easy" ? 8 : 15);
    const area = roundTo(3.14 * r * r, 2);
    return makeProblem("area-circles", difficulty, index,
      `What is the area of a circle with radius ${r}? (Use π ≈ 3.14)`, `${area}`,
      [`A = πr².`],
      `A = 3.14 × ${r}² = 3.14 × ${r * r} = ${area}.`);
  },
};

export const volumeCylinders: Generator = {
  topicId: "volume-cylinders",
  generate(difficulty, index, rng) {
    const r = rng.int(1, difficulty === "easy" ? 5 : 10);
    const h = rng.int(2, difficulty === "easy" ? 10 : 15);
    const v = roundTo(3.14 * r * r * h, 2);
    return makeProblem("volume-cylinders", difficulty, index,
      `What is the volume of a cylinder with radius ${r} and height ${h}? (Use π ≈ 3.14)`, `${v}`,
      [`V = πr²h.`],
      `V = 3.14 × ${r}² × ${h} = 3.14 × ${r * r} × ${h} = ${v}.`);
  },
};

export const volumeConesSpheres: Generator = {
  topicId: "volume-cones-spheres",
  generate(difficulty, index, rng) {
    const shape = rng.pick(["cone", "sphere"]);
    const r = rng.int(1, difficulty === "easy" ? 5 : 10);
    if (shape === "cone") {
      const h = rng.int(2, 12);
      const v = roundTo(3.14 * r * r * h / 3, 2);
      return makeProblem("volume-cones-spheres", difficulty, index,
        `What is the volume of a cone with radius ${r} and height ${h}? (Use π ≈ 3.14)`, `${v}`,
        [`V = ⅓πr²h.`],
        `V = ⅓ × 3.14 × ${r}² × ${h} = ${v}.`);
    } else {
      const v = roundTo(4 / 3 * 3.14 * r * r * r, 2);
      return makeProblem("volume-cones-spheres", difficulty, index,
        `What is the volume of a sphere with radius ${r}? (Use π ≈ 3.14)`, `${v}`,
        [`V = (4/3)πr³.`],
        `V = (4/3) × 3.14 × ${r}³ = ${v}.`);
    }
  },
};

export const pythagoreanTheorem: Generator = {
  topicId: "pythagorean-theorem",
  generate(difficulty, index, rng) {
    // Generate Pythagorean triples
    const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [12, 16, 20]];
    const [a, b, c] = rng.pick(difficulty === "easy" ? triples.slice(0, 3) : triples);
    const mult = difficulty === "hard" ? rng.int(2, 3) : 1;
    const A = a * mult, B = b * mult, C = c * mult;
    const q = `A right triangle has legs ${A} and ${B}. What is the hypotenuse?`;
    return makeProblem("pythagorean-theorem", difficulty, index, q, `${C}`,
      [`a² + b² = c². ${A}² + ${B}² = ?`],
      `${A}² + ${B}² = ${A * A} + ${B * B} = ${C * C}. √${C * C} = ${C}.`);
  },
};

export const pythagoreanConverse: Generator = {
  topicId: "pythagorean-converse",
  generate(difficulty, index, rng) {
    const isRight = rng.next() > 0.4;
    if (isRight) {
      const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17]];
      const [a, b, c] = rng.pick(triples);
      return makeProblem("pythagorean-converse", difficulty, index,
        `Do the sides ${a}, ${b}, ${c} form a right triangle?`, "yes",
        [`Check: ${a}² + ${b}² = ${c}²?`],
        `${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b}. ${c}² = ${c * c}. Equal, so yes.`);
    } else {
      const a = rng.int(3, 8);
      const b = rng.int(4, 10);
      const c = rng.int(a + b - 2, a + b + 3); // Not a right triangle
      if (a * a + b * b === c * c) return pythagoreanConverse.generate(difficulty, index, rng);
      return makeProblem("pythagorean-converse", difficulty, index,
        `Do the sides ${a}, ${b}, ${c} form a right triangle?`, "no",
        [`Check: ${a}² + ${b}² = ${c}²?`],
        `${a}² + ${b}² = ${a * a + b * b}. ${c}² = ${c * c}. Not equal, so no.`);
    }
  },
};

export const pythagoreanApplications: Generator = {
  topicId: "pythagorean-applications",
  generate(difficulty, index, rng) {
    const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]];
    const [a, b, c] = rng.pick(triples);
    const mult = difficulty === "hard" ? rng.int(2, 4) : rng.int(1, 2);
    const A = a * mult, B = b * mult, C = c * mult;
    // Find missing leg
    const q = `A right triangle has hypotenuse ${C} and one leg ${A}. What is the other leg?`;
    return makeProblem("pythagorean-applications", difficulty, index, q, `${B}`,
      [`c² − a² = b². ${C}² − ${A}² = ?`],
      `${C}² − ${A}² = ${C * C} − ${A * A} = ${B * B}. √${B * B} = ${B}.`);
  },
};

export const transformationsIntro: Generator = {
  topicId: "transformations-intro",
  generate(difficulty, index, rng) {
    const type = rng.pick(["translation", "reflection"]);
    const x = rng.int(-5, 5);
    const y = rng.int(-5, 5);
    if (type === "translation") {
      const dx = rng.int(-5, 5);
      const dy = rng.int(-5, 5);
      const q = `Translate (${x}, ${y}) by (${dx}, ${dy}). What is the new point?`;
      return makeProblem("transformations-intro", difficulty, index, q, `(${x + dx}, ${y + dy})`,
        [`Add the translation to each coordinate.`],
        `(${x} + ${dx}, ${y} + ${dy}) = (${x + dx}, ${y + dy}).`);
    } else {
      const axis = rng.pick(["x-axis", "y-axis"]);
      const nx = axis === "y-axis" ? -x : x;
      const ny = axis === "x-axis" ? -y : y;
      const q = `Reflect (${x}, ${y}) over the ${axis}. What is the new point?`;
      return makeProblem("transformations-intro", difficulty, index, q, `(${nx}, ${ny})`,
        [`Reflecting over the ${axis} changes the ${axis === "x-axis" ? "y" : "x"}-coordinate sign.`],
        `(${x}, ${y}) → (${nx}, ${ny}).`);
    }
  },
};

export const dilations: Generator = {
  topicId: "dilations",
  generate(difficulty, index, rng) {
    const x = rng.int(1, 8);
    const y = rng.int(1, 8);
    const k = rng.pick(difficulty === "easy" ? [2, 3] : [2, 3, 4, 0.5]);
    const nx = x * k;
    const ny = y * k;
    const q = `Dilate (${x}, ${y}) by scale factor ${k} from the origin. What is the new point?`;
    return makeProblem("dilations", difficulty, index, q, `(${nx}, ${ny})`,
      [`Multiply each coordinate by the scale factor.`],
      `(${x} × ${k}, ${y} × ${k}) = (${nx}, ${ny}).`);
  },
};

export const cubeRoots: Generator = {
  topicId: "cube-roots",
  generate(difficulty, index, rng) {
    const n = rng.pick(difficulty === "easy" ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6, 7, 8, 10]);
    const cube = n * n * n;
    const q = `What is the cube root of ${cube}?`;
    return makeProblem("cube-roots", difficulty, index, q, `${n}`,
      [`What number × itself × itself = ${cube}?`],
      `∛${cube} = ${n} because ${n}³ = ${cube}.`);
  },
};

export const scientificNotation: Generator = {
  topicId: "scientific-notation",
  generate(difficulty, index, rng) {
    if (rng.next() > 0.5) {
      // Standard to scientific
      const coeff = roundTo(rng.int(10, 99) / 10, 1);
      const exp = rng.int(difficulty === "easy" ? 2 : -4, difficulty === "easy" ? 6 : 8);
      const value = coeff * Math.pow(10, exp);
      const q = `Write ${value} in scientific notation.`;
      return makeProblem("scientific-notation", difficulty, index, q, `${coeff} × 10^${exp}`,
        [`Move the decimal point until you have a number between 1 and 10.`],
        `${value} = ${coeff} × 10^${exp}.`);
    } else {
      // Scientific to standard
      const coeff = roundTo(rng.int(10, 99) / 10, 1);
      const exp = rng.int(1, 5);
      const value = coeff * Math.pow(10, exp);
      const q = `Write ${coeff} × 10^${exp} in standard form.`;
      return makeProblem("scientific-notation", difficulty, index, q, `${value}`,
        [`Move the decimal ${exp} places to the right.`],
        `${coeff} × 10^${exp} = ${value}.`);
    }
  },
};

// --- Statistics ---

export const measuresOfCenter: Generator = {
  topicId: "measures-of-center",
  generate(difficulty, index, rng) {
    const len = difficulty === "easy" ? 5 : difficulty === "medium" ? 7 : 9;
    const data = Array.from({ length: len }, () => rng.int(1, difficulty === "easy" ? 20 : 50)).sort((a, b) => a - b);
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = roundTo(sum / len, 1);
    const median = len % 2 === 1 ? data[Math.floor(len / 2)] : roundTo((data[len / 2 - 1] + data[len / 2]) / 2, 1);
    const stat = rng.pick(["mean", "median"]);
    const q = `Find the ${stat}: ${data.join(", ")}`;
    const ans = stat === "mean" ? `${mean}` : `${median}`;
    return makeProblem("measures-of-center", difficulty, index, q, ans,
      stat === "mean" ? [`Sum all values and divide by ${len}.`] : [`Data is sorted. Find the middle value.`],
      stat === "mean" ? `Sum = ${sum}. Mean = ${sum}/${len} = ${mean}.` : `Median = ${median}.`);
  },
};

export const measuresOfVariability: Generator = {
  topicId: "measures-of-variability",
  generate(difficulty, index, rng) {
    const len = difficulty === "easy" ? 5 : 7;
    const data = Array.from({ length: len }, () => rng.int(1, 30)).sort((a, b) => a - b);
    const range = data[data.length - 1] - data[0];
    const q = `Find the range: ${data.join(", ")}`;
    return makeProblem("measures-of-variability", difficulty, index, q, `${range}`,
      [`Range = maximum − minimum.`],
      `Range = ${data[data.length - 1]} − ${data[0]} = ${range}.`);
  },
};

export const compoundProbability: Generator = {
  topicId: "compound-probability",
  generate(difficulty, index, rng) {
    const n1 = rng.int(1, 6);
    const d1 = 6;
    const n2 = rng.int(1, difficulty === "easy" ? 2 : 4);
    const d2 = difficulty === "easy" ? 2 : rng.pick([4, 6, 8]);
    const pN = n1 * n2;
    const pD = d1 * d2;
    const g = Math.abs(pN) > 0 ? (() => { let a = pN, b = pD; while (b) { [a, b] = [b, a % b]; } return a; })() : 1;
    const q = `A die shows ${n1} or less, and a coin shows heads (1/${d2 === 2 ? 2 : d2} chance). What is the probability of both?`;
    return makeProblem("compound-probability", difficulty, index, q, `${pN / g}/${pD / g}`,
      [`P(A and B) = P(A) × P(B) for independent events.`],
      `${n1}/${d1} × ${n2}/${d2} = ${pN}/${pD} = ${pN / g}/${pD / g}.`);
  },
};

// --- Polynomials ---

export const monomials: Generator = {
  topicId: "monomials",
  generate(difficulty, index, rng) {
    const a = rng.int(2, 8);
    const b = rng.int(2, 8);
    const m = rng.int(1, 4);
    const n = rng.int(1, 4);
    const product = a * b;
    const exp = m + n;
    const q = `Multiply: ${a}x^${m} · ${b}x^${n}`;
    return makeProblem("monomials", difficulty, index, q, `${product}x^${exp}`,
      [`Multiply coefficients. Add exponents.`],
      `${a} × ${b} = ${product}. x^${m} × x^${n} = x^${exp}. Answer: ${product}x^${exp}.`);
  },
};

export const polynomialsClassify: Generator = {
  topicId: "polynomials-classify",
  generate(difficulty, index, rng) {
    const terms = rng.int(1, 3);
    const parts: string[] = [];
    for (let i = 0; i < terms; i++) {
      const coeff = rng.int(1, 9);
      const exp = terms - i;
      parts.push(exp > 0 ? `${coeff}x${exp > 1 ? `^${exp}` : ""}` : `${coeff}`);
    }
    parts.push(`${rng.int(1, 9)}`);
    const name = terms === 1 ? "binomial" : terms === 2 ? "trinomial" : "monomial";
    const degree = terms;
    const q = `Classify and give the degree of: ${parts.join(" + ")}`;
    return makeProblem("polynomials-classify", difficulty, index, q, `${name}, degree ${degree}`,
      [`Count the terms to classify. The degree is the highest exponent.`],
      `${parts.length} terms = ${name}. Highest exponent = ${degree}.`);
  },
};

export const addSubtractPolynomials: Generator = {
  topicId: "add-subtract-polynomials",
  generate(difficulty, index, rng) {
    const a = rng.int(1, 8);
    const b = rng.int(1, 8);
    const c = rng.int(1, 8);
    const d = rng.int(1, 8);
    const isAdd = rng.next() > 0.5;
    const op = isAdd ? "+" : "−";
    const resX = isAdd ? a + c : a - c;
    const resC = isAdd ? b + d : b - d;
    const q = `Simplify: (${a}x + ${b}) ${op} (${c}x + ${d})`;
    const ans = `${resX}x ${resC >= 0 ? "+" : "−"} ${Math.abs(resC)}`;
    return makeProblem("add-subtract-polynomials", difficulty, index, q, ans,
      [`Combine like terms.`],
      `${isAdd ? "Add" : "Subtract"} x terms: ${a} ${op} ${c} = ${resX}. Constants: ${b} ${op} ${d} = ${resC}.`);
  },
};

export const multiplyPolynomialsMonomial: Generator = {
  topicId: "multiply-polynomials-monomial",
  generate(difficulty, index, rng) {
    const a = rng.int(2, 6);
    const b = rng.int(1, 8);
    const c = rng.int(1, 8);
    const q = `Expand: ${a}x(${b}x + ${c})`;
    return makeProblem("multiply-polynomials-monomial", difficulty, index, q, `${a * b}x^2 + ${a * c}x`,
      [`Distribute ${a}x to each term inside.`],
      `${a}x × ${b}x = ${a * b}x². ${a}x × ${c} = ${a * c}x. Answer: ${a * b}x² + ${a * c}x.`);
  },
};

export const multiplyBinomials: Generator = {
  topicId: "multiply-binomials",
  generate(difficulty, index, rng) {
    const a = rng.int(1, difficulty === "easy" ? 3 : 5);
    const b = rng.int(1, difficulty === "easy" ? 5 : 8);
    const c = rng.int(1, difficulty === "easy" ? 3 : 5);
    const d = rng.int(1, difficulty === "easy" ? 5 : 8);
    const x2 = a * c;
    const x1 = a * d + b * c;
    const x0 = b * d;
    const q = `Expand: (${a}x + ${b})(${c}x + ${d})`;
    return makeProblem("multiply-binomials", difficulty, index, q, `${x2}x^2 + ${x1}x + ${x0}`,
      [`Use FOIL: First, Outer, Inner, Last.`],
      `F: ${a * c}x². O: ${a * d}x. I: ${b * c}x. L: ${b * d}. Combined: ${x2}x² + ${x1}x + ${x0}.`);
  },
};

export const factorGcfPolynomials: Generator = {
  topicId: "factor-gcf-polynomials",
  generate(difficulty, index, rng) {
    const gcf = rng.int(2, 6);
    const a = rng.int(1, 5);
    const b = rng.int(1, 5);
    const q = `Factor: ${gcf * a}x + ${gcf * b}`;
    return makeProblem("factor-gcf-polynomials", difficulty, index, q, `${gcf}(${a}x + ${b})`,
      [`Find the GCF of ${gcf * a} and ${gcf * b}: ${gcf}.`],
      `GCF = ${gcf}. ${gcf * a}x + ${gcf * b} = ${gcf}(${a}x + ${b}).`);
  },
};

export const specialProducts: Generator = {
  topicId: "special-products",
  generate(difficulty, index, rng) {
    const type = rng.pick(["square-sum", "square-diff", "diff-squares"]);
    const a = rng.int(1, difficulty === "easy" ? 4 : 6);
    const b = rng.int(1, difficulty === "easy" ? 5 : 8);
    if (type === "square-sum") {
      const q = `Expand: (${a}x + ${b})²`;
      return makeProblem("special-products", difficulty, index, q, `${a * a}x^2 + ${2 * a * b}x + ${b * b}`,
        [`(a + b)² = a² + 2ab + b².`],
        `(${a}x)² + 2(${a}x)(${b}) + ${b}² = ${a * a}x² + ${2 * a * b}x + ${b * b}.`);
    } else if (type === "square-diff") {
      const q = `Expand: (${a}x − ${b})²`;
      return makeProblem("special-products", difficulty, index, q, `${a * a}x^2 − ${2 * a * b}x + ${b * b}`,
        [`(a − b)² = a² − 2ab + b².`],
        `(${a}x)² − 2(${a}x)(${b}) + ${b}² = ${a * a}x² − ${2 * a * b}x + ${b * b}.`);
    } else {
      const q = `Expand: (${a}x + ${b})(${a}x − ${b})`;
      return makeProblem("special-products", difficulty, index, q, `${a * a}x^2 − ${b * b}`,
        [`(a + b)(a − b) = a² − b².`],
        `(${a}x)² − ${b}² = ${a * a}x² − ${b * b}.`);
    }
  },
};

// --- Graph linear (remaining) ---

export const graphProportionalRelationships: Generator = {
  topicId: "graph-proportional-relationships",
  generate(difficulty, index, rng) {
    const k = rng.int(1, 8);
    const x = rng.int(1, 10);
    const y = k * x;
    const q = `A proportional relationship passes through (0, 0) and (${x}, ${y}). What is the constant of proportionality?`;
    return makeProblem("graph-proportional-relationships", difficulty, index, q, `${k}`,
      [`k = y/x.`],
      `k = ${y}/${x} = ${k}.`);
  },
};

export const slopeTypes: Generator = {
  topicId: "slope-types",
  generate(difficulty, index, rng) {
    const type = rng.pick(["positive", "negative", "zero", "undefined"]);
    const descs: Record<string, [string, string]> = {
      positive: ["A line goes up from left to right. What type of slope?", "The line rises, so the slope is positive."],
      negative: ["A line goes down from left to right. What type of slope?", "The line falls, so the slope is negative."],
      zero: ["A horizontal line has what type of slope?", "A horizontal line has zero slope (rise = 0)."],
      undefined: ["A vertical line has what type of slope?", "A vertical line has undefined slope (run = 0)."],
    };
    return makeProblem("slope-types", difficulty, index, descs[type][0], type,
      [`Think about the rise/run.`], descs[type][1]);
  },
};

export const yIntercept: Generator = {
  topicId: "y-intercept",
  generate(difficulty, index, rng) {
    const m = rng.int(-5, 5);
    const b = rng.int(-10, 10);
    const q = `What is the y-intercept of y = ${m}x ${b >= 0 ? "+" : "−"} ${Math.abs(b)}?`;
    return makeProblem("y-intercept", difficulty, index, q, `${b}`,
      [`The y-intercept is the value of b in y = mx + b.`],
      `In y = ${m}x ${b >= 0 ? "+" : "−"} ${Math.abs(b)}, the y-intercept is ${b}.`);
  },
};

export const graphLinearEquations: Generator = {
  topicId: "graph-linear-equations",
  generate(difficulty, index, rng) {
    const m = rng.int(-3, 3);
    const b = rng.int(-5, 5);
    const x = rng.int(1, 5);
    const y = m * x + b;
    const q = `For y = ${m}x ${b >= 0 ? "+" : "−"} ${Math.abs(b)}, what is y when x = ${x}?`;
    return makeProblem("graph-linear-equations", difficulty, index, q, `${y}`,
      [`Substitute x = ${x}.`],
      `y = ${m}(${x}) ${b >= 0 ? "+" : "−"} ${Math.abs(b)} = ${m * x} ${b >= 0 ? "+" : "−"} ${Math.abs(b)} = ${y}.`);
  },
};

export const compareLinearFunctions: Generator = {
  topicId: "compare-linear-functions",
  generate(difficulty, index, rng) {
    const m1 = rng.int(-3, 3);
    const b1 = rng.int(-5, 5);
    const m2 = rng.int(-3, 3);
    const b2 = rng.int(-5, 5);
    const q = `Which has a steeper slope: y = ${m1}x ${b1 >= 0 ? "+" : "−"} ${Math.abs(b1)} or y = ${m2}x ${b2 >= 0 ? "+" : "−"} ${Math.abs(b2)}?`;
    const steeper = Math.abs(m1) > Math.abs(m2) ? "first" : Math.abs(m2) > Math.abs(m1) ? "second" : "same steepness";
    return makeProblem("compare-linear-functions", difficulty, index, q, steeper,
      [`Compare |m₁| and |m₂|. Larger absolute slope = steeper.`],
      `|${m1}| = ${Math.abs(m1)}, |${m2}| = ${Math.abs(m2)}. ${steeper === "same steepness" ? "Equal steepness." : `The ${steeper} is steeper.`}`);
  },
};

export const linearVsNonlinear: Generator = {
  topicId: "linear-vs-nonlinear",
  generate(difficulty, index, rng) {
    const isLinear = rng.next() > 0.5;
    if (isLinear) {
      const m = rng.int(1, 5);
      const b = rng.int(0, 5);
      const q = `Is y = ${m}x + ${b} linear or nonlinear?`;
      return makeProblem("linear-vs-nonlinear", difficulty, index, q, "linear",
        [`A linear equation has x to the first power only.`],
        `y = ${m}x + ${b} is linear (degree 1 in x).`);
    } else {
      const a = rng.int(1, 3);
      const exp = rng.pick([2, 3]);
      const q = `Is y = ${a}x^${exp} linear or nonlinear?`;
      return makeProblem("linear-vs-nonlinear", difficulty, index, q, "nonlinear",
        [`Check the power of x.`],
        `y = ${a}x^${exp} is nonlinear (degree ${exp} in x).`);
    }
  },
};

export const middleGeometryGenerators: Generator[] = [
  areaTriangles, areaQuadrilaterals, areaPolygons, surfaceAreaPrisms, volumePrisms,
  angleRelationships, triangleAngleSum, exteriorAngles, parallelLinesTransversal,
  circumference, areaCircles, volumeCylinders, volumeConesSpheres,
  pythagoreanTheorem, pythagoreanConverse, pythagoreanApplications,
  transformationsIntro, dilations, cubeRoots, scientificNotation,
  measuresOfCenter, measuresOfVariability, compoundProbability,
  monomials, polynomialsClassify, addSubtractPolynomials,
  multiplyPolynomialsMonomial, multiplyBinomials, factorGcfPolynomials, specialProducts,
  graphProportionalRelationships, slopeTypes, yIntercept, graphLinearEquations,
  compareLinearFunctions, linearVsNonlinear,
];
