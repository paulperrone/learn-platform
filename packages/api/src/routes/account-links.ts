import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, or } from "drizzle-orm";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string };

type LinkEnv = Env & {
  Variables: {
    user: AuthUser;
    session: Record<string, unknown>;
  };
};

export const accountLinkRoutes = new Hono<LinkEnv>();

// Auth middleware
accountLinkRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

// GET /api/account-links — list all links for current user (both directions)
accountLinkRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const links = await db
    .select({
      id: schema.accountLinks.id,
      fromUserId: schema.accountLinks.fromUserId,
      toUserId: schema.accountLinks.toUserId,
      type: schema.accountLinks.type,
      permissions: schema.accountLinks.permissions,
      status: schema.accountLinks.status,
      createdAt: schema.accountLinks.createdAt,
      linkedUserName: schema.users.name,
      linkedUserEmail: schema.users.email,
    })
    .from(schema.accountLinks)
    .innerJoin(
      schema.users,
      or(
        and(
          eq(schema.accountLinks.fromUserId, user.id),
          eq(schema.users.id, schema.accountLinks.toUserId)
        ),
        and(
          eq(schema.accountLinks.toUserId, user.id),
          eq(schema.users.id, schema.accountLinks.fromUserId)
        )
      )
    )
    .where(
      or(
        eq(schema.accountLinks.fromUserId, user.id),
        eq(schema.accountLinks.toUserId, user.id)
      )
    );

  return c.json({ links });
});

// POST /api/account-links — create a link (from current user to target)
accountLinkRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { toUserId, type } = await c.req.json<{
    toUserId: string;
    type: string;
  }>();

  const validTypes = ["parent", "teacher", "tutor", "guardian"];
  if (!validTypes.includes(type)) {
    return c.json({ error: `Invalid link type. Must be one of: ${validTypes.join(", ")}` }, 400);
  }

  if (!toUserId) {
    return c.json({ error: "toUserId is required" }, 400);
  }

  if (toUserId === user.id) {
    return c.json({ error: "Cannot link to yourself" }, 400);
  }

  const db = getDb(c.env.DB);

  // Verify target user exists
  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, toUserId))
    .limit(1);

  if (target.length === 0) {
    return c.json({ error: "Target user not found" }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db.insert(schema.accountLinks).values({
      id,
      fromUserId: user.id,
      toUserId,
      type,
      status: "active",
      createdAt: now,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: "Link already exists" }, 409);
    }
    throw e;
  }

  return c.json({ id, fromUserId: user.id, toUserId, type, status: "active", createdAt: now }, 201);
});

// POST /api/account-links/by-email — create link by target email (for invitations)
accountLinkRoutes.post("/by-email", async (c) => {
  const user = c.get("user");
  const { email, type } = await c.req.json<{
    email: string;
    type: string;
  }>();

  const validTypes = ["parent", "teacher", "tutor", "guardian"];
  if (!validTypes.includes(type)) {
    return c.json({ error: `Invalid link type. Must be one of: ${validTypes.join(", ")}` }, 400);
  }

  if (!email) {
    return c.json({ error: "email is required" }, 400);
  }

  const db = getDb(c.env.DB);

  const target = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (target.length === 0) {
    return c.json({ error: "User not found with that email" }, 404);
  }

  if (target[0].id === user.id) {
    return c.json({ error: "Cannot link to yourself" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db.insert(schema.accountLinks).values({
      id,
      fromUserId: user.id,
      toUserId: target[0].id,
      type,
      status: "active",
      createdAt: now,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: "Link already exists" }, 409);
    }
    throw e;
  }

  return c.json({ id, fromUserId: user.id, toUserId: target[0].id, type, status: "active", createdAt: now }, 201);
});

// PATCH /api/account-links/:id — update link status (revoke, reactivate)
accountLinkRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const linkId = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();

  const validStatuses = ["active", "revoked"];
  if (!validStatuses.includes(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
  }

  const db = getDb(c.env.DB);

  // Only the fromUser (link creator) or the toUser (link target) can update
  const link = await db
    .select()
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.id, linkId))
    .limit(1);

  if (link.length === 0) {
    return c.json({ error: "Link not found" }, 404);
  }

  if (link[0].fromUserId !== user.id && link[0].toUserId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .update(schema.accountLinks)
    .set({ status })
    .where(eq(schema.accountLinks.id, linkId));

  return c.json({ success: true });
});

// DELETE /api/account-links/:id — remove a link
accountLinkRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const linkId = c.req.param("id");

  const db = getDb(c.env.DB);

  const link = await db
    .select()
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.id, linkId))
    .limit(1);

  if (link.length === 0) {
    return c.json({ error: "Link not found" }, 404);
  }

  if (link[0].fromUserId !== user.id && link[0].toUserId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.delete(schema.accountLinks).where(eq(schema.accountLinks.id, linkId));

  return c.json({ success: true });
});

// GET /api/account-links/students — list students linked to current user (teacher/tutor/parent view)
accountLinkRoutes.get("/students", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const links = await db
    .select({
      linkId: schema.accountLinks.id,
      linkType: schema.accountLinks.type,
      studentId: schema.users.id,
      studentName: schema.users.name,
      studentEmail: schema.users.email,
    })
    .from(schema.accountLinks)
    .innerJoin(schema.users, eq(schema.accountLinks.toUserId, schema.users.id))
    .where(
      and(
        eq(schema.accountLinks.fromUserId, user.id),
        eq(schema.accountLinks.status, "active")
      )
    );

  return c.json({ students: links });
});

// GET /api/account-links/students/:studentId/progress — view linked student progress
accountLinkRoutes.get("/students/:studentId/progress", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const db = getDb(c.env.DB);

  // Verify active link exists
  const link = await db
    .select()
    .from(schema.accountLinks)
    .where(
      and(
        eq(schema.accountLinks.fromUserId, user.id),
        eq(schema.accountLinks.toUserId, studentId),
        eq(schema.accountLinks.status, "active")
      )
    )
    .limit(1);

  if (link.length === 0) {
    return c.json({ error: "No active link to this student" }, 403);
  }

  const topicStates = await db
    .select()
    .from(schema.userTopicState)
    .where(eq(schema.userTopicState.userId, studentId));

  const mastered = topicStates.filter((t) => t.mastered).length;
  const frontier = topicStates.filter((t) => t.frontier).length;

  return c.json({
    studentId,
    stats: {
      totalTopics: topicStates.length,
      mastered,
      frontier,
      inProgress: topicStates.length - mastered,
    },
    topics: topicStates,
  });
});
