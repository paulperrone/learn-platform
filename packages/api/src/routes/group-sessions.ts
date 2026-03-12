import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createAuth } from "../lib/auth.js";
import { createGroupSessionService } from "../services/group-session.js";

type AuthUser = { id: string; name: string; email: string };

type GroupEnv = Env & {
  Variables: {
    user: AuthUser;
  };
};

export const groupSessionRoutes = new Hono<GroupEnv>();

// Helper to get optional auth
async function getOptionalUser(c: any): Promise<AuthUser | null> {
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user as AuthUser | null;
  } catch {
    return null;
  }
}

// Auth middleware for routes that require it
const requireAuth = async (c: any, next: () => Promise<void>) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  await next();
};

// POST /api/group-sessions — create a group session
groupSessionRoutes.post("/", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const user = c.get("user");
  const body = await c.req.json<{
    type: "family" | "classroom" | "peer-pair";
    topicId?: string;
    studentIds?: string[];
  }>();

  if (!["family", "classroom", "peer-pair"].includes(body.type)) {
    return c.json({ error: "Invalid session type" }, 400);
  }

  if (body.type === "peer-pair" && (!body.studentIds || body.studentIds.length !== 2)) {
    return c.json({ error: "Peer-pair requires exactly 2 studentIds" }, 400);
  }

  const result = await service.createSession(user.id, body.type, {
    topicId: body.topicId,
    studentIds: body.studentIds,
  });

  return c.json(result, 201);
});

// POST /api/group-sessions/join — join via code (auth optional)
groupSessionRoutes.post("/join", async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const body = await c.req.json<{
    joinCode: string;
    displayName?: string;
    anonymousToken?: string;
  }>();

  if (!body.joinCode) {
    return c.json({ error: "joinCode required" }, 400);
  }

  const user = await getOptionalUser(c);

  const result = await service.joinByCode(body.joinCode.toUpperCase(), {
    userId: user?.id,
    anonymousToken: body.anonymousToken,
    displayName: body.displayName,
  });

  if ("error" in result) {
    return c.json(result, 404);
  }

  return c.json(result);
});

// GET /api/group-sessions — list facilitator's sessions
groupSessionRoutes.get("/", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const user = c.get("user");

  const sessions = await service.listSessions(user.id);
  return c.json({ sessions });
});

// GET /api/group-sessions/:id/dashboard — real-time dashboard
groupSessionRoutes.get("/:id/dashboard", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");

  const dashboard = await service.getDashboard(sessionId);
  if (!dashboard) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(dashboard);
});

// GET /api/group-sessions/:id/suggest-topics — suggest topics for group
groupSessionRoutes.get("/:id/suggest-topics", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");

  const dashboard = await service.getDashboard(sessionId);
  if (!dashboard) {
    return c.json({ error: "Session not found" }, 404);
  }

  const studentUserIds = dashboard.participants
    .filter((p) => p.role === "student" && p.userId)
    .map((p) => p.userId!);

  const suggestions = await service.suggestTopics(studentUserIds);
  return c.json({ suggestions });
});

// POST /api/group-sessions/:id/set-topic — facilitator sets the topic
groupSessionRoutes.post("/:id/set-topic", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const sessionId = c.req.param("id");
  const body = await c.req.json<{ topicId: string }>();

  if (!body.topicId) {
    return c.json({ error: "topicId required" }, 400);
  }

  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.id, body.topicId));
  if (!topic) {
    return c.json({ error: "Topic not found" }, 404);
  }

  await db
    .update(schema.groupSessions)
    .set({ topicId: body.topicId })
    .where(eq(schema.groupSessions.id, sessionId));

  return c.json({ topicId: body.topicId, topicName: topic.name });
});

// GET /api/group-sessions/:id/problem/:participantId — get problem for participant
groupSessionRoutes.get("/:id/problem/:participantId", async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");
  const participantId = c.req.param("participantId");

  const result = await service.getParticipantProblem(sessionId, participantId);
  if (!result) {
    return c.json({ error: "No problem available" }, 404);
  }

  return c.json(result);
});

// POST /api/group-sessions/:id/respond/:participantId — record response
groupSessionRoutes.post("/:id/respond/:participantId", async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const participantId = c.req.param("participantId");
  const body = await c.req.json<{
    correct: boolean;
    topicId: string;
    responseMs: number;
  }>();

  const result = await service.recordResponse(
    participantId,
    body.correct,
    body.topicId,
    body.responseMs
  );
  if (!result) {
    return c.json({ error: "Participant not found" }, 404);
  }

  return c.json(result);
});

// GET /api/group-sessions/:id/peer-pair — get peer pair turn state
groupSessionRoutes.get("/:id/peer-pair", async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");

  const state = await service.getPeerPairState(sessionId);
  if (!state) {
    return c.json({ error: "Not a peer-pair session or invalid" }, 404);
  }

  return c.json(state);
});

// POST /api/group-sessions/:id/end — end the session
groupSessionRoutes.post("/:id/end", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const service = createGroupSessionService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");

  const result = await service.endSession(sessionId);
  return c.json(result);
});
