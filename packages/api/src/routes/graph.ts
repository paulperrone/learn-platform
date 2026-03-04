import { Hono } from "hono";
import type { Env } from "../index.js";

export const graphRoutes = new Hono<Env>();

graphRoutes.get("/subjects", async (c) => {
  return c.json({ subjects: [] });
});

graphRoutes.get("/subjects/:id/topics", async (c) => {
  return c.json({ topics: [] });
});

graphRoutes.get("/topics/:id", async (c) => {
  return c.json({ topic: null });
});

graphRoutes.get("/topics/:id/prerequisites", async (c) => {
  return c.json({ prerequisites: [] });
});
