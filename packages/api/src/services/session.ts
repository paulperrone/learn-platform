import { eq, and, isNull, sql } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createSRSService } from "./srs.js";
import { createContentService, type ContentQuery } from "./content.js";
import type { Problem, WorkedExample, SessionPhase, AssessmentType, VisualAsset, PresentationLevel, ContentDepthLevel, BlendRole, MasteryEvent } from "@learn/shared";
import { gradeProblem } from "./grading.js";

type SessionState = {
  sessionId: string;
  userId: string;
  anonymousToken?: string;
  isAnonymous?: boolean;
  currentTopicId: string | null;
  currentPhase: SessionPhase;
  phaseIndex: number; // Track progression within a topic
  hintIndex: number; // Progressive hint reveal: how many hints revealed so far
  topicsCompleted: string[];
  reviewsCompleted: number;
  totalCorrect: number;
  totalAttempts: number;
  lastServedPresentation?: PresentationLevel;
  lastServedSubjectId?: string;
  currentBlendRole?: BlendRole;
  rollingResults: boolean[]; // Sliding window of last N problem correctness results (for adaptive difficulty)
  lastProblemId?: string; // Last problem ID responded to (for targeted remediation lookup)
  remediationTargetTopicId?: string; // Prerequisite topic being remediated (targeted remediation)
  remediationOriginalTopicId?: string; // Original topic that triggered remediation
};

// In-memory cache — D1 is the source of truth
const activeSessions = new Map<string, SessionState>();

export type DifficultyBias = "easier" | "on-target" | "harder";

export function computeDifficultyBias(rollingResults: boolean[]): DifficultyBias {
  if (rollingResults.length < 3) return "on-target"; // Not enough data
  const correct = rollingResults.filter(Boolean).length;
  const accuracy = correct / rollingResults.length;
  if (accuracy > 0.9) return "harder";
  if (accuracy < 0.8) return "easier";
  return "on-target";
}

export function applyDifficultyBias(baseDifficulty: string, bias: DifficultyBias): string {
  if (bias === "on-target") return baseDifficulty;
  const levels = ["easy", "medium", "hard"];
  const idx = levels.indexOf(baseDifficulty);
  if (idx < 0) return baseDifficulty;
  if (bias === "harder") return levels[Math.min(idx + 1, levels.length - 1)];
  return levels[Math.max(idx - 1, 0)];
}

export function createSessionService(db: DB) {
  const graph = createGraphService(db);
  const srs = createSRSService(db);
  const content = createContentService(db);

  /**
   * Identify the key prerequisite to target for remediation.
   * Priority: problem's keyPrerequisiteId > lowest-stability direct prerequisite.
   * Returns null if no prerequisites exist or user is anonymous.
   */
  async function identifyKeyPrerequisite(
    userId: string,
    topicId: string,
    lastProblemId?: string,
    excludeTopicIds: string[] = []
  ): Promise<string | null> {
    // Check if the last problem has an explicit keyPrerequisiteId
    if (lastProblemId) {
      const [ac] = await db
        .select({ keyPrerequisiteId: schema.assessmentContent.keyPrerequisiteId })
        .from(schema.assessmentContent)
        .where(eq(schema.assessmentContent.id, lastProblemId));
      if (ac?.keyPrerequisiteId && !excludeTopicIds.includes(ac.keyPrerequisiteId)) {
        return ac.keyPrerequisiteId;
      }
    }

    // Fall back to lowest-stability direct prerequisite
    const prereqs = await graph.getDirectPrerequisites(topicId);
    if (prereqs.length === 0) return null;

    // Get user state for each prerequisite
    const prereqStates = await Promise.all(
      prereqs
        .filter((p) => !excludeTopicIds.includes(p.fromTopicId))
        .map(async (p) => {
          const [state] = await db
            .select()
            .from(schema.userTopicState)
            .where(
              and(
                eq(schema.userTopicState.userId, userId),
                eq(schema.userTopicState.topicId, p.fromTopicId)
              )
            );
          return {
            topicId: p.fromTopicId,
            stability: state?.stability ?? 0,
            reps: state?.reps ?? 0,
          };
        })
    );

    if (prereqStates.length === 0) return null;

    // Pick the prerequisite with lowest stability (most fragile knowledge)
    prereqStates.sort((a, b) => a.stability - b.stability);
    return prereqStates[0].topicId;
  }

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

    // Blend role depth overrides
    if (state.currentBlendRole === "warmup") {
      contentDepth = "survey";
    } else if (state.currentBlendRole === "stretch") {
      const depths: ContentDepthLevel[] = ["survey", "contextual", "analytical", "synthesis"];
      const idx = depths.indexOf(contentDepth);
      if (idx < depths.length - 1) contentDepth = depths[idx + 1];
    }

    // Track served presentation for drift nudging in respond()
    state.lastServedPresentation = presentation;
    state.lastServedSubjectId = subjectId ?? undefined;

    return { topicId, contentDepth, presentation };
  }

  // Types that force retrieval practice (higher learning gain than text-qa)
  const preferredTypes: AssessmentType[] = ["numerical-input", "multi-step", "matching", "multi-select"];

  function selectProblem(problems: Problem[], difficulty: string, exclude: string[] = [], bias: DifficultyBias = "on-target"): Problem | null {
    const available = problems.filter((p) => !exclude.includes(p.id));
    if (available.length === 0) return null;

    const targetDifficulty = applyDifficultyBias(difficulty, bias);
    const byDifficulty = available.filter((p) => p.difficulty === targetDifficulty);
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
      // Backwards compat: sessions started before progressive hints
      state.hintIndex = state.hintIndex ?? 0;
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
        hintIndex: 0,
        topicsCompleted: [],
        reviewsCompleted: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        currentBlendRole: firstTopic.blendRole,
        rollingResults: [],
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
        hintIndex: 0,
        topicsCompleted: [],
        reviewsCompleted: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        rollingResults: [],
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
      if ((response as any).problemId) {
        state.lastProblemId = (response as any).problemId;
      }

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

      // Rolling accuracy tracker: sliding window of last 10 results
      const ROLLING_WINDOW = 10;
      state.rollingResults.push(isCorrect);
      if (state.rollingResults.length > ROLLING_WINDOW) {
        state.rollingResults = state.rollingResults.slice(-ROLLING_WINDOW);
      }

      // Progressive hint reveal: track hints revealed for rating cap
      const hintsUsed = response.hintsUsed ?? state.hintIndex;
      let rating: Grade = isCorrect ? Rating.Good : Rating.Again;

      // On incorrect answer, reveal next hint for next attempt
      if (!isCorrect) {
        state.hintIndex++;
      }

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
      let masteryEvent: MasteryEvent | undefined;
      if (!state.isAnonymous) {
        const reviewResult = await srs.scheduleReview(
          state.userId,
          state.currentTopicId,
          rating,
          response.responseMs,
          state.currentPhase,
          response.confidence,
          hintsUsed,
          (response as any).problemId
        );

        // Detect new mastery → find unlocked topics
        if (reviewResult.justMastered) {
          const unlockedTopics = await graph.getNewlyUnlockedTopics(
            state.userId,
            state.currentTopicId
          );
          masteryEvent = {
            topicId: state.currentTopicId,
            topicName: topic.name,
            unlockedTopics: unlockedTopics.map((t) => ({ id: t.id, name: t.name })),
          };
        }

        // Apply FIRe credit (on success) or upward penalty (on failure)
        await srs.applyFIReCredit(state.userId, state.currentTopicId, rating);
        await srs.applyUpwardPenalty(state.userId, state.currentTopicId, rating);

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

      // Attach mastery event to the response
      if (masteryEvent && result.type !== "error") {
        (result as any).masteryEvent = masteryEvent;
      }

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
        // Failed independent practice — targeted remediation
        state.currentPhase = "remediation";
        state.phaseIndex = 0;
        state.hintIndex = 0;

        // Identify the key prerequisite to target
        if (!state.isAnonymous && state.currentTopicId) {
          const keyPrereq = await identifyKeyPrerequisite(
            state.userId,
            state.currentTopicId,
            state.lastProblemId,
          );
          if (keyPrereq) {
            state.remediationTargetTopicId = keyPrereq;
            state.remediationOriginalTopicId = state.currentTopicId;
          }
        }

        return await this.buildPhaseItem(state);
      }

      if (state.currentPhase === "remediation") {
        if (wasCorrect) {
          // Recovery — back to original topic's independent phase
          state.currentPhase = "independent";
          state.phaseIndex = 0;
          state.hintIndex = 0;
          // Restore original topic if we were doing targeted prereq remediation
          if (state.remediationOriginalTopicId) {
            state.currentTopicId = state.remediationOriginalTopicId;
          }
          state.remediationTargetTopicId = undefined;
          state.remediationOriginalTopicId = undefined;
          return await this.buildPhaseItem(state);
        }
        // Still struggling — try next weakest prerequisite or continue remediation
        state.phaseIndex++;

        // After 2 failed attempts on a prereq, try the next weakest prerequisite
        if (state.phaseIndex >= 2 && !state.isAnonymous && state.remediationOriginalTopicId) {
          const nextPrereq = await identifyKeyPrerequisite(
            state.userId,
            state.remediationOriginalTopicId,
            undefined,
            state.remediationTargetTopicId ? [state.remediationTargetTopicId] : [],
          );
          if (nextPrereq) {
            state.remediationTargetTopicId = nextPrereq;
            state.phaseIndex = 0;
            state.hintIndex = 0;
          }
        }

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
        state.hintIndex = 0;
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
      state.currentBlendRole = next.blendRole;

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

      // Progressive hint reveal: compute available hints based on phase and hintIndex.
      // - pretest/independent/review: no hints initially, revealed on subsequent incorrect attempts
      // - guided: start with first hint revealed (scaffolded)
      // - remediation: start with first hint revealed
      function getAvailableHints(problem: Problem, phase: SessionPhase, hintIndex: number): string[] {
        const allHints = problem.hints ?? [];
        if (allHints.length === 0) return [];

        // Guided and remediation start with first hint pre-revealed
        const baseReveal = (phase === "guided" || phase === "remediation") ? 1 : 0;
        const revealCount = Math.min(baseReveal + hintIndex, allHints.length);
        return allHints.slice(0, revealCount);
      }

      // Should the full solution be shown? Only when all hints exhausted and still incorrect.
      function shouldShowSolution(problem: Problem, phase: SessionPhase, hintIndex: number): boolean {
        const allHints = problem.hints ?? [];
        if (allHints.length === 0) return false;
        const baseReveal = (phase === "guided" || phase === "remediation") ? 1 : 0;
        return baseReveal + hintIndex > allHints.length;
      }

      const bias = computeDifficultyBias(state.rollingResults);

      switch (state.currentPhase) {
        case "pretest": {
          // 1-2 problems, student likely fails — primes learning (no adaptive bias for pretest)
          const problem = selectProblem(problems, "medium");
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          return {
            type: "problem",
            phase: "pretest",
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, "pretest", state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
            message: "Let's see what you already know. Try your best!",
          };
        }

        case "instruction": {
          // Worked example with progressive fading
          const example = examples[0];
          const ex = example ?? makeFallbackExample(topic);

          // Compute fading level from prior exposure count + FSRS stability
          let fadingLevel = 0;
          if (!state.isAnonymous) {
            const [{ count }] = await db
              .select({ count: sql<number>`count(*)` })
              .from(schema.reviewLog)
              .where(
                and(
                  eq(schema.reviewLog.userId, state.userId),
                  eq(schema.reviewLog.topicId, state.currentTopicId!),
                  eq(schema.reviewLog.phase, "instruction"),
                )
              );
            fadingLevel = count;

            // FSRS stability modifier: high stability → more fading
            const uts = await db.query.userTopicState.findFirst({
              where: and(
                eq(schema.userTopicState.userId, state.userId),
                eq(schema.userTopicState.topicId, state.currentTopicId!),
              ),
            });
            if (uts && uts.stability > 14) {
              fadingLevel++;
            }
          }

          // Cap: always show at least the first step
          const maxFade = Math.max(0, ex.steps.length - 1);
          fadingLevel = Math.min(fadingLevel, maxFade);

          const fadingMessage =
            fadingLevel === 0
              ? "Study this example carefully. You'll explain it in your own words."
              : fadingLevel >= maxFade
                ? "You've seen this before. Try to complete each step on your own."
                : "Fill in the missing steps. The structure is here to guide you.";

          return {
            type: "instruction",
            phase: "instruction",
            topicId: topic.id,
            topicName: topic.name,
            example: ex,
            fadingLevel,
            blendRole: state.currentBlendRole ?? "main",
            message: fadingMessage,
          };
        }

        case "guided": {
          // Partially scaffolded — start with first hint revealed (adaptive bias applies)
          const problem = selectProblem(problems, "easy", [], bias);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          return {
            type: "problem",
            phase: "guided",
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, "guided", state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
            message: "Now try it with some help. Hints are available if you need them.",
          };
        }

        case "independent": {
          // Full problems, confidence judgment (adaptive bias applies)
          const problem = selectProblem(problems, "medium", [], bias);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          return {
            type: "problem",
            phase: "independent",
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, "independent", state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            askConfidence: true,
            presentationLevel: state.lastServedPresentation,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
            message: "Solve this on your own. Rate your confidence after.",
          };
        }

        case "review": {
          // Spaced review — adaptive difficulty; message varies by blend role
          const problem = selectProblem(problems, "medium", [], bias);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          const blendRole = state.currentBlendRole ?? "main";
          let reviewMessage = "Review time! Let's see if you remember.";
          if (blendRole === "warmup") {
            reviewMessage = "Quick review!";
          } else if (blendRole === "stretch") {
            reviewMessage = "Challenge question — give it your best shot, it's okay to be unsure.";
          }
          return {
            type: "problem",
            phase: "review",
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, "review", state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            askConfidence: blendRole !== "warmup",
            presentationLevel: state.lastServedPresentation,
            blendRole,
            difficultyBias: bias,
            message: reviewMessage,
          };
        }

        case "remediation": {
          // Targeted remediation: route to key prerequisite if identified
          const targetTopicId = state.remediationTargetTopicId;
          const prereqChain = await graph.getPrerequisiteChain(topic.id);

          if (targetTopicId) {
            // Load problems from the prerequisite topic
            const prereqTopic = await graph.getTopic(targetTopicId);
            if (prereqTopic) {
              const prereqQuery = await resolveContentQuery(state, prereqTopic.id);
              const prereqProblems = await content.getTopicProblems(prereqQuery);
              const prereqProblem = selectProblem(prereqProblems, "easy");
              const prereqVisuals = await content.getTopicVisuals(prereqQuery);
              const pv = prereqProblem
                ? (prereqVisuals ? { ...prereqProblem, visuals: prereqVisuals } : prereqProblem)
                : makeFallbackProblem(prereqTopic);
              return {
                type: "remediation",
                phase: "remediation",
                topicId: prereqTopic.id,
                topicName: prereqTopic.name,
                problem: pv,
                availableHints: getAvailableHints(pv, "remediation", state.hintIndex),
                showSolution: shouldShowSolution(pv, state.currentPhase, state.hintIndex),
                hintsRevealed: state.hintIndex,
                prerequisiteChain: prereqChain,
                remediationTargetTopicId: targetTopicId,
                originalTopicId: state.remediationOriginalTopicId,
                originalTopicName: topic.name,
                blendRole: state.currentBlendRole ?? "main",
                difficultyBias: bias,
                message: `Let's practice "${prereqTopic.name}" — this skill helps with "${topic.name}".`,
              };
            }
          }

          // Fallback: same-topic remediation (no prereq identified or anonymous)
          const problem = selectProblem(problems, "easy");
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          return {
            type: "remediation",
            phase: "remediation",
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, "remediation", state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            prerequisiteChain: prereqChain,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
            message: "Let's go back to basics. Here's an easier version.",
          };
        }

        default: {
          // diagnostic phase handled by diagnostic service, not session service
          const problem = selectProblem(problems, "medium", [], bias);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          return {
            type: "problem",
            phase: state.currentPhase,
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, state.currentPhase, state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
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

      // Trigger per-user FSRS optimization (best-effort, non-blocking)
      if (!state.isAnonymous) {
        srs.optimizeUserParams(state.userId).catch(() => {});
      }
    },
  };
}

// === Types ===

type MasteryEventField = { masteryEvent?: MasteryEvent };

export type SessionItem =
  | ({
      type: "problem";
      phase: SessionPhase;
      topicId: string;
      topicName: string;
      problem: Problem;
      availableHints: string[];
      showSolution: boolean;
      hintsRevealed: number;
      askConfidence?: boolean;
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      difficultyBias?: "easier" | "on-target" | "harder";
      message: string;
    } & MasteryEventField)
  | ({
      type: "instruction";
      phase: "instruction";
      topicId: string;
      topicName: string;
      example: WorkedExample;
      fadingLevel: number;
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      message: string;
    } & MasteryEventField)
  | ({
      type: "remediation";
      phase: "remediation";
      topicId: string;
      topicName: string;
      problem: Problem;
      availableHints: string[];
      showSolution: boolean;
      hintsRevealed: number;
      prerequisiteChain: string[];
      remediationTargetTopicId?: string;
      originalTopicId?: string;
      originalTopicName?: string;
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      difficultyBias?: "easier" | "on-target" | "harder";
      message: string;
    } & MasteryEventField)
  | ({ type: "complete"; message: string } & MasteryEventField)
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
