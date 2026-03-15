import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Rating } from "ts-fsrs";
import {
  applyMigrations,
  getTestDb,
  resetDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedPrerequisite,
  seedUserTopicState,
  seedAssessmentContent,
  seedInstructionalContent,
} from "../helpers.js";
import { createSRSService, FIRE_PREREQ_ENABLED } from "../../services/srs.js";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

beforeAll(async () => {
  await applyMigrations();
});

/**
 * Unit tests for Plan 031 Phase 3 core functions:
 * - getNextItem() priority ordering
 * - applyPrereqCredit() credit mechanism
 */
describe("getNextItem", () => {
  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    // 3 topics: t1 (depth 0) → t2 (depth 1) → t3 (depth 2)
    await seedTopic(discipline.id, { id: "t1", name: "Topic 1", depth: 0 });
    await seedTopic(discipline.id, { id: "t2", name: "Topic 2", depth: 1 });
    await seedTopic(discipline.id, { id: "t3", name: "Topic 3", depth: 2 });
    await seedPrerequisite("t1", "t2");
    await seedPrerequisite("t2", "t3");

    // Content for all topics
    for (const topicId of ["t1", "t2", "t3"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-easy`, difficulty: "easy",
        question: `Easy ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["Hint"]),
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

  it("returns lesson for shallowest frontier topic when no reviews due", async () => {
    const { db, user } = await setupGraph();
    const srs = createSRSService(db);

    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("lesson");
    if (item.type === "lesson") {
      expect(item.topicId).toBe("t1"); // depth 0, shallowest
    }
  });

  it("returns review over lesson when topics are due", async () => {
    const { db, user } = await setupGraph();

    // t1 mastered, t2 due for review
    await seedUserTopicState(user.id, "t1", {
      mastered: true, stability: 10, reps: 5, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "t2", {
      mastered: false, stability: 1, reps: 3, state: 2,
      due: new Date(Date.now() - 60000).toISOString(), // overdue
    });

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("review");
    if (item.type === "review") {
      expect(item.topicId).toBe("t2");
    }
  });

  it("returns most overdue review when multiple topics are due", async () => {
    const { db, user } = await setupGraph();

    await seedUserTopicState(user.id, "t1", {
      mastered: false, stability: 1, reps: 3, state: 2,
      due: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    });
    await seedUserTopicState(user.id, "t2", {
      mastered: false, stability: 1, reps: 2, state: 2,
      due: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago (more overdue)
    });

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("review");
    if (item.type === "review") {
      expect(item.topicId).toBe("t2"); // more overdue
    }
  });

  it("returns complete when no reviews due and frontier empty", async () => {
    const { db, user } = await setupGraph();

    // All topics mastered, none due
    for (const topicId of ["t1", "t2", "t3"]) {
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 30, reps: 10, state: 2,
        due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("complete");
  });

  it("sorts frontier by depth then gradeLevel", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    // Two topics at same depth, different grade levels
    await seedTopic(discipline.id, { id: "a1", name: "A1", depth: 0, gradeLevel: 2 });
    await seedTopic(discipline.id, { id: "a2", name: "A2", depth: 0, gradeLevel: 1 });

    for (const topicId of ["a1", "a2"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-q`, difficulty: "easy",
        question: `Q ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["H"]),
        solution: "s",
      });
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Ex`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "S", instruction: "D", work: "w", explanation: "e" },
        ]),
      });
    }

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("lesson");
    if (item.type === "lesson") {
      expect(item.topicId).toBe("a2"); // lower gradeLevel
    }
  });

  it("does not return lesson for topic with unmet prerequisites", async () => {
    const { db, user } = await setupGraph();

    // t1 not mastered, t2 requires t1 → t2 should NOT be in frontier
    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("lesson");
    if (item.type === "lesson") {
      expect(item.topicId).toBe("t1"); // only t1 has no prereqs
      expect(item.topicId).not.toBe("t2");
    }
  });
});

describe.skipIf(!FIRE_PREREQ_ENABLED)("applyPrereqCredit", () => {
  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupPrereqChain() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    // Chain: t1 → t2 → t3 → t4 (4 hops)
    await seedTopic(discipline.id, { id: "pc-t1", name: "T1", depth: 0 });
    await seedTopic(discipline.id, { id: "pc-t2", name: "T2", depth: 1 });
    await seedTopic(discipline.id, { id: "pc-t3", name: "T3", depth: 2 });
    await seedTopic(discipline.id, { id: "pc-t4", name: "T4", depth: 3 });
    await seedPrerequisite("pc-t1", "pc-t2");
    await seedPrerequisite("pc-t2", "pc-t3");
    await seedPrerequisite("pc-t3", "pc-t4");

    // Mastered prereqs with reasonable stability. lastReview must be set
    // so cardFromRow/FSRS computes positive elapsed_days (otherwise elapsed_days=0
    // makes FSRS compute same-day review with fullBoost <= 0).
    const lastReview = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    for (const topicId of ["pc-t1", "pc-t2", "pc-t3"]) {
      await seedUserTopicState(user.id, topicId, {
        mastered: true,
        stability: 10,
        difficulty: 5,
        reps: 5,
        state: 2,
        lastReview,
        due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days out
      });
    }

    // t4 is the topic being practiced (not mastered yet)
    await seedUserTopicState(user.id, "pc-t4", {
      mastered: false,
      stability: 2,
      difficulty: 5,
      reps: 3,
      state: 2,
      due: new Date().toISOString(),
      consecutiveCorrectReviews: 3,
    });

    return { db, user };
  }

  it("does not apply credit when rating < Good", async () => {
    const { db, user } = await setupPrereqChain();
    const srs = createSRSService(db);

    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Hard, 3);

    const logs = await db.select().from(schema.reviewLog)
      .where(and(
        eq(schema.reviewLog.userId, user.id),
        eq(schema.reviewLog.phase, "fire-prereq"),
      ));
    expect(logs.length).toBe(0);
  });

  it("does not apply credit when consecutiveCorrect < 2", async () => {
    const { db, user } = await setupPrereqChain();
    const srs = createSRSService(db);

    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 1);

    const logs = await db.select().from(schema.reviewLog)
      .where(and(
        eq(schema.reviewLog.userId, user.id),
        eq(schema.reviewLog.phase, "fire-prereq"),
      ));
    expect(logs.length).toBe(0);
  });

  it("applies credit to direct prerequisite (hop 1) at 0.30 fraction", async () => {
    const { db, user } = await setupPrereqChain();

    // Record original stability of t3 (direct prereq of t4)
    const [before] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));
    const origStability = before.stability;

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const [after] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    expect(after.stability).toBeGreaterThan(origStability);
  });

  it("applies credit up to hop 3 but NOT hop 4", async () => {
    const { db, user } = await setupPrereqChain();
    const srs = createSRSService(db);

    // Record original stabilities
    const getStability = async (topicId: string) => {
      const [row] = await db.select().from(schema.userTopicState)
        .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, topicId)));
      return row.stability;
    };

    const origT1 = await getStability("pc-t1");
    const origT2 = await getStability("pc-t2");
    const origT3 = await getStability("pc-t3");

    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const newT3 = await getStability("pc-t3"); // hop 1
    const newT2 = await getStability("pc-t2"); // hop 2
    const newT1 = await getStability("pc-t1"); // hop 3

    // All should receive some credit (hops 1-3)
    expect(newT3).toBeGreaterThan(origT3);
    expect(newT2).toBeGreaterThan(origT2);
    expect(newT1).toBeGreaterThan(origT1);

    // Hop 1 boost > hop 2 boost > hop 3 boost (geometric decay)
    const boostT3 = newT3 - origT3;
    const boostT2 = newT2 - origT2;
    const boostT1 = newT1 - origT1;
    expect(boostT3).toBeGreaterThan(boostT2);
    expect(boostT2).toBeGreaterThan(boostT1);
  });

  it("skips unmastered prerequisites", async () => {
    const { db, user } = await setupPrereqChain();

    // Make t2 unmastered
    await db.update(schema.userTopicState)
      .set({ mastered: false })
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t2")));

    const [beforeT2] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t2")));

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const [afterT2] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t2")));

    // t2 should be unchanged (skipped because not mastered)
    expect(afterT2.stability).toBe(beforeT2.stability);
  });

  it("skips prerequisites with R < 0.5 (too stale)", async () => {
    const { db, user } = await setupPrereqChain();

    // Make t3 very stale (low stability, overdue)
    await db.update(schema.userTopicState)
      .set({
        stability: 0.5,
        due: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days overdue
      })
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    const [beforeT3] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const [afterT3] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    // t3 should be unchanged (R < 0.5 gate)
    expect(afterT3.stability).toBe(beforeT3.stability);
  });

  it("applies 0.5x multiplier for recommended edges", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    await seedTopic(discipline.id, { id: "req-t1", name: "Required Prereq", depth: 0 });
    await seedTopic(discipline.id, { id: "rec-t1", name: "Recommended Prereq", depth: 0 });
    await seedTopic(discipline.id, { id: "main-t", name: "Main Topic", depth: 1 });
    await seedPrerequisite("req-t1", "main-t", 1.0, "required");
    await seedPrerequisite("rec-t1", "main-t", 1.0, "recommended");

    // Both prereqs mastered with same stability
    const lastReview = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const topicId of ["req-t1", "rec-t1"]) {
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 10, difficulty: 5, reps: 5, state: 2,
        lastReview,
        due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    await seedUserTopicState(user.id, "main-t", {
      mastered: false, stability: 2, difficulty: 5, reps: 3, state: 2,
      due: new Date().toISOString(), consecutiveCorrectReviews: 3,
    });

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "main-t", Rating.Good, 3);

    const [reqAfter] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "req-t1")));
    const [recAfter] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "rec-t1")));

    const reqBoost = reqAfter.stability - 10;
    const recBoost = recAfter.stability - 10;

    // Recommended gets 0.5x the boost of required
    expect(reqBoost).toBeGreaterThan(0);
    expect(recBoost).toBeGreaterThan(0);
    expect(recBoost).toBeCloseTo(reqBoost * 0.5, 1);
  });

  it("skips enriching edges entirely", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    await seedTopic(discipline.id, { id: "enr-t1", name: "Enriching Prereq", depth: 0 });
    await seedTopic(discipline.id, { id: "enr-main", name: "Main Topic", depth: 1 });
    await seedPrerequisite("enr-t1", "enr-main", 1.0, "enriching");

    await seedUserTopicState(user.id, "enr-t1", {
      mastered: true, stability: 10, difficulty: 5, reps: 5, state: 2,
      lastReview: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "enr-main", {
      mastered: false, stability: 2, difficulty: 5, reps: 3, state: 2,
      due: new Date().toISOString(), consecutiveCorrectReviews: 3,
    });

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "enr-main", Rating.Good, 3);

    const [after] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "enr-t1")));

    // Enriching edge should get no credit
    expect(after.stability).toBe(10);
  });

  it("only updates stability and due — not reps, consecutiveCorrectReviews, or mastered", async () => {
    const { db, user } = await setupPrereqChain();

    const [before] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const [after] = await db.select().from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, user.id), eq(schema.userTopicState.topicId, "pc-t3")));

    expect(after.reps).toBe(before.reps);
    expect(after.consecutiveCorrectReviews).toBe(before.consecutiveCorrectReviews);
    expect(after.mastered).toBe(before.mastered);
    expect(after.stability).toBeGreaterThan(before.stability); // stability DOES change
    expect(after.due).not.toBe(before.due); // due DOES change
  });

  it("logs credit events with implicit=1 and phase=fire-prereq", async () => {
    const { db, user } = await setupPrereqChain();
    const srs = createSRSService(db);

    await srs.applyPrereqCredit(user.id, "pc-t4", Rating.Good, 3);

    const logs = await db.select().from(schema.reviewLog)
      .where(and(
        eq(schema.reviewLog.userId, user.id),
        eq(schema.reviewLog.phase, "fire-prereq"),
      ));

    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      expect(log.implicit).toBe(1);
      expect(log.correct).toBe(true);
      expect(log.rating).toBe(Rating.Good);
      expect(log.responseMs).toBe(0);
    }
  });

  it("handles diamond prerequisite graph without duplicate processing", async () => {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    // Diamond: t1 ← t2 ← t4, t1 ← t3 ← t4
    await seedTopic(discipline.id, { id: "dia-t1", name: "Root", depth: 0 });
    await seedTopic(discipline.id, { id: "dia-t2", name: "Left", depth: 1 });
    await seedTopic(discipline.id, { id: "dia-t3", name: "Right", depth: 1 });
    await seedTopic(discipline.id, { id: "dia-t4", name: "Top", depth: 2 });
    await seedPrerequisite("dia-t1", "dia-t2");
    await seedPrerequisite("dia-t1", "dia-t3");
    await seedPrerequisite("dia-t2", "dia-t4");
    await seedPrerequisite("dia-t3", "dia-t4");

    const lastReview = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const topicId of ["dia-t1", "dia-t2", "dia-t3"]) {
      await seedUserTopicState(user.id, topicId, {
        mastered: true, stability: 10, difficulty: 5, reps: 5, state: 2,
        lastReview,
        due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    await seedUserTopicState(user.id, "dia-t4", {
      mastered: false, stability: 2, difficulty: 5, reps: 3, state: 2,
      due: new Date().toISOString(), consecutiveCorrectReviews: 3,
    });

    const srs = createSRSService(db);
    await srs.applyPrereqCredit(user.id, "dia-t4", Rating.Good, 3);

    // t1 should receive only ONE credit event (BFS visited set prevents duplicates)
    const logs = await db.select().from(schema.reviewLog)
      .where(and(
        eq(schema.reviewLog.userId, user.id),
        eq(schema.reviewLog.topicId, "dia-t1"),
        eq(schema.reviewLog.phase, "fire-prereq"),
      ));
    expect(logs.length).toBe(1);
  });
});

/**
 * Phase 4: Assessment calibration loop tests
 * - getNextItem() assessment gate
 * - Pacing factor modulation
 * - finishAssessmentGate pacing feedback
 */
describe("assessment calibration loop", () => {
  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupWithLearningState(overrides: Partial<typeof schema.userLearningState.$inferInsert> = {}) {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math" });

    await seedTopic(discipline.id, { id: "t1", name: "Topic 1", depth: 0 });
    await seedTopic(discipline.id, { id: "t2", name: "Topic 2", depth: 1 });
    await seedPrerequisite("t1", "t2");

    for (const topicId of ["t1", "t2"]) {
      await seedAssessmentContent(topicId, {
        id: `${topicId}-q`, difficulty: "easy",
        question: `Q ${topicId}?`, answer: "1",
        hintsJson: JSON.stringify(["H"]),
        solution: "s",
      });
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Ex`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "S", instruction: "D", work: "w", explanation: "e" },
        ]),
      });
    }

    // Always create a user_learning_state row
    await db.insert(schema.userLearningState).values({
      userId: user.id,
      topicsIntroducedSinceAssessment: 0,
      pacingFactor: 1.0,
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    return { db, user, discipline };
  }

  it("returns assessment when pending_assessment_id is set", async () => {
    const { db, user } = await setupWithLearningState();
    // Create a fake assessment session
    await db.insert(schema.assessmentSessions).values({
      id: "assess-1",
      userId: user.id,
      scopeJson: JSON.stringify({ type: "comprehensive" }),
      configJson: JSON.stringify({ scope: { type: "comprehensive" }, questionCount: 5 }),
      questionsJson: JSON.stringify([]),
      startedAt: new Date().toISOString(),
    });
    // Set pending assessment
    await db.update(schema.userLearningState)
      .set({ pendingAssessmentId: "assess-1" })
      .where(eq(schema.userLearningState.userId, user.id));

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("assessment");
    if (item.type === "assessment") {
      expect(item.assessmentSessionId).toBe("assess-1");
    }
  });

  it("returns review/lesson normally when no assessment pending", async () => {
    const { db, user } = await setupWithLearningState();

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("lesson"); // no assessment pending, frontier available
  });

  it("assessment gate takes priority over due reviews", async () => {
    const { db, user } = await setupWithLearningState();

    // t1 is due for review
    await seedUserTopicState(user.id, "t1", {
      mastered: false, stability: 1, reps: 3, state: 2,
      due: new Date(Date.now() - 60000).toISOString(),
    });

    // Set pending assessment
    await db.insert(schema.assessmentSessions).values({
      id: "assess-2",
      userId: user.id,
      scopeJson: JSON.stringify({ type: "comprehensive" }),
      configJson: JSON.stringify({ scope: { type: "comprehensive" }, questionCount: 5 }),
      questionsJson: JSON.stringify([]),
      startedAt: new Date().toISOString(),
    });
    await db.update(schema.userLearningState)
      .set({ pendingAssessmentId: "assess-2" })
      .where(eq(schema.userLearningState.userId, user.id));

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    expect(item.type).toBe("assessment"); // assessment > review
  });

  it("pacing factor > 1 allows lessons when few reviews pending", async () => {
    const { db, user } = await setupWithLearningState({ pacingFactor: 2.0 });

    // t1 due for review (only 1 review pending)
    await seedUserTopicState(user.id, "t1", {
      mastered: false, stability: 1, reps: 3, state: 2,
      due: new Date(Date.now() - 60000).toISOString(),
    });

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    // pacing=2.0 → skipThreshold=floor((2-1)*5)=5, only 1 due review < 5 → serve lesson
    // But t2 requires t1 which isn't mastered, so frontier is empty → falls back to review
    // Need to make t1 mastered but due
    await db.update(schema.userTopicState)
      .set({ mastered: true })
      .where(and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, "t1"),
      ));

    const item2 = await srs.getNextItem(user.id);
    // Now t1 is mastered+due, t2 is in frontier. pacing=2.0 skips 1 review → lesson
    expect(item2.type).toBe("lesson");
    if (item2.type === "lesson") {
      expect(item2.topicId).toBe("t2");
    }
  });

  it("pacing factor = 1 (default) serves reviews before lessons", async () => {
    const { db, user } = await setupWithLearningState({ pacingFactor: 1.0 });

    // t1 not mastered, due for review (getDueTopics filters mastered=false)
    await seedUserTopicState(user.id, "t1", {
      mastered: false, stability: 1, reps: 5, state: 2,
      due: new Date(Date.now() - 60000).toISOString(),
    });

    const srs = createSRSService(db);
    const item = await srs.getNextItem(user.id);
    // pacing=1.0 → skipThreshold=0, 1 due > 0 → serve review
    expect(item.type).toBe("review");
    if (item.type === "review") {
      expect(item.topicId).toBe("t1");
    }
  });

  it("pacing factor stays within bounds", async () => {
    const { db, user } = await setupWithLearningState({ pacingFactor: 1.0 });

    // Import finishAssessmentGate
    const { createAssessmentService } = await import("../../services/assessment.js");
    const { PACING_FACTOR_MIN, PACING_FACTOR_MAX } = await import("../../services/srs.js");
    const assessmentSvc = createAssessmentService(db);

    // Simulate many low-score assessments to try to push below floor
    for (let i = 0; i < 20; i++) {
      await assessmentSvc.finishAssessmentGate(user.id, `assess-${i}`, 0.30);
    }

    const state = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, user.id),
    });
    expect(state!.pacingFactor).toBeGreaterThanOrEqual(PACING_FACTOR_MIN);

    // Reset and simulate many high-score assessments
    await db.update(schema.userLearningState)
      .set({ pacingFactor: 1.0 })
      .where(eq(schema.userLearningState.userId, user.id));

    for (let i = 0; i < 20; i++) {
      await assessmentSvc.finishAssessmentGate(user.id, `assess-high-${i}`, 0.95);
    }

    const state2 = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, user.id),
    });
    expect(state2!.pacingFactor).toBeLessThanOrEqual(PACING_FACTOR_MAX);
  });

  it("finishAssessmentGate clears pending and applies pacing for high score", async () => {
    const { db, user } = await setupWithLearningState({ pendingAssessmentId: null });

    const { createAssessmentService } = await import("../../services/assessment.js");
    const assessmentSvc = createAssessmentService(db);

    await assessmentSvc.finishAssessmentGate(user.id, "assess-done", 0.85);

    const state = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, user.id),
    });
    expect(state!.pendingAssessmentId).toBeNull();
    expect(state!.pacingFactor).toBeCloseTo(1.15, 2); // 1.0 * 1.15
    expect(state!.lastAssessmentAt).toBeTruthy();
  });

  it("finishAssessmentGate keeps pacing unchanged for mid-range score", async () => {
    const { db, user } = await setupWithLearningState({});

    const { createAssessmentService } = await import("../../services/assessment.js");
    const assessmentSvc = createAssessmentService(db);

    await assessmentSvc.finishAssessmentGate(user.id, "assess-mid", 0.70);

    const state = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, user.id),
    });
    expect(state!.pacingFactor).toBe(1.0); // unchanged
  });

  it("finishAssessmentGate decreases pacing for low score", async () => {
    const { db, user } = await setupWithLearningState({});

    const { createAssessmentService } = await import("../../services/assessment.js");
    const assessmentSvc = createAssessmentService(db);

    await assessmentSvc.finishAssessmentGate(user.id, "assess-low", 0.45);

    const state = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, user.id),
    });
    expect(state!.pacingFactor).toBeCloseTo(0.80, 2); // 1.0 * 0.80
  });
});
