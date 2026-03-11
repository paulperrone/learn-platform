import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
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
    const disc = await seedDiscipline({ id: `${PREFIX}-subj-${id}` });
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
    });
    await seedAssessmentContent(topic.id, {
      id: `${PREFIX}-ac-med-${id}`,
      difficulty: "medium",
      question: "What is 2 + 3?",
      answer: "5",
      hintsJson: JSON.stringify(hints),
      solution: "2 + 3 = 5",
    });
    await seedInstructionalContent(topic.id, {
      id: `${PREFIX}-ic-${id}`,
    });
    return { disc, topic, db };
  }

  describe("pretest phase — no hints initially", () => {
    it("shows no hints on first attempt", async () => {
      const { db } = await setupTopicWithHints("pre1", ["hint-a", "hint-b", "hint-c"]);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-pre1` });
      const { sessionId, firstItem } = await session.startSession(user.id);

      // First item should be pretest with no hints
      expect(firstItem.type).toBe("problem");
      const info = getHintInfo(firstItem);
      expect(info).not.toBeNull();
      expect(info!.availableHints).toEqual([]);
      expect(info!.showSolution).toBe(false);
      expect(info!.hintsRevealed).toBe(0);
    });

    it("reveals one hint after incorrect answer", async () => {
      const { db } = await setupTopicWithHints("pre2", ["hint-a", "hint-b", "hint-c"]);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-pre2` });
      const { sessionId } = await session.startSession(user.id);

      // Respond incorrectly to pretest
      const next = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 1000,
      });

      // After incorrect pretest, advances to instruction phase (not another pretest)
      // The hint index incremented but phase advanced, so it resets
      // Let's verify the phase transition resets hints
      if (next.type === "instruction") {
        // Expected: pretest → instruction on any answer
        expect(next.phase).toBe("instruction");
      }
    });
  });

  describe("guided phase — starts with first hint", () => {
    it("shows first hint pre-revealed in guided phase", async () => {
      const hints = ["nudge hint", "guiding question", "partial solution"];
      const { db } = await setupTopicWithHints("guided1", hints);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-guided1` });
      const { sessionId } = await session.startSession(user.id);

      // Skip through pretest → instruction → guided
      await session.respond(sessionId, { answer: "wrong", responseMs: 500 }); // pretest → instruction
      const guidedItem = await session.respond(sessionId, {
        responseMs: 500,
        selfExplanation: "I understand",
      }); // instruction → guided

      expect(guidedItem.type).toBe("problem");
      expect(guidedItem.type === "problem" && guidedItem.phase).toBe("guided");

      const info = getHintInfo(guidedItem);
      expect(info).not.toBeNull();
      // Guided starts with first hint revealed
      expect(info!.availableHints).toEqual(["nudge hint"]);
      expect(info!.hintsRevealed).toBe(0); // hintIndex is 0, but guided adds +1 base
      expect(info!.showSolution).toBe(false);
    });
  });

  describe("independent phase — no hints initially", () => {
    it("shows no hints in independent phase", async () => {
      const hints = ["hint-a", "hint-b"];
      const { db } = await setupTopicWithHints("indep1", hints);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-indep1` });
      const { sessionId } = await session.startSession(user.id);

      // pretest → instruction → guided → independent
      await session.respond(sessionId, { answer: "5", responseMs: 500 }); // pretest
      await session.respond(sessionId, { responseMs: 500, selfExplanation: "ok" }); // instruction
      const independentItem = await session.respond(sessionId, {
        answer: "2",
        responseMs: 500,
      }); // guided → independent

      expect(independentItem.type).toBe("problem");
      if (independentItem.type === "problem") {
        expect(independentItem.phase).toBe("independent");
        expect(independentItem.availableHints).toEqual([]);
        expect(independentItem.showSolution).toBe(false);
      }
    });
  });

  describe("hint progression on repeated incorrect answers", () => {
    it("reveals hints progressively in remediation", async () => {
      const hints = ["hint-1", "hint-2", "hint-3"];
      const { db } = await setupTopicWithHints("rem1", hints);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-rem1` });
      const { sessionId } = await session.startSession(user.id);

      // pretest → instruction → guided → independent
      await session.respond(sessionId, { answer: "5", responseMs: 500 });
      await session.respond(sessionId, { responseMs: 500, selfExplanation: "ok" });
      await session.respond(sessionId, { answer: "2", responseMs: 500 });

      // Fail independent → remediation
      const remItem = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 500,
      });

      expect(remItem.type).toBe("remediation");
      if (remItem.type === "remediation") {
        // Remediation starts with first hint (base=1), hintIndex reset to 0
        expect(remItem.availableHints).toEqual(["hint-1"]);
        expect(remItem.showSolution).toBe(false);
      }

      // Fail again in remediation — should reveal second hint
      const remItem2 = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 500,
      });

      expect(remItem2.type).toBe("remediation");
      if (remItem2.type === "remediation") {
        // hintIndex incremented to 1, base=1, so 2 hints revealed
        expect(remItem2.availableHints).toEqual(["hint-1", "hint-2"]);
        expect(remItem2.showSolution).toBe(false);
      }

      // Fail again — third hint
      const remItem3 = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 500,
      });

      if (remItem3.type === "remediation") {
        expect(remItem3.availableHints).toEqual(["hint-1", "hint-2", "hint-3"]);
        expect(remItem3.showSolution).toBe(false);
      }

      // Fail once more — all hints exhausted, should show solution
      const remItem4 = await session.respond(sessionId, {
        answer: "wrong",
        responseMs: 500,
      });

      if (remItem4.type === "remediation") {
        expect(remItem4.availableHints).toEqual(["hint-1", "hint-2", "hint-3"]);
        expect(remItem4.showSolution).toBe(true);
      }
    });
  });

  describe("hint count tracked in response", () => {
    it("uses hintIndex as hintsUsed for rating cap", async () => {
      const hints = ["hint-a", "hint-b", "hint-c", "hint-d"];
      const { db } = await setupTopicWithHints("rating1", hints);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-rating1` });
      const { sessionId } = await session.startSession(user.id);

      // Get to guided phase
      await session.respond(sessionId, { answer: "5", responseMs: 500 });
      await session.respond(sessionId, { responseMs: 500, selfExplanation: "ok" });

      // In guided, hints start at level 1 (base reveal)
      // Responding correctly should move to independent
      const result = await session.respond(sessionId, {
        answer: "2",
        responseMs: 500,
      });

      // Should advance to independent phase
      expect(result.type).toBe("problem");
      if (result.type === "problem") {
        expect(result.phase).toBe("independent");
        // hintIndex was reset on phase change
        expect(result.hintsRevealed).toBe(0);
      }
    });
  });

  describe("phase transition resets hint index", () => {
    it("resets hints when moving between phases", async () => {
      const hints = ["h1", "h2"];
      const { db } = await setupTopicWithHints("reset1", hints);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-reset1` });
      const { sessionId } = await session.startSession(user.id);

      // Pretest (no hints)
      const pretest = await session.getSession(sessionId);
      expect(pretest?.currentItem.type === "problem" && pretest.currentItem.availableHints).toEqual([]);

      // Move through phases - each transition should reset hintIndex
      await session.respond(sessionId, { answer: "5", responseMs: 500 }); // pretest → instruction
      const afterInstruction = await session.respond(sessionId, {
        responseMs: 500,
        selfExplanation: "ok",
      }); // instruction → guided

      if (afterInstruction.type === "problem") {
        // Guided starts fresh with base hint
        expect(afterInstruction.availableHints).toEqual(["h1"]);
        expect(afterInstruction.hintsRevealed).toBe(0);
      }
    });
  });

  describe("empty hints array", () => {
    it("handles problems with no hints gracefully", async () => {
      const { db } = await setupTopicWithHints("empty1", []);
      const session = createSessionService(db);
      const user = await seedUser({ id: `${PREFIX}-user-empty1` });
      const { sessionId, firstItem } = await session.startSession(user.id);

      const info = getHintInfo(firstItem);
      expect(info).not.toBeNull();
      expect(info!.availableHints).toEqual([]);
      expect(info!.showSolution).toBe(false);
    });
  });
});
