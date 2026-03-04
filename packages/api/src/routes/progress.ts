import { Hono } from "hono";
import type { Env } from "../index.js";

export const progressRoutes = new Hono<Env>();

progressRoutes.get("/", async (c) => {
  return c.json({ mastered: 0, inProgress: 0, total: 0 });
});

progressRoutes.get("/topics", async (c) => {
  return c.json({ topics: [] });
});
