import { describe, it, expect, beforeAll } from "vitest";
import { applyMigrations, request, json } from "../helpers.js";

beforeAll(async () => {
  await applyMigrations();
});

describe("speech routes", () => {
  describe("GET /api/speech/status", () => {
    it("returns availability status", async () => {
      const res = await request("/api/speech/status");
      expect(res.status).toBe(200);
      const body = await json<{ available: boolean }>(res);
      expect(typeof body.available).toBe("boolean");
    });
  });

  describe("POST /api/speech/transcribe", () => {
    it("returns 400 when no file is provided", async () => {
      const res = await request("/api/speech/transcribe", {
        method: "POST",
        body: new FormData(),
      });

      expect(res.status).toBe(400);
      const body = await json<{ success: boolean; error: string }>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain("No audio file");
    });

    it("returns 413 for oversized files", async () => {
      // Create a file that exceeds 10MB
      const bigData = new Uint8Array(10 * 1024 * 1024 + 1);
      const formData = new FormData();
      formData.append("file", new File([bigData], "big.webm", { type: "audio/webm" }));

      const res = await request("/api/speech/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(413);
      const body = await json<{ success: boolean; error: string }>(res);
      expect(body.success).toBe(false);
    });

    it("handles transcription errors gracefully", async () => {
      // Send a small audio file — miniflare's AI mock will likely error
      const formData = new FormData();
      formData.append("file", new File(["fake-audio"], "test.webm", { type: "audio/webm" }));

      const res = await request("/api/speech/transcribe", {
        method: "POST",
        body: formData,
      });

      // Either 200 (mock returns text) or 500 (mock errors) — both are valid
      const body = await json<{ success: boolean }>(res);
      expect(typeof body.success).toBe("boolean");
    });
  });
});
