import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import {
  applyMigrations,
  getTestDb,
  seedDiscipline,
  seedTopic,
  seedTopicContentVersion,
  seedUser,
  seedReviewLog,
  request,
} from "../helpers.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("content matrix route auth gating", () => {
  it("returns 401 without session", async () => {
    const res = await request("/api/admin/content-matrix");
    expect(res.status).toBe(401);
  });
});

describe("content matrix queries (service-level)", () => {
  it("aggregates content versions per topic", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-1", name: "Matrix Test Topic", gradeLevel: 1 });

    await seedTopicContentVersion(topic.id, { problemsCount: 15, examplesCount: 2 });

    const result = await db.select({
      topicId: schema.topicContentVersions.topicId,
      problemsCount: schema.topicContentVersions.problemsCount,
      examplesCount: schema.topicContentVersions.examplesCount,
      bundleVersion: schema.topicContentVersions.bundleVersion,
    })
      .from(schema.topicContentVersions)
      .where(sql`${schema.topicContentVersions.topicId} = 'mx-topic-1'`);

    expect(result).toHaveLength(1);
    expect(result[0].problemsCount).toBe(15);
    expect(result[0].examplesCount).toBe(2);
    expect(result[0].bundleVersion).toBe(1);
  });

  it("aggregates content across multiple topics", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj-2" });
    const topic1 = await seedTopic(disc.id, { id: "mx-topic-2a", name: "Topic A" });
    const topic2 = await seedTopic(disc.id, { id: "mx-topic-2b", name: "Topic B" });

    await seedTopicContentVersion(topic1.id, { problemsCount: 15, examplesCount: 2 });
    await seedTopicContentVersion(topic2.id, { problemsCount: 10, examplesCount: 1 });

    const [totals] = await db.select({
      topicCount: sql<number>`count(*)`,
      totalProblems: sql<number>`sum(${schema.topicContentVersions.problemsCount})`,
      totalExamples: sql<number>`sum(${schema.topicContentVersions.examplesCount})`,
    })
      .from(schema.topicContentVersions)
      .where(sql`${schema.topicContentVersions.topicId} IN ('mx-topic-2a', 'mx-topic-2b')`);

    expect(totals.topicCount).toBe(2);
    expect(totals.totalProblems).toBe(25);
    expect(totals.totalExamples).toBe(3);
  });

  it("computes per-topic accuracy from review_log", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj-4" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-4" });
    const user = await seedUser({ id: "mx-user-1" });

    await seedReviewLog(user.id, topic.id, { id: "mx-rev-1", correct: true });
    await seedReviewLog(user.id, topic.id, { id: "mx-rev-2", correct: true });
    await seedReviewLog(user.id, topic.id, { id: "mx-rev-3", correct: false });

    const result = await db.select({
      topicId: schema.reviewLog.topicId,
      accuracy: sql<number>`round(avg(case when ${schema.reviewLog.correct} then 1.0 else 0.0 end), 4)`,
      attempts: sql<number>`count(*)`,
    })
      .from(schema.reviewLog)
      .where(sql`${schema.reviewLog.topicId} = 'mx-topic-4'`)
      .groupBy(schema.reviewLog.topicId);

    expect(result.length).toBe(1);
    expect(result[0].attempts).toBe(3);
    // 2/3 correct ≈ 0.6667
    expect(result[0].accuracy).toBeCloseTo(0.6667, 3);
  });

  it("identifies topics with low content counts", async () => {
    const disc = await seedDiscipline({ id: "mx-subj-5" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-5" });

    // Only 2 problems — below target (15)
    await seedTopicContentVersion(topic.id, { problemsCount: 2, examplesCount: 0 });

    const db = getTestDb();
    const result = await db.select({
      topicId: schema.topicContentVersions.topicId,
      problemsCount: schema.topicContentVersions.problemsCount,
      examplesCount: schema.topicContentVersions.examplesCount,
    })
      .from(schema.topicContentVersions)
      .where(sql`${schema.topicContentVersions.topicId} = 'mx-topic-5'`);

    const TARGET_POOL_SIZE = 15;
    expect(result[0].problemsCount).toBeLessThan(TARGET_POOL_SIZE);
    expect(result[0].examplesCount).toBe(0);
  });
});
