import type {
  Problem,
  AssessmentType,
  NumericalInputProperties,
  MultiStepProperties,
  MatchingProperties,
  MultiSelectProperties,
} from "@learn/shared";

export type GradeResult = {
  correct: boolean;
  score: number; // 0-1, supports partial credit
  details?: string;
};

/** Normalize text for comparison: trim, lowercase, collapse spaces, strip trailing punctuation and common STT artifacts */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")       // collapse whitespace
    .replace(/[.,;:!?]+$/g, "") // strip trailing punctuation (STT often adds "7." or "yes.")
    .replace(/^[.,;:!?]+/g, "") // strip leading punctuation
    .replace(/\s+/g, " ")       // re-collapse after stripping
    .trim();
}

/** Try to extract a numeric value from a string for comparison */
function extractNumber(s: string): number | null {
  // Strip surrounding text to find a number: "7.", "7 ", " 7.0 ", "seven" → 7
  const cleaned = s.replace(/[,\s$%]+/g, "").replace(/[.]$/, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function gradeProblem(problem: Problem, answer: string): GradeResult {
  const type: AssessmentType = problem.type ?? "text-qa";

  switch (type) {
    case "text-qa":
      return gradeTextQa(problem.answer, answer);
    case "numerical-input":
      return gradeNumericalInput(
        problem.answer,
        answer,
        problem.typeProperties as NumericalInputProperties | undefined
      );
    case "multi-step":
      return gradeMultiStep(
        answer,
        problem.typeProperties as MultiStepProperties | undefined
      );
    case "matching":
      return gradeMatching(
        answer,
        problem.typeProperties as MatchingProperties | undefined
      );
    case "multi-select":
      return gradeMultiSelect(
        answer,
        problem.typeProperties as MultiSelectProperties | undefined
      );
    default:
      return gradeTextQa(problem.answer, answer);
  }
}

function gradeTextQa(expected: string, actual: string): GradeResult {
  const normExpected = normalize(expected);
  const normActual = normalize(actual);

  // Exact text match (after normalization)
  if (normActual === normExpected) {
    return { correct: true, score: 1 };
  }

  // Numeric fallback: if both parse as numbers, compare numerically
  // Catches "7." vs "7", "3.0" vs "3", "  7 " vs "7"
  const numExpected = extractNumber(expected);
  const numActual = extractNumber(actual);
  if (numExpected !== null && numActual !== null && numExpected === numActual) {
    return { correct: true, score: 1 };
  }

  return { correct: false, score: 0 };
}

function gradeNumericalInput(
  expected: string,
  actual: string,
  props?: NumericalInputProperties
): GradeResult {
  const studentVal = parseFloat(actual);
  const correctVal = parseFloat(expected);

  if (isNaN(studentVal) || isNaN(correctVal)) {
    return { correct: false, score: 0 };
  }

  const tolerance = props?.tolerance ?? 0;
  const correct = Math.abs(studentVal - correctVal) <= tolerance;
  return { correct, score: correct ? 1 : 0 };
}

function gradeMultiStep(
  answerJson: string,
  props?: MultiStepProperties
): GradeResult {
  if (!props?.steps) {
    return { correct: false, score: 0, details: "No steps defined" };
  }

  let answers: string[];
  try {
    answers = JSON.parse(answerJson);
  } catch {
    return { correct: false, score: 0, details: "Invalid answer format" };
  }

  const steps = props.steps;
  let correctCount = 0;
  for (let i = 0; i < steps.length; i++) {
    if (answers[i] && normalize(answers[i]) === normalize(steps[i].answer)) {
      correctCount++;
    }
  }

  const score = steps.length > 0 ? correctCount / steps.length : 0;
  return {
    correct: correctCount === steps.length,
    score,
    details: `${correctCount}/${steps.length} steps correct`,
  };
}

function gradeMatching(
  answerJson: string,
  props?: MatchingProperties
): GradeResult {
  if (!props?.pairs) {
    return { correct: false, score: 0, details: "No pairs defined" };
  }

  let selections: { left: string; selected: string | null }[];
  try {
    selections = JSON.parse(answerJson);
  } catch {
    return { correct: false, score: 0, details: "Invalid answer format" };
  }

  const pairs = props.pairs;
  let correctCount = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (selections[i] && normalize(selections[i].selected ?? "") === normalize(pairs[i].right)) {
      correctCount++;
    }
  }

  const score = pairs.length > 0 ? correctCount / pairs.length : 0;
  return {
    correct: correctCount === pairs.length,
    score,
    details: `${correctCount}/${pairs.length} pairs correct`,
  };
}

function gradeMultiSelect(
  answerJson: string,
  props?: MultiSelectProperties
): GradeResult {
  if (!props?.correctIndices) {
    return { correct: false, score: 0, details: "No correct answers defined" };
  }

  let selected: number[];
  try {
    selected = JSON.parse(answerJson);
  } catch {
    return { correct: false, score: 0, details: "Invalid answer format" };
  }

  const correct = [...props.correctIndices].sort();
  const sel = [...selected].sort();

  const allCorrect =
    sel.length === correct.length && sel.every((v, i) => v === correct[i]);

  if (allCorrect) {
    return { correct: true, score: 1 };
  }

  // Partial credit: fraction of correct selections minus wrong selections
  const correctSet = new Set(correct);
  const selectedSet = new Set(sel);
  let hits = 0;
  let misses = 0;
  for (const s of selectedSet) {
    if (correctSet.has(s)) hits++;
    else misses++;
  }
  const missed = correct.filter((c) => !selectedSet.has(c)).length;
  const total = correct.length;
  const score = Math.max(0, (hits - misses) / total);

  return {
    correct: false,
    score,
    details: `${hits}/${total} correct, ${misses} wrong, ${missed} missed`,
  };
}
