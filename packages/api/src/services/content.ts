import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import type { Problem, WorkedExample, VisualAsset, PresentationLevel, ContentDepthLevel } from "@learn/shared";

const CURRENT_YEAR = new Date().getFullYear();

export type PresentationDistribution = {
  primary: number;
  intermediate: number;
  standard: number;
  advanced: number;
  centerLevel: PresentationLevel;
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
// Nudge magnitudes for presentation distribution drift.
// Structured so they could be made per-discipline or per-subject later.
export const DRIFT_RATES = {
  successAtCenter: 0.02,     // small upward nudge
  failureAtCenter: 0.02,     // small downward nudge
  successAboveCenter: 0.04,  // larger upward — student stretching successfully
  failureAboveCenter: 0.01,  // tiny correction — expected difficulty, not punitive
  successBelowCenter: 0,     // no change — expected ease
  failureBelowCenter: 0.03,  // genuine struggle signal
  snapThreshold: 0.05,       // levels below this snap to 0
} as const;

export function nudgeDistribution(
  dist: PresentationDistribution,
  servedLevel: PresentationLevel,
  success: boolean,
): PresentationDistribution {
  const levels = [...PRESENTATION_LEVELS];
  const centerIdx = levels.indexOf(dist.centerLevel);
  const servedIdx = levels.indexOf(servedLevel);
  const weights: [number, number, number, number] = [dist.primary, dist.intermediate, dist.standard, dist.advanced];

  let delta = 0;
  let fromIdx = centerIdx;
  let toIdx = centerIdx;

  if (servedIdx === centerIdx) {
    if (success && centerIdx < 3) {
      delta = DRIFT_RATES.successAtCenter;
      fromIdx = centerIdx;
      toIdx = centerIdx + 1;
    } else if (!success && centerIdx > 0) {
      delta = DRIFT_RATES.failureAtCenter;
      fromIdx = centerIdx;
      toIdx = centerIdx - 1;
    }
  } else if (servedIdx > centerIdx) {
    if (success) {
      delta = DRIFT_RATES.successAboveCenter;
      fromIdx = centerIdx;
      toIdx = servedIdx;
    } else {
      delta = DRIFT_RATES.failureAboveCenter;
      fromIdx = servedIdx;
      toIdx = centerIdx;
    }
  } else {
    // servedIdx < centerIdx
    if (!success) {
      delta = DRIFT_RATES.failureBelowCenter;
      fromIdx = centerIdx;
      toIdx = servedIdx;
    }
    // success below center: no change
  }

  if (delta === 0) return dist;

  // Apply delta
  weights[fromIdx] = Math.max(0, weights[fromIdx] - delta);
  weights[toIdx] += delta;

  // Snap levels below threshold to 0
  for (let i = 0; i < 4; i++) {
    if (weights[i] > 0 && weights[i] < DRIFT_RATES.snapThreshold) {
      const snapped = weights[i];
      weights[i] = 0;
      // Redistribute to highest-weight level
      let maxIdx = 0;
      for (let j = 1; j < 4; j++) {
        if (weights[j] > weights[maxIdx]) maxIdx = j;
      }
      weights[maxIdx] += snapped;
    }
  }

  // Renormalize
  const sum = weights[0] + weights[1] + weights[2] + weights[3];
  if (sum > 0) {
    for (let i = 0; i < 4; i++) weights[i] = weights[i] / sum;
  }

  // Update center to highest weight
  let newCenterIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (weights[i] > weights[newCenterIdx]) newCenterIdx = i;
  }

  return {
    primary: weights[0],
    intermediate: weights[1],
    standard: weights[2],
    advanced: weights[3],
    centerLevel: levels[newCenterIdx],
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
  contentDepth: ContentDepthLevel;
  presentation: PresentationLevel;
  locale?: string;
  flavor?: string;
};

export function createContentService(db: DB) {
  async function resolvePresentation(userId: string, subjectId?: string): Promise<PresentationLevel> {
    // Check for explicit override in preferences
    const prefs = await db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (prefs?.presentationOverride) {
      return prefs.presentationOverride as PresentationLevel;
    }

    // If subjectId provided, check for per-subject distribution
    if (subjectId) {
      const dist = await db.query.userSubjectPresentation.findFirst({
        where: and(
          eq(schema.userSubjectPresentation.userId, userId),
          eq(schema.userSubjectPresentation.subjectId, subjectId),
        ),
      });
      if (dist) {
        return sampleFromDistribution({
          primary: dist.primaryWeight,
          intermediate: dist.intermediateWeight,
          standard: dist.standardWeight,
          advanced: dist.advancedWeight,
          centerLevel: dist.centerLevel as PresentationLevel,
        });
      }
    }

    // Fall back to age-based default
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (subjectId) {
      // Subject provided but no stored distribution — sample from age default
      const defaultDist = buildDefaultDistribution(user?.birthYear);
      return sampleFromDistribution(defaultDist);
    }
    // No subjectId — deterministic age-based (backwards compatible)
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
    const { topicId, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    // Single query: fetch all content for this topic, rank in application code
    const allRows = await db
      .select()
      .from(schema.assessmentContent)
      .where(eq(schema.assessmentContent.topicId, topicId));

    const best = selectBestRows(allRows, { presentation, contentDepth, locale, flavor });
    return mapProblems(best);
  }

  async function getTopicExamples(query: ContentQuery): Promise<WorkedExample[]> {
    const { topicId, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    // Single query: fetch all content for this topic, rank in application code
    const allRows = await db
      .select()
      .from(schema.instructionalContent)
      .where(eq(schema.instructionalContent.topicId, topicId));

    const best = selectBestRows(allRows, { presentation, contentDepth, locale, flavor });
    return mapExamples(best);
  }

  async function getTopicVisuals(query: ContentQuery): Promise<VisualAsset[] | undefined> {
    const examples = await getTopicExamples(query);
    return examples[0]?.visuals;
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

  async function getSubjectDistribution(
    userId: string,
    subjectId: string
  ): Promise<PresentationDistribution | null> {
    const row = await db.query.userSubjectPresentation.findFirst({
      where: and(
        eq(schema.userSubjectPresentation.userId, userId),
        eq(schema.userSubjectPresentation.subjectId, subjectId),
      ),
    });
    if (!row) return null;
    return {
      primary: row.primaryWeight,
      intermediate: row.intermediateWeight,
      standard: row.standardWeight,
      advanced: row.advancedWeight,
      centerLevel: row.centerLevel as PresentationLevel,
    };
  }

  async function upsertSubjectDistribution(
    userId: string,
    subjectId: string,
    dist: PresentationDistribution
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.query.userSubjectPresentation.findFirst({
      where: and(
        eq(schema.userSubjectPresentation.userId, userId),
        eq(schema.userSubjectPresentation.subjectId, subjectId),
      ),
    });
    if (existing) {
      await db
        .update(schema.userSubjectPresentation)
        .set({
          primaryWeight: dist.primary,
          intermediateWeight: dist.intermediate,
          standardWeight: dist.standard,
          advancedWeight: dist.advanced,
          centerLevel: dist.centerLevel,
          lastAdjustedAt: now,
        })
        .where(eq(schema.userSubjectPresentation.id, existing.id));
    } else {
      await db.insert(schema.userSubjectPresentation).values({
        userId,
        subjectId,
        primaryWeight: dist.primary,
        intermediateWeight: dist.intermediate,
        standardWeight: dist.standard,
        advancedWeight: dist.advanced,
        centerLevel: dist.centerLevel,
        lastAdjustedAt: now,
      });
    }
  }

  async function applyNudge(
    userId: string,
    subjectId: string,
    servedLevel: PresentationLevel,
    success: boolean
  ): Promise<void> {
    const current = await getSubjectDistribution(userId, subjectId);
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
        subjectId,
        fromWeights: JSON.stringify(fromWeights),
        toWeights: JSON.stringify(toWeights),
        fromCenter: current.centerLevel,
        toCenter: updated.centerLevel,
        trigger,
        createdAt: new Date().toISOString(),
      });
    }

    await upsertSubjectDistribution(userId, subjectId, updated);
  }

  async function getAllSubjectDistributions(userId: string) {
    const rows = await db
      .select()
      .from(schema.userSubjectPresentation)
      .where(eq(schema.userSubjectPresentation.userId, userId));

    return rows.map((row) => ({
      subjectId: row.subjectId,
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
    getSubjectDistribution,
    getAllSubjectDistributions,
    upsertSubjectDistribution,
    applyNudge,
    markDepthCompleted,
    getCompletedDepths,
    getTopicProblems,
    getTopicExamples,
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

// --- Mappers ---

function mapProblems(rows: (typeof schema.assessmentContent.$inferSelect)[]): Problem[] {
  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    difficulty: r.difficulty as Problem["difficulty"],
    question: r.question,
    answer: r.answer,
    hints: JSON.parse(r.hintsJson),
    solution: r.solution,
    type: r.type as Problem["type"],
    typeProperties: r.typeProperties ? JSON.parse(r.typeProperties) : undefined,
  }));
}

function mapExamples(rows: (typeof schema.instructionalContent.$inferSelect)[]): WorkedExample[] {
  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    title: r.title,
    steps: JSON.parse(r.stepsJson),
    visuals: r.assetsJson ? JSON.parse(r.assetsJson) : undefined,
  }));
}
