import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedPrerequisite,
  seedEncompassing,
} from "../helpers.js";
import { createGraphService } from "../../services/graph.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

describe("createGraphService", () => {
  describe("computeFrontier", () => {
    it("returns root topics when user has no state", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "gf-user-1" });
      const subj = await seedSubject({ id: "gf-subj-1" });
      const t1 = await seedTopic(subj.id, { id: "gf-t1", depth: 0 });
      const t2 = await seedTopic(subj.id, { id: "gf-t2", depth: 1 });
      await seedPrerequisite(t1.id, t2.id);

      const graph = createGraphService(db);
      const result = await graph.computeFrontier(user.id);

      // t1 has no prereqs → on frontier. t2 requires t1 → not on frontier
      expect(result.topics.map((t) => t.id)).toContain(t1.id);
      expect(result.topics.map((t) => t.id)).not.toContain(t2.id);
      expect(result.totalMastered).toBe(0);
    });

    it("unlocks next topics when prereqs are mastered", async () => {
      const db = getTestDb();
      const user = await seedUser({ id: "gf-user-2" });
      const subj = await seedSubject({ id: "gf-subj-2" });
      const t1 = await seedTopic(subj.id, { id: "gf-t3", depth: 0 });
      const t2 = await seedTopic(subj.id, { id: "gf-t4", depth: 1 });
      await seedPrerequisite(t1.id, t2.id);

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
      const result = await graph.computeFrontier(user.id);

      expect(result.topics.map((t) => t.id)).toContain(t2.id);
      expect(result.totalMastered).toBe(1);
    });
  });

  describe("getPrerequisiteChain", () => {
    it("traces full prerequisite chain", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "gpc-subj" });
      const t1 = await seedTopic(subj.id, { id: "gpc-t1" });
      const t2 = await seedTopic(subj.id, { id: "gpc-t2" });
      const t3 = await seedTopic(subj.id, { id: "gpc-t3" });
      await seedPrerequisite(t1.id, t2.id);
      await seedPrerequisite(t2.id, t3.id);

      const graph = createGraphService(db);
      const chain = await graph.getPrerequisiteChain(t3.id);

      expect(chain).toContain(t2.id);
      expect(chain).toContain(t1.id);
    });
  });

  describe("getEncompassingTopics / getEncompassedTopics", () => {
    it("returns encompassing relationships", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "ge-subj" });
      const parent = await seedTopic(subj.id, { id: "ge-parent" });
      const child = await seedTopic(subj.id, { id: "ge-child" });
      await seedEncompassing(parent.id, child.id, 0.3);

      const graph = createGraphService(db);
      const encompassing = await graph.getEncompassingTopics(child.id);
      expect(encompassing).toHaveLength(1);
      expect(encompassing[0].parentTopicId).toBe(parent.id);

      const encompassed = await graph.getEncompassedTopics(parent.id);
      expect(encompassed).toHaveLength(1);
      expect(encompassed[0].childTopicId).toBe(child.id);
    });
  });

  describe("validateDAG", () => {
    it("reports valid for acyclic graph", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "dag-subj-1" });
      const t1 = await seedTopic(subj.id, { id: "dag-t1" });
      const t2 = await seedTopic(subj.id, { id: "dag-t2" });
      await seedPrerequisite(t1.id, t2.id);

      const graph = createGraphService(db);
      const result = await graph.validateDAG(subj.id);
      expect(result.valid).toBe(true);
    });
  });

  describe("computeDepths", () => {
    it("assigns correct depths based on prereq chain", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "depth-subj" });
      const t1 = await seedTopic(subj.id, { id: "depth-t1", depth: 0 });
      const t2 = await seedTopic(subj.id, { id: "depth-t2", depth: 0 });
      const t3 = await seedTopic(subj.id, { id: "depth-t3", depth: 0 });
      await seedPrerequisite(t1.id, t2.id);
      await seedPrerequisite(t2.id, t3.id);

      const graph = createGraphService(db);
      const depths = await graph.computeDepths(subj.id);

      expect(depths["depth-t1"]).toBe(0);
      expect(depths["depth-t2"]).toBe(1);
      expect(depths["depth-t3"]).toBe(2);
    });
  });

  describe("getTopic / getSubjectTopics / getSubjects", () => {
    it("retrieves topics and subjects", async () => {
      const db = getTestDb();
      const subj = await seedSubject({ id: "get-subj" });
      const topic = await seedTopic(subj.id, { id: "get-topic" });

      const graph = createGraphService(db);

      const fetched = await graph.getTopic(topic.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe(topic.name);

      const subjects = await graph.getSubjects();
      expect(subjects.map((s) => s.id)).toContain(subj.id);

      const topics = await graph.getSubjectTopics(subj.id);
      expect(topics.map((t) => t.id)).toContain(topic.id);
    });

    it("returns null for nonexistent topic", async () => {
      const db = getTestDb();
      const graph = createGraphService(db);
      const result = await graph.getTopic("nonexistent");
      expect(result).toBeNull();
    });
  });
});
