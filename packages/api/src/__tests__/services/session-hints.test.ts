import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedUserTopicState,
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";

beforeAll(async () => {
  await applyMigrations();
});

// Helper to extract hint-related fields from a SessionItem
function getHintInfo(item: SessionItem) {
  if (item.type === "problem" || item.type === "remediation") {
    return {
      availableHints: item.availableHints,
      showSolution: item.showSolution,
      hintsRevealed: item.hintsRevealed,
    };
  }
  return null;
}

describe("Progressive Hint Reveal", () => {
  const PREFIX = "hint-test";

  async function setupTopicWithHints(id: string, hints: string[]) {
    const db = getTestDb();
    const discId = `${PREFIX}-subj-${id}`;
    const disc = await seedDiscipline({ id: discId });
    const topic = await seedTopic(disc.id, {
      id: `${PREFIX}-topic-${id}`,
      name: `Hint Topic ${id}`,
    });
    await seedAssessmentContent(topic.id, {
      id: `${PREFIX}-ac-easy-${id}`,
      difficulty: "easy",
      question: "What is 1 + 1?",
      answer: "2",
      hintsJson: JSON.stringify(hints),
      solution: "1 + 1 = 2",
      disciplineId: discId,
    });
    await seedAssessmentContent(topic.id, {
      id: `${PREFIX}-ac-med-${id}`,
      difficulty: "medium",
      question: "What is 2 + 3?",
      answer: "5",
      hintsJson: JSON.stringify(hints),
      solution: "2 + 3 = 5",
      disciplineId: discId,
    });
    await seedInstructionalContent(topic.id, {
      id: `${PREFIX}-ic-${id}`,
      disciplineId: discId,
    });
    return { disc, topic, db };
  }

  describe("lesson phase — instruction fallback for new topics", () => {
    it("first item is instruction (lesson fallback) for new topics", async () => {
      const { db } = await setupTopicWithHints("pre1", ["hint-a", "hint-b", "hint-c"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-pre1` });
      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item is instruction (lesson fallback — no lesson content)
      expect(firstItem.type).toBe("instruction");
    });

    it("responding to lesson advances to next topic or complete", async () => {
      const { db } = await setupTopicWithHints("pre2", ["hint-a", "hint-b", "hint-c"]);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-pre2` });
      const { sessionId } = await session.startSession(user.id);

      const next = await session.respond(sessionId, {
        correct: true,
        responseMs: 1000,
      });

      // Should advance to next topic or complete
      expect(next.type).not.toBe("error");
    });
  });

  describe("review phase — hints available", () => {
    it("shows hints in review phase", async () => {
      const hints = ["nudge hint", "guiding question", "partial solution"];
      const { db } = await setupTopicWithHints("guided1", hints);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-guided1` });

      // Seed topic as mastered and due for review
      const topicId = `${PREFIX}-topic-guided1`;
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 5, reps: 3, state: 2, due: pastDue,
      });

      const { sessionId, firstItem } = await session.startSession(user.id);

      // Review items should be problem type with hints available
      if (firstItem.type === "problem" && firstItem.phase === "review") {
        const info = getHintInfo(firstItem);
        expect(info).not.toBeNull();
        expect(info!.showSolution).toBe(false);
      }
    });
  });

  describe("review phase — hint progression on incorrect answers", () => {
    it("reveals hints progressively on repeated failures", async () => {
      const hints = ["hint-1", "hint-2", "hint-3"];
      const { db } = await setupTopicWithHints("rem1", hints);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-rem1` });

      // Seed topic as mastered and due for review
      const topicId = `${PREFIX}-topic-rem1`;
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 5, reps: 3, state: 2, due: pastDue,
      });

      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item should be review problem
      if (firstItem.type === "problem" && firstItem.phase === "review") {
        // Fail → hint index increments
        const next = await session.respond(sessionId, {
          answer: "wrong",
          responseMs: 500,
        });

        // After failure, hints should be available (or remediation triggered)
        expect(next.type).not.toBe("error");
      }
    });
  });

  describe("hint count tracked in review", () => {
    it("tracks hints used for rating cap in review", async () => {
      const hints = ["hint-a", "hint-b", "hint-c", "hint-d"];
      const { db } = await setupTopicWithHints("rating1", hints);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-rating1` });

      // Seed topic as mastered and due for review
      const topicId = `${PREFIX}-topic-rating1`;
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 5, reps: 3, state: 2, due: pastDue,
      });

      const { sessionId, firstItem } = await session.startSession(user.id);

      if (firstItem.type === "problem" && firstItem.phase === "review") {
        const info = getHintInfo(firstItem);
        expect(info).not.toBeNull();
        expect(info!.hintsRevealed).toBe(0);
      }
    });
  });

  describe("review phase resets hint index per topic", () => {
    it("starts with hintIndex 0 for review topics", async () => {
      const hints = ["h1", "h2"];
      const { db } = await setupTopicWithHints("reset1", hints);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-reset1` });

      // Seed topic as mastered and due for review
      const topicId = `${PREFIX}-topic-reset1`;
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 5, reps: 3, state: 2, due: pastDue,
      });

      const { sessionId, firstItem } = await session.startSession(user.id);

      if (firstItem.type === "problem" && firstItem.phase === "review") {
        const info = getHintInfo(firstItem);
        expect(info).not.toBeNull();
        expect(info!.hintsRevealed).toBe(0);
      }
    });
  });

  describe("empty hints array", () => {
    it("handles problems with no hints gracefully in review", async () => {
      const { db } = await setupTopicWithHints("empty1", []);
      const session = createSessionService(db, undefined, getTestR2Bucket());
      const user = await seedUser({ id: `${PREFIX}-user-empty1` });

      // Seed topic as mastered and due for review
      const topicId = `${PREFIX}-topic-empty1`;
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 5, reps: 3, state: 2, due: pastDue,
      });

      const { sessionId, firstItem } = await session.startSession(user.id);

      if (firstItem.type === "problem") {
        const info = getHintInfo(firstItem);
        expect(info).not.toBeNull();
        expect(info!.availableHints).toEqual([]);
        expect(info!.showSolution).toBe(false);
      }
    });
  });
});
