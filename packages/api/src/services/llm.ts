import { eq, and, desc } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";

const FSRS_STATE_LABELS = ["New", "Learning", "Review", "Relearning"] as const;

/**
 * Build a compact student profile (~150-200 tokens) for LLM context injection.
 * Queries user_topic_state and recent review_log to summarize the student's
 * mastery level, recent struggles, and pace for a given topic.
 */
export async function buildStudentProfile(
  db: DB,
  userId: string,
  topicId: string
): Promise<string> {
  const [topicState, topic, recentReviews] = await Promise.all([
    db
      .select()
      .from(schema.userTopicState)
      .where(and(eq(schema.userTopicState.userId, userId), eq(schema.userTopicState.topicId, topicId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ name: schema.topics.name, gradeLevel: schema.topics.gradeLevel })
      .from(schema.topics)
      .where(eq(schema.topics.id, topicId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        rating: schema.reviewLog.rating,
        correct: schema.reviewLog.correct,
        responseMs: schema.reviewLog.responseMs,
        phase: schema.reviewLog.phase,
        confidence: schema.reviewLog.confidence,
      })
      .from(schema.reviewLog)
      .where(and(eq(schema.reviewLog.userId, userId), eq(schema.reviewLog.topicId, topicId)))
      .orderBy(desc(schema.reviewLog.createdAt))
      .limit(5),
  ]);

  const lines: string[] = ["STUDENT PROFILE:"];

  if (topic) {
    lines.push(`- Topic: ${topic.name} (Grade ${topic.gradeLevel})`);
  }

  if (topicState) {
    const stateLabel = FSRS_STATE_LABELS[topicState.state] ?? "Unknown";
    lines.push(
      `- Mastery: ${stateLabel} (${topicState.reps} reviews, ${topicState.lapses} lapses, stability ${topicState.stability.toFixed(1)})`
    );
    if (topicState.mastered) {
      lines.push("- Status: Mastered");
    }
    if (topicState.confidenceAccuracy != null) {
      lines.push(`- Confidence calibration: ${(topicState.confidenceAccuracy * 100).toFixed(0)}%`);
    }
  } else {
    lines.push("- Mastery: First encounter with this topic");
  }

  if (recentReviews.length > 0) {
    const correctCount = recentReviews.filter((r) => r.correct).length;
    const avgMs = Math.round(recentReviews.reduce((s, r) => s + r.responseMs, 0) / recentReviews.length);
    lines.push(`- Recent accuracy: ${correctCount}/${recentReviews.length} correct (last ${recentReviews.length} attempts)`);
    lines.push(`- Avg response time: ${(avgMs / 1000).toFixed(1)}s`);

    const struggles = recentReviews.filter((r) => !r.correct);
    if (struggles.length > 0) {
      const phases = [...new Set(struggles.map((s) => s.phase))].join(", ");
      lines.push(`- Struggling in phases: ${phases}`);
    }
  } else {
    lines.push("- No prior attempts on this topic");
  }

  return lines.join("\n");
}

export type ModelTier = "cheap" | "capable";

/** Default model config used when no DB overrides exist */
const DEFAULT_MODEL_MAP: Record<ModelTier, string> = {
  cheap: "anthropic/claude-haiku-4-5-20251001",
  capable: "anthropic/claude-sonnet-4-6",
};

const DEFAULT_COST_PER_M: Record<string, { input: number; output: number }> = {
  "anthropic/claude-haiku-4-5-20251001": { input: 80, output: 400 },
  "anthropic/claude-sonnet-4-6": { input: 300, output: 1500 },
};

export type ModelConfig = {
  modelMap: Record<ModelTier, string>;
  costPerM: Record<string, { input: number; output: number }>;
};

/** Load model config from DB, falling back to hardcoded defaults */
export async function getModelConfig(db: DB): Promise<ModelConfig> {
  const rows = await db.select().from(schema.llmModelConfig);

  if (rows.length === 0) {
    return { modelMap: { ...DEFAULT_MODEL_MAP }, costPerM: { ...DEFAULT_COST_PER_M } };
  }

  const modelMap: Record<string, string> = { ...DEFAULT_MODEL_MAP };
  const costPerM: Record<string, { input: number; output: number }> = { ...DEFAULT_COST_PER_M };

  for (const row of rows) {
    modelMap[row.tier] = row.modelId;
    costPerM[row.modelId] = { input: row.costInputPerM, output: row.costOutputPerM };
  }

  return { modelMap: modelMap as Record<ModelTier, string>, costPerM };
}

type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Build a locale instruction snippet for LLM system prompts. */
function localeInstruction(locale?: string): string {
  if (!locale || locale === "en") return "";
  const LOCALE_NAMES: Record<string, string> = {
    es: "Spanish", ja: "Japanese", ar: "Arabic",
    fr: "French", de: "German", pt: "Portuguese", zh: "Chinese",
  };
  const name = LOCALE_NAMES[locale] ?? locale;
  return `\n\nIMPORTANT: Respond in ${name}. Use ${name} for all explanations and feedback. Keep math notation universal (numbers, operators).`;
}

export function createLLMService(db: DB, apiKey: string, config?: ModelConfig) {
  const MODEL_MAP = config?.modelMap ?? DEFAULT_MODEL_MAP;
  const COST_PER_M = config?.costPerM ?? DEFAULT_COST_PER_M;

  function openRouterHeaders() {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://learn.perrone.dev",
      "X-Title": "Learn Platform",
    };
  }

  async function trackUsage(
    model: string,
    userId: string,
    purpose: string,
    inputTokens: number,
    outputTokens: number,
    context?: { topicId?: string; problemId?: string; sessionId?: string }
  ) {
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
      topicId: context?.topicId ?? null,
      problemId: context?.problemId ?? null,
      sessionId: context?.sessionId ?? null,
    });
  }

  async function call(
    messages: LLMMessage[],
    tier: ModelTier,
    userId: string,
    purpose: string,
    maxTokens: number = 1024,
    context?: { topicId?: string; problemId?: string; sessionId?: string }
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const model = MODEL_MAP[tier];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(),
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

    await trackUsage(model, userId, purpose, inputTokens, outputTokens, context);
    return { content, inputTokens, outputTokens };
  }

  /**
   * Streaming call to OpenRouter. Returns a ReadableStream of SSE-formatted chunks
   * and logs usage after the stream completes.
   */
  async function callStream(
    messages: LLMMessage[],
    tier: ModelTier,
    userId: string,
    purpose: string,
    maxTokens: number = 1024,
    context?: { topicId?: string; problemId?: string; sessionId?: string }
  ): Promise<{ stream: ReadableStream<Uint8Array>; response: Response }> {
    const model = MODEL_MAP[tier];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${error}`);
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
              outputTokens = parsed.usage.completion_tokens ?? outputTokens;
            }
          } catch {
            // skip unparseable lines
          }
        }
      },
      async flush() {
        // Estimate tokens if not provided by API (streaming often omits usage)
        if (outputTokens === 0 && fullContent) {
          outputTokens = Math.ceil(fullContent.length / 4);
        }
        if (inputTokens === 0) {
          const promptText = messages.map((m) => m.content).join(" ");
          inputTokens = Math.ceil(promptText.length / 4);
        }
        await trackUsage(model, userId, purpose, inputTokens, outputTokens, context);
      },
    });

    const stream = response.body.pipeThrough(transformStream);
    return { stream, response };
  }

  return {
    /**
     * Evaluate a student's self-explanation of a worked example step.
     * Injects student profile so evaluation calibrates to their level.
     */
    async evaluateExplanation(
      userId: string,
      topicName: string,
      stepDescription: string,
      studentExplanation: string,
      topicId?: string,
      locale?: string
    ) {
      const profile = topicId ? await buildStudentProfile(db, userId, topicId) : "";

      const systemContent = `You are an expert math tutor evaluating a student's self-explanation. The student is learning "${topicName}". Rate their explanation quality and provide brief feedback.

Quality levels:
- "strong": Student correctly identifies the underlying principle and connects it to prior knowledge.
- "partial": Student has the right idea but is missing key details or connections.
- "weak": Student's explanation shows little understanding of why the step works.
- "misconception": Student demonstrates a clear misunderstanding (e.g., wrong rule, inverted logic). This is critical to flag.

Respond in JSON: {"quality": "strong"|"partial"|"weak"|"misconception", "feedback": "brief encouraging feedback (2-3 sentences max, age-appropriate)", "missingConcepts": ["any key ideas they missed"], "misconceptionFlag": "description of the specific misconception if quality is misconception, otherwise null"}${profile ? `\n\n${profile}` : ""}${localeInstruction(locale)}`;

      const result = await call(
        [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: `Step being explained: ${stepDescription}\n\nStudent's explanation: ${studentExplanation}`,
          },
        ],
        "cheap",
        userId,
        "evaluate-explanation",
        1024,
        { topicId }
      );

      try {
        return JSON.parse(result.content);
      } catch {
        return { quality: "partial", feedback: result.content, missingConcepts: [], misconceptionFlag: null };
      }
    },

    /**
     * Socratic tutoring — guide a stuck student with questions, not answers.
     * Injects student profile for personalized responses when topicId is provided.
     */
    async socraticTutor(
      userId: string,
      topicName: string,
      problemQuestion: string,
      studentResponse: string,
      conversationHistory: LLMMessage[] = [],
      topicId?: string,
      locale?: string
    ) {
      const profile = topicId ? await buildStudentProfile(db, userId, topicId) : "";

      const systemContent = `You are a patient, encouraging Socratic math tutor helping a young student (K-5) with "${topicName}".

Rules:
- NEVER give the answer directly
- Ask guiding questions that lead the student to discover the answer
- Use age-appropriate language (simple words, short sentences)
- Be encouraging and positive
- If the student is very stuck, break the problem into smaller steps
- Limit your response to 2-3 sentences${profile ? `\n\n${profile}` : ""}${localeInstruction(locale)}`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemContent },
        ...conversationHistory,
        {
          role: "user",
          content: `Problem: ${problemQuestion}\n\nStudent said: ${studentResponse}`,
        },
      ];

      const result = await call(messages, "capable", userId, "socratic-tutor", 1024, { topicId });
      return { response: result.content };
    },

    /**
     * Streaming socratic tutoring — same as socraticTutor but returns an SSE stream.
     */
    async socraticTutorStream(
      userId: string,
      topicName: string,
      problemQuestion: string,
      studentResponse: string,
      conversationHistory: LLMMessage[] = [],
      topicId?: string,
      locale?: string
    ) {
      const profile = topicId ? await buildStudentProfile(db, userId, topicId) : "";

      const systemContent = `You are a patient, encouraging Socratic math tutor helping a young student (K-5) with "${topicName}".

Rules:
- NEVER give the answer directly
- Ask guiding questions that lead the student to discover the answer
- Use age-appropriate language (simple words, short sentences)
- Be encouraging and positive
- If the student is very stuck, break the problem into smaller steps
- Limit your response to 2-3 sentences${profile ? `\n\n${profile}` : ""}${localeInstruction(locale)}`;

      const messages: LLMMessage[] = [
        { role: "system", content: systemContent },
        ...conversationHistory,
        {
          role: "user",
          content: `Problem: ${problemQuestion}\n\nStudent said: ${studentResponse}`,
        },
      ];

      return callStream(messages, "capable", userId, "socratic-tutor", 1024, { topicId });
    },

    /**
     * Grade a free-text response against a known correct answer.
     */
    async gradeResponse(
      userId: string,
      topicName: string,
      question: string,
      correctAnswer: string,
      studentAnswer: string,
      locale?: string,
      context?: { topicId?: string; problemId?: string }
    ) {
      const result = await call(
        [
          {
            role: "system",
            content: `You are grading a student's math answer. The topic is "${topicName}".

Compare the student's answer to the correct answer. Accept equivalent forms (e.g., "5" and "five", "1/2" and "0.5").

Respond in JSON: {"correct": true|false, "feedback": "brief feedback"}${localeInstruction(locale)}`,
          },
          {
            role: "user",
            content: `Question: ${question}\nCorrect answer: ${correctAnswer}\nStudent's answer: ${studentAnswer}`,
          },
        ],
        "cheap",
        userId,
        "grade-response",
        1024,
        { topicId: context?.topicId, problemId: context?.problemId }
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
     * Generate a progressive hint for a problem.
     * Levels 1-2 prefer static hints from the problem bank (zero LLM cost).
     * Levels 3-4 are LLM-generated with strict "don't give the answer" prompting.
     */
    async generateHint(
      userId: string,
      topicName: string,
      problemQuestion: string,
      problemSolution: string,
      staticHints: string[],
      currentHintLevel: number,
      studentResponse?: string,
      locale?: string,
      context?: { topicId?: string; problemId?: string }
    ): Promise<{ level: number; hint: string; source: "static" | "llm"; isMaxLevel: boolean }> {
      const nextLevel = currentHintLevel + 1;

      // Levels 1-2: use static hints if available
      if (nextLevel <= 2 && staticHints.length >= nextLevel) {
        return {
          level: nextLevel,
          hint: staticHints[nextLevel - 1],
          source: "static",
          isMaxLevel: nextLevel >= 4,
        };
      }

      // Level 1 fallback: LLM-generated nudge
      if (nextLevel === 1) {
        const result = await call(
          [
            {
              role: "system",
              content: `You are a math tutor giving a brief conceptual nudge for a K-5 student working on "${topicName}". Give ONE short sentence that reminds them of the key concept without revealing the approach or answer.${localeInstruction(locale)}`,
            },
            { role: "user", content: `Problem: ${problemQuestion}` },
          ],
          "cheap",
          userId,
          "hint-nudge",
          256,
          { topicId: context?.topicId, problemId: context?.problemId }
        );
        return { level: 1, hint: result.content, source: "llm", isMaxLevel: false };
      }

      // Level 2 fallback: LLM-generated guiding question
      if (nextLevel === 2) {
        const result = await call(
          [
            {
              role: "system",
              content: `You are a math tutor helping a K-5 student with "${topicName}". Ask ONE guiding question that leads them toward the right approach. Do NOT reveal the answer or the method directly.${localeInstruction(locale)}`,
            },
            {
              role: "user",
              content: `Problem: ${problemQuestion}${studentResponse ? `\nStudent tried: ${studentResponse}` : ""}`,
            },
          ],
          "cheap",
          userId,
          "hint-guide",
          256,
          { topicId: context?.topicId, problemId: context?.problemId }
        );
        return { level: 2, hint: result.content, source: "llm", isMaxLevel: false };
      }

      // Level 3: partial solution reveal
      if (nextLevel === 3) {
        const result = await call(
          [
            {
              role: "system",
              content: `You are a math tutor helping a K-5 student with "${topicName}". Show ONLY the first step of the solution. Do NOT show the final answer. Use simple language.${localeInstruction(locale)}`,
            },
            {
              role: "user",
              content: `Problem: ${problemQuestion}\nFull solution (for your reference only): ${problemSolution}`,
            },
          ],
          "cheap",
          userId,
          "hint-partial",
          256,
          { topicId: context?.topicId, problemId: context?.problemId }
        );
        return { level: 3, hint: result.content, source: "llm", isMaxLevel: false };
      }

      // Level 4: full worked step
      const result = await call(
        [
          {
            role: "system",
            content: `You are a math tutor helping a K-5 student with "${topicName}". Walk through the solution step-by-step with explanations, but leave the final numerical answer for the student to compute. Use simple language.${localeInstruction(locale)}`,
          },
          {
            role: "user",
            content: `Problem: ${problemQuestion}\nFull solution (for your reference only): ${problemSolution}`,
          },
        ],
        "cheap",
        userId,
        "hint-worked",
        512,
        { topicId: context?.topicId, problemId: context?.problemId }
      );
      return { level: 4, hint: result.content, source: "llm", isMaxLevel: true };
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
