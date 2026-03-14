import { describe, it, expect, beforeAll } from "vitest";
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

      // First item is instruction (lesson fallback — no lesson content)
      expect(firstItem.type).toBe("instruction");
      const info = getFadingInfo(firstItem);
      expect(info).not.toBeNull();
      expect(info!.fadingLevel).toBe(0);
      expect(info!.message).toContain("Study this example carefully");
    });
  });

  describe("lesson fallback always starts at fadingLevel 0", () => {
    it("returns fadingLevel 0 even with prior instruction exposures", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("fade-1");
      const user = await seedUser({ id: `${PREFIX}-user-fade-1` });

      // Seed 1 prior instruction review log entry
      await seedReviewLog(user.id, topic.id, { phase: "instruction" });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // Lesson fallback always returns fadingLevel 0
      expect(firstItem.type).toBe("instruction");
      const info = getFadingInfo(firstItem);
      expect(info!.fadingLevel).toBe(0);
    });

    it("returns fadingLevel 0 regardless of exposure count", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("fade-2");
      const user = await seedUser({ id: `${PREFIX}-user-fade-2` });

      // Seed 2 prior instruction exposures
      await seedReviewLog(user.id, topic.id, { phase: "instruction", id: `${PREFIX}-rev-2a` });
      await seedReviewLog(user.id, topic.id, { phase: "instruction", id: `${PREFIX}-rev-2b` });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // Lesson fallback always returns fadingLevel 0
      expect(firstItem.type).toBe("instruction");
      expect(getFadingInfo(firstItem)!.fadingLevel).toBe(0);
    });
  });

  describe("lesson fallback includes worked example steps", () => {
    it("returns full 4-step example via lesson fallback", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("cap-4");
      const user = await seedUser({ id: `${PREFIX}-user-cap-4` });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("instruction");
      const info = getFadingInfo(firstItem);
      expect(info!.fadingLevel).toBe(0);
      expect(info!.stepsCount).toBe(4);
    });

    it("returns 2-step example via lesson fallback", async () => {
      const db = getTestDb();
      const twoSteps = JSON.stringify([
        { subgoalLabel: "Step 1", instruction: "Do this", work: "Work 1", explanation: "Explain 1" },
        { subgoalLabel: "Step 2", instruction: "Do that", work: "Work 2", explanation: "Explain 2" },
      ]);
      const { topic } = await setupTopicWithSteps("cap-2", twoSteps);
      const user = await seedUser({ id: `${PREFIX}-user-cap-2` });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("instruction");
      expect(getFadingInfo(firstItem)!.stepsCount).toBe(2);
      expect(getFadingInfo(firstItem)!.fadingLevel).toBe(0);
    });
  });

  describe("lesson fallback consistency", () => {
    it("lesson fallback always returns fadingLevel 0 regardless of stability", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("stab-1");
      const user = await seedUser({ id: `${PREFIX}-user-stab-1` });

      // Seed prior exposure
      await seedReviewLog(user.id, topic.id, { phase: "instruction" });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // Lesson fallback always fadingLevel 0
      expect(firstItem.type).toBe("instruction");
      expect(getFadingInfo(firstItem)!.fadingLevel).toBe(0);
    });

    it("lesson fallback returns instruction type with example content", async () => {
      const db = getTestDb();
      const { topic } = await setupTopicWithSteps("stab-low");
      const user = await seedUser({ id: `${PREFIX}-user-stab-low` });

      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      expect(firstItem.type).toBe("instruction");
      const info = getFadingInfo(firstItem);
      expect(info).not.toBeNull();
      expect(info!.fadingLevel).toBe(0);
      expect(info!.stepsCount).toBeGreaterThan(0);
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

      // Anonymous sessions start at lesson phase (instruction fallback)
      expect(firstItem.type).toBe("instruction");
      if (firstItem.type === "instruction") {
        expect(firstItem.fadingLevel).toBe(0);
      }
    });
  });

  describe("fading metadata on SessionItem", () => {
    it("instruction SessionItem includes fadingLevel field", async () => {
      const db = getTestDb();
      await setupTopicWithSteps("meta-1");
      const user = await seedUser({ id: `${PREFIX}-user-meta-1` });
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item is instruction (lesson fallback)
      expect(firstItem.type).toBe("instruction");
      if (firstItem.type === "instruction") {
        expect(typeof firstItem.fadingLevel).toBe("number");
        expect(firstItem.fadingLevel).toBeGreaterThanOrEqual(0);
        expect(firstItem.example).toBeDefined();
        expect(firstItem.example.steps.length).toBeGreaterThan(0);
      }
    });
  });
});
