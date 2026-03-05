import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedLLMUsage,
  seedReviewLog,
} from "../helpers.js";
import { getModelConfig, createLLMService } from "../../services/llm.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("getModelConfig", () => {
  it("returns defaults when no DB config exists", async () => {
    const db = getTestDb();
    const config = await getModelConfig(db);

    expect(config.modelMap.cheap).toBeDefined();
    expect(config.modelMap.capable).toBeDefined();
    expect(Object.keys(config.costPerM).length).toBeGreaterThan(0);
  });

  it("overrides defaults with DB config", async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    await db.insert(schema.llmModelConfig).values({
      tier: "cheap",
      modelId: "custom/cheap-model",
      costInputPerM: 10,
      costOutputPerM: 20,
      updatedAt: now,
    });

    const config = await getModelConfig(db);
    expect(config.modelMap.cheap).toBe("custom/cheap-model");
    expect(config.costPerM["custom/cheap-model"]).toEqual({ input: 10, output: 20 });
    // capable should still be default
    expect(config.modelMap.capable).toBeDefined();

    // Cleanup
    await db.delete(schema.llmModelConfig).where(eq(schema.llmModelConfig.tier, "cheap"));
  });
});

describe("createLLMService", () => {
  describe("generateHint (static hints)", () => {
    it("returns static hint for levels 1-2 when available", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "llm-hint-user" });
      // No external API call needed for static hints
      const llm = createLLMService(db, "fake-key");
      const result = await llm.generateHint(
        user.id,
        "Addition",
        "What is 3 + 4?",
        "7",
        ["Think about counting on from 3", "Try using your fingers"],
        0 // currentHintLevel
      );

      expect(result.level).toBe(1);
      expect(result.hint).toBe("Think about counting on from 3");
      expect(result.source).toBe("static");
    });

    it("returns level 2 static hint", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "llm-hint-user-2" });
      const llm = createLLMService(db, "fake-key");
      const result = await llm.generateHint(
        user.id,
        "Addition",
        "What is 3 + 4?",
        "7",
        ["Hint 1", "Hint 2"],
        1
      );

      expect(result.level).toBe(2);
      expect(result.hint).toBe("Hint 2");
      expect(result.source).toBe("static");
    });
  });

  describe("getUsage", () => {
    it("aggregates usage stats for a user", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "llm-usage-user" });

      await seedLLMUsage(user.id, { purpose: "tutor", costCents: 0.5, inputTokens: 200, outputTokens: 100 });
      await seedLLMUsage(user.id, { purpose: "tutor", costCents: 0.3, inputTokens: 150, outputTokens: 80 });
      await seedLLMUsage(user.id, { purpose: "hint-nudge", costCents: 0.1, inputTokens: 50, outputTokens: 20 });

      const llm = createLLMService(db, "fake-key");
      const usage = await llm.getUsage(user.id);

      expect(usage.totalCostCents).toBeCloseTo(0.9, 1);
      expect(usage.breakdown).toHaveLength(2); // tutor + hint-nudge
      const tutorBreakdown = usage.breakdown.find((b) => b.purpose === "tutor");
      expect(tutorBreakdown?.count).toBe(2);
    });

    it("returns zeros for user with no usage", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "llm-no-usage" });
      const llm = createLLMService(db, "fake-key");
      const usage = await llm.getUsage(user.id);

      expect(usage.totalCostCents).toBe(0);
      expect(usage.breakdown).toHaveLength(0);
    });
  });
});
