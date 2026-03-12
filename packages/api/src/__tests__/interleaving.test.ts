import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedPrerequisite,
} from "./helpers.js";
import { createGraphService } from "../services/graph.js";
import { createSRSService, interleaveByStrand, type MixItem } from "../services/srs.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

describe("Non-Interference Interleaving", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  describe("interleaveByStrand (pure function)", () => {
    it("returns empty array for empty input", () => {
      expect(interleaveByStrand([], new Map())).toEqual([]);
    });

    it("returns single item unchanged", () => {
      const items: MixItem[] = [
        { topicId: "a", type: "review", blendRole: "main" },
      ];
      const strands = new Map([["a", "root-a"]]);
      expect(interleaveByStrand(items, strands)).toEqual(items);
    });

    it("does not place same-strand items back-to-back when avoidable", () => {
      const items: MixItem[] = [
        { topicId: "add-5", type: "review", blendRole: "main" },
        { topicId: "add-10", type: "review", blendRole: "main" },
        { topicId: "add-20", type: "review", blendRole: "main" },
        { topicId: "geo-shapes", type: "new", blendRole: "main" },
        { topicId: "geo-angles", type: "new", blendRole: "main" },
      ];
      const strands = new Map([
        ["add-5", "counting"],
        ["add-10", "counting"],
        ["add-20", "counting"],
        ["geo-shapes", "geometry"],
        ["geo-angles", "geometry"],
      ]);

      const result = interleaveByStrand(items, strands);
      expect(result).toHaveLength(5);

      // Check no consecutive same-strand
      for (let i = 1; i < result.length; i++) {
        const prevStrand = strands.get(result[i - 1].topicId);
        const currStrand = strands.get(result[i].topicId);
        expect(currStrand).not.toBe(prevStrand);
      }
    });

    it("falls back gracefully when all items share the same strand", () => {
      const items: MixItem[] = [
        { topicId: "add-5", type: "review", blendRole: "main" },
        { topicId: "add-10", type: "review", blendRole: "main" },
        { topicId: "add-20", type: "new", blendRole: "main" },
      ];
      const strands = new Map([
        ["add-5", "counting"],
        ["add-10", "counting"],
        ["add-20", "counting"],
      ]);

      const result = interleaveByStrand(items, strands);
      // All items present, order preserved since no alternative
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.topicId)).toEqual(["add-5", "add-10", "add-20"]);
    });

    it("preserves relative order within strands when possible", () => {
      // With 2 strands of 2 items each, first item should come from first strand
      const items: MixItem[] = [
        { topicId: "a1", type: "review", blendRole: "main" },
        { topicId: "a2", type: "review", blendRole: "main" },
        { topicId: "b1", type: "new", blendRole: "main" },
        { topicId: "b2", type: "new", blendRole: "main" },
      ];
      const strands = new Map([
        ["a1", "strand-a"],
        ["a2", "strand-a"],
        ["b1", "strand-b"],
        ["b2", "strand-b"],
      ]);

      const result = interleaveByStrand(items, strands);
      expect(result).toHaveLength(4);

      // Should alternate: a1, b1, a2, b2
      expect(result[0].topicId).toBe("a1");
      expect(result[1].topicId).toBe("b1");
      expect(result[2].topicId).toBe("a2");
      expect(result[3].topicId).toBe("b2");
    });

    it("handles topics with no strand mapping", () => {
      const items: MixItem[] = [
        { topicId: "a", type: "review", blendRole: "main" },
        { topicId: "b", type: "new", blendRole: "main" },
      ];
      // Empty strand map — all strands are undefined, treated as same
      const result = interleaveByStrand(items, new Map());
      expect(result).toHaveLength(2);
    });
  });

  describe("getTopicStrands (graph service)", () => {
    let db: ReturnType<typeof getTestDb>;

    beforeEach(async () => {
      db = getTestDb();
      await db.delete(schema.prerequisites);
      await db.delete(schema.topics);
      await db.delete(schema.disciplines);
    });

    it("reads strand from DB column for topics with strand set", async () => {
      const subject = await seedDiscipline({ id: "math-test" });
      await seedTopic(subject.id, { id: "counting", depth: 0, strand: "counting-cardinality" });
      await seedTopic(subject.id, { id: "add-5", depth: 1, strand: "counting-cardinality" });
      await seedTopic(subject.id, { id: "add-10", depth: 2, strand: "counting-cardinality" });

      const graphService = createGraphService(db);
      const strands = await graphService.getTopicStrands(["counting", "add-5", "add-10"]);

      // All should have the same strand (prefixed with subject ID)
      expect(strands.get("add-5")).toBe("math-test:counting-cardinality");
      expect(strands.get("add-10")).toBe("math-test:counting-cardinality");
      expect(strands.get("counting")).toBe("math-test:counting-cardinality");
    });

    it("assigns same strand to sibling topics with same strand value", async () => {
      const subject = await seedDiscipline({ id: "math-test" });
      await seedTopic(subject.id, { id: "add-5", depth: 1, strand: "operations" });
      await seedTopic(subject.id, { id: "sub-5", depth: 1, strand: "operations" });

      const graphService = createGraphService(db);
      const strands = await graphService.getTopicStrands(["add-5", "sub-5"]);

      expect(strands.get("add-5")).toBe(strands.get("sub-5"));
    });

    it("assigns different strands to topics with different strand values", async () => {
      const subject = await seedDiscipline({ id: "math-test" });
      await seedTopic(subject.id, { id: "add-5", depth: 1, strand: "counting" });
      await seedTopic(subject.id, { id: "angles", depth: 1, strand: "geometry" });

      const graphService = createGraphService(db);
      const strands = await graphService.getTopicStrands(["add-5", "angles"]);

      expect(strands.get("add-5")).toBe("math-test:counting");
      expect(strands.get("angles")).toBe("math-test:geometry");
      expect(strands.get("add-5")).not.toBe(strands.get("angles"));
    });

    it("falls back to topic ID when strand column is null", async () => {
      const subject = await seedDiscipline({ id: "math-test" });
      await seedTopic(subject.id, { id: "standalone", depth: 0 });

      const graphService = createGraphService(db);
      const strands = await graphService.getTopicStrands(["standalone"]);

      // No strand set — falls back to topic ID
      expect(strands.get("standalone")).toBe("standalone");
    });

    it("returns empty map for empty input", async () => {
      const graphService = createGraphService(db);
      const strands = await graphService.getTopicStrands([]);
      expect(strands.size).toBe(0);
    });
  });

  describe("getSessionMix interleaving integration", () => {
    let db: ReturnType<typeof getTestDb>;
    let user: any;

    beforeEach(async () => {
      db = getTestDb();
      await db.delete(schema.userTopicDepth);
      await db.delete(schema.userTopicState);
      await db.delete(schema.encompassings);
      await db.delete(schema.prerequisites);
      await db.delete(schema.topics);
      await db.delete(schema.disciplines);
      await db.delete(schema.users);

      user = await seedUser({ id: "test-user" });
    });

    it("interleaves topics from different strands in session mix", async () => {
      const subject = await seedDiscipline({ id: "math-test" });

      // Two strands: arithmetic and geometry
      const counting = await seedTopic(subject.id, { id: "counting", depth: 0, strand: "arithmetic" });
      const add5 = await seedTopic(subject.id, { id: "add-5", depth: 1, strand: "arithmetic" });
      const add10 = await seedTopic(subject.id, { id: "add-10", depth: 2, strand: "arithmetic" });
      const shapes = await seedTopic(subject.id, { id: "shapes", depth: 0, strand: "geometry" });
      const angles = await seedTopic(subject.id, { id: "angles", depth: 1, strand: "geometry" });

      await seedPrerequisite(counting.id, add5.id);
      await seedPrerequisite(add5.id, add10.id);
      await seedPrerequisite(shapes.id, angles.id);

      // Make some topics due for review (simulate user state)
      const now = new Date();
      const pastDue = new Date(now.getTime() - 86400000).toISOString();
      for (const topicId of ["counting", "add-5", "shapes", "angles"]) {
        await db.insert(schema.userTopicState).values({
          userId: user.id,
          topicId,
          stability: 5,
          difficulty: 5,
          due: pastDue,
          state: 2, // Review
          reps: 3,
          lapses: 0,
          mastered: false,
          frontier: false,
          consecutiveCorrectReviews: 0,
        });
      }

      const srs = createSRSService(db);
      const mix = await srs.getSessionMix(user.id, 6);

      // Filter main items only
      const mainItems = mix.items.filter((i) => i.blendRole === "main");

      if (mainItems.length >= 2) {
        const graphService = createGraphService(db);
        const strandMap = await graphService.getTopicStrands(
          mainItems.map((i) => i.topicId)
        );

        // Count consecutive same-strand violations
        let violations = 0;
        for (let i = 1; i < mainItems.length; i++) {
          const prev = strandMap.get(mainItems[i - 1].topicId);
          const curr = strandMap.get(mainItems[i].topicId);
          if (prev === curr) violations++;
        }

        // With 2 strands and 4+ items, should have minimal violations
        // (may have some if strand ratio is very unbalanced)
        const maxAcceptable = Math.max(0, mainItems.length - 3);
        expect(violations).toBeLessThanOrEqual(maxAcceptable);
      }
    });
  });
});
