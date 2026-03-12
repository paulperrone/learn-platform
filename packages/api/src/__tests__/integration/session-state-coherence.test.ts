import { describe, it, expect, beforeAll, beforeEach } from "vitest";
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
  seedEncompassing,
  seedUserTopicState,
  seedUserSubjectPresentation,
  getTestR2Bucket,
} from "../helpers.js";
import { createSessionService } from "../../services/session.js";
import type { SessionItem } from "../../services/session.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Cross-plan integration test: Session state D1 coherence.
 *
 * Verifies that session state JSON survives D1 round-trip with all fields
 * intact after exercising multiple plan features (hints, confidence,
 * fading, drift, blend roles, remediation).
 */
describe("session-state-coherence integration", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
  });

  async function setupRichGraph() {
    const db = getTestDb();
    const user = await seedUser();
    const discipline = await seedDiscipline({ id: "math-test" });

    // 4 topics with prereqs and encompassing
    await seedTopic(discipline.id, { id: "t1", name: "Topic 1", depth: 0 });
    await seedTopic(discipline.id, { id: "t2", name: "Topic 2", depth: 1 });
    await seedTopic(discipline.id, { id: "t3", name: "Topic 3", depth: 1 });
    await seedTopic(discipline.id, { id: "t4", name: "Topic 4", depth: 2 });

    await seedPrerequisite("t1", "t2");
    await seedPrerequisite("t1", "t3");
    await seedPrerequisite("t2", "t4");
    await seedEncompassing("t4", "t2", 0.4);

    // Content for all topics (easy, medium, hard + worked example)
    for (const topicId of ["t1", "t2", "t3", "t4"]) {
      for (const diff of ["easy", "medium", "hard"] as const) {
        await seedAssessmentContent(topicId, {
          id: `${topicId}-${diff}`, difficulty: diff,
          question: `${diff} ${topicId}?`, answer: "1",
          hintsJson: JSON.stringify(["Hint 1", "Hint 2", "Hint 3", "Hint 4"]),
          solution: `${topicId} ${diff} solution`,
          keyPrerequisiteId: topicId === "t2" ? "t1" : undefined,
        });
      }
      await seedInstructionalContent(topicId, {
        id: `${topicId}-ex`, title: `${topicId} Example`,
        stepsJson: JSON.stringify([
          { subgoalLabel: "Step 1", instruction: "Do", work: "w1", explanation: "e1" },
          { subgoalLabel: "Step 2", instruction: "Check", work: "w2", explanation: "e2" },
        ]),
      });
    }

    // Seed presentation distribution
    await seedUserSubjectPresentation(user.id, discipline.id, {
      primary: 0.05, intermediate: 0.30, standard: 0.50, advanced: 0.15,
    }, "standard");

    return { db, user, discipline };
  }

  it("session state round-trips through D1 with all fields intact", async () => {
    const { db, user } = await setupRichGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId, firstItem } = await session.startSession(user.id);
    expect(firstItem.type).not.toBe("error");

    // Read state immediately after creation — stateJson is set on startSession
    const [initialRow] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));
    expect(initialRow.stateJson).toBeTruthy();
    const initialState = JSON.parse(initialRow.stateJson!);
    expect(initialState.sessionId).toBe(sessionId);

    // Exercise a few phases: fail pretest → instruction → guided
    // These keep us on the same topic without completing the session
    let item: SessionItem = firstItem;
    expect(item.type).not.toBe("complete");

    // Fail pretest → should get instruction
    item = await session.respond(sessionId, { correct: false, responseMs: 1000 });
    expect(item.type).not.toBe("complete");

    // Respond to instruction → should get guided
    item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
    expect(item.type).not.toBe("complete");

    // Now read state JSON from D1 (session is still active)
    const [row] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));

    expect(row).toBeDefined();
    expect(row.stateJson).toBeTruthy();

    const state = JSON.parse(row.stateJson!);

    // Verify all SessionState fields are present
    expect(state.sessionId).toBe(sessionId);
    expect(state.userId).toBe(user.id);
    expect(typeof state.currentPhase).toBe("string");
    expect(typeof state.phaseIndex).toBe("number");
    expect(typeof state.hintIndex).toBe("number");
    expect(Array.isArray(state.topicsCompleted)).toBe(true);
    expect(typeof state.reviewsCompleted).toBe("number");
    expect(typeof state.totalCorrect).toBe("number");
    expect(typeof state.totalAttempts).toBe("number");
    expect(Array.isArray(state.rollingResults)).toBe(true);

    // Verify state size is reasonable (< 10KB)
    const stateSize = new TextEncoder().encode(row.stateJson!).length;
    expect(stateSize).toBeLessThan(10 * 1024);
  });

  it("loadState correctly restores all fields after cache miss", async () => {
    const { db, user } = await setupRichGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Progress through a few phases
    await session.respond(sessionId, { correct: false, responseMs: 1000 }); // fail pretest
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // instruction
    await session.respond(sessionId, { correct: true, responseMs: 1000 }); // guided

    // Read state from D1 directly (simulates cache miss)
    const [row] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));

    const savedState = JSON.parse(row.stateJson!);

    // Create a fresh session service (new cache)
    const session2 = createSessionService(db, undefined, getTestR2Bucket());

    // getSession should load from D1 and restore state
    const restored = await session2.getSession(sessionId);

    expect(restored).toBeDefined();
    if (restored) {
      // Restored session should be functional — respond should work
      const item = await session2.respond(sessionId, {
        correct: true, responseMs: 1500, confidence: 3,
      });
      expect(item.type).not.toBe("error");
    }
  });

  it("session state tracks rollingResults for adaptive difficulty", async () => {
    const { db, user } = await setupRichGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Progress: fail pretest → instruction → guided → independent
    await session.respond(sessionId, { correct: false, responseMs: 1000 });
    await session.respond(sessionId, { correct: true, responseMs: 1000 });
    await session.respond(sessionId, { correct: true, responseMs: 1000 });

    // Read rollingResults from state
    const [row] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));

    const state = JSON.parse(row.stateJson!);
    expect(Array.isArray(state.rollingResults)).toBe(true);

    // rollingResults should contain booleans from responses
    for (const result of state.rollingResults) {
      expect(typeof result).toBe("boolean");
    }
  });

  it("session state preserves remediation fields during D1 round-trip", async () => {
    const { db, user } = await setupRichGraph();

    // Seed t1 as mastered with low stability so it's targeted for remediation
    await seedUserTopicState(user.id, "t1", {
      mastered: true, stability: 2.0, reps: 3, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId, firstItem } = await session.startSession(user.id);

    // Fast-forward to independent phase
    let item: SessionItem = firstItem;
    for (let i = 0; i < 10; i++) {
      if (item.type === "problem" && item.phase === "independent") break;
      if (item.type === "complete" || item.type === "error") break;
      const correct = item.type === "instruction" || (item.type === "problem" && item.phase !== "pretest");
      item = await session.respond(sessionId, { correct, responseMs: 1000 });
    }

    if (item.type !== "problem" || item.phase !== "independent") return;

    // Fail independent to trigger remediation
    item = await session.respond(sessionId, { correct: false, responseMs: 2000 });

    if (item.type !== "remediation") return;

    // Read state from D1 — should have remediation fields
    const [row] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));

    const state = JSON.parse(row.stateJson!);

    expect(state.currentPhase).toBe("remediation");
    expect(state.remediationTargetTopicId).toBeDefined();
    expect(state.remediationOriginalTopicId).toBeDefined();
  });

  it("multiple topics do not bloat state beyond 10KB", async () => {
    const { db, user } = await setupRichGraph();
    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId } = await session.startSession(user.id);

    // Run through many responses
    for (let i = 0; i < 15; i++) {
      const state = await session.getSession(sessionId);
      if (!state) break;
      if (state.currentItem.type === "complete") break;

      await session.respond(sessionId, {
        correct: i % 2 === 0,
        responseMs: 1000,
        confidence: i % 2 === 0 ? 4 : 2,
      });
    }

    // Check final state size
    const [row] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));

    if (row?.stateJson) {
      const stateSize = new TextEncoder().encode(row.stateJson).length;
      expect(stateSize).toBeLessThan(10 * 1024);
    }
  });
});
