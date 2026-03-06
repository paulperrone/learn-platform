import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createGraphService } from "../services/graph.js";
import * as schema from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";

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

// GET /api/public/subjects — list all subjects
publicRoutes.get("/subjects", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const subjects = await graph.getSubjects();
  return c.json({
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      gradeRange: s.gradeRange,
      topicCount: s.topicCount,
      disciplineId: s.disciplineId,
    })),
  });
});

// GET /api/public/subjects/:id/topics — topics for a subject
publicRoutes.get("/subjects/:id/topics", async (c) => {
  const db = getDb(c.env.DB);
  const graph = createGraphService(db);
  const subjectId = c.req.param("id");

  const topics = await graph.getSubjectTopics(subjectId);
  if (topics.length === 0) {
    return c.json({ error: "Subject not found or has no topics" }, 404);
  }

  return c.json({
    subjectId,
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
  const topic = await graph.getTopic(c.req.param("id"));

  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const problems = await db
    .select()
    .from(schema.assessmentContent)
    .where(eq(schema.assessmentContent.topicId, topic.id));

  const examples = await db
    .select()
    .from(schema.instructionalContent)
    .where(eq(schema.instructionalContent.topicId, topic.id));

  return c.json({
    topic: {
      id: topic.id,
      subjectId: topic.subjectId,
      name: topic.name,
      description: topic.description,
      gradeLevel: topic.gradeLevel,
      depth: topic.depth,
      standardCode: topic.standardCode,
      problems: problems.map((p) => ({
        id: p.id,
        topicId: p.topicId,
        difficulty: p.difficulty,
        question: p.question,
        answer: p.answer,
        hints: JSON.parse(p.hintsJson),
        solution: p.solution,
        type: p.type,
      })),
      examples: examples.map((e) => ({
        id: e.id,
        topicId: e.topicId,
        title: e.title,
        steps: JSON.parse(e.stepsJson),
      })),
    },
  });
});

// GET /api/public/graph/:subjectId — full graph structure
publicRoutes.get("/graph/:subjectId", async (c) => {
  const db = getDb(c.env.DB);
  const subjectId = c.req.param("subjectId");

  const [subject] = await db
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.id, subjectId));

  if (!subject) return c.json({ error: "Subject not found" }, 404);

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
    .where(eq(schema.topics.subjectId, subjectId))
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
    subject: {
      id: subject.id,
      name: subject.name,
      description: subject.description,
      gradeRange: subject.gradeRange,
      topicCount: subject.topicCount,
    },
    topics,
    prerequisites: prereqEdges,
    encompassings: encompassingEdges,
  });
});

// GET /api/public/download/:subject — downloadable content pack
publicRoutes.get("/download/:subject", async (c) => {
  const db = getDb(c.env.DB);
  const subjectId = c.req.param("subject");

  const [subject] = await db
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.id, subjectId));

  if (!subject) return c.json({ error: "Subject not found" }, 404);

  const topics = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.subjectId, subjectId))
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

  const allProblems = topicIdList.length > 0
    ? await db.select().from(schema.assessmentContent).where(inArray(schema.assessmentContent.topicId, topicIdList))
    : [];
  const allExamples = topicIdList.length > 0
    ? await db.select().from(schema.instructionalContent).where(inArray(schema.instructionalContent.topicId, topicIdList))
    : [];

  const problems: Record<string, unknown[]> = {};
  const workedExamples: Record<string, unknown[]> = {};
  let totalProblems = 0;
  let totalExamples = 0;

  for (const p of allProblems) {
    const list = problems[p.topicId] ?? [];
    list.push({
      id: p.id, topicId: p.topicId, difficulty: p.difficulty,
      question: p.question, answer: p.answer,
      hints: JSON.parse(p.hintsJson), solution: p.solution, type: p.type,
    });
    problems[p.topicId] = list;
    totalProblems++;
  }

  for (const e of allExamples) {
    const list = workedExamples[e.topicId] ?? [];
    list.push({
      id: e.id, topicId: e.topicId, title: e.title,
      steps: JSON.parse(e.stepsJson),
    });
    workedExamples[e.topicId] = list;
    totalExamples++;
  }

  const pack = {
    meta: {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      subject: {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        gradeRange: subject.gradeRange,
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
      "Content-Disposition": `attachment; filename="${subjectId}-content-pack.json"`,
      "Cache-Control": "public, max-age=86400",
    },
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
        path: "/api/public/subjects",
        description: "List all subjects with metadata",
        rateLimit: "default",
        response: {
          subjects: [{ id: "string", name: "string", description: "string", gradeRange: "string", topicCount: "number" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/subjects/:id/topics",
        description: "List all topics for a subject, ordered by depth",
        rateLimit: "default",
        params: { id: "Subject ID" },
        response: {
          subjectId: "string",
          topics: [{ id: "string", name: "string", description: "string", gradeLevel: "number", depth: "number", standardCode: "string | null" }],
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
            id: "string", subjectId: "string", name: "string", description: "string",
            gradeLevel: "number", depth: "number", standardCode: "string | null",
            problems: "Problem[]", examples: "WorkedExample[]",
          },
        },
      },
      {
        method: "GET",
        path: "/api/public/graph/:subjectId",
        description: "Full knowledge graph: topics, prerequisite edges, and encompassing edges",
        rateLimit: "graph",
        params: { subjectId: "Subject ID" },
        response: {
          subject: { id: "string", name: "string", description: "string", gradeRange: "string", topicCount: "number" },
          topics: "Topic[]",
          prerequisites: [{ from: "string", to: "string", strength: "number" }],
          encompassings: [{ parent: "string", child: "string", weight: "number" }],
        },
      },
      {
        method: "GET",
        path: "/api/public/download/:subject",
        description: "Download complete content pack as JSON file (graph + all problems + all examples + license)",
        rateLimit: "graph",
        params: { subject: "Subject ID" },
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
