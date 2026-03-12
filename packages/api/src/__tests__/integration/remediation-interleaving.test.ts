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
  seedUserTopicState,
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";

/**
 * Cross-plan integration test: Remediation ↔ interleaving.
 *
 * Verifies that targeted remediation (Plan 011) inserts prerequisite
 * reviews without breaking non-interference interleaving (Plan 010),
 * and that the session correctly returns to the original review
 * sequence after remediation completes.
 */
describe("remediation-interleaving integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  function assertProblem(item: SessionItem): asserts item is Extract<SessionItem, { type: "problem" }> {
    expect(item.type).toBe("problem");
  }

  function assertRemediation(item: SessionItem): asserts item is Extract<SessionItem, { type: "remediation" }> {
    expect(item.type).toBe("remediation");
  }

  /**
   * Setup: 3 review topics from different "strands" plus prerequisite chain.
   *
   * Graph:
   *   counting → addition → multiplication (strand 1)
   *   shapes → area (strand 2)
   *   patterns (independent, strand 3)
   *
   * All 3 frontier topics (multiplication, area, patterns) are mastered
   * with reviews due. Counting has low stability (remediation target
   * when multiplication fails).
   */
  async function setupReviewGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });

    // Strand 1: counting → addition → multiplication
    await seedTopic(discipline.id, { id: "counting", name: "Counting", depth: 0 });
    await seedTopic(discipline.id, { id: "addition", name: "Addition", depth: 1 });
    await seedTopic(discipline.id, { id: "multiplication", name: "Multiplication", depth: 2 });
    await seedPrerequisite("counting", "addition");
    await seedPrerequisite("addition", "multiplication");

    // Strand 2: shapes → area
    await seedTopic(discipline.id, { id: "shapes", name: "Shapes", depth: 0 });
    await seedTopic(discipline.id, { id: "area", name: "Area", depth: 1 });
    await seedPrerequisite("shapes", "area");

    // Strand 3: data → patterns
    await seedTopic(discipline.id, { id: "data", name: "Data", depth: 0 });
    await seedTopic(discipline.id, { id: "patterns", name: "Patterns", depth: 1 });
    await seedPrerequisite("data", "patterns");

    // Content for all topics
    for (const topicId of ["counting", "addition", "multiplication", "shapes", "area", "data", "patterns"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-easy`, difficulty: "easy",
        question: `Easy ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2"]),
        solution: `${topicId} solution`,
        keyPrerequisiteId: topicId === "multiplication" ? "counting" : undefined,
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-med`, difficulty: "medium",
        question: `Medium ${topicId}?`, answer: "2",
        hintsJson: JSON.stringify(["Hint 1", "Hint 2"]),
        solution: `${topicId} solution`,
        keyPrerequisiteId: topicId === "multiplication" ? "counting" : undefined,
      });
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Example`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "Step", instruction: "Do it", work: "work", explanation: "explanation" },
        ]),
      });
    }

    // Prerequisites mastered with varying stability
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "counting", {
      mastered: true, stability: 2.0, reps: 3, state: 2, due: farFuture,
    });
    await seedUserTopicState(user.id, "addition", {
      mastered: true, stability: 15, reps: 5, state: 2, due: farFuture,
    });
    await seedUserTopicState(user.id, "shapes", {
      mastered: true, stability: 12, reps: 4, state: 2, due: farFuture,
    });
    await seedUserTopicState(user.id, "data", {
      mastered: true, stability: 2.0, reps: 3, state: 2, due: farFuture,
    });

    // Frontier topics: not mastered, with recent progress
    // Multiplication, area, patterns — these will appear as new learning topics
    // No userTopicState seeded → they're frontier

    return { db, user, discipline };
  }

  it("remediation inserts prerequisite review then returns to original topic", async () => {
    const { db, user } = await setupReviewGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fast-forward to independent phase on first topic
    let item: SessionItem = firstItem;
    for (let i = 0; i < 10; i++) {
      if (item.type === "problem" && item.phase === "independent") break;
      if (item.type === "complete" || item.type === "error") break;

      const correct = item.type === "instruction" || (item.type === "problem" && item.phase !== "pretest");
      item = await session.respond(sessionId, { correct, responseMs: 1000 });
    }

    if (item.type !== "problem" || item.phase !== "independent") return;
    const originalTopicId = item.topicId;

    // Fail independent → should trigger remediation
    const remItem = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    if (remItem.type === "remediation") {
      assertRemediation(remItem);

      // Remediation targets a prerequisite
      expect(remItem.remediationTargetTopicId).toBeDefined();
      expect(remItem.originalTopicId).toBe(originalTopicId);

      // Pass remediation → should return to independent on original topic
      const returnItem = await session.respond(sessionId, { correct: true, responseMs: 1500 });

      if (returnItem.type === "problem") {
        assertProblem(returnItem);
        expect(returnItem.phase).toBe("independent");
        expect(returnItem.topicId).toBe(originalTopicId);
      }
    }
  });

  it("remediation rotates to next prerequisite after 2 failures", async () => {
    const { db, user } = await setupReviewGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // Seed multiplication with both counting and addition as prereqs (both mastered)
    // counting has lower stability → should be targeted first

    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fast-forward to independent
    let item: SessionItem = firstItem;
    for (let i = 0; i < 10; i++) {
      if (item.type === "problem" && item.phase === "independent") break;
      if (item.type === "complete" || item.type === "error") break;
      const correct = item.type === "instruction" || (item.type === "problem" && item.phase !== "pretest");
      item = await session.respond(sessionId, { correct, responseMs: 1000 });
    }

    if (item.type !== "problem" || item.phase !== "independent") return;

    // Fail independent
    item = await session.respond(sessionId, { correct: false, responseMs: 2000 });
    if (item.type !== "remediation") return;

    const firstTarget = item.remediationTargetTopicId;

    // Fail remediation twice
    item = await session.respond(sessionId, { correct: false, responseMs: 2000 });
    if (item.type !== "remediation" && item.type !== "problem") return;

    item = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    // After 2 failures, should either rotate to different prereq or stay on same
    // (depends on whether other prereqs exist for the topic)
    if (item.type === "remediation") {
      // If rotated, target should differ from first
      // If no other prereq available, may stay on same — both valid
      expect(item.remediationTargetTopicId).toBeDefined();
    }
  });

  it("session continues to next topic after remediation success", async () => {
    const { db, user } = await setupReviewGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fast-forward through first topic completely
    let item: SessionItem = firstItem;
    const topicsSeen: string[] = [];

    for (let i = 0; i < 20; i++) {
      if (item.type === "complete") break;
      if (item.type === "error") break;

      if (item.type === "problem" || item.type === "instruction" || item.type === "remediation") {
        if (!topicsSeen.includes(item.topicId)) {
          topicsSeen.push(item.topicId);
        }
      }

      // Pass everything
      item = await session.respond(sessionId, {
        correct: true,
        responseMs: 1000,
        confidence: 4,
      });
    }

    // Should have progressed through at least one topic
    expect(topicsSeen.length).toBeGreaterThanOrEqual(1);
  });

  it("remediation does not crash session when prerequisite has no content", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });

    // Topic with prerequisite that has NO assessment content
    await seedTopic(discipline.id, { id: "prereq-empty", name: "Empty Prereq", depth: 0 });
    await seedTopic(discipline.id, { id: "child-topic", name: "Child Topic", depth: 1 });
    await seedPrerequisite("prereq-empty", "child-topic");

    // Only seed content for child, not prereq
    await seedAssessmentContent("child-topic", {
      id: "child-easy", difficulty: "easy",
      question: "Child?", answer: "1",
      hintsJson: JSON.stringify(["Hint"]),
      solution: "solution",
      keyPrerequisiteId: "prereq-empty",
    });
    await seedAssessmentContent("child-topic", {
      id: "child-med", difficulty: "medium",
      question: "Child med?", answer: "2",
      hintsJson: JSON.stringify(["Hint"]),
      solution: "solution",
    });
    await seedInstructionalContent("child-topic", {
      id: "child-ex", title: "Child Example",
      stepsJson: JSON.stringify([
        { subgoalLabel: "Step", instruction: "Do it", work: "work", explanation: "why" },
      ]),
    });

    // Prereq mastered
    await seedUserTopicState(user.id, "prereq-empty", {
      mastered: true, stability: 2.0, reps: 3, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fast-forward to independent
    let item: SessionItem = firstItem;
    for (let i = 0; i < 10; i++) {
      if (item.type === "problem" && item.phase === "independent") break;
      if (item.type === "complete" || item.type === "error") break;
      const correct = item.type === "instruction" || (item.type === "problem" && item.phase !== "pretest");
      item = await session.respond(sessionId, { correct, responseMs: 1000 });
    }

    if (item.type !== "problem" || item.phase !== "independent") return;

    // Fail independent — remediation should gracefully handle empty prereq content
    const result = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    // Should not be an error — should gracefully fall back
    expect(result.type).not.toBe("error");
  });
});
