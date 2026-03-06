import { Hono } from "hono";
import type { Env } from "../index.js";

export const speechRoutes = new Hono<Env>();

/** Check if Workers AI speech-to-text is available */
speechRoutes.get("/status", async (c) => {
  if (!c.env.AI) {
    return c.json({ available: false });
  }

  // Probe the binding to catch auth/connectivity issues (e.g. error 1031 in local dev)
  try {
    // Run with empty audio — will fail fast but proves the binding works
    await (c.env.AI as any).run("@cf/openai/whisper-large-v3-turbo", { audio: "" });
    return c.json({ available: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Model errors (bad input) mean the binding works — AI is reachable
    if (message.includes("invalid") || message.includes("input")) {
      return c.json({ available: true });
    }
    // Connection/auth errors (1031, etc.) mean AI is not usable
    console.warn("[speech/status] AI binding unavailable:", message);
    return c.json({ available: false });
  }
});

/** Transcribe audio using Cloudflare Workers AI Whisper */
speechRoutes.post("/transcribe", async (c) => {
  if (!c.env.AI) {
    return c.json({ success: false, error: "Speech-to-text is not configured" }, 503);
  }

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: "No audio file provided" }, 400);
  }

  // 10MB max
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ success: false, error: "Audio file too large (max 10MB)" }, 413);
  }

  try {
    const audioBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);

    // Workers AI Whisper accepts base64-encoded audio
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const result = await (c.env.AI as any).run(
      "@cf/openai/whisper-large-v3-turbo",
      { audio: base64 }
    );

    const text = (result as any)?.text?.trim() || "";

    if (!text) {
      return c.json({ success: false, error: "No speech detected" });
    }

    return c.json({ success: true, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[speech/transcribe]", message);
    return c.json({ success: false, error: message }, 500);
  }
});
