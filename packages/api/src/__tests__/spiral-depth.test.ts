import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedDiscipline,
  seedPrerequisite,
  seedUserTopicDepth,
} from "./helpers.js";
import { createGraphService } from "../services/graph.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

describe("spiral depth tracking in frontier", () => {
  const db = getTestDb();
  const graph = createGraphService(db);

  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  afterAll(async () => {
    await resetDb();
  });

  it("context-layered: mastered topic re-enters frontier when depths remain", async () => {
    const disc = await seedDiscipline({ id: "history-spiral", progressionModel: "context-layered" });
    const subj = await seedSubject({ id: "subj-spiral", disciplineId: disc.id });
    const topic = await seedTopic(subj.id, { id: "topic-spiral-1" });
    const user = await seedUser({});

    // Mark topic as started/mastered in user_topic_state
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: topic.id,
      mastered: true,
      due: new Date().toISOString(),
    });

    // Mark only survey depth as completed
    await seedUserTopicDepth(user.id, topic.id, "survey", true);

    const result = await graph.computeFrontier(user.id);
    const frontierIds = result.topics.map((t) => t.id);

    // Topic should be in frontier because contextual, analytical, synthesis depths remain
    expect(frontierIds).toContain(topic.id);
  });

  it("context-layered: topic leaves frontier when all depths completed", async () => {
    const disc = await seedDiscipline({ id: "history-spiral-2", progressionModel: "context-layered" });
    const subj = await seedSubject({ id: "subj-spiral-2", disciplineId: disc.id });
    const topic = await seedTopic(subj.id, { id: "topic-spiral-all" });
    const user = await seedUser({});

    // Mark topic as mastered
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: topic.id,
      mastered: true,
      due: new Date().toISOString(),
    });

    // Complete all depths
    await seedUserTopicDepth(user.id, topic.id, "survey", true);
    await seedUserTopicDepth(user.id, topic.id, "contextual", true);
    await seedUserTopicDepth(user.id, topic.id, "analytical", true);
    await seedUserTopicDepth(user.id, topic.id, "synthesis", true);

    const result = await graph.computeFrontier(user.id);
    const frontierIds = result.topics.map((t) => t.id);

    // Topic should NOT be in frontier — all depths done
    expect(frontierIds).not.toContain(topic.id);
  });

  it("mastery-gated: mastered topic does NOT re-enter frontier", async () => {
    const disc = await seedDiscipline({ id: "math-no-spiral", progressionModel: "mastery-gated" });
    const subj = await seedSubject({ id: "subj-no-spiral", disciplineId: disc.id });
    const topic = await seedTopic(subj.id, { id: "topic-no-spiral" });
    const user = await seedUser({});

    // Mark mastered
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: topic.id,
      mastered: true,
      due: new Date().toISOString(),
    });

    const result = await graph.computeFrontier(user.id);
    const frontierIds = result.topics.map((t) => t.id);

    // Mastery-gated: mastered = done, no spiral
    expect(frontierIds).not.toContain(topic.id);
  });

  it("context-layered: unstarted topic with met required prereqs is in frontier", async () => {
    const disc = await seedDiscipline({ id: "history-prereq", progressionModel: "context-layered" });
    const subj = await seedSubject({ id: "subj-prereq-cl", disciplineId: disc.id });
    const prereqTopic = await seedTopic(subj.id, { id: "topic-prereq-base" });
    const dependentTopic = await seedTopic(subj.id, { id: "topic-prereq-dep" });
    const user = await seedUser({});

    await seedPrerequisite(prereqTopic.id, dependentTopic.id);
    // Update type to 'required'
    await db
      .update(schema.prerequisites)
      .set({ type: "required" })
      .where(
        and(
          eq(schema.prerequisites.fromTopicId, prereqTopic.id),
          eq(schema.prerequisites.toTopicId, dependentTopic.id)
        )
      );

    // Master the prereq
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: prereqTopic.id,
      mastered: true,
      due: new Date().toISOString(),
    });

    const result = await graph.computeFrontier(user.id);
    const frontierIds = result.topics.map((t) => t.id);

    expect(frontierIds).toContain(dependentTopic.id);
  });
});
