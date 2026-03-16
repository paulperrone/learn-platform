import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { createStandardsService } from "../services/standards.js";
import { createAssessmentService } from "../services/assessment.js";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string };

type ReportsEnv = Env & {
  Variables: { user: AuthUser; session: Record<string, unknown> };
};

export const reportRoutes = new Hono<ReportsEnv>();

// Auth middleware
reportRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

// GET /api/reports/progress/:disciplineId — progress report for the authenticated user
reportRoutes.get("/progress/:disciplineId", async (c) => {
  const user = c.get("user");
  const disciplineId = c.req.param("disciplineId");
  const db = getDb(c.env.DB);
  try {
    const svc = createStandardsService(db);
    const report = await svc.generateProgressReport(user.id, disciplineId);
    return c.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate report";
    console.error("Progress report error:", message);
    return c.json({ error: message }, 500);
  }
});

// GET /api/reports/progress/:disciplineId/:userId — teacher/parent view (requires account link)
reportRoutes.get("/progress/:disciplineId/:userId", async (c) => {
  const requestingUser = c.get("user");
  const disciplineId = c.req.param("disciplineId");
  const targetUserId = c.req.param("userId");
  const db = getDb(c.env.DB);

  // Allow self-access
  if (requestingUser.id !== targetUserId) {
    const link = await db
      .select({ id: schema.accountLinks.id })
      .from(schema.accountLinks)
      .where(
        and(
          eq(schema.accountLinks.fromUserId, requestingUser.id),
          eq(schema.accountLinks.toUserId, targetUserId),
          eq(schema.accountLinks.status, "active"),
        ),
      )
      .limit(1);

    if (link.length === 0) {
      return c.json({ error: "No active link to this user" }, 403);
    }
  }

  const svc = createStandardsService(db);
  const report = await svc.generateProgressReport(targetUserId, disciplineId);
  return c.json(report);
});

// GET /api/reports/assessment/:id — detailed assessment report with standards alignment
reportRoutes.get("/assessment/:id", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");
  const db = getDb(c.env.DB);

  // Verify session belongs to user (or user has a link to the session owner)
  const session = await db
    .select({ userId: schema.assessmentSessions.userId })
    .from(schema.assessmentSessions)
    .where(eq(schema.assessmentSessions.id, sessionId))
    .limit(1);

  if (session.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (session[0].userId !== user.id) {
    // Check account link
    const link = await db
      .select({ id: schema.accountLinks.id })
      .from(schema.accountLinks)
      .where(
        and(
          eq(schema.accountLinks.fromUserId, user.id),
          eq(schema.accountLinks.toUserId, session[0].userId),
          eq(schema.accountLinks.status, "active"),
        ),
      )
      .limit(1);

    if (link.length === 0) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  try {
    const assessment = createAssessmentService(db, c.env.CONTENT);
    const result = await assessment.getAssessmentResult(sessionId);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get report";
    return c.json({ error: message }, 400);
  }
});
