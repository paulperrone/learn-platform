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

  return {
    resolvePresentation,
    resolveContentDepth,
    getSubjectDistribution,
    upsertSubjectDistribution,
    markDepthCompleted,
    getCompletedDepths,
    getTopicProblems,
    getTopicExamples,
    getTopicVisuals,
  };
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
