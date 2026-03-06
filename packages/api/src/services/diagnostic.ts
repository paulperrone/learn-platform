import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { gradeProblem } from "./grading.js";
import type { Problem, DiagnosticResult } from "@learn/shared";

type TopicEstimates = Record<string, number>; // topicId -> probability of mastery (0-1)

type DiagnosticState = {
  currentTopicId: string | null;
  currentQuestionId: string | null;
  askedTopicIds: string[];
  askedQuestionIds: string[];
  topicEstimates: TopicEstimates;
  /** Adaptive phase: "search" = binary-search for boundary, "refine" = test near boundary */
  phase: "search" | "refine";
  /** Current search bounds (grade levels) */
  searchLow: number;
  searchHigh: number;
  /** How many consecutive correct/incorrect in search phase */
  streak: number;
  streakDirection: "correct" | "incorrect" | null;
};

/** Max questions before forced completion — prevents infinite diagnostics */
const MAX_QUESTIONS = 50;
/** Min questions before we allow early stop based on confidence */
const MIN_QUESTIONS = 8;
/** Confidence threshold: stop when boundary is within this many grade levels */
const BOUNDARY_PRECISION = 0.5;

export function createDiagnosticService(db: DB) {
  const graph = createGraphService(db);

  async function getTopicProblems(topicId: string): Promise<Problem[]> {
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

  async function loadAllTopicsAndEdges(subjectId: string) {
    const allTopics = await db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.subjectId, subjectId));
    const allPrereqs = await db.select().from(schema.prerequisites);
    const allEncompassings = await db.select().from(schema.encompassings);

    const topicIds = new Set(allTopics.map((t) => t.id));
    const prereqMap = new Map<string, string[]>();
    const dependentMap = new Map<string, string[]>();

    for (const p of allPrereqs) {
      if (!topicIds.has(p.fromTopicId) || !topicIds.has(p.toTopicId)) continue;
      const prereqs = prereqMap.get(p.toTopicId) ?? [];
      prereqs.push(p.fromTopicId);
      prereqMap.set(p.toTopicId, prereqs);

      const deps = dependentMap.get(p.fromTopicId) ?? [];
      deps.push(p.toTopicId);
      dependentMap.set(p.fromTopicId, deps);
    }

    return { allTopics, prereqMap, dependentMap, allEncompassings };
  }

  /** Group topics by grade level for the adaptive search */
  function topicsByGrade(allTopics: { id: string; gradeLevel: number; depth: number }[]) {
    const byGrade = new Map<number, typeof allTopics>();
    for (const t of allTopics) {
      const list = byGrade.get(t.gradeLevel) ?? [];
      list.push(t);
      byGrade.set(t.gradeLevel, list);
    }
    return byGrade;
  }

  /**
   * Adaptive question selection: binary search for the student's level.
   *
   * Search phase: Start at middle grade, jump up on correct, down on incorrect.
   * Refine phase: Once boundary is narrow, test topics near it to build confidence.
   */
  function selectNextTopic(
    state: DiagnosticState,
    allTopics: { id: string; gradeLevel: number; depth: number }[],
    prereqMap: Map<string, string[]>
  ): string | null {
    const byGrade = topicsByGrade(allTopics);
    const grades = [...byGrade.keys()].sort((a, b) => a - b);
    if (grades.length === 0) return null;

    // Find a topic at or near the target grade that hasn't been asked
    function pickTopicNearGrade(targetGrade: number): string | null {
      // Try exact grade first, then adjacent grades
      const sortedByDistance = [...grades].sort(
        (a, b) => Math.abs(a - targetGrade) - Math.abs(b - targetGrade)
      );
      for (const grade of sortedByDistance) {
        const candidates = byGrade.get(grade) ?? [];
        // Prefer topics with more prereqs (better signal), not yet asked
        const available = candidates
          .filter((t) => !state.askedTopicIds.includes(t.id))
          .sort((a, b) => (prereqMap.get(b.id)?.length ?? 0) - (prereqMap.get(a.id)?.length ?? 0));
        if (available.length > 0) return available[0].id;
      }
      return null;
    }

    if (state.phase === "search") {
      // Binary search: pick middle of current search range
      const targetGrade = (state.searchLow + state.searchHigh) / 2;
      return pickTopicNearGrade(Math.round(targetGrade));
    }

    // Refine phase: test topics near the boundary (searchLow to searchHigh)
    const boundaryGrades = grades.filter(
      (g) => g >= Math.floor(state.searchLow) && g <= Math.ceil(state.searchHigh)
    );
    // Prefer grades with least-tested topics
    const gradeAskedCount = new Map<number, number>();
    for (const tid of state.askedTopicIds) {
      const t = allTopics.find((t) => t.id === tid);
      if (t) gradeAskedCount.set(t.gradeLevel, (gradeAskedCount.get(t.gradeLevel) ?? 0) + 1);
    }
    boundaryGrades.sort(
      (a, b) => (gradeAskedCount.get(a) ?? 0) - (gradeAskedCount.get(b) ?? 0)
    );

    for (const grade of boundaryGrades) {
      const topic = pickTopicNearGrade(grade);
      if (topic) return topic;
    }
    // Fallback: any unasked topic
    return pickTopicNearGrade(Math.round((state.searchLow + state.searchHigh) / 2));
  }

  function propagateResult(
    topicId: string,
    correct: boolean,
    estimates: TopicEstimates,
    prereqMap: Map<string, string[]>,
    dependentMap: Map<string, string[]>,
    allTopics: { id: string; gradeLevel: number }[]
  ): TopicEstimates {
    const updated = { ...estimates };
    const topic = allTopics.find((t) => t.id === topicId);
    const topicGrade = topic?.gradeLevel ?? 0;

    if (correct) {
      // Correct: credit this topic and all prerequisites (transitively by grade)
      updated[topicId] = Math.min(1, (updated[topicId] ?? 0.5) + 0.35);
      // Credit all topics at same or lower grade
      for (const t of allTopics) {
        if (t.id === topicId) continue;
        if (t.gradeLevel < topicGrade) {
          // Strong credit for lower grades
          updated[t.id] = Math.min(1, (updated[t.id] ?? 0.5) + 0.2);
        } else if (t.gradeLevel === topicGrade) {
          // Mild credit for same grade
          updated[t.id] = Math.min(1, (updated[t.id] ?? 0.5) + 0.1);
        }
      }
      // Direct prereqs get extra credit
      const prereqs = prereqMap.get(topicId) ?? [];
      for (const pid of prereqs) {
        updated[pid] = Math.min(1, (updated[pid] ?? 0.5) + 0.15);
      }
    } else {
      // Incorrect: penalize this topic and dependents
      updated[topicId] = Math.max(0, (updated[topicId] ?? 0.5) - 0.35);
      // Penalize topics at same or higher grade
      for (const t of allTopics) {
        if (t.id === topicId) continue;
        if (t.gradeLevel > topicGrade) {
          updated[t.id] = Math.max(0, (updated[t.id] ?? 0.5) - 0.15);
        } else if (t.gradeLevel === topicGrade) {
          updated[t.id] = Math.max(0, (updated[t.id] ?? 0.5) - 0.08);
        }
      }
      // Direct dependents get extra penalty
      const deps = dependentMap.get(topicId) ?? [];
      for (const did of deps) {
        updated[did] = Math.max(0, (updated[did] ?? 0.5) - 0.1);
      }
    }

    return updated;
  }

  /** Update search bounds based on answer correctness */
  function updateSearchBounds(state: DiagnosticState, topicGrade: number, correct: boolean): void {
    if (correct) {
      // Raise the floor — student knows at least this level
      state.searchLow = Math.max(state.searchLow, topicGrade);
      if (state.streakDirection === "correct") {
        state.streak++;
      } else {
        state.streak = 1;
        state.streakDirection = "correct";
      }
    } else {
      // Lower the ceiling — student doesn't know this level
      state.searchHigh = Math.min(state.searchHigh, topicGrade);
      if (state.streakDirection === "incorrect") {
        state.streak++;
      } else {
        state.streak = 1;
        state.streakDirection = "incorrect";
      }
    }

    // Switch to refine phase when search range is narrow enough
    if (state.phase === "search" && state.searchHigh - state.searchLow <= 1.5) {
      state.phase = "refine";
    }
  }

  /** Check if the diagnostic should stop early based on confidence */
  function shouldStop(state: DiagnosticState, isTaste: boolean): boolean {
    const questionsAsked = state.askedTopicIds.length;

    if (questionsAsked >= MAX_QUESTIONS) return true;
    if (isTaste && questionsAsked >= 8) return true;
    if (questionsAsked < MIN_QUESTIONS) return false;

    // In refine phase, stop when we have enough questions in the boundary zone
    if (state.phase === "refine") {
      const boundaryRange = state.searchHigh - state.searchLow;
      if (boundaryRange <= BOUNDARY_PRECISION) return true;
      // After 3+ refine questions, good enough
      const refineQuestions = questionsAsked - MIN_QUESTIONS;
      if (refineQuestions >= 5) return true;
    }

    return false;
  }

  function computeEstimatedFrontier(
    estimates: TopicEstimates,
    prereqMap: Map<string, string[]>,
    threshold = 0.6
  ): string[] {
    const frontier: string[] = [];
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= threshold) continue;
      const prereqs = prereqMap.get(topicId) ?? [];
      const prereqsMastered = prereqs.every((pid) => (estimates[pid] ?? 0.5) >= threshold);
      if (prereqsMastered || prereqs.length === 0) {
        frontier.push(topicId);
      }
    }
    return frontier;
  }

  function estimateLevel(estimates: TopicEstimates, allTopics: { id: string; gradeLevel: number }[]): string {
    const topicMap = new Map(allTopics.map((t) => [t.id, t]));
    let highestMasteredGrade = -1;
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= 0.6) {
        const topic = topicMap.get(topicId);
        if (topic && topic.gradeLevel > highestMasteredGrade) {
          highestMasteredGrade = topic.gradeLevel;
        }
      }
    }
    if (highestMasteredGrade < 0) return "Kindergarten";
    if (highestMasteredGrade === 0) return "Kindergarten";
    return `Grade ${highestMasteredGrade}`;
  }

  /** Materialize diagnostic estimates into user_topic_state rows */
  async function materializeMastery(
    userId: string,
    estimates: TopicEstimates,
    frontier: string[],
    allTopics: { id: string; gradeLevel: number }[]
  ): Promise<{ mastered: number; frontierCount: number }> {
    const frontierSet = new Set(frontier);
    const now = new Date().toISOString();
    let mastered = 0;
    let frontierCount = 0;

    for (const topic of allTopics) {
      const prob = estimates[topic.id] ?? 0.5;
      const isMastered = prob >= 0.6;
      const isFrontier = frontierSet.has(topic.id);

      if (!isMastered && !isFrontier) continue;

      if (isMastered) mastered++;
      if (isFrontier) frontierCount++;

      // Upsert: insert or update
      const existing = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topic.id)
        ),
      });

      if (existing) {
        await db
          .update(schema.userTopicState)
          .set({
            mastered: isMastered,
            frontier: isFrontier,
            // If mastered, set FSRS state to Review; if frontier, set to New
            state: isMastered ? 2 : 0,
            reps: isMastered ? 1 : 0,
            lastReview: isMastered ? now : null,
          })
          .where(eq(schema.userTopicState.id, existing.id));
      } else {
        await db.insert(schema.userTopicState).values({
          userId,
          topicId: topic.id,
          mastered: isMastered,
          frontier: isFrontier,
          state: isMastered ? 2 : 0,
          reps: isMastered ? 1 : 0,
          due: now,
          lastReview: isMastered ? now : null,
        });
      }
    }

    return { mastered, frontierCount };
  }

  return {
    async startDiagnostic(params: {
      userId?: string;
      anonymousToken?: string;
      subjectId: string;
      isTaste?: boolean;
    }) {
      const sessionId = crypto.randomUUID();
      const { allTopics, prereqMap, dependentMap } = await loadAllTopicsAndEdges(params.subjectId);
      const isTaste = params.isTaste ?? false;

      // Cancel any active diagnostic for this user/token
      const userFilter = params.userId
        ? eq(schema.diagnosticSessions.userId, params.userId)
        : params.anonymousToken
          ? eq(schema.diagnosticSessions.anonymousToken, params.anonymousToken)
          : null;
      if (userFilter) {
        await db
          .update(schema.diagnosticSessions)
          .set({ status: "cancelled" })
          .where(and(userFilter, eq(schema.diagnosticSessions.status, "active")));
      }

      // Compute grade range for adaptive search
      const grades = [...new Set(allTopics.map((t) => t.gradeLevel))].sort((a, b) => a - b);
      const minGrade = grades[0] ?? 0;
      const maxGrade = grades[grades.length - 1] ?? 5;

      const initialEstimates: TopicEstimates = {};
      for (const t of allTopics) {
        initialEstimates[t.id] = 0.5;
      }

      const state: DiagnosticState = {
        currentTopicId: null,
        currentQuestionId: null,
        askedTopicIds: [],
        askedQuestionIds: [],
        topicEstimates: initialEstimates,
        phase: "search",
        searchLow: minGrade,
        searchHigh: maxGrade,
        streak: 0,
        streakDirection: null,
      };

      // Start at middle grade
      const startGrade = Math.round((minGrade + maxGrade) / 2);
      const firstTopicId = selectNextTopic(
        { ...state, searchLow: startGrade - 0.1, searchHigh: startGrade + 0.1 },
        allTopics,
        prereqMap
      ) ?? selectNextTopic(state, allTopics, prereqMap);

      if (!firstTopicId) {
        return { error: "No topics available for diagnostic" };
      }

      const problems = await getTopicProblems(firstTopicId);
      const problem = problems[0];
      if (!problem) {
        return { error: "No problems available for diagnostic" };
      }

      state.currentTopicId = firstTopicId;
      state.currentQuestionId = problem.id;

      await db.insert(schema.diagnosticSessions).values({
        id: sessionId,
        userId: params.userId ?? null,
        anonymousToken: params.anonymousToken ?? null,
        subjectId: params.subjectId,
        isTaste: isTaste,
        stateJson: JSON.stringify(state),
      });

      return {
        sessionId,
        question: {
          topicId: firstTopicId,
          problem,
          questionNumber: 1,
          totalQuestions: isTaste ? 8 : null, // Adaptive: no fixed total
        },
      };
    },

    async respond(sessionId: string, answer: string) {
      const row = await db.query.diagnosticSessions.findFirst({
        where: eq(schema.diagnosticSessions.id, sessionId),
      });
      if (!row || row.status !== "active") {
        return { error: "Diagnostic session not found or completed" };
      }

      const state: DiagnosticState = JSON.parse(row.stateJson!);
      const isTaste = row.isTaste;

      const { allTopics, prereqMap, dependentMap } = await loadAllTopicsAndEdges(row.subjectId);

      // Grade the answer
      const currentTopicId = state.currentTopicId;
      const currentQuestionId = state.currentQuestionId;
      if (!currentTopicId || !currentQuestionId) {
        return { error: "No current question" };
      }

      const problems = await getTopicProblems(currentTopicId);
      const currentProblem = problems.find((p) => p.id === currentQuestionId) ?? problems[0];
      if (!currentProblem) {
        return { error: "No problem found" };
      }

      const gradeResult = gradeProblem(currentProblem, answer);
      const isCorrect = gradeResult.correct;

      // Update state
      state.askedTopicIds.push(currentTopicId);
      state.askedQuestionIds.push(currentProblem.id);

      // Propagate estimates through the graph
      const currentTopic = allTopics.find((t) => t.id === currentTopicId);
      state.topicEstimates = propagateResult(
        currentTopicId, isCorrect, state.topicEstimates, prereqMap, dependentMap, allTopics
      );

      // Update adaptive search bounds
      if (currentTopic) {
        updateSearchBounds(state, currentTopic.gradeLevel, isCorrect);
      }

      const questionsAsked = state.askedTopicIds.length;
      const questionsCorrect = (row.questionsCorrect ?? 0) + (isCorrect ? 1 : 0);

      // Check if done
      const done = shouldStop(state, isTaste);

      if (done) {
        const estimatedFrontier = computeEstimatedFrontier(state.topicEstimates, prereqMap);
        const level = estimateLevel(state.topicEstimates, allTopics);

        // Materialize mastery into user_topic_state
        let materializeStats = { mastered: 0, frontierCount: 0 };
        if (row.userId) {
          materializeStats = await materializeMastery(
            row.userId, state.topicEstimates, estimatedFrontier, allTopics
          );
        }

        await db
          .update(schema.diagnosticSessions)
          .set({
            status: "completed",
            questionsAsked,
            questionsCorrect,
            estimatedFrontierJson: JSON.stringify(estimatedFrontier),
            topicEstimatesJson: JSON.stringify(state.topicEstimates),
            stateJson: JSON.stringify(state),
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.diagnosticSessions.id, sessionId));

        const result: DiagnosticResult = {
          sessionId,
          questionsAsked,
          questionsCorrect,
          estimatedLevel: level,
          estimatedFrontier,
          topicEstimates: state.topicEstimates,
        };

        return { done: true, correct: isCorrect, result };
      }

      // Not done — next question
      const nextTopicId = selectNextTopic(state, allTopics, prereqMap);
      if (!nextTopicId) {
        // Ran out of topics — complete
        const estimatedFrontier = computeEstimatedFrontier(state.topicEstimates, prereqMap);
        const level = estimateLevel(state.topicEstimates, allTopics);

        let materializeStats = { mastered: 0, frontierCount: 0 };
        if (row.userId) {
          materializeStats = await materializeMastery(
            row.userId, state.topicEstimates, estimatedFrontier, allTopics
          );
        }

        await db
          .update(schema.diagnosticSessions)
          .set({
            status: "completed",
            questionsAsked,
            questionsCorrect,
            estimatedFrontierJson: JSON.stringify(estimatedFrontier),
            topicEstimatesJson: JSON.stringify(state.topicEstimates),
            stateJson: JSON.stringify(state),
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.diagnosticSessions.id, sessionId));

        return {
          done: true,
          correct: isCorrect,
          result: {
            sessionId,
            questionsAsked,
            questionsCorrect,
            estimatedLevel: level,
            estimatedFrontier,
            topicEstimates: state.topicEstimates,
          } satisfies DiagnosticResult,
        };
      }

      const nextProblems = await getTopicProblems(nextTopicId);
      const nextProblem = nextProblems.find((p) => !state.askedQuestionIds.includes(p.id)) ?? nextProblems[0];

      state.currentTopicId = nextTopicId;
      state.currentQuestionId = nextProblem?.id ?? null;

      await db
        .update(schema.diagnosticSessions)
        .set({
          questionsAsked,
          questionsCorrect,
          stateJson: JSON.stringify(state),
        })
        .where(eq(schema.diagnosticSessions.id, sessionId));

      return {
        done: false,
        correct: isCorrect,
        question: nextProblem ? {
          topicId: nextTopicId,
          problem: nextProblem,
          questionNumber: questionsAsked + 1,
          totalQuestions: null, // Adaptive: we don't know in advance
        } : null,
      };
    },

    async getResult(sessionId: string): Promise<DiagnosticResult | null> {
      const row = await db.query.diagnosticSessions.findFirst({
        where: eq(schema.diagnosticSessions.id, sessionId),
      });
      if (!row || row.status !== "completed") return null;

      const allTopics = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.subjectId, row.subjectId));
      const estimates: TopicEstimates = row.topicEstimatesJson
        ? JSON.parse(row.topicEstimatesJson)
        : {};

      return {
        sessionId: row.id,
        questionsAsked: row.questionsAsked,
        questionsCorrect: row.questionsCorrect,
        estimatedLevel: estimateLevel(estimates, allTopics),
        estimatedFrontier: row.estimatedFrontierJson ? JSON.parse(row.estimatedFrontierJson) : [],
        topicEstimates: estimates,
      };
    },
  };
}
