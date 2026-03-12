import { Hono } from "hono";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createSRSService } from "../services/srs.js";
import { createContentService, buildDefaultDistribution, describePresentationDistribution } from "../services/content.js";
import * as schema from "../db/schema.js";

export const progressRoutes = new Hono<Env>();

progressRoutes.get("/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const srs = createSRSService(db);
  const stats = await srs.getUserStats(c.req.param("userId"));
  return c.json(stats);
});

progressRoutes.get("/:userId/topics", async (c) => {
  const db = getDb(c.env.DB);
  const { eq } = await import("drizzle-orm");
  const { userTopicState } = await import("../db/schema.js");

  const states = await db
    .select()
    .from(userTopicState)
    .where(eq(userTopicState.userId, c.req.param("userId")));

  return c.json({ topics: states });
});

progressRoutes.get("/:userId/presentation", async (c) => {
  const db = getDb(c.env.DB);
  const content = createContentService(db, c.env.CONTENT);
  const userId = c.req.param("userId");

  // Get user's birth year for default fallback
  const { eq } = await import("drizzle-orm");
  const { users, disciplines } = await import("../db/schema.js");
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const distributions = await content.getAllDisciplineDistributions(userId);

  // Get all disciplines to include those without stored distributions
  const allDisciplines = await db.select().from(disciplines);

  const result = allDisciplines.map((discipline) => {
    const stored = distributions.find((d) => d.disciplineId === discipline.id);
    if (stored) {
      return {
        disciplineId: discipline.id,
        disciplineName: discipline.name,
        centerLevel: stored.centerLevel,
        weights: stored.weights,
        label: describePresentationDistribution(stored.centerLevel, stored.weights),
        lastAdjustedAt: stored.lastAdjustedAt,
      };
    }
    // Fall back to age-default
    const defaultDist = buildDefaultDistribution(user.birthYear);
    return {
      disciplineId: discipline.id,
      disciplineName: discipline.name,
      centerLevel: defaultDist.centerLevel,
      weights: {
        primary: defaultDist.primary,
        intermediate: defaultDist.intermediate,
        standard: defaultDist.standard,
        advanced: defaultDist.advanced,
      },
      label: describePresentationDistribution(defaultDist.centerLevel, {
        primary: defaultDist.primary,
        intermediate: defaultDist.intermediate,
        standard: defaultDist.standard,
        advanced: defaultDist.advanced,
      }),
      lastAdjustedAt: null,
    };
  });

  return c.json({ distributions: result });
});

progressRoutes.get("/:userId/calibration", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");
  const { eq, and, isNotNull } = await import("drizzle-orm");
  const { reviewLog, userTopicState } = await import("../db/schema.js");

  // Get overall confidence accuracy from topic states (weighted by reps)
  const topicStates = await db
    .select({
      confidenceAccuracy: userTopicState.confidenceAccuracy,
      reps: userTopicState.reps,
      topicId: userTopicState.topicId,
    })
    .from(userTopicState)
    .where(
      and(
        eq(userTopicState.userId, userId),
        isNotNull(userTopicState.confidenceAccuracy),
      )
    );

  // Weighted average of confidence accuracy across topics
  let totalWeight = 0;
  let weightedSum = 0;
  for (const ts of topicStates) {
    if (ts.confidenceAccuracy != null && ts.reps > 0) {
      totalWeight += ts.reps;
      weightedSum += ts.confidenceAccuracy * ts.reps;
    }
  }
  const overallAccuracy = totalWeight > 0 ? weightedSum / totalWeight : null;

  // Count misconceptions
  const [misconceptionStats] = await db
    .select({
      total: sql<number>`count(*)`,
      misconceptions: sql<number>`sum(case when misconception = 1 then 1 else 0 end)`,
    })
    .from(reviewLog)
    .where(
      and(
        eq(reviewLog.userId, userId),
        isNotNull(reviewLog.confidence),
      )
    );

  // Recent calibration trend (last 50 reviews with confidence)
  const recentReviews = await db
    .select({
      confidence: reviewLog.confidence,
      correct: reviewLog.correct,
      createdAt: reviewLog.createdAt,
    })
    .from(reviewLog)
    .where(
      and(
        eq(reviewLog.userId, userId),
        isNotNull(reviewLog.confidence),
      )
    )
    .orderBy(sql`created_at DESC`)
    .limit(50);

  // Compute windowed accuracy for trend (batches of 10)
  const trend: { accuracy: number; window: number }[] = [];
  const reversed = [...recentReviews].reverse();
  for (let i = 0; i + 9 < reversed.length; i += 10) {
    const batch = reversed.slice(i, i + 10);
    let batchAccuracy = 0;
    for (const r of batch) {
      const norm = (r.confidence ?? 3) / 5;
      const error = Math.abs(norm - (r.correct ? 1 : 0));
      batchAccuracy += 1 - error;
    }
    trend.push({ accuracy: batchAccuracy / 10, window: trend.length + 1 });
  }

  return c.json({
    overallAccuracy,
    totalRatedReviews: misconceptionStats.total,
    misconceptionCount: misconceptionStats.misconceptions ?? 0,
    trend,
  });
});

progressRoutes.get("/:userId/completion", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");

  // Get all disciplines
  const allDisciplines = await db.select().from(schema.disciplines);

  // Get all topics grouped by discipline
  const allTopics = await db.select({ id: schema.topics.id, disciplineId: schema.topics.disciplineId }).from(schema.topics);

  // Get all mastered topics for user (materialized + implicit)
  const masteredRows = await db
    .select({ topicId: schema.userTopicState.topicId })
    .from(schema.userTopicState)
    .where(
      and(
        eq(schema.userTopicState.userId, userId),
        eq(schema.userTopicState.mastered, true)
      )
    );
  const masteredIds = new Set(masteredRows.map((r) => r.topicId));

  // Include implicit mastery from diagnostic estimates (reduced materialization)
  const diagnosticSession = await db.query.diagnosticSessions.findFirst({
    where: and(
      eq(schema.diagnosticSessions.userId, userId),
      eq(schema.diagnosticSessions.status, "completed")
    ),
    orderBy: desc(schema.diagnosticSessions.completedAt),
  });
  if (diagnosticSession?.topicEstimatesJson) {
    const estimates: Record<string, number> = JSON.parse(diagnosticSession.topicEstimatesJson);
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= 0.6) {
        masteredIds.add(topicId);
      }
    }
  }

  // Get mastery pace: topics mastered per week from daily_activity (last 4 weeks)
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentActivity = await db
    .select({
      totalMastered: sql<number>`sum(topics_mastered)`,
    })
    .from(schema.dailyActivity)
    .where(
      and(
        eq(schema.dailyActivity.userId, userId),
        gte(schema.dailyActivity.date, fourWeeksAgo.toISOString().slice(0, 10))
      )
    );

  const totalMasteredRecent = recentActivity[0]?.totalMastered ?? 0;
  const topicsPerWeek = totalMasteredRecent / 4;

  // Build per-discipline estimates
  const topicsByDiscipline = new Map<string, string[]>();
  for (const t of allTopics) {
    const list = topicsByDiscipline.get(t.disciplineId) ?? [];
    list.push(t.id);
    topicsByDiscipline.set(t.disciplineId, list);
  }

  const estimates = allDisciplines.map((discipline) => {
    const disciplineTopics = topicsByDiscipline.get(discipline.id) ?? [];
    const total = disciplineTopics.length;
    const mastered = disciplineTopics.filter((id) => masteredIds.has(id)).length;
    const remaining = total - mastered;
    const percentComplete = total > 0 ? Math.round((mastered / total) * 100) : 0;

    // Check milestone thresholds
    let milestoneReached: 25 | 50 | 75 | 100 | null = null;
    if (percentComplete >= 100) milestoneReached = 100;
    else if (percentComplete >= 75) milestoneReached = 75;
    else if (percentComplete >= 50) milestoneReached = 50;
    else if (percentComplete >= 25) milestoneReached = 25;

    return {
      disciplineId: discipline.id,
      disciplineName: discipline.name,
      mastered,
      total,
      percentComplete,
      topicsMasteredPerWeek: Math.round(topicsPerWeek * 10) / 10,
      estimatedWeeksRemaining: topicsPerWeek > 0 ? Math.round((remaining / topicsPerWeek) * 10) / 10 : null,
      milestoneReached,
    };
  });

  return c.json({ estimates });
});
