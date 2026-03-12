import { describe, it, expect, beforeAll } from "vitest";
import { sql, countDistinct } from "drizzle-orm";
import {
  applyMigrations,
  request,
  json,
  seedUser,
  seedAdminUser,
  seedDiscipline,
  seedTopic,
  seedLLMUsage,
  seedReviewLog,
  seedOrg,
  seedTopicContentVersion,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { gte } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("admin route auth gating", () => {
  it("returns 401 without session", async () => {
    const res = await request("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("returns 401 for system-stats without session", async () => {
    const res = await request("/api/admin/system-stats");
    expect(res.status).toBe(401);
  });
});

describe("admin stats queries (service-level)", () => {
  it("returns content version counts from topic_content_versions", async () => {
    const db = getTestDb();

    // Seed data
    const disc = await seedDiscipline({ id: "admin-q-subj" });
    const topic1 = await seedTopic(disc.id, { id: "admin-q-topic-1" });
    const topic2 = await seedTopic(disc.id, { id: "admin-q-topic-2" });
    await seedOrg({ id: "admin-q-org" });
    await seedTopicContentVersion(topic1.id, { problemsCount: 15, examplesCount: 2 });
    await seedTopicContentVersion(topic2.id, { problemsCount: 10, examplesCount: 1 });

    // Verify counts from topic_content_versions
    const [tcvCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.topicContentVersions);
    expect(tcvCount.count).toBeGreaterThanOrEqual(2);

    // Verify aggregate problems/examples counts
    const [totals] = await db.select({
      totalProblems: sql<number>`coalesce(sum(${schema.topicContentVersions.problemsCount}), 0)`,
      totalExamples: sql<number>`coalesce(sum(${schema.topicContentVersions.examplesCount}), 0)`,
    }).from(schema.topicContentVersions);

    expect(totals.totalProblems).toBeGreaterThanOrEqual(25);
    expect(totals.totalExamples).toBeGreaterThanOrEqual(3);
  });
});

describe("system stats queries (service-level)", () => {
  it("counts active users from review data", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "admin-sys-subj" });
    const topic = await seedTopic(disc.id, { id: "admin-sys-topic" });
    const learner = await seedUser({ id: "admin-sys-learner" });
    await seedReviewLog(learner.id, topic.id, { id: "admin-sys-rev-1" });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [active7d] = await db.select({ count: countDistinct(schema.reviewLog.userId) })
      .from(schema.reviewLog)
      .where(gte(schema.reviewLog.createdAt, sevenDaysAgo));

    expect(active7d.count).toBeGreaterThanOrEqual(1);
  });

  it("counts LLM usage summary", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "admin-sys-llm-user" });
    await seedLLMUsage(user.id, { id: "admin-sys-llm-1", costCents: 0.5, inputTokens: 200, outputTokens: 100 });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [summary] = await db.select({
      totalCalls: sql<number>`count(*)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.llmUsage.costCents}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)`,
      uniqueModels: countDistinct(schema.llmUsage.model),
    })
      .from(schema.llmUsage)
      .where(gte(schema.llmUsage.createdAt, monthStart));

    expect(summary.totalCalls).toBeGreaterThanOrEqual(1);
    expect(summary.totalCostCents).toBeGreaterThan(0);
    expect(summary.totalInputTokens).toBeGreaterThan(0);
  });
});
