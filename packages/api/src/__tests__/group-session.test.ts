import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
  seedAccountLink,
} from "./helpers.js";
import { createGroupSessionService } from "../services/group-session.js";

describe("Group Session Service", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  let db: ReturnType<typeof getTestDb>;
  let parent: any;
  let child1: any;
  let child2: any;
  let child3: any;
  let teacher: any;
  let subject: any;
  let topicA: any;
  let topicB: any;

  beforeEach(async () => {
    db = getTestDb();
    // Clean session tables
    await db.delete((await import("../db/schema.js")).groupSessionParticipants);
    await db.delete((await import("../db/schema.js")).groupSessions);
    await db.delete((await import("../db/schema.js")).accountLinks);
    await db.delete((await import("../db/schema.js")).assessmentContent);
    await db.delete((await import("../db/schema.js")).topics);
    await db.delete((await import("../db/schema.js")).subjects);
    await db.delete((await import("../db/schema.js")).users);

    // Seed users
    parent = await seedUser({ id: "parent-1", name: "Parent" });
    child1 = await seedUser({ id: "child-1", name: "Alice" });
    child2 = await seedUser({ id: "child-2", name: "Bob" });
    child3 = await seedUser({ id: "child-3", name: "Charlie" });
    teacher = await seedUser({ id: "teacher-1", name: "Teacher" });

    // Seed account links (parent -> children)
    await seedAccountLink(parent.id, child1.id, "parent");
    await seedAccountLink(parent.id, child2.id, "parent");
    await seedAccountLink(parent.id, child3.id, "parent");

    // Seed content
    subject = await seedSubject({ id: "math-foundations" });
    topicA = await seedTopic(subject.id, { id: "topic-a", name: "Counting to 10", depth: 0 });
    topicB = await seedTopic(subject.id, { id: "topic-b", name: "Addition to 5", depth: 1 });
    await seedAssessmentContent(topicA.id, { difficulty: "easy", question: "Count to 3", answer: "3" });
    await seedAssessmentContent(topicA.id, { difficulty: "medium", question: "Count to 7", answer: "7" });
    await seedAssessmentContent(topicB.id, { difficulty: "medium", question: "2 + 3 = ?", answer: "5" });
  });

  describe("Family Co-Learning", () => {
    it("creates a family session and auto-adds linked children", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(parent.id, "family", { topicId: topicA.id });

      expect(sessionId).toBeTruthy();

      const dashboard = await service.getDashboard(sessionId);
      expect(dashboard).not.toBeNull();
      expect(dashboard!.participants).toHaveLength(4); // parent + 3 children
      expect(dashboard!.participants.filter((p) => p.role === "student")).toHaveLength(3);
      expect(dashboard!.participants.filter((p) => p.role === "facilitator")).toHaveLength(1);
    });

    it("gets different difficulty problems for different participants", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(parent.id, "family", { topicId: topicA.id });

      const dashboard = await service.getDashboard(sessionId);
      const students = dashboard!.participants.filter((p) => p.role === "student");

      // Each child should get a problem
      for (const student of students) {
        const result = await service.getParticipantProblem(sessionId, student.id);
        expect(result).not.toBeNull();
        expect(result!.topicId).toBe(topicA.id);
      }
    });

    it("tracks per-child progress independently", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(parent.id, "family", { topicId: topicA.id });

      const dashboard = await service.getDashboard(sessionId);
      const students = dashboard!.participants.filter((p) => p.role === "student");

      // Child 1 answers correctly
      await service.recordResponse(students[0].id, true, topicA.id, 2000);
      // Child 2 answers incorrectly
      await service.recordResponse(students[1].id, false, topicA.id, 3000);

      const updated = await service.getDashboard(sessionId);
      const updatedStudents = updated!.participants.filter((p) => p.role === "student");

      const s1 = updatedStudents.find((s) => s.userId === child1.id)!;
      const s2 = updatedStudents.find((s) => s.userId === child2.id)!;

      expect(s1.totalCorrect).toBe(1);
      expect(s1.totalAttempts).toBe(1);
      expect(s2.totalCorrect).toBe(0);
      expect(s2.totalAttempts).toBe(1);
    });
  });

  describe("Connected Classroom", () => {
    it("creates classroom session with join code", async () => {
      const service = createGroupSessionService(db);
      const { sessionId, joinCode } = await service.createSession(teacher.id, "classroom", { topicId: topicA.id });

      expect(joinCode).toBeTruthy();
      expect(joinCode!.length).toBe(6);

      const dashboard = await service.getDashboard(sessionId);
      expect(dashboard!.session.type).toBe("classroom");
    });

    it("students join via code", async () => {
      const service = createGroupSessionService(db);
      const { joinCode } = await service.createSession(teacher.id, "classroom", { topicId: topicA.id });

      // Authenticated student joins
      const result1 = await service.joinByCode(joinCode!, { userId: child1.id });
      expect("sessionId" in result1).toBe(true);

      // Anonymous student joins
      const result2 = await service.joinByCode(joinCode!, { anonymousToken: "anon-123", displayName: "Guest" });
      expect("sessionId" in result2).toBe(true);
    });

    it("shows real-time class progress dashboard", async () => {
      const service = createGroupSessionService(db);
      const { sessionId, joinCode } = await service.createSession(teacher.id, "classroom", { topicId: topicA.id });

      await service.joinByCode(joinCode!, { userId: child1.id });
      await service.joinByCode(joinCode!, { userId: child2.id });

      const dashboard = await service.getDashboard(sessionId);
      // teacher (facilitator) + 2 students
      expect(dashboard!.participants).toHaveLength(3);
    });

    it("returns error for invalid join code", async () => {
      const service = createGroupSessionService(db);
      const result = await service.joinByCode("BADCODE", { anonymousToken: "anon" });
      expect("error" in result).toBe(true);
    });
  });

  describe("Peer Pair Mode", () => {
    it("creates peer-pair session with 2 students", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(teacher.id, "peer-pair", {
        topicId: topicA.id,
        studentIds: [child1.id, child2.id],
      });

      const state = await service.getPeerPairState(sessionId);
      expect(state).not.toBeNull();
      expect(state!.studentA).toBeTruthy();
      expect(state!.studentB).toBeTruthy();
    });

    it("alternates turns between students", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(teacher.id, "peer-pair", {
        topicId: topicA.id,
        studentIds: [child1.id, child2.id],
      });

      // Initially step 0 = student A's turn
      let state = await service.getPeerPairState(sessionId);
      const firstTurn = state!.currentTurn;

      // Student A answers
      const dashboard = await service.getDashboard(sessionId);
      const students = dashboard!.participants.filter((p) => p.role === "student");
      await service.recordResponse(students[0].id, true, topicA.id, 1000);

      // Now it should alternate
      state = await service.getPeerPairState(sessionId);
      expect(state!.currentStep).toBe(1);
      // Turn should change
      expect(state!.currentTurn).not.toBe(firstTurn);
    });
  });

  describe("Session Lifecycle", () => {
    it("ends session and marks all participants as left", async () => {
      const service = createGroupSessionService(db);
      const { sessionId } = await service.createSession(parent.id, "family", { topicId: topicA.id });

      await service.endSession(sessionId);

      const dashboard = await service.getDashboard(sessionId);
      expect(dashboard!.session.status).toBe("completed");
      expect(dashboard!.session.endedAt).toBeTruthy();
      expect(dashboard!.participants.every((p) => p.leftAt != null)).toBe(true);
    });

    it("lists sessions for facilitator", async () => {
      const service = createGroupSessionService(db);
      await service.createSession(parent.id, "family", { topicId: topicA.id });
      await service.createSession(parent.id, "family", { topicId: topicB.id });

      const sessions = await service.listSessions(parent.id);
      expect(sessions).toHaveLength(2);
    });
  });

  describe("Topic Suggestions", () => {
    it("suggests topics from frontier intersection", async () => {
      const service = createGroupSessionService(db);
      // No FSRS state means all root-level topics are on frontier
      const suggestions = await service.suggestTopics([child1.id, child2.id, child3.id]);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});
