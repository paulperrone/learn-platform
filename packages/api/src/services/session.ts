import { eq, and, isNull } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createSRSService } from "./srs.js";
import type { Problem, WorkedExample, SessionPhase } from "@learn/shared";

type SessionState = {
  sessionId: string;
  userId: string;
  currentTopicId: string | null;
  currentPhase: SessionPhase;
  phaseIndex: number; // Track progression within a topic
  topicsCompleted: string[];
  reviewsCompleted: number;
  totalCorrect: number;
  totalAttempts: number;
};

// In-memory cache — D1 is the source of truth
const activeSessions = new Map<string, SessionState>();

export function createSessionService(db: DB) {
  const graph = createGraphService(db);
  const srs = createSRSService(db);

  function getTopicProblems(topic: typeof schema.topics.$inferSelect): Problem[] {
    if (!topic.problemsJson) return [];
    try {
      return JSON.parse(topic.problemsJson);
    } catch {
      return [];
    }
  }

  function getTopicExamples(topic: typeof schema.topics.$inferSelect): WorkedExample[] {
    if (!topic.examplesJson) return [];
    try {
      return JSON.parse(topic.examplesJson);
    } catch {
      return [];
    }
  }

  function selectProblem(problems: Problem[], difficulty: string, exclude: string[] = []): Problem | null {
    const filtered = problems.filter(
      (p) => p.difficulty === difficulty && !exclude.includes(p.id)
    );
    if (filtered.length === 0) {
      // Fall back to any problem not excluded
      const anyAvailable = problems.filter((p) => !exclude.includes(p.id));
      return anyAvailable.length > 0 ? anyAvailable[Math.floor(Math.random() * anyAvailable.length)] : null;
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  /** Persist session state to D1 (write-through) */
  async function persistState(state: SessionState): Promise<void> {
    await db
      .update(schema.learnSessions)
      .set({
        stateJson: JSON.stringify(state),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.learnSessions.id, state.sessionId));
  }

  /** Load session state from D1 into in-memory cache (read-through) */
  async function loadState(sessionId: string): Promise<SessionState | undefined> {
    const row = await db.query.learnSessions.findFirst({
      where: eq(schema.learnSessions.id, sessionId),
    });
    if (!row?.stateJson || row.endedAt) return undefined;
    try {
      const state: SessionState = JSON.parse(row.stateJson);
      activeSessions.set(sessionId, state);
      return state;
    } catch {
      return undefined;
    }
  }

  return {
    /**
     * Start a new learning session.
     */
    async startSession(userId: string): Promise<{
      sessionId: string;
      firstItem: SessionItem;
    }> {
      const sessionId = crypto.randomUUID();

      // End any existing active session for this user
      const stale = await db.query.learnSessions.findFirst({
        where: and(
          eq(schema.learnSessions.userId, userId),
          isNull(schema.learnSessions.endedAt),
        ),
      });
      if (stale) {
        await this.endSession(stale.id);
      }

      // Get session mix
      const mix = await srs.getSessionMix(userId, 10);

      // Pick first topic
      const firstTopic = mix.items[0];
      if (!firstTopic) {
        // No topics available — everything mastered or no content
        const dbSession = await db.insert(schema.learnSessions).values({
          id: sessionId,
          userId,
          endedAt: new Date().toISOString(),
        }).returning();

        return {
          sessionId,
          firstItem: { type: "complete", message: "All caught up! No topics to study right now." },
        };
      }

      const state: SessionState = {
        sessionId,
        userId,
        currentTopicId: firstTopic.topicId,
        currentPhase: firstTopic.type === "review" ? "review" : "pretest",
        phaseIndex: 0,
        topicsCompleted: [],
        reviewsCompleted: 0,
        totalCorrect: 0,
        totalAttempts: 0,
      };
      activeSessions.set(sessionId, state);

      // Create DB record with initial state
      await db.insert(schema.learnSessions).values({
        id: sessionId,
        userId,
        stateJson: JSON.stringify(state),
      });

      return {
        sessionId,
        firstItem: await this.buildPhaseItem(state),
      };
    },

    /**
     * Get the current session state and next item.
     */
    async getSession(sessionId: string) {
      let state = activeSessions.get(sessionId);
      if (!state) {
        state = await loadState(sessionId);
      }
      if (!state) return null;
      return {
        ...state,
        currentItem: await this.buildPhaseItem(state),
      };
    },

    /**
     * Process a student's response and advance the session.
     */
    async respond(
      sessionId: string,
      response: {
        answer?: string;
        correct?: boolean;
        confidence?: number;
        responseMs: number;
        selfExplanation?: string;
      }
    ): Promise<SessionItem> {
      let state = activeSessions.get(sessionId);
      if (!state) {
        state = await loadState(sessionId);
      }
      if (!state || !state.currentTopicId) {
        return { type: "complete", message: "Session not found or completed." };
      }

      const topic = await graph.getTopic(state.currentTopicId);
      if (!topic) {
        return { type: "error", message: "Topic not found." };
      }

      state.totalAttempts++;

      // Determine rating from response
      const isCorrect = response.correct ?? false;
      if (isCorrect) state.totalCorrect++;
      const rating: Grade = isCorrect ? Rating.Good : Rating.Again;

      // Record review
      await srs.scheduleReview(
        state.userId,
        state.currentTopicId,
        rating,
        response.responseMs,
        state.currentPhase,
        response.confidence
      );

      // Apply FIRe credit
      await srs.applyFIReCredit(state.userId, state.currentTopicId, rating);

      // Advance through learning phases
      const result = await this.advancePhase(state, isCorrect);

      // Write-through: persist after every phase transition
      if (result.type !== "complete") {
        await persistState(state);
      }

      return result;
    },

    /**
     * Advance to the next phase/topic based on the learning loop.
     *
     * Phase progression for NEW topics:
     * 1. PRETEST → student likely fails, primes schemas
     * 2. INSTRUCTION → worked example + self-explanation prompt
     * 3. GUIDED → partially scaffolded problems, fading support
     * 4. INDEPENDENT → full problems, target ~80% accuracy
     * 5. REVIEW → scheduled by FSRS
     *
     * For REVIEW topics, goes straight to independent practice.
     * On failure → REMEDIATION (trace prereq chain).
     */
    async advancePhase(state: SessionState, wasCorrect: boolean): Promise<SessionItem> {
      const phases: SessionPhase[] = ["pretest", "instruction", "guided", "independent"];

      if (!wasCorrect && state.currentPhase === "independent") {
        // Failed independent practice — remediation
        state.currentPhase = "remediation";
        state.phaseIndex = 0;
        return await this.buildPhaseItem(state);
      }

      if (state.currentPhase === "remediation") {
        if (wasCorrect) {
          // Recovery — back to independent
          state.currentPhase = "independent";
          state.phaseIndex = 0;
          return await this.buildPhaseItem(state);
        }
        // Still struggling — provide more remediation
        state.phaseIndex++;
        return await this.buildPhaseItem(state);
      }

      if (state.currentPhase === "review") {
        state.reviewsCompleted++;
        // Review done — move to next topic
        return await this.nextTopic(state);
      }

      // Progress through phases
      const currentIdx = phases.indexOf(state.currentPhase);
      if (currentIdx < phases.length - 1) {
        state.currentPhase = phases[currentIdx + 1];
        state.phaseIndex = 0;
        return await this.buildPhaseItem(state);
      }

      // Completed all phases for this topic
      state.topicsCompleted.push(state.currentTopicId!);
      return await this.nextTopic(state);
    },

    /**
     * Move to the next topic in the session mix.
     */
    async nextTopic(state: SessionState): Promise<SessionItem> {
      const mix = await srs.getSessionMix(state.userId, 10);

      // Find a topic we haven't completed in this session
      const next = mix.items.find(
        (item) => !state.topicsCompleted.includes(item.topicId)
      );

      if (!next) {
        // Session complete
        await this.endSession(state.sessionId);
        return {
          type: "complete",
          message: `Session complete! Topics studied: ${state.topicsCompleted.length}, Reviews: ${state.reviewsCompleted}, Accuracy: ${state.totalAttempts > 0 ? Math.round((state.totalCorrect / state.totalAttempts) * 100) : 0}%`,
        };
      }

      state.currentTopicId = next.topicId;
      state.currentPhase = next.type === "review" ? "review" : "pretest";
      state.phaseIndex = 0;

      return await this.buildPhaseItem(state);
    },

    /**
     * Build the content item for the current phase.
     */
    async buildPhaseItem(state: SessionState): Promise<SessionItem> {
      if (!state.currentTopicId) {
        return { type: "complete", message: "No current topic." };
      }

      const topic = await graph.getTopic(state.currentTopicId);
      if (!topic) {
        return { type: "error", message: "Topic not found." };
      }

      const problems = getTopicProblems(topic);
      const examples = getTopicExamples(topic);

      switch (state.currentPhase) {
        case "pretest": {
          // 1-2 problems, student likely fails — primes learning
          const problem = selectProblem(problems, "medium");
          return {
            type: "problem",
            phase: "pretest",
            topicId: topic.id,
            topicName: topic.name,
            problem: problem ?? makeFallbackProblem(topic),
            showHints: false,
            message: "Let's see what you already know. Try your best!",
          };
        }

        case "instruction": {
          // Worked example with self-explanation prompt
          const example = examples[0];
          return {
            type: "instruction",
            phase: "instruction",
            topicId: topic.id,
            topicName: topic.name,
            example: example ?? makeFallbackExample(topic),
            message: "Study this example carefully. You'll explain it in your own words.",
          };
        }

        case "guided": {
          // Partially scaffolded — give hints, easier problems
          const problem = selectProblem(problems, "easy");
          return {
            type: "problem",
            phase: "guided",
            topicId: topic.id,
            topicName: topic.name,
            problem: problem ?? makeFallbackProblem(topic),
            showHints: true,
            message: "Now try it with some help. Hints are available if you need them.",
          };
        }

        case "independent": {
          // Full problems, confidence judgment
          const problem = selectProblem(problems, "medium");
          return {
            type: "problem",
            phase: "independent",
            topicId: topic.id,
            topicName: topic.name,
            problem: problem ?? makeFallbackProblem(topic),
            showHints: false,
            askConfidence: true,
            message: "Solve this on your own. Rate your confidence after.",
          };
        }

        case "review": {
          // Spaced review — medium difficulty
          const problem = selectProblem(problems, "medium");
          return {
            type: "problem",
            phase: "review",
            topicId: topic.id,
            topicName: topic.name,
            problem: problem ?? makeFallbackProblem(topic),
            showHints: false,
            askConfidence: true,
            message: "Review time! Let's see if you remember.",
          };
        }

        case "remediation": {
          // Trace prereqs, provide simpler practice
          const prereqChain = await graph.getPrerequisiteChain(topic.id);
          const problem = selectProblem(problems, "easy");
          return {
            type: "remediation",
            phase: "remediation",
            topicId: topic.id,
            topicName: topic.name,
            problem: problem ?? makeFallbackProblem(topic),
            showHints: true,
            prerequisiteChain: prereqChain,
            message: "Let's go back to basics. Here's an easier version.",
          };
        }
      }
    },

    /**
     * End a session and update summary stats.
     */
    async endSession(sessionId: string) {
      let state = activeSessions.get(sessionId);
      if (!state) {
        state = await loadState(sessionId);
      }
      if (!state) return;

      await db
        .update(schema.learnSessions)
        .set({
          endedAt: new Date().toISOString(),
          stateJson: null,
          updatedAt: new Date().toISOString(),
          topicsAttempted: state.topicsCompleted.length,
          reviewsCompleted: state.reviewsCompleted,
          averageAccuracy:
            state.totalAttempts > 0
              ? state.totalCorrect / state.totalAttempts
              : null,
        })
        .where(eq(schema.learnSessions.id, sessionId));

      activeSessions.delete(sessionId);
    },
  };
}

// === Types ===

export type SessionItem =
  | {
      type: "problem";
      phase: SessionPhase;
      topicId: string;
      topicName: string;
      problem: Problem;
      showHints: boolean;
      askConfidence?: boolean;
      message: string;
    }
  | {
      type: "instruction";
      phase: "instruction";
      topicId: string;
      topicName: string;
      example: WorkedExample;
      message: string;
    }
  | {
      type: "remediation";
      phase: "remediation";
      topicId: string;
      topicName: string;
      problem: Problem;
      showHints: boolean;
      prerequisiteChain: string[];
      message: string;
    }
  | { type: "complete"; message: string }
  | { type: "error"; message: string };

// Fallbacks when no pre-generated content exists
function makeFallbackProblem(topic: typeof schema.topics.$inferSelect): Problem {
  return {
    id: `fallback-${topic.id}`,
    topicId: topic.id,
    difficulty: "medium",
    question: `Practice problem for: ${topic.name}\n\n${topic.description}\n\n(Content will be generated via the content pipeline.)`,
    answer: "",
    hints: ["Think about what you've learned about this topic."],
    solution: "This is a placeholder. Content generation coming in Phase 5.",
  };
}

function makeFallbackExample(topic: typeof schema.topics.$inferSelect): WorkedExample {
  return {
    id: `fallback-ex-${topic.id}`,
    topicId: topic.id,
    title: topic.name,
    steps: [
      {
        subgoalLabel: "Understand the concept",
        instruction: topic.description,
        work: "See the description above.",
        explanation: "This is a placeholder worked example.",
      },
    ],
  };
}
