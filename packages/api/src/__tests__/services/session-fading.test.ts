import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedReviewLog,
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

const PREFIX = "fade-test";

function getFadingInfo(item: SessionItem) {
  if (item.type === "instruction") {
    return {
      fadingLevel: item.fadingLevel,
      stepsCount: item.example.steps.length,
      message: item.message,
    };
  }
  return null;
}

const MULTI_STEP_EXAMPLE = JSON.stringify([
  { subgoalLabel: "Identify", instruction: "Find the numbers", work: "2 and 3", explanation: "We need to add these." },
  { subgoalLabel: "Add ones", instruction: "Add the ones place", work: "2 + 3 = 5", explanation: "Simple addition." },
  { subgoalLabel: "Check", instruction: "Verify the answer", work: "5 is correct", explanation: "Count to confirm." },
  { subgoalLabel: "Write answer", instruction: "Write the final answer", work: "Answer: 5", explanation: "We're done." },
]);

async function setupTopicWithSteps(id: string, stepsJson = MULTI_STEP_EXAMPLE) {
  const discId = `${PREFIX}-subj-${id}`;
  const disc = await seedDiscipline({ id: discId });
  const topic = await seedTopic(disc.id, {
    id: `${PREFIX}-topic-${id}`,
    name: `Fading Topic ${id}`,
  });
  await seedAssessmentContent(topic.id, {
    id: `${PREFIX}-ac-easy-${id}`,
    difficulty: "easy",
    disciplineId: discId,
  });
  await seedAssessmentContent(topic.id, {
    id: `${PREFIX}-ac-med-${id}`,
    difficulty: "medium",
    disciplineId: discId,
  });
  await seedInstructionalContent(topic.id, {
    id: `${PREFIX}-ic-${id}`,
    stepsJson,
    disciplineId: discId,
  });
  return { disc, topic };
}

describe("Worked Example Fading", () => {
  describe("first encounter shows full example (fadingLevel = 0)", () => {
    it("returns fadingLevel 0 with no prior exposure", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("first-0");
      const user = await seedUser({ id: `${PREFIX}-user-first-0` });
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item is pretest; respond to advance to instruction
      expect(firstItem.type).toBe("problem");
      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      const info = getFadingInfo(instructionItem);
      expect(info).not.toBeNull();
      expect(info!.fadingLevel).toBe(0);
      expect(info!.message).toContain("Study this example carefully");
    });
  });

  describe("subsequent encounters fade progressively", () => {
    it("returns fadingLevel 1 after one prior instruction exposure", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("fade-1");
      const user = await seedUser({ id: `${PREFIX}-user-fade-1` });

      // Seed 1 prior instruction review log entry
      await seedReviewLog(user.id, topic.id, { phase: "instruction" });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // Advance past pretest to instruction
      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      const info = getFadingInfo(instructionItem);
      expect(info!.fadingLevel).toBe(1);
      expect(info!.message).toContain("Fill in the missing steps");
    });

    it("returns fadingLevel 2 after two prior exposures", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("fade-2");
      const user = await seedUser({ id: `${PREFIX}-user-fade-2` });

      // Seed 2 prior instruction exposures
      await seedReviewLog(user.id, topic.id, { phase: "instruction", id: `${PREFIX}-rev-2a` });
      await seedReviewLog(user.id, topic.id, { phase: "instruction", id: `${PREFIX}-rev-2b` });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);
      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      expect(getFadingInfo(instructionItem)!.fadingLevel).toBe(2);
    });
  });

  describe("fading capped at steps.length - 1", () => {
    it("caps fading level for 4-step example at 3", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("cap-4");
      const user = await seedUser({ id: `${PREFIX}-user-cap-4` });

      // Seed 10 prior exposures — should cap at 3 (4 steps - 1)
      for (let i = 0; i < 10; i++) {
        await seedReviewLog(user.id, topic.id, {
          phase: "instruction",
          id: `${PREFIX}-rev-cap-${i}`,
        });
      }

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);
      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      const info = getFadingInfo(instructionItem);
      expect(info!.fadingLevel).toBe(3); // max fade for 4-step example
      expect(info!.message).toContain("Try to complete each step on your own");
    });

    it("caps at 1 for a 2-step example", async () => {
      const db = getTestDb();
      const twoSteps = JSON.stringify([
        { subgoalLabel: "Step 1", instruction: "Do this", work: "Work 1", explanation: "Explain 1" },
        { subgoalLabel: "Step 2", instruction: "Do that", work: "Work 2", explanation: "Explain 2" },
      ]);
      const { topic } = await setupTopicWithSteps("cap-2", twoSteps);
      const user = await seedUser({ id: `${PREFIX}-user-cap-2` });

      // Seed 5 prior exposures — should cap at 1
      for (let i = 0; i < 5; i++) {
        await seedReviewLog(user.id, topic.id, {
          phase: "instruction",
          id: `${PREFIX}-rev-cap2-${i}`,
        });
      }

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);
      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      expect(getFadingInfo(instructionItem)!.fadingLevel).toBe(1);
    });
  });

  describe("FSRS stability modifier", () => {
    it("adds +1 fading level when stability > 14 days", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("stab-1");
      const user = await seedUser({ id: `${PREFIX}-user-stab-1` });

      // Seed 1 prior instruction exposure → base fading = 1
      await seedReviewLog(user.id, topic.id, { phase: "instruction" });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);

      // Respond to pretest → advances to instruction (scheduleReview creates UTS)
      const firstInstruction = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });
      expect(firstInstruction.type).toBe("instruction");

      // Now update UTS to have high stability (simulating prior mastery)
      await db
        .update(schema.userTopicState)
        .set({ stability: 30 })
        .where(
          and(
            eq(schema.userTopicState.userId, user.id),
            eq(schema.userTopicState.topicId, topic.id),
          ),
        );

      // Re-fetch session to get instruction item with updated stability
      const sessionData = await session.getSession(sessionId);
      expect(sessionData).not.toBeNull();
      expect(sessionData!.currentItem.type).toBe("instruction");
      // 1 (exposure) + 1 (stability > 14) = 2
      expect(getFadingInfo(sessionData!.currentItem)!.fadingLevel).toBe(2);
    });

    it("does not add modifier when stability <= 14 days", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("stab-low");
      const user = await seedUser({ id: `${PREFIX}-user-stab-low` });

      await seedReviewLog(user.id, topic.id, { phase: "instruction" });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);

      // Respond to pretest → advances to instruction
      const firstInstruction = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });
      expect(firstInstruction.type).toBe("instruction");

      // UTS was created by scheduleReview with low stability (new topic, wrong answer)
      // Verify fading is just from exposure, no stability bonus
      expect(getFadingInfo(firstInstruction)!.fadingLevel).toBe(1); // just exposure, no stability bonus
    });
  });

  describe("anonymous sessions always get full examples", () => {
    it("returns fadingLevel 0 for anonymous users", async () => {
      const db = getTestDb();
      await setupTopicWithSteps("anon-1");
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startAnonymousSession(
        `${PREFIX}-anon-token-1`,
      );

      // Anonymous sessions start at pretest; respond to get to instruction
      if (firstItem.type === "problem") {
        const instructionItem = await session.respond(sessionId, {
          answer: "wrong",
          responseMs: 1000,
        });
        if (instructionItem.type === "instruction") {
          expect(instructionItem.fadingLevel).toBe(0);
        }
      }
    });
  });

  describe("fading metadata on SessionItem", () => {
    it("instruction SessionItem includes fadingLevel field", async () => {
      const db = getTestDb();
      await setupTopicWithSteps("meta-1");
      const user = await seedUser({ id: `${PREFIX}-user-meta-1` });
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId } = await session.startSession(user.id);

      const instructionItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      expect(instructionItem.type).toBe("instruction");
      if (instructionItem.type === "instruction") {
        expect(typeof instructionItem.fadingLevel).toBe("number");
        expect(instructionItem.fadingLevel).toBeGreaterThanOrEqual(0);
        expect(instructionItem.example).toBeDefined();
        expect(instructionItem.example.steps.length).toBeGreaterThan(0);
      }
    });
  });
});
