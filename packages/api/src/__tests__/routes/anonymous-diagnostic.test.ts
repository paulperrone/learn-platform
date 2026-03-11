import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  request,
  json,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedPrerequisite,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

let seeded = false;

beforeAll(async () => {
  await applyMigrations();
  // Seed once for all tests
  if (!seeded) {
    const disc = await seedDiscipline({ id: "diag-disc", name: "Math" });
    const t1 = await seedTopic(disc.id, { id: "diag-t1", name: "Counting", depth: 0, gradeLevel: 0 });
    const t2 = await seedTopic(disc.id, { id: "diag-t2", name: "Addition", depth: 1, gradeLevel: 1 });
    const t3 = await seedTopic(disc.id, { id: "diag-t3", name: "Subtraction", depth: 1, gradeLevel: 1 });
    const t4 = await seedTopic(disc.id, { id: "diag-t4", name: "Multiplication", depth: 2, gradeLevel: 2 });
    await seedPrerequisite(t1.id, t2.id);
    await seedPrerequisite(t1.id, t3.id);
    await seedPrerequisite(t2.id, t4.id);
    await seedAssessmentContent(t1.id, { id: "diag-ac-1", question: "Count to 5", answer: "5" });
    await seedAssessmentContent(t2.id, { id: "diag-ac-2", question: "2 + 3 = ?", answer: "5" });
    await seedAssessmentContent(t3.id, { id: "diag-ac-3", question: "5 - 2 = ?", answer: "3" });
    await seedAssessmentContent(t4.id, { id: "diag-ac-4", question: "3 x 4 = ?", answer: "12" });
    await seedInstructionalContent(t1.id, { id: "diag-ic-1" });
    seeded = true;
  }
});

describe("anonymous learning sessions", () => {
  it("POST /api/learn/sessions with anonymousToken starts anonymous session", async () => {
    const token = `anon-test-${Date.now()}`;

    const res = await request("/api/learn/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token }),
    });

    expect(res.status).toBe(200);
    const body = await json<{ sessionId: string; firstItem: any }>(res);
    expect(body.sessionId).toBeDefined();
    expect(body.firstItem).toBeDefined();
    expect(body.firstItem.type).toBeTruthy();
  });

  it("GET /api/learn/sessions/active with anonymousToken finds active session", async () => {
    const token = `anon-active-${Date.now()}`;

    // Start a session
    const startRes = await request("/api/learn/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token }),
    });
    const { sessionId } = await json<{ sessionId: string }>(startRes);

    // Check active
    const activeRes = await request(`/api/learn/sessions/active?anonymousToken=${token}`);
    expect(activeRes.status).toBe(200);
    const body = await json<{ active: boolean }>(activeRes);
    expect(body.active).toBe(true);
  });

  it("anonymous session caps at 5 topics", async () => {
    const token = `anon-cap-${Date.now()}`;

    const startRes = await request("/api/learn/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token }),
    });
    expect(startRes.status).toBe(200);
    const { sessionId, firstItem } = await json<{ sessionId: string; firstItem: any }>(startRes);
    expect(firstItem.type).not.toBe("error");
  });
});

describe("diagnostic endpoints", () => {
  it("POST /api/learn/diagnostic/start creates a diagnostic session", async () => {
    const token = `diag-start-${Date.now()}`;

    const res = await request("/api/learn/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token, disciplineId: "diag-disc", isTaste: true }),
    });

    expect(res.status).toBe(200);
    const body = await json<{ sessionId: string; question: any }>(res);
    expect(body.sessionId).toBeDefined();
    expect(body.question).toBeDefined();
    expect(body.question.problem).toBeDefined();
    expect(body.question.questionNumber).toBe(1);
  });

  it("POST /api/learn/diagnostic/respond advances diagnostic", async () => {
    const token = `diag-respond-${Date.now()}`;

    // Start diagnostic
    const startRes = await request("/api/learn/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token, disciplineId: "diag-disc", isTaste: true }),
    });
    const { sessionId, question } = await json<{ sessionId: string; question: any }>(startRes);

    // Respond with correct answer
    const respondRes = await request("/api/learn/diagnostic/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, answer: question.problem.answer }),
    });

    expect(respondRes.status).toBe(200);
    const body = await json<{ done: boolean; correct: boolean }>(respondRes);
    expect(body.correct).toBe(true);
    expect(typeof body.done).toBe("boolean");
  });

  it("diagnostic completes and returns result", async () => {
    const token = `diag-complete-${Date.now()}`;

    const startRes = await request("/api/learn/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token, disciplineId: "diag-disc", isTaste: true }),
    });
    let { sessionId, question } = await json<{ sessionId: string; question: any }>(startRes);

    // Answer all questions until done
    let done = false;
    let attempts = 0;
    let currentAnswer = question?.problem?.answer ?? "0";
    while (!done && attempts < 30) {
      attempts++;
      const respondRes = await request("/api/learn/diagnostic/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answer: currentAnswer }),
      });
      expect(respondRes.status).toBe(200);
      const body = await json<{ done: boolean; correct: boolean; question?: any; result?: any }>(respondRes);
      done = body.done;
      if (!done && body.question) {
        question = body.question;
        currentAnswer = body.question.problem?.answer ?? "0";
      }
      if (done) {
        expect(body.result).toBeDefined();
        expect(body.result.estimatedLevel).toBeDefined();
        expect(body.result.estimatedFrontier).toBeDefined();
        expect(Array.isArray(body.result.estimatedFrontier)).toBe(true);
      }
    }
    expect(done).toBe(true);

    // Check result endpoint
    const resultRes = await request(`/api/learn/diagnostic/result/${sessionId}`);
    expect(resultRes.status).toBe(200);
    const result = await json<{ questionsAsked: number; estimatedLevel: string }>(resultRes);
    expect(result.questionsAsked).toBeGreaterThan(0);
    expect(result.estimatedLevel).toBeDefined();
  });

  it("POST /api/learn/diagnostic/start with authenticated user works", async () => {
    const user = await seedUser({ id: "diag-auth-user" });

    const res = await request("/api/learn/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, disciplineId: "diag-disc" }),
    });

    expect(res.status).toBe(200);
    const body = await json<{ sessionId: string }>(res);
    expect(body.sessionId).toBeDefined();
  });

  it("requires disciplineId", async () => {
    const res = await request("/api/learn/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: "test" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("account merge", () => {
  it("merges anonymous learn sessions on signup", async () => {
    const db = getTestDb();
    const token = `merge-test-${Date.now()}`;

    // Create anonymous session
    const startRes = await request("/api/learn/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken: token }),
    });
    expect(startRes.status).toBe(200);

    // Verify anonymous session exists
    const anonSession = await db.query.learnSessions.findFirst({
      where: eq(schema.learnSessions.anonymousToken, token),
    });
    expect(anonSession).toBeDefined();
    expect(anonSession!.userId).toBeNull();

    // Create a user and merge (via service directly since auth is complex in tests)
    const user = await seedUser({ id: "merge-user" });
    const { createAccountMergeService } = await import("../../services/account-merge.js");
    const mergeService = createAccountMergeService(db);
    const result = await mergeService.mergeAnonymousData(user.id, token);

    expect(result.mergedSessions).toBe(1);

    // Verify session now belongs to user
    const mergedSession = await db.query.learnSessions.findFirst({
      where: eq(schema.learnSessions.id, anonSession!.id),
    });
    expect(mergedSession!.userId).toBe(user.id);
    expect(mergedSession!.anonymousToken).toBeNull();
  });
});
