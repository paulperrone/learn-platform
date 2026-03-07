import { Hono } from "hono";
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
