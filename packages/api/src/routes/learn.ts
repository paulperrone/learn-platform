import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createSessionService } from "../services/session.js";
import { createAnalyticsService } from "../services/analytics.js";
import { createDiagnosticService } from "../services/diagnostic.js";

export const learnRoutes = new Hono<Env>();

// Must be before /sessions/:id to avoid param capture
learnRoutes.get("/sessions/active", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.query("userId");
  const anonymousToken = c.req.query("anonymousToken");

  if (!userId && !anonymousToken) {
    return c.json({ error: "userId or anonymousToken required" }, 400);
  }

  const active = await db.query.learnSessions.findFirst({
    where: userId
      ? and(eq(schema.learnSessions.userId, userId), isNull(schema.learnSessions.endedAt))
      : and(eq(schema.learnSessions.anonymousToken, anonymousToken!), isNull(schema.learnSessions.endedAt)),
  });

  if (!active?.stateJson) {
    return c.json({ active: false });
  }

  const session = createSessionService(db, undefined, c.env.CONTENT, createAnalyticsService(c.env.ANALYTICS));
  const result = await session.getSession(active.id);
  if (!result) return c.json({ active: false });

  return c.json({ active: true, ...result });
});

learnRoutes.post("/sessions", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db, undefined, c.env.CONTENT, createAnalyticsService(c.env.ANALYTICS));
  const body = await c.req.json<{ userId?: string; anonymousToken?: string; disciplineId?: string }>();

  if (body.anonymousToken && !body.userId) {
    const result = await session.startAnonymousSession(body.anonymousToken, body.disciplineId);
    return c.json(result);
  }

  if (!body.userId) return c.json({ error: "userId or anonymousToken required" }, 400);
  const result = await session.startSession(body.userId);
  return c.json(result);
});

learnRoutes.get("/sessions/:id", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db, undefined, c.env.CONTENT, createAnalyticsService(c.env.ANALYTICS));
  const result = await session.getSession(c.req.param("id"));
  if (!result) return c.json({ error: "Session not found" }, 404);
  return c.json(result);
});

learnRoutes.post("/sessions/:id/respond", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db, undefined, c.env.CONTENT, createAnalyticsService(c.env.ANALYTICS));
  const body = await c.req.json<{
    answer?: string;
    correct?: boolean;
    confidence?: number;
    responseMs: number;
    selfExplanation?: string;
    hintsUsed?: number;
  }>();
  const result = await session.respond(c.req.param("id"), body);
  return c.json(result);
});

// === Diagnostic Endpoints ===

learnRoutes.post("/diagnostic/start", async (c) => {
  const db = getDb(c.env.DB);
  const diagnostic = createDiagnosticService(db, c.env.CONTENT);
  const body = await c.req.json<{
    userId?: string;
    anonymousToken?: string;
    disciplineId: string;
    isTaste?: boolean;
  }>();

  if (!body.disciplineId) return c.json({ error: "disciplineId required" }, 400);
  const result = await diagnostic.startDiagnostic(body);
  if ("error" in result) return c.json(result, 400);
  return c.json(result);
});

learnRoutes.post("/diagnostic/resume", async (c) => {
  const db = getDb(c.env.DB);
  const diagnostic = createDiagnosticService(db, c.env.CONTENT);
  const body = await c.req.json<{
    userId?: string;
    anonymousToken?: string;
    disciplineId: string;
  }>();

  if (!body.disciplineId) return c.json({ error: "disciplineId required" }, 400);
  const result = await diagnostic.resume(body);
  return c.json(result);
});

learnRoutes.post("/diagnostic/respond", async (c) => {
  const db = getDb(c.env.DB);
  const diagnostic = createDiagnosticService(db, c.env.CONTENT);
  const { sessionId, answer } = await c.req.json<{ sessionId: string; answer: string }>();

  if (!sessionId || answer == null) return c.json({ error: "sessionId and answer required" }, 400);
  const result = await diagnostic.respond(sessionId, answer);
  if ("error" in result) return c.json(result, 400);
  return c.json(result);
});

learnRoutes.get("/diagnostic/result/:id", async (c) => {
  const db = getDb(c.env.DB);
  const diagnostic = createDiagnosticService(db, c.env.CONTENT);
  const result = await diagnostic.getResult(c.req.param("id"));
  if (!result) return c.json({ error: "Diagnostic not found or not completed" }, 404);
  return c.json(result);
});
