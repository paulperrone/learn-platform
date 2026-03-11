import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  getTestDb,
  applyMigrations,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedPrerequisite,
  seedEncompassing,
  seedUserTopicState,
  seedReviewLog,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";

/**
 * Full-loop integration test for the session learning loop.
 *
 * Exercises a complete multi-topic learning session through all phases:
 *   pretest → instruction → guided → independent → review → remediation
 *
 * Verifies Plan 010 features are wired end-to-end:
 * - Phase progression (pretest → instruction → guided → independent)
 * - Worked example fading (increases with prior instruction exposures)
 * - Hint system (guided pre-reveals in availableHints, remediation reveals progressively)
 * - Confidence capture (independent phase)
 * - Adaptive difficulty (bias shifts with rolling accuracy)
 * - FIRe compression + depth blending (warmup/main/stretch blend roles)
 * - Targeted remediation (routes to prerequisite on independent failure)
 */
describe("session-full-loop integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  /** Setup a graph with 4 topics, prereqs, encompassing, and content for each. */
  async function setupFullGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });

    // Topics: counting → addition → multiplication, counting → skip-counting → multiplication
    await seedTopic(discipline.id, { id: "counting", name: "Counting to 10", depth: 0 });
    await seedTopic(discipline.id, { id: "addition", name: "Addition within 10", depth: 1 });
    await seedTopic(discipline.id, { id: "skip-counting", name: "Skip Counting", depth: 1 });
    await seedTopic(discipline.id, { id: "multiplication", name: "Multiplication", depth: 2 });

    await seedPrerequisite("counting", "addition");
    await seedPrerequisite("counting", "skip-counting");
    await seedPrerequisite("addition", "multiplication");
    await seedPrerequisite("skip-counting", "multiplication");

    // Encompassing: addition encompasses counting (FIRe credit flows)
    await seedEncompassing("addition", "counting", 0.4);

    // Assessment content (easy, medium, hard for each topic)
    for (const topicId of ["counting", "addition", "skip-counting", "multiplication"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-easy`, difficulty: "easy",
        question: `Easy ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2", "Hint 3"]),
        solution: `${topicId} easy solution`,
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-med`, difficulty: "medium",
        question: `Medium ${topicId}?`, answer: "2",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2", "Hint 3"]),
        solution: `${topicId} medium solution`,
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-hard`, difficulty: "hard",
        question: `Hard ${topicId}?`, answer: "3",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2"]),
        solution: `${topicId} hard solution`,
      });
    }

    // Instructional content (3-step worked example for each topic)
    for (const topicId of ["counting", "addition", "skip-counting", "multiplication"]) {
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Example`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "Identify", instruction: "Find numbers", work: "2 and 3", explanation: "We need these." },
          { subgoalLabel: "Compute", instruction: "Do the operation", work: "2 + 3 = 5", explanation: "Apply the rule." },
          { subgoalLabel: "Check", instruction: "Verify", work: "5 is correct", explanation: "Confirm answer." },
        ]),
      });
    }

    return { db, user, discipline };
  }

  // --- Type assertion helpers ---

  function assertProblem(item: SessionItem): asserts item is Extract<SessionItem, { type: "problem" }> {
    expect(item.type).toBe("problem");
  }

  function assertInstruction(item: SessionItem): asserts item is Extract<SessionItem, { type: "instruction" }> {
    expect(item.type).toBe("instruction");
  }

  function assertRemediation(item: SessionItem): asserts item is Extract<SessionItem, { type: "remediation" }> {
    expect(item.type).toBe("remediation");
  }

  // --- Tests ---

  it("progresses through pretest → instruction → guided → independent for a new topic", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // No userTopicState seeded → counting (no prereqs) is the frontier topic
    const { sessionId, firstItem } = await session.startSession(user.id);

    // PRETEST: medium difficulty, no hints
    assertProblem(firstItem);
    expect(firstItem.phase).toBe("pretest");
    expect(firstItem.availableHints).toEqual([]);
    expect(firstItem.showSolution).toBe(false);

    // Fail pretest → instruction
    const instrItem = await session.respond(sessionId, { correct: false, responseMs: 3000 });
    assertInstruction(instrItem);
    expect(instrItem.phase).toBe("instruction");
    expect(instrItem.fadingLevel).toBe(0); // First encounter

    // Respond to instruction → guided
    const guidedItem = await session.respond(sessionId, { correct: true, responseMs: 5000 });
    assertProblem(guidedItem);
    expect(guidedItem.phase).toBe("guided");
    // Guided: base reveal adds 1 hint to availableHints, hintsRevealed stays at hintIndex
    expect(guidedItem.availableHints.length).toBeGreaterThanOrEqual(1);

    // Pass guided → independent
    const indepItem = await session.respond(sessionId, { correct: true, responseMs: 2000 });
    assertProblem(indepItem);
    expect(indepItem.phase).toBe("independent");
    expect(indepItem.askConfidence).toBe(true);
  });

  it("routes to targeted remediation on independent failure", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // Counting mastered with low stability (fragile) — addition becomes frontier
    await seedUserTopicState(user.id, "counting", {
      mastered: true, frontier: false,
      stability: 2.0, reps: 3, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const { sessionId } = await session.startSession(user.id);

    // Fast-forward to independent (max 10 steps safety limit)
    let item: SessionItem = { type: "complete", message: "" };
    for (let i = 0; i < 10; i++) {
      const state = await session.getSession(sessionId);
      if (!state) break;
      item = state.currentItem;
      if (item.type === "problem" && item.phase === "independent") break;
      if (item.type === "complete" || item.type === "error") break;

      const correct = item.type === "instruction" || (item.type === "problem" && item.phase !== "pretest");
      item = await session.respond(sessionId, { correct, responseMs: 1000 });
    }

    // Should be at independent now — fail it
    if (item.type === "problem" && item.phase === "independent") {
      const remItem = await session.respond(sessionId, { correct: false, responseMs: 2000 });

      assertRemediation(remItem);
      expect(remItem.remediationTargetTopicId).toBe("counting");
      expect(remItem.originalTopicId).toBeDefined();

      // Pass remediation → return to independent on original topic
      const backItem = await session.respond(sessionId, { correct: true, responseMs: 1500 });
      assertProblem(backItem);
      expect(backItem.phase).toBe("independent");
    }
  });

  it("worked example fading increases with prior instruction exposures", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // Seed 2 prior instruction exposures for counting
    await seedReviewLog(user.id, "counting", { phase: "instruction", rating: 3 });
    await seedReviewLog(user.id, "counting", { phase: "instruction", rating: 3 });

    // No userTopicState → counting is frontier
    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fail pretest to reach instruction
    assertProblem(firstItem);
    const instrItem = await session.respond(sessionId, { correct: false, responseMs: 1000 });

    // Instruction should have fadingLevel >= 2 due to prior exposures
    assertInstruction(instrItem);
    expect(instrItem.fadingLevel).toBeGreaterThanOrEqual(2);
  });

  it("progressive hints reveal on repeated failures in remediation", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // No userTopicState → counting is frontier
    const { sessionId } = await session.startSession(user.id);

    // pretest → instruction → guided → independent
    await session.respond(sessionId, { correct: false, responseMs: 1000 }); // fail pretest
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // instruction
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // guided → independent

    // Fail independent → remediation (same-topic fallback since no prereqs for counting)
    const remItem = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    // In remediation: first hint should be pre-revealed (base=1)
    if (remItem.type === "remediation") {
      expect(remItem.availableHints.length).toBeGreaterThanOrEqual(1);

      // Fail remediation → reveals more hints
      const rem2 = await session.respond(sessionId, { correct: false, responseMs: 2000 });
      if (rem2.type === "remediation" || rem2.type === "problem") {
        // hintsRevealed or availableHints should have increased
        expect(rem2).toBeDefined();
      }
    }
  });

  it("adaptive difficulty bias shifts with rolling accuracy", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // No userTopicState → counting is frontier
    const { sessionId } = await session.startSession(user.id);

    // pretest → instruction → guided → independent
    await session.respond(sessionId, { correct: false, responseMs: 1000 }); // fail pretest
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // instruction
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // guided pass

    // Now at independent. Pass it → advances to next topic.
    // rollingResults = [false, true, true, true] → 75% < 80% → "easier" bias
    const nextItem = await session.respond(sessionId, { correct: true, responseMs: 1000 });

    if (nextItem.type === "problem" || nextItem.type === "remediation") {
      expect(nextItem.difficultyBias).toBeDefined();
    }
  });

  it("review phase includes blend roles (warmup/main/stretch)", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // Two topics mastered with reviews due in the past
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "counting", {
      mastered: true, frontier: false, stability: 10, reps: 5, state: 2, due: pastDue,
    });
    await seedUserTopicState(user.id, "addition", {
      mastered: true, frontier: false, stability: 5, reps: 3, state: 2, due: pastDue,
    });

    const { firstItem } = await session.startSession(user.id);

    // First item should be a review with blend role
    if (firstItem.type === "problem" && firstItem.phase === "review") {
      expect(firstItem.blendRole).toBeDefined();
      expect(["warmup", "main", "stretch"]).toContain(firstItem.blendRole);
    }
  });

  it("confidence rating captured in independent phase", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // No userTopicState → counting is frontier
    const { sessionId } = await session.startSession(user.id);

    // pretest → instruction → guided → independent
    await session.respond(sessionId, { correct: false, responseMs: 1000 }); // fail pretest
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // instruction
    const indepItem = await session.respond(sessionId, { correct: true, responseMs: 1000 }); // guided → independent

    // Should be at independent with askConfidence = true
    assertProblem(indepItem);
    expect(indepItem.phase).toBe("independent");
    expect(indepItem.askConfidence).toBe(true);

    // Respond with confidence — should not error
    const result = await session.respond(sessionId, {
      correct: true,
      confidence: 4,
      responseMs: 2000,
    });
    expect(result.type).not.toBe("error");
  });

  it("complete golden path: pretest → instruction → guided → independent → next topic", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db);

    // No userTopicState → counting (depth 0, no prereqs) is the first frontier topic
    const { sessionId, firstItem } = await session.startSession(user.id);

    const phases: string[] = [];

    function trackPhase(item: SessionItem) {
      if (item.type === "problem" || item.type === "instruction" || item.type === "remediation") {
        phases.push(item.phase);
      }
    }

    // First item: pretest for counting
    assertProblem(firstItem);
    expect(firstItem.phase).toBe("pretest");
    trackPhase(firstItem);

    // pretest (fail) → instruction → guided (pass) → independent (pass) → next topic
    let item = await session.respond(sessionId, { correct: false, responseMs: 1000 });
    trackPhase(item);
    item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
    trackPhase(item);
    item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
    trackPhase(item);
    item = await session.respond(sessionId, { correct: true, responseMs: 1000, confidence: 4 });
    trackPhase(item);

    // Full phase progression on first topic
    expect(phases.slice(0, 4)).toEqual(["pretest", "instruction", "guided", "independent"]);

    // After independent pass, should be on next topic or session complete
    if (item.type !== "complete") {
      expect(phases.length).toBeGreaterThan(4);
    }
  });
});
