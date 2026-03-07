import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { applyMigrations, resetDb, request, json, getTestDb, seedDailyActivity } from "../helpers";
import * as schema from "../../db/schema";

beforeAll(async () => {
  await applyMigrations();
});

async function signUpUser(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ headers: Record<string, string>; userId: string }> {
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const setCookie = res.headers.get("set-cookie");
  const tokenMatch = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  const token = tokenMatch?.[1] ?? "";
  const body = await json<{ user: { id: string } }>(res);
  return {
    headers: { Cookie: `better-auth.session_token=${token}` },
    userId: body.user.id,
  };
}

describe("Activity Routes", () => {
  let userId: string;
  let headers: Record<string, string>;

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();
    const auth = await signUpUser({
      name: "Test User",
      email: "test@activity.com",
      password: "testpass123",
    });
    userId = auth.userId;
    headers = auth.headers;
  });

  describe("GET /api/activity/today", () => {
    it("returns today's progress with defaults", async () => {
      const res = await request("/api/activity/today?date=2026-03-07", { headers });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data).toMatchObject({
        date: "2026-03-07",
        minutesActive: 0,
        problemsCompleted: 0,
        goalMet: false,
        goal: { type: "minutes", target: 20 },
        progress: 0,
      });
    });

    it("returns existing activity for date", async () => {
      await seedDailyActivity(userId, "2026-03-07", { minutesActive: 12, problemsCompleted: 5 });
      const res = await request("/api/activity/today?date=2026-03-07", { headers });
      const data = await json<any>(res);
      expect(data.minutesActive).toBe(12);
      expect(data.problemsCompleted).toBe(5);
      expect(data.current).toBe(12);
      expect(data.progress).toBeCloseTo(0.6);
    });
  });

  describe("GET /api/activity/weekly", () => {
    it("returns weekly summary", async () => {
      await seedDailyActivity(userId, "2026-03-05", { minutesActive: 20, goalMet: true });
      await seedDailyActivity(userId, "2026-03-06", { minutesActive: 15, problemsCompleted: 8 });

      const res = await request("/api/activity/weekly?date=2026-03-07", { headers });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data.activeDays).toBe(2);
      expect(data.totalMinutes).toBe(35);
      expect(data.goalMetDays).toBe(1);
    });
  });

  describe("PUT /api/activity/goal", () => {
    it("creates goal config when none exists", async () => {
      const res = await request("/api/activity/goal", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "problems", target: 15 }),
      });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data).toEqual({ type: "problems", target: 15 });
    });

    it("updates existing goal config", async () => {
      await request("/api/activity/goal", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "minutes", target: 30 }),
      });

      const res = await request("/api/activity/goal", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "problems", target: 10 }),
      });
      const data = await json<any>(res);
      expect(data).toEqual({ type: "problems", target: 10 });

      const getRes = await request("/api/activity/goal", { headers });
      const goal = await json<any>(getRes);
      expect(goal).toEqual({ type: "problems", target: 10 });
    });

    it("rejects invalid target", async () => {
      const res = await request("/api/activity/goal", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "minutes", target: 0 }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/activity/record", () => {
    it("records activity and detects goal completion", async () => {
      await request("/api/activity/goal", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "minutes", target: 10 }),
      });

      const res = await request("/api/activity/record", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-03-07", minutes: 12 }),
      });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data.goalMet).toBe(true);
      expect(data.goalJustCompleted).toBe(true);
    });
  });

  describe("GET /api/activity/streak", () => {
    it("returns streak info", async () => {
      await seedDailyActivity(userId, "2026-03-05", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-06", { goalMet: true });
      await seedDailyActivity(userId, "2026-03-07", { goalMet: true });

      const res = await request("/api/activity/streak?date=2026-03-07", { headers });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data.currentStreak).toBe(3);
      expect(data.longestStreak).toBe(3);
    });

    it("returns zero streak when no activity", async () => {
      const res = await request("/api/activity/streak?date=2026-03-07", { headers });
      expect(res.status).toBe(200);
      const data = await json<any>(res);
      expect(data.currentStreak).toBe(0);
    });
  });

  describe("GET /api/activity/history", () => {
    it("returns activity history", async () => {
      await seedDailyActivity(userId, "2026-03-05", { minutesActive: 20 });
      await seedDailyActivity(userId, "2026-03-06", { minutesActive: 15 });

      const res = await request("/api/activity/history?days=7", { headers });
      expect(res.status).toBe(200);
      const data = await json<{ days: any[] }>(res);
      expect(data.days.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("requires authentication", async () => {
    const res = await request("/api/activity/today");
    expect(res.status).toBe(401);
  });
});
