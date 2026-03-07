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
  const goal = await activity.getDailyGoal(user.id);
  return c.json(goal);
});

// PUT /api/activity/goal — update daily goal config
activityRoutes.put("/goal", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ type?: "minutes" | "problems"; target?: number }>();
  const { eq } = await import("drizzle-orm");
  const { userPreferences } = await import("../db/schema.js");

  const goalType = body.type ?? "minutes";
  const goalTarget = body.target ?? 20;

  if (goalTarget < 1 || goalTarget > 120) {
    return c.json({ error: "Target must be between 1 and 120" }, 400);
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
      dailyGoalType: goalType,
      dailyGoalTarget: goalTarget,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(userPreferences)
      .set({ dailyGoalType: goalType, dailyGoalTarget: goalTarget, updatedAt: now })
      .where(eq(userPreferences.userId, user.id));
  }

  return c.json({ type: goalType, target: goalTarget });
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
    const result = await activity.recordMinutes(user.id, body.date, body.minutes);
    goalMet = result.goalMet;
    goalJustCompleted = result.goalJustCompleted;
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
