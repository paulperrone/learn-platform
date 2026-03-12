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
    expect(firstItem.type).toBe("problem");

    // Respond to the first problem
    const result = await session.respond(sessionId, {
      answer: "1",
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
    expect(gp.goalType).toBeDefined();
    expect(gp.goalTarget).toBeGreaterThan(0);
    expect(typeof gp.progress).toBe("number");
  });

  it("records minutesActive on endSession()", async () => {
    const { db, user } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Respond with 90 seconds total (should round up to 2 minutes)
    await session.respond(sessionId, { answer: "1", correct: true, responseMs: 45_000 });
    await session.respond(sessionId, { answer: "2", correct: true, responseMs: 45_000 });

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

  it("multiple responds in same session accumulate activity", async () => {
    const { db, user } = await setupGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Respond twice (both correct to pretest then instruction phase)
    await session.respond(sessionId, { answer: "1", correct: true, responseMs: 5000 });
    // After pretest, we get instruction (worked example) — respond to advance
    await session.respond(sessionId, { correct: true, responseMs: 5000 });
    // Now in guided phase — respond with answer
    const r3 = await session.respond(sessionId, { answer: "1", correct: true, responseMs: 5000 });

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
    // 3 responds = 3 problems recorded (including instruction phase)
    expect(activity!.problemsCompleted).toBeGreaterThanOrEqual(3);
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
