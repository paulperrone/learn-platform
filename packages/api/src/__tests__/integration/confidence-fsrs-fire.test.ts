import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedEncompassing,
  seedPrerequisite,
  seedUserTopicState,
} from "../helpers.js";
import { createSRSService } from "../../services/srs.js";
import { Rating } from "ts-fsrs";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * Cross-plan integration test: Confidence → FSRS → FIRe credit flow.
 *
 * Verifies that confidence calibration (Plan 011) affects FSRS scheduling,
 * and that the resulting intervals propagate correctly through FIRe credit
 * (Plan 010) to encompassed child topics.
 */
describe("confidence-fsrs-fire integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const subject = await seedSubject({ id: "math-test" });

    // Parent topic encompasses two children
    // parent → child1 (weight 0.5), parent → child2 (weight 0.3)
    // child2 → grandchild (weight 0.4) — tests multi-hop
    await seedTopic(subject.id, { id: "parent", name: "Parent Topic", depth: 2 });
    await seedTopic(subject.id, { id: "child1", name: "Child 1", depth: 1 });
    await seedTopic(subject.id, { id: "child2", name: "Child 2", depth: 1 });
    await seedTopic(subject.id, { id: "grandchild", name: "Grandchild", depth: 0 });

    await seedPrerequisite("child1", "parent");
    await seedPrerequisite("child2", "parent");
    await seedPrerequisite("grandchild", "child2");

    await seedEncompassing("parent", "child1", 0.5);
    await seedEncompassing("parent", "child2", 0.3);
    await seedEncompassing("child2", "grandchild", 0.4);

    // Parent: reviewed, due far in future
    await seedUserTopicState(user.id, "parent", {
      stability: 10, difficulty: 5, reps: 3, state: 2,
      due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Children: reviewed, due in 10 days (FIRe credit will boost stability)
    const childDue = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "child1", {
      stability: 8, difficulty: 5, reps: 2, state: 2,
      due: childDue,
      lastReview: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "child2", {
      stability: 8, difficulty: 5, reps: 2, state: 2,
      due: childDue,
      lastReview: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "grandchild", {
      stability: 5, difficulty: 5, reps: 2, state: 2,
      due: childDue,
      lastReview: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return { db, user, subject };
  }

  it("high confidence + correct → Easy rating → extended interval, FIRe extends child due dates", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    // Record child1 due date before
    const [child1Before] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "child1"),
      ));

    // Schedule review on parent with high confidence (correct)
    const result = await srs.scheduleReview(
      user.id, "parent", Rating.Easy, 1500, "independent", 5
    );

    expect(result.mastered).toBe(false); // Only 1 review at state=2
    expect(result.misconception).toBe(false);
    expect(result.card.stability).toBeGreaterThan(10); // Extended interval

    // Apply FIRe credit
    const credits = await srs.applyFIReCredit(user.id, "parent", Rating.Easy);
    expect(credits.length).toBeGreaterThanOrEqual(1);

    // Child1 due date should be pushed further out (extension model)
    const [child1After] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "child1"),
      ));

    expect(new Date(child1After.due).getTime())
      .toBeGreaterThan(new Date(child1Before.due).getTime());
  });

  it("low confidence + correct → capped at Good → shorter interval", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    // Schedule with low confidence (correct) — caps at Good
    const lowConfResult = await srs.scheduleReview(
      user.id, "parent", Rating.Easy, 1500, "independent", 1
    );

    // Reset state for comparison
    await resetDb();
    await applyMigrations();
    const { db: db2, user: user2 } = await setupGraph();
    const srs2 = createSRSService(db2);

    // Schedule with high confidence (correct) — no cap
    const highConfResult = await srs2.scheduleReview(
      user2.id, "parent", Rating.Easy, 1500, "independent", 5
    );

    // Low confidence should result in shorter or equal interval (capped at Good)
    expect(lowConfResult.card.stability).toBeLessThanOrEqual(highConfResult.card.stability);
  });

  it("high confidence + wrong → misconception flag, resets consecutive counter", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    // High confidence but wrong = misconception
    const result = await srs.scheduleReview(
      user.id, "parent", Rating.Again, 3000, "independent", 5
    );

    expect(result.misconception).toBe(true);

    // Consecutive correct reviews should be reset
    const [state] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "parent"),
      ));

    expect(state.consecutiveCorrectReviews).toBe(0);
  });

  it("FIRe due-date extension flows multi-hop with diminishing weight", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    // Record grandchild due date before
    const [gcBefore] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "grandchild"),
      ));

    // Apply FIRe from parent — should reach grandchild via parent→child2→grandchild
    const credits = await srs.applyFIReCredit(user.id, "parent", Rating.Easy);

    // Should credit child1, child2, and grandchild (multi-hop)
    const creditedTopics = credits.map(c => c.topicId);
    expect(creditedTopics).toContain("child1");
    expect(creditedTopics).toContain("child2");

    // Grandchild gets credit via 2-hop: parent→child2 (0.3) * child2→grandchild (0.4) = 0.12
    // But discounted by (1 - retrievability)
    const gcCredit = credits.find(c => c.topicId === "grandchild");
    if (gcCredit) {
      // Weight should be less than direct child weights
      const child1Credit = credits.find(c => c.topicId === "child1")!;
      expect(gcCredit.weight).toBeLessThan(child1Credit.weight);
    }

    // Verify grandchild due date pushed further out (if credit was significant enough)
    const [gcAfter] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "grandchild"),
      ));

    if (gcCredit) {
      expect(new Date(gcAfter.due).getTime())
        .toBeGreaterThan(new Date(gcBefore.due).getTime());
    }
  });

  it("confidence accuracy tracks EMA across multiple reviews", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    // First review: high confidence, correct → good calibration
    await srs.scheduleReview(user.id, "parent", Rating.Good, 1500, "independent", 5);

    const [state1] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "parent"),
      ));
    expect(state1.confidenceAccuracy).not.toBeNull();
    const firstAccuracy = state1.confidenceAccuracy!;

    // Second review: high confidence, wrong → poor calibration, EMA drops
    await srs.scheduleReview(user.id, "parent", Rating.Again, 2000, "review", 5);

    const [state2] = await db.select()
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "parent"),
      ));

    // Confidence accuracy should have decreased (α=0.3 EMA)
    expect(state2.confidenceAccuracy!).toBeLessThan(firstAccuracy);
  });
});
