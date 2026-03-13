import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createLLMService, getModelConfig } from "../services/llm.js";
import type { ModelConfig } from "../services/llm.js";
import * as schema from "../db/schema.js";
import { eq, and, gte, inArray } from "drizzle-orm";

export const llmRoutes = new Hono<Env>();

const LLM_UNAVAILABLE = { available: false, error: "AI tutoring is not configured" };

/** Mark a learn session as LLM-assisted for the current problem */
async function markSessionLLMAssisted(db: ReturnType<typeof getDb>, sessionId: string, hintSource?: "llm") {
  const row = await db.query.learnSessions.findFirst({
    where: eq(schema.learnSessions.id, sessionId),
    columns: { stateJson: true, endedAt: true },
  });
  if (!row?.stateJson || row.endedAt) return;
  try {
    const state = JSON.parse(row.stateJson);
    state.llmAssistedThisProblem = true;
    if (hintSource) state.hintSourceThisProblem = hintSource;
    await db
      .update(schema.learnSessions)
      .set({ stateJson: JSON.stringify(state), updatedAt: new Date().toISOString() })
      .where(eq(schema.learnSessions.id, sessionId));
  } catch {
    // Best-effort — don't fail the LLM response
  }
}

/** Middleware: check if LLM is available (API key configured) */
llmRoutes.use("*", async (c, next) => {
  // Status and usage endpoints work without an API key
  if (c.req.path.endsWith("/status") || c.req.path.includes("/usage/")) {
    return next();
  }
  if (!c.env.OPENROUTER_API_KEY) {
    return c.json(LLM_UNAVAILABLE, 503);
  }
  return next();
});

/** Check LLM availability — frontend calls this to decide UI state */
llmRoutes.get("/status", async (c) => {
  const available = !!c.env.OPENROUTER_API_KEY;
  if (!available) return c.json({ available: false });

  const db = getDb(c.env.DB);
  const config = await getModelConfig(db);
  return c.json({
    available: true,
    tiers: Object.entries(config.modelMap).map(([tier, modelId]) => ({ tier, modelId })),
  });
});

/** Check if user is over their family's monthly LLM budget */
async function checkBudget(db: ReturnType<typeof getDb>, userId: string): Promise<boolean> {
  const userRow = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!userRow.length || !userRow[0].managedBy) return true;

  const parentId = userRow[0].managedBy;
  const parentMembership = await db
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, parentId))
    .limit(1);

  if (!parentMembership.length) return true;

  const org = await db
    .select({ metadata: schema.organizations.metadata })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, parentMembership[0].organizationId))
    .limit(1);

  if (!org.length || !org[0].metadata) return true;

  let meta: Record<string, unknown>;
  try { meta = JSON.parse(org[0].metadata); } catch { return true; }

  const budget = typeof meta.monthlyBudgetCents === "number" ? meta.monthlyBudgetCents : null;
  if (budget === null) return true;

  const familyMembers = await db
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(eq(schema.members.organizationId, parentMembership[0].organizationId));

  const memberIds = familyMembers.map((m) => m.userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const usageRows = await db
    .select({ costCents: schema.llmUsage.costCents })
    .from(schema.llmUsage)
    .where(and(inArray(schema.llmUsage.userId, memberIds), gte(schema.llmUsage.createdAt, monthStart)));

  const totalCost = usageRows.reduce((sum, r) => sum + r.costCents, 0);
  return totalCost < budget;
}

const BUDGET_ERROR = { error: "LLM usage limit reached for this month. Learning continues without AI tutoring." };

/** Resolve the API key for a user: family provisioned key → platform key fallback */
async function resolveApiKey(db: ReturnType<typeof getDb>, userId: string, platformKey: string): Promise<string> {
  // Find user's parent (managed child) → parent's org → org metadata
  const userRow = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const parentId = userRow.length > 0 ? userRow[0].managedBy : null;
  const lookupId = parentId ?? userId;

  const membership = await db
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, lookupId))
    .limit(1);

  if (!membership.length) return platformKey;

  const org = await db
    .select({ metadata: schema.organizations.metadata })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, membership[0].organizationId))
    .limit(1);

  if (!org.length || !org[0].metadata) return platformKey;

  try {
    const meta = JSON.parse(org[0].metadata) as Record<string, unknown>;
    if (typeof meta.openrouterApiKey === "string" && meta.openrouterApiKey) {
      return meta.openrouterApiKey;
    }
  } catch {
    // invalid metadata JSON
  }

  return platformKey;
}

/** Create LLM service with model config loaded from DB, using the best available API key */
async function createConfiguredLLM(db: ReturnType<typeof getDb>, userId: string, platformKey: string) {
  const [config, apiKey] = await Promise.all([
    getModelConfig(db),
    resolveApiKey(db, userId, platformKey),
  ]);
  return createLLMService(db, apiKey, config);
}

llmRoutes.post("/evaluate", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicId?: string;
    topicName: string;
    stepDescription: string;
    studentExplanation: string;
    sessionId?: string;
    locale?: string;
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  const llm = await createConfiguredLLM(db, body.userId, c.env.OPENROUTER_API_KEY);

  // Set LLM-assisted flag on session state if sessionId provided
  if (body.sessionId) {
    await markSessionLLMAssisted(db, body.sessionId);
  }

  const result = await llm.evaluateExplanation(
    body.userId,
    body.topicName,
    body.stepDescription,
    body.studentExplanation,
    body.topicId,
    body.locale
  );
  return c.json(result);
});

llmRoutes.post("/tutor", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicId?: string;
    topicName: string;
    problemQuestion: string;
    studentResponse: string;
    conversationHistory?: { role: "system" | "user" | "assistant"; content: string }[];
    sessionId?: string;
    locale?: string;
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  if (body.sessionId) await markSessionLLMAssisted(db, body.sessionId);
  const llm = await createConfiguredLLM(db, body.userId, c.env.OPENROUTER_API_KEY);
  const result = await llm.socraticTutor(
    body.userId,
    body.topicName,
    body.problemQuestion,
    body.studentResponse,
    body.conversationHistory,
    body.topicId,
    body.locale
  );
  return c.json(result);
});

llmRoutes.post("/tutor-stream", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicId?: string;
    topicName: string;
    problemQuestion: string;
    studentResponse: string;
    conversationHistory?: { role: "system" | "user" | "assistant"; content: string }[];
    sessionId?: string;
    locale?: string;
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  if (body.sessionId) await markSessionLLMAssisted(db, body.sessionId);
  const llm = await createConfiguredLLM(db, body.userId, c.env.OPENROUTER_API_KEY);

  try {
    const { stream } = await llm.socraticTutorStream(
      body.userId,
      body.topicName,
      body.problemQuestion,
      body.studentResponse,
      body.conversationHistory,
      body.topicId,
      body.locale
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    // Fallback to non-streaming
    const result = await llm.socraticTutor(
      body.userId,
      body.topicName,
      body.problemQuestion,
      body.studentResponse,
      body.conversationHistory,
      body.topicId,
      body.locale
    );
    return c.json(result);
  }
});

llmRoutes.post("/hint", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicId?: string;
    problemId?: string;
    topicName: string;
    problemQuestion: string;
    problemSolution: string;
    staticHints: string[];
    currentHintLevel: number;
    studentResponse?: string;
    sessionId?: string;
    locale?: string;
  }>();

  // Static hints (levels 1-2) don't need budget check
  const nextLevel = body.currentHintLevel + 1;
  const hasStaticHint = nextLevel <= 2 && body.staticHints.length >= nextLevel;

  if (!hasStaticHint) {
    if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  }

  if (body.sessionId) {
    const hintSource = hasStaticHint ? undefined : "llm" as const;
    await markSessionLLMAssisted(db, body.sessionId, hintSource);
  }

  const llm = await createConfiguredLLM(db, body.userId, c.env.OPENROUTER_API_KEY);
  const result = await llm.generateHint(
    body.userId,
    body.topicName,
    body.problemQuestion,
    body.problemSolution,
    body.staticHints,
    body.currentHintLevel,
    body.studentResponse,
    body.locale,
    { topicId: body.topicId, problemId: body.problemId }
  );
  return c.json(result);
});

llmRoutes.post("/grade", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicId?: string;
    problemId?: string;
    topicName: string;
    question: string;
    correctAnswer: string;
    studentAnswer: string;
    sessionId?: string;
    locale?: string;
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  if (body.sessionId) await markSessionLLMAssisted(db, body.sessionId);
  const llm = await createConfiguredLLM(db, body.userId, c.env.OPENROUTER_API_KEY);
  const result = await llm.gradeResponse(
    body.userId,
    body.topicName,
    body.question,
    body.correctAnswer,
    body.studentAnswer,
    body.locale,
    { topicId: body.topicId, problemId: body.problemId }
  );
  return c.json(result);
});

llmRoutes.get("/usage/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY ?? "");
  const result = await llm.getUsage(c.req.param("userId"));
  return c.json(result);
});
