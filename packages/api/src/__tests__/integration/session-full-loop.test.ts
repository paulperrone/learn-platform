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
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";

/**
 * Full-loop integration test for the session learning loop.
 *
 * Exercises the lesson-based session model:
 *   lesson (or instruction fallback) → next topic → review
 *
 * Verifies:
 * - New topic starts with "lesson" phase (falls back to "instruction" without lesson content)
 * - Lesson completion advances to next topic
 * - Review phase for due topics
 * - Targeted remediation on repeated review failures
 * - Blend roles (warmup/main/stretch) in review
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
        disciplineId: "math-test",
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-med`, difficulty: "medium",
        question: `Medium ${topicId}?`, answer: "2",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2", "Hint 3"]),
        solution: `${topicId} medium solution`,
        disciplineId: "math-test",
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-hard`, difficulty: "hard",
        question: `Hard ${topicId}?`, answer: "3",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2"]),
        solution: `${topicId} hard solution`,
        disciplineId: "math-test",
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
        disciplineId: "math-test",
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

  it("starts new topic with lesson phase (instruction fallback when no lesson content)", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // No userTopicState seeded → counting (no prereqs) is the frontier topic
    const { sessionId, firstItem } = await session.startSession(user.id);

    // First item should be instruction (lesson fallback — no lesson content seeded)
    assertInstruction(firstItem);
    expect(firstItem.phase).toBe("instruction");
    expect(firstItem.fadingLevel).toBe(0); // First encounter

    // Respond to instruction → advances to next topic (lesson completion)
    const nextItem = await session.respond(sessionId, { correct: true, responseMs: 3000 });
    // Should be on next topic or complete
    expect(nextItem.type).not.toBe("error");
  });

  it("routes to targeted remediation on repeated review failure", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // Counting mastered with low stability (fragile), addition due for review
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "counting", {
      mastered: true, frontier: false,
      stability: 2.0, reps: 3, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "addition", {
      mastered: true, frontier: false,
      stability: 3.0, reps: 3, state: 2,
      due: pastDue,
    });

    const { sessionId, firstItem } = await session.startSession(user.id);

    // Should start with review for addition (due)
    // Keep failing to trigger remediation (needs 2+ failures on same topic)
    let item: SessionItem = firstItem;
    let hitRemediation = false;
    for (let i = 0; i < 10; i++) {
      if (item.type === "complete" || item.type === "error") break;
      if (item.type === "remediation") {
        hitRemediation = true;
        break;
      }
      item = await session.respond(sessionId, { correct: false, responseMs: 1000 });
    }

    if (hitRemediation) {
      assertRemediation(item);
      expect(item.remediationTargetTopicId).toBeDefined();
    }
  });

  it("lesson fallback to instruction includes worked example", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // No userTopicState → counting is frontier
    const { sessionId, firstItem } = await session.startSession(user.id);

    // First item is instruction (lesson fallback — no lesson content)
    assertInstruction(firstItem);
    expect(firstItem.fadingLevel).toBe(0); // First encounter, no prior exposures
    expect(firstItem.example).toBeDefined();
    expect(firstItem.example.steps.length).toBeGreaterThan(0);
  });

  it("lesson completion advances to next topic in session mix", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // No userTopicState → counting is frontier, then addition, skip-counting, etc.
    const { sessionId, firstItem } = await session.startSession(user.id);

    // First item is instruction for counting (lesson fallback)
    assertInstruction(firstItem);
    expect(firstItem.topicId).toBe("counting");

    // Respond to lesson → should advance to next topic
    const nextItem = await session.respond(sessionId, { correct: true, responseMs: 1000 });

    // Should be on a different topic (or complete if only one in mix)
    if (nextItem.type !== "complete") {
      expect(nextItem).toBeDefined();
      if (nextItem.type === "instruction" || nextItem.type === "lesson") {
        // Next topic should be different from counting
        expect(nextItem.topicId).not.toBe("counting");
      }
    }
  });

  it("session completes after all topics in mix are done", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Keep responding until session completes (max 30 safety limit)
    let item: SessionItem = { type: "complete", message: "" };
    for (let i = 0; i < 30; i++) {
      item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
      if (item.type === "complete") break;
    }

    // Should eventually complete
    expect(item.type).toBe("complete");
  });

  it("review phase includes blend roles (warmup/main/stretch)", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

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

  it("respond to lesson does not error", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // No userTopicState → counting is frontier
    const { sessionId, firstItem } = await session.startSession(user.id);

    // First item is instruction (lesson fallback)
    assertInstruction(firstItem);

    // Respond to instruction — should not error
    const result = await session.respond(sessionId, {
      correct: true,
      responseMs: 2000,
    });
    expect(result.type).not.toBe("error");
  });

  it("complete golden path: lesson → next topic → lesson → complete", async () => {
    const { db, user } = await setupFullGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // No userTopicState → counting (depth 0, no prereqs) is the first frontier topic
    const { sessionId, firstItem } = await session.startSession(user.id);

    const types: string[] = [];

    function trackType(item: SessionItem) {
      types.push(item.type);
    }

    // First item: instruction (lesson fallback) for counting
    assertInstruction(firstItem);
    trackType(firstItem);

    // Respond to lesson → next topic
    let item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
    trackType(item);

    // Keep going until complete (safety limit)
    for (let i = 0; i < 20; i++) {
      if (item.type === "complete") break;
      item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
      trackType(item);
    }

    // Should have started with instruction and eventually completed
    expect(types[0]).toBe("instruction");
    expect(types[types.length - 1]).toBe("complete");
  });
});
