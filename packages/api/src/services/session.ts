import { eq, and, isNull, sql } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createSRSService, type FireDiagnosticConfig } from "./srs.js";
import { createContentService, type ContentQuery } from "./content.js";
import type { ContentBucket } from "./content-r2.js";
import type { AnalyticsService } from "./analytics.js";
import type { Problem, WorkedExample, Lesson, SessionPhase, ReviewScaffolding, AssessmentType, VisualAsset, PresentationLevel, ContentDepthLevel, BlendRole, MasteryEvent, CognitiveDemand, DemandDistribution } from "@learn/shared";
import { DEMAND_PROFILES } from "@learn/shared";
import { gradeProblem } from "./grading.js";
import { createActivityService } from "./activity.js";

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
  lastServedDisciplineId?: string;
  currentBlendRole?: BlendRole;
  rollingResults: boolean[]; // Sliding window of last N problem correctness results (for adaptive difficulty)
  lastProblemId?: string; // Last problem ID responded to (for targeted remediation lookup)
  remediationTargetTopicId?: string; // Prerequisite topic being remediated (targeted remediation)
  remediationOriginalTopicId?: string; // Original topic that triggered remediation
  remediationOriginalPhase?: SessionPhase; // Phase the student was in when remediation triggered
  sessionFailures?: Record<string, number>; // Per-topic failure count within this session (for remediation trigger)
  servedDemands?: CognitiveDemand[]; // Cognitive demands served this session (for demand mixing)
  totalResponseMs?: number; // Accumulated response time for activity minutes recording
  sessionMix?: { topicId: string; type: "review" | "new"; blendRole: BlendRole }[]; // Cached session mix from getSessionMix
  remediatedTopics?: string[]; // Topics that have already been remediated this session (prevent re-entry)
  llmAssistedThisProblem?: boolean; // Set by LLM routes when any LLM feature used on current problem
  hintSourceThisProblem?: "static" | "llm" | null; // Hint source for current problem
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

export function createSessionService(db: DB, fireDiagnostic?: FireDiagnosticConfig, contentBucket?: ContentBucket, analytics?: AnalyticsService) {
  const graph = createGraphService(db);
  const srs = createSRSService(db, fireDiagnostic);
  const content = createContentService(db, contentBucket);
  const activity = createActivityService(db);

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
    // Fetch topic's problems from R2 and look up by ID
    if (lastProblemId) {
      const topic = await graph.getTopic(topicId);
      const discipline = topic?.disciplineId;
      if (discipline) {
        const problems = await content.getTopicProblems({ topicId, discipline, contentDepth: "survey", presentation: "standard" });
        const match = problems.find((p) => p.id === lastProblemId);
        if (match?.keyPrerequisiteId && !excludeTopicIds.includes(match.keyPrerequisiteId)) {
          return match.keyPrerequisiteId;
        }
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

  // Fetch all problems for a topic from R2 — used for grading (needs full pool)
  async function getAllTopicProblems(topicId: string): Promise<Problem[]> {
    const topic = await graph.getTopic(topicId);
    const discipline = topic?.disciplineId;
    if (!discipline) return [];
    return content.getTopicProblems({ topicId, discipline, contentDepth: "survey", presentation: "standard" });
  }

  async function resolveContentQuery(state: SessionState, topicId: string): Promise<ContentQuery> {
    const topic = await graph.getTopic(topicId);
    const disciplineId = topic?.disciplineId ?? "math";

    let presentation: PresentationLevel = "standard";
    let contentDepth: ContentDepthLevel = "survey";

    if (!state.isAnonymous) {
      presentation = await content.resolvePresentation(state.userId, disciplineId);
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
    state.lastServedDisciplineId = disciplineId;

    return { topicId, discipline: disciplineId, contentDepth, presentation };
  }

  // Types that force retrieval practice (higher learning gain than text-qa)
  const preferredTypes: AssessmentType[] = ["numerical-input", "multi-step", "matching", "multi-select"];

  /** Get the demand distribution profile for a presentation level */
  function getDemandProfile(presentation: PresentationLevel): DemandDistribution {
    return DEMAND_PROFILES[presentation];
  }

  /** Pick the most underrepresented demand type given recent history and target weights */
  function selectTargetDemand(profile: DemandDistribution, recentDemands: CognitiveDemand[]): CognitiveDemand | null {
    const demandTypes = Object.keys(profile) as CognitiveDemand[];
    if (demandTypes.length === 0) return null;

    if (recentDemands.length === 0) {
      // First selection — weighted random from profile
      const r = Math.random();
      let cumulative = 0;
      for (const d of demandTypes) {
        cumulative += profile[d] ?? 0;
        if (r < cumulative) return d;
      }
      return demandTypes[demandTypes.length - 1];
    }

    // Count occurrences in recent history
    const counts: Partial<Record<CognitiveDemand, number>> = {};
    for (const d of recentDemands) counts[d] = (counts[d] ?? 0) + 1;
    const total = recentDemands.length;

    // Find most underrepresented demand relative to target weight
    let bestDemand = demandTypes[0];
    let bestGap = -Infinity;
    for (const d of demandTypes) {
      const targetRate = profile[d] ?? 0;
      const actualRate = (counts[d] ?? 0) / total;
      const gap = targetRate - actualRate;
      if (gap > bestGap) {
        bestGap = gap;
        bestDemand = d;
      }
    }
    return bestDemand;
  }

  function selectProblem(
    problems: Problem[],
    exclude: string[] = [],
    demandPreference?: CognitiveDemand | null,
  ): Problem | null {
    const available = problems.filter((p) => !exclude.includes(p.id));
    if (available.length === 0) return null;

    // All problems within a topic are equivalent (no difficulty filtering).
    // Apply cognitive demand preference (soft — falls back if not available)
    let pool = available;
    if (demandPreference) {
      const matching = pool.filter((p) => (p.cognitiveDemand ?? "procedural") === demandPreference);
      if (matching.length > 0) pool = matching;
    }

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
        currentPhase: firstTopic.type === "review" ? "review" : "lesson",
        phaseIndex: 0,
        hintIndex: 0,
        topicsCompleted: [],
        reviewsCompleted: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        currentBlendRole: firstTopic.blendRole,
        rollingResults: [],
        sessionMix: mix.items.map((i) => ({ topicId: i.topicId, type: i.type, blendRole: i.blendRole })),
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
    async startAnonymousSession(anonymousToken: string, disciplineId?: string): Promise<{
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
      const allTopics = disciplineId
        ? await db.select().from(schema.topics).where(eq(schema.topics.disciplineId, disciplineId))
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
        currentPhase: "lesson",
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
        scaffolding?: ReviewScaffolding;
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
      state.totalResponseMs = (state.totalResponseMs ?? 0) + (response.responseMs ?? 0);
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
        // Look up content version for this topic (nullable — may not exist yet)
        const [versionRow] = await db
          .select({ contentHash: schema.topicContentVersions.contentHash })
          .from(schema.topicContentVersions)
          .where(eq(schema.topicContentVersions.topicId, state.currentTopicId));

        const reviewResult = await srs.scheduleReview(
          state.userId,
          state.currentTopicId,
          rating,
          response.responseMs,
          state.currentPhase,
          response.confidence,
          hintsUsed,
          (response as any).problemId,
          versionRow?.contentHash,
          state.llmAssistedThisProblem ?? false,
          state.hintSourceThisProblem ?? null,
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

        // Apply FIRe credit on successful reviews.
        // Upward penalty (applyUpwardPenalty) is disabled: it has no research
        // basis in the FIRe model, and empirically it generates more reviews
        // than FIRe saves for struggling profiles, producing net negative
        // compression. Remediation routing already handles prerequisite gaps.
        await srs.applyFIReCredit(state.userId, state.currentTopicId, rating);

        // Nudge presentation distribution based on performance
        if (state.lastServedPresentation && state.lastServedDisciplineId) {
          await content.applyNudge(
            state.userId,
            state.lastServedDisciplineId,
            state.lastServedPresentation,
            isCorrect,
          );
        }

        // Record rich analytics event (fire-and-forget)
        if (analytics) {
          const bias = computeDifficultyBias(state.rollingResults);
          analytics.recordProblemAttempt({
            userId: state.userId,
            topicId: state.currentTopicId,
            problemId: (response as any).problemId ?? "",
            contentVersion: versionRow?.contentHash ?? null,
            phase: state.currentPhase,
            difficulty: (response as any).difficulty ?? "medium",
            cognitiveDemand: (response as any).cognitiveDemand ?? "procedural",
            presentation: state.lastServedPresentation ?? "standard",
            contentDepth: (response as any).contentDepth ?? "survey",
            disciplineId: state.lastServedDisciplineId ?? topic.disciplineId ?? "math",
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: bias,
            llmAssisted: state.llmAssistedThisProblem ?? false,
            correct: isCorrect,
            responseMs: response.responseMs,
            hintsUsed,
            confidence: response.confidence ?? 0,
            rating,
            misconception: reviewResult.misconception,
          });
        }
      }

      // Record activity for authenticated users (fire-and-forget, best-effort)
      let goalProgress: GoalProgress | undefined;
      if (!state.isAnonymous) {
        const today = new Date().toISOString().slice(0, 10);
        try {
          const problemResult = await activity.recordProblemCompleted(state.userId, today);
          if (masteryEvent) {
            await activity.recordTopicMastered(state.userId, today);
          }
          const progress = await activity.getTodayProgress(state.userId, today);
          goalProgress = {
            problemsCompleted: progress.problemsCompleted,
            minutesActive: progress.minutesActive,
            topicsMastered: progress.topicsMastered,
            goalMet: progress.goalMet,
            goalJustCompleted: problemResult.goalJustCompleted,
            goalType: progress.goal.type,
            goalTarget: progress.goal.target,
            progress: progress.progress,
          };
        } catch {
          // Best-effort — don't fail the session response
        }
      }

      // Record example view analytics when completing an instruction phase
      if (analytics && state.currentPhase === "instruction" && state.currentTopicId) {
        const [vRow] = await db
          .select({ contentHash: schema.topicContentVersions.contentHash })
          .from(schema.topicContentVersions)
          .where(eq(schema.topicContentVersions.topicId, state.currentTopicId));
        analytics.recordExampleView({
          userId: state.userId,
          topicId: state.currentTopicId,
          exampleId: (response as any).exampleId ?? "",
          contentVersion: vRow?.contentHash ?? null,
          presentation: state.lastServedPresentation ?? "standard",
          contentDepth: (response as any).contentDepth ?? "survey",
          stepsViewed: (response as any).stepsViewed ?? 0,
          totalSteps: (response as any).totalSteps ?? 0,
          totalTimeMs: response.responseMs,
          fadingLevel: (response as any).fadingLevel ?? 0,
          selfExplanationQuality: (response as any).selfExplanationQuality ?? 0,
        });
      }

      // Advance through learning phases
      const result = await this.advancePhase(state, isCorrect);

      // Attach mastery event and goal progress to the response
      if (masteryEvent && result.type !== "error") {
        (result as any).masteryEvent = masteryEvent;
      }
      if (goalProgress && result.type !== "error") {
        (result as any).goalProgress = goalProgress;
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

      // Lesson phase: completion moves to next topic (lesson includes practice)
      if (state.currentPhase === "lesson") {
        if (!state.isAnonymous) {
          await this.markDepthCompletionIfNeeded(state);
        }
        state.topicsCompleted.push(state.currentTopicId!);
        return await this.nextTopic(state);
      }

      // Track per-topic failure accumulation within this session
      if (!wasCorrect && state.currentTopicId && state.currentPhase !== "instruction") {
        if (!state.sessionFailures) state.sessionFailures = {};
        const topicId = state.currentTopicId;
        state.sessionFailures[topicId] = (state.sessionFailures[topicId] ?? 0) + 1;
      }

      // Check if remediation should trigger based on accumulated failures (2+ for any topic).
      // Skip remediation for warmup topics (quick recall, not deep practice).
      // Skip if this topic was already remediated this session (prevent infinite loops).
      const isWarmup = state.currentBlendRole === "warmup";
      const alreadyRemediated = state.remediatedTopics?.includes(state.currentTopicId!) ?? false;
      const shouldRemediate = !wasCorrect
        && state.currentTopicId
        && state.currentPhase !== "remediation"
        && state.currentPhase !== "instruction"
        && !isWarmup
        && !alreadyRemediated
        && (state.sessionFailures?.[state.currentTopicId] ?? 0) >= 2;

      if (shouldRemediate) {
        const originalTopicId = state.currentTopicId!;
        const originalPhase = state.currentPhase;
        state.currentPhase = "remediation";
        state.phaseIndex = 0;
        state.hintIndex = 0;

        // Track that this topic has been remediated to prevent re-entry
        if (!state.remediatedTopics) state.remediatedTopics = [];
        state.remediatedTopics.push(originalTopicId);

        // Identify the key prerequisite to target (skip for anonymous — no persistent state)
        if (!state.isAnonymous) {
          const keyPrereq = await identifyKeyPrerequisite(
            state.userId,
            originalTopicId,
            state.lastProblemId,
          );
          if (keyPrereq) {
            state.remediationTargetTopicId = keyPrereq;
            state.remediationOriginalTopicId = originalTopicId;
            state.remediationOriginalPhase = originalPhase;
          }
        }

        return await this.buildPhaseItem(state);
      }

      if (!wasCorrect && state.currentPhase === "independent") {
        // Failed independent practice (first failure) — stay in independent for retry
        // Remediation will trigger on 2nd failure via the accumulated failures check above
        state.phaseIndex++;
        state.hintIndex = 0;
        return await this.buildPhaseItem(state);
      }

      if (state.currentPhase === "remediation") {
        if (wasCorrect) {
          // Recovery — back to original topic in its original phase
          const returnPhase = state.remediationOriginalPhase ?? "independent";
          state.currentPhase = returnPhase;
          state.phaseIndex = 0;
          state.hintIndex = 0;
          // Restore original topic if we were doing targeted prereq remediation
          if (state.remediationOriginalTopicId) {
            state.currentTopicId = state.remediationOriginalTopicId;
          }
          state.remediationTargetTopicId = undefined;
          state.remediationOriginalTopicId = undefined;
          state.remediationOriginalPhase = undefined;
          return await this.buildPhaseItem(state);
        }
        // Still struggling — try next weakest prerequisite or continue remediation
        state.phaseIndex++;

        // After 2 failed attempts on a prereq, try the next weakest prerequisite
        if (state.phaseIndex >= 2 && state.remediationOriginalTopicId) {
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
        if (wasCorrect) {
          state.reviewsCompleted++;
          state.topicsCompleted.push(state.currentTopicId!);
          return await this.nextTopic(state);
        }
        // Warmup topics: single question, move on after any failure
        if (state.currentBlendRole === "warmup") {
          state.reviewsCompleted++;
          state.topicsCompleted.push(state.currentTopicId!);
          return await this.nextTopic(state);
        }
        // Failed review — give one retry before moving on (remediation triggers on 2nd failure via sessionFailures)
        const topicFailures = state.sessionFailures?.[state.currentTopicId!] ?? 0;
        if (topicFailures < 2) {
          // First failure on this review topic — retry with a new problem
          state.phaseIndex++;
          state.hintIndex = 0;
          return await this.buildPhaseItem(state);
        }
        // 2+ failures and remediation not possible or already done — move on
        state.reviewsCompleted++;
        state.topicsCompleted.push(state.currentTopicId!);
        return await this.nextTopic(state);
      }

      // Progress through phases
      const currentIdx = phases.indexOf(state.currentPhase);
      if (currentIdx < phases.length - 1) {
        state.currentPhase = phases[currentIdx + 1];
        state.phaseIndex = 0;
        state.hintIndex = 0;
        state.llmAssistedThisProblem = false;
        state.hintSourceThisProblem = null;
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

      // Use cached session mix (computed once at session start) to preserve
      // interleaving order and avoid re-computing the mix each topic transition.
      // Fall back to fresh mix if cache is missing (legacy sessions).
      const mixItems = state.sessionMix
        ?? (await srs.getSessionMix(state.userId, 10)).items;

      // Find a topic we haven't completed in this session
      const next = mixItems.find(
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
      state.currentPhase = next.type === "review" ? "review" : "lesson";
      state.phaseIndex = 0;
      state.currentBlendRole = next.blendRole;
      state.llmAssistedThisProblem = false;
      state.hintSourceThisProblem = null;

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
      state.currentPhase = "lesson";
      state.phaseIndex = 0;
      state.llmAssistedThisProblem = false;
      state.hintSourceThisProblem = null;

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

      const disc = await db.query.disciplines.findFirst({
        where: eq(schema.disciplines.id, topic.disciplineId),
      });
      if (!disc || disc.progressionModel !== "context-layered") return;

      // Resolve which depth the user was working at
      const currentDepth = await content.resolveContentDepth(
        state.userId,
        state.currentTopicId,
        topic.disciplineId
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
      const lessons = await content.getTopicLessons(query);
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

      // Resolve demand mixing for this phase
      const presentation = state.lastServedPresentation ?? "standard";
      const profile = getDemandProfile(presentation);
      const recentDemands = state.servedDemands ?? [];

      /** Record a served demand into session state */
      function trackDemand(problem: Problem): void {
        const demand = problem.cognitiveDemand ?? "procedural";
        if (!state.servedDemands) state.servedDemands = [];
        state.servedDemands.push(demand);
      }

      switch (state.currentPhase) {
        case "lesson": {
          // Serve lesson content for first encounter with a topic
          const lesson = lessons[0];
          if (lesson) {
            // Select 2-3 practice problems to include with the lesson
            const practiceCount = Math.min(3, problems.length);
            const practiceProblems: Problem[] = [];
            const used: string[] = [];
            for (let i = 0; i < practiceCount; i++) {
              const p = selectProblem(problems, used);
              if (p) {
                practiceProblems.push(withVisuals(p));
                used.push(p.id);
              }
            }
            return {
              type: "lesson",
              phase: "lesson",
              topicId: topic.id,
              topicName: topic.name,
              lesson,
              practiceProblems,
              presentationLevel: state.lastServedPresentation,
              blendRole: state.currentBlendRole ?? "main",
              message: `Let's learn about ${topic.name}.`,
            };
          }
          // No lesson content — fall back to worked example (instruction) for backward compat
          const example = examples[0];
          const ex = example ?? makeFallbackExample(topic);
          return {
            type: "instruction",
            phase: "instruction",
            topicId: topic.id,
            topicName: topic.name,
            example: ex,
            fadingLevel: 0,
            blendRole: state.currentBlendRole ?? "main",
            message: "Study this example carefully.",
          };
        }

        case "pretest": {
          // Legacy pretest — kept for backward compatibility with existing sessions
          const pretestDemand = selectTargetDemand({ procedural: 0.60, application: 0.40 }, recentDemands);
          const problem = selectProblem(problems, [], pretestDemand);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          trackDemand(p);
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
            difficultyBias: "on-target",
            message: "Let's see what you already know. Try your best!",
          };
        }

        case "instruction": {
          // Legacy instruction — kept for backward compatibility with existing sessions
          const example = examples[0];
          const ex = example ?? makeFallbackExample(topic);

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
            const uts = await db.query.userTopicState.findFirst({
              where: and(
                eq(schema.userTopicState.userId, state.userId),
                eq(schema.userTopicState.topicId, state.currentTopicId!),
              ),
            });
            if (uts && uts.stability > 14) fadingLevel++;
          }
          const maxFade = Math.max(0, ex.steps.length - 1);
          fadingLevel = Math.min(fadingLevel, maxFade);

          return {
            type: "instruction",
            phase: "instruction",
            topicId: topic.id,
            topicName: topic.name,
            example: ex,
            fadingLevel,
            blendRole: state.currentBlendRole ?? "main",
            message: fadingLevel === 0
              ? "Study this example carefully. You'll explain it in your own words."
              : fadingLevel >= maxFade
                ? "You've seen this before. Try to complete each step on your own."
                : "Fill in the missing steps. The structure is here to guide you.",
          };
        }

        case "guided":
        case "independent": {
          // Legacy guided/independent — kept for backward compatibility
          const demand = selectTargetDemand(profile, recentDemands);
          const problem = selectProblem(problems, [], demand);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          trackDemand(p);
          return {
            type: "problem",
            phase: state.currentPhase,
            topicId: topic.id,
            topicName: topic.name,
            problem: p,
            availableHints: getAvailableHints(p, state.currentPhase, state.hintIndex),
            showSolution: shouldShowSolution(p, state.currentPhase, state.hintIndex),
            hintsRevealed: state.hintIndex,
            askConfidence: state.currentPhase === "independent",
            presentationLevel: state.lastServedPresentation,
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: "on-target",
            message: state.currentPhase === "guided"
              ? "Now try it with some help. Hints are available if you need them."
              : "Solve this on your own. Rate your confidence after.",
          };
        }

        case "review": {
          // Spaced review — all problems equivalent within a topic
          const reviewDemand = selectTargetDemand({ procedural: 0.55, application: 0.45 }, recentDemands);
          const problem = selectProblem(problems, [], reviewDemand);
          const p = withVisuals(problem ?? makeFallbackProblem(topic));
          trackDemand(p);
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
            scaffolding: "none" as ReviewScaffolding,
            presentationLevel: state.lastServedPresentation,
            blendRole,
            difficultyBias: "on-target",
            message: reviewMessage,
          };
        }

        case "remediation": {
          // Targeted remediation: serve prerequisite's lesson + problems
          const targetTopicId = state.remediationTargetTopicId;
          const prereqChain = await graph.getPrerequisiteChain(topic.id);

          if (targetTopicId) {
            const prereqTopic = await graph.getTopic(targetTopicId);
            if (prereqTopic) {
              const prereqQuery = await resolveContentQuery(state, prereqTopic.id);
              const prereqProblems = await content.getTopicProblems(prereqQuery);
              const prereqLessons = await content.getTopicLessons(prereqQuery);
              const prereqProblem = selectProblem(prereqProblems, [], "procedural");
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
                lesson: prereqLessons[0],
                blendRole: state.currentBlendRole ?? "main",
                difficultyBias: "on-target",
                message: `Let's practice "${prereqTopic.name}" — this skill helps with "${topic.name}".`,
              };
            }
          }

          // Fallback: same-topic remediation
          const problem = selectProblem(problems, [], "procedural");
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
            lesson: lessons[0],
            blendRole: state.currentBlendRole ?? "main",
            difficultyBias: "on-target",
            message: "Let's go back to basics. Here's an easier version.",
          };
        }

        default: {
          // diagnostic phase handled by diagnostic service, not session service
          const problem = selectProblem(problems);
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
            difficultyBias: "on-target",
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

      // Record accumulated session minutes (best-effort)
      if (!state.isAnonymous) {
        const totalMs = state.totalResponseMs ?? 0;
        const minutes = Math.ceil(totalMs / 60_000);
        if (minutes > 0) {
          const today = new Date().toISOString().slice(0, 10);
          activity.recordMinutes(state.userId, today, minutes).catch(() => {});
        }
      }

      // Trigger per-user FSRS optimization (best-effort, non-blocking)
      if (!state.isAnonymous) {
        srs.optimizeUserParams(state.userId).catch(() => {});
      }
    },
  };
}

// === Types ===

type MasteryEventField = { masteryEvent?: MasteryEvent };

export type GoalProgress = {
  problemsCompleted: number;
  minutesActive: number;
  topicsMastered: number;
  goalMet: boolean;
  goalJustCompleted: boolean;
  goalType: "minutes" | "problems";
  goalTarget: number;
  progress: number; // 0-1
};

type GoalProgressField = { goalProgress?: GoalProgress };

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
      scaffolding?: ReviewScaffolding;
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      difficultyBias?: "easier" | "on-target" | "harder";
      message: string;
    } & MasteryEventField & GoalProgressField)
  | ({
      type: "lesson";
      phase: "lesson";
      topicId: string;
      topicName: string;
      lesson: Lesson;
      practiceProblems: Problem[];
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      message: string;
    } & MasteryEventField & GoalProgressField)
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
    } & MasteryEventField & GoalProgressField)
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
      lesson?: Lesson;
      presentationLevel?: PresentationLevel;
      blendRole?: BlendRole;
      difficultyBias?: "easier" | "on-target" | "harder";
      message: string;
    } & MasteryEventField & GoalProgressField)
  | ({ type: "complete"; message: string } & MasteryEventField & GoalProgressField)
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
