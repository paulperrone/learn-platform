import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Env } from "../index.js";
import type { SpeechSettings } from "@learn/shared";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type SettingsEnv = Env & {
  Variables: {
    user: AuthUser;
  };
};

const DEFAULTS: SpeechSettings = {
  ttsEnabled: true,
  ttsRate: 0.9,
  ttsVoiceName: null,
  ttsAutoRead: false,
  sttEnabled: true,
};

export const settingsRoutes = new Hono<SettingsEnv>();

// --- Auth middleware ---

settingsRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  await next();
});

// --- Own settings ---

// GET /api/settings — get current user's speech preferences
settingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, user.id))
    .limit(1);

  if (rows.length === 0) {
    return c.json(DEFAULTS);
  }

  const row = rows[0];
  return c.json({
    ttsEnabled: row.ttsEnabled,
    ttsRate: row.ttsRate,
    ttsVoiceName: row.ttsVoiceName,
    ttsAutoRead: row.ttsAutoRead,
    sttEnabled: row.sttEnabled,
  } satisfies SpeechSettings);
});

// PUT /api/settings — upsert current user's speech preferences
settingsRoutes.put("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<SpeechSettings>>();
  const now = new Date().toISOString();

  const existing = await db
    .select({ userId: schema.userPreferences.userId })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, user.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.userPreferences).values({
      userId: user.id,
      ttsEnabled: body.ttsEnabled ?? DEFAULTS.ttsEnabled,
      ttsRate: body.ttsRate ?? DEFAULTS.ttsRate,
      ttsVoiceName: body.ttsVoiceName ?? DEFAULTS.ttsVoiceName,
      ttsAutoRead: body.ttsAutoRead ?? DEFAULTS.ttsAutoRead,
      sttEnabled: body.sttEnabled ?? DEFAULTS.sttEnabled,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(schema.userPreferences)
      .set({ ...body, updatedAt: now })
      .where(eq(schema.userPreferences.userId, user.id));
  }

  return c.json({ success: true });
});

// --- Child settings (parent access) ---

// GET /api/settings/:childId — parent reads child's preferences
settingsRoutes.get("/:childId", async (c) => {
  const user = c.get("user");
  const childId = c.req.param("childId");
  const db = getDb(c.env.DB);

  // Verify parent owns this child
  const child = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, childId))
    .limit(1);

  if (child.length === 0 || child[0].managedBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, childId))
    .limit(1);

  if (rows.length === 0) {
    return c.json(DEFAULTS);
  }

  const row = rows[0];
  return c.json({
    ttsEnabled: row.ttsEnabled,
    ttsRate: row.ttsRate,
    ttsVoiceName: row.ttsVoiceName,
    ttsAutoRead: row.ttsAutoRead,
    sttEnabled: row.sttEnabled,
  } satisfies SpeechSettings);
});

// PUT /api/settings/:childId — parent updates child's preferences
settingsRoutes.put("/:childId", async (c) => {
  const user = c.get("user");
  const childId = c.req.param("childId");
  const db = getDb(c.env.DB);
  const body = await c.req.json<Partial<SpeechSettings>>();
  const now = new Date().toISOString();

  // Verify parent owns this child
  const child = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, childId))
    .limit(1);

  if (child.length === 0 || child[0].managedBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const existing = await db
    .select({ userId: schema.userPreferences.userId })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, childId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.userPreferences).values({
      userId: childId,
      ttsEnabled: body.ttsEnabled ?? DEFAULTS.ttsEnabled,
      ttsRate: body.ttsRate ?? DEFAULTS.ttsRate,
      ttsVoiceName: body.ttsVoiceName ?? DEFAULTS.ttsVoiceName,
      ttsAutoRead: body.ttsAutoRead ?? DEFAULTS.ttsAutoRead,
      sttEnabled: body.sttEnabled ?? DEFAULTS.sttEnabled,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(schema.userPreferences)
      .set({ ...body, updatedAt: now })
      .where(eq(schema.userPreferences.userId, childId));
  }

  return c.json({ success: true });
});
