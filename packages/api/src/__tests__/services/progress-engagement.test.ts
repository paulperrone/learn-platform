import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedPrerequisite,
} from "../helpers.js";
import { createGraphService } from "../../services/graph.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("getNewlyUnlockedTopics", () => {
  it("returns topics whose prerequisites are now all met", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "unlock-user-1" });
    const disc = await seedDiscipline({ id: "unlock-subj-1" });
    const t1 = await seedTopic(disc.id, { id: "unlock-t1", name: "Topic A" });
    const t2 = await seedTopic(disc.id, { id: "unlock-t2", name: "Topic B" });
    const t3 = await seedTopic(disc.id, { id: "unlock-t3", name: "Topic C" });
    await seedPrerequisite(t1.id, t2.id); // t1 → t2
    await seedPrerequisite(t1.id, t3.id); // t1 → t3

    // Master t1
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: t1.id,
      mastered: true,
      due: new Date().toISOString(),
      stability: 30,
      difficulty: 5,
    });

    const graph = createGraphService(db);
    const unlocked = await graph.getNewlyUnlockedTopics(user.id, t1.id);

    expect(unlocked.map((t) => t.id)).toContain(t2.id);
    expect(unlocked.map((t) => t.id)).toContain(t3.id);
  });

  it("does not return topics with unmet prerequisites", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "unlock-user-2" });
    const disc = await seedDiscipline({ id: "unlock-subj-2" });
    const t1 = await seedTopic(disc.id, { id: "unlock-t4" });
    const t2 = await seedTopic(disc.id, { id: "unlock-t5" });
    const t3 = await seedTopic(disc.id, { id: "unlock-t6" });
    await seedPrerequisite(t1.id, t3.id); // t1 → t3
    await seedPrerequisite(t2.id, t3.id); // t2 → t3 (both needed)

    // Master only t1
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: t1.id,
      mastered: true,
      due: new Date().toISOString(),
      stability: 30,
      difficulty: 5,
    });

    const graph = createGraphService(db);
    const unlocked = await graph.getNewlyUnlockedTopics(user.id, t1.id);

    // t3 requires both t1 and t2, only t1 is mastered
    expect(unlocked.map((t) => t.id)).not.toContain(t3.id);
  });

  it("does not return already-started topics", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "unlock-user-3" });
    const disc = await seedDiscipline({ id: "unlock-subj-3" });
    const t1 = await seedTopic(disc.id, { id: "unlock-t7" });
    const t2 = await seedTopic(disc.id, { id: "unlock-t8" });
    await seedPrerequisite(t1.id, t2.id);

    // Master t1 and start t2
    await db.insert(schema.userTopicState).values({
      userId: user.id, topicId: t1.id, mastered: true, due: new Date().toISOString(), stability: 30, difficulty: 5,
    });
    await db.insert(schema.userTopicState).values({
      userId: user.id, topicId: t2.id, due: new Date().toISOString(), stability: 1, difficulty: 5, reps: 1,
    });

    const graph = createGraphService(db);
    const unlocked = await graph.getNewlyUnlockedTopics(user.id, t1.id);

    // t2 is already started, so not "newly unlocked"
    expect(unlocked.map((t) => t.id)).not.toContain(t2.id);
  });

  it("returns empty array when no dependents exist", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "unlock-user-4" });
    const disc = await seedDiscipline({ id: "unlock-subj-4" });
    const t1 = await seedTopic(disc.id, { id: "unlock-t9" });

    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: t1.id,
      mastered: true,
      due: new Date().toISOString(),
      stability: 30,
      difficulty: 5,
    });

    const graph = createGraphService(db);
    const unlocked = await graph.getNewlyUnlockedTopics(user.id, t1.id);

    expect(unlocked).toEqual([]);
  });

  it("ignores enriching prerequisites when checking unlock", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "unlock-user-5" });
    const disc = await seedDiscipline({ id: "unlock-subj-5" });
    const t1 = await seedTopic(disc.id, { id: "unlock-t10" });
    const t2 = await seedTopic(disc.id, { id: "unlock-t11" });
    const t3 = await seedTopic(disc.id, { id: "unlock-t12" });
    await seedPrerequisite(t1.id, t3.id); // t1 → t3 (required)
    // t2 → t3 as enriching
    await db.insert(schema.prerequisites).values({
      fromTopicId: t2.id,
      toTopicId: t3.id,
      type: "enriching",
      strength: 1,
    });

    // Master only t1
    await db.insert(schema.userTopicState).values({
      userId: user.id,
      topicId: t1.id,
      mastered: true,
      due: new Date().toISOString(),
      stability: 30,
      difficulty: 5,
    });

    const graph = createGraphService(db);
    const unlocked = await graph.getNewlyUnlockedTopics(user.id, t1.id);

    // t3 should be unlocked — enriching prereqs don't gate
    expect(unlocked.map((t) => t.id)).toContain(t3.id);
  });
});

describe("completion estimate", () => {
  it("calculates progress milestone correctly", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "comp-user-1" });
    const disc = await seedDiscipline({ id: "comp-subj-1" });
    const topics = [];
    for (let i = 0; i < 4; i++) {
      topics.push(await seedTopic(disc.id, { id: `comp-t${i}` }));
    }

    // Master 2 of 4 = 50%
    for (let i = 0; i < 2; i++) {
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topics[i].id,
        mastered: true,
        due: new Date().toISOString(),
        stability: 30,
        difficulty: 5,
      });
    }

    // Check that disciplines, topics, and mastery state can be computed
    const allTopics = await db.select({ id: schema.topics.id, disciplineId: schema.topics.disciplineId }).from(schema.topics);
    const disciplineTopics = allTopics.filter((t) => t.disciplineId === disc.id);
    const masteredRows = await db
      .select({ topicId: schema.userTopicState.topicId })
      .from(schema.userTopicState)
      .where(
        (await import("drizzle-orm")).and(
          (await import("drizzle-orm")).eq(schema.userTopicState.userId, user.id),
          (await import("drizzle-orm")).eq(schema.userTopicState.mastered, true)
        )
      );
    const masteredIds = new Set(masteredRows.map((r) => r.topicId));
    const mastered = disciplineTopics.filter((t) => masteredIds.has(t.id)).length;

    expect(mastered).toBe(2);
    expect(disciplineTopics.length).toBe(4);
    const percentComplete = Math.round((mastered / disciplineTopics.length) * 100);
    expect(percentComplete).toBe(50);
  });
});
