/**
 * Deterministic answer strategy engine.
 * Resolves simulated answers based on learner profile and problem context.
 */
import type { LearnerProfile, AnswerResult, ConfidenceTendency } from "./types.js";
import { SeededRNG } from "./prng.js";

/**
 * Resolve a simulated answer for a given problem context.
 */
export function resolveAnswer(
  rng: SeededRNG,
  profile: LearnerProfile,
  topic: { id: string; gradeLevel: number },
  difficulty: string,
  cognitiveDemand: string | null,
  phase: string,
  sessionNumber: number
): AnswerResult {
  // Base accuracy from ability curve — interpolate if grade not specified
  let accuracy = getBaseAccuracy(profile, topic.gradeLevel);

  // Check for misconceptions
  for (const m of profile.misconceptions) {
    if (m.target === topic.id || m.target === `grade:${topic.gradeLevel}`) {
      accuracy = m.accuracy;
      break;
    }
  }

  // Difficulty modifier
  if (difficulty === "easy") accuracy = Math.min(1, accuracy + 0.10);
  if (difficulty === "hard") accuracy = Math.max(0, accuracy - 0.15);

  // Cognitive demand modifier
  if (cognitiveDemand === "reasoning" || cognitiveDemand === "error_analysis") {
    accuracy = Math.max(0, accuracy - 0.10);
  }

  // Phase modifier — pretest is harder (no instruction yet), review is slightly easier
  if (phase === "pretest") accuracy = Math.max(0, accuracy - 0.10);
  if (phase === "guided") accuracy = Math.min(1, accuracy + 0.05);
  if (phase === "review") accuracy = Math.min(1, accuracy + 0.05);
  if (phase === "remediation") accuracy = Math.min(1, accuracy + 0.05);

  // Learning gain over sessions
  if (profile.learningGain) {
    const gain = profile.learningGain.abilityDeltaPerSession * sessionNumber;
    accuracy = Math.min(1, accuracy + gain);
  }

  // Resolve correctness
  const correct = rng.chance(accuracy);

  // Response time
  const responseMs = Math.max(
    500,
    Math.round(rng.gaussian(profile.responseSpeed.meanMs, profile.responseSpeed.stddevMs))
  );

  // Confidence based on tendency
  const confidence = resolveConfidence(rng, profile.confidenceTendency, correct, accuracy);

  // Hint seeking
  const hintsToRequest = rng.chance(profile.hintSeekingProbability)
    ? rng.intRange(1, 3)
    : 0;

  return { correct, responseMs, confidence, hintsToRequest };
}

function getBaseAccuracy(profile: LearnerProfile, gradeLevel: number): number {
  // Direct lookup
  if (gradeLevel in profile.abilityCurve) {
    return profile.abilityCurve[gradeLevel];
  }

  // Interpolate between nearest defined grade levels
  const grades = Object.keys(profile.abilityCurve)
    .map(Number)
    .sort((a, b) => a - b);

  if (grades.length === 0) return 0.5;
  if (gradeLevel <= grades[0]) return profile.abilityCurve[grades[0]];
  if (gradeLevel >= grades[grades.length - 1]) return profile.abilityCurve[grades[grades.length - 1]];

  // Find surrounding grades
  let lower = grades[0];
  let upper = grades[grades.length - 1];
  for (const g of grades) {
    if (g <= gradeLevel) lower = g;
    if (g >= gradeLevel && g < upper) upper = g;
  }

  if (lower === upper) return profile.abilityCurve[lower];

  const t = (gradeLevel - lower) / (upper - lower);
  return profile.abilityCurve[lower] * (1 - t) + profile.abilityCurve[upper] * t;
}

function resolveConfidence(
  rng: SeededRNG,
  tendency: ConfidenceTendency,
  correct: boolean,
  accuracy: number
): number {
  switch (tendency) {
    case "overconfident":
      // Always reports high confidence regardless of correctness
      return rng.intRange(4, 5);
    case "underconfident":
      // Always reports low confidence regardless of correctness
      return rng.intRange(1, 2);
    case "calibrated":
      // Confidence roughly matches actual performance
      if (correct) return rng.intRange(3, 5);
      return rng.intRange(1, 3);
  }
}
