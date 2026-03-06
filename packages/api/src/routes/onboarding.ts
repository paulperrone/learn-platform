import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createAuth } from "../lib/auth.js";
import * as schema from "../db/schema.js";
import { createAccountMergeService } from "../services/account-merge.js";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type OnboardingEnv = Env & {
  Variables: {
    user: AuthUser;
  };
};

export const onboardingRoutes = new Hono<OnboardingEnv>();

// Auth middleware
onboardingRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  await next();
});

// Get onboarding state
onboardingRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("user");

  const state = await db.query.onboardingState.findFirst({
    where: eq(schema.onboardingState.userId, user.id),
  });

  if (!state) {
    return c.json({ step: 0, completedAt: null });
  }

  return c.json(state);
});

// Update onboarding step
onboardingRoutes.put("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("user");
  const { step, diagnosticSessionId } = await c.req.json<{
    step: number;
    diagnosticSessionId?: string;
  }>();

  const existing = await db.query.onboardingState.findFirst({
    where: eq(schema.onboardingState.userId, user.id),
  });

  const completedAt = step >= 4 ? new Date().toISOString() : null;

  if (existing) {
    await db
      .update(schema.onboardingState)
      .set({
        step,
        diagnosticSessionId: diagnosticSessionId ?? existing.diagnosticSessionId,
        completedAt,
      })
      .where(eq(schema.onboardingState.userId, user.id));
  } else {
    await db.insert(schema.onboardingState).values({
      userId: user.id,
      step,
      diagnosticSessionId: diagnosticSessionId ?? null,
      completedAt,
    });
  }

  return c.json({ success: true, step, completedAt });
});

// Merge anonymous data into authenticated account
onboardingRoutes.post("/merge", async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("user");
  const { anonymousToken } = await c.req.json<{ anonymousToken: string }>();

  if (!anonymousToken) return c.json({ error: "anonymousToken required" }, 400);

  const mergeService = createAccountMergeService(db);
  const result = await mergeService.mergeAnonymousData(user.id, anonymousToken);

  return c.json({ success: true, ...result });
});
