import { Hono } from "hono";
import type { Env } from "../index.js";
import { getDb } from "../db/index.js";
import { createLLMService } from "../services/llm.js";

export const llmRoutes = new Hono<Env>();

llmRoutes.post("/evaluate", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY);
  const body = await c.req.json<{
    userId: string;
    topicName: string;
    stepDescription: string;
    studentExplanation: string;
  }>();
  const result = await llm.evaluateExplanation(
    body.userId,
    body.topicName,
    body.stepDescription,
    body.studentExplanation
  );
  return c.json(result);
});

llmRoutes.post("/tutor", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY);
  const body = await c.req.json<{
    userId: string;
    topicName: string;
    problemQuestion: string;
    studentResponse: string;
    conversationHistory?: { role: "system" | "user" | "assistant"; content: string }[];
  }>();
  const result = await llm.socraticTutor(
    body.userId,
    body.topicName,
    body.problemQuestion,
    body.studentResponse,
    body.conversationHistory
  );
  return c.json(result);
});

llmRoutes.post("/grade", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY);
  const body = await c.req.json<{
    userId: string;
    topicName: string;
    question: string;
    correctAnswer: string;
    studentAnswer: string;
  }>();
  const result = await llm.gradeResponse(
    body.userId,
    body.topicName,
    body.question,
    body.correctAnswer,
    body.studentAnswer
  );
  return c.json(result);
});

llmRoutes.get("/usage/:userId", async (c) => {
  const db = getDb(c.env.DB);
  const llm = createLLMService(db, c.env.OPENROUTER_API_KEY);
  const result = await llm.getUsage(c.req.param("userId"));
  return c.json(result);
});
