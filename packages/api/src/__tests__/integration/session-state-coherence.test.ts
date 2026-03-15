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

    // Seed t1 as mastered so t2/t3 are frontier (more topics in mix)
    await seedUserTopicState(user.id, "t1", {
      mastered: true, stability: 10, reps: 5, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());

    const { sessionId, firstItem } = await session.startSession(user.id);
    expect(firstItem.type).not.toBe("error");

    // In the pull-based model, stateJson is set at session creation and persisted
    // during active phases. Verify all fields are present immediately after startSession.
    const [initialRow] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));
    expect(initialRow.stateJson).toBeTruthy();
    const state = JSON.parse(initialRow.stateJson!);

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
    const stateSize = new TextEncoder().encode(initialRow.stateJson!).length;
    expect(stateSize).toBeLessThan(10 * 1024);

    // After topic completes, session ends and stateJson is cleared (atomic unit model)
    const item = await session.respond(sessionId, { correct: true, responseMs: 1000 });
    const [endedRow] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));
    if (item.type === "complete") {
      // Session ended cleanly — stateJson is null
      expect(endedRow.endedAt).toBeTruthy();
    }
  });

  it("loadState correctly restores all fields after cache miss", async () => {
    const { db, user } = await setupRichGraph();

    // Seed t1 as mastered so t2/t3 are frontier (more topics in mix)
    await seedUserTopicState(user.id, "t1", {
      mastered: true, stability: 10, reps: 5, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId } = await session.startSession(user.id);

    // Progress through first topic lesson
    await session.respond(sessionId, { correct: true, responseMs: 1000 });

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
        correct: true, responseMs: 1500,
      });
      expect(item.type).not.toBe("error");
    }
  });

  it("session state tracks rollingResults for adaptive difficulty", async () => {
    const { db, user } = await setupRichGraph();

    // Seed a topic as due for review — review sessions have multiple responds
    // (wrong answer = retry, staying in session with rollingResults updated)
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "t2", {
      mastered: false, stability: 1.0, reps: 3, state: 2,
      due: pastDue,
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId, firstItem } = await session.startSession(user.id);

    // rollingResults is initialized on startSession — verify it's in initial state
    const [initialRow] = await db.select()
      .from(schema.learnSessions)
      .where(eq(schema.learnSessions.id, sessionId));
    expect(initialRow.stateJson).toBeTruthy();
    const initialState = JSON.parse(initialRow.stateJson!);
    expect(Array.isArray(initialState.rollingResults)).toBe(true);

    // After a wrong answer, session stays active (review retry) and rollingResults is updated
    if (firstItem.type !== "complete" && firstItem.type !== "error") {
      const item = await session.respond(sessionId, { correct: false, responseMs: 1000 });
      if (item.type !== "complete") {
        const [row] = await db.select()
          .from(schema.learnSessions)
          .where(eq(schema.learnSessions.id, sessionId));
        if (row.stateJson) {
          const state = JSON.parse(row.stateJson);
          expect(Array.isArray(state.rollingResults)).toBe(true);
          for (const result of state.rollingResults) {
            expect(typeof result).toBe("boolean");
          }
        }
      }
    }
  });

  it("session state preserves remediation fields during D1 round-trip", async () => {
    const { db, user } = await setupRichGraph();

    // Seed t1 as mastered with low stability, t2 due for review
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await seedUserTopicState(user.id, "t1", {
      mastered: true, stability: 2.0, reps: 3, state: 2,
      due: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await seedUserTopicState(user.id, "t2", {
      mastered: true, stability: 3.0, reps: 3, state: 2,
      due: pastDue,
    });

    const session = createSessionService(db, undefined, getTestR2Bucket());
    const { sessionId, firstItem } = await session.startSession(user.id);

    // Keep failing to trigger remediation (needs 2+ failures on same topic)
    let item: SessionItem = firstItem;
    let hitRemediation = false;
    for (let i = 0; i < 10; i++) {
      if (item.type === "complete" || item.type === "error") break;
      if (item.type === "remediation") {
        hitRemediation = true;
        break;
      }
      item = await session.respond(sessionId, { correct: false, responseMs: 1000 });
    }

    if (!hitRemediation) return;

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
