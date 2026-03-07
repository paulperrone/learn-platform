import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  seedUser,
  seedSubject,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedPrerequisite,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { createDiagnosticService } from "../../services/diagnostic.js";
import { buildDefaultDistribution } from "../../services/content.js";

let seeded = false;

beforeAll(async () => {
  await applyMigrations();
  if (!seeded) {
    // Subject with a discipline
    await seedSubject({ id: "pres-subj", name: "Math Pres Test" });

    // 4 topics with prerequisites: t1 -> t2 -> t3, t1 -> t4
    await seedTopic("pres-subj", { id: "pres-t1", name: "Counting", depth: 0, gradeLevel: 0 });
    await seedTopic("pres-subj", { id: "pres-t2", name: "Addition", depth: 1, gradeLevel: 1 });
    await seedTopic("pres-subj", { id: "pres-t3", name: "Multiplication", depth: 2, gradeLevel: 2 });
    await seedTopic("pres-subj", { id: "pres-t4", name: "Subtraction", depth: 1, gradeLevel: 1 });
    await seedPrerequisite("pres-t1", "pres-t2");
    await seedPrerequisite("pres-t2", "pres-t3");
    await seedPrerequisite("pres-t1", "pres-t4");

    // Assessment content for each topic
    await seedAssessmentContent("pres-t1", { id: "pres-ac1", question: "Count to 3", answer: "3" });
    await seedAssessmentContent("pres-t2", { id: "pres-ac2", question: "1 + 1 = ?", answer: "2" });
    await seedAssessmentContent("pres-t3", { id: "pres-ac3", question: "2 x 3 = ?", answer: "6" });
    await seedAssessmentContent("pres-t4", { id: "pres-ac4", question: "3 - 1 = ?", answer: "2" });

    // Instructional content
    await seedInstructionalContent("pres-t1", { id: "pres-ic1" });

    seeded = true;
  }
});

describe("diagnostic presentation distribution seeding", () => {
  it("authenticated diagnostic creates user_subject_presentation row", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: `pres-user-${Date.now()}` });
    const diagnostic = createDiagnosticService(db);

    const startResult = await diagnostic.startDiagnostic({
      userId: user.id,
      subjectId: "pres-subj",
      isTaste: true,
    });
    expect(startResult).not.toHaveProperty("error");
    const { sessionId, question } = startResult as { sessionId: string; question: any };

    // Answer all questions until done
    let done = false;
    let currentAnswer = question?.problem?.answer ?? "0";
    let sid = sessionId;
    let attempts = 0;
    while (!done && attempts < 30) {
      attempts++;
      const resp = await diagnostic.respond(sid, currentAnswer);
      if ("error" in resp) break;
      done = resp.done;
      if (!done && resp.question) {
        currentAnswer = resp.question.problem?.answer ?? "0";
      }
    }
    expect(done).toBe(true);

    // Check that a distribution row was created
    const distRow = await db.query.userSubjectPresentation.findFirst({
      where: and(
        eq(schema.userSubjectPresentation.userId, user.id),
        eq(schema.userSubjectPresentation.subjectId, "pres-subj"),
      ),
    });
    expect(distRow).toBeDefined();
    expect(distRow!.centerLevel).toBeDefined();

    // Weights should sum to 1.0
    const weightSum =
      distRow!.primaryWeight +
      distRow!.intermediateWeight +
      distRow!.standardWeight +
      distRow!.advancedWeight;
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it("anonymous diagnostic does NOT create distribution row", async () => {
    const db = getTestDb();
    const diagnostic = createDiagnosticService(db);
    const token = `anon-pres-${Date.now()}`;

    const startResult = await diagnostic.startDiagnostic({
      anonymousToken: token,
      subjectId: "pres-subj",
      isTaste: true,
    });
    expect(startResult).not.toHaveProperty("error");
    const { sessionId, question } = startResult as { sessionId: string; question: any };

    let done = false;
    let currentAnswer = question?.problem?.answer ?? "0";
    let attempts = 0;
    while (!done && attempts < 30) {
      attempts++;
      const resp = await diagnostic.respond(sessionId, currentAnswer);
      if ("error" in resp) break;
      done = resp.done;
      if (!done && resp.question) {
        currentAnswer = resp.question.problem?.answer ?? "0";
      }
    }
    expect(done).toBe(true);

    // No distribution row should exist (anonymous users can't persist)
    const rows = await db.select().from(schema.userSubjectPresentation);
    const anonRows = rows.filter((r) => r.userId === null);
    expect(anonRows.length).toBe(0);
  });

  it("user with no birthYear gets standard-centered distribution", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: `pres-noage-${Date.now()}` });
    const diagnostic = createDiagnosticService(db);

    const startResult = await diagnostic.startDiagnostic({
      userId: user.id,
      subjectId: "pres-subj",
      isTaste: true,
    });
    const { sessionId, question } = startResult as { sessionId: string; question: any };

    // Answer correctly to complete
    let done = false;
    let currentAnswer = question?.problem?.answer ?? "0";
    let attempts = 0;
    while (!done && attempts < 30) {
      attempts++;
      const resp = await diagnostic.respond(sessionId, currentAnswer);
      if ("error" in resp) break;
      done = resp.done;
      if (!done && resp.question) {
        currentAnswer = resp.question.problem?.answer ?? "0";
      }
    }

    const distRow = await db.query.userSubjectPresentation.findFirst({
      where: and(
        eq(schema.userSubjectPresentation.userId, user.id),
        eq(schema.userSubjectPresentation.subjectId, "pres-subj"),
      ),
    });
    expect(distRow).toBeDefined();
    // No birthYear -> standard center
    expect(distRow!.centerLevel).toBe("standard");
  });

  it("re-running diagnostic overwrites previous distribution", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: `pres-rerun-${Date.now()}` });
    const diagnostic = createDiagnosticService(db);

    // Run first diagnostic
    const start1 = await diagnostic.startDiagnostic({
      userId: user.id,
      subjectId: "pres-subj",
      isTaste: true,
    });
    const { sessionId: sid1, question: q1 } = start1 as { sessionId: string; question: any };
    let done = false;
    let answer = q1?.problem?.answer ?? "0";
    let attempts = 0;
    while (!done && attempts < 30) {
      attempts++;
      const resp = await diagnostic.respond(sid1, answer);
      if ("error" in resp) break;
      done = resp.done;
      if (!done && resp.question) answer = resp.question.problem?.answer ?? "0";
    }

    const dist1 = await db.query.userSubjectPresentation.findFirst({
      where: and(
        eq(schema.userSubjectPresentation.userId, user.id),
        eq(schema.userSubjectPresentation.subjectId, "pres-subj"),
      ),
    });
    const firstAdjustedAt = dist1!.lastAdjustedAt;

    // Run second diagnostic (small delay for timestamp difference)
    const start2 = await diagnostic.startDiagnostic({
      userId: user.id,
      subjectId: "pres-subj",
      isTaste: true,
    });
    const { sessionId: sid2, question: q2 } = start2 as { sessionId: string; question: any };
    done = false;
    answer = q2?.problem?.answer ?? "0";
    attempts = 0;
    while (!done && attempts < 30) {
      attempts++;
      const resp = await diagnostic.respond(sid2, answer);
      if ("error" in resp) break;
      done = resp.done;
      if (!done && resp.question) answer = resp.question.problem?.answer ?? "0";
    }

    // Should still have exactly ONE distribution row (overwritten, not duplicated)
    const allDists = await db
      .select()
      .from(schema.userSubjectPresentation)
      .where(
        and(
          eq(schema.userSubjectPresentation.userId, user.id),
          eq(schema.userSubjectPresentation.subjectId, "pres-subj"),
        ),
      );
    expect(allDists.length).toBe(1);

    // lastAdjustedAt should be updated
    expect(allDists[0].lastAdjustedAt).not.toBe(firstAdjustedAt);
  });
});

describe("buildDefaultDistribution", () => {
  it("returns standard center for null birthYear", () => {
    const dist = buildDefaultDistribution(null);
    expect(dist.centerLevel).toBe("standard");
    expect(dist.standard).toBe(0.75);
  });

  it("returns primary center for young child (age ≤ 8)", () => {
    const currentYear = new Date().getFullYear();
    const dist = buildDefaultDistribution(currentYear - 6);
    expect(dist.centerLevel).toBe("primary");
    expect(dist.primary).toBeGreaterThan(0.7);
  });

  it("returns intermediate center for age 9-11", () => {
    const currentYear = new Date().getFullYear();
    const dist = buildDefaultDistribution(currentYear - 10);
    expect(dist.centerLevel).toBe("intermediate");
    expect(dist.intermediate).toBe(0.75);
  });

  it("weights always sum to 1.0", () => {
    for (const year of [null, 2020, 2015, 2012, 2008]) {
      const dist = buildDefaultDistribution(year);
      const sum = dist.primary + dist.intermediate + dist.standard + dist.advanced;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });
});
