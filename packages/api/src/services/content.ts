import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import type { Problem, WorkedExample, Lesson, VisualAsset, PresentationLevel, ContentDepthLevel } from "@learn/shared";
import { fetchTopicProblems, fetchTopicExamples, fetchTopicLessons, toBareProblems, toBareExamples, toBareLessons, type BundledProblem, type BundledExample, type BundledLesson, type ContentBucket } from "./content-r2.js";

const CURRENT_YEAR = new Date().getFullYear();

export type PresentationDistribution = {
  primary: number;
  intermediate: number;
  standard: number;
  advanced: number;
  centerLevel: PresentationLevel;
  driftSignal: number; // EMA of drift direction — persisted across sessions
};

const PRESENTATION_LEVELS: PresentationLevel[] = ["primary", "intermediate", "standard", "advanced"];

export function buildDefaultDistribution(birthYear: number | null | undefined): PresentationDistribution {
  let centerIdx: number;
  if (!birthYear) {
    centerIdx = 2; // standard
  } else {
    const age = CURRENT_YEAR - birthYear;
    if (age <= 8) centerIdx = 0;        // primary
    else if (age <= 11) centerIdx = 1;  // intermediate
    else if (age <= 14) centerIdx = 2;  // standard
    else centerIdx = 3;                 // advanced
  }

  const weights = [0, 0, 0, 0];
  weights[centerIdx] = 0.75;
  if (centerIdx > 0) weights[centerIdx - 1] = 0.15;
  if (centerIdx < 3) weights[centerIdx + 1] = 0.10;
  // Edge cases: when center is 0, no level below; when center is 3, no level above
  // Redistribute remainder to center
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum < 1.0) weights[centerIdx] += 1.0 - sum;

  return {
    primary: weights[0],
    intermediate: weights[1],
    standard: weights[2],
    advanced: weights[3],
    centerLevel: PRESENTATION_LEVELS[centerIdx],
    driftSignal: 0,
  };
}

export function sampleFromDistribution(dist: PresentationDistribution): PresentationLevel {
  const r = Math.random();
  let cumulative = 0;
  for (const level of PRESENTATION_LEVELS) {
    cumulative += dist[level];
    if (r < cumulative) return level;
  }
  return dist.centerLevel; // fallback (rounding)
}

// --- Drift rate constants ---
// Two-layer system: signal rates (for EMA direction tracking) and driftRate
// (actual weight change per application). EMA gates WHEN drift happens;
// driftRate controls HOW MUCH weight moves.
//
// Asymmetric rates: failure > success at all positions, so accuracy below
// ~62% creates net downward signal. This fixes struggling profiles drifting
// UP when they get 60% correct at center level.
export const DRIFT_RATES = {
  // Signal magnitudes (input to EMA — larger = stronger pedagogical signal)
  successAtCenter: 0.05,     // moderate upward signal
  failureAtCenter: 0.08,     // strong downward signal — 62% breakeven
  successAboveCenter: 0.10,  // strong upward — genuinely stretching
  failureAboveCenter: 0.06,  // meaningful downward — failing above center means center is too high
  successBelowCenter: 0,     // no signal — expected ease
  failureBelowCenter: 0.08,  // strong downward — genuine struggle
  // Application rate (fixed per-problem weight change when EMA exceeds threshold)
  driftRate: 0.008,          // small per-application delta, ~0.2 per session at 90% accuracy
  snapThreshold: 0.05,       // levels below this snap to 0
  emaAlpha: 0.3,             // EMA smoothing factor (0-1, higher = more responsive)
  emaThreshold: 0.015,       // minimum |signal| to apply drift
  hysteresisThreshold: 0.40, // weight required to become new center (prevents oscillation)
} as const;

export function nudgeDistribution(
  dist: PresentationDistribution,
  servedLevel: PresentationLevel,
  success: boolean,
): PresentationDistribution {
  const levels = [...PRESENTATION_LEVELS];
  const centerIdx = levels.indexOf(dist.centerLevel);
  const servedIdx = levels.indexOf(servedLevel);

  // 1. Compute raw direction signal (signed: positive = up, negative = down)
  let rawSignal = 0;

  if (servedIdx === centerIdx) {
    if (success && centerIdx < 3) {
      rawSignal = DRIFT_RATES.successAtCenter;
    } else if (!success && centerIdx > 0) {
      rawSignal = -DRIFT_RATES.failureAtCenter;
    }
  } else if (servedIdx > centerIdx) {
    rawSignal = success ? DRIFT_RATES.successAboveCenter : -DRIFT_RATES.failureAboveCenter;
  } else {
    // servedIdx < centerIdx
    rawSignal = success ? 0 : -DRIFT_RATES.failureBelowCenter;
  }

  if (rawSignal === 0) return { ...dist };

  // 2. Update EMA drift signal
  const prevSignal = dist.driftSignal ?? 0;
  const newSignal = DRIFT_RATES.emaAlpha * rawSignal + (1 - DRIFT_RATES.emaAlpha) * prevSignal;

  // 3. Only apply weight changes if smoothed signal exceeds threshold
  if (Math.abs(newSignal) < DRIFT_RATES.emaThreshold) {
    return { ...dist, driftSignal: newSignal };
  }

  // 4. Apply fixed driftRate in the direction of the smoothed signal
  const weights: [number, number, number, number] = [dist.primary, dist.intermediate, dist.standard, dist.advanced];
  const delta = DRIFT_RATES.driftRate;

  if (newSignal > 0 && centerIdx < 3) {
    weights[centerIdx] = Math.max(0, weights[centerIdx] - delta);
    weights[centerIdx + 1] += delta;
  } else if (newSignal < 0 && centerIdx > 0) {
    weights[centerIdx] = Math.max(0, weights[centerIdx] - delta);
    weights[centerIdx - 1] += delta;
  } else {
    return { ...dist, driftSignal: newSignal };
  }

  // Snap levels below threshold to 0
  // Redistribute snapped weight to drift target (reinforces direction)
  // instead of highest weight (which can fight drift direction)
  const driftTargetIdx = newSignal > 0
    ? Math.min(3, centerIdx + 1)
    : Math.max(0, centerIdx - 1);
  for (let i = 0; i < 4; i++) {
    if (weights[i] > 0 && weights[i] < DRIFT_RATES.snapThreshold) {
      const snapped = weights[i];
      weights[i] = 0;
      // Give snapped weight to drift target, or center if target is being snapped
      const redistributeIdx = (i === driftTargetIdx) ? centerIdx : driftTargetIdx;
      weights[redistributeIdx] += snapped;
    }
  }

  // Renormalize
  const sum = weights[0] + weights[1] + weights[2] + weights[3];
  if (sum > 0) {
    for (let i = 0; i < 4; i++) weights[i] = weights[i] / sum;
  }

  // 5. Center-level hysteresis: only change center if another level both
  //    (a) exceeds the hysteresis threshold AND (b) exceeds current center by a margin.
  //    This prevents oscillation when two levels have similar weights near the threshold.
  const CENTER_MARGIN = 0.10; // must exceed current center weight by this much
  let newCenterIdx = centerIdx;
  let maxOtherWeight = 0;
  for (let i = 0; i < 4; i++) {
    if (
      i !== centerIdx &&
      weights[i] >= DRIFT_RATES.hysteresisThreshold &&
      weights[i] > weights[centerIdx] + CENTER_MARGIN &&
      weights[i] > maxOtherWeight
    ) {
      newCenterIdx = i;
      maxOtherWeight = weights[i];
    }
  }
  // Fallback: if current center weight collapsed to 0, use highest weight regardless
  if (newCenterIdx === centerIdx && weights[centerIdx] === 0) {
    for (let i = 0; i < 4; i++) {
      if (weights[i] > weights[newCenterIdx]) newCenterIdx = i;
    }
  }

  // If center shifted, reset signal to 0 so system must rebuild momentum
  // before shifting back. This prevents rapid oscillation between adjacent levels.
  const centerShifted = newCenterIdx !== centerIdx;
  const finalSignal = centerShifted ? 0 : newSignal;

  return {
    primary: weights[0],
    intermediate: weights[1],
    standard: weights[2],
    advanced: weights[3],
    centerLevel: levels[newCenterIdx],
    driftSignal: finalSignal,
  };
}

const PRESENTATION_FALLBACK_ORDER: Record<PresentationLevel, PresentationLevel[]> = {
  primary: ["intermediate", "standard", "advanced"],
  intermediate: ["standard", "primary", "advanced"],
  standard: ["intermediate", "advanced", "primary"],
  advanced: ["standard", "intermediate", "primary"],
};

const DEPTH_FALLBACK: ContentDepthLevel[] = ["survey", "contextual", "analytical", "synthesis"];

export type ContentQuery = {
  topicId: string;
  discipline?: string;
  contentDepth: ContentDepthLevel;
  presentation: PresentationLevel;
  locale?: string;
  flavor?: string;
};

export function createContentService(db: DB, contentBucket?: ContentBucket) {
  async function resolvePresentation(userId: string, disciplineId?: string): Promise<PresentationLevel> {
    // Check for explicit override in preferences
    const prefs = await db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (prefs?.presentationOverride) {
      return prefs.presentationOverride as PresentationLevel;
    }

    // If disciplineId provided, check for per-discipline distribution
    if (disciplineId) {
      const dist = await db.query.userDisciplinePresentation.findFirst({
        where: and(
          eq(schema.userDisciplinePresentation.userId, userId),
          eq(schema.userDisciplinePresentation.disciplineId, disciplineId),
        ),
      });
      if (dist) {
        return sampleFromDistribution({
          primary: dist.primaryWeight,
          intermediate: dist.intermediateWeight,
          standard: dist.standardWeight,
          advanced: dist.advancedWeight,
          centerLevel: dist.centerLevel as PresentationLevel,
          driftSignal: dist.driftSignal ?? 0,
        });
      }
    }

    // Fall back to age-based default
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (disciplineId) {
      // Discipline provided but no stored distribution — sample from age default
      const defaultDist = buildDefaultDistribution(user?.birthYear);
      return sampleFromDistribution(defaultDist);
    }
    // No disciplineId — deterministic age-based (backwards compatible)
    if (!user?.birthYear) return "standard";
    const age = CURRENT_YEAR - user.birthYear;
    if (age <= 8) return "primary";
    if (age <= 11) return "intermediate";
    if (age <= 14) return "standard";
    return "advanced";
  }

  async function resolveContentDepth(
    userId: string,
    topicId: string,
    disciplineId: string
  ): Promise<ContentDepthLevel> {
    // Look up discipline's progression model
    const disc = await db.query.disciplines.findFirst({
      where: eq(schema.disciplines.id, disciplineId),
    });
    const model = disc?.progressionModel ?? "mastery-gated";

    // For mastery-gated: always "survey". These disciplines encode analytical
    // progression in the topic graph itself — "adding fractions" IS deeper than
    // "adding whole numbers." Content depth layers (contextual, analytical,
    // synthesis) don't apply. All mastery-gated content should be tagged "survey".
    if (model === "mastery-gated") return "survey";

    // For flexible: always "survey" (topics are independent, no depth progression)
    if (model === "flexible") return "survey";

    // For context-layered: check what depth the user has completed for this topic
    const depthRows = await db
      .select()
      .from(schema.userTopicDepth)
      .where(
        and(
          eq(schema.userTopicDepth.userId, userId),
          eq(schema.userTopicDepth.topicId, topicId),
          eq(schema.userTopicDepth.completed, true)
        )
      );
    const completedDepths = new Set(depthRows.map((r) => r.contentDepth));

    // Return the first uncompleted depth in order
    for (const depth of DEPTH_FALLBACK) {
      if (!completedDepths.has(depth)) return depth;
    }

    // All depths completed — return synthesis (highest)
    return "synthesis";
  }

  /**
   * Compute fallback priority for a content row against the requested dimensions.
   * Lower = better match. Returns -1 if no fallback tier matches (shouldn't happen
   * since tier 7 accepts anything for the topic).
   *
   * Fallback tiers (per content-system.md §6):
   *   0: Exact match on all dimensions
   *   1-3: Adjacent presentation (in fallback order), same depth/locale/flavor
   *   4: Any presentation, same depth/locale, classic flavor
   *   5: Any presentation, same depth, classic flavor, en locale
   *   6: Any presentation, survey depth, classic flavor, en locale
   *   7: Any content for the topic (last resort)
   */
  function contentPriority(
    row: { presentation: string; contentDepth: string; locale: string; flavor: string },
    query: { presentation: PresentationLevel; contentDepth: string; locale: string; flavor: string }
  ): number {
    const presOrder = [query.presentation, ...PRESENTATION_FALLBACK_ORDER[query.presentation]];
    const presIdx = presOrder.indexOf(row.presentation as PresentationLevel);

    const depthMatch = row.contentDepth === query.contentDepth;
    const localeMatch = row.locale === query.locale;
    const flavorMatch = row.flavor === query.flavor;

    // Tier 0-3: presentation match/fallback with exact depth+locale+flavor
    if (depthMatch && localeMatch && flavorMatch && presIdx >= 0) return presIdx;

    // Tier 4: same depth+locale, classic flavor (any presentation in order)
    if (depthMatch && localeMatch && row.flavor === "classic") return 4;

    // Tier 5: same depth, classic+en (any presentation)
    if (depthMatch && row.flavor === "classic" && row.locale === "en") return 5;

    // Tier 6: survey depth, classic+en (any presentation)
    if (row.contentDepth === "survey" && row.flavor === "classic" && row.locale === "en") return 6;

    // Tier 7: any content for the topic
    return 7;
  }

  /** Pick the best-matching group of rows from all content for a topic. */
  function selectBestRows<T extends { presentation: string; contentDepth: string; locale: string; flavor: string }>(
    allRows: T[],
    query: { presentation: PresentationLevel; contentDepth: string; locale: string; flavor: string }
  ): T[] {
    if (allRows.length === 0) return [];

    let bestPriority = 8;
    let bestRows: T[] = [];

    for (const row of allRows) {
      const p = contentPriority(row, query);
      if (p < bestPriority) {
        bestPriority = p;
        bestRows = [row];
      } else if (p === bestPriority) {
        bestRows.push(row);
      }
    }

    return bestRows;
  }

  async function getTopicProblems(query: ContentQuery): Promise<Problem[]> {
    const { topicId, discipline, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    if (!contentBucket || !discipline) return [];

    const bundled = await fetchTopicProblems(contentBucket, discipline, topicId);
    if (bundled.length === 0) return [];

    const best = selectBestRows(bundled, { presentation, contentDepth, locale, flavor });
    return toBareProblems(best);
  }

  async function getTopicExamples(query: ContentQuery): Promise<WorkedExample[]> {
    const { topicId, discipline, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    if (!contentBucket || !discipline) return [];

    const bundled = await fetchTopicExamples(contentBucket, discipline, topicId);
    if (bundled.length === 0) return [];

    const best = selectBestRows(bundled, { presentation, contentDepth, locale, flavor });
    return toBareExamples(best);
  }

  async function getTopicVisuals(query: ContentQuery): Promise<VisualAsset[] | undefined> {
    const examples = await getTopicExamples(query);
    return examples[0]?.visuals;
  }

  async function getTopicLessons(query: ContentQuery): Promise<Lesson[]> {
    const { topicId, discipline, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    if (!contentBucket || !discipline) return [];

    const bundled = await fetchTopicLessons(contentBucket, discipline, topicId);
    if (bundled.length === 0) return [];

    const best = selectBestRows(bundled, { presentation, contentDepth, locale, flavor });
    return toBareLessons(best);
  }

  async function markDepthCompleted(
    userId: string,
    topicId: string,
    contentDepth: ContentDepthLevel
  ): Promise<void> {
    const now = new Date().toISOString();
    // Upsert: insert or update completed status
    const existing = await db
      .select()
      .from(schema.userTopicDepth)
      .where(
        and(
          eq(schema.userTopicDepth.userId, userId),
          eq(schema.userTopicDepth.topicId, topicId),
          eq(schema.userTopicDepth.contentDepth, contentDepth)
        )
      );

    if (existing.length > 0) {
      await db
        .update(schema.userTopicDepth)
        .set({ completed: true, completedAt: now })
        .where(eq(schema.userTopicDepth.id, existing[0].id));
    } else {
      await db.insert(schema.userTopicDepth).values({
        userId,
        topicId,
        contentDepth,
        completed: true,
        completedAt: now,
      });
    }
  }

  async function getCompletedDepths(
    userId: string,
    topicId: string
  ): Promise<ContentDepthLevel[]> {
    const rows = await db
      .select()
      .from(schema.userTopicDepth)
      .where(
        and(
          eq(schema.userTopicDepth.userId, userId),
          eq(schema.userTopicDepth.topicId, topicId),
          eq(schema.userTopicDepth.completed, true)
        )
      );
    return rows.map((r) => r.contentDepth as ContentDepthLevel);
  }

  async function getDisciplineDistribution(
    userId: string,
    disciplineId: string
  ): Promise<PresentationDistribution | null> {
    const row = await db.query.userDisciplinePresentation.findFirst({
      where: and(
        eq(schema.userDisciplinePresentation.userId, userId),
        eq(schema.userDisciplinePresentation.disciplineId, disciplineId),
      ),
    });
    if (!row) return null;
    return {
      primary: row.primaryWeight,
      intermediate: row.intermediateWeight,
      standard: row.standardWeight,
      advanced: row.advancedWeight,
      centerLevel: row.centerLevel as PresentationLevel,
      driftSignal: row.driftSignal ?? 0,
    };
  }

  async function upsertDisciplineDistribution(
    userId: string,
    disciplineId: string,
    dist: PresentationDistribution
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.query.userDisciplinePresentation.findFirst({
      where: and(
        eq(schema.userDisciplinePresentation.userId, userId),
        eq(schema.userDisciplinePresentation.disciplineId, disciplineId),
      ),
    });
    if (existing) {
      await db
        .update(schema.userDisciplinePresentation)
        .set({
          primaryWeight: dist.primary,
          intermediateWeight: dist.intermediate,
          standardWeight: dist.standard,
          advancedWeight: dist.advanced,
          centerLevel: dist.centerLevel,
          driftSignal: dist.driftSignal,
          lastAdjustedAt: now,
        })
        .where(eq(schema.userDisciplinePresentation.id, existing.id));
    } else {
      await db.insert(schema.userDisciplinePresentation).values({
        userId,
        disciplineId,
        primaryWeight: dist.primary,
        intermediateWeight: dist.intermediate,
        standardWeight: dist.standard,
        advancedWeight: dist.advanced,
        centerLevel: dist.centerLevel,
        driftSignal: dist.driftSignal,
        lastAdjustedAt: now,
      });
    }
  }

  async function applyNudge(
    userId: string,
    disciplineId: string,
    servedLevel: PresentationLevel,
    success: boolean
  ): Promise<void> {
    const current = await getDisciplineDistribution(userId, disciplineId);
    if (!current) return; // No distribution to nudge (anonymous or no diagnostic yet)

    const updated = nudgeDistribution(current, servedLevel, success);

    // Detect meaningful transitions for drift log
    const centerShifted = current.centerLevel !== updated.centerLevel;
    const levelEmerged = PRESENTATION_LEVELS.some(
      (l) => current[l] === 0 && updated[l] > 0
    );
    const levelDropped = PRESENTATION_LEVELS.some(
      (l) => current[l] > 0 && updated[l] === 0
    );

    if (centerShifted || levelEmerged || levelDropped) {
      const trigger = centerShifted ? "center_shift" : levelEmerged ? "level_emerged" : "level_dropped";
      const toWeights = { primary: updated.primary, intermediate: updated.intermediate, standard: updated.standard, advanced: updated.advanced };
      const fromWeights = { primary: current.primary, intermediate: current.intermediate, standard: current.standard, advanced: current.advanced };
      await db.insert(schema.presentationDriftLog).values({
        userId,
        disciplineId,
        fromWeights: JSON.stringify(fromWeights),
        toWeights: JSON.stringify(toWeights),
        fromCenter: current.centerLevel,
        toCenter: updated.centerLevel,
        trigger,
        createdAt: new Date().toISOString(),
      });
    }

    await upsertDisciplineDistribution(userId, disciplineId, updated);
  }

  async function getAllDisciplineDistributions(userId: string) {
    const rows = await db
      .select()
      .from(schema.userDisciplinePresentation)
      .where(eq(schema.userDisciplinePresentation.userId, userId));

    return rows.map((row) => ({
      disciplineId: row.disciplineId,
      weights: {
        primary: row.primaryWeight,
        intermediate: row.intermediateWeight,
        standard: row.standardWeight,
        advanced: row.advancedWeight,
      },
      centerLevel: row.centerLevel as PresentationLevel,
      lastAdjustedAt: row.lastAdjustedAt,
    }));
  }

  return {
    resolvePresentation,
    resolveContentDepth,
    getDisciplineDistribution,
    getAllDisciplineDistributions,
    upsertDisciplineDistribution,
    applyNudge,
    markDepthCompleted,
    getCompletedDepths,
    getTopicProblems,
    getTopicExamples,
    getTopicLessons,
    getTopicVisuals,
  };
}

// --- Presentation label ---

const LEVEL_LABELS: Record<PresentationLevel, string> = {
  primary: "Primary",
  intermediate: "Intermediate",
  standard: "Standard",
  advanced: "Advanced",
};

const LEVEL_ORDER: PresentationLevel[] = ["primary", "intermediate", "standard", "advanced"];

export function describePresentationDistribution(
  centerLevel: PresentationLevel,
  weights: Record<PresentationLevel, number>,
): string {
  const centerIdx = LEVEL_ORDER.indexOf(centerLevel);
  const label = LEVEL_LABELS[centerLevel];

  // Find the secondary level (highest weight that isn't center)
  let secondaryLevel: PresentationLevel | null = null;
  let secondaryWeight = 0;
  for (const level of LEVEL_ORDER) {
    if (level !== centerLevel && weights[level] > secondaryWeight) {
      secondaryWeight = weights[level];
      secondaryLevel = level;
    }
  }

  if (!secondaryLevel || secondaryWeight < 0.1) {
    return `Mostly ${label.toLowerCase()}`;
  }

  const secondaryIdx = LEVEL_ORDER.indexOf(secondaryLevel);
  const direction = secondaryIdx > centerIdx ? "stretching into" : "reinforcing";
  return `Mostly ${label.toLowerCase()}, ${direction} ${LEVEL_LABELS[secondaryLevel].toLowerCase()}`;
}

