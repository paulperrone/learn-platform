import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";

type ModelTier = "cheap" | "capable";

const MODEL_MAP: Record<ModelTier, string> = {
  cheap: "anthropic/claude-haiku-4-5-20251001",
  capable: "anthropic/claude-sonnet-4-6",
};

// Approximate costs per million tokens (cents)
const COST_PER_M: Record<string, { input: number; output: number }> = {
  "anthropic/claude-haiku-4-5-20251001": { input: 80, output: 400 },
  "anthropic/claude-sonnet-4-6": { input: 300, output: 1500 },
};

type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function createLLMService(db: DB, apiKey: string) {
  async function call(
    messages: LLMMessage[],
    tier: ModelTier,
    userId: string,
    purpose: string,
    maxTokens: number = 1024
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const model = MODEL_MAP[tier];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://learn.perrone.dev",
        "X-Title": "Learn Platform",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    // Track usage
    const costs = COST_PER_M[model] ?? { input: 0, output: 0 };
    const costCents =
      (inputTokens * costs.input) / 1_000_000 +
      (outputTokens * costs.output) / 1_000_000;

    await db.insert(schema.llmUsage).values({
      id: crypto.randomUUID(),
      userId,
      model,
      inputTokens,
      outputTokens,
      costCents,
      purpose,
    });

    return { content, inputTokens, outputTokens };
  }

  return {
    /**
     * Evaluate a student's self-explanation of a worked example step.
     */
    async evaluateExplanation(
      userId: string,
      topicName: string,
      stepDescription: string,
      studentExplanation: string
    ) {
      const result = await call(
        [
          {
            role: "system",
            content: `You are an expert math tutor evaluating a student's self-explanation. The student is learning "${topicName}". Rate their explanation quality and provide brief feedback.

Respond in JSON: {"quality": "good"|"partial"|"poor", "feedback": "brief encouraging feedback", "missingConcepts": ["any key ideas they missed"]}`,
          },
          {
            role: "user",
            content: `Step being explained: ${stepDescription}\n\nStudent's explanation: ${studentExplanation}`,
          },
        ],
        "cheap",
        userId,
        "evaluate-explanation"
      );

      try {
        return JSON.parse(result.content);
      } catch {
        return { quality: "partial", feedback: result.content, missingConcepts: [] };
      }
    },

    /**
     * Socratic tutoring — guide a stuck student with questions, not answers.
     */
    async socraticTutor(
      userId: string,
      topicName: string,
      problemQuestion: string,
      studentResponse: string,
      conversationHistory: LLMMessage[] = []
    ) {
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: `You are a patient, encouraging Socratic math tutor helping a young student (K-5) with "${topicName}".

Rules:
- NEVER give the answer directly
- Ask guiding questions that lead the student to discover the answer
- Use age-appropriate language (simple words, short sentences)
- Be encouraging and positive
- If the student is very stuck, break the problem into smaller steps
- Limit your response to 2-3 sentences`,
        },
        ...conversationHistory,
        {
          role: "user",
          content: `Problem: ${problemQuestion}\n\nStudent said: ${studentResponse}`,
        },
      ];

      const result = await call(messages, "capable", userId, "socratic-tutor");
      return { response: result.content };
    },

    /**
     * Grade a free-text response against a known correct answer.
     */
    async gradeResponse(
      userId: string,
      topicName: string,
      question: string,
      correctAnswer: string,
      studentAnswer: string
    ) {
      const result = await call(
        [
          {
            role: "system",
            content: `You are grading a student's math answer. The topic is "${topicName}".

Compare the student's answer to the correct answer. Accept equivalent forms (e.g., "5" and "five", "1/2" and "0.5").

Respond in JSON: {"correct": true|false, "feedback": "brief feedback"}`,
          },
          {
            role: "user",
            content: `Question: ${question}\nCorrect answer: ${correctAnswer}\nStudent's answer: ${studentAnswer}`,
          },
        ],
        "cheap",
        userId,
        "grade-response"
      );

      try {
        return JSON.parse(result.content);
      } catch {
        // Fallback: exact match
        const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
        return {
          correct: normalized(studentAnswer) === normalized(correctAnswer),
          feedback: result.content,
        };
      }
    },

    /**
     * Get LLM usage stats for a user.
     */
    async getUsage(userId: string) {
      const rows = await db
        .select()
        .from(schema.llmUsage)
        .where(eq(schema.llmUsage.userId, userId));

      const totalCostCents = rows.reduce((sum, r) => sum + r.costCents, 0);
      const byPurpose = new Map<string, { count: number; costCents: number }>();

      for (const row of rows) {
        const entry = byPurpose.get(row.purpose) ?? { count: 0, costCents: 0 };
        entry.count++;
        entry.costCents += row.costCents;
        byPurpose.set(row.purpose, entry);
      }

      return {
        totalCostCents,
        breakdown: [...byPurpose.entries()].map(([purpose, data]) => ({
          purpose,
          ...data,
        })),
      };
    },
  };
}
