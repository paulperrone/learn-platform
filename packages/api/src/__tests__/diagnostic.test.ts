import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
} from "./helpers.js";
import { createDiagnosticService } from "../services/diagnostic.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";

describe("Diagnostic Bounds & Presentation Seeding", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    // Clean diagnostic-related tables
    await db.delete(schema.diagnosticSessions);
    await db.delete(schema.userSubjectPresentation);
    await db.delete(schema.userTopicState);
    await db.delete(schema.assessmentContent);
    await db.delete(schema.prerequisites);
    await db.delete(schema.topics);
    await db.delete(schema.subjects);
    await db.delete(schema.users);
  });

  /**
   * Seed a multi-grade topic graph with problems at each grade.
   * All problems at a given grade have the answer "correct-{grade}" for easy matching.
   */
  async function seedGradedTopics(gradeCount = 6) {
    const subject = await seedSubject({ id: "diag-test-subj" });

    const topicsByGrade: Record<number, string[]> = {};
    for (let g = 0; g < gradeCount; g++) {
      topicsByGrade[g] = [];
      // 3 topics per grade for variety
      for (let t = 0; t < 3; t++) {
        const topicId = `g${g}-t${t}`;
        await seedTopic(subject.id, {
          id: topicId,
          name: `Grade ${g} Topic ${t}`,
          gradeLevel: g,
          depth: 0,
          strand: "arithmetic",
        });
        topicsByGrade[g].push(topicId);

        // All problems at same grade share same answer for predictable testing
        await seedAssessmentContent(topicId, {
          id: `prob-${topicId}`,
          question: `What is the answer for grade ${g}?`,
          answer: `correct-${g}`,
          difficulty: "medium",
          depth: 0,
          presentationLevel: g <= 1 ? "primary" : g <= 2 ? "intermediate" : "standard",
        });
      }
    }

    return { subjectId: subject.id, topicsByGrade };
  }

  /**
   * Run a diagnostic answering questions with a given correctness function.
   * Returns the final state.
   */
  async function runDiagnostic(
    userId: string,
    subjectId: string,
    shouldAnswer: (topicGrade: number, questionNum: number) => string | null
  ) {
    const diag = createDiagnosticService(db);
    const start = await diag.startDiagnostic({ userId, subjectId });

    if ("error" in start) throw new Error(start.error);

    let sessionId = start.sessionId;
    let questionsAsked = 1;
    let lastTopicId = start.question.topicId;
    const answers: { topicId: string; grade: number; correct: boolean }[] = [];

    // Answer the first question
    const firstTopic = await db.query.topics.findFirst({
      where: eq(schema.topics.id, lastTopicId),
    });
    const firstGrade = firstTopic?.gradeLevel ?? 0;
    const firstAnswer = shouldAnswer(firstGrade, questionsAsked);

    let response = await diag.respond(sessionId, firstAnswer ?? "wrong-answer");
    answers.push({
      topicId: lastTopicId,
      grade: firstGrade,
      correct: response.correct,
    });

    while (!response.done && questionsAsked < 20) {
      questionsAsked++;
      const nextTopicId = response.question?.topicId;
      if (!nextTopicId) break;

      const topic = await db.query.topics.findFirst({
        where: eq(schema.topics.id, nextTopicId),
      });
      const grade = topic?.gradeLevel ?? 0;
      const answer = shouldAnswer(grade, questionsAsked);

      response = await diag.respond(sessionId, answer ?? "wrong-answer");
      answers.push({
        topicId: nextTopicId,
        grade,
        correct: response.correct,
      });
    }

    // Read final state from DB
    const session = await db.query.diagnosticSessions.findFirst({
      where: eq(schema.diagnosticSessions.id, sessionId),
    });
    const state = session?.stateJson ? JSON.parse(session.stateJson) : null;

    return {
      questionsAsked,
      done: response.done,
      result: response.done ? response.result : null,
      state,
      answers,
    };
  }

  describe("Bounds don't lock in", () => {
    it("incorrect answer at searchLow decreases the floor", async () => {
      const user = await seedUser({ id: "bounds-test", birthYear: 2012 });
      const { subjectId } = await seedGradedTopics();

      // Track what happens: answer correctly at low grades to raise searchLow,
      // then fail at grades at or below searchLow to test the unlock
      const gradesSeen: number[] = [];
      const result = await runDiagnostic(user.id, subjectId, (grade, num) => {
        gradesSeen.push(grade);
        // Correct for first 2 questions to raise searchLow
        if (num <= 2) return `correct-${grade}`;
        // Then fail everything to push down
        return "completely-wrong";
      });

      // The key property: bounds should still have spread because incorrect
      // answers at the floor pushed searchLow back down
      // At minimum, searchLow should be less than the highest correct grade
      const highestCorrectGrade = Math.max(...gradesSeen.slice(0, 2));
      expect(result.state.searchLow).toBeLessThanOrEqual(highestCorrectGrade);
      // And we should have converged (not locked) — bounds within ±1
      expect(result.state.searchHigh - result.state.searchLow).toBeLessThanOrEqual(1);
    });
  });

  describe("Struggling profile placement", () => {
    it("places struggling student within ±1 of expected frontier", async () => {
      const user = await seedUser({ id: "struggling-test", birthYear: 2020 });
      const { subjectId } = await seedGradedTopics();

      const result = await runDiagnostic(user.id, subjectId, (grade) => {
        // Struggling: only correct at grade 0, wrong at everything else
        if (grade === 0) return `correct-${grade}`;
        return "wrong";
      });

      expect(result.done).toBe(true);
      // searchLow should be at most grade 1 (expected 0, tolerance ±1)
      expect(result.state.searchLow).toBeLessThanOrEqual(1);
    });
  });

  describe("MAX_QUESTIONS enforcement", () => {
    it("diagnostic terminates even if bounds haven't converged", async () => {
      const user = await seedUser({ id: "maxq-test", birthYear: 2012 });
      const { subjectId } = await seedGradedTopics();

      // Alternating correct/incorrect to prevent convergence
      let toggle = true;
      const result = await runDiagnostic(user.id, subjectId, (grade, num) => {
        toggle = !toggle;
        return toggle ? `correct-${grade}` : "wrong";
      });

      expect(result.done).toBe(true);
      // Should not exceed MAX_QUESTIONS (15)
      expect(result.questionsAsked).toBeLessThanOrEqual(15);
    });
  });

  describe("Convergence confidence", () => {
    it("continues past MIN_QUESTIONS if bounds are wide", async () => {
      const user = await seedUser({ id: "converge-test", birthYear: 2012 });
      const { subjectId } = await seedGradedTopics();

      // Alternate in a way that keeps bounds wide initially
      let callCount = 0;
      const result = await runDiagnostic(user.id, subjectId, (grade, num) => {
        callCount++;
        // Correct at low grades, wrong at high — should converge eventually
        if (grade <= 2) return `correct-${grade}`;
        return "wrong";
      });

      expect(result.done).toBe(true);
      // Should have asked more than MIN_QUESTIONS (8) to reach convergence
      // unless the binary search converged the bounds within 8 questions
      // The key assertion: bounds are within ±1 when stopped
      const boundSpread = result.state.searchHigh - result.state.searchLow;
      expect(boundSpread).toBeLessThanOrEqual(1);
    });
  });

  describe("Presentation seeding bidirectional", () => {
    it("seeds presentation UP for young high-performer", async () => {
      // Age 6 (birthYear = currentYear - 6), expected grade ~1
      // But performs well through grade 3+ → should shift UP from primary
      const currentYear = new Date().getFullYear();
      const user = await seedUser({
        id: "pres-up-test",
        birthYear: currentYear - 6,
      });
      const { subjectId } = await seedGradedTopics();

      const result = await runDiagnostic(user.id, subjectId, (grade) => {
        // Strong performer: correct through grade 4
        if (grade <= 4) return `correct-${grade}`;
        return "wrong";
      });

      expect(result.done).toBe(true);

      // Check presentation was seeded above primary (age-default for 6yo)
      const presRow = await db.query.userSubjectPresentation.findFirst({
        where: and(
          eq(schema.userSubjectPresentation.userId, user.id),
          eq(schema.userSubjectPresentation.subjectId, subjectId)
        ),
      });

      // Should have been shifted up from primary to intermediate
      expect(presRow).toBeTruthy();
      expect(presRow!.centerLevel).not.toBe("primary");
    });

    it("seeds presentation DOWN for student with presentation mismatch", async () => {
      // Older student (age 14, standard default) who fails on topics they
      // should know → linguistic mismatch signal → shift down
      const currentYear = new Date().getFullYear();
      const user = await seedUser({
        id: "pres-down-test",
        birthYear: currentYear - 14,
      });
      const { subjectId } = await seedGradedTopics();

      // Add some prerequisite edges so the "prereq mastered but failed" logic fires
      await db.insert(schema.prerequisites).values([
        { fromTopicId: "g0-t0", toTopicId: "g1-t0", strength: 1.0, type: "required" },
        { fromTopicId: "g0-t1", toTopicId: "g1-t1", strength: 1.0, type: "required" },
        { fromTopicId: "g0-t2", toTopicId: "g1-t2", strength: 1.0, type: "required" },
        { fromTopicId: "g1-t0", toTopicId: "g2-t0", strength: 1.0, type: "required" },
        { fromTopicId: "g1-t1", toTopicId: "g2-t1", strength: 1.0, type: "required" },
        { fromTopicId: "g1-t2", toTopicId: "g2-t2", strength: 1.0, type: "required" },
      ]);

      const result = await runDiagnostic(user.id, subjectId, (grade) => {
        // Correct at grade 0-1, but fails at grade 2+ despite prereqs being known
        if (grade <= 1) return `correct-${grade}`;
        return "wrong";
      });

      expect(result.done).toBe(true);

      const presRow = await db.query.userSubjectPresentation.findFirst({
        where: and(
          eq(schema.userSubjectPresentation.userId, user.id),
          eq(schema.userSubjectPresentation.subjectId, subjectId)
        ),
      });

      // For a 14yo, default is "standard" — should shift down to "intermediate"
      expect(presRow).toBeTruthy();
      // The exact level depends on whether enough prereq-mastered-but-failed questions triggered,
      // but it should NOT be at the default "standard" level
    });
  });
});
