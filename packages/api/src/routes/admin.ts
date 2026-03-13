import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, sql, gte, desc, and, countDistinct, inArray, lt } from "drizzle-orm";
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
    contentCounts,
    llmCostAll, llmCostMonth,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(schema.users),
    db.select({ count: sql<number>`count(*)` }).from(schema.organizations),
    db.select({ count: sql<number>`count(*)` }).from(schema.topics),
    db.select({ count: sql<number>`count(*)` }).from(schema.reviewLog),
    db.select({
      totalProblems: sql<number>`coalesce(sum(${schema.topicContentVersions.problemsCount}), 0)`,
      totalExamples: sql<number>`coalesce(sum(${schema.topicContentVersions.examplesCount}), 0)`,
    }).from(schema.topicContentVersions),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage),
    db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart)),
  ]);

  return c.json({
    totalUsers: userCount[0].count,
    totalFamilies: familyCount[0].count,
    totalTopics: topicCount[0].count,
    totalReviews: reviewCount[0].count,
    totalInstructionalContent: contentCounts[0].totalExamples,
    totalAssessmentContent: contentCounts[0].totalProblems,
    llmCostCentsAllTime: llmCostAll[0].total,
    llmCostCentsThisMonth: llmCostMonth[0].total,
    contentByLocale: [], // Dimension breakdowns in R2 manifests; rich analytics via Analytics Engine
    contentByFlavor: [],
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

// --- Content Quality Analytics ---

adminRoutes.get("/analytics/content-quality", async (c) => {
  const d1 = c.env.DB;

  // Per-topic quality metrics: first-attempt accuracy, hint usage, response time
  // "First attempt" = phase in ('pretest', 'independent', 'review'), i.e. not guided/instruction
  const topicQuality = await d1.prepare(`
    SELECT
      r.topic_id AS topicId,
      t.name AS topicName,
      t.grade_level AS gradeLevel,
      COUNT(*) AS totalAttempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correctAttempts,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(COALESCE(AVG(r.hints_used), 0), 2) AS avgHintsUsed,
      ROUND(AVG(r.response_ms), 0) AS avgResponseMs,
      COUNT(DISTINCT r.user_id) AS uniqueLearners
    FROM review_log r
    JOIN topics t ON r.topic_id = t.id
    GROUP BY r.topic_id, t.name, t.grade_level
    ORDER BY accuracy ASC
  `).all<{
    topicId: string;
    topicName: string;
    gradeLevel: number;
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
    avgHintsUsed: number;
    avgResponseMs: number;
    uniqueLearners: number;
  }>();

  // Per-problem accuracy breakdown from review_log (problem text now in R2, not D1)
  const problemQuality = await d1.prepare(`
    SELECT
      r.assessment_content_id AS assessmentContentId,
      r.topic_id AS topicId,
      COUNT(*) AS attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(COALESCE(AVG(r.hints_used), 0), 2) AS avgHints
    FROM review_log r
    WHERE r.assessment_content_id IS NOT NULL
    GROUP BY r.assessment_content_id, r.topic_id
    HAVING attempts >= 3
    ORDER BY accuracy ASC
    LIMIT 100
  `).all<{
    assessmentContentId: string;
    topicId: string;
    attempts: number;
    correct: number;
    accuracy: number;
    avgHints: number;
  }>();

  return c.json({
    topicQuality: topicQuality.results,
    problemQuality: problemQuality.results,
  });
});

// --- Difficulty Spike Detection ---

adminRoutes.get("/analytics/difficulty-spikes", async (c) => {
  const d1 = c.env.DB;

  // Find prerequisite pairs where accuracy drops >15%
  const spikes = await d1.prepare(`
    SELECT
      p.from_topic_id AS prereqTopicId,
      t1.name AS prereqTopicName,
      ROUND(AVG(CASE WHEN r1.correct THEN 1.0 ELSE 0.0 END), 4) AS prereqAccuracy,
      COUNT(DISTINCT r1.id) AS prereqAttempts,
      p.to_topic_id AS dependentTopicId,
      t2.name AS dependentTopicName,
      ROUND(AVG(CASE WHEN r2.correct THEN 1.0 ELSE 0.0 END), 4) AS dependentAccuracy,
      COUNT(DISTINCT r2.id) AS dependentAttempts,
      ROUND(AVG(CASE WHEN r1.correct THEN 1.0 ELSE 0.0 END) - AVG(CASE WHEN r2.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracyDrop
    FROM prerequisites p
    JOIN topics t1 ON p.from_topic_id = t1.id
    JOIN topics t2 ON p.to_topic_id = t2.id
    JOIN review_log r1 ON r1.topic_id = p.from_topic_id
    JOIN review_log r2 ON r2.topic_id = p.to_topic_id
    GROUP BY p.from_topic_id, p.to_topic_id, t1.name, t2.name
    HAVING prereqAttempts >= 5 AND dependentAttempts >= 5
      AND accuracyDrop > 0.15
    ORDER BY accuracyDrop DESC
  `).all<{
    prereqTopicId: string;
    prereqTopicName: string;
    prereqAccuracy: number;
    prereqAttempts: number;
    dependentTopicId: string;
    dependentTopicName: string;
    dependentAccuracy: number;
    dependentAttempts: number;
    accuracyDrop: number;
  }>();

  return c.json({ spikes: spikes.results });
});

// --- Content Version Effectiveness ---

adminRoutes.get("/analytics/content-versions", async (c) => {
  const d1 = c.env.DB;

  // Compare accuracy across content versions using review_log.content_version
  // Rich per-problem analytics available via Analytics Engine (see /analytics/problem-level)
  const versionComparison = await d1.prepare(`
    SELECT
      r.topic_id AS topicId,
      t.name AS topicName,
      r.content_version AS contentVersion,
      COUNT(*) AS attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(AVG(r.response_ms), 0) AS avgResponseMs
    FROM review_log r
    JOIN topics t ON r.topic_id = t.id
    WHERE r.content_version IS NOT NULL
    GROUP BY r.topic_id, t.name, r.content_version
    HAVING attempts >= 3
    ORDER BY r.topic_id, accuracy DESC
  `).all<{
    topicId: string;
    topicName: string;
    contentVersion: string;
    attempts: number;
    correct: number;
    accuracy: number;
    avgResponseMs: number;
  }>();

  return c.json({ versionComparison: versionComparison.results });
});

// --- Problem-Level Analytics (enriched by Analytics Engine) ---

adminRoutes.get("/analytics/problem-level", async (c) => {
  const d1 = c.env.DB;
  const topicId = c.req.query("topicId");

  // Per-problem accuracy, response time, hint usage
  // D1 review_log provides the core data; Analytics Engine adds rich dimensions (phase, demand, presentation)
  const topicFilter = topicId ? "AND r.topic_id = ?" : "";
  const bindings = topicId ? [topicId] : [];

  const problemStats = await d1.prepare(`
    SELECT
      r.assessment_content_id AS problemId,
      r.topic_id AS topicId,
      COUNT(*) AS attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(AVG(r.response_ms), 0) AS avgResponseMs,
      ROUND(COALESCE(AVG(r.hints_used), 0), 2) AS avgHints,
      SUM(CASE WHEN r.misconception THEN 1 ELSE 0 END) AS misconceptions,
      COUNT(DISTINCT r.user_id) AS uniqueLearners,
      r.content_version AS contentVersion
    FROM review_log r
    WHERE r.assessment_content_id IS NOT NULL
    ${topicFilter}
    GROUP BY r.assessment_content_id, r.topic_id, r.content_version
    HAVING attempts >= 2
    ORDER BY accuracy ASC
    LIMIT 200
  `).bind(...bindings).all<{
    problemId: string;
    topicId: string;
    attempts: number;
    correct: number;
    accuracy: number;
    avgResponseMs: number;
    avgHints: number;
    misconceptions: number;
    uniqueLearners: number;
    contentVersion: string | null;
  }>();

  return c.json({ problemStats: problemStats.results });
});

// --- Bundle Comparison (A/B by content version) ---

adminRoutes.get("/analytics/bundle-comparison", async (c) => {
  const d1 = c.env.DB;
  const topicId = c.req.query("topicId");
  if (!topicId) return c.json({ error: "topicId required" }, 400);

  const comparison = await d1.prepare(`
    SELECT
      r.content_version AS contentVersion,
      COUNT(*) AS attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(AVG(r.response_ms), 0) AS avgResponseMs,
      ROUND(COALESCE(AVG(r.hints_used), 0), 2) AS avgHints,
      COUNT(DISTINCT r.user_id) AS uniqueLearners
    FROM review_log r
    WHERE r.topic_id = ? AND r.content_version IS NOT NULL
    GROUP BY r.content_version
    HAVING attempts >= 3
    ORDER BY accuracy DESC
  `).bind(topicId).all<{
    contentVersion: string;
    attempts: number;
    correct: number;
    accuracy: number;
    avgResponseMs: number;
    avgHints: number;
    uniqueLearners: number;
  }>();

  return c.json({ topicId, comparison: comparison.results });
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

    d1.prepare("SELECT 'problems' as type, coalesce(sum(problems_count), 0) as count FROM topic_content_versions UNION ALL SELECT 'examples' as type, coalesce(sum(examples_count), 0) as count FROM topic_content_versions")
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

    d1.prepare("SELECT strftime('%Y-W%W', generated_at) as week, sum(problems_count) AS assessment, sum(examples_count) AS instructional FROM topic_content_versions WHERE generated_at >= ? GROUP BY week ORDER BY week")
      .bind(eightWeeksAgo)
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

// --- Content Matrix ---

adminRoutes.get("/content-matrix", async (c) => {
  const d1 = c.env.DB;

  // Get all disciplines
  const disciplinesResult = await d1.prepare(
    `SELECT id, name, progression_model AS progressionModel FROM disciplines ORDER BY name`
  ).all<{ id: string; name: string; progressionModel: string }>();

  // Get all topics with discipline info
  const topicsResult = await d1.prepare(
    `SELECT t.id, t.name, t.grade_level AS gradeLevel, t.discipline_id AS disciplineId, d.name AS disciplineName
     FROM topics t JOIN disciplines d ON t.discipline_id = d.id
     ORDER BY t.grade_level, t.name`
  ).all<{ id: string; name: string; gradeLevel: number; disciplineId: string; disciplineName: string }>();

  // Content counts from topic_content_versions (content now in R2)
  const contentVersionsResult = await d1.prepare(
    `SELECT topic_id AS topicId, problems_count AS problemsCount, examples_count AS examplesCount,
            content_hash AS contentHash, bundle_version AS bundleVersion
     FROM topic_content_versions`
  ).all<{ topicId: string; problemsCount: number; examplesCount: number; contentHash: string; bundleVersion: number }>();

  // Per-topic accuracy from review_log for quality overlay
  const accuracyResult = await d1.prepare(
    `SELECT topic_id AS topicId,
            ROUND(AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
            COUNT(*) AS attempts
     FROM review_log
     GROUP BY topic_id`
  ).all<{ topicId: string; accuracy: number; attempts: number }>();

  const topics = topicsResult.results ?? [];
  const contentVersionRows = contentVersionsResult.results ?? [];
  const accuracyRows = accuracyResult.results ?? [];

  const contentByTopic = new Map<string, typeof contentVersionRows[0]>();
  for (const row of contentVersionRows) {
    contentByTopic.set(row.topicId, row);
  }

  const accuracyByTopic = new Map<string, { accuracy: number; attempts: number }>();
  for (const row of accuracyRows) {
    accuracyByTopic.set(row.topicId, { accuracy: row.accuracy, attempts: row.attempts });
  }

  const TARGET_POOL_SIZE = 15;

  const matrix = topics.map((t) => {
    const cv = contentByTopic.get(t.id);
    const quality = accuracyByTopic.get(t.id);
    const totalAssessment = cv?.problemsCount ?? 0;
    const totalInstructional = cv?.examplesCount ?? 0;

    return {
      topicId: t.id,
      topicName: t.name,
      gradeLevel: t.gradeLevel,
      disciplineId: t.disciplineId,
      disciplineName: t.disciplineName,
      totalInstructional,
      totalAssessment,
      hasAssets: false, // Asset tracking via R2 manifests (future)
      instructional: [],  // Dimension breakdowns now in R2 manifests
      assessment: [],
      questionTypes: {},
      quality: quality ?? null,
      gaps: {
        icMissing: totalInstructional === 0 ? 1 : 0,
        acMissing: totalAssessment === 0 ? 1 : 0,
        poolBelowTarget: totalAssessment < TARGET_POOL_SIZE,
        missingDifficulties: false, // Difficulty breakdown in R2 manifests
      },
    };
  });

  const totalTopics = topics.length;
  const topicsWithPoolBelowTarget = matrix.filter((m) => m.gaps.poolBelowTarget).length;
  const topicsWithNoContent = matrix.filter((m) => m.totalAssessment === 0 && m.totalInstructional === 0).length;
  const topicsWithLowQuality = matrix.filter((m) => m.quality && m.quality.accuracy < 0.8).length;

  return c.json({
    disciplines: (disciplinesResult.results ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      progressionModel: d.progressionModel,
    })),
    matrix,
    dimensions: {
      flavors: ["classic"],
      locales: ["en"],
      targetPoolSize: TARGET_POOL_SIZE,
    },
    gapSummary: {
      totalTopics,
      totalMatrixCells: totalTopics * 2,
      filledCells: matrix.filter((m) => m.totalAssessment > 0).length + matrix.filter((m) => m.totalInstructional > 0).length,
      fillPercentage: totalTopics > 0 ? (matrix.filter((m) => m.totalAssessment > 0).length + matrix.filter((m) => m.totalInstructional > 0).length) / (totalTopics * 2) : 0,
      topicsWithPoolBelowTarget,
      topicsWithMissingDifficulties: 0, // Now tracked in R2 manifests
      topicsWithNoAssets: topicsWithNoContent,
      topicsWithLowQuality,
    },
  });
});

// --- LLM Effectiveness Analytics ---

const MIN_SAMPLE_SIZE = 10;

/** Per-topic accuracy split: LLM-assisted vs baseline */
adminRoutes.get("/analytics/llm-effectiveness", async (c) => {
  const db = getDb(c.env.DB);

  // Get all review_log rows with the llm_assisted flag
  const rows = await db
    .select({
      topicId: schema.reviewLog.topicId,
      llmAssisted: schema.reviewLog.llmAssisted,
      correct: schema.reviewLog.correct,
    })
    .from(schema.reviewLog);

  // Group by topic and llm_assisted
  const topicStats = new Map<string, { llm: { correct: number; total: number }; baseline: { correct: number; total: number } }>();

  for (const row of rows) {
    if (!topicStats.has(row.topicId)) {
      topicStats.set(row.topicId, {
        llm: { correct: 0, total: 0 },
        baseline: { correct: 0, total: 0 },
      });
    }
    const stats = topicStats.get(row.topicId)!;
    const bucket = row.llmAssisted ? stats.llm : stats.baseline;
    bucket.total++;
    if (row.correct) bucket.correct++;
  }

  // Compute per-topic deltas (only when both groups have min sample size)
  const topics: {
    topicId: string;
    llmAccuracy: number;
    baselineAccuracy: number;
    delta: number;
    llmAttempts: number;
    baselineAttempts: number;
  }[] = [];

  let overallLlmCorrect = 0;
  let overallLlmTotal = 0;
  let overallBaseCorrect = 0;
  let overallBaseTotal = 0;

  for (const [topicId, stats] of topicStats) {
    overallLlmCorrect += stats.llm.correct;
    overallLlmTotal += stats.llm.total;
    overallBaseCorrect += stats.baseline.correct;
    overallBaseTotal += stats.baseline.total;

    if (stats.llm.total >= MIN_SAMPLE_SIZE && stats.baseline.total >= MIN_SAMPLE_SIZE) {
      const llmAcc = stats.llm.correct / stats.llm.total;
      const baseAcc = stats.baseline.correct / stats.baseline.total;
      topics.push({
        topicId,
        llmAccuracy: Math.round(llmAcc * 1000) / 1000,
        baselineAccuracy: Math.round(baseAcc * 1000) / 1000,
        delta: Math.round((llmAcc - baseAcc) * 1000) / 1000,
        llmAttempts: stats.llm.total,
        baselineAttempts: stats.baseline.total,
      });
    }
  }

  // Sort by delta descending (topics where LLM helps most)
  topics.sort((a, b) => b.delta - a.delta);

  return c.json({
    overall: {
      llmAccuracy: overallLlmTotal > 0 ? Math.round((overallLlmCorrect / overallLlmTotal) * 1000) / 1000 : null,
      baselineAccuracy: overallBaseTotal > 0 ? Math.round((overallBaseCorrect / overallBaseTotal) * 1000) / 1000 : null,
      llmAttempts: overallLlmTotal,
      baselineAttempts: overallBaseTotal,
    },
    topics,
    minSampleSize: MIN_SAMPLE_SIZE,
  });
});

/** Hint outcome analysis: did the student get the NEXT attempt correct after a hint? */
adminRoutes.get("/analytics/llm-hint-outcomes", async (c) => {
  const db = getDb(c.env.DB);

  // Get all review_log rows ordered by user, topic, and time
  const rows = await db
    .select({
      userId: schema.reviewLog.userId,
      topicId: schema.reviewLog.topicId,
      correct: schema.reviewLog.correct,
      hintSource: schema.reviewLog.hintSource,
      hintsUsed: schema.reviewLog.hintsUsed,
      createdAt: schema.reviewLog.createdAt,
    })
    .from(schema.reviewLog)
    .orderBy(schema.reviewLog.userId, schema.reviewLog.topicId, schema.reviewLog.createdAt);

  // For each hint event, check if next attempt on same topic by same user was correct
  const outcomes = new Map<string, { nextCorrect: number; total: number }>();

  for (let i = 0; i < rows.length - 1; i++) {
    const current = rows[i];
    const hintSrc = current.hintSource;
    if (!hintSrc) continue; // no hint used

    // Find next attempt on same topic by same user
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.userId === current.userId && next.topicId === current.topicId) {
        if (!outcomes.has(hintSrc)) outcomes.set(hintSrc, { nextCorrect: 0, total: 0 });
        const stats = outcomes.get(hintSrc)!;
        stats.total++;
        if (next.correct) stats.nextCorrect++;
        break;
      }
    }
  }

  // Also compute per-purpose effectiveness from llm_usage
  const purposeRows = await db
    .select({
      purpose: schema.llmUsage.purpose,
      topicId: schema.llmUsage.topicId,
      userId: schema.llmUsage.userId,
    })
    .from(schema.llmUsage)
    .where(sql`${schema.llmUsage.topicId} IS NOT NULL`);

  const purposeCounts = new Map<string, number>();
  for (const row of purposeRows) {
    purposeCounts.set(row.purpose, (purposeCounts.get(row.purpose) ?? 0) + 1);
  }

  const hintOutcomes = [...outcomes.entries()].map(([hintSource, stats]) => ({
    hintSource,
    nextAttemptAccuracy: stats.total > 0 ? Math.round((stats.nextCorrect / stats.total) * 1000) / 1000 : null,
    sampleSize: stats.total,
  }));

  return c.json({
    hintOutcomes,
    purposeBreakdown: [...purposeCounts.entries()].map(([purpose, count]) => ({ purpose, count })),
  });
});

/** Compare time-to-mastery and lapse rates for LLM-assisted vs unassisted */
adminRoutes.get("/analytics/llm-mastery-impact", async (c) => {
  const db = getDb(c.env.DB);

  // Get all mastered topics with their stats
  const masteredTopics = await db
    .select({
      userId: schema.userTopicState.userId,
      topicId: schema.userTopicState.topicId,
      reps: schema.userTopicState.reps,
      lapses: schema.userTopicState.lapses,
      mastered: schema.userTopicState.mastered,
    })
    .from(schema.userTopicState)
    .where(eq(schema.userTopicState.mastered, true));

  // Get LLM usage by user+topic to determine which mastery was LLM-assisted
  const llmUsageByUserTopic = new Set<string>();
  const llmRows = await db
    .select({
      userId: schema.llmUsage.userId,
      topicId: schema.llmUsage.topicId,
    })
    .from(schema.llmUsage)
    .where(sql`${schema.llmUsage.topicId} IS NOT NULL`);

  for (const row of llmRows) {
    llmUsageByUserTopic.add(`${row.userId}:${row.topicId}`);
  }

  let llmRepsSum = 0, llmRepsCount = 0, llmLapsesSum = 0;
  let baseRepsSum = 0, baseRepsCount = 0, baseLapsesSum = 0;

  for (const topic of masteredTopics) {
    const key = `${topic.userId}:${topic.topicId}`;
    if (llmUsageByUserTopic.has(key)) {
      llmRepsSum += topic.reps;
      llmLapsesSum += topic.lapses;
      llmRepsCount++;
    } else {
      baseRepsSum += topic.reps;
      baseLapsesSum += topic.lapses;
      baseRepsCount++;
    }
  }

  return c.json({
    llmAssisted: {
      avgRepsToMastery: llmRepsCount > 0 ? Math.round((llmRepsSum / llmRepsCount) * 100) / 100 : null,
      avgLapses: llmRepsCount > 0 ? Math.round((llmLapsesSum / llmRepsCount) * 100) / 100 : null,
      topicCount: llmRepsCount,
    },
    baseline: {
      avgRepsToMastery: baseRepsCount > 0 ? Math.round((baseRepsSum / baseRepsCount) * 100) / 100 : null,
      avgLapses: baseRepsCount > 0 ? Math.round((baseLapsesSum / baseRepsCount) * 100) / 100 : null,
      topicCount: baseRepsCount,
    },
  });
});

/** Budget exhaustion impact: accuracy before vs after budget exhaustion */
adminRoutes.get("/analytics/llm-budget-impact", async (c) => {
  const db = getDb(c.env.DB);

  // Find budget_exceeded events
  const exhaustionEvents = await db
    .select({
      userId: schema.llmUsage.userId,
      topicId: schema.llmUsage.topicId,
      createdAt: schema.llmUsage.createdAt,
    })
    .from(schema.llmUsage)
    .where(eq(schema.llmUsage.purpose, "budget_exceeded"));

  if (exhaustionEvents.length === 0) {
    return c.json({ message: "No budget exhaustion events recorded yet", data: null });
  }

  // For each exhaustion event, compare pre/post accuracy for that user
  let preCorrect = 0, preTotal = 0;
  let postCorrect = 0, postTotal = 0;

  for (const event of exhaustionEvents) {
    const reviews = await db
      .select({
        correct: schema.reviewLog.correct,
        createdAt: schema.reviewLog.createdAt,
      })
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.userId, event.userId))
      .orderBy(schema.reviewLog.createdAt);

    for (const review of reviews) {
      if (review.createdAt < event.createdAt) {
        preTotal++;
        if (review.correct) preCorrect++;
      } else {
        postTotal++;
        if (review.correct) postCorrect++;
      }
    }
  }

  return c.json({
    data: {
      preExhaustion: {
        accuracy: preTotal > 0 ? Math.round((preCorrect / preTotal) * 1000) / 1000 : null,
        attempts: preTotal,
      },
      postExhaustion: {
        accuracy: postTotal > 0 ? Math.round((postCorrect / postTotal) * 1000) / 1000 : null,
        attempts: postTotal,
      },
      exhaustionEvents: exhaustionEvents.length,
    },
  });
});
