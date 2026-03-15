import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import { createAssessmentService } from "../services/assessment.js";
import type { Env } from "../index.js";
import type { AssessmentSessionConfig } from "@learn/shared";

type AuthUser = { id: string; name: string; email: string };

type AssessmentEnv = Env & {
  Variables: {
    user: AuthUser;
    session: Record<string, unknown>;
  };
};

export const assessmentRoutes = new Hono<AssessmentEnv>();

// Auth middleware
assessmentRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

// POST /api/assessments/start — start a new assessment session
assessmentRoutes.post("/start", async (c) => {
  const db = getDb(c.env.DB);
  const assessment = createAssessmentService(db, c.env.CONTENT);
  const userId = c.get("user").id;
  const body = await c.req.json<AssessmentSessionConfig>();

  if (!body.scope || !body.questionCount) {
    return c.json({ error: "scope and questionCount are required" }, 400);
  }
  if (body.questionCount < 1 || body.questionCount > 100) {
    return c.json({ error: "questionCount must be between 1 and 100" }, 400);
  }

  try {
    const result = await assessment.startAssessment(userId, body);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start assessment";
    return c.json({ error: message }, 400);
  }
});

// POST /api/assessments/:id/respond — submit an answer
assessmentRoutes.post("/:id/respond", async (c) => {
  const db = getDb(c.env.DB);
  const assessment = createAssessmentService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");
  const body = await c.req.json<{ answer: string; responseMs?: number }>();

  if (body.answer == null) {
    return c.json({ error: "answer is required" }, 400);
  }

  try {
    const result = await assessment.respondToAssessment(sessionId, {
      answer: body.answer,
      responseMs: body.responseMs,
    });

    // When assessment completes, clear the gate and apply pacing factor
    if (result.result) {
      const userId = c.get("user").id;
      await assessment.finishAssessmentGate(userId, sessionId, result.result.rawScore ?? 0);
    }

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record response";
    return c.json({ error: message }, 400);
  }
});

// GET /api/assessments/:id/result — get the completed result
assessmentRoutes.get("/:id/result", async (c) => {
  const db = getDb(c.env.DB);
  const assessment = createAssessmentService(db, c.env.CONTENT);
  const sessionId = c.req.param("id");

  try {
    const result = await assessment.getAssessmentResult(sessionId);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get assessment result";
    return c.json({ error: message }, 400);
  }
});

// GET /api/assessments/history — list past assessments
assessmentRoutes.get("/history", async (c) => {
  const db = getDb(c.env.DB);
  const assessment = createAssessmentService(db, c.env.CONTENT);
  const userId = c.get("user").id;

  const history = await assessment.listAssessmentHistory(userId);
  return c.json({ assessments: history });
});
