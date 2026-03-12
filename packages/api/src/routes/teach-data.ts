import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createContentService } from "../services/content.js";
import { eq, and, desc } from "drizzle-orm";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string };

type TeachEnv = Env & {
  Variables: {
    user: AuthUser;
    session: Record<string, unknown>;
  };
};

export const teachDataRoutes = new Hono<TeachEnv>();

// Auth middleware
teachDataRoutes.use("/*", async (c, next) => {
  // Skip auth for assignment lookup by share code (public)
  if (c.req.path.startsWith("/api/teach-data/assignments/code/")) {
    await next();
    return;
  }
  // Skip auth for submitting assignment responses (public)
  if (c.req.method === "POST" && c.req.path.match(/\/assignments\/[^/]+\/responses$/)) {
    await next();
    return;
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

// --- Teach Sessions ---

// POST /api/teach-data/sessions — log a teach session
teachDataRoutes.post("/sessions", async (c) => {
  const user = c.get("user");
  const { topicId, notes } = await c.req.json<{ topicId: string; notes?: string }>();

  if (!topicId) {
    return c.json({ error: "topicId is required" }, 400);
  }

  const db = getDb(c.env.DB);

  // Verify topic exists
  const topic = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(eq(schema.topics.id, topicId))
    .limit(1);

  if (topic.length === 0) {
    return c.json({ error: "Topic not found" }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.teachSessions).values({
    id,
    teacherId: user.id,
    topicId,
    startedAt: now,
    notes: notes ?? null,
  });

  return c.json({ id, teacherId: user.id, topicId, startedAt: now }, 201);
});

// PATCH /api/teach-data/sessions/:id — end a teach session
teachDataRoutes.patch("/sessions/:id", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");
  const { notes } = await c.req.json<{ notes?: string }>();

  const db = getDb(c.env.DB);

  const session = await db
    .select()
    .from(schema.teachSessions)
    .where(eq(schema.teachSessions.id, sessionId))
    .limit(1);

  if (session.length === 0) {
    return c.json({ error: "Teach session not found" }, 404);
  }

  if (session[0].teacherId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updates: Record<string, unknown> = { endedAt: new Date().toISOString() };
  if (notes !== undefined) updates.notes = notes;

  await db
    .update(schema.teachSessions)
    .set(updates)
    .where(eq(schema.teachSessions.id, sessionId));

  return c.json({ success: true });
});

// GET /api/teach-data/sessions — list teach sessions for current user
teachDataRoutes.get("/sessions", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const sessions = await db
    .select({
      id: schema.teachSessions.id,
      topicId: schema.teachSessions.topicId,
      topicName: schema.topics.name,
      startedAt: schema.teachSessions.startedAt,
      endedAt: schema.teachSessions.endedAt,
      notes: schema.teachSessions.notes,
    })
    .from(schema.teachSessions)
    .innerJoin(schema.topics, eq(schema.teachSessions.topicId, schema.topics.id))
    .where(eq(schema.teachSessions.teacherId, user.id))
    .orderBy(desc(schema.teachSessions.startedAt))
    .limit(50);

  return c.json({ sessions });
});

// --- Assignments ---

function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/teach-data/assignments — create an assignment
teachDataRoutes.post("/assignments", async (c) => {
  const user = c.get("user");
  const { topicId, title, description, maxProblems, expiresAt } = await c.req.json<{
    topicId: string;
    title: string;
    description?: string;
    maxProblems?: number;
    expiresAt?: string;
  }>();

  if (!topicId || !title) {
    return c.json({ error: "topicId and title are required" }, 400);
  }

  const db = getDb(c.env.DB);

  const topic = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(eq(schema.topics.id, topicId))
    .limit(1);

  if (topic.length === 0) {
    return c.json({ error: "Topic not found" }, 404);
  }

  const id = crypto.randomUUID();
  const shareCode = generateShareCode();
  const now = new Date().toISOString();

  await db.insert(schema.assignments).values({
    id,
    teacherId: user.id,
    topicId,
    shareCode,
    title,
    description: description ?? null,
    maxProblems: maxProblems ?? null,
    createdAt: now,
    expiresAt: expiresAt ?? null,
  });

  return c.json({ id, shareCode, title, topicId, createdAt: now }, 201);
});

// GET /api/teach-data/assignments — list teacher's assignments
teachDataRoutes.get("/assignments", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const list = await db
    .select({
      id: schema.assignments.id,
      topicId: schema.assignments.topicId,
      topicName: schema.topics.name,
      shareCode: schema.assignments.shareCode,
      title: schema.assignments.title,
      description: schema.assignments.description,
      maxProblems: schema.assignments.maxProblems,
      createdAt: schema.assignments.createdAt,
      expiresAt: schema.assignments.expiresAt,
    })
    .from(schema.assignments)
    .innerJoin(schema.topics, eq(schema.assignments.topicId, schema.topics.id))
    .where(eq(schema.assignments.teacherId, user.id))
    .orderBy(desc(schema.assignments.createdAt))
    .limit(50);

  return c.json({ assignments: list });
});

// GET /api/teach-data/assignments/code/:code — look up assignment by share code (public)
teachDataRoutes.get("/assignments/code/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const db = getDb(c.env.DB);

  const assignment = await db
    .select({
      id: schema.assignments.id,
      topicId: schema.assignments.topicId,
      topicName: schema.topics.name,
      title: schema.assignments.title,
      description: schema.assignments.description,
      maxProblems: schema.assignments.maxProblems,
      expiresAt: schema.assignments.expiresAt,
    })
    .from(schema.assignments)
    .innerJoin(schema.topics, eq(schema.assignments.topicId, schema.topics.id))
    .where(eq(schema.assignments.shareCode, code))
    .limit(1);

  if (assignment.length === 0) {
    return c.json({ error: "Assignment not found" }, 404);
  }

  // Check expiry
  if (assignment[0].expiresAt && new Date(assignment[0].expiresAt) < new Date()) {
    return c.json({ error: "Assignment has expired" }, 410);
  }

  // Get problems for the topic from R2
  const contentSvc = createContentService(db, c.env.CONTENT);
  const [topicRow] = await db.select({ disciplineId: schema.topics.disciplineId }).from(schema.topics).where(eq(schema.topics.id, assignment[0].topicId));
  const allProblems = await contentSvc.getTopicProblems({
    topicId: assignment[0].topicId,
    discipline: topicRow?.disciplineId,
    contentDepth: "survey",
    presentation: "standard",
  });
  const problems = allProblems.slice(0, assignment[0].maxProblems ?? 10);

  return c.json({ assignment: assignment[0], problems });
});

// POST /api/teach-data/assignments/:id/responses — submit response (public, no auth required)
teachDataRoutes.post("/assignments/:id/responses", async (c) => {
  const assignmentId = c.req.param("id");
  const { questionId, answer, correct, userId, anonymousToken } = await c.req.json<{
    questionId: string;
    answer: string;
    correct?: boolean;
    userId?: string;
    anonymousToken?: string;
  }>();

  if (!questionId || answer === undefined) {
    return c.json({ error: "questionId and answer are required" }, 400);
  }

  const db = getDb(c.env.DB);

  // Verify assignment exists
  const assignment = await db
    .select({ id: schema.assignments.id, expiresAt: schema.assignments.expiresAt })
    .from(schema.assignments)
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);

  if (assignment.length === 0) {
    return c.json({ error: "Assignment not found" }, 404);
  }

  if (assignment[0].expiresAt && new Date(assignment[0].expiresAt) < new Date()) {
    return c.json({ error: "Assignment has expired" }, 410);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.assignmentResponses).values({
    id,
    assignmentId,
    userId: userId ?? null,
    anonymousToken: anonymousToken ?? null,
    questionId,
    answer,
    correct: correct ?? null,
    createdAt: now,
  });

  return c.json({ id, createdAt: now }, 201);
});

// GET /api/teach-data/assignments/:id/responses — get responses for an assignment (teacher only)
teachDataRoutes.get("/assignments/:id/responses", async (c) => {
  const user = c.get("user");
  const assignmentId = c.req.param("id");
  const db = getDb(c.env.DB);

  // Verify teacher owns assignment
  const assignment = await db
    .select()
    .from(schema.assignments)
    .where(
      and(
        eq(schema.assignments.id, assignmentId),
        eq(schema.assignments.teacherId, user.id)
      )
    )
    .limit(1);

  if (assignment.length === 0) {
    return c.json({ error: "Assignment not found or not yours" }, 404);
  }

  const responses = await db
    .select()
    .from(schema.assignmentResponses)
    .where(eq(schema.assignmentResponses.assignmentId, assignmentId))
    .orderBy(desc(schema.assignmentResponses.createdAt));

  return c.json({ responses });
});

// GET /api/teach-data/dashboard — teacher dashboard: topics covered, linked students
teachDataRoutes.get("/dashboard", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  // Recent teach sessions
  const recentSessions = await db
    .select({
      id: schema.teachSessions.id,
      topicId: schema.teachSessions.topicId,
      topicName: schema.topics.name,
      startedAt: schema.teachSessions.startedAt,
    })
    .from(schema.teachSessions)
    .innerJoin(schema.topics, eq(schema.teachSessions.topicId, schema.topics.id))
    .where(eq(schema.teachSessions.teacherId, user.id))
    .orderBy(desc(schema.teachSessions.startedAt))
    .limit(10);

  // Linked students
  const linkedStudents = await db
    .select({
      linkId: schema.accountLinks.id,
      linkType: schema.accountLinks.type,
      studentId: schema.users.id,
      studentName: schema.users.name,
    })
    .from(schema.accountLinks)
    .innerJoin(schema.users, eq(schema.accountLinks.toUserId, schema.users.id))
    .where(
      and(
        eq(schema.accountLinks.fromUserId, user.id),
        eq(schema.accountLinks.status, "active")
      )
    );

  // Recent assignments
  const recentAssignments = await db
    .select({
      id: schema.assignments.id,
      title: schema.assignments.title,
      shareCode: schema.assignments.shareCode,
      topicName: schema.topics.name,
      createdAt: schema.assignments.createdAt,
    })
    .from(schema.assignments)
    .innerJoin(schema.topics, eq(schema.assignments.topicId, schema.topics.id))
    .where(eq(schema.assignments.teacherId, user.id))
    .orderBy(desc(schema.assignments.createdAt))
    .limit(10);

  return c.json({
    recentSessions,
    linkedStudents,
    recentAssignments,
  });
});
