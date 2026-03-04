import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createSRSService } from "../services/srs.js";
import type { Grade } from "ts-fsrs";

export const reviewRoutes = new Hono<Env>();

reviewRoutes.get("/due/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const srs = createSRSService(db);
  const topics = await srs.getDueTopics(c.req.param("userId"));
  return c.json({ topics });
});

reviewRoutes.post("/submit", async (c) => {
  const db = getDb(c.env.DB);
  const srs = createSRSService(db);
  const body = await c.req.json<{
    userId: string;
    topicId: string;
    rating: Grade;
    responseMs: number;
    phase: string;
    confidence?: number;
  }>();

  const result = await srs.scheduleReview(
    body.userId,
    body.topicId,
    body.rating,
    body.responseMs,
    body.phase,
    body.confidence
  );

  // Apply FIRe credit to encompassed topics
  const fireCredits = await srs.applyFIReCredit(body.userId, body.topicId, body.rating);

  return c.json({
    nextDue: result.card.due.toISOString(),
    mastered: result.mastered,
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    fireCredits,
  });
});

reviewRoutes.get("/mix/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const srs = createSRSService(db);
  const count = Number(c.req.query("count") ?? "10");
  const mix = await srs.getSessionMix(c.req.param("userId"), count);
  return c.json(mix);
});
