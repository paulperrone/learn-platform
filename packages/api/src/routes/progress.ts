import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createSRSService } from "../services/srs.js";
import { createContentService, buildDefaultDistribution, describePresentationDistribution } from "../services/content.js";

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
  const content = createContentService(db);
  const userId = c.req.param("userId");

  // Get user's birth year for default fallback
  const { eq } = await import("drizzle-orm");
  const { users, subjects } = await import("../db/schema.js");
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const distributions = await content.getAllSubjectDistributions(userId);

  // Get all subjects to include those without stored distributions
  const allSubjects = await db.select().from(subjects);

  const result = allSubjects.map((subject) => {
    const stored = distributions.find((d) => d.subjectId === subject.id);
    if (stored) {
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        centerLevel: stored.centerLevel,
        weights: stored.weights,
        label: describePresentationDistribution(stored.centerLevel, stored.weights),
        lastAdjustedAt: stored.lastAdjustedAt,
      };
    }
    // Fall back to age-default
    const defaultDist = buildDefaultDistribution(user.birthYear);
    return {
      subjectId: subject.id,
      subjectName: subject.name,
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
