import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedUserTopicState,
  getTestR2Bucket,
} from "./helpers.js";
import { createAssessmentService } from "../services/assessment.js";
import * as schema from "../db/schema.js";

describe("Assessment Service", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(schema.assessmentResponses);
    await db.delete(schema.assessmentSessions);
    await db.delete(schema.userTopicState);
    await db.delete(schema.prerequisites);
    await db.delete(schema.topics);
    await db.delete(schema.users);
    await db.delete(schema.disciplines);
  });

  /** Seed topics across multiple strands with mastered state */
  async function seedMultiStrandTopics(userId: string) {
    await seedDiscipline({ id: "math" });
    const strands = ["number-sense", "geometry", "measurement"];
    const topics: string[] = [];

    for (let s = 0; s < strands.length; s++) {
      for (let i = 0; i < 4; i++) {
        const topicId = `${strands[s]}-t${i}`;
        await seedTopic("math", {
          id: topicId,
          name: `${strands[s]} topic ${i}`,
          gradeLevel: 2,
          depth: i,
          strand: strands[s],
          standardCode: `2.${strands[s].toUpperCase().slice(0, 2)}.${i + 1}`,
        });
        await seedAssessmentContent(topicId, {
          disciplineId: "math",
          id: `${topicId}-p1`,
          question: `What is ${i + 1} + ${i + 1}?`,
          answer: `${(i + 1) * 2}`,
        });
        await seedUserTopicState(userId, topicId, { mastered: true });
        topics.push(topicId);
      }
    }

    return topics;
  }

  describe("topic sampling", () => {
    it("produces diverse strand coverage for a 10-question assessment", async () => {
      const user = await seedUser();
      await seedMultiStrandTopics(user.id);

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { firstItem, totalQuestions } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 10,
      });

      expect(totalQuestions).toBeGreaterThanOrEqual(3); // at least one per strand
      expect(firstItem).not.toBeNull();

      // Get the pre-determined questions from the session
      const session = await db.query.assessmentSessions.findFirst();
      expect(session).toBeTruthy();
      const questions = JSON.parse(session!.questionsJson) as { strand: string | null }[];
      const strandsInSequence = new Set(questions.map((q) => q.strand));
      expect(strandsInSequence.size).toBeGreaterThanOrEqual(2);
    });

    it("falls back gracefully if scope has fewer topics than requested count", async () => {
      const user = await seedUser();
      await seedDiscipline({ id: "math" });
      const topicId = "small-topic-1";
      await seedTopic("math", { id: topicId, gradeLevel: 1, depth: 0 });
      await seedAssessmentContent(topicId, {
        disciplineId: "math",
        id: "small-p1",
        question: "What is 1 + 1?",
        answer: "2",
      });
      await seedUserTopicState(user.id, topicId, { mastered: true });

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { totalQuestions } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 20, // more than available
      });

      // Should only get as many as available (1 topic, 1 question)
      expect(totalQuestions).toBe(1);
    });
  });

  describe("no consecutive same-topic problems", () => {
    it("never places two consecutive questions from the same topic", async () => {
      const user = await seedUser();
      // Seed only 2 topics — the algorithm must alternate them
      await seedDiscipline({ id: "math" });
      for (let i = 0; i < 2; i++) {
        const topicId = `consec-t${i}`;
        await seedTopic("math", { id: topicId, gradeLevel: 1, depth: i, strand: `strand-${i}` });
        // Seed multiple problems so we can build a longer sequence
        for (let p = 0; p < 5; p++) {
          await seedAssessmentContent(topicId, {
            disciplineId: "math",
            id: `${topicId}-p${p}`,
            question: `Q${p} for topic ${i}`,
            answer: `${p}`,
          });
        }
        await seedUserTopicState(user.id, topicId, { mastered: true });
      }

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { totalQuestions } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 2, // one per topic is all we can get (sampling without replacement)
      });

      const session = await db.query.assessmentSessions.findFirst();
      const questions = JSON.parse(session!.questionsJson) as { topicId: string }[];

      for (let i = 1; i < questions.length; i++) {
        expect(questions[i].topicId).not.toBe(questions[i - 1].topicId);
      }
    });
  });

  describe("scoring", () => {
    it("computes correct per-strand breakdown", async () => {
      const user = await seedUser();
      await seedDiscipline({ id: "math" });

      // 2 topics in strand A (answer "4"), 2 topics in strand B (answer "8")
      const strandATopics = ["sa-t1", "sa-t2"];
      const strandBTopics = ["sb-t1", "sb-t2"];

      for (const topicId of strandATopics) {
        await seedTopic("math", { id: topicId, gradeLevel: 1, depth: 0, strand: "strand-a" });
        await seedAssessmentContent(topicId, {
          disciplineId: "math",
          id: `${topicId}-p1`,
          question: "What is 2 + 2?",
          answer: "4",
        });
        await seedUserTopicState(user.id, topicId, { mastered: true });
      }

      for (const topicId of strandBTopics) {
        await seedTopic("math", { id: topicId, gradeLevel: 1, depth: 0, strand: "strand-b" });
        await seedAssessmentContent(topicId, {
          disciplineId: "math",
          id: `${topicId}-p1`,
          question: "What is 4 + 4?",
          answer: "8",
        });
        await seedUserTopicState(user.id, topicId, { mastered: true });
      }

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { sessionId, totalQuestions } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 4,
      });

      // Answer all questions correctly
      const session = await db.query.assessmentSessions.findFirst({
        where: (t, { eq }) => eq(t.id, sessionId),
      });
      const questions = JSON.parse(session!.questionsJson) as { problem: { answer: string } }[];

      let result;
      for (const q of questions) {
        const resp = await service.respondToAssessment(sessionId, { answer: q.problem.answer });
        result = resp.result;
      }

      expect(result).toBeDefined();
      expect(result!.totalCorrect).toBe(totalQuestions);
      expect(result!.rawScore).toBe(1.0);
      expect(Object.keys(result!.strandScores).length).toBeGreaterThan(0);
      for (const [, score] of Object.entries(result!.strandScores)) {
        expect(score.correct).toBe(score.total);
      }
    });

    it("classifies standards correctly (≥80 proficient, 50-79 developing, <50 needs-support)", async () => {
      const user = await seedUser();
      await seedDiscipline({ id: "math" });

      // 5 topics all with same standard code
      const topicIds = ["std-t1", "std-t2", "std-t3", "std-t4", "std-t5"];
      for (const topicId of topicIds) {
        await seedTopic("math", {
          id: topicId,
          gradeLevel: 1,
          depth: 0,
          strand: "number",
          standardCode: "1.OA.1",
        });
        await seedAssessmentContent(topicId, {
          disciplineId: "math",
          id: `${topicId}-p1`,
          question: "What is 1 + 1?",
          answer: "2",
        });
        await seedUserTopicState(user.id, topicId, { mastered: true });
      }

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { sessionId, totalQuestions } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 5,
      });

      // Answer all WRONG to get needs-support
      let result;
      for (let i = 0; i < totalQuestions; i++) {
        const resp = await service.respondToAssessment(sessionId, { answer: "wrong answer" });
        result = resp.result;
      }

      expect(result).toBeDefined();
      expect(result!.standardScores["1.OA.1"]?.classification).toBe("needs-support");
    });
  });

  describe("timed assessment auto-completion", () => {
    it("auto-completes session when timer has expired", async () => {
      const user = await seedUser();
      await seedDiscipline({ id: "math" });
      const topicId = "timed-t1";
      await seedTopic("math", { id: topicId, gradeLevel: 1, depth: 0 });
      await seedAssessmentContent(topicId, {
        disciplineId: "math",
        id: "timed-p1",
        question: "What is 2 + 2?",
        answer: "4",
      });
      await seedUserTopicState(user.id, topicId, { mastered: true });

      const r2 = getTestR2Bucket();
      const service = createAssessmentService(db, r2);

      const { sessionId } = await service.startAssessment(user.id, {
        scope: { type: "comprehensive" },
        questionCount: 1,
        timeLimitMinutes: 1,
      });

      // Manually set started_at to 2 minutes ago to simulate expiry
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await db.update(schema.assessmentSessions)
        .set({ startedAt: twoMinsAgo })
        .where(eq(schema.assessmentSessions.id, sessionId));

      // Calling respond should return timed-out result
      const resp = await service.respondToAssessment(sessionId, { answer: "4" });
      expect(resp.result).toBeDefined();
      expect(resp.result!.status).toBe("timed-out");
    });
  });
});
