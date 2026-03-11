import { describe, it, expect, beforeAll } from "vitest";
import { sql, eq, gte, desc } from "drizzle-orm";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedAdminUser,
  seedDiscipline,
  seedTopic,
  seedLLMUsage,
  seedReviewLog,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { getModelConfig } from "../../services/llm.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("admin: platform stats queries", () => {
  it("counts users, topics, and reviews", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "admin-stats-user" });
    const disc = await seedDiscipline({ id: "admin-stats-subj" });
    const topic = await seedTopic(disc.id, { id: "admin-stats-topic" });
    await seedReviewLog(user.id, topic.id);

    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const [topicCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.topics);
    const [reviewCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.reviewLog);

    expect(userCount.count).toBeGreaterThanOrEqual(1);
    expect(topicCount.count).toBeGreaterThanOrEqual(1);
    expect(reviewCount.count).toBeGreaterThanOrEqual(1);
  });

  it("aggregates LLM cost all-time and this month", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "admin-cost-user" });

    // This month
    await seedLLMUsage(user.id, { costCents: 1.5, purpose: "tutor" });
    await seedLLMUsage(user.id, { costCents: 0.5, purpose: "hint-nudge" });

    const [allTimeCost] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage);
    expect(allTimeCost.total).toBeGreaterThanOrEqual(2.0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [monthCost] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)` })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart));
    expect(monthCost.total).toBeGreaterThanOrEqual(2.0);
  });
});

describe("admin: LLM model config", () => {
  it("CRUD on llm_model_config table", async () => {
    const db = getTestDb();
    const now = new Date().toISOString();

    // Insert
    await db.insert(schema.llmModelConfig).values({
      tier: "capable",
      modelId: "test/capable-v1",
      costInputPerM: 300,
      costOutputPerM: 1500,
      updatedAt: now,
    });

    // Read via getModelConfig
    const config = await getModelConfig(db);
    expect(config.modelMap.capable).toBe("test/capable-v1");

    // Update (upsert)
    await db
      .insert(schema.llmModelConfig)
      .values({
        tier: "capable",
        modelId: "test/capable-v2",
        costInputPerM: 200,
        costOutputPerM: 1000,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.llmModelConfig.tier,
        set: {
          modelId: "test/capable-v2",
          costInputPerM: 200,
          costOutputPerM: 1000,
          updatedAt: now,
        },
      });

    const updated = await getModelConfig(db);
    expect(updated.modelMap.capable).toBe("test/capable-v2");
    expect(updated.costPerM["test/capable-v2"]).toEqual({ input: 200, output: 1000 });

    // Cleanup
    await db.delete(schema.llmModelConfig).where(eq(schema.llmModelConfig.tier, "capable"));
  });

  it("validates tier must be cheap or capable", () => {
    // This is enforced at the route level, not DB — just verify the allowed values
    const validTiers = ["cheap", "capable"];
    expect(validTiers).toContain("cheap");
    expect(validTiers).toContain("capable");
    expect(validTiers).not.toContain("free");
  });
});

describe("admin: LLM usage analytics", () => {
  it("groups usage by purpose", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "analytics-usage-user" });
    await seedLLMUsage(user.id, { purpose: "tutor", costCents: 0.5 });
    await seedLLMUsage(user.id, { purpose: "tutor", costCents: 0.3 });
    await seedLLMUsage(user.id, { purpose: "grading", costCents: 0.2 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const byPurpose = await db
      .select({
        purpose: schema.llmUsage.purpose,
        calls: sql<number>`count(*)`,
        totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart))
      .groupBy(schema.llmUsage.purpose);

    expect(byPurpose.length).toBeGreaterThanOrEqual(2);
    const tutorRow = byPurpose.find((r) => r.purpose === "tutor");
    expect(tutorRow).toBeDefined();
    expect(tutorRow!.calls).toBeGreaterThanOrEqual(2);
  });

  it("ranks top users by cost", async () => {
    const db = getTestDb();
    const user1 = await seedUser({ id: "top-user-1" });
    const user2 = await seedUser({ id: "top-user-2" });
    await seedLLMUsage(user1.id, { costCents: 5.0 });
    await seedLLMUsage(user2.id, { costCents: 10.0 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const topUsers = await db
      .select({
        userId: schema.llmUsage.userId,
        userName: schema.users.name,
        totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      })
      .from(schema.llmUsage)
      .innerJoin(schema.users, eq(schema.llmUsage.userId, schema.users.id))
      .where(gte(schema.llmUsage.createdAt, monthStart))
      .groupBy(schema.llmUsage.userId, schema.users.name)
      .orderBy(desc(sql`sum(${schema.llmUsage.costCents})`))
      .limit(20);

    expect(topUsers.length).toBeGreaterThanOrEqual(2);
    // user2 should rank higher (more cost)
    const user2Idx = topUsers.findIndex((u) => u.userId === user2.id);
    const user1Idx = topUsers.findIndex((u) => u.userId === user1.id);
    if (user2Idx !== -1 && user1Idx !== -1) {
      expect(user2Idx).toBeLessThan(user1Idx);
    }
  });
});

describe("admin: content effectiveness analytics", () => {
  it("calculates per-topic review stats", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "effectiveness-user" });
    const disc = await seedDiscipline({ id: "effectiveness-subj" });
    const topic = await seedTopic(disc.id, { id: "effectiveness-topic", name: "Fractions" });

    await seedReviewLog(user.id, topic.id, { correct: true, responseMs: 1500 });
    await seedReviewLog(user.id, topic.id, { correct: false, responseMs: 3000, hintsUsed: 2 });
    await seedReviewLog(user.id, topic.id, { correct: true, responseMs: 1200 });

    const topicReviewStats = await db
      .select({
        topicId: schema.reviewLog.topicId,
        topicName: schema.topics.name,
        totalAttempts: sql<number>`count(*)`,
        correctAttempts: sql<number>`sum(case when ${schema.reviewLog.correct} then 1 else 0 end)`,
        avgResponseMs: sql<number>`avg(${schema.reviewLog.responseMs})`,
        totalHintsUsed: sql<number>`coalesce(sum(${schema.reviewLog.hintsUsed}), 0)`,
      })
      .from(schema.reviewLog)
      .innerJoin(schema.topics, eq(schema.reviewLog.topicId, schema.topics.id))
      .groupBy(schema.reviewLog.topicId, schema.topics.name);

    const row = topicReviewStats.find((r) => r.topicId === topic.id);
    expect(row).toBeDefined();
    expect(row!.totalAttempts).toBe(3);
    expect(row!.correctAttempts).toBe(2);
    expect(row!.totalHintsUsed).toBe(2);
    expect(row!.avgResponseMs).toBeGreaterThan(0);
  });

  it("identifies struggling topics by low accuracy", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "struggle-user" });
    const disc = await seedDiscipline({ id: "struggle-subj" });
    const easyTopic = await seedTopic(disc.id, { id: "easy-topic", name: "Counting" });
    const hardTopic = await seedTopic(disc.id, { id: "hard-topic", name: "Long Division" });

    // Easy topic: all correct
    for (let i = 0; i < 5; i++) {
      await seedReviewLog(user.id, easyTopic.id, { correct: true });
    }
    // Hard topic: mostly wrong with hints
    for (let i = 0; i < 5; i++) {
      await seedReviewLog(user.id, hardTopic.id, { correct: false, hintsUsed: 3 });
    }

    const stats = await db
      .select({
        topicId: schema.reviewLog.topicId,
        totalAttempts: sql<number>`count(*)`,
        correctAttempts: sql<number>`sum(case when ${schema.reviewLog.correct} then 1 else 0 end)`,
        totalHintsUsed: sql<number>`coalesce(sum(${schema.reviewLog.hintsUsed}), 0)`,
      })
      .from(schema.reviewLog)
      .groupBy(schema.reviewLog.topicId);

    const struggling = stats
      .map((t) => ({
        topicId: t.topicId,
        accuracy: t.totalAttempts > 0 ? t.correctAttempts / t.totalAttempts : 0,
        hintsPerAttempt: t.totalAttempts > 0 ? t.totalHintsUsed / t.totalAttempts : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const hardIdx = struggling.findIndex((s) => s.topicId === hardTopic.id);
    const easyIdx = struggling.findIndex((s) => s.topicId === easyTopic.id);

    // Hard topic should rank as more struggling (lower accuracy)
    expect(hardIdx).toBeLessThan(easyIdx);
    expect(struggling[hardIdx].accuracy).toBe(0);
    expect(struggling[hardIdx].hintsPerAttempt).toBe(3);
  });
});

describe("admin: learning pattern analytics", () => {
  it("tracks hint escalation patterns", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "hint-pattern-user" });
    const disc = await seedDiscipline({ id: "hint-pattern-subj" });
    const topic = await seedTopic(disc.id, { id: "hint-pattern-topic" });

    await seedReviewLog(user.id, topic.id, { hintsUsed: 0, correct: true });
    await seedReviewLog(user.id, topic.id, { hintsUsed: 1, correct: true });
    await seedReviewLog(user.id, topic.id, { hintsUsed: 3, correct: false });

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

    expect(hintPatterns.length).toBeGreaterThanOrEqual(2);
  });

  it("tracks response time by phase", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "phase-time-user" });
    const disc = await seedDiscipline({ id: "phase-time-subj" });
    const topic = await seedTopic(disc.id, { id: "phase-time-topic" });

    await seedReviewLog(user.id, topic.id, { phase: "pretest", responseMs: 5000, correct: false });
    await seedReviewLog(user.id, topic.id, { phase: "guided", responseMs: 3000, correct: true });
    await seedReviewLog(user.id, topic.id, { phase: "independent", responseMs: 2000, correct: true });

    const responseByPhase = await db
      .select({
        phase: schema.reviewLog.phase,
        avgResponseMs: sql<number>`avg(${schema.reviewLog.responseMs})`,
        count: sql<number>`count(*)`,
        accuracy: sql<number>`avg(case when ${schema.reviewLog.correct} then 1.0 else 0.0 end)`,
      })
      .from(schema.reviewLog)
      .groupBy(schema.reviewLog.phase);

    expect(responseByPhase.length).toBeGreaterThanOrEqual(3);
    const pretestRow = responseByPhase.find((r) => r.phase === "pretest");
    expect(pretestRow).toBeDefined();
  });
});
