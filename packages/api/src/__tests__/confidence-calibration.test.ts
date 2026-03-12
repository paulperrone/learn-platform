import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Rating } from "ts-fsrs";
import { createSRSService } from "../services/srs.js";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedReviewLog,
} from "./helpers.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

describe("confidence calibration", () => {
  let db: ReturnType<typeof getTestDb>;
  let srs: ReturnType<typeof createSRSService>;
  let userId: string;
  let topicId: string;

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  beforeEach(async () => {
    db = getTestDb();
    // Clean relevant tables between tests
    await db.delete(schema.reviewLog);
    await db.delete(schema.userTopicState);
    await db.delete(schema.topics);
    await db.delete(schema.disciplines);
    await db.delete(schema.users);
    srs = createSRSService(db);

    const user = await seedUser();
    userId = user.id;
    const discipline = await seedDiscipline();
    const topic = await seedTopic(discipline.id, { id: "addition" });
    topicId = topic.id;
  });

  describe("confidence EMA tracking", () => {
    it("initializes confidenceAccuracy on first confident review", async () => {
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "independent", 5);

      const state = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId),
        ),
      });

      expect(state).toBeDefined();
      expect(state!.confidenceAccuracy).not.toBeNull();
      // Confidence 5 (norm=1.0) + correct → error=0 → accuracy=1.0
      expect(state!.confidenceAccuracy).toBeCloseTo(1.0, 1);
    });

    it("updates confidenceAccuracy with EMA on subsequent reviews", async () => {
      // First: confident and correct → accuracy ≈ 1.0
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "independent", 5);
      // Second: very unsure and correct → error ≈ 0.8
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "review", 1);

      const state = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId),
        ),
      });

      // EMA: 1.0 * 0.7 + 0.2 * 0.3 = 0.76
      expect(state!.confidenceAccuracy).toBeCloseTo(0.76, 1);
    });

    it("does not update confidenceAccuracy when no confidence provided", async () => {
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "pretest");

      const state = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId),
        ),
      });

      expect(state!.confidenceAccuracy).toBeNull();
    });
  });

  describe("confidence-based FSRS rating adjustment", () => {
    it("caps rating at Good for low confidence + correct (fragile knowledge)", async () => {
      const result = await srs.scheduleReview(
        userId, topicId, Rating.Easy, 500, "review", 1 // confidence 1 = very unsure
      );

      // Rating should be capped at Good, not Easy — shorter interval
      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs).toHaveLength(1);
      expect(logs[0].rating).toBe(Rating.Good); // Capped from Easy
      expect(logs[0].correct).toBe(true);
    });

    it("does not cap rating when confidence is moderate (3)", async () => {
      await srs.scheduleReview(
        userId, topicId, Rating.Easy, 500, "review", 3
      );

      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs[0].rating).toBe(Rating.Easy); // Not capped
    });

    it("does not cap rating when confidence is high (4-5) + correct", async () => {
      await srs.scheduleReview(
        userId, topicId, Rating.Easy, 500, "review", 5
      );

      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs[0].rating).toBe(Rating.Easy); // No cap
    });
  });

  describe("misconception detection (high confidence + wrong)", () => {
    it("flags misconception when confidence >= 4 and wrong", async () => {
      const result = await srs.scheduleReview(
        userId, topicId, Rating.Again, 2000, "review", 5
      );

      expect(result.misconception).toBe(true);

      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs[0].misconception).toBe(true);
      expect(logs[0].correct).toBe(false);
    });

    it("does not flag misconception when confidence is low and wrong", async () => {
      const result = await srs.scheduleReview(
        userId, topicId, Rating.Again, 2000, "review", 2
      );

      expect(result.misconception).toBe(false);

      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs[0].misconception).toBe(false);
    });

    it("does not flag misconception when no confidence provided", async () => {
      const result = await srs.scheduleReview(
        userId, topicId, Rating.Again, 2000, "review"
      );

      expect(result.misconception).toBe(false);

      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      expect(logs[0].misconception).toBe(false);
    });

    it("misconception resets consecutive correct count", async () => {
      // Build up reviews — need to reach State.Review for consecutive to count
      // First few Good ratings move through Learning → Review
      for (let i = 0; i < 5; i++) {
        await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "review", 5);
      }

      const stateBefore = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId),
        ),
      });
      // Should have some consecutive correct once in Review state
      expect(stateBefore!.consecutiveCorrectReviews).toBeGreaterThan(0);

      // Now a misconception
      await srs.scheduleReview(userId, topicId, Rating.Again, 2000, "review", 5);

      const stateAfter = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId),
        ),
      });
      expect(stateAfter!.consecutiveCorrectReviews).toBe(0);
    });
  });

  describe("calibration API endpoint", () => {
    it("returns null accuracy when no confident reviews exist", async () => {
      const { request, json } = await import("./helpers.js");
      const res = await request(`/api/progress/${userId}/calibration`);
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data.overallAccuracy).toBeNull();
      expect(data.totalRatedReviews).toBe(0);
    });

    it("returns calibration stats after confident reviews", async () => {
      // Seed some reviews with confidence
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "review", 5);
      await srs.scheduleReview(userId, topicId, Rating.Good, 2000, "review", 4);
      await srs.scheduleReview(userId, topicId, Rating.Again, 2000, "review", 5);

      const { request, json } = await import("./helpers.js");
      const res = await request(`/api/progress/${userId}/calibration`);
      expect(res.status).toBe(200);
      const data = await json<any>(res);

      expect(data.overallAccuracy).not.toBeNull();
      expect(data.overallAccuracy).toBeGreaterThan(0);
      expect(data.overallAccuracy).toBeLessThanOrEqual(1);
      expect(data.totalRatedReviews).toBe(3);
      expect(data.misconceptionCount).toBe(1); // High confidence + wrong
    });
  });
});
