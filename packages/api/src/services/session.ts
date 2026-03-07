import { eq, and, isNull } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createSRSService } from "./srs.js";
import { createContentService, type ContentQuery } from "./content.js";
import type { Problem, WorkedExample, SessionPhase, AssessmentType, VisualAsset, PresentationLevel, ContentDepthLevel } from "@learn/shared";
import { gradeProblem } from "./grading.js";

type SessionState = {
  sessionId: string;
  userId: string;
  anonymousToken?: string;
  isAnonymous?: boolean;
  currentTopicId: string | null;
  currentPhase: SessionPhase;
  phaseIndex: number; // Track progression within a topic
  topicsCompleted: string[];
  reviewsCompleted: number;
  totalCorrect: number;
  totalAttempts: number;
  lastServedPresentation?: PresentationLevel;
  lastServedSubjectId?: string;
};

// In-memory cache — D1 is the source of truth
const activeSessions = new Map<string, SessionState>();

export function createSessionService(db: DB) {
  const graph = createGraphService(db);
  const srs = createSRSService(db);
  const content = createContentService(db);

  // Legacy unfiltered queries — used only for grading (needs all problems for a topic)
  async function getAllTopicProblems(topicId: string): Promise<Problem[]> {
    const rows = await db
      .select()
      .from(schema.assessmentContent)
      .where(eq(schema.assessmentContent.topicId, topicId));
    return rows.map((r) => ({
      id: r.id,
      topicId: r.topicId,
      difficulty: r.difficulty as Problem["difficulty"],
      question: r.question,
      answer: r.answer,
      hints: JSON.parse(r.hintsJson),
      solution: r.solution,
      type: r.type as Problem["type"],
      typeProperties: r.typeProperties ? JSON.parse(r.typeProperties) : undefined,
    }));
  }

  async function resolveContentQuery(state: SessionState, topicId: string): Promise<ContentQuery> {
    const topic = await graph.getTopic(topicId);
    const subjectId = topic?.subjectId;
    const subject = subjectId
      ? await db.query.subjects.findFirst({ where: eq(schema.subjects.id, subjectId) })
      : null;
    const disciplineId = subject?.disciplineId ?? "math";

    let presentation: PresentationLevel = "standard";
    let contentDepth: ContentDepthLevel = "survey";

    if (!state.isAnonymous) {
      presentation = await content.resolvePresentation(state.userId, subjectId);
      contentDepth = await content.resolveContentDepth(state.userId, topicId, disciplineId);
    }

    // Track served presentation for drift nudging in respond()
    state.lastServedPresentation = presentation;
    state.lastServedSubjectId = subjectId ?? undefined;

    return { topicId, contentDepth, presentation };
  }

  // Types that force retrieval practice (higher learning gain than text-qa)
  const preferredTypes: AssessmentType[] = ["numerical-input", "multi-step", "matching", "multi-select"];

  function selectProblem(problems: Problem[], difficulty: string, exclude: string[] = []): Problem | null {
    const available = problems.filter((p) => !exclude.includes(p.id));
    if (available.length === 0) return null;

    const byDifficulty = available.filter((p) => p.difficulty === difficulty);
    const pool = byDifficulty.length > 0 ? byDifficulty : available;

    // Prefer diverse question types when available
    const preferred = pool.filter((p) => p.type && preferredTypes.includes(p.type));
    const candidates = preferred.length > 0 ? preferred : pool;

    return candidates[Math.floor(Math.random() * candidates.length)];
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
        await db.insert(schema.learnSessions).values({
          id: sessionId,
          userId,
          endedAt: new Date().toISOString(),
        });

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
     * Start an anonymous learning session (no auth, no FSRS).
     * Uses simple sequential topic ordering by depth.
     */
    async startAnonymousSession(anonymousToken: string, subjectId?: string): Promise<{
      sessionId: string;
      firstItem: SessionItem;
    }> {
      const sessionId = crypto.randomUUID();

      // End any existing active anonymous session for this token
      const stale = await db.query.learnSessions.findFirst({
        where: and(
          eq(schema.learnSessions.anonymousToken, anonymousToken),
          isNull(schema.learnSessions.endedAt),
        ),
      });
      if (stale) {
        await this.endSession(stale.id);
      }

      // Get frontier topics by depth (simplest first)
      const allTopics = subjectId
        ? await db.select().from(schema.topics).where(eq(schema.topics.subjectId, subjectId))
        : await db.select().from(schema.topics);

      const sorted = [...allTopics].sort((a, b) => a.depth - b.depth || a.gradeLevel - b.gradeLevel);
      const firstTopic = sorted[0];

      if (!firstTopic) {
        await db.insert(schema.learnSessions).values({
          id: sessionId,
          anonymousToken,
          endedAt: new Date().toISOString(),
        });
        return {
          sessionId,
          firstItem: { type: "complete", message: "No content available yet." },
        };
      }

      const state: SessionState = {
        sessionId,
        userId: `anon:${anonymousToken}`,
        anonymousToken,
        isAnonymous: true,
        currentTopicId: firstTopic.id,
        currentPhase: "pretest",
        phaseIndex: 0,
        topicsCompleted: [],
        reviewsCompleted: 0,
        totalCorrect: 0,
        totalAttempts: 0,
      };
      activeSessions.set(sessionId, state);

      await db.insert(schema.learnSessions).values({
        id: sessionId,
        anonymousToken,
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
        hintsUsed?: number;
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

      // Server-side grading when answer is provided
      let isCorrect = response.correct ?? false;
      if (response.answer != null) {
        const problems = await getAllTopicProblems(state.currentTopicId);
        const problem = problems.find((p) => p.id === (response as any).problemId) ?? problems[0];
        if (problem) {
          const gradeResult = gradeProblem(problem, response.answer);
          isCorrect = gradeResult.correct;
        }
      }
      if (isCorrect) state.totalCorrect++;

      const hintsUsed = response.hintsUsed ?? 0;
      let rating: Grade = isCorrect ? Rating.Good : Rating.Again;

      // Cap rating based on hints used:
      // 0-1 hints: no change
      // 2 hints (guiding question): cap at Good (3)
      // 3 hints (partial reveal): cap at Hard (2)
      // 4+ hints (worked step): force Again (1)
      if (isCorrect && hintsUsed >= 4) {
        rating = Rating.Again;
      } else if (isCorrect && hintsUsed >= 3) {
        rating = Math.min(rating, Rating.Hard) as Grade;
      } else if (isCorrect && hintsUsed >= 2) {
        rating = Math.min(rating, Rating.Good) as Grade;
      }

      // Record review (skip for anonymous — no persistent SRS state)
      if (!state.isAnonymous) {
        await srs.scheduleReview(
          state.userId,
          state.currentTopicId,
          rating,
          response.responseMs,
          state.currentPhase,
          response.confidence,
          hintsUsed,
          (response as any).problemId
        );

        // Apply FIRe credit
        await srs.applyFIReCredit(state.userId, state.currentTopicId, rating);

        // Nudge presentation distribution based on performance
        if (state.lastServedPresentation && state.lastServedSubjectId) {
          await content.applyNudge(
            state.userId,
            state.lastServedSubjectId,
            state.lastServedPresentation,
            isCorrect,
          );
        }
      }

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
      if (!state.isAnonymous) {
        await this.markDepthCompletionIfNeeded(state);
      }
      state.topicsCompleted.push(state.currentTopicId!);
      return await this.nextTopic(state);
    },

    /**
     * Move to the next topic in the session mix.
     */
    async nextTopic(state: SessionState): Promise<SessionItem> {
      if (state.isAnonymous) {
        return await this.nextAnonymousTopic(state);
      }

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

    async nextAnonymousTopic(state: SessionState): Promise<SessionItem> {
      // Anonymous: simple sequential by depth, cap at 5 topics per session
      const MAX_ANON_TOPICS = 5;
      if (state.topicsCompleted.length >= MAX_ANON_TOPICS) {
        await this.endSession(state.sessionId);
        return {
          type: "complete",
          message: `Nice work! You completed ${state.topicsCompleted.length} topics with ${state.totalAttempts > 0 ? Math.round((state.totalCorrect / state.totalAttempts) * 100) : 0}% accuracy. Create an account to save your progress and continue learning!`,
        };
      }

      const allTopics = await db.select().from(schema.topics);
      const sorted = [...allTopics].sort((a, b) => a.depth - b.depth || a.gradeLevel - b.gradeLevel);
      const next = sorted.find((t) => !state.topicsCompleted.includes(t.id));

      if (!next) {
        await this.endSession(state.sessionId);
        return {
          type: "complete",
          message: `All available topics completed! Create an account to track your progress.`,
        };
      }

      state.currentTopicId = next.id;
      state.currentPhase = "pretest";
      state.phaseIndex = 0;

      return await this.buildPhaseItem(state);
    },

    /**
     * Mark the current content depth as completed for context-layered disciplines.
     * For mastery-gated disciplines, depth completion is implicit (topic mastery = done).
     */
    async markDepthCompletionIfNeeded(state: SessionState): Promise<void> {
      if (!state.currentTopicId) return;

      const topic = await graph.getTopic(state.currentTopicId);
      if (!topic) return;

      const subject = await db.query.subjects.findFirst({
        where: eq(schema.subjects.id, topic.subjectId),
      });
      if (!subject) return;

      const disc = await db.query.disciplines.findFirst({
        where: eq(schema.disciplines.id, subject.disciplineId),
      });
      if (!disc || disc.progressionModel !== "context-layered") return;

      // Resolve which depth the user was working at
      const currentDepth = await content.resolveContentDepth(
        state.userId,
        state.currentTopicId,
        subject.disciplineId
      );

      await content.markDepthCompleted(state.userId, state.currentTopicId, currentDepth);
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

      const query = await resolveContentQuery(state, topic.id);
      const problems = await content.getTopicProblems(query);
      const examples = await content.getTopicExamples(query);
      const visuals = await content.getTopicVisuals(query);

      function withVisuals(problem: Problem): Problem {
        return visuals ? { ...problem, visuals } : problem;
      }

      switch (state.currentPhase) {
        case "pretest": {
          // 1-2 problems, student likely fails — primes learning
          const problem = selectProblem(problems, "medium");
          return {
            type: "problem",
            phase: "pretest",
            topicId: topic.id,
            topicName: topic.name,
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
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
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
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
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
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
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
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
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
            showHints: true,
            prerequisiteChain: prereqChain,
            message: "Let's go back to basics. Here's an easier version.",
          };
        }

        default: {
          // diagnostic phase handled by diagnostic service, not session service
          const problem = selectProblem(problems, "medium");
          return {
            type: "problem",
            phase: state.currentPhase,
            topicId: topic.id,
            topicName: topic.name,
            problem: withVisuals(problem ?? makeFallbackProblem(topic)),
            showHints: false,
            message: "Answer this question.",
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
function makeFallbackProblem(topic: { id: string; name: string; description: string }): Problem {
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

function makeFallbackExample(topic: { id: string; name: string; description: string }): WorkedExample {
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
