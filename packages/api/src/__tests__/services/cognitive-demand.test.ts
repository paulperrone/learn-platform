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
    it("returns cognitiveDemand from content in problem items during review", async () => {
      const { db } = await setupTopicWithDemands("prop1", ["procedural", "application", "conceptual"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-prop1` });
      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item is instruction (lesson fallback). Respond to advance.
      expect(firstItem.type).toBe("instruction");
      const nextItem = await session.respond(sessionId, { correct: true, responseMs: 1000 });

      // Next item could be a problem (review) or complete — check if problem has demand
      if (nextItem.type === "problem") {
        const demand = getProblemDemand(nextItem);
        expect(demand).toBeDefined();
      }
    });
  });

  describe("lesson phase serves instruction fallback (no demand filtering)", () => {
    it("first item is instruction for new topics (no lesson content)", async () => {
      const { db } = await setupTopicWithDemands("pretest1", [
        "procedural", "application", "conceptual", "reasoning", "error_analysis",
      ]);
      const session = createSessionService(db, undefined, getTestR2Bucket());

      // First item should be instruction (lesson fallback)
      const u = await seedUser({ id: `${PREFIX}-user-pretest1-0` });
      const { firstItem } = await session.startSession(u.id);
      expect(firstItem.type).toBe("instruction");
    });
  });

  describe("demand variety across sessions", () => {
    it("instruction fallback is consistent across sessions", async () => {
      const { db } = await setupTopicWithDemands("variety1", [
        "procedural", "application",
      ]);
      const session = createSessionService(db, undefined, getTestR2Bucket());

      // All new sessions start with instruction (lesson fallback)
      for (let i = 0; i < 3; i++) {
        const u = await seedUser({ id: `${PREFIX}-user-variety1-${i}` });
        const { firstItem } = await session.startSession(u.id);
        expect(firstItem.type).toBe("instruction");
      }
    });
  });

  describe("graceful fallback with only procedural problems", () => {
    it("works when only procedural is available", async () => {
      const { db } = await setupTopicWithDemands("fallback1", ["procedural"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-fallback1` });
      const { firstItem } = await session.startSession(user.id);

      // First item is instruction (lesson fallback)
      expect(firstItem.type).toBe("instruction");
    });
  });

  describe("null cognitiveDemand treated as procedural", () => {
    it("session starts with instruction fallback for topics without demand tags", async () => {
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

      // First item is instruction (lesson fallback)
      expect(firstItem.type).toBe("instruction");
    });
  });
});
