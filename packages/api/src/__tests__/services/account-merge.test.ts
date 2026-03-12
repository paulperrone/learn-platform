import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  applyMigrations,
  getTestDb,
  request,
  json,
  seedUser,
  seedDiscipline,
  seedTopic,
  seedAssessmentContent,
  seedInstructionalContent,
  seedPrerequisite,
  seedUserTopicState,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { createAccountMergeService } from "../../services/account-merge.js";

const DISCIPLINE_ID = "merge-disc";
const TOPICS = ["merge-t1", "merge-t2", "merge-t3", "merge-t4"];

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  const db = getTestDb();
  // Clean user-specific tables between tests
  await db.delete(schema.userTopicState);
  await db.delete(schema.diagnosticSessions);
  await db.delete(schema.learnSessions);
  await db.delete(schema.assignmentResponses);
  await db.delete(schema.onboardingState);
});

// Seed content once
let contentSeeded = false;
beforeAll(async () => {
  if (contentSeeded) return;
  const disc = await seedDiscipline({ id: DISCIPLINE_ID, name: "Merge Math" });
  const t1 = await seedTopic(disc.id, { id: TOPICS[0], name: "Counting", depth: 0, gradeLevel: 0 });
  const t2 = await seedTopic(disc.id, { id: TOPICS[1], name: "Addition", depth: 1, gradeLevel: 1 });
  const t3 = await seedTopic(disc.id, { id: TOPICS[2], name: "Subtraction", depth: 1, gradeLevel: 1 });
  const t4 = await seedTopic(disc.id, { id: TOPICS[3], name: "Multiplication", depth: 2, gradeLevel: 2 });
  await seedPrerequisite(t1.id, t2.id);
  await seedPrerequisite(t1.id, t3.id);
  await seedPrerequisite(t2.id, t4.id);
  await seedAssessmentContent(t1.id, { id: "merge-ac-1", question: "Count to 5", answer: "5", disciplineId: DISCIPLINE_ID });
  await seedAssessmentContent(t2.id, { id: "merge-ac-2", question: "2 + 3 = ?", answer: "5", disciplineId: DISCIPLINE_ID });
  await seedAssessmentContent(t3.id, { id: "merge-ac-3", question: "5 - 2 = ?", answer: "3", disciplineId: DISCIPLINE_ID });
  await seedAssessmentContent(t4.id, { id: "merge-ac-4", question: "3 x 4 = ?", answer: "12", disciplineId: DISCIPLINE_ID });
  await seedInstructionalContent(t1.id, { id: "merge-ic-1", disciplineId: DISCIPLINE_ID });
  contentSeeded = true;
});

/** Run an anonymous diagnostic to completion, answering all correctly */
async function runAnonymousDiagnostic(anonymousToken: string): Promise<string> {
  const startRes = await request("/api/learn/diagnostic/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousToken, disciplineId: DISCIPLINE_ID, isTaste: true }),
  });
  let { sessionId, question } = await json<{ sessionId: string; question: any }>(startRes);

  let done = false;
  let attempts = 0;
  while (!done && attempts < 30) {
    attempts++;
    const respondRes = await request("/api/learn/diagnostic/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, answer: question?.problem?.answer ?? "0" }),
    });
    const body = await json<{ done: boolean; question?: any }>(respondRes);
    done = body.done;
    if (!done && body.question) {
      question = body.question;
    }
  }

  return sessionId;
}

describe("account merge service", () => {
  it("merges anonymous diagnostic session and materializes topic state", async () => {
    const db = getTestDb();
    const anonymousToken = `merge-test-${Date.now()}`;
    const user = await seedUser({ id: `merge-user-${Date.now()}` });

    // Run anonymous diagnostic to completion
    const diagSessionId = await runAnonymousDiagnostic(anonymousToken);

    // Verify diagnostic completed with estimates
    const diagRow = await db.query.diagnosticSessions.findFirst({
      where: eq(schema.diagnosticSessions.id, diagSessionId),
    });
    expect(diagRow?.status).toBe("completed");
    expect(diagRow?.topicEstimatesJson).toBeTruthy();
    expect(diagRow?.estimatedFrontierJson).toBeTruthy();
    expect(diagRow?.anonymousToken).toBe(anonymousToken);

    // Verify no userTopicState exists yet for this user
    const preMergeStates = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));
    expect(preMergeStates).toHaveLength(0);

    // Merge
    const mergeService = createAccountMergeService(db);
    const result = await mergeService.mergeAnonymousData(user.id, anonymousToken);

    // Verify session transferred
    expect(result.mergedDiagnostics).toBe(1);

    // Verify topic state materialized
    expect(result.mergedTopicStates).toBeGreaterThan(0);

    // Verify userTopicState rows exist
    const postMergeStates = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));
    expect(postMergeStates.length).toBeGreaterThan(0);

    // Verify at least some topics are mastered or frontier
    const mastered = postMergeStates.filter((s) => s.mastered);
    const frontier = postMergeStates.filter((s) => s.frontier);
    expect(mastered.length + frontier.length).toBeGreaterThan(0);

    // Verify diagnostic session now belongs to user
    const updatedDiag = await db.query.diagnosticSessions.findFirst({
      where: eq(schema.diagnosticSessions.id, diagSessionId),
    });
    expect(updatedDiag?.userId).toBe(user.id);
    expect(updatedDiag?.anonymousToken).toBeNull();
  });

  it("merge is idempotent — second merge with same token is a no-op", async () => {
    const db = getTestDb();
    const anonymousToken = `merge-idem-${Date.now()}`;
    const user = await seedUser({ id: `merge-idem-user-${Date.now()}` });

    await runAnonymousDiagnostic(anonymousToken);

    const mergeService = createAccountMergeService(db);
    const result1 = await mergeService.mergeAnonymousData(user.id, anonymousToken);
    expect(result1.mergedDiagnostics).toBe(1);

    // Second merge — token already cleared
    const result2 = await mergeService.mergeAnonymousData(user.id, anonymousToken);
    expect(result2.mergedDiagnostics).toBe(0);
    expect(result2.mergedTopicStates).toBe(0);
  });

  it("does not overwrite existing topic state from prior learning", async () => {
    const db = getTestDb();
    const anonymousToken = `merge-existing-${Date.now()}`;
    const user = await seedUser({ id: `merge-existing-user-${Date.now()}` });

    // User already has topic state from prior learning
    await seedUserTopicState(user.id, TOPICS[0], {
      mastered: true,
      stability: 5.0,
      difficulty: 0.3,
      reps: 10,
      state: 2,
    });

    await runAnonymousDiagnostic(anonymousToken);

    const mergeService = createAccountMergeService(db);
    await mergeService.mergeAnonymousData(user.id, anonymousToken);

    // Verify existing state was NOT overwritten
    const existingState = await db.query.userTopicState.findFirst({
      where: and(
        eq(schema.userTopicState.userId, user.id),
        eq(schema.userTopicState.topicId, TOPICS[0])
      ),
    });
    expect(existingState?.stability).toBe(5.0);
    expect(existingState?.reps).toBe(10);
  });

  it("merge with no anonymous data returns zero counts", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: `merge-empty-user-${Date.now()}` });

    const mergeService = createAccountMergeService(db);
    const result = await mergeService.mergeAnonymousData(user.id, "nonexistent-token");

    expect(result.mergedSessions).toBe(0);
    expect(result.mergedDiagnostics).toBe(0);
    expect(result.mergedResponses).toBe(0);
    expect(result.mergedTopicStates).toBe(0);
  });

  it("transfers learn sessions along with diagnostic sessions", async () => {
    const db = getTestDb();
    const anonymousToken = `merge-sessions-${Date.now()}`;
    const user = await seedUser({ id: `merge-sessions-user-${Date.now()}` });

    // Start an anonymous learn session
    const startRes = await request("/api/learn/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousToken }),
    });
    expect(startRes.status).toBe(200);

    // Also run a diagnostic
    await runAnonymousDiagnostic(anonymousToken);

    const mergeService = createAccountMergeService(db);
    const result = await mergeService.mergeAnonymousData(user.id, anonymousToken);

    expect(result.mergedSessions).toBeGreaterThanOrEqual(1);
    expect(result.mergedDiagnostics).toBe(1);

    // Verify learn session transferred
    const sessions = await db
      .select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.userId, user.id));
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.every((s) => s.anonymousToken === null)).toBe(true);
  });
});

describe("frontier consistency after merge", () => {
  it("frontier topics have all required prerequisites mastered", async () => {
    const db = getTestDb();
    const anonymousToken = `frontier-merge-${Date.now()}`;
    const user = await seedUser({ id: `frontier-user-${Date.now()}` });

    await runAnonymousDiagnostic(anonymousToken);

    const mergeService = createAccountMergeService(db);
    await mergeService.mergeAnonymousData(user.id, anonymousToken);

    // Check that frontier topics have all prerequisites mastered
    const states = await db
      .select()
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, user.id));

    const frontierTopics = states.filter((s) => s.frontier);
    const masteredSet = new Set(states.filter((s) => s.mastered).map((s) => s.topicId));

    // For each frontier topic, check prerequisites are mastered
    for (const ft of frontierTopics) {
      const prereqs = await db
        .select()
        .from(schema.prerequisites)
        .where(eq(schema.prerequisites.toTopicId, ft.topicId));

      for (const prereq of prereqs) {
        if (prereq.type === "required") {
          expect(masteredSet.has(prereq.fromTopicId)).toBe(true);
        }
      }
    }
  });
});
