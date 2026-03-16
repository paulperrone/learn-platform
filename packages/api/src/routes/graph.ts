import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createGraphService } from "../services/graph.js";
import * as schema from "../db/schema.js";

export const graphRoutes = new Hono<Env>();

graphRoutes.get("/disciplines", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const disciplines = await graph.getDisciplines();

  // Only return disciplines that have topics (content)
  const topicCounts = await db
    .select({
      disciplineId: schema.topics.disciplineId,
      count: sql<number>`count(*)`,
    })
    .from(schema.topics)
    .groupBy(schema.topics.disciplineId);
  const countMap = new Map(topicCounts.map((r) => [r.disciplineId, r.count]));

  const active = disciplines.filter((d) => (countMap.get(d.id) ?? 0) > 0);
  return c.json({ disciplines: active });
});

graphRoutes.get("/disciplines/:id/topics", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const topics = await graph.getDisciplineTopics(c.req.param("id"));
  return c.json({ topics });
});

graphRoutes.get("/collections", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const collections = await graph.getCollections();
  return c.json({ collections });
});

graphRoutes.get("/collections/:id/topics", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const topics = await graph.getDisciplineTopics(c.req.param("id"));
  return c.json({ topics });
});

graphRoutes.get("/collections/:id/validate", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const result = await graph.validateDAG(c.req.param("id"));
  return c.json(result);
});

graphRoutes.get("/graph/validate", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const result = await graph.validateDAG();
  return c.json(result);
});

graphRoutes.post("/collections/:id/compute-depths", async (c) => {
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

// GET /graph/:disciplineId/user-state/:userId — topics merged with user mastery state
graphRoutes.get("/:disciplineId/user-state/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const disciplineId = c.req.param("disciplineId");
  const userId = c.req.param("userId");

  const topics = await graph.getDisciplineTopics(disciplineId);
  const states = await db
    .select()
    .from(schema.userTopicState)
    .where(eq(schema.userTopicState.userId, userId));

  const stateMap = new Map(states.map((s) => [s.topicId, s]));
  const frontier = await graph.computeFrontier(userId);
  const frontierIds = new Set(frontier.topics.map((t: any) => t.id));

  const topicsWithState = topics.map((topic: any) => {
    const state = stateMap.get(topic.id);
    let status: "not-started" | "in-progress" | "mastered" | "frontier" = "not-started";
    if (state?.mastered) {
      status = "mastered";
    } else if (state) {
      status = "in-progress";
    } else if (frontierIds.has(topic.id)) {
      status = "frontier";
    }
    return {
      ...topic,
      status,
      repetitions: state?.reps ?? 0,
      stability: state?.stability ?? null,
      lastReviewedAt: state?.lastReview ?? null,
    };
  });

  const mastered = topicsWithState.filter((t) => t.status === "mastered").length;

  return c.json({
    topics: topicsWithState,
    summary: {
      total: topics.length,
      mastered,
      inProgress: topicsWithState.filter((t) => t.status === "in-progress").length,
      frontier: topicsWithState.filter((t) => t.status === "frontier").length,
      progress: topics.length > 0 ? mastered / topics.length : 0,
    },
  });
});
