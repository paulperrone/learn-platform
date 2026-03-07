import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { computeDifficultyBias, applyDifficultyBias } from "../services/session.js";
import { createSRSService } from "../services/srs.js";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
  seedReviewLog,
} from "./helpers.js";

describe("computeDifficultyBias", () => {
  it("returns on-target with fewer than 3 results", () => {
    expect(computeDifficultyBias([])).toBe("on-target");
    expect(computeDifficultyBias([true])).toBe("on-target");
    expect(computeDifficultyBias([true, false])).toBe("on-target");
  });

  it("returns harder when accuracy > 90%", () => {
    // 10/10 = 100%
    expect(computeDifficultyBias([true, true, true, true, true, true, true, true, true, true])).toBe("harder");
    // 9/10 = 90% — boundary is >, so 0.9 is not > 0.9
    expect(computeDifficultyBias([true, true, true, true, true, true, true, true, true, false])).toBe("on-target");
    // 10/10 with short window
    expect(computeDifficultyBias([true, true, true])).toBe("harder");
  });

  it("returns easier when accuracy < 80%", () => {
    // 7/10 = 70%
    expect(computeDifficultyBias([true, true, true, true, true, true, true, false, false, false])).toBe("easier");
    // 2/3 = 66.7%
    expect(computeDifficultyBias([true, true, false])).toBe("easier");
  });

  it("returns on-target in the 80-90% range", () => {
    // 8/10 = 80%
    expect(computeDifficultyBias([true, true, true, true, true, true, true, true, false, false])).toBe("on-target");
    // 9/10 = 90% (boundary — not > 0.9)
    expect(computeDifficultyBias([true, true, true, true, true, true, true, true, true, false])).toBe("on-target");
  });
});

describe("applyDifficultyBias", () => {
  it("returns base difficulty when on-target", () => {
    expect(applyDifficultyBias("easy", "on-target")).toBe("easy");
    expect(applyDifficultyBias("medium", "on-target")).toBe("medium");
    expect(applyDifficultyBias("hard", "on-target")).toBe("hard");
  });

  it("shifts up one level when harder", () => {
    expect(applyDifficultyBias("easy", "harder")).toBe("medium");
    expect(applyDifficultyBias("medium", "harder")).toBe("hard");
  });

  it("clamps at hard when already hard and harder", () => {
    expect(applyDifficultyBias("hard", "harder")).toBe("hard");
  });

  it("shifts down one level when easier", () => {
    expect(applyDifficultyBias("medium", "easier")).toBe("easy");
    expect(applyDifficultyBias("hard", "easier")).toBe("medium");
  });

  it("clamps at easy when already easy and easier", () => {
    expect(applyDifficultyBias("easy", "easier")).toBe("easy");
  });

  it("returns unknown difficulties unchanged", () => {
    expect(applyDifficultyBias("unknown", "harder")).toBe("unknown");
  });
});

describe("Per-user FSRS optimization", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  beforeEach(async () => {
    const db = getTestDb();
    // Clean review_log and user_fsrs_params between tests
    await db.delete((await import("../db/schema.js")).reviewLog);
    await db.delete((await import("../db/schema.js")).userFsrsParams);
  });

  it("returns null when user has fewer than 50 reviews", async () => {
    const db = getTestDb();
    const srs = createSRSService(db);
    const user = await seedUser();
    const subject = await seedSubject();
    const topic = await seedTopic(subject.id);

    // Seed 10 reviews — below threshold
    for (let i = 0; i < 10; i++) {
      await seedReviewLog(user.id, topic.id, { correct: true });
    }

    const result = await srs.optimizeUserParams(user.id);
    expect(result).toBeNull();
  });

  it("computes params when user has 50+ reviews", async () => {
    const db = getTestDb();
    const srs = createSRSService(db);
    const user = await seedUser();
    const subject = await seedSubject();
    const topic = await seedTopic(subject.id);

    // Seed 60 reviews: 48 correct, 12 incorrect = 80% retention
    for (let i = 0; i < 48; i++) {
      await seedReviewLog(user.id, topic.id, { correct: true, phase: "review" });
    }
    for (let i = 0; i < 12; i++) {
      await seedReviewLog(user.id, topic.id, { correct: false, phase: "review" });
    }

    const result = await srs.optimizeUserParams(user.id);
    expect(result).not.toBeNull();
    expect(result!.reviewCount).toBe(60);
    // 80% observed retention → request_retention = 0.8
    expect(result!.requestRetention).toBeCloseTo(0.8, 1);
  });

  it("clamps request_retention between 0.7 and 0.97", async () => {
    const db = getTestDb();
    const srs = createSRSService(db);
    const user = await seedUser();
    const subject = await seedSubject();
    const topic = await seedTopic(subject.id);

    // Seed 50 reviews: all correct = 100% → clamped to 0.97
    for (let i = 0; i < 50; i++) {
      await seedReviewLog(user.id, topic.id, { correct: true, phase: "review" });
    }

    const result = await srs.optimizeUserParams(user.id);
    expect(result).not.toBeNull();
    expect(result!.requestRetention).toBe(0.97);
  });

  it("retrieves stored params via getUserFsrsParams", async () => {
    const db = getTestDb();
    const srs = createSRSService(db);
    const user = await seedUser();
    const subject = await seedSubject();
    const topic = await seedTopic(subject.id);

    // Before optimization: defaults
    const defaults = await srs.getUserFsrsParams(user.id);
    expect(defaults.requestRetention).toBe(0.9);
    expect(defaults.reviewCount).toBe(0);

    // Optimize
    for (let i = 0; i < 50; i++) {
      await seedReviewLog(user.id, topic.id, { correct: true, phase: "review" });
    }
    await srs.optimizeUserParams(user.id);

    // After: custom params
    const custom = await srs.getUserFsrsParams(user.id);
    expect(custom.requestRetention).toBe(0.97);
    expect(custom.reviewCount).toBe(50);
    expect(custom.computedAt).not.toBeNull();
  });

  it("uses global defaults for users without custom params", async () => {
    const db = getTestDb();
    const srs = createSRSService(db);
    const user = await seedUser();

    const params = await srs.getUserFsrsParams(user.id);
    expect(params.requestRetention).toBe(0.9);
    expect(params.computedAt).toBeNull();
  });
});
