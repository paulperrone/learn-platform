import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  getTestDb,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedUserTopicState,
  seedAccountLink,
  request,
} from "./helpers.js";
import { createStandardsService } from "../services/standards.js";
import * as schema from "../db/schema.js";

describe("Standards Service", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(schema.userTopicState);
    await db.delete(schema.topics);
    await db.delete(schema.users);
    await db.delete(schema.disciplines);
  });

  it("aggregates topics by standard code", async () => {
    const svc = createStandardsService(db);
    await seedDiscipline({ id: "math" });
    const t1 = await seedTopic("math", { id: "t1", standardCode: "K.CC.1" });
    const t2 = await seedTopic("math", { id: "t2", standardCode: "K.CC.1" });
    const t3 = await seedTopic("math", { id: "t3", standardCode: "K.OA.2" });
    const t4 = await seedTopic("math", { id: "t4" }); // no standard

    const result = await svc.getStandardsForTopics([t1.id, t2.id, t3.id, t4.id]);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result["K.CC.1"].topicIds).toContain("t1");
    expect(result["K.CC.1"].topicIds).toContain("t2");
    expect(result["K.OA.2"].topicIds).toEqual(["t3"]);
    expect(result["K.CC.1"].domain).toBe("K.CC");
    expect(result["K.CC.1"].domainName).toBe("Counting and Cardinality");
  });

  it("computes mastery percentages per standard", async () => {
    const svc = createStandardsService(db);
    await seedDiscipline({ id: "math" });
    const user = await seedUser({ id: "u1" });

    // Two topics under K.CC.1, one mastered
    await seedTopic("math", { id: "cc1a", standardCode: "K.CC.1" });
    await seedTopic("math", { id: "cc1b", standardCode: "K.CC.1" });
    // One topic under K.OA.1, mastered
    await seedTopic("math", { id: "oa1", standardCode: "K.OA.1" });

    await seedUserTopicState(user.id, "cc1a", { mastered: true });
    await seedUserTopicState(user.id, "cc1b", { mastered: false });
    await seedUserTopicState(user.id, "oa1", { mastered: true });

    const { standardDetails } = await svc.getStandardsMastery(user.id, "math");

    const cc1 = standardDetails.find((s) => s.standard === "K.CC.1")!;
    expect(cc1.masteredCount).toBe(1);
    expect(cc1.topicCount).toBe(2);
    expect(cc1.percentage).toBeCloseTo(0.5);
    expect(cc1.classification).toBe("developing");

    const oa1 = standardDetails.find((s) => s.standard === "K.OA.1")!;
    expect(oa1.masteredCount).toBe(1);
    expect(oa1.topicCount).toBe(1);
    expect(oa1.classification).toBe("proficient");
  });

  it("classifies proficient ≥80%, developing 50-79%, needs-support <50%", async () => {
    const svc = createStandardsService(db);
    await seedDiscipline({ id: "math" });
    const user = await seedUser({ id: "u2" });

    // 4 topics under 2.OA.1: 4/4 mastered → proficient
    await seedTopic("math", { id: "oa1", standardCode: "2.OA.1" });
    await seedUserTopicState(user.id, "oa1", { mastered: true });

    // 2 topics under 2.OA.2: 1/2 mastered → developing
    await seedTopic("math", { id: "oa2a", standardCode: "2.OA.2" });
    await seedTopic("math", { id: "oa2b", standardCode: "2.OA.2" });
    await seedUserTopicState(user.id, "oa2a", { mastered: true });
    await seedUserTopicState(user.id, "oa2b", { mastered: false });

    // 3 topics under 2.OA.3: 0/3 mastered → needs-support
    await seedTopic("math", { id: "oa3a", standardCode: "2.OA.3" });
    await seedTopic("math", { id: "oa3b", standardCode: "2.OA.3" });
    await seedTopic("math", { id: "oa3c", standardCode: "2.OA.3" });
    // none mastered

    const { standardDetails } = await svc.getStandardsMastery(user.id, "math");

    expect(standardDetails.find((s) => s.standard === "2.OA.1")!.classification).toBe("proficient");
    expect(standardDetails.find((s) => s.standard === "2.OA.2")!.classification).toBe("developing");
    expect(standardDetails.find((s) => s.standard === "2.OA.3")!.classification).toBe("needs-support");
  });

  it("generates progress report with domain scores and topics to focus", async () => {
    const svc = createStandardsService(db);
    await seedDiscipline({ id: "math" });
    const user = await seedUser({ id: "u3" });

    await seedTopic("math", { id: "cc1", standardCode: "K.CC.1" });
    await seedTopic("math", { id: "oa1", standardCode: "K.OA.1" });
    await seedTopic("math", { id: "in-prog", name: "In Progress Topic" });

    await seedUserTopicState(user.id, "cc1", { mastered: true });
    await seedUserTopicState(user.id, "oa1", { mastered: false, reps: 3 });
    await seedUserTopicState(user.id, "in-prog", { mastered: false, reps: 2 });

    const report = await svc.generateProgressReport(user.id, "math");

    expect(report.disciplineId).toBe("math");
    expect(report.userId).toBe(user.id);
    expect(report.domainScores.length).toBeGreaterThan(0);
    expect(report.topicsToFocus.length).toBeGreaterThan(0);
    expect(report.topicsToFocus.some((t) => t.topicId === "in-prog")).toBe(true);
  });

  it("report route returns 401 without authentication", async () => {
    const res = await request("/api/reports/progress/math");
    expect(res.status).toBe(401);
  });

  it("account link check: active link allows access (DB-level)", async () => {
    const db = getTestDb();
    const teacher = await seedUser({ id: "teach-99", email: "teach99@test.com" });
    const student = await seedUser({ id: "stud-99", email: "stud99@test.com" });
    await seedAccountLink(teacher.id, student.id, "teacher");

    // Verify we can query the link (simulating what the route does)
    const { eq, and } = await import("drizzle-orm");
    const link = await db
      .select({ id: schema.accountLinks.id })
      .from(schema.accountLinks)
      .where(
        and(
          eq(schema.accountLinks.fromUserId, teacher.id),
          eq(schema.accountLinks.toUserId, student.id),
          eq(schema.accountLinks.status, "active"),
        ),
      )
      .limit(1);
    expect(link.length).toBe(1);
  });
});
