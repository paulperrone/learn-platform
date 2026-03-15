import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  request,
  json,
  seedUser,
  seedDiscipline,
  seedTopic,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("GET /api/learn/session-status", () => {
  it("returns 400 without userId", async () => {
    const res = await request("/api/learn/session-status");
    expect(res.status).toBe(400);
  });

  it("returns default status for new user", async () => {
    const user = await seedUser({ id: "ss-user-1" });
    const res = await request(`/api/learn/session-status?userId=${user.id}`);
    expect(res.status).toBe(200);

    const body = await json<{
      assessmentPending: boolean;
      reviewsDue: number;
      newTopicsAvailable: number;
      pacingFactor: number;
    }>(res);

    expect(body.assessmentPending).toBe(false);
    expect(body.reviewsDue).toBe(0);
    expect(body.newTopicsAvailable).toBeGreaterThanOrEqual(0);
    expect(body.pacingFactor).toBe(1.0);
  });

  it("reflects pending assessment from learning state", async () => {
    const db = getTestDb();
    const user = await seedUser({ id: "ss-user-2" });
    const disc = await seedDiscipline({ id: "ss-disc" });
    await seedTopic(disc.id, { id: "ss-topic-1" });

    // Create an assessment session to reference
    const now = new Date().toISOString();
    await db.insert(schema.assessmentSessions).values({
      id: "ss-assess-1",
      userId: user.id,
      status: "active",
      scopeJson: JSON.stringify({ type: "calibration", disciplineId: disc.id }),
      configJson: JSON.stringify({ questionCount: 10 }),
      questionsJson: JSON.stringify([{ topicId: "ss-topic-1" }]),
      startedAt: now,
    });

    // Set pending assessment in learning state
    await db.insert(schema.userLearningState).values({
      userId: user.id,
      pendingAssessmentId: "ss-assess-1",
      topicsIntroducedSinceAssessment: 5,
      pacingFactor: 1.3,
      updatedAt: now,
    });

    const res = await request(`/api/learn/session-status?userId=${user.id}`);
    expect(res.status).toBe(200);

    const body = await json<{
      assessmentPending: boolean;
      assessmentSessionId: string;
      pacingFactor: number;
    }>(res);

    expect(body.assessmentPending).toBe(true);
    expect(body.assessmentSessionId).toBe("ss-assess-1");
    expect(body.pacingFactor).toBe(1.3);
  });
});
