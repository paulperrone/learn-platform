import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createSessionService } from "../services/session.js";

export const learnRoutes = new Hono<Env>();

// Must be before /sessions/:id to avoid param capture
learnRoutes.get("/sessions/active", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.query("userId");
  if (!userId) return c.json({ error: "userId required" }, 400);

  const active = await db.query.learnSessions.findFirst({
    where: and(
      eq(schema.learnSessions.userId, userId),
      isNull(schema.learnSessions.endedAt),
    ),
  });

  if (!active?.stateJson) {
    return c.json({ active: false });
  }

  const session = createSessionService(db);
  const result = await session.getSession(active.id);
  if (!result) return c.json({ active: false });

  return c.json({ active: true, ...result });
});

learnRoutes.post("/sessions", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db);
  const { userId } = await c.req.json<{ userId: string }>();
  const result = await session.startSession(userId);
  return c.json(result);
});

learnRoutes.get("/sessions/:id", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db);
  const result = await session.getSession(c.req.param("id"));
  if (!result) return c.json({ error: "Session not found" }, 404);
  return c.json(result);
});

learnRoutes.post("/sessions/:id/respond", async (c) => {
  const db = getDb(c.env.DB);
  const session = createSessionService(db);
  const body = await c.req.json<{
    answer?: string;
    correct?: boolean;
    confidence?: number;
    responseMs: number;
    selfExplanation?: string;
  }>();
  const result = await session.respond(c.req.param("id"), body);
  return c.json(result);
});
