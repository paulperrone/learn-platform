import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createGraphService } from "../services/graph.js";

export const graphRoutes = new Hono<Env>();

graphRoutes.get("/disciplines", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const disciplines = await graph.getDisciplines();
  return c.json({ disciplines });
});

graphRoutes.get("/subjects", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const subjects = await graph.getSubjects();
  return c.json({ subjects });
});

graphRoutes.get("/subjects/:id/topics", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const topics = await graph.getSubjectTopics(c.req.param("id"));
  return c.json({ topics });
});

graphRoutes.get("/subjects/:id/validate", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const result = await graph.validateDAG(c.req.param("id"));
  return c.json(result);
});

graphRoutes.post("/subjects/:id/compute-depths", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const depths = await graph.computeDepths(c.req.param("id"));
  return c.json({ depths });
});

graphRoutes.get("/topics/:id", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const topic = await graph.getTopic(c.req.param("id"));
  if (!topic) return c.json({ error: "Topic not found" }, 404);
  return c.json({ topic });
});

graphRoutes.get("/topics/:id/prerequisites", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const chain = await graph.getPrerequisiteChain(c.req.param("id"));
  return c.json({ prerequisites: chain });
});

graphRoutes.get("/frontier/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const frontier = await graph.computeFrontier(c.req.param("userId"));
  return c.json(frontier);
});
