import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createGraphService } from "../services/graph.js";
import { createContentService } from "../services/content.js";
import * as schema from "../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";

export const publicRoutes = new Hono<Env>();

// --- Shared Utilities ---

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// --- CORS: allow all origins for public API ---
publicRoutes.use("*", cors({ origin: "*" }));

// --- Bot Detection ---
// Block known LLM scrapers and aggressive crawlers from API endpoints.
// Legitimate search engines (Google, Bing) are allowed.
// robots.txt provides polite directives; this enforces them.

const BLOCKED_BOT_PATTERNS = [
  /CCBot/i,
  /GPTBot/i,
  /Google-Extended/i,
  /ClaudeBot/i,
  /anthropic-ai/i,
  /Bytespider/i,
  /ChatGPT-User/i,
  /PetalBot/i,
  /Scrapy/i,
  /DataForSeoBot/i,
  /Amazonbot/i,
];

publicRoutes.use("*", async (c, next) => {
  const ua = c.req.header("user-agent") ?? "";
  if (BLOCKED_BOT_PATTERNS.some((p) => p.test(ua))) {
    return c.json(
      { error: "Bot access to API not permitted. See /robots.txt" },
      403
    );
  }
  await next();
});

// --- Request Logging ---
// Lightweight per-request logging for public endpoints.
// Logs: timestamp, method, path, IP, user-agent, status, duration.
// No PII — IP is for rate-limit correlation, not storage.

publicRoutes.use("*", async (c, next) => {
  const start = Date.now();
  const ip = getClientIp(c);
  const ua = c.req.header("user-agent") ?? "";
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  console.log(
    JSON.stringify({
      type: "public_api_request",
      ts: new Date().toISOString(),
      method,
      path,
      status,
      duration_ms: duration,
      ip: ip.slice(0, 20), // truncate for log safety
      ua: ua.slice(0, 120), // truncate long UAs
    })
  );
});

// --- Rate Limiting (per-isolate, IP-based) ---

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

const RATE_LIMITS = {
  default: { max: 60, windowMs: 60_000 },
  graph: { max: 10, windowMs: 60_000 },
} as const;

function checkRateLimit(
  ip: string,
  path: string,
  limit: { max: number; windowMs: number }
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${ip}:${path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + limit.windowMs;
    rateBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit.max - 1, resetAt };
  }

  bucket.count++;
  if (bucket.count > limit.max) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  return { allowed: true, remaining: limit.max - bucket.count, resetAt: bucket.resetAt };
}

function rateLimit(limit: { max: number; windowMs: number }, pathKey: string) {
  return async (c: Parameters<Parameters<typeof publicRoutes.use>[1]>[0], next: () => Promise<void>) => {
    const ip = getClientIp(c);
    const result = checkRateLimit(ip, pathKey, limit);

    c.header("X-RateLimit-Limit", String(limit.max));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  };
}

// --- Routes ---

// Download and graph exports get stricter rate limit
publicRoutes.use("/download/*", rateLimit(RATE_LIMITS.graph, "download"));
publicRoutes.use("/graph/*", rateLimit(RATE_LIMITS.graph, "graph"));
// Everything else gets default rate limit
publicRoutes.use("*", rateLimit(RATE_LIMITS.default, "api"));

// GET /api/public/disciplines — list disciplines that have content (topics > 0)
publicRoutes.get("/disciplines", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const disciplines = await graph.getDisciplines();

  // Count topics and compute grade range per discipline
  const topicStats = await db
    .select({
      disciplineId: schema.topics.disciplineId,
      count: sql<number>`count(*)`,
      minGrade: sql<number>`min(${schema.topics.gradeLevel})`,
      maxGrade: sql<number>`max(${schema.topics.gradeLevel})`,
    })
    .from(schema.topics)
    .groupBy(schema.topics.disciplineId);
  const statsMap = new Map(topicStats.map((s) => [s.disciplineId, s]));

  // Only return disciplines that have topics
  const active = disciplines
    .filter((d) => (statsMap.get(d.id)?.count ?? 0) > 0)
    .map((d) => {
      const stats = statsMap.get(d.id)!;
      const gradeRange = stats.minGrade === stats.maxGrade
        ? (stats.minGrade === 0 ? "K" : `Grade ${stats.minGrade}`)
        : `${stats.minGrade === 0 ? "K" : stats.minGrade}–${stats.maxGrade}`;
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        progressionModel: d.progressionModel,
        topicCount: stats.count,
        gradeRange,
      };
    });

  return c.json({ disciplines: active });
});

// GET /api/public/disciplines/:id/topics — topics for a discipline
publicRoutes.get("/disciplines/:id/topics", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const disciplineId = c.req.param("id");

  const topics = await graph.getDisciplineTopics(disciplineId);
  if (topics.length === 0) {
    return c.json({ error: "Discipline not found or has no topics" }, 404);
  }

  return c.json({
    disciplineId,
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      gradeLevel: t.gradeLevel,
      depth: t.depth,
      standardCode: t.standardCode,
    })),
  });
});

// GET /api/public/topics/:id — topic detail with problems + examples
publicRoutes.get("/topics/:id", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const contentSvc = createContentService(db, c.env.CONTENT);
  const topic = await graph.getTopic(c.req.param("id"));

  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const problems = await contentSvc.getTopicProblems({
    topicId: topic.id,
    discipline: topic.disciplineId,
    contentDepth: "survey",
    presentation: "standard",
  });

  const examples = await contentSvc.getTopicExamples({
    topicId: topic.id,
    discipline: topic.disciplineId,
    contentDepth: "survey",
    presentation: "standard",
  });

  return c.json({
    topic: {
      id: topic.id,
      disciplineId: topic.disciplineId,
      name: topic.name,
      description: topic.description,
      gradeLevel: topic.gradeLevel,
      depth: topic.depth,
      standardCode: topic.standardCode,
      problems,
      examples,
    },
  });
});

// GET /api/public/graph/:disciplineId — full graph structure
publicRoutes.get("/graph/:disciplineId", async (c) => {
  const db = getDb(c.env.DB);
  const disciplineId = c.req.param("disciplineId");

  const [discipline] = await db
    .select()
    .from(schema.disciplines)
    .where(eq(schema.disciplines.id, disciplineId));

  if (!discipline) return c.json({ error: "Discipline not found" }, 404);

  const topics = await db
    .select({
      id: schema.topics.id,
      name: schema.topics.name,
      description: schema.topics.description,
      gradeLevel: schema.topics.gradeLevel,
      depth: schema.topics.depth,
      standardCode: schema.topics.standardCode,
    })
    .from(schema.topics)
    .where(eq(schema.topics.disciplineId, disciplineId))
    .orderBy(schema.topics.depth);

  const topicIds = new Set(topics.map((t) => t.id));

  const allPrereqs = await db.select().from(schema.prerequisites);
  const prereqEdges = allPrereqs
    .filter((p) => topicIds.has(p.fromTopicId) && topicIds.has(p.toTopicId))
    .map((p) => ({
      from: p.fromTopicId,
      to: p.toTopicId,
      strength: p.strength,
    }));

  const allEncompassings = await db.select().from(schema.encompassings);
  const encompassingEdges = allEncompassings
    .filter((e) => topicIds.has(e.parentTopicId) && topicIds.has(e.childTopicId))
    .map((e) => ({
      parent: e.parentTopicId,
      child: e.childTopicId,
      weight: e.weight,
    }));

  return c.json({
    discipline: {
      id: discipline.id,
      name: discipline.name,
      description: discipline.description,
      progressionModel: discipline.progressionModel,
    },
    topics,
    prerequisites: prereqEdges,
    encompassings: encompassingEdges,
  });
});

// GET /api/public/download/:discipline — downloadable content pack
publicRoutes.get("/download/:discipline", async (c) => {
  const db = getDb(c.env.DB);
  const disciplineId = c.req.param("discipline");

  const [discipline] = await db
    .select()
    .from(schema.disciplines)
    .where(eq(schema.disciplines.id, disciplineId));

  if (!discipline) return c.json({ error: "Discipline not found" }, 404);

  const topics = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.disciplineId, disciplineId))
    .orderBy(schema.topics.depth);

  const topicIdList = topics.map((t) => t.id);
  const topicIdSet = new Set(topicIdList);

  const allPrereqs = await db.select().from(schema.prerequisites);
  const prereqEdges = allPrereqs
    .filter((p) => topicIdSet.has(p.fromTopicId) && topicIdSet.has(p.toTopicId))
    .map((p) => ({ from: p.fromTopicId, to: p.toTopicId, strength: p.strength }));

  const allEncompassings = await db.select().from(schema.encompassings);
  const encompassingEdges = allEncompassings
    .filter((e) => topicIdSet.has(e.parentTopicId) && topicIdSet.has(e.childTopicId))
    .map((e) => ({ parent: e.parentTopicId, child: e.childTopicId, weight: e.weight }));

  // Fetch content from R2 for each topic
  const contentSvc = createContentService(db, c.env.CONTENT);
  const problems: Record<string, unknown[]> = {};
  const workedExamples: Record<string, unknown[]> = {};
  let totalProblems = 0;
  let totalExamples = 0;

  await Promise.all(topicIdList.map(async (topicId) => {
    const [topicProblems, topicExamples] = await Promise.all([
      contentSvc.getTopicProblems({ topicId, discipline: disciplineId, contentDepth: "survey", presentation: "standard" }),
      contentSvc.getTopicExamples({ topicId, discipline: disciplineId, contentDepth: "survey", presentation: "standard" }),
    ]);
    if (topicProblems.length > 0) {
      problems[topicId] = topicProblems;
      totalProblems += topicProblems.length;
    }
    if (topicExamples.length > 0) {
      workedExamples[topicId] = topicExamples;
      totalExamples += topicExamples.length;
    }
  }));

  const pack = {
    meta: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      discipline: {
        id: discipline.id,
        name: discipline.name,
        description: discipline.description,
        progressionModel: discipline.progressionModel,
      },
      counts: {
        topics: topics.length,
        problems: totalProblems,
        workedExamples: totalExamples,
        prerequisites: prereqEdges.length,
        encompassings: encompassingEdges.length,
      },
      license: {
        type: "CC-BY-4.0",
        url: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Learn Platform (https://github.com/paulperrone/learn-platform)",
      },
    },
    graph: {
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        gradeLevel: t.gradeLevel,
        depth: t.depth,
        standardCode: t.standardCode,
      })),
      prerequisites: prereqEdges,
      encompassings: encompassingEdges,
    },
    problems,
    workedExamples,
  };

  const json = JSON.stringify(pack);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${disciplineId}-content-pack.json"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// GET /api/public/collections — list collections, optional ?discipline= filter
publicRoutes.get("/collections", async (c) => {
  const db = getDb(c.env.DB);
  const disciplineFilter = c.req.query("discipline");

  const query = db
    .select({
      id: schema.collections.id,
      name: schema.collections.name,
      description: schema.collections.description,
      kind: schema.collections.kind,
      gradeRange: schema.collections.gradeRange,
      disciplineId: schema.collections.primaryDisciplineId,
      displayOrder: schema.collections.displayOrder,
    })
    .from(schema.collections)
    .where(
      disciplineFilter
        ? and(eq(schema.collections.primaryDisciplineId, disciplineFilter), eq(schema.collections.visibility, "published"))
        : eq(schema.collections.visibility, "published")
    )
    .orderBy(schema.collections.displayOrder);

  const collections = await query;
  return c.json({ collections });
});

// GET /api/public/collections/:id — collection detail with topics
publicRoutes.get("/collections/:id", async (c) => {
  const db = getDb(c.env.DB);
  const collectionId = c.req.param("id");

  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId));

  if (!collection) return c.json({ error: "Collection not found" }, 404);

  const topicRows = await db
    .select({
      topicId: schema.collectionTopics.topicId,
      sortOrder: schema.collectionTopics.sortOrder,
      name: schema.topics.name,
      description: schema.topics.description,
      gradeLevel: schema.topics.gradeLevel,
      depth: schema.topics.depth,
    })
    .from(schema.collectionTopics)
    .innerJoin(schema.topics, eq(schema.collectionTopics.topicId, schema.topics.id))
    .where(eq(schema.collectionTopics.collectionId, collectionId))
    .orderBy(schema.collectionTopics.sortOrder);

  return c.json({
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      kind: collection.kind,
      gradeRange: collection.gradeRange,
      disciplineId: collection.primaryDisciplineId,
    },
    topics: topicRows.map((t) => ({
      id: t.topicId,
      name: t.name,
      description: t.description,
      gradeLevel: t.gradeLevel,
      depth: t.depth,
      sortOrder: t.sortOrder,
    })),
  });
});

// GET /api/public/schema — self-documenting API schema
publicRoutes.get("/schema", (c) => {
  return c.json({
    name: "Learn Platform Public API",
    version: "1.0.0",
    description: "Public, unauthenticated access to the learning content catalog. All content is free and open.",
    baseUrl: "/api/public",
    rateLimits: {
      default: { requests: 60, windowSeconds: 60, description: "Most endpoints" },
      graph: { requests: 10, windowSeconds: 60, description: "Full graph export endpoints" },
    },
    botPolicy: {
      description: "Known LLM scrapers and aggressive crawlers are blocked. See /robots.txt for crawl directives.",
      blocked: ["CCBot", "GPTBot", "ClaudeBot", "Bytespider", "ChatGPT-User", "Scrapy", "DataForSeoBot"],
      allowed: ["Googlebot", "Bingbot", "standard browsers"],
    },
    endpoints: [
      {
        method: "GET",
        path: "/api/public/disciplines",
        description: "List all disciplines with metadata",
        rateLimit: "default",
        response: {
          disciplines: [{ id: "string", name: "string", description: "string", progressionModel: "string" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/disciplines/:id/topics",
        description: "List all topics for a discipline, ordered by depth",
        rateLimit: "default",
        params: { id: "Discipline ID" },
        response: {
          disciplineId: "string",
          topics: [{ id: "string", name: "string", description: "string", gradeLevel: "number", depth: "number", standardCode: "string | null" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/collections",
        description: "List collections, optionally filtered by discipline",
        rateLimit: "default",
        query: { discipline: "Discipline ID (optional filter)" },
        response: {
          collections: [{ id: "string", name: "string", description: "string", kind: "string", gradeRange: "string | null", disciplineId: "string" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/collections/:id",
        description: "Get collection detail with topics",
        rateLimit: "default",
        params: { id: "Collection ID" },
        response: {
          collection: { id: "string", name: "string", description: "string", kind: "string", gradeRange: "string | null", disciplineId: "string" },
          topics: [{ id: "string", name: "string", sortOrder: "number" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/topics/:id",
        description: "Get topic detail with all problems and worked examples",
        rateLimit: "default",
        params: { id: "Topic ID" },
        response: {
          topic: {
            id: "string", disciplineId: "string", name: "string", description: "string",
            gradeLevel: "number", depth: "number", standardCode: "string | null",
            problems: "Problem[]", examples: "WorkedExample[]",
          },
        },
      },
      {
        method: "GET",
        path: "/api/public/graph/:disciplineId",
        description: "Full knowledge graph: topics, prerequisite edges, and encompassing edges",
        rateLimit: "graph",
        params: { disciplineId: "Discipline ID" },
        response: {
          discipline: { id: "string", name: "string", description: "string", progressionModel: "string" },
          topics: "Topic[]",
          prerequisites: [{ from: "string", to: "string", strength: "number" }],
          encompassings: [{ parent: "string", child: "string", weight: "number" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/download/:discipline",
        description: "Download complete content pack as JSON file (graph + all problems + all examples + license)",
        rateLimit: "graph",
        params: { discipline: "Discipline ID" },
        response: "JSON file download with Content-Disposition header",
      },
      {
        method: "GET",
        path: "/api/public/schema",
        description: "This endpoint — API documentation",
        rateLimit: "default",
      },
    ],
  });
});
