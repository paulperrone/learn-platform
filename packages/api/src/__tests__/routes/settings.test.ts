import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  request,
  json,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { SpeechSettings } from "@learn/shared";

beforeAll(async () => {
  await applyMigrations();
});

/** Sign up a user via better-auth and return the session cookie header */
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

describe("settings routes", () => {
  let parentAuth: { headers: Record<string, string>; userId: string };
  let childAuth: { headers: Record<string, string>; userId: string };

  beforeEach(async () => {
    await resetDb();
    await applyMigrations();

    // Create parent via auth API
    parentAuth = await signUpUser({
      name: "Parent",
      email: "parent@test.com",
      password: "testpass123",
    });

    // Create child via auth API, then set managedBy
    childAuth = await signUpUser({
      name: "Child",
      email: "child@test.com",
      password: "testpass123",
    });

    const db = getTestDb();
    await db
      .update(schema.users)
      .set({ managedBy: parentAuth.userId })
      .where(eq(schema.users.id, childAuth.userId));
  });

  describe("GET /api/settings", () => {
    it("returns defaults when no preferences exist", async () => {
      const res = await request("/api/settings", {
        headers: parentAuth.headers,
      });
      expect(res.status).toBe(200);

      const body = await json<SpeechSettings>(res);
      expect(body.ttsEnabled).toBe(true);
      expect(body.ttsRate).toBe(0.9);
      expect(body.ttsVoiceName).toBeNull();
      expect(body.ttsAutoRead).toBe(false);
      expect(body.sttEnabled).toBe(true);
    });

    it("returns saved preferences", async () => {
      const db = getTestDb();
      const now = new Date().toISOString();
      await db.insert(schema.userPreferences).values({
        userId: parentAuth.userId,
        ttsEnabled: false,
        ttsRate: 1.2,
        ttsVoiceName: "Samantha",
        ttsAutoRead: true,
        sttEnabled: false,
        createdAt: now,
        updatedAt: now,
      });

      const res = await request("/api/settings", {
        headers: parentAuth.headers,
      });
      expect(res.status).toBe(200);

      const body = await json<SpeechSettings>(res);
      expect(body.ttsEnabled).toBe(false);
      expect(body.ttsRate).toBe(1.2);
      expect(body.ttsVoiceName).toBe("Samantha");
      expect(body.ttsAutoRead).toBe(true);
      expect(body.sttEnabled).toBe(false);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await request("/api/settings");
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/settings", () => {
    it("creates preferences on first save", async () => {
      const res = await request("/api/settings", {
        method: "PUT",
        headers: {
          ...parentAuth.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttsRate: 1.1, ttsAutoRead: true }),
      });
      expect(res.status).toBe(200);

      const body = await json<{ success: boolean }>(res);
      expect(body.success).toBe(true);

      // Verify persisted
      const get = await request("/api/settings", {
        headers: parentAuth.headers,
      });
      const settings = await json<SpeechSettings>(get);
      expect(settings.ttsRate).toBe(1.1);
      expect(settings.ttsAutoRead).toBe(true);
      expect(settings.ttsEnabled).toBe(true); // default preserved
    });

    it("updates existing preferences", async () => {
      // First save
      await request("/api/settings", {
        method: "PUT",
        headers: {
          ...parentAuth.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttsRate: 0.8 }),
      });

      // Update
      await request("/api/settings", {
        method: "PUT",
        headers: {
          ...parentAuth.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttsRate: 1.3, sttEnabled: false }),
      });

      const get = await request("/api/settings", {
        headers: parentAuth.headers,
      });
      const settings = await json<SpeechSettings>(get);
      expect(settings.ttsRate).toBe(1.3);
      expect(settings.sttEnabled).toBe(false);
    });
  });

  describe("GET /api/settings/:childId", () => {
    it("allows parent to read child settings", async () => {
      const res = await request(`/api/settings/${childAuth.userId}`, {
        headers: parentAuth.headers,
      });
      expect(res.status).toBe(200);

      const body = await json<SpeechSettings>(res);
      expect(body.ttsEnabled).toBe(true); // defaults
    });

    it("returns 403 for non-parent user", async () => {
      const other = await signUpUser({
        name: "Other",
        email: "other@test.com",
        password: "testpass123",
      });

      const res = await request(`/api/settings/${childAuth.userId}`, {
        headers: other.headers,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/settings/:childId", () => {
    it("allows parent to update child settings", async () => {
      const res = await request(`/api/settings/${childAuth.userId}`, {
        method: "PUT",
        headers: {
          ...parentAuth.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttsAutoRead: true, ttsRate: 0.7 }),
      });
      expect(res.status).toBe(200);

      // Verify
      const get = await request(`/api/settings/${childAuth.userId}`, {
        headers: parentAuth.headers,
      });
      const settings = await json<SpeechSettings>(get);
      expect(settings.ttsAutoRead).toBe(true);
      expect(settings.ttsRate).toBe(0.7);
    });

    it("returns 403 for non-parent user", async () => {
      const other = await signUpUser({
        name: "Other2",
        email: "other2@test.com",
        password: "testpass123",
      });

      const res = await request(`/api/settings/${childAuth.userId}`, {
        method: "PUT",
        headers: {
          ...other.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttsAutoRead: true }),
      });
      expect(res.status).toBe(403);
    });
  });
});
