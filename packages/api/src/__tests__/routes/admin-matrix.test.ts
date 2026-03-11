import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import {
  applyMigrations,
  getTestDb,
  seedDiscipline,
  seedTopic,
  seedInstructionalContent,
  seedAssessmentContent,
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
  it("aggregates instructional content by topic × flavor × locale", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-1", name: "Matrix Test Topic", gradeLevel: 1 });

    await seedInstructionalContent(topic.id, { id: "mx-ic-1", flavor: "classic", locale: "en" });
    await seedInstructionalContent(topic.id, { id: "mx-ic-2", flavor: "adventure", locale: "en" });
    await seedInstructionalContent(topic.id, { id: "mx-ic-3", flavor: "classic", locale: "es" });

    const result = await db.select({
      topicId: schema.instructionalContent.topicId,
      flavor: schema.instructionalContent.flavor,
      locale: schema.instructionalContent.locale,
      count: sql<number>`count(*)`,
    })
      .from(schema.instructionalContent)
      .where(sql`${schema.instructionalContent.topicId} = 'mx-topic-1'`)
      .groupBy(
        schema.instructionalContent.topicId,
        schema.instructionalContent.flavor,
        schema.instructionalContent.locale,
      );

    expect(result.length).toBe(3);
    const classicEn = result.find((r) => r.flavor === "classic" && r.locale === "en");
    expect(classicEn).toBeDefined();
    expect(classicEn!.count).toBe(1);
  });

  it("aggregates assessment pool with difficulty breakdown", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj-2" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-2", name: "Pool Test Topic" });

    await seedAssessmentContent(topic.id, { id: "mx-ac-1", difficulty: "easy", flavor: "classic", locale: "en" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-2", difficulty: "easy", flavor: "classic", locale: "en" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-3", difficulty: "medium", flavor: "classic", locale: "en" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-4", difficulty: "hard", flavor: "classic", locale: "en" });

    const result = await db.select({
      topicId: schema.assessmentContent.topicId,
      flavor: schema.assessmentContent.flavor,
      locale: schema.assessmentContent.locale,
      poolSize: sql<number>`count(*)`,
      easy: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'easy' then 1 else 0 end)`,
      medium: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'medium' then 1 else 0 end)`,
      hard: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'hard' then 1 else 0 end)`,
    })
      .from(schema.assessmentContent)
      .where(sql`${schema.assessmentContent.topicId} = 'mx-topic-2'`)
      .groupBy(
        schema.assessmentContent.topicId,
        schema.assessmentContent.flavor,
        schema.assessmentContent.locale,
      );

    expect(result.length).toBe(1);
    expect(result[0].poolSize).toBe(4);
    expect(result[0].easy).toBe(2);
    expect(result[0].medium).toBe(1);
    expect(result[0].hard).toBe(1);
  });

  it("aggregates question type distribution per topic", async () => {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: "mx-subj-3" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-3" });

    await seedAssessmentContent(topic.id, { id: "mx-ac-t1", type: "text-qa" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-t2", type: "text-qa" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-t3", type: "numerical-input" });

    const result = await db.select({
      topicId: schema.assessmentContent.topicId,
      type: schema.assessmentContent.type,
      count: sql<number>`count(*)`,
    })
      .from(schema.assessmentContent)
      .where(sql`${schema.assessmentContent.topicId} = 'mx-topic-3'`)
      .groupBy(schema.assessmentContent.topicId, schema.assessmentContent.type);

    expect(result.length).toBe(2);
    const textQa = result.find((r) => r.type === "text-qa");
    expect(textQa!.count).toBe(2);
    const numInput = result.find((r) => r.type === "numerical-input");
    expect(numInput!.count).toBe(1);
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

  it("identifies pool below target and missing difficulties", async () => {
    const disc = await seedDiscipline({ id: "mx-subj-5" });
    const topic = await seedTopic(disc.id, { id: "mx-topic-5" });

    // Only 2 problems, both easy — below target (15) and missing medium/hard
    await seedAssessmentContent(topic.id, { id: "mx-ac-gap-1", difficulty: "easy" });
    await seedAssessmentContent(topic.id, { id: "mx-ac-gap-2", difficulty: "easy" });

    const db = getTestDb();
    const result = await db.select({
      poolSize: sql<number>`count(*)`,
      easy: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'easy' then 1 else 0 end)`,
      medium: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'medium' then 1 else 0 end)`,
      hard: sql<number>`sum(case when ${schema.assessmentContent.difficulty} = 'hard' then 1 else 0 end)`,
    })
      .from(schema.assessmentContent)
      .where(sql`${schema.assessmentContent.topicId} = 'mx-topic-5'`);

    const TARGET_POOL_SIZE = 15;
    expect(result[0].poolSize).toBeLessThan(TARGET_POOL_SIZE);
    expect(result[0].medium).toBe(0);
    expect(result[0].hard).toBe(0);

    const poolBelowTarget = result[0].poolSize < TARGET_POOL_SIZE;
    const missingDifficulties = result[0].easy === 0 || result[0].medium === 0 || result[0].hard === 0;
    expect(poolBelowTarget).toBe(true);
    expect(missingDifficulties).toBe(true);
  });
});
