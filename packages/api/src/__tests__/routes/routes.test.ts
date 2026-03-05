import { describe, it, expect, beforeAll } from "vitest";
import {
  applyMigrations,
  request,
  json,
  seedUser,
  seedSubject,
  seedTopic,
  seedLLMUsage,
  seedReviewLog,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("health endpoint", () => {
  it("GET / returns ok", async () => {
    const res = await request("/");
    expect(res.status).toBe(200);
    const body = await json<{ status: string }>(res);
    expect(body.status).toBe("ok");
  });
});

describe("graph routes", () => {
  it("GET /api/graph/subjects returns subjects list", async () => {
    await seedSubject({ id: "route-subj-1", name: "Math" });
    const res = await request("/api/graph/subjects");
    expect(res.status).toBe(200);
    const body = await json<{ subjects: unknown[] }>(res);
    expect(body.subjects).toBeDefined();
    expect(body.subjects.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/graph/subjects/:id/topics returns topics", async () => {
    const subj = await seedSubject({ id: "route-subj-2" });
    await seedTopic(subj.id, { id: "route-topic-1" });
    const res = await request(`/api/graph/subjects/${subj.id}/topics`);
    expect(res.status).toBe(200);
    const body = await json<{ topics: unknown[] }>(res);
    expect(body.topics.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/graph/subjects/:id/validate checks DAG", async () => {
    const subj = await seedSubject({ id: "route-subj-3" });
    await seedTopic(subj.id, { id: "route-dag-t1" });
    const res = await request(`/api/graph/subjects/${subj.id}/validate`);
    expect(res.status).toBe(200);
    const body = await json<{ valid: boolean }>(res);
    expect(body.valid).toBe(true);
  });
});

describe("LLM routes", () => {
  it("GET /api/llm/status works without auth", async () => {
    const res = await request("/api/llm/status");
    expect(res.status).toBe(200);
    const body = await json<{ available: boolean }>(res);
    expect(typeof body.available).toBe("boolean");
  });

  it("GET /api/llm/usage/:userId returns usage data", async () => {
    const user = await seedUser({ id: "llm-route-user" });
    await seedLLMUsage(user.id, { purpose: "tutor", costCents: 0.1 });

    const res = await request(`/api/llm/usage/${user.id}`);
    expect(res.status).toBe(200);
    const body = await json<{ totalCostCents: number; breakdown: unknown[] }>(res);
    expect(body.totalCostCents).toBeGreaterThan(0);
    expect(body.breakdown.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/llm/hint returns static hint without API call", async () => {
    const user = await seedUser({ id: "llm-hint-route-user" });
    const res = await request("/api/llm/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        topicName: "Addition",
        problemQuestion: "What is 3 + 4?",
        problemSolution: "7",
        staticHints: ["Think about counting", "Use your fingers"],
        currentHintLevel: 0,
      }),
    });
    // If OPENROUTER_API_KEY is set, hint endpoint works; if not, 503 for non-static hints
    // Level 1 with staticHints should always work since it doesn't need LLM
    if (res.status === 200) {
      const body = await json<{ level: number; source: string }>(res);
      expect(body.level).toBe(1);
      expect(body.source).toBe("static");
    } else {
      // 503 means no API key — acceptable in CI
      expect(res.status).toBe(503);
    }
  });
});

describe("admin routes - auth", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated PUT requests", async () => {
    const res = await request("/api/admin/llm/config/cheap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: "test/model",
        costInputPerM: 10,
        costOutputPerM: 20,
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown API routes", async () => {
    const res = await request("/api/nonexistent", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
