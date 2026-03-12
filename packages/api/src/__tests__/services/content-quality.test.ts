import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedReviewLog,
  seedPrerequisite,
  seedTopicContentVersion,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { sql } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("content quality: topic-level accuracy", () => {
  it("computes per-topic accuracy, hint usage, and response time", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "cq-user-1" });
    const disc = await seedDiscipline({ id: "cq-subj-1" });
    const topic = await seedTopic(disc.id, { id: "cq-topic-1", name: "Counting" });

    // 3 correct, 2 incorrect
    await seedReviewLog(user.id, topic.id, { correct: true, hintsUsed: 0, responseMs: 1000 });
    await seedReviewLog(user.id, topic.id, { correct: true, hintsUsed: 1, responseMs: 1500 });
    await seedReviewLog(user.id, topic.id, { correct: true, hintsUsed: 0, responseMs: 2000 });
    await seedReviewLog(user.id, topic.id, { correct: false, hintsUsed: 2, responseMs: 3000 });
    await seedReviewLog(user.id, topic.id, { correct: false, hintsUsed: 3, responseMs: 4000 });

    const result = await db
      .select({
        topicId: schema.reviewLog.topicId,
        totalAttempts: sql<number>`count(*)`,
        accuracy: sql<number>`ROUND(AVG(CASE WHEN ${schema.reviewLog.correct} THEN 1.0 ELSE 0.0 END), 4)`,
        avgHints: sql<number>`ROUND(COALESCE(AVG(${schema.reviewLog.hintsUsed}), 0), 2)`,
        avgResponseMs: sql<number>`ROUND(AVG(${schema.reviewLog.responseMs}), 0)`,
      })
      .from(schema.reviewLog)
      .where(sql`${schema.reviewLog.topicId} = 'cq-topic-1'`)
      .groupBy(schema.reviewLog.topicId);

    expect(result).toHaveLength(1);
    expect(result[0].totalAttempts).toBe(5);
    expect(result[0].accuracy).toBeCloseTo(0.6, 1);
    expect(result[0].avgHints).toBeCloseTo(1.2, 1);
    expect(result[0].avgResponseMs).toBeCloseTo(2300, -2);
  });
});

describe("content quality: per-problem accuracy", () => {
  it("tracks accuracy per assessment_content_id", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "cq-user-2" });
    const disc = await seedDiscipline({ id: "cq-subj-2" });
    const topic = await seedTopic(disc.id, { id: "cq-topic-2", name: "Addition" });

    // Use plain string IDs for assessmentContentId (text column in review_log, no FK)
    const problem1Id = "cq-ac-1";
    const problem2Id = "cq-ac-2";

    // Problem 1: 3/4 correct
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem1Id, correct: true });
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem1Id, correct: true });
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem1Id, correct: true });
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem1Id, correct: false });

    // Problem 2: 1/3 correct
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem2Id, correct: true });
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem2Id, correct: false });
    await seedReviewLog(user.id, topic.id, { assessmentContentId: problem2Id, correct: false });

    const result = await db
      .select({
        assessmentContentId: schema.reviewLog.assessmentContentId,
        attempts: sql<number>`count(*)`,
        accuracy: sql<number>`ROUND(AVG(CASE WHEN ${schema.reviewLog.correct} THEN 1.0 ELSE 0.0 END), 4)`,
      })
      .from(schema.reviewLog)
      .where(sql`${schema.reviewLog.assessmentContentId} IS NOT NULL AND ${schema.reviewLog.topicId} = 'cq-topic-2'`)
      .groupBy(schema.reviewLog.assessmentContentId)
      .orderBy(sql`AVG(CASE WHEN ${schema.reviewLog.correct} THEN 1.0 ELSE 0.0 END) ASC`);

    expect(result).toHaveLength(2);
    // Problem 2 should sort first (lower accuracy)
    expect(result[0].assessmentContentId).toBe("cq-ac-2");
    expect(result[0].accuracy).toBeCloseTo(0.3333, 2);
    expect(result[1].assessmentContentId).toBe("cq-ac-1");
    expect(result[1].accuracy).toBeCloseTo(0.75, 2);
  });
});

describe("content quality: difficulty spikes", () => {
  it("detects accuracy drops between prerequisite pairs", async () => {
    const db = getTestDb();
    const user1 = await seedUser({ id: "cq-spike-user1" });
    const user2 = await seedUser({ id: "cq-spike-user2" });
    const disc = await seedDiscipline({ id: "cq-spike-subj" });

    const easyTopic = await seedTopic(disc.id, { id: "cq-spike-easy", name: "Easy Counting" });
    const hardTopic = await seedTopic(disc.id, { id: "cq-spike-hard", name: "Hard Division" });
    await seedPrerequisite(easyTopic.id, hardTopic.id);

    // Easy topic: 90% accuracy (9/10)
    for (let i = 0; i < 9; i++) {
      await seedReviewLog(user1.id, easyTopic.id, { correct: true });
    }
    await seedReviewLog(user1.id, easyTopic.id, { correct: false });

    // Hard topic: 40% accuracy (4/10)
    for (let i = 0; i < 4; i++) {
      await seedReviewLog(user2.id, hardTopic.id, { correct: true });
    }
    for (let i = 0; i < 6; i++) {
      await seedReviewLog(user2.id, hardTopic.id, { correct: false });
    }

    // Query: find pairs with >15% accuracy drop
    const env = (await import("cloudflare:test")).env;
    const spikes = await env.DB.prepare(`
      SELECT
        p.from_topic_id AS prereqTopicId,
        ROUND(AVG(CASE WHEN r1.correct THEN 1.0 ELSE 0.0 END), 4) AS prereqAccuracy,
        COUNT(DISTINCT r1.id) AS prereqAttempts,
        p.to_topic_id AS dependentTopicId,
        ROUND(AVG(CASE WHEN r2.correct THEN 1.0 ELSE 0.0 END), 4) AS dependentAccuracy,
        COUNT(DISTINCT r2.id) AS dependentAttempts,
        ROUND(AVG(CASE WHEN r1.correct THEN 1.0 ELSE 0.0 END) - AVG(CASE WHEN r2.correct THEN 1.0 ELSE 0.0 END), 4) AS accuracyDrop
      FROM prerequisites p
      JOIN review_log r1 ON r1.topic_id = p.from_topic_id
      JOIN review_log r2 ON r2.topic_id = p.to_topic_id
      WHERE p.from_topic_id = ? AND p.to_topic_id = ?
      GROUP BY p.from_topic_id, p.to_topic_id
      HAVING prereqAttempts >= 5 AND dependentAttempts >= 5
        AND accuracyDrop > 0.15
    `).bind(easyTopic.id, hardTopic.id).all<{
      prereqTopicId: string;
      prereqAccuracy: number;
      dependentTopicId: string;
      dependentAccuracy: number;
      accuracyDrop: number;
    }>();

    expect(spikes.results).toHaveLength(1);
    expect(spikes.results[0].prereqAccuracy).toBeCloseTo(0.9, 1);
    expect(spikes.results[0].dependentAccuracy).toBeCloseTo(0.4, 1);
    expect(spikes.results[0].accuracyDrop).toBeGreaterThan(0.15);
  });
});

describe("content quality: version comparison", () => {
  it("compares accuracy before and after content updates using topic_content_versions", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "cq-ver-user" });
    const disc = await seedDiscipline({ id: "cq-ver-subj" });
    const topic = await seedTopic(disc.id, { id: "cq-ver-topic", name: "Fractions" });

    // Content updated at a known point — tracked via topic_content_versions
    const updateTime = "2026-02-15T00:00:00.000Z";
    await seedTopicContentVersion(topic.id, {
      contentHash: "hash-v2",
      bundleVersion: 2,
      generatedAt: updateTime,
    });

    // Reviews before update: 50% accuracy
    await seedReviewLog(user.id, topic.id, { correct: true, createdAt: "2026-02-01T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: false, createdAt: "2026-02-02T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: true, createdAt: "2026-02-10T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: false, createdAt: "2026-02-12T00:00:00.000Z" });

    // Reviews after update: 75% accuracy
    await seedReviewLog(user.id, topic.id, { correct: true, createdAt: "2026-02-20T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: true, createdAt: "2026-02-22T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: true, createdAt: "2026-02-25T00:00:00.000Z" });
    await seedReviewLog(user.id, topic.id, { correct: false, createdAt: "2026-02-28T00:00:00.000Z" });

    const env = (await import("cloudflare:test")).env;
    const result = await env.DB.prepare(`
      SELECT
        tcv.topic_id AS topicId,
        tcv.bundle_version AS version,
        COUNT(CASE WHEN r.created_at < tcv.generated_at THEN 1 END) AS attemptsBefore,
        ROUND(AVG(CASE WHEN r.created_at < tcv.generated_at THEN (CASE WHEN r.correct THEN 1.0 ELSE 0.0 END) END), 4) AS accuracyBefore,
        COUNT(CASE WHEN r.created_at >= tcv.generated_at THEN 1 END) AS attemptsAfter,
        ROUND(AVG(CASE WHEN r.created_at >= tcv.generated_at THEN (CASE WHEN r.correct THEN 1.0 ELSE 0.0 END) END), 4) AS accuracyAfter
      FROM topic_content_versions tcv
      JOIN review_log r ON r.topic_id = tcv.topic_id
      WHERE tcv.topic_id = ?
      GROUP BY tcv.topic_id, tcv.bundle_version
    `).bind("cq-ver-topic").all<{
      topicId: string;
      version: number;
      attemptsBefore: number;
      accuracyBefore: number;
      attemptsAfter: number;
      accuracyAfter: number;
    }>();

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.attemptsBefore).toBe(4);
    expect(r.accuracyBefore).toBeCloseTo(0.5, 1);
    expect(r.attemptsAfter).toBe(4);
    expect(r.accuracyAfter).toBeCloseTo(0.75, 1);
  });
});
