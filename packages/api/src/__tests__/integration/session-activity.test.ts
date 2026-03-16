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
import { createActivityService } from "../../services/activity.js";
import { eq, and } from "drizzle-orm";
import * as schema from "../../db/schema.js";

/**
 * Integration test: session loop → activity auto-recording.
 *
 * Verifies Plan 016 Phase 1: session respond() automatically records
 * problems completed, topics mastered, and minutes active into dailyActivity.
 */
describe("session-activity integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });

    await seedTopic(discipline.id, { id: "counting", name: "Counting", depth: 0 });
    await seedTopic(discipline.id, { id: "addition", name: "Addition", depth: 1 });
    await seedPrerequisite("counting", "addition");

    for (const topicId of ["counting", "addition"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-easy`, difficulty: "easy",
        question: `Easy ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["Hint 1"]),
        solution: `${topicId} solution`,
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-med`, difficulty: "medium",
        question: `Medium ${topicId}?`, answer: "2",
        hintsJson: JSON.stringify(["Hint 1"]),
        solution: `${topicId} solution`,
      });
      await seedAssessmentContent(topicId, {
        id: `${topicId}-hard`, difficulty: "hard",
        question: `Hard ${topicId}?`, answer: "3",
        hintsJson: JSON.stringify(["Hint 1"]),
        solution: `${topicId} solution`,
      });
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Example`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "Step", instruction: "Do it", work: "1+1=2", explanation: "Math." },
        ]),
      });
    }

    return { db, user, discipline };
  }

  it("records problemsCompleted in dailyActivity after each respond()", async () => {
    const { db, user } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId, firstItem } = await session.startSession(user.id);
    // First item is instruction (lesson fallback — no lesson content)
    expect(firstItem.type).toBe("instruction");

    // Respond to instruction (lesson completion)
    const result = await session.respond(sessionId, {
      correct: true,
      responseMs: 5000,
    });

    // Check dailyActivity was populated
    const today = new Date().toISOString().slice(0, 10);
    const activity = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, user.id),
        eq(schema.dailyActivity.date, today),
      ))
      .get();

    expect(activity).toBeDefined();
    expect(activity!.problemsCompleted).toBeGreaterThanOrEqual(1);
  });

  it("returns goalProgress in respond() payload", async () => {
    const { db, user } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    const result = await session.respond(sessionId, {
      answer: "1",
      correct: true,
      responseMs: 3000,
    });

    // goalProgress should be attached to the response
    expect((result as any).goalProgress).toBeDefined();
    const gp = (result as any).goalProgress;
    expect(gp.problemsCompleted).toBeGreaterThanOrEqual(1);
    expect(gp.dailyXpGoal).toBeGreaterThan(0);
    expect(typeof gp.progress).toBe("number");
  });

  it("records minutesActive on endSession()", async () => {
    const { db, user } = await setupGraph();

    // Seed counting as mastered so addition is frontier too
    await seedUserTopicState(user.id, "counting", {
      mastered: true, stability: 10, reps: 5, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId } = await session.startSession(user.id);

    // Respond with 90 seconds total (should round up to 2 minutes)
    await session.respond(sessionId, { correct: true, responseMs: 45_000 });
    await session.respond(sessionId, { correct: true, responseMs: 45_000 });

    await session.endSession(sessionId);

    // Wait a tick for the fire-and-forget promise
    await new Promise(r => setTimeout(r, 100));

    const today = new Date().toISOString().slice(0, 10);
    const activity = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, user.id),
        eq(schema.dailyActivity.date, today),
      ))
      .get();

    expect(activity).toBeDefined();
    expect(activity!.minutesActive).toBeGreaterThanOrEqual(1);
  });

  it("multiple atomic sessions in a day accumulate activity", async () => {
    const { db, user, discipline } = await setupGraph();

    // Add a third topic so there are two frontier topics after counting is mastered
    await seedTopic(discipline.id, { id: "subtraction", name: "Subtraction", depth: 1 });
    await seedPrerequisite("counting", "subtraction");
    for (const diff of ["easy", "medium", "hard"] as const) {
      await seedAssessmentContent("subtraction", {
        id: `subtraction-${diff}`, difficulty: diff,
        question: `${diff} subtraction?`, answer: "1",
        hintsJson: JSON.stringify(["Hint 1"]),
        solution: "subtraction solution",
      });
    }
    await seedInstructionalContent("subtraction", {
      id: "subtraction-ex", title: "Subtraction Example",
      stepsJson: JSON.stringify([
        { subgoalLabel: "Step", instruction: "Subtract", work: "3-1=2", explanation: "Math." },
      ]),
    });

    // Seed counting as mastered so addition+subtraction are both frontier
    await seedUserTopicState(user.id, "counting", {
      mastered: true, stability: 10, reps: 5, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // In the pull-based model, each startSession() is one atomic unit (one topic).
    // Multiple sessions in a day accumulate into daily activity.
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // First atomic unit: start + respond to first frontier topic
    const { sessionId: s1 } = await session.startSession(user.id);
    await session.respond(s1, { correct: true, responseMs: 5000 });

    // Second atomic unit: start + respond to second frontier topic
    const { sessionId: s2 } = await session.startSession(user.id);
    await session.respond(s2, { correct: true, responseMs: 5000 });

    const today = new Date().toISOString().slice(0, 10);
    const activity = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, user.id),
        eq(schema.dailyActivity.date, today),
      ))
      .get();

    expect(activity).toBeDefined();
    // 2 responds across 2 atomic sessions = 2 problems recorded
    expect(activity!.problemsCompleted).toBeGreaterThanOrEqual(2);
  });

  it("does not record activity for anonymous sessions", async () => {
    const { db } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startAnonymousSession("anon-token-123", "math-test");

    await session.respond(sessionId, { answer: "1", correct: true, responseMs: 5000 });

    // No dailyActivity rows should exist (no user to record against)
    const rows = await db.select().from(schema.dailyActivity);
    expect(rows.length).toBe(0);
  });

  it("records topicsMastered when mastery event fires", async () => {
    const { db, user } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    // Seed counting as nearly-mastered so next correct answer triggers mastery
    await seedUserTopicState(user.id, "counting", {
      reps: 3,
      stability: 5.0,
      difficulty: 0.3,
    });

    const { sessionId } = await session.startSession(user.id);

    // Keep responding correctly until we get a mastery event or session completes
    let hasMastery = false;
    for (let i = 0; i < 20; i++) {
      const result = await session.respond(sessionId, {
        answer: "1",
        correct: true,
        responseMs: 3000,
      });

      if ((result as any).masteryEvent) {
        hasMastery = true;
        break;
      }
      if (result.type === "complete") break;
    }

    const today = new Date().toISOString().slice(0, 10);
    const activity = await db
      .select()
      .from(schema.dailyActivity)
      .where(and(
        eq(schema.dailyActivity.userId, user.id),
        eq(schema.dailyActivity.date, today),
      ))
      .get();

    expect(activity).toBeDefined();
    // At minimum, problems were recorded
    expect(activity!.problemsCompleted).toBeGreaterThanOrEqual(1);
    // If mastery fired, topicsMastered should be > 0
    if (hasMastery) {
      expect(activity!.topicsMastered).toBeGreaterThanOrEqual(1);
    }
  });
});
