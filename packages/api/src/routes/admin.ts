import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, sql, gte, desc, and, countDistinct } from "drizzle-orm";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type AdminEnv = Env & {
  Variables: {
    user: AuthUser;
    session: Record<string, unknown>;
  };
};

export const adminRoutes = new Hono<AdminEnv>();

// --- Auth middleware ---

adminRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

async function requireAdmin(c: Context<AdminEnv>, next: Next) {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  await next();
}

adminRoutes.use("/*", requireAdmin);

// --- Platform Stats ---

adminRoutes.get("/stats", async (c) => {
  const db = getDb(c.env.DB);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const d1 = c.env.DB;

  const [
    userCount, familyCount, topicCount, reviewCount,
    instructionalCount, assessmentCount,
    llmCostAll, llmCostMonth,
    contentByLocale, contentByFlavor,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(schema.users),
    db.select({ count: sql<number>`count(*)` }).from(schema.organizations),
    db.select({ count: sql<number>`count(*)` }).from(schema.topics),
    db.select({ count: sql<number>`count(*)` }).from(schema.reviewLog),
    db.select({ count: sql<number>`count(*)` }).from(schema.instructionalContent),
    db.select({ count: sql<number>`count(*)` }).from(schema.assessmentContent),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart)),
    d1.prepare("SELECT locale, SUM(CASE WHEN source = 'instructional' THEN cnt ELSE 0 END) AS instructional, SUM(CASE WHEN source = 'assessment' THEN cnt ELSE 0 END) AS assessment FROM (SELECT locale, count(*) as cnt, 'instructional' as source FROM instructional_content GROUP BY locale UNION ALL SELECT locale, count(*) as cnt, 'assessment' as source FROM assessment_content GROUP BY locale) GROUP BY locale ORDER BY (instructional + assessment) DESC")
      .all<{ locale: string; instructional: number; assessment: number }>(),
    d1.prepare("SELECT flavor, SUM(CASE WHEN source = 'instructional' THEN cnt ELSE 0 END) AS instructional, SUM(CASE WHEN source = 'assessment' THEN cnt ELSE 0 END) AS assessment FROM (SELECT flavor, count(*) as cnt, 'instructional' as source FROM instructional_content GROUP BY flavor UNION ALL SELECT flavor, count(*) as cnt, 'assessment' as source FROM assessment_content GROUP BY flavor) GROUP BY flavor ORDER BY (instructional + assessment) DESC")
      .all<{ flavor: string; instructional: number; assessment: number }>(),
  ]);

  return c.json({
    totalUsers: userCount[0].count,
    totalFamilies: familyCount[0].count,
    totalTopics: topicCount[0].count,
    totalReviews: reviewCount[0].count,
    totalInstructionalContent: instructionalCount[0].count,
    totalAssessmentContent: assessmentCount[0].count,
    llmCostCentsAllTime: llmCostAll[0].total,
    llmCostCentsThisMonth: llmCostMonth[0].total,
    contentByLocale: contentByLocale.results,
    contentByFlavor: contentByFlavor.results,
  });
});

// --- LLM Model Config ---

adminRoutes.get("/llm/config", async (c) => {
  const db = getDb(c.env.DB);
  const configs = await db.select().from(schema.llmModelConfig);
  return c.json({ configs });
});

adminRoutes.put("/llm/config/:tier", async (c) => {
  const tier = c.req.param("tier");
  if (tier !== "cheap" && tier !== "capable") {
    return c.json({ error: "Invalid tier. Must be 'cheap' or 'capable'" }, 400);
  }

  const body = await c.req.json<{
    modelId: string;
    costInputPerM: number;
    costOutputPerM: number;
  }>();

  if (!body.modelId || body.costInputPerM == null || body.costOutputPerM == null) {
    return c.json({ error: "modelId, costInputPerM, and costOutputPerM are required" }, 400);
  }

  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .insert(schema.llmModelConfig)
    .values({
      tier,
      modelId: body.modelId,
      costInputPerM: body.costInputPerM,
      costOutputPerM: body.costOutputPerM,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.llmModelConfig.tier,
      set: {
        modelId: body.modelId,
        costInputPerM: body.costInputPerM,
        costOutputPerM: body.costOutputPerM,
        updatedAt: now,
      },
    });

  return c.json({ success: true });
});

// --- LLM Usage Analytics ---

adminRoutes.get("/llm/usage", async (c) => {
  const db = getDb(c.env.DB);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Usage by purpose this month
  const byPurpose = await db
    .select({
      purpose: schema.llmUsage.purpose,
      calls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)`,
    })
    .from(schema.llmUsage)
    .where(gte(schema.llmUsage.createdAt, monthStart))
    .groupBy(schema.llmUsage.purpose);

  // Usage by model this month
  const byModel = await db
    .select({
      model: schema.llmUsage.model,
      calls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
    })
    .from(schema.llmUsage)
    .where(gte(schema.llmUsage.createdAt, monthStart))
    .groupBy(schema.llmUsage.model);

  return c.json({ byPurpose, byModel, monthStart });
});

adminRoutes.get("/llm/usage/top-users", async (c) => {
  const db = getDb(c.env.DB);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const topUsers = await db
    .select({
      userId: schema.llmUsage.userId,
      userName: schema.users.name,
      calls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
    })
    .from(schema.llmUsage)
    .innerJoin(schema.users, eq(schema.llmUsage.userId, schema.users.id))
    .where(gte(schema.llmUsage.createdAt, monthStart))
    .groupBy(schema.llmUsage.userId, schema.users.name)
    .orderBy(desc(sql`sum(${schema.llmUsage.costCents})`))
    .limit(20);

  return c.json({ topUsers });
});

// --- Content Effectiveness Analytics ---

adminRoutes.get("/analytics/content-effectiveness", async (c) => {
  const db = getDb(c.env.DB);

  // Per-topic metrics: LLM call rate, hint request rate, avg attempts, mastery stats
  const topicLLMUsage = await db
    .select({
      purpose: schema.llmUsage.purpose,
      calls: sql<number>`count(*)`,
    })
    .from(schema.llmUsage)
    .groupBy(schema.llmUsage.purpose);

  // Per-topic review stats: attempts, accuracy, hints used
  const topicReviewStats = await db
    .select({
      topicId: schema.reviewLog.topicId,
      topicName: schema.topics.name,
      totalAttempts: sql<number>`count(*)`,
      correctAttempts: sql<number>`sum(case when ${schema.reviewLog.correct} then 1 else 0 end)`,
      avgResponseMs: sql<number>`avg(${schema.reviewLog.responseMs})`,
      totalHintsUsed: sql<number>`coalesce(sum(${schema.reviewLog.hintsUsed}), 0)`,
      uniqueLearners: sql<number>`count(distinct ${schema.reviewLog.userId})`,
    })
    .from(schema.reviewLog)
    .innerJoin(schema.topics, eq(schema.reviewLog.topicId, schema.topics.id))
    .groupBy(schema.reviewLog.topicId, schema.topics.name)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  // Mastery stats per topic
  const topicMasteryStats = await db
    .select({
      topicId: schema.userTopicState.topicId,
      totalLearners: sql<number>`count(*)`,
      masteredCount: sql<number>`sum(case when ${schema.userTopicState.mastered} then 1 else 0 end)`,
      avgReps: sql<number>`avg(${schema.userTopicState.reps})`,
      avgLapses: sql<number>`avg(${schema.userTopicState.lapses})`,
    })
    .from(schema.userTopicState)
    .groupBy(schema.userTopicState.topicId);

  // Struggling topics: high hint usage + low mastery rate
  const strugglingTopics = topicReviewStats
    .map((t) => {
      const mastery = topicMasteryStats.find((m) => m.topicId === t.topicId);
      const masteryRate = mastery && mastery.totalLearners > 0
        ? mastery.masteredCount / mastery.totalLearners
        : 0;
      const accuracy = t.totalAttempts > 0 ? t.correctAttempts / t.totalAttempts : 0;
      return {
        topicId: t.topicId,
        topicName: t.topicName,
        totalAttempts: t.totalAttempts,
        accuracy,
        hintsPerAttempt: t.totalAttempts > 0 ? t.totalHintsUsed / t.totalAttempts : 0,
        masteryRate,
        avgReps: mastery?.avgReps ?? 0,
        uniqueLearners: t.uniqueLearners,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);

  return c.json({
    topicLLMUsage,
    topicReviewStats,
    topicMasteryStats,
    strugglingTopics,
  });
});

// --- System Stats ---

adminRoutes.get("/system-stats", async (c) => {
  const db = getDb(c.env.DB);
  const d1 = c.env.DB;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString();

  const [
    activeUsers7d, activeUsers30d,
    contentVolume,
    llmSummary,
    contentVelocity,
  ] = await Promise.all([
    db.select({ count: countDistinct(schema.reviewLog.userId) })
      .from(schema.reviewLog)
      .where(gte(schema.reviewLog.createdAt, sevenDaysAgo)),

    db.select({ count: countDistinct(schema.reviewLog.userId) })
      .from(schema.reviewLog)
      .where(gte(schema.reviewLog.createdAt, thirtyDaysAgo)),

    d1.prepare("SELECT type, count(*) as count FROM (SELECT 'instructional' as type FROM instructional_content UNION ALL SELECT type FROM assessment_content) GROUP BY type ORDER BY count DESC")
      .all<{ type: string; count: number }>(),

    db.select({
      totalCalls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)`,
      uniqueModels: countDistinct(schema.llmUsage.model),
    })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart)),

    d1.prepare("SELECT week, SUM(CASE WHEN source = 'instructional' THEN cnt ELSE 0 END) AS instructional, SUM(CASE WHEN source = 'assessment' THEN cnt ELSE 0 END) AS assessment FROM (SELECT strftime('%Y-W%W', created_at) as week, count(*) as cnt, 'instructional' as source FROM instructional_content WHERE created_at >= ? GROUP BY week UNION ALL SELECT strftime('%Y-W%W', created_at) as week, count(*) as cnt, 'assessment' as source FROM assessment_content WHERE created_at >= ? GROUP BY week) GROUP BY week ORDER BY week")
      .bind(eightWeeksAgo, eightWeeksAgo)
      .all<{ week: string; instructional: number; assessment: number }>(),
  ]);

  return c.json({
    activeUsers7d: activeUsers7d[0].count,
    activeUsers30d: activeUsers30d[0].count,
    contentVolume: contentVolume.results,
    llmSummary: llmSummary[0],
    contentVelocity: contentVelocity.results,
  });
});

// --- Learning Pattern Analytics ---

adminRoutes.get("/analytics/learning-patterns", async (c) => {
  const db = getDb(c.env.DB);

  // Hint escalation patterns: how often do users go beyond static hints
  const hintPatterns = await db
    .select({
      hintsUsed: schema.reviewLog.hintsUsed,
      count: sql<number>`count(*)`,
      avgCorrect: sql<number>`avg(case when ${schema.reviewLog.correct} then 1.0 else 0.0 end)`,
    })
    .from(schema.reviewLog)
    .where(sql`${schema.reviewLog.hintsUsed} is not null`)
    .groupBy(schema.reviewLog.hintsUsed)
    .orderBy(schema.reviewLog.hintsUsed);

  // Response time trends by phase
  const responseByPhase = await db
    .select({
      phase: schema.reviewLog.phase,
      avgResponseMs: sql<number>`avg(${schema.reviewLog.responseMs})`,
      count: sql<number>`count(*)`,
      accuracy: sql<number>`avg(case when ${schema.reviewLog.correct} then 1.0 else 0.0 end)`,
    })
    .from(schema.reviewLog)
    .groupBy(schema.reviewLog.phase);

  // Daily activity trend (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dailyActivity = await db
    .select({
      date: sql<string>`date(${schema.reviewLog.createdAt})`,
      reviews: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${schema.reviewLog.userId})`,
    })
    .from(schema.reviewLog)
    .where(gte(schema.reviewLog.createdAt, thirtyDaysAgo))
    .groupBy(sql`date(${schema.reviewLog.createdAt})`)
    .orderBy(sql`date(${schema.reviewLog.createdAt})`);

  return c.json({ hintPatterns, responseByPhase, dailyActivity });
});
