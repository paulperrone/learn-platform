import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.js";
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
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";

describe("targeted remediation", () => {
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
    const discipline = await seedDiscipline();

    // Create topic chain: counting → addition → multiplication
    await seedTopic(discipline.id, {
      id: "counting",
      name: "Counting to 10",
      depth: 0,
    });
    await seedTopic(discipline.id, {
      id: "addition",
      name: "Addition within 10",
      depth: 1,
    });
    await seedTopic(discipline.id, {
      id: "multiplication",
      name: "Multiplication",
      depth: 2,
    });

    // Prerequisites: counting → addition → multiplication
    await seedPrerequisite("counting", "addition");
    await seedPrerequisite("addition", "multiplication");

    // Seed problems for all topics
    await seedAssessmentContent("counting", {
      id: "counting-p1",
      difficulty: "easy",
      question: "Count to 5",
      answer: "5",
    });
    await seedAssessmentContent("addition", {
      id: "addition-p1",
      difficulty: "easy",
      question: "What is 2 + 3?",
      answer: "5",
    });
    await seedAssessmentContent("addition", {
      id: "addition-p2",
      difficulty: "medium",
      question: "What is 4 + 5?",
      answer: "9",
    });
    await seedAssessmentContent("multiplication", {
      id: "mult-p1",
      difficulty: "easy",
      question: "What is 2 x 3?",
      answer: "6",
    });
    await seedAssessmentContent("multiplication", {
      id: "mult-p2",
      difficulty: "medium",
      question: "What is 3 x 4?",
      answer: "12",
    });

    // Seed instructional content
    await seedInstructionalContent("multiplication", {
      id: "mult-ex1",
      title: "Multiplication Basics",
    });
    await seedInstructionalContent("addition", {
      id: "add-ex1",
      title: "Addition Basics",
    });
    await seedInstructionalContent("counting", {
      id: "count-ex1",
      title: "Counting Basics",
    });

    return { db, user, discipline };
  }

  /**
   * Create a learn_session row directly in DB (bypassing in-memory cache).
   * The session service's respond() will load state from DB via loadState().
   */
  async function createTestSession(
    userId: string,
    stateOverrides: Record<string, unknown>
  ) {
    const db = getTestDb();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const state = {
      sessionId,
      userId,
      currentTopicId: null,
      currentPhase: "independent",
      phaseIndex: 0,
      hintIndex: 0,
      topicsCompleted: [],
      reviewsCompleted: 0,
      totalCorrect: 0,
      totalAttempts: 0,
      rollingResults: [],
      ...stateOverrides,
    };
    await db.insert(schema.learnSessions).values({
      id: sessionId,
      userId,
      stateJson: JSON.stringify(state),
      startedAt: now,
      updatedAt: now,
    });
    return sessionId;
  }

  it("targets lowest-stability prerequisite when entering remediation", async () => {
    const { db, user } = await setupGraph();

    // Counting has low stability (fragile knowledge)
    await seedUserTopicState(user.id, "counting", {
      stability: 2.0,
      reps: 3,
      state: 2,
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "addition",
      currentPhase: "independent",
    });

    const session = createSessionService(db);

    // First failure → stays in independent (retry)
    const retry = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });
    expect(retry.type).toBe("problem");

    // Second failure → triggers remediation (2+ accumulated failures)
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBe("counting");
      expect(result.topicId).toBe("counting");
      expect(result.originalTopicId).toBe("addition");
      expect(result.message).toContain("Counting to 10");
      expect(result.message).toContain("Addition within 10");
    }
  });

  it("uses keyPrerequisiteId from problem when available", async () => {
    const { db, user } = await setupGraph();

    // Add problem with explicit keyPrerequisiteId pointing to counting
    await seedAssessmentContent("multiplication", {
      id: "mult-with-key-prereq",
      difficulty: "medium",
      question: "What is 5 x 6?",
      answer: "30",
      keyPrerequisiteId: "counting",
    });

    // Addition has LOWER stability than counting, but keyPrerequisiteId should override
    await seedUserTopicState(user.id, "addition", {
      stability: 1.0,
      reps: 2,
      state: 2,
    });
    await seedUserTopicState(user.id, "counting", {
      stability: 30.0,
      reps: 10,
      state: 2,
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "multiplication",
      currentPhase: "independent",
      lastProblemId: "mult-with-key-prereq",
    });

    const session = createSessionService(db);

    // First failure → stays in independent (retry)
    await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    // Second failure → triggers remediation
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    // Should target counting (from keyPrerequisiteId), not addition (lowest stability)
    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBe("counting");
      expect(result.topicId).toBe("counting");
    }
  });

  it("returns to original topic after successful prerequisite remediation", async () => {
    const { db, user } = await setupGraph();

    await seedUserTopicState(user.id, "counting", {
      stability: 2.0,
      reps: 3,
      state: 2,
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "addition",
      currentPhase: "remediation",
      remediationTargetTopicId: "counting",
      remediationOriginalTopicId: "addition",
      remediationOriginalPhase: "independent",
    });

    const session = createSessionService(db);

    // Respond correctly → should return to addition's independent phase
    const result = await session.respond(sessionId, {
      correct: true,
      responseMs: 2000,
    });

    expect(result.type).toBe("problem");
    if (result.type === "problem") {
      expect(result.phase).toBe("independent");
      expect(result.topicId).toBe("addition");
    }
  });

  it("falls back to same-topic remediation for anonymous users", async () => {
    const db = getTestDb();
    const discipline = await seedDiscipline();
    await seedTopic(discipline.id, {
      id: "anon-topic",
      name: "Test Topic",
    });
    await seedAssessmentContent("anon-topic", {
      id: "anon-p1",
      difficulty: "easy",
      question: "Easy question?",
      answer: "yes",
    });
    await seedAssessmentContent("anon-topic", {
      id: "anon-p2",
      difficulty: "medium",
      question: "Medium question?",
      answer: "yes",
    });
    await seedInstructionalContent("anon-topic", {
      id: "anon-ex1",
      title: "Test Example",
    });

    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const anonToken = "anon-token-rem-1";
    const state = {
      sessionId,
      userId: anonToken,
      anonymousToken: anonToken,
      isAnonymous: true,
      currentTopicId: "anon-topic",
      currentPhase: "independent",
      phaseIndex: 0,
      hintIndex: 0,
      topicsCompleted: [],
      reviewsCompleted: 0,
      totalCorrect: 0,
      totalAttempts: 0,
      rollingResults: [],
    };
    await db.insert(schema.learnSessions).values({
      id: sessionId,
      anonymousToken: anonToken,
      stateJson: JSON.stringify(state),
      startedAt: now,
      updatedAt: now,
    });

    const session = createSessionService(db);

    // First failure → stays in independent (retry)
    await session.respond(sessionId, {
      correct: false,
      responseMs: 2000,
    });

    // Second failure → triggers remediation (2+ accumulated failures)
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 2000,
    });

    // Anonymous: same-topic remediation (no prereq targeting)
    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBeUndefined();
      expect(result.topicId).toBe("anon-topic");
    }
  });

  it("tries next weakest prerequisite after 2 failed remediation attempts", async () => {
    const { db, user } = await setupGraph();

    // Both prerequisites have state; counting is weakest, addition next
    await seedUserTopicState(user.id, "counting", {
      stability: 1.0,
      reps: 2,
      state: 2,
    });
    await seedUserTopicState(user.id, "addition", {
      stability: 3.0,
      reps: 4,
      state: 2,
    });

    // phaseIndex=1 means one prior failed attempt; next failure makes it 2 → switch prereq
    const sessionId = await createTestSession(user.id, {
      currentTopicId: "multiplication",
      currentPhase: "remediation",
      phaseIndex: 1,
      remediationTargetTopicId: "counting",
      remediationOriginalTopicId: "multiplication",
    });

    const session = createSessionService(db);

    // Fail again → phaseIndex becomes 2 → should switch to next weakest (addition)
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBe("addition");
      expect(result.topicId).toBe("addition");
    }
  });

  it("falls back to same-topic remediation when no prerequisites exist", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline();

    await seedTopic(discipline.id, {
      id: "standalone",
      name: "Standalone Topic",
    });
    await seedAssessmentContent("standalone", {
      id: "standalone-p1",
      difficulty: "easy",
      question: "Easy standalone?",
      answer: "yes",
    });
    await seedAssessmentContent("standalone", {
      id: "standalone-p2",
      difficulty: "medium",
      question: "Medium standalone?",
      answer: "yes",
    });
    await seedInstructionalContent("standalone", {
      id: "standalone-ex1",
      title: "Standalone Example",
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "standalone",
      currentPhase: "independent",
    });

    const session = createSessionService(db);

    // First failure → stays in independent (retry)
    await session.respond(sessionId, {
      correct: false,
      responseMs: 2000,
    });

    // Second failure → triggers remediation (2+ accumulated failures)
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 2000,
    });

    // No prereqs: same-topic remediation
    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBeUndefined();
      expect(result.topicId).toBe("standalone");
      expect(result.message).toContain("back to basics");
    }
  });

  it("triggers remediation on 2+ failures accumulated across phases", async () => {
    const { db, user } = await setupGraph();

    await seedUserTopicState(user.id, "counting", {
      stability: 2.0,
      reps: 3,
      state: 2,
    });

    // Start in pretest phase — first failure here
    const sessionId = await createTestSession(user.id, {
      currentTopicId: "addition",
      currentPhase: "pretest",
    });

    const session = createSessionService(db);

    // Fail pretest → advances to instruction (failure tracked: count=1)
    const preResult = await session.respond(sessionId, {
      correct: false,
      responseMs: 2000,
    });
    expect(preResult.type).toBe("instruction");

    // Acknowledge instruction → advances to guided
    const instResult = await session.respond(sessionId, {
      correct: true,
      responseMs: 3000,
    });
    expect((instResult as any).phase).toBe("guided");

    // Fail guided → advances to independent (failure tracked: count=2 → triggers remediation)
    const guidedResult = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    expect(guidedResult.type).toBe("remediation");
    if (guidedResult.type === "remediation") {
      expect(guidedResult.remediationTargetTopicId).toBe("counting");
    }
  });

  it("triggers remediation on review topic after 2 failures", async () => {
    const { db, user } = await setupGraph();

    await seedUserTopicState(user.id, "counting", {
      stability: 2.0,
      reps: 3,
      state: 2,
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "addition",
      currentPhase: "review",
    });

    const session = createSessionService(db);

    // First review failure → retry (failure tracked: count=1)
    const retry = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });
    // Should stay on same topic for retry
    expect((retry as any).topicId).toBe("addition");

    // Second review failure → triggers remediation (count=2)
    const result = await session.respond(sessionId, {
      correct: false,
      responseMs: 3000,
    });

    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      expect(result.remediationTargetTopicId).toBe("counting");
      expect(result.originalTopicId).toBe("addition");
    }
  });

  it("returns to review phase after successful remediation from review", async () => {
    const { db, user } = await setupGraph();

    await seedUserTopicState(user.id, "counting", {
      stability: 2.0,
      reps: 3,
      state: 2,
    });

    const sessionId = await createTestSession(user.id, {
      currentTopicId: "counting",
      currentPhase: "remediation",
      remediationTargetTopicId: "counting",
      remediationOriginalTopicId: "addition",
      remediationOriginalPhase: "review",
    });

    const session = createSessionService(db);

    // Succeed in remediation → should return to original topic's review phase
    const result = await session.respond(sessionId, {
      correct: true,
      responseMs: 2000,
    });

    expect(result.type).toBe("problem");
    if (result.type === "problem") {
      expect(result.phase).toBe("review");
      expect(result.topicId).toBe("addition");
    }
  });

  it("identifyKeyPrerequisite returns correct weak prerequisite for fraction topics", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline();

    // Create a mini graph: whole-number-ops → fraction-addition
    await seedTopic(discipline.id, { id: "whole-number-ops", name: "Whole Number Operations", depth: 1 });
    await seedTopic(discipline.id, { id: "fraction-addition", name: "Fraction Addition", depth: 3 });
    await seedPrerequisite("whole-number-ops", "fraction-addition");

    // Whole number ops has low stability (weak knowledge)
    await seedUserTopicState(user.id, "whole-number-ops", {
      stability: 1.5,
      reps: 2,
      state: 2,
    });

    await seedAssessmentContent("fraction-addition", {
      id: "frac-p1", difficulty: "medium", question: "1/4 + 1/4?", answer: "1/2",
    });
    await seedAssessmentContent("fraction-addition", {
      id: "frac-p2", difficulty: "medium", question: "1/3 + 1/3?", answer: "2/3",
    });
    await seedAssessmentContent("whole-number-ops", {
      id: "whole-p1", difficulty: "easy", question: "5 + 3?", answer: "8",
    });
    await seedInstructionalContent("fraction-addition", { id: "frac-ex1", title: "Fraction Addition" });
    await seedInstructionalContent("whole-number-ops", { id: "whole-ex1", title: "Whole Number Ops" });

    // Set up session in independent phase on fraction-addition
    const sessionId = await createTestSession(user.id, {
      currentTopicId: "fraction-addition",
      currentPhase: "independent",
    });

    const session = createSessionService(db);

    // Fail twice → triggers remediation
    await session.respond(sessionId, { correct: false, responseMs: 2000 });
    const result = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    expect(result.type).toBe("remediation");
    if (result.type === "remediation") {
      // Should route to whole-number-ops (the weak prerequisite)
      expect(result.remediationTargetTopicId).toBe("whole-number-ops");
      expect(result.topicId).toBe("whole-number-ops");
    }
  });
});
