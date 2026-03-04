import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createSRSService } from "../services/srs.js";

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
