import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedReviewLog,
  seedLLMUsage,
} from "./helpers.js";

describe("LLM Attribution — Schema", () => {
  const db = getTestDb();

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  beforeEach(async () => {
    // Clean relevant tables
    await db.delete(schema.llmUsage);
    await db.delete(schema.reviewLog);
  });

  it("llm_usage stores topicId and problemId", async () => {
    const user = await seedUser();
    await db.insert(schema.llmUsage).values({
      id: "llm-test-1",
      userId: user.id,
      model: "test-model",
      inputTokens: 100,
      outputTokens: 50,
      costCents: 0.01,
      purpose: "socratic-tutor",
      topicId: "add-within-20",
      problemId: "add-within-20-p1",
      sessionId: "session-abc",
    });

    const [row] = await db
      .select()
      .from(schema.llmUsage)
      .where(eq(schema.llmUsage.id, "llm-test-1"));

    expect(row.topicId).toBe("add-within-20");
    expect(row.problemId).toBe("add-within-20-p1");
    expect(row.sessionId).toBe("session-abc");
  });

  it("llm_usage allows null topicId/problemId (backward compat)", async () => {
    const user = await seedUser();
    await db.insert(schema.llmUsage).values({
      id: "llm-test-2",
      userId: user.id,
      model: "test-model",
      inputTokens: 100,
      outputTokens: 50,
      costCents: 0.01,
      purpose: "tutor",
    });

    const [row] = await db
      .select()
      .from(schema.llmUsage)
      .where(eq(schema.llmUsage.id, "llm-test-2"));

    expect(row.topicId).toBeNull();
    expect(row.problemId).toBeNull();
    expect(row.sessionId).toBeNull();
  });

  it("review_log stores llm_assisted and hint_source", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id);

    await seedReviewLog(user.id, topic.id, {
      llmAssisted: true,
      hintSource: "llm",
    });

    const [row] = await db
      .select()
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.userId, user.id));

    expect(row.llmAssisted).toBe(true);
    expect(row.hintSource).toBe("llm");
  });

  it("review_log defaults llm_assisted to false", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id);

    await seedReviewLog(user.id, topic.id);

    const [row] = await db
      .select()
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.userId, user.id));

    expect(row.llmAssisted).toBe(false);
    expect(row.hintSource).toBeNull();
  });

  it("review_log records static hint source", async () => {
    const user = await seedUser();
    const disc = await seedDiscipline();
    const topic = await seedTopic(disc.id);

    await seedReviewLog(user.id, topic.id, {
      llmAssisted: false,
      hintSource: "static",
    });

    const [row] = await db
      .select()
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.userId, user.id));

    expect(row.llmAssisted).toBe(false);
    expect(row.hintSource).toBe("static");
  });
});
