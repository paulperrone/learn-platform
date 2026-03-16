import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import { createActivityService } from "../services/activity.js";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type ActivityEnv = Env & {
  Variables: {
    user: AuthUser;
  };
};

export const activityRoutes = new Hono<ActivityEnv>();

// Auth middleware
activityRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  await next();
});

// GET /api/activity/today?date=YYYY-MM-DD
activityRoutes.get("/today", async (c) => {
  const user = c.get("user");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const db = getDb(c.env.DB);
  const activity = createActivityService(db);
  const progress = await activity.getTodayProgress(user.id, date);
  return c.json(progress);
});

// GET /api/activity/weekly?date=YYYY-MM-DD (end date of week)
activityRoutes.get("/weekly", async (c) => {
  const user = c.get("user");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const db = getDb(c.env.DB);
  const activity = createActivityService(db);
  const summary = await activity.getWeeklySummary(user.id, date);
  return c.json(summary);
});

// GET /api/activity/history?days=84 (12 weeks default)
activityRoutes.get("/history", async (c) => {
  const user = c.get("user");
  const days = parseInt(c.req.query("days") ?? "84", 10);
  const db = getDb(c.env.DB);
  const activity = createActivityService(db);
  const history = await activity.getActivityHistory(user.id, Math.min(days, 365));
  return c.json({ days: history });
});

// GET /api/activity/streak?date=YYYY-MM-DD
activityRoutes.get("/streak", async (c) => {
  const user = c.get("user");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const db = getDb(c.env.DB);
  const activity = createActivityService(db);
  const streak = await activity.getStreakInfo(user.id, date);
  return c.json(streak);
});

// GET /api/activity/goal
activityRoutes.get("/goal", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const activity = createActivityService(db);
  const dailyXpGoal = await activity.getDailyXpGoal(user.id);
  return c.json({ dailyXpGoal });
});

// PUT /api/activity/goal — update daily XP goal
activityRoutes.put("/goal", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ dailyXpGoal?: number }>();
  const { eq } = await import("drizzle-orm");
  const { userPreferences } = await import("../db/schema.js");

  const dailyXpGoal = body.dailyXpGoal ?? 20;

  if (dailyXpGoal < 5 || dailyXpGoal > 100) {
    return c.json({ error: "Daily XP goal must be between 5 and 100" }, 400);
  }

  const now = new Date().toISOString();
  const existing = await db
    .select({ userId: userPreferences.userId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(userPreferences).values({
      userId: user.id,
      dailyXpGoal,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(userPreferences)
      .set({ dailyXpGoal, updatedAt: now })
      .where(eq(userPreferences.userId, user.id));
  }

  return c.json({ dailyXpGoal });
});

// POST /api/activity/record — manual activity recording (for session end)
activityRoutes.post("/record", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ date: string; minutes?: number; problems?: number; topicsMastered?: number }>();
  const activity = createActivityService(db);

  let goalMet = false;
  let goalJustCompleted = false;

  if (body.minutes && body.minutes > 0) {
    await activity.recordMinutes(user.id, body.date, body.minutes);
  }

  if (body.problems && body.problems > 0) {
    for (let i = 0; i < body.problems; i++) {
      const result = await activity.recordProblemCompleted(user.id, body.date);
      goalMet = result.goalMet;
      if (result.goalJustCompleted) goalJustCompleted = true;
    }
  }

  if (body.topicsMastered && body.topicsMastered > 0) {
    for (let i = 0; i < body.topicsMastered; i++) {
      await activity.recordTopicMastered(user.id, body.date);
    }
  }

  return c.json({ goalMet, goalJustCompleted });
});

// GET /api/activity/:childId/weekly — parent views child's weekly summary
activityRoutes.get("/:childId/weekly", async (c) => {
  const user = c.get("user");
  const childId = c.req.param("childId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const db = getDb(c.env.DB);

  // Verify parent owns this child
  const { eq } = await import("drizzle-orm");
  const { users } = await import("../db/schema.js");
  const child = await db
    .select({ managedBy: users.managedBy })
    .from(users)
    .where(eq(users.id, childId))
    .limit(1);

  if (child.length === 0 || child[0].managedBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const activity = createActivityService(db);
  const summary = await activity.getWeeklySummary(childId, date);
  return c.json(summary);
});
