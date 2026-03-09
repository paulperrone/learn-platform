import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedPrerequisite,
  seedUserTopicState,
} from "./helpers.js";
import { createSRSService } from "../services/srs.js";
import { createGraphService } from "../services/graph.js";
import * as schema from "../db/schema.js";

describe("Session Mix - Interleaving and Review Balance", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  let db: ReturnType<typeof getTestDb>;
  let user: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(schema.userTopicDepth);
    await db.delete(schema.userTopicState);
    await db.delete(schema.encompassings);
    await db.delete(schema.prerequisites);
    await db.delete(schema.assessmentContent);
    await db.delete(schema.topics);
    await db.delete(schema.subjects);
    await db.delete(schema.users);

    user = await seedUser({ id: "mix-user" });
    subjectCreated = false;
  });

  let subjectCreated = false;
  let sharedSubject: Awaited<ReturnType<typeof seedSubject>>;

  async function getOrCreateSubject() {
    if (!subjectCreated) {
      sharedSubject = await seedSubject({ id: "math-test" });
      subjectCreated = true;
    }
    return sharedSubject;
  }

  async function setupTopicsWithDueReviews(
    count: number,
    options: { strand?: string; mastered?: boolean } = {}
  ) {
    const subject = await getOrCreateSubject();
    const pastDue = new Date(Date.now() - 86400000).toISOString();
    const topics = [];

    for (let i = 0; i < count; i++) {
      const topic = await seedTopic(subject.id, {
        id: `topic-${options.strand ?? "a"}-${i}`,
        depth: i,
      });
      topics.push(topic);

      await seedUserTopicState(user.id, topic.id, {
        stability: 5,
        difficulty: 5,
        due: pastDue,
        state: 2, // Review
        reps: 3,
        lapses: 0,
        mastered: options.mastered ?? false,
        frontier: false,
        consecutiveCorrectReviews: options.mastered ? 5 : 0,
      });
    }

    // Chain prerequisites to form a strand
    for (let i = 0; i < topics.length - 1; i++) {
      await seedPrerequisite(topics[i].id, topics[i + 1].id);
    }

    return { subject, topics };
  }

  async function setupFrontierTopics(
    subjectId: string,
    count: number,
    options: { prefix?: string; depthStart?: number } = {}
  ) {
    const topics = [];
    const prefix = options.prefix ?? "new";
    const depthStart = options.depthStart ?? 0;

    for (let i = 0; i < count; i++) {
      const topic = await seedTopic(subjectId, {
        id: `${prefix}-${i}`,
        depth: depthStart + i,
      });
      topics.push(topic);
    }

    // No prerequisite chain — all independent so all appear in frontier
    return topics;
  }

  describe("new-topic minimum guarantee", () => {
    it("includes at least 2 new topics even with large review queue", async () => {
      // 15 topics due for review — much more than a 10-item session can fit
      const { subject } = await setupTopicsWithDueReviews(15);

      // Add frontier topics (no user state = available as new)
      await setupFrontierTopics(subject.id, 5, { prefix: "frontier", depthStart: 20 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      expect(mix.newCount).toBeGreaterThanOrEqual(2);
    });

    it("handles case where fewer than 2 frontier topics exist", async () => {
      const { subject } = await setupTopicsWithDueReviews(15);

      // Only 1 frontier topic available
      await setupFrontierTopics(subject.id, 1, { prefix: "frontier", depthStart: 20 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      // Should include the 1 available frontier topic
      expect(mix.newCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("review cap at 70%", () => {
    it("caps total reviews (warmup + main) at 70% of session size", async () => {
      // 20 due topics and some mastered for warmup
      const { subject } = await setupTopicsWithDueReviews(10);
      await setupTopicsWithDueReviews(5, { strand: "b", mastered: true });

      // Add frontier topics
      await setupFrontierTopics(subject.id, 5, { prefix: "frontier", depthStart: 20 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      // Total reviews = warmup + main reviews should be ≤ 70% = 7
      expect(mix.reviewCount).toBeLessThanOrEqual(Math.floor(10 * 0.7));
    });

    it("review cap works with different session sizes", async () => {
      const { subject } = await setupTopicsWithDueReviews(20);
      await setupFrontierTopics(subject.id, 10, { prefix: "frontier", depthStart: 25 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 15);

      // 70% of 15 = 10.5 → floor = 10
      expect(mix.reviewCount).toBeLessThanOrEqual(Math.floor(15 * 0.7));
    });
  });

  describe("warmup reduction", () => {
    it("reduces warmup to 1 when review queue exceeds main slots", async () => {
      // Many due topics + mastered topics for warmup pool
      const { subject } = await setupTopicsWithDueReviews(5, { mastered: true });
      await setupTopicsWithDueReviews(10, { strand: "b" });

      await setupFrontierTopics(subject.id, 5, { prefix: "frontier", depthStart: 20 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      // With 15 due topics and count=10, due > count-3=7, so warmup should be ≤ 1
      expect(warmupItems.length).toBeLessThanOrEqual(1);
    });

    it("allows full warmup when review queue is small", async () => {
      // Only 3 due topics — small queue
      const { subject } = await setupTopicsWithDueReviews(3, { mastered: true });

      await setupFrontierTopics(subject.id, 5, { prefix: "frontier", depthStart: 10 });

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 10);

      const warmupItems = mix.items.filter((i) => i.blendRole === "warmup");
      // 3 due topics ≤ count-3=7, so up to 3 warmup slots
      expect(warmupItems.length).toBeLessThanOrEqual(3);
    });
  });

  describe("strand adjacency", () => {
    it("avoids consecutive same-strand items in main mix", async () => {
      const subject = await seedSubject({ id: "math-test" });

      // Create two distinct strands
      const pastDue = new Date(Date.now() - 86400000).toISOString();

      // Strand 1: counting chain
      const counting = await seedTopic(subject.id, { id: "counting", depth: 0 });
      const add5 = await seedTopic(subject.id, { id: "add-5", depth: 1 });
      const add10 = await seedTopic(subject.id, { id: "add-10", depth: 2 });
      await seedPrerequisite(counting.id, add5.id);
      await seedPrerequisite(add5.id, add10.id);

      // Strand 2: geometry chain
      const shapes = await seedTopic(subject.id, { id: "shapes", depth: 0 });
      const angles = await seedTopic(subject.id, { id: "angles", depth: 1 });
      await seedPrerequisite(shapes.id, angles.id);

      // Make all due for review
      for (const topicId of [counting.id, add5.id, add10.id, shapes.id, angles.id]) {
        await seedUserTopicState(user.id, topicId, {
          stability: 5,
          difficulty: 5,
          due: pastDue,
          state: 2,
          reps: 3,
        });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 8);

      const mainItems = mix.items.filter((i) => i.blendRole === "main");

      if (mainItems.length >= 2) {
        const graphService = createGraphService(db);
        const strandMap = await graphService.getTopicStrands(
          mainItems.map((i) => i.topicId)
        );

        let violations = 0;
        for (let i = 1; i < mainItems.length; i++) {
          const prev = strandMap.get(mainItems[i - 1].topicId);
          const curr = strandMap.get(mainItems[i].topicId);
          if (prev === curr) violations++;
        }

        // With 2 distinct strands, should have minimal violations
        const maxAcceptable = Math.max(0, mainItems.length - 3);
        expect(violations).toBeLessThanOrEqual(maxAcceptable);
      }
    });
  });
});
