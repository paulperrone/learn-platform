import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import type { Problem, WorkedExample, VisualAsset, PresentationLevel, ContentDepthLevel } from "@learn/shared";

const CURRENT_YEAR = new Date().getFullYear();

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
  async function resolvePresentation(userId: string): Promise<PresentationLevel> {
    // Check for explicit override in preferences
    const prefs = await db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (prefs?.presentationOverride) {
      return prefs.presentationOverride as PresentationLevel;
    }

    // Derive from birthYear
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user?.birthYear) return "standard";

    const age = CURRENT_YEAR - user.birthYear;
    if (age <= 8) return "primary";        // K-2 (ages ~5-8)
    if (age <= 11) return "intermediate";  // 3-5 (ages ~8-11)
    if (age <= 14) return "standard";      // 6-8 (ages ~11-14)
    return "advanced";                     // 9+  (ages 14+)
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

    // For mastery-gated: depth is in the topic graph, not content. Always survey.
    if (model === "mastery-gated") return "survey";

    // For flexible: always survey (topics are independent)
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

  async function getTopicProblems(query: ContentQuery): Promise<Problem[]> {
    const { topicId, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    // Try exact match first
    let rows = await db
      .select()
      .from(schema.assessmentContent)
      .where(
        and(
          eq(schema.assessmentContent.topicId, topicId),
          eq(schema.assessmentContent.contentDepth, contentDepth),
          eq(schema.assessmentContent.presentation, presentation),
          eq(schema.assessmentContent.locale, locale),
          eq(schema.assessmentContent.flavor, flavor)
        )
      );

    if (rows.length > 0) return mapProblems(rows);

    // Fallback chain per content-system.md §6

    // a. Try adjacent presentation levels
    for (const altPres of PRESENTATION_FALLBACK_ORDER[presentation]) {
      rows = await db
        .select()
        .from(schema.assessmentContent)
        .where(
          and(
            eq(schema.assessmentContent.topicId, topicId),
            eq(schema.assessmentContent.contentDepth, contentDepth),
            eq(schema.assessmentContent.presentation, altPres),
            eq(schema.assessmentContent.locale, locale),
            eq(schema.assessmentContent.flavor, flavor)
          )
        );
      if (rows.length > 0) return mapProblems(rows);
    }

    // b. Try 'classic' flavor (if not already)
    if (flavor !== "classic") {
      rows = await db
        .select()
        .from(schema.assessmentContent)
        .where(
          and(
            eq(schema.assessmentContent.topicId, topicId),
            eq(schema.assessmentContent.contentDepth, contentDepth),
            eq(schema.assessmentContent.locale, locale),
            eq(schema.assessmentContent.flavor, "classic")
          )
        );
      if (rows.length > 0) return mapProblems(rows);
    }

    // c. Try 'en' locale (if not already)
    if (locale !== "en") {
      rows = await db
        .select()
        .from(schema.assessmentContent)
        .where(
          and(
            eq(schema.assessmentContent.topicId, topicId),
            eq(schema.assessmentContent.contentDepth, contentDepth),
            eq(schema.assessmentContent.flavor, "classic"),
            eq(schema.assessmentContent.locale, "en")
          )
        );
      if (rows.length > 0) return mapProblems(rows);
    }

    // d. Try 'survey' depth (if not already)
    if (contentDepth !== "survey") {
      rows = await db
        .select()
        .from(schema.assessmentContent)
        .where(
          and(
            eq(schema.assessmentContent.topicId, topicId),
            eq(schema.assessmentContent.contentDepth, "survey"),
            eq(schema.assessmentContent.flavor, "classic"),
            eq(schema.assessmentContent.locale, "en")
          )
        );
      if (rows.length > 0) return mapProblems(rows);
    }

    // e. Last resort: any content for this topic
    rows = await db
      .select()
      .from(schema.assessmentContent)
      .where(eq(schema.assessmentContent.topicId, topicId));

    return mapProblems(rows);
  }

  async function getTopicExamples(query: ContentQuery): Promise<WorkedExample[]> {
    const { topicId, contentDepth, presentation, locale = "en", flavor = "classic" } = query;

    // Try exact match
    let rows = await db
      .select()
      .from(schema.instructionalContent)
      .where(
        and(
          eq(schema.instructionalContent.topicId, topicId),
          eq(schema.instructionalContent.contentDepth, contentDepth),
          eq(schema.instructionalContent.presentation, presentation),
          eq(schema.instructionalContent.locale, locale),
          eq(schema.instructionalContent.flavor, flavor)
        )
      );

    if (rows.length > 0) return mapExamples(rows);

    // Fallback: adjacent presentation
    for (const altPres of PRESENTATION_FALLBACK_ORDER[presentation]) {
      rows = await db
        .select()
        .from(schema.instructionalContent)
        .where(
          and(
            eq(schema.instructionalContent.topicId, topicId),
            eq(schema.instructionalContent.contentDepth, contentDepth),
            eq(schema.instructionalContent.presentation, altPres),
            eq(schema.instructionalContent.locale, locale),
            eq(schema.instructionalContent.flavor, flavor)
          )
        );
      if (rows.length > 0) return mapExamples(rows);
    }

    // Fallback: classic flavor
    if (flavor !== "classic") {
      rows = await db
        .select()
        .from(schema.instructionalContent)
        .where(
          and(
            eq(schema.instructionalContent.topicId, topicId),
            eq(schema.instructionalContent.contentDepth, contentDepth),
            eq(schema.instructionalContent.locale, locale),
            eq(schema.instructionalContent.flavor, "classic")
          )
        );
      if (rows.length > 0) return mapExamples(rows);
    }

    // Fallback: en locale
    if (locale !== "en") {
      rows = await db
        .select()
        .from(schema.instructionalContent)
        .where(
          and(
            eq(schema.instructionalContent.topicId, topicId),
            eq(schema.instructionalContent.contentDepth, contentDepth),
            eq(schema.instructionalContent.flavor, "classic"),
            eq(schema.instructionalContent.locale, "en")
          )
        );
      if (rows.length > 0) return mapExamples(rows);
    }

    // Fallback: survey depth
    if (contentDepth !== "survey") {
      rows = await db
        .select()
        .from(schema.instructionalContent)
        .where(
          and(
            eq(schema.instructionalContent.topicId, topicId),
            eq(schema.instructionalContent.contentDepth, "survey"),
            eq(schema.instructionalContent.flavor, "classic"),
            eq(schema.instructionalContent.locale, "en")
          )
        );
      if (rows.length > 0) return mapExamples(rows);
    }

    // Last resort: any content for this topic
    rows = await db
      .select()
      .from(schema.instructionalContent)
      .where(eq(schema.instructionalContent.topicId, topicId));

    return mapExamples(rows);
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

  return {
    resolvePresentation,
    resolveContentDepth,
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
