import { describe, it, expect, beforeAll } from "vitest";
import { Rating, State } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedEncompassing,
} from "../helpers.js";
import { createSRSService, FIRE_ENABLED } from "../../services/srs.js";
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
      const disc = await seedDiscipline({ id: "srs-subj-1" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-1" });

      const srs = createSRSService(db);
      const state = await srs.getOrCreateState(user.id, topic.id);

      expect(state.userId).toBe(user.id);
      expect(state.topicId).toBe(topic.id);
      expect(state.reps).toBe(0);
      expect(state.mastered).toBe(false);
      expect(state.consecutiveCorrectReviews).toBe(0);
    });

    it("returns existing state on second call", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-2" });
      const disc = await seedDiscipline({ id: "srs-subj-2" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-2" });

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
      const disc = await seedDiscipline({ id: "srs-subj-3" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-3" });

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
      const disc = await seedDiscipline({ id: "srs-subj-4" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-4" });

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
      const disc = await seedDiscipline({ id: "srs-subj-5" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-5" });

      const srs = createSRSService(db);
      await srs.scheduleReview(user.id, topic.id, Rating.Good, 1000, "independent", undefined, 2);

      const [log] = await db
        .select()
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, user.id));
      expect(log.hintsUsed).toBe(2);
    });
  });

  describe("mastery criteria", () => {
    it("masters topic after 2 consecutive correct reviews at Review state with stability >= 4", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-1" });
      const disc = await seedDiscipline({ id: "srs-mastery-subj-1" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-topic-1" });

      // Seed state at Review state (state=2) with high stability and 1 consecutive correct
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 20,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review, // 2
        reps: 5,
        lapses: 1, // Lapses don't prevent mastery in new criteria
        mastered: false,
        consecutiveCorrectReviews: 1,
      });

      const srs = createSRSService(db);
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Good, 1500, "review");

      expect(result.mastered).toBe(true);

      const [state] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, topic.id)
          )
        );
      expect(state.mastered).toBe(true);
      expect(state.consecutiveCorrectReviews).toBe(2);
    });

    it("lapse resets consecutive counter but not mastery flag", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-2" });
      const disc = await seedDiscipline({ id: "srs-mastery-subj-2" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-topic-2" });

      // Topic already mastered with high consecutive count
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 20,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 8,
        lapses: 0,
        mastered: true,
        consecutiveCorrectReviews: 5,
      });

      const srs = createSRSService(db);
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Again, 1500, "review");

      // Mastery flag stays true (once mastered, stays mastered)
      expect(result.mastered).toBe(true);

      const [state] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, topic.id)
          )
        );
      expect(state.consecutiveCorrectReviews).toBe(0); // Reset
      expect(state.mastered).toBe(true); // Preserved
    });

    it("mastery hysteresis: single incorrect does not clear mastery", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-hyst-1" });
      const disc = await seedDiscipline({ id: "srs-mastery-hyst-subj-1" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-hyst-topic-1" });

      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 20,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 8,
        lapses: 0,
        mastered: true,
        consecutiveCorrectReviews: 5,
        consecutiveIncorrectReviews: 0,
      });

      const srs = createSRSService(db);

      // First incorrect — mastery preserved (hysteresis requires 2+)
      const result1 = await srs.scheduleReview(user.id, topic.id, Rating.Again, 1500, "review");
      expect(result1.mastered).toBe(true);

      const [state1] = await db.select().from(schema.userTopicState)
        .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, topic.id)));
      expect(state1.mastered).toBe(true);
      expect(state1.consecutiveIncorrectReviews).toBe(1);
    });

    it("mastery hysteresis: 2 consecutive incorrect clears mastery", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-hyst-2" });
      const disc = await seedDiscipline({ id: "srs-mastery-hyst-subj-2" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-hyst-topic-2" });

      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 20,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 8,
        lapses: 0,
        mastered: true,
        consecutiveCorrectReviews: 0,
        consecutiveIncorrectReviews: 1, // already had 1 incorrect
      });

      const srs = createSRSService(db);

      // Second incorrect — mastery cleared (2 consecutive)
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Again, 1500, "review");
      expect(result.mastered).toBe(false);

      const [state] = await db.select().from(schema.userTopicState)
        .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, topic.id)));
      expect(state.mastered).toBe(false);
      expect(state.consecutiveIncorrectReviews).toBe(2);
    });

    it("diagnostic mastery survives first warmup review", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-diag-1" });
      const disc = await seedDiscipline({ id: "srs-mastery-diag-subj-1" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-diag-topic-1" });

      // Simulate diagnostic materialization (sets stability=15, ccr=3)
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 15,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 1,
        lapses: 0,
        mastered: true,
        consecutiveCorrectReviews: 3,
        consecutiveIncorrectReviews: 0,
      });

      const srs = createSRSService(db);

      // Correct warmup review
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Good, 1500, "review");
      expect(result.mastered).toBe(true);

      // Incorrect warmup review (reset state first)
      await db.update(schema.userTopicState).set({
        mastered: true, stability: 15, difficulty: 5, state: State.Review,
        consecutiveCorrectReviews: 3, consecutiveIncorrectReviews: 0,
        reps: 1, lapses: 0, due: new Date(Date.now() - 60000).toISOString(),
      }).where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, topic.id)));

      const result2 = await srs.scheduleReview(user.id, topic.id, Rating.Again, 1500, "review");
      expect(result2.mastered).toBe(true); // Still mastered — hysteresis
    });

    it("mastery via alternative path: 3+ consecutive correct regardless of stability", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-alt-1" });
      const disc = await seedDiscipline({ id: "srs-mastery-alt-subj-1" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-alt-topic-1" });

      // Low stability but 2 consecutive correct
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 2, // below threshold of 4
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 6,
        lapses: 0,
        mastered: false,
        consecutiveCorrectReviews: 2,
      });

      const srs = createSRSService(db);
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Good, 1500, "review");
      expect(result.mastered).toBe(true); // 3rd consecutive correct → mastered
      expect(result.justMastered).toBe(true);
    });

    it("does not master with only 1 consecutive correct review", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-mastery-3" });
      const disc = await seedDiscipline({ id: "srs-mastery-subj-3" });
      const topic = await seedTopic(disc.id, { id: "srs-mastery-topic-3" });

      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 20,
        difficulty: 5,
        due: new Date(Date.now() - 60000).toISOString(),
        state: State.Review,
        reps: 4,
        lapses: 0,
        mastered: false,
        consecutiveCorrectReviews: 0,
      });

      const srs = createSRSService(db);
      const result = await srs.scheduleReview(user.id, topic.id, Rating.Good, 1500, "review");

      expect(result.mastered).toBe(false);

      const [state] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, topic.id)
          )
        );
      expect(state.consecutiveCorrectReviews).toBe(1);
    });
  });

  describe("getDueTopics", () => {
    it("returns topics that are due", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-6" });
      const disc = await seedDiscipline({ id: "srs-subj-6" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-6" });

      // Create a state that's due now (reps > 0 = actually reviewed, not just diagnostic)
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        due: new Date(Date.now() - 60000).toISOString(), // 1 min ago
        mastered: false,
        stability: 1,
        difficulty: 5,
        reps: 1,
      });

      const srs = createSRSService(db);
      const due = await srs.getDueTopics(user.id);
      expect(due.map((d) => d.topicId)).toContain(topic.id);
    });

    it("excludes mastered topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-7" });
      const disc = await seedDiscipline({ id: "srs-subj-7" });
      const topic = await seedTopic(disc.id, { id: "srs-topic-7" });

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

  describe.skipIf(!FIRE_ENABLED)("applyFIReCredit", () => {
    it("applies virtual FSRS review with interpolated stability", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-8" });
      const disc = await seedDiscipline({ id: "srs-subj-8" });
      const parent = await seedTopic(disc.id, { id: "srs-parent-8" });
      const child = await seedTopic(disc.id, { id: "srs-child-8" });
      await seedEncompassing(parent.id, child.id, 0.5);

      // Child has low retrievability (reviewed 10 days ago, stability 5 → R ≈ 0.69)
      const futureDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const lastReviewBefore = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: child.id,
        due: futureDue,
        mastered: false,
        reps: 3,
        stability: 5,
        difficulty: 5,
        state: State.Review,
        lastReview: lastReviewBefore,
      });

      const srs = createSRSService(db);
      const credits = await srs.applyFIReCredit(user.id, parent.id, Rating.Good);

      expect(credits).toHaveLength(1);
      expect(credits[0].topicId).toBe(child.id);

      // Verify virtual FSRS review updated full state
      const [updated] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, child.id)
          )
        );
      // Stability should increase (virtual review reinforces memory)
      expect(updated.stability).toBeGreaterThan(5);
      // lastReview should NOT be updated — preserves FSRS retrievability calculation
      expect(updated.lastReview).toBe(lastReviewBefore);
      // Due date should be extended from original anchor (not reset from now)
      expect(new Date(updated.due).getTime()).toBeGreaterThan(new Date(futureDue).getTime());
      // Reps should NOT change (virtual review doesn't count as actual interaction)
      expect(updated.reps).toBe(3);
    });

    it("flows credit through multi-hop encompassing", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-multihop-1" });
      const disc = await seedDiscipline({ id: "srs-multihop-subj" });
      const grandparent = await seedTopic(disc.id, { id: "srs-gp-1" });
      const parent = await seedTopic(disc.id, { id: "srs-p-1" });
      const child = await seedTopic(disc.id, { id: "srs-c-1" });

      // grandparent → parent → child
      await seedEncompassing(grandparent.id, parent.id, 0.7);
      await seedEncompassing(parent.id, child.id, 0.8);

      const futureDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      // Set up parent state (R ≈ 0.86 with stability 10, 15 days ago)
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: parent.id,
        due: futureDue,
        mastered: false,
        reps: 3,
        stability: 10,
        difficulty: 5,
        state: State.Review,
        lastReview: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Set up child state (R ≈ 0.86 with stability 10, 15 days ago)
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: child.id,
        due: futureDue,
        mastered: false,
        reps: 5,
        stability: 10,
        difficulty: 5,
        state: State.Review,
        lastReview: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const srs = createSRSService(db);
      const credits = await srs.applyFIReCredit(user.id, grandparent.id, Rating.Good);

      // Should credit both parent (1-hop) and child (2-hop)
      const creditTopicIds = credits.map((c) => c.topicId);
      expect(creditTopicIds).toContain(parent.id);
      expect(creditTopicIds).toContain(child.id);

      // Child's credit weight should be less than parent's (diminishing)
      const parentCredit = credits.find((c) => c.topicId === parent.id)!;
      const childCredit = credits.find((c) => c.topicId === child.id)!;
      expect(childCredit.weight).toBeLessThan(parentCredit.weight);
    });

    it("skips fresh topics with high retrievability", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-fresh-1" });
      const disc = await seedDiscipline({ id: "srs-fresh-subj" });
      const parent = await seedTopic(disc.id, { id: "srs-fresh-p" });
      const freshChild = await seedTopic(disc.id, { id: "srs-fresh-c" });

      await seedEncompassing(parent.id, freshChild.id, 0.8);

      // Fresh child: reviewed very recently, very high retrievability (R > 0.9)
      const futureDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: freshChild.id,
        due: futureDue,
        mastered: false,
        reps: 3,
        stability: 100, // Very high stability
        difficulty: 5,
        lastReview: new Date(Date.now() - 1000).toISOString(), // Just reviewed
      });

      const srs = createSRSService(db);
      const credits = await srs.applyFIReCredit(user.id, parent.id, Rating.Good);

      // Fresh topic has R > 0.9 → skipped entirely (no marginal benefit)
      expect(credits.length).toBe(0);
    });

    it("scales stability increase by encompassing weight", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-cap-1" });
      const disc = await seedDiscipline({ id: "srs-cap-subj" });
      const parentHigh = await seedTopic(disc.id, { id: "srs-cap-ph" });
      const parentLow = await seedTopic(disc.id, { id: "srs-cap-pl" });
      const childHigh = await seedTopic(disc.id, { id: "srs-cap-ch" });
      const childLow = await seedTopic(disc.id, { id: "srs-cap-cl" });
      await seedEncompassing(parentHigh.id, childHigh.id, 0.9); // High weight
      await seedEncompassing(parentLow.id, childLow.id, 0.3); // Low weight

      // Both children start with identical state (Review state, R ≈ 0.86)
      const lastReview = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      for (const childId of [childHigh.id, childLow.id]) {
        await db.insert(schema.userTopicState).values({
          userId: user.id,
          topicId: childId,
          due: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // overdue
          mastered: false,
          reps: 3,
          stability: 10,
          difficulty: 5,
          state: State.Review,
          lastReview,
        });
      }

      const srs = createSRSService(db);
      await srs.applyFIReCredit(user.id, parentHigh.id, Rating.Good);
      await srs.applyFIReCredit(user.id, parentLow.id, Rating.Good);

      const [updatedHigh] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, childHigh.id)
          )
        );
      const [updatedLow] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, childLow.id)
          )
        );

      // Both should have increased stability
      expect(updatedHigh.stability).toBeGreaterThan(10);
      expect(updatedLow.stability).toBeGreaterThan(10);
      // High-weight child should have more stability increase than low-weight
      expect(updatedHigh.stability).toBeGreaterThan(updatedLow.stability);
    });

    it("does not apply credit on failure rating", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-nofail-1" });
      const disc = await seedDiscipline({ id: "srs-nofail-subj" });
      const parent = await seedTopic(disc.id, { id: "srs-nofail-p" });
      const child = await seedTopic(disc.id, { id: "srs-nofail-c" });
      await seedEncompassing(parent.id, child.id, 0.5);

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
      const credits = await srs.applyFIReCredit(user.id, parent.id, Rating.Again);
      expect(credits).toHaveLength(0);
    });
  });

  describe("applyUpwardPenalty", () => {
    it("moves parent due date closer when child fails", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-penalty-1" });
      const disc = await seedDiscipline({ id: "srs-penalty-subj" });
      const parent = await seedTopic(disc.id, { id: "srs-penalty-p" });
      const child = await seedTopic(disc.id, { id: "srs-penalty-c" });
      await seedEncompassing(parent.id, child.id, 0.8);

      const futureDue = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: parent.id,
        due: futureDue,
        mastered: false,
        reps: 5,
        stability: 15,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const penalties = await srs.applyUpwardPenalty(user.id, child.id, Rating.Again);

      expect(penalties).toHaveLength(1);
      expect(penalties[0].topicId).toBe(parent.id);

      const [updated] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, parent.id)
          )
        );
      expect(new Date(updated.due).getTime()).toBeLessThan(new Date(futureDue).getTime());
    });

    it("does not penalize on success rating", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-penalty-2" });
      const disc = await seedDiscipline({ id: "srs-penalty-subj-2" });
      const parent = await seedTopic(disc.id, { id: "srs-penalty-p-2" });
      const child = await seedTopic(disc.id, { id: "srs-penalty-c-2" });
      await seedEncompassing(parent.id, child.id, 0.8);

      const futureDue = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: parent.id,
        due: futureDue,
        mastered: false,
        reps: 5,
        stability: 15,
        difficulty: 5,
      });

      const srs = createSRSService(db);
      const penalties = await srs.applyUpwardPenalty(user.id, child.id, Rating.Good);
      expect(penalties).toHaveLength(0);
    });

    it("skips parents not yet started", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-penalty-3" });
      const disc = await seedDiscipline({ id: "srs-penalty-subj-3" });
      const parent = await seedTopic(disc.id, { id: "srs-penalty-p-3" });
      const child = await seedTopic(disc.id, { id: "srs-penalty-c-3" });
      await seedEncompassing(parent.id, child.id, 0.8);

      // Parent has no state (not started)
      const srs = createSRSService(db);
      const penalties = await srs.applyUpwardPenalty(user.id, child.id, Rating.Again);
      expect(penalties).toHaveLength(0);
    });
  });

  describe("getSessionMix", () => {
    it("returns mix of review and new topics", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "srs-user-9" });
      const disc = await seedDiscipline({ id: "srs-subj-9" });

      // Create some topics on the frontier (no prereqs, not started)
      for (let i = 0; i < 5; i++) {
        await seedTopic(disc.id, {
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
      const disc = await seedDiscipline({ id: "srs-subj-10" });
      const t1 = await seedTopic(disc.id, { id: "srs-stat-1" });
      const t2 = await seedTopic(disc.id, { id: "srs-stat-2" });

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
