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

  // Per-problem accuracy breakdown (only for reviews that tracked assessmentContentId)
  const problemQuality = await d1.prepare(`
    SELECT
      r.assessment_content_id AS assessmentContentId,
      r.topic_id AS topicId,
      ac.question,
      ac.difficulty,
      ac.type,
      COUNT(*) AS attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END) AS correct,
      ROUND(AVG(CASE WHEN r.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
      ROUND(COALESCE(AVG(r.hints_used), 0), 2) AS avgHints
    FROM review_log r
    JOIN assessment_content ac ON r.assessment_content_id = ac.id
    WHERE r.assessment_content_id IS NOT NULL
    GROUP BY r.assessment_content_id, r.topic_id, ac.question, ac.difficulty, ac.type
    HAVING attempts >= 3
    ORDER BY accuracy ASC
    LIMIT 100
  `).all<{
    assessmentContentId: string;
    topicId: string;
    question: string;
    difficulty: string;
    type: string;
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

  // Compare accuracy before vs after content updates
  // Uses instructional_content updated_at as the "version change" timestamp
  const versionComparison = await d1.prepare(`
    SELECT
      ic.topic_id AS topicId,
      t.name AS topicName,
      ic.version,
      ic.updated_at AS contentUpdatedAt,
      COUNT(CASE WHEN r.created_at < ic.updated_at THEN 1 END) AS attemptsBefore,
      ROUND(AVG(CASE WHEN r.created_at < ic.updated_at THEN (CASE WHEN r.correct THEN 1.0 ELSE 0.0 END) END), 4) AS accuracyBefore,
      COUNT(CASE WHEN r.created_at >= ic.updated_at THEN 1 END) AS attemptsAfter,
      ROUND(AVG(CASE WHEN r.created_at >= ic.updated_at THEN (CASE WHEN r.correct THEN 1.0 ELSE 0.0 END) END), 4) AS accuracyAfter
    FROM instructional_content ic
    JOIN topics t ON ic.topic_id = t.id
    JOIN review_log r ON r.topic_id = ic.topic_id
    WHERE ic.version > 1
    GROUP BY ic.topic_id, t.name, ic.version, ic.updated_at
    HAVING attemptsBefore >= 3 AND attemptsAfter >= 3
    ORDER BY (accuracyAfter - accuracyBefore) DESC
  `).all<{
    topicId: string;
    topicName: string;
    version: number;
    contentUpdatedAt: string;
    attemptsBefore: number;
    accuracyBefore: number;
    attemptsAfter: number;
    accuracyAfter: number;
  }>();

  return c.json({ versionComparison: versionComparison.results });
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

// --- Content Matrix ---

adminRoutes.get("/content-matrix", async (c) => {
  const d1 = c.env.DB;

  // Get all subjects
  const subjectsResult = await d1.prepare(
    `SELECT id, name, grade_range AS gradeRange FROM subjects ORDER BY name`
  ).all<{ id: string; name: string; gradeRange: string }>();

  // Get all topics with subject info
  const topicsResult = await d1.prepare(
    `SELECT t.id, t.name, t.grade_level AS gradeLevel, t.subject_id AS subjectId, s.name AS subjectName
     FROM topics t JOIN subjects s ON t.subject_id = s.id
     ORDER BY t.grade_level, t.name`
  ).all<{ id: string; name: string; gradeLevel: number; subjectId: string; subjectName: string }>();

  // Instructional content: count per topic × flavor × locale × presentation
  const instructionalResult = await d1.prepare(
    `SELECT topic_id AS topicId, flavor, locale, presentation,
            COUNT(*) AS count, MAX(version) AS maxVersion,
            MAX(CASE WHEN assets_json IS NOT NULL AND assets_json != '' AND assets_json != '[]' THEN 1 ELSE 0 END) AS hasAssets
     FROM instructional_content
     GROUP BY topic_id, flavor, locale, presentation`
  ).all<{ topicId: string; flavor: string; locale: string; presentation: string; count: number; maxVersion: number; hasAssets: number }>();

  // Assessment content: count per topic × flavor × locale, with difficulty + type breakdown
  const assessmentResult = await d1.prepare(
    `SELECT topic_id AS topicId, flavor, locale,
            COUNT(*) AS poolSize,
            SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) AS easy,
            SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) AS medium,
            SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) AS hard
     FROM assessment_content
     GROUP BY topic_id, flavor, locale`
  ).all<{ topicId: string; flavor: string; locale: string; poolSize: number; easy: number; medium: number; hard: number }>();

  // Assessment type distribution per topic
  const assessmentTypesResult = await d1.prepare(
    `SELECT topic_id AS topicId, type, COUNT(*) AS count
     FROM assessment_content
     GROUP BY topic_id, type`
  ).all<{ topicId: string; type: string; count: number }>();

  // Per-topic accuracy from review_log for quality overlay
  const accuracyResult = await d1.prepare(
    `SELECT topic_id AS topicId,
            ROUND(AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END), 4) AS accuracy,
            COUNT(*) AS attempts
     FROM review_log
     GROUP BY topic_id`
  ).all<{ topicId: string; accuracy: number; attempts: number }>();

  // Build per-topic summary
  const topics = topicsResult.results ?? [];
  const instructionalRows = instructionalResult.results ?? [];
  const assessmentRows = assessmentResult.results ?? [];
  const typeRows = assessmentTypesResult.results ?? [];
  const accuracyRows = accuracyResult.results ?? [];

  // Index data by topicId
  const instructionalByTopic = new Map<string, typeof instructionalRows>();
  for (const row of instructionalRows) {
    const arr = instructionalByTopic.get(row.topicId) ?? [];
    arr.push(row);
    instructionalByTopic.set(row.topicId, arr);
  }

  const assessmentByTopic = new Map<string, typeof assessmentRows>();
  for (const row of assessmentRows) {
    const arr = assessmentByTopic.get(row.topicId) ?? [];
    arr.push(row);
    assessmentByTopic.set(row.topicId, arr);
  }

  const typesByTopic = new Map<string, Record<string, number>>();
  for (const row of typeRows) {
    const map = typesByTopic.get(row.topicId) ?? {};
    map[row.type] = row.count;
    typesByTopic.set(row.topicId, map);
  }

  const accuracyByTopic = new Map<string, { accuracy: number; attempts: number }>();
  for (const row of accuracyRows) {
    accuracyByTopic.set(row.topicId, { accuracy: row.accuracy, attempts: row.attempts });
  }

  // Collect all unique flavors, locales, presentations
  const allFlavors = new Set<string>();
  const allLocales = new Set<string>();
  for (const row of instructionalRows) {
    allFlavors.add(row.flavor);
    allLocales.add(row.locale);
  }
  for (const row of assessmentRows) {
    allFlavors.add(row.flavor);
    allLocales.add(row.locale);
  }

  const TARGET_POOL_SIZE = 15;

  const matrix = topics.map((t) => {
    const icRows = instructionalByTopic.get(t.id) ?? [];
    const acRows = assessmentByTopic.get(t.id) ?? [];
    const types = typesByTopic.get(t.id) ?? {};
    const quality = accuracyByTopic.get(t.id);

    const totalInstructional = icRows.reduce((s, r) => s + r.count, 0);
    const totalAssessment = acRows.reduce((s, r) => s + r.poolSize, 0);
    const hasAssets = icRows.some((r) => r.hasAssets === 1);

    // Count distinct flavor×locale combos that exist
    const icCombos = new Set(icRows.map((r) => `${r.flavor}|${r.locale}`));
    const acCombos = new Set(acRows.map((r) => `${r.flavor}|${r.locale}`));

    // Total possible combos
    const totalPossibleCombos = allFlavors.size * allLocales.size;

    // Missing combos
    const icMissing = totalPossibleCombos - icCombos.size;
    const acMissing = totalPossibleCombos - acCombos.size;

    // Pool below target?
    const poolBelowTarget = acRows.some((r) => r.poolSize < TARGET_POOL_SIZE);

    // Difficulty balance: flag if any locale×flavor has 0 of any difficulty
    const missingDifficulties = acRows.filter(
      (r) => r.easy === 0 || r.medium === 0 || r.hard === 0
    ).length > 0;

    return {
      topicId: t.id,
      topicName: t.name,
      gradeLevel: t.gradeLevel,
      subjectId: t.subjectId,
      subjectName: t.subjectName,
      totalInstructional,
      totalAssessment,
      hasAssets,
      instructional: icRows.map((r) => ({
        flavor: r.flavor,
        locale: r.locale,
        presentation: r.presentation,
        count: r.count,
        maxVersion: r.maxVersion,
        hasAssets: r.hasAssets === 1,
      })),
      assessment: acRows.map((r) => ({
        flavor: r.flavor,
        locale: r.locale,
        poolSize: r.poolSize,
        easy: r.easy,
        medium: r.medium,
        hard: r.hard,
      })),
      questionTypes: types,
      quality: quality ?? null,
      gaps: {
        icMissing,
        acMissing,
        poolBelowTarget,
        missingDifficulties,
      },
    };
  });

  // Gap analysis summary
  const totalTopics = topics.length;
  const totalPossibleCombos = allFlavors.size * allLocales.size;
  const totalMatrixCells = totalTopics * totalPossibleCombos * 2; // ×2 for IC + AC
  const filledIcCells = instructionalRows.length;
  const filledAcCells = assessmentRows.length;
  const filledCells = filledIcCells + filledAcCells;
  const fillPercentage = totalMatrixCells > 0 ? filledCells / totalMatrixCells : 0;

  const topicsWithPoolBelowTarget = matrix.filter((m) => m.gaps.poolBelowTarget).length;
  const topicsWithMissingDifficulties = matrix.filter((m) => m.gaps.missingDifficulties).length;
  const topicsWithNoAssets = matrix.filter((m) => !m.hasAssets).length;
  const topicsWithLowQuality = matrix.filter((m) => m.quality && m.quality.accuracy < 0.8).length;

  return c.json({
    subjects: (subjectsResult.results ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      gradeRange: s.gradeRange,
    })),
    matrix,
    dimensions: {
      flavors: [...allFlavors].sort(),
      locales: [...allLocales].sort(),
      targetPoolSize: TARGET_POOL_SIZE,
    },
    gapSummary: {
      totalTopics,
      totalMatrixCells,
      filledCells,
      fillPercentage,
      topicsWithPoolBelowTarget,
      topicsWithMissingDifficulties,
      topicsWithNoAssets,
      topicsWithLowQuality,
    },
  });
});
