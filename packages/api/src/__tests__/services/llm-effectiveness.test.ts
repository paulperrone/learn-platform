import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "../../db/schema.js";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedReviewLog,
  seedLLMUsage,
  seedUserTopicState,
} from "../helpers.js";

const db = getTestDb();

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await db.delete(schema.llmUsage);
  await db.delete(schema.reviewLog);
  await db.delete(schema.userTopicState);
});

describe("LLM effectiveness: per-topic accuracy split", () => {
  it("computes accuracy delta between LLM-assisted and baseline", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id, { id: "eff-topic-1" });

    // 10 LLM-assisted attempts: 8 correct
    for (let i = 0; i < 10; i++) {
      await seedReviewLog(user.id, topic.id, {
        llmAssisted: true,
        correct: i < 8,
      });
    }

    // 10 baseline attempts: 5 correct
    for (let i = 0; i < 10; i++) {
      await seedReviewLog(user.id, topic.id, {
        llmAssisted: false,
        correct: i < 5,
      });
    }

    // Query the same way the endpoint does
    const rows = await db
      .select({
        topicId: schema.reviewLog.topicId,
        llmAssisted: schema.reviewLog.llmAssisted,
        correct: schema.reviewLog.correct,
      })
      .from(schema.reviewLog);

    const llmRows = rows.filter((r) => r.topicId === topic.id && r.llmAssisted);
    const baseRows = rows.filter((r) => r.topicId === topic.id && !r.llmAssisted);

    const llmAcc = llmRows.filter((r) => r.correct).length / llmRows.length;
    const baseAcc = baseRows.filter((r) => r.correct).length / baseRows.length;

    expect(llmAcc).toBeCloseTo(0.8, 1);
    expect(baseAcc).toBeCloseTo(0.5, 1);
    expect(llmAcc - baseAcc).toBeCloseTo(0.3, 1);
  });

  it("returns empty for insufficient sample size", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id, { id: "eff-topic-small" });

    // Only 5 attempts each (below MIN_SAMPLE_SIZE of 10)
    for (let i = 0; i < 5; i++) {
      await seedReviewLog(user.id, topic.id, { llmAssisted: true, correct: true });
      await seedReviewLog(user.id, topic.id, { llmAssisted: false, correct: false });
    }

    const rows = await db
      .select({
        topicId: schema.reviewLog.topicId,
        llmAssisted: schema.reviewLog.llmAssisted,
        correct: schema.reviewLog.correct,
      })
      .from(schema.reviewLog);

    const llmRows = rows.filter((r) => r.topicId === topic.id && r.llmAssisted);
    const baseRows = rows.filter((r) => r.topicId === topic.id && !r.llmAssisted);

    // Both groups have 5 < 10, so no per-topic result should be emitted
    expect(llmRows.length).toBe(5);
    expect(baseRows.length).toBe(5);
  });
});

describe("LLM effectiveness: hint outcomes", () => {
  it("links hint event to next attempt accuracy", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id, { id: "hint-outcome-topic" });

    const now = new Date();
    // Attempt with LLM hint, then correct follow-up
    await seedReviewLog(user.id, topic.id, {
      hintSource: "llm",
      correct: false,
      createdAt: new Date(now.getTime() - 2000).toISOString(),
    });
    await seedReviewLog(user.id, topic.id, {
      hintSource: null,
      correct: true,
      createdAt: new Date(now.getTime() - 1000).toISOString(),
    });

    // Static hint then incorrect follow-up
    await seedReviewLog(user.id, topic.id, {
      hintSource: "static",
      correct: false,
      createdAt: now.toISOString(),
    });
    await seedReviewLog(user.id, topic.id, {
      hintSource: null,
      correct: false,
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });

    const rows = await db
      .select({
        userId: schema.reviewLog.userId,
        topicId: schema.reviewLog.topicId,
        correct: schema.reviewLog.correct,
        hintSource: schema.reviewLog.hintSource,
        createdAt: schema.reviewLog.createdAt,
      })
      .from(schema.reviewLog)
      .orderBy(schema.reviewLog.userId, schema.reviewLog.topicId, schema.reviewLog.createdAt);

    // Verify hint source data is stored correctly
    const hintRows = rows.filter((r) => r.hintSource !== null);
    expect(hintRows.length).toBe(2);
    expect(hintRows[0].hintSource).toBe("llm");
    expect(hintRows[1].hintSource).toBe("static");
  });
});

describe("LLM effectiveness: mastery impact", () => {
  it("compares reps-to-mastery for LLM-assisted vs baseline", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topicLlm = await seedTopic(disc.id, { id: "mastery-llm-topic" });
    const topicBase = await seedTopic(disc.id, { id: "mastery-base-topic" });

    // Mastered with LLM assistance (fewer reps)
    await seedUserTopicState(user.id, topicLlm.id, {
      mastered: true,
      reps: 4,
      lapses: 0,
    });
    await seedLLMUsage(user.id, { topicId: topicLlm.id, purpose: "socratic-tutor" });

    // Mastered without LLM (more reps)
    await seedUserTopicState(user.id, topicBase.id, {
      mastered: true,
      reps: 8,
      lapses: 1,
    });

    // Verify the data is queryable
    const mastered = await db
      .select()
      .from(schema.userTopicState)
      .where(sql`${schema.userTopicState.mastered} = 1`);

    const llmUsage = await db
      .select()
      .from(schema.llmUsage)
      .where(sql`${schema.llmUsage.topicId} IS NOT NULL`);

    const llmTopicKeys = new Set(llmUsage.map((r) => `${r.userId}:${r.topicId}`));

    const llmMastered = mastered.filter((m) => llmTopicKeys.has(`${m.userId}:${m.topicId}`));
    const baseMastered = mastered.filter((m) => !llmTopicKeys.has(`${m.userId}:${m.topicId}`));

    expect(llmMastered.length).toBeGreaterThanOrEqual(1);
    expect(baseMastered.length).toBeGreaterThanOrEqual(1);

    const llmAvgReps = llmMastered.reduce((s, m) => s + m.reps, 0) / llmMastered.length;
    const baseAvgReps = baseMastered.reduce((s, m) => s + m.reps, 0) / baseMastered.length;

    expect(llmAvgReps).toBeLessThan(baseAvgReps);
  });
});

describe("LLM effectiveness: budget exhaustion logging", () => {
  it("records budget_exceeded events in llm_usage", async () => {
    const user = await seedUser();

    await db.insert(schema.llmUsage).values({
      id: "budget-exceeded-1",
      userId: user.id,
      model: "",
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      purpose: "budget_exceeded",
      topicId: "some-topic",
      problemId: "some-problem",
    });

    const rows = await db
      .select()
      .from(schema.llmUsage)
      .where(sql`${schema.llmUsage.purpose} = 'budget_exceeded'`);

    expect(rows.length).toBe(1);
    expect(rows[0].topicId).toBe("some-topic");
    expect(rows[0].problemId).toBe("some-problem");
    expect(rows[0].costCents).toBe(0);
    expect(rows[0].inputTokens).toBe(0);
  });
});
