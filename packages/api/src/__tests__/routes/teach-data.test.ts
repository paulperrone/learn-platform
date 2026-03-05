import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssignment,
  seedAssessmentContent,
  seedAccountLink,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

describe("Teach Data Model", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(schema.assignmentResponses);
    await db.delete(schema.assignments);
    await db.delete(schema.teachSessions);
  });

  describe("teach_sessions table", () => {
    it("logs a teach session", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);

      const db = getTestDb();
      const now = new Date().toISOString();
      const [session] = await db
        .insert(schema.teachSessions)
        .values({
          id: "ts-1",
          teacherId: teacher.id,
          topicId: topic.id,
          startedAt: now,
        })
        .returning();

      expect(session.teacherId).toBe(teacher.id);
      expect(session.topicId).toBe(topic.id);
      expect(session.endedAt).toBeNull();
    });

    it("ends a teach session with notes", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);

      const db = getTestDb();
      const now = new Date().toISOString();
      await db.insert(schema.teachSessions).values({
        id: "ts-2",
        teacherId: teacher.id,
        topicId: topic.id,
        startedAt: now,
      });

      await db
        .update(schema.teachSessions)
        .set({ endedAt: new Date().toISOString(), notes: "Covered addition basics" })
        .where(eq(schema.teachSessions.id, "ts-2"));

      const [updated] = await db
        .select()
        .from(schema.teachSessions)
        .where(eq(schema.teachSessions.id, "ts-2"));

      expect(updated.endedAt).toBeTruthy();
      expect(updated.notes).toBe("Covered addition basics");
    });
  });

  describe("assignments table", () => {
    it("creates an assignment with share code", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);

      const assignment = await seedAssignment(teacher.id, topic.id, {
        shareCode: "ABC123",
        title: "Addition Practice",
      });

      expect(assignment.shareCode).toBe("ABC123");
      expect(assignment.title).toBe("Addition Practice");
      expect(assignment.teacherId).toBe(teacher.id);
    });

    it("enforces unique share codes", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);

      await seedAssignment(teacher.id, topic.id, { shareCode: "UNIQUE1" });

      await expect(
        seedAssignment(teacher.id, topic.id, { shareCode: "UNIQUE1" })
      ).rejects.toThrow();
    });

    it("looks up assignment by share code", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);

      await seedAssignment(teacher.id, topic.id, {
        shareCode: "FIND01",
        title: "Findable Assignment",
      });

      const db = getTestDb();
      const [found] = await db
        .select()
        .from(schema.assignments)
        .where(eq(schema.assignments.shareCode, "FIND01"));

      expect(found.title).toBe("Findable Assignment");
    });
  });

  describe("assignment_responses table", () => {
    it("stores an authenticated response", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const student = await seedUser({ name: "Student" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);
      const problem = await seedAssessmentContent(topic.id);
      const assignment = await seedAssignment(teacher.id, topic.id, { shareCode: "RESP01" });

      const db = getTestDb();
      const [response] = await db
        .insert(schema.assignmentResponses)
        .values({
          id: "ar-1",
          assignmentId: assignment.id,
          userId: student.id,
          questionId: problem.id,
          answer: "4",
          correct: true,
          createdAt: new Date().toISOString(),
        })
        .returning();

      expect(response.userId).toBe(student.id);
      expect(response.correct).toBe(true);
    });

    it("stores an anonymous response", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);
      const problem = await seedAssessmentContent(topic.id);
      const assignment = await seedAssignment(teacher.id, topic.id, { shareCode: "ANON01" });

      const db = getTestDb();
      const [response] = await db
        .insert(schema.assignmentResponses)
        .values({
          id: "ar-2",
          assignmentId: assignment.id,
          anonymousToken: "anon-uuid-123",
          questionId: problem.id,
          answer: "5",
          correct: false,
          createdAt: new Date().toISOString(),
        })
        .returning();

      expect(response.userId).toBeNull();
      expect(response.anonymousToken).toBe("anon-uuid-123");
    });

    it("queries responses per assignment", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);
      const problem = await seedAssessmentContent(topic.id);
      const assignment = await seedAssignment(teacher.id, topic.id, { shareCode: "MULTI1" });

      const db = getTestDb();
      const now = new Date().toISOString();
      await db.insert(schema.assignmentResponses).values([
        { id: "ar-3", assignmentId: assignment.id, anonymousToken: "t1", questionId: problem.id, answer: "4", correct: true, createdAt: now },
        { id: "ar-4", assignmentId: assignment.id, anonymousToken: "t2", questionId: problem.id, answer: "3", correct: false, createdAt: now },
        { id: "ar-5", assignmentId: assignment.id, userId: "some-user", questionId: problem.id, answer: "4", correct: true, createdAt: now },
      ]);

      const responses = await db
        .select()
        .from(schema.assignmentResponses)
        .where(eq(schema.assignmentResponses.assignmentId, assignment.id));

      expect(responses).toHaveLength(3);
      expect(responses.filter((r) => r.correct).length).toBe(2);
    });
  });

  describe("org roles", () => {
    it("supports expanded roles: owner, admin, teacher, student", async () => {
      const owner = await seedUser({ name: "Owner" });
      const admin = await seedUser({ name: "Admin" });
      const teacher = await seedUser({ name: "Teacher" });
      const student = await seedUser({ name: "Student" });

      const db = getTestDb();
      const now = new Date().toISOString();
      const orgId = "org-school";
      await db.insert(schema.organizations).values({
        id: orgId,
        name: "Test School",
        slug: "test-school",
        createdAt: now,
      });

      const roles = [
        { id: "m1", userId: owner.id, role: "owner" },
        { id: "m2", userId: admin.id, role: "admin" },
        { id: "m3", userId: teacher.id, role: "teacher" },
        { id: "m4", userId: student.id, role: "student" },
      ];

      for (const r of roles) {
        await db.insert(schema.members).values({
          ...r,
          organizationId: orgId,
          createdAt: now,
        });
      }

      const members = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.organizationId, orgId));

      expect(members).toHaveLength(4);
      const roleValues = members.map((m) => m.role).sort();
      expect(roleValues).toEqual(["admin", "owner", "student", "teacher"]);
    });
  });

  describe("independent signup", () => {
    it("user works without org membership", async () => {
      const user = await seedUser({ name: "Independent Learner" });
      const db = getTestDb();

      // User has no org membership
      const memberships = await db
        .select()
        .from(schema.members)
        .where(eq(schema.members.userId, user.id));
      expect(memberships).toHaveLength(0);

      // User can still have learning state
      const subject = await seedSubject();
      const topic = await seedTopic(subject.id);
      await db.insert(schema.userTopicState).values({
        userId: user.id,
        topicId: topic.id,
        stability: 1.0,
        difficulty: 0.5,
        due: new Date().toISOString(),
        state: 0,
        reps: 0,
        lapses: 0,
        mastered: false,
        frontier: true,
      });

      const [state] = await db
        .select()
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.userId, user.id));

      expect(state.frontier).toBe(true);
    });
  });

  describe("account links + org independence", () => {
    it("account link works independently of org membership", async () => {
      const teacher = await seedUser({ name: "External Teacher" });
      const student = await seedUser({ name: "Student" });

      // Teacher links to student — no shared org needed
      const link = await seedAccountLink(teacher.id, student.id, "teacher");
      expect(link.status).toBe("active");

      // Teacher can see student progress via link, not via org
      const db = getTestDb();
      const activeLinks = await db
        .select()
        .from(schema.accountLinks)
        .where(eq(schema.accountLinks.fromUserId, teacher.id));
      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0].toUserId).toBe(student.id);
    });
  });
});
