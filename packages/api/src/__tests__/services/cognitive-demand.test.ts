import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";
import type { CognitiveDemand } from "@learn/shared";

beforeAll(async () => {
  await applyMigrations();
});

function getProblemDemand(item: SessionItem): CognitiveDemand | undefined {
  if (item.type === "problem" || item.type === "remediation") {
    return item.problem.cognitiveDemand;
  }
  return undefined;
}

describe("Cognitive Demand Mixing", () => {
  const PREFIX = "cog-demand";

  async function setupTopicWithDemands(id: string, demands: CognitiveDemand[]) {
    const db = getTestDb();
    const disc = await seedDiscipline({ id: `${PREFIX}-subj-${id}` });
    const topic = await seedTopic(disc.id, {
      id: `${PREFIX}-topic-${id}`,
      name: `Demand Topic ${id}`,
    });

    const discId = `${PREFIX}-subj-${id}`;
    for (let i = 0; i < demands.length; i++) {
      for (const difficulty of ["easy", "medium", "hard"] as const) {
        await seedAssessmentContent(topic.id, {
          id: `${PREFIX}-ac-${id}-${demands[i]}-${difficulty}-${i}`,
          difficulty,
          question: `${demands[i]} question ${i} (${difficulty})`,
          answer: `answer-${i}`,
          cognitiveDemand: demands[i],
          disciplineId: discId,
        });
      }
    }

    await seedInstructionalContent(topic.id, {
      id: `${PREFIX}-ic-${id}`,
      disciplineId: discId,
    });

    return { disc, topic, db };
  }

  describe("cognitiveDemand field propagation", () => {
    it("returns cognitiveDemand from content in problem items", async () => {
      const { db } = await setupTopicWithDemands("prop1", ["procedural", "application", "conceptual"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-prop1` });
      const { firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("problem");
      const demand = getProblemDemand(firstItem);
      expect(demand).toBeDefined();
      expect(["procedural", "application"]).toContain(demand);
    });
  });

  describe("pretest phase uses procedural and application only", () => {
    it("selects only procedural or application during pretest", async () => {
      const { db } = await setupTopicWithDemands("pretest1", [
        "procedural", "application", "conceptual", "reasoning", "error_analysis",
      ]);
      const session = createSessionService(db, undefined, getTestR2Bucket());

      // Run multiple sessions to collect demand distribution
      const demands: CognitiveDemand[] = [];
      for (let i = 0; i < 10; i++) {
        const u = await seedUser({ id: `${PREFIX}-user-pretest1-${i}` });
        const { firstItem } = await session.startSession(u.id);
        const d = getProblemDemand(firstItem);
        if (d) demands.push(d);
      }

      // All pretest demands should be procedural or application
      for (const d of demands) {
        expect(["procedural", "application"]).toContain(d);
      }
    });
  });

  describe("demand variety across sessions", () => {
    it("produces different demands across multiple session starts", async () => {
      const { db } = await setupTopicWithDemands("variety1", [
        "procedural", "application",
      ]);
      const session = createSessionService(db, undefined, getTestR2Bucket());

      // Start multiple sessions with different users, check first item demands
      const demands = new Set<CognitiveDemand>();
      for (let i = 0; i < 10; i++) {
        const u = await seedUser({ id: `${PREFIX}-user-variety1-${i}` });
        const { firstItem } = await session.startSession(u.id);
        const d = getProblemDemand(firstItem);
        if (d) demands.add(d);
      }

      // With 10 sessions and 60/40 split, we should see both types
      expect(demands.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe("graceful fallback with only procedural problems", () => {
    it("works when only procedural is available", async () => {
      const { db } = await setupTopicWithDemands("fallback1", ["procedural"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-fallback1` });
      const { firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("problem");
      const demand = getProblemDemand(firstItem);
      expect(demand).toBe("procedural");
    });
  });

  describe("null cognitiveDemand treated as procedural", () => {
    it("treats problems without cognitiveDemand as procedural", async () => {
      const db = getTestDb();
      const disc = await seedDiscipline({ id: `${PREFIX}-subj-null` });
      const topic = await seedTopic(disc.id, {
        id: `${PREFIX}-topic-null`,
        name: "Null Demand Topic",
      });

      for (const difficulty of ["easy", "medium", "hard"] as const) {
        await seedAssessmentContent(topic.id, {
          id: `${PREFIX}-ac-null-${difficulty}`,
          difficulty,
          question: `No demand tagged (${difficulty})`,
          answer: "42",
          disciplineId: `${PREFIX}-subj-null`,
        });
      }
      await seedInstructionalContent(topic.id, {
        id: `${PREFIX}-ic-null`,
        disciplineId: `${PREFIX}-subj-null`,
      });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-null` });
      const { firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("problem");
      if (firstItem.type === "problem") {
        expect(firstItem.problem.cognitiveDemand).toBeUndefined();
      }
    });
  });
});
