import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createLLMService, getModelConfig } from "../services/llm.js";
import type { ModelConfig } from "../services/llm.js";
import * as schema from "../db/schema.js";
import { eq, and, gte, inArray } from "drizzle-orm";

export const llmRoutes = new Hono<Env>();

const LLM_UNAVAILABLE = { available: false, error: "AI tutoring is not configured" };

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

/** Create LLM service with model config loaded from DB */
async function createConfiguredLLM(db: ReturnType<typeof getDb>, apiKey: string) {
  const config = await getModelConfig(db);
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
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  const llm = await createConfiguredLLM(db, c.env.OPENROUTER_API_KEY);
  const result = await llm.evaluateExplanation(
    body.userId,
    body.topicName,
    body.stepDescription,
    body.studentExplanation,
    body.topicId
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
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  const llm = await createConfiguredLLM(db, c.env.OPENROUTER_API_KEY);
  const result = await llm.socraticTutor(
    body.userId,
    body.topicName,
    body.problemQuestion,
    body.studentResponse,
    body.conversationHistory,
    body.topicId
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
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  const llm = await createConfiguredLLM(db, c.env.OPENROUTER_API_KEY);

  try {
    const { stream } = await llm.socraticTutorStream(
      body.userId,
      body.topicName,
      body.problemQuestion,
      body.studentResponse,
      body.conversationHistory,
      body.topicId
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
      body.topicId
    );
    return c.json(result);
  }
});

llmRoutes.post("/hint", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicName: string;
    problemQuestion: string;
    problemSolution: string;
    staticHints: string[];
    currentHintLevel: number;
    studentResponse?: string;
  }>();

  // Static hints (levels 1-2) don't need budget check
  const nextLevel = body.currentHintLevel + 1;
  const hasStaticHint = nextLevel <= 2 && body.staticHints.length >= nextLevel;

  if (!hasStaticHint) {
    if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  }

  const llm = await createConfiguredLLM(db, c.env.OPENROUTER_API_KEY);
  const result = await llm.generateHint(
    body.userId,
    body.topicName,
    body.problemQuestion,
    body.problemSolution,
    body.staticHints,
    body.currentHintLevel,
    body.studentResponse
  );
  return c.json(result);
});

llmRoutes.post("/grade", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId: string;
    topicName: string;
    question: string;
    correctAnswer: string;
    studentAnswer: string;
  }>();
  if (!(await checkBudget(db, body.userId))) return c.json(BUDGET_ERROR, 429);
  const llm = await createConfiguredLLM(db, c.env.OPENROUTER_API_KEY);
  const result = await llm.gradeResponse(
    body.userId,
    body.topicName,
    body.question,
    body.correctAnswer,
    body.studentAnswer
  );
  return c.json(result);
});

llmRoutes.get("/usage/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY ?? "");
  const result = await llm.getUsage(c.req.param("userId"));
  return c.json(result);
});
