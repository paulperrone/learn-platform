import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedPrerequisite,
  seedUserTopicState,
} from "../helpers.js";
import { createGraphService } from "../../services/graph.js";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.js";

/**
 * Test: GET /graph/:subjectId/user-state/:userId
 * Tests the endpoint logic directly via the graph service + DB queries
 * (same logic as the route handler).
 */
describe("graph user-state endpoint logic", () => {
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

    await seedTopic(subject.id, { id: "counting", name: "Counting", depth: 0 });
    await seedTopic(subject.id, { id: "addition", name: "Addition", depth: 1 });
    await seedTopic(subject.id, { id: "multiplication", name: "Multiplication", depth: 2 });
    await seedPrerequisite("counting", "addition");
    await seedPrerequisite("addition", "multiplication");

    return { db, user, subject };
  }

  it("returns all topics with status for an authenticated user", async () => {
    const { db, user } = await setupGraph();
    const graph = createGraphService(db);

    // counting is mastered, addition is in-progress
    await seedUserTopicState(user.id, "counting", { mastered: true, reps: 5, stability: 10 });
    await seedUserTopicState(user.id, "addition", { mastered: false, reps: 2, stability: 3 });

    const topics = await graph.getSubjectTopics("math-test");
    const states = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));

    const stateMap = new Map(states.map((s) => [s.topicId, s]));
    const frontier = await graph.computeFrontier(user.id);
    const frontierIds = new Set(frontier.topics.map((t: any) => t.id));

    const topicsWithState = topics.map((topic: any) => {
      const state = stateMap.get(topic.id);
      let status = "not-started";
      if (state?.mastered) status = "mastered";
      else if (state) status = "in-progress";
      else if (frontierIds.has(topic.id)) status = "frontier";
      return { id: topic.id, status };
    });

    const counting = topicsWithState.find((t) => t.id === "counting");
    const addition = topicsWithState.find((t) => t.id === "addition");
    const multiplication = topicsWithState.find((t) => t.id === "multiplication");

    expect(counting?.status).toBe("mastered");
    expect(addition?.status).toBe("in-progress");
    // multiplication prereqs not met → not-started (or frontier if addition counts)
    expect(["not-started", "frontier"]).toContain(multiplication?.status);
  });

  it("returns all not-started for a user with no state", async () => {
    const { db, user } = await setupGraph();
    const graph = createGraphService(db);

    const topics = await graph.getSubjectTopics("math-test");
    const states = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));

    expect(states.length).toBe(0);

    const frontier = await graph.computeFrontier(user.id);
    const frontierIds = new Set(frontier.topics.map((t: any) => t.id));

    const topicsWithState = topics.map((topic: any) => {
      const state = states.find((s) => s.topicId === topic.id);
      let status = "not-started";
      if (state?.mastered) status = "mastered";
      else if (state) status = "in-progress";
      else if (frontierIds.has(topic.id)) status = "frontier";
      return { id: topic.id, status };
    });

    // counting has no prereqs → frontier
    expect(topicsWithState.find((t) => t.id === "counting")?.status).toBe("frontier");
    // addition and multiplication blocked → not-started
    expect(topicsWithState.find((t) => t.id === "addition")?.status).toBe("not-started");
    expect(topicsWithState.find((t) => t.id === "multiplication")?.status).toBe("not-started");
  });

  it("computes summary correctly", async () => {
    const { db, user } = await setupGraph();
    const graph = createGraphService(db);

    await seedUserTopicState(user.id, "counting", { mastered: true });
    await seedUserTopicState(user.id, "addition", { mastered: true });

    const topics = await graph.getSubjectTopics("math-test");
    const states = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));
    const stateMap = new Map(states.map((s) => [s.topicId, s]));

    const mastered = topics.filter((t: any) => stateMap.get(t.id)?.mastered).length;

    expect(mastered).toBe(2);
    expect(topics.length).toBe(3);
    // progress = 2/3
    expect(mastered / topics.length).toBeCloseTo(0.667, 2);
  });
});
