import { describe, it, expect, beforeAll } from "vitest";
import { Rating } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedEncompassing,
} from "../helpers.js";
import { createSRSService } from "../../services/srs.js";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("createSRSService", () => {
  describe("getOrCreateState", () => {
    it("creates new state for unseen topic", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-1" });
      const subj = await seedSubject({ id: "srs-subj-1" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-1" });

      const srs = createSRSService(db);
      const state = await srs.getOrCreateState(user.id, topic.id);

      expect(state.userId).toBe(user.id);
      expect(state.topicId).toBe(topic.id);
      expect(state.reps).toBe(0);
      expect(state.mastered).toBe(false);
    });

    it("returns existing state on second call", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-2" });
      const subj = await seedSubject({ id: "srs-subj-2" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-2" });

      const srs = createSRSService(db);
      const first = await srs.getOrCreateState(user.id, topic.id);
      const second = await srs.getOrCreateState(user.id, topic.id);
      expect(first.id).toBe(second.id);
    });
  });

  describe("scheduleReview", () => {
    it("updates FSRS state and logs review", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-3" });
      const subj = await seedSubject({ id: "srs-subj-3" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-3" });

      const srs = createSRSService(db);
      const result = await srs.scheduleReview(
        user.id,
        topic.id,
        Rating.Good,
        2000,
        "independent"
      );

      expect(result.card).toBeDefined();
      expect(result.card.reps).toBe(1);

      // Check review was logged
      const logs = await db
        .select()
        .from(schema.reviewLog)
        .where(
          and(
            eq(schema.reviewLog.userId, user.id),
            eq(schema.reviewLog.topicId, topic.id)
          )
        );
      expect(logs).toHaveLength(1);
      expect(logs[0].rating).toBe(Rating.Good);
      expect(logs[0].phase).toBe("independent");
    });

    it("tracks confidence accuracy", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-4" });
      const subj = await seedSubject({ id: "srs-subj-4" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-4" });

      const srs = createSRSService(db);
      await srs.scheduleReview(user.id, topic.id, Rating.Good, 1500, "guided", 5);

      const [state] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, topic.id)
          )
        );
      expect(state.confidenceAccuracy).not.toBeNull();
    });

    it("tracks hint usage in review log", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-5" });
      const subj = await seedSubject({ id: "srs-subj-5" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-5" });

      const srs = createSRSService(db);
      await srs.scheduleReview(user.id, topic.id, Rating.Good, 1000, "independent", undefined, 2);

      const [log] = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, user.id));
      expect(log.hintsUsed).toBe(2);
    });
  });

  describe("getDueTopics", () => {
    it("returns topics that are due", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-6" });
      const subj = await seedSubject({ id: "srs-subj-6" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-6" });

      // Create a state that's due now
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        due: new Date(Date.now() - 60000).toISOString(), // 1 min ago
        mastered: false,
        stability: 1,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const due = await srs.getDueTopics(user.id);
      expect(due.map((d) => d.topicId)).toContain(topic.id);
    });

    it("excludes mastered topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-7" });
      const subj = await seedSubject({ id: "srs-subj-7" });
      const topic = await seedTopic(subj.id, { id: "srs-topic-7" });

      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        due: new Date(Date.now() - 60000).toISOString(),
        mastered: true,
        stability: 30,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const due = await srs.getDueTopics(user.id);
      expect(due.map((d) => d.topicId)).not.toContain(topic.id);
    });
  });

  describe("applyFIReCredit", () => {
    it("moves child topic due date closer when parent is reviewed", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-8" });
      const subj = await seedSubject({ id: "srs-subj-8" });
      const parent = await seedTopic(subj.id, { id: "srs-parent-8" });
      const child = await seedTopic(subj.id, { id: "srs-child-8" });
      await seedEncompassing(parent.id, child.id, 0.5);

      // Child has state with future due date
      const futureDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: child.id,
        due: futureDue,
        mastered: false,
        reps: 3,
        stability: 5,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const credits = await srs.applyFIReCredit(user.id, parent.id, Rating.Good);

      expect(credits).toHaveLength(1);
      expect(credits[0].topicId).toBe(child.id);

      // Verify due date moved closer
      const [updated] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, child.id)
          )
        );
      expect(new Date(updated.due).getTime()).toBeLessThan(new Date(futureDue).getTime());
    });
  });

  describe("getSessionMix", () => {
    it("returns mix of review and new topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-9" });
      const subj = await seedSubject({ id: "srs-subj-9" });

      // Create some topics on the frontier (no prereqs, not started)
      for (let i = 0; i < 5; i++) {
        await seedTopic(subj.id, {
          id: `srs-mix-${i}`,
          depth: i,
        });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 5);

      expect(mix.items.length).toBeGreaterThan(0);
      expect(mix.newCount).toBeGreaterThan(0);
    });
  });

  describe("getUserStats", () => {
    it("returns correct stat counts", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-10" });
      const subj = await seedSubject({ id: "srs-subj-10" });
      const t1 = await seedTopic(subj.id, { id: "srs-stat-1" });
      const t2 = await seedTopic(subj.id, { id: "srs-stat-2" });

      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: t1.id,
        mastered: true,
        due: new Date().toISOString(),
        reps: 5,
        stability: 30,
        difficulty: 5,
      });
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: t2.id,
        mastered: false,
        due: new Date(Date.now() - 60000).toISOString(),
        reps: 2,
        stability: 1,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const stats = await srs.getUserStats(user.id);

      expect(stats.mastered).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.dueForReview).toBe(1);
    });
  });
});
