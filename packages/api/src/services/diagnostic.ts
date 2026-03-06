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
};

/** Scale diagnostic length with graph size: ~25 for 71 topics, ~35 for 150, caps at 50 */
function diagnosticTarget(topicCount: number, isTaste: boolean): number {
  if (isTaste) return Math.min(8, topicCount);
  // sqrt(n) * 3 gives good coverage without being exhausting
  return Math.min(Math.max(10, Math.round(Math.sqrt(topicCount) * 3)), 50, topicCount);
}

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

  function selectCoveringTopics(
    allTopics: { id: string; depth: number; gradeLevel: number }[],
    prereqMap: Map<string, string[]>,
    isTaste: boolean
  ): string[] {
    // Select topics that maximally cover the graph with minimum questions.
    // Strategy: pick topics at varying depth levels so correct/incorrect propagates well.
    const target = diagnosticTarget(allTopics.length, isTaste);
    const sorted = [...allTopics].sort((a, b) => a.depth - b.depth || a.gradeLevel - b.gradeLevel);

    const maxDepth = Math.max(...sorted.map((t) => t.depth), 0);
    if (maxDepth === 0 || sorted.length <= target) {
      return sorted.slice(0, target).map((t) => t.id);
    }

    // Sample evenly across depth levels
    const byDepth = new Map<number, typeof sorted>();
    for (const t of sorted) {
      const list = byDepth.get(t.depth) ?? [];
      list.push(t);
      byDepth.set(t.depth, list);
    }

    const selected: string[] = [];
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    const perDepth = Math.max(1, Math.ceil(target / depths.length));

    for (const depth of depths) {
      if (selected.length >= target) break;
      const topics = byDepth.get(depth)!;
      // Prefer topics with more prerequisites (better signal)
      topics.sort((a, b) => (prereqMap.get(b.id)?.length ?? 0) - (prereqMap.get(a.id)?.length ?? 0));
      for (const t of topics) {
        if (selected.length >= target) break;
        selected.push(t.id);
      }
    }

    return selected;
  }

  function selectNextQuestion(
    state: DiagnosticState,
    coveringTopics: string[],
    topicEstimates: TopicEstimates
  ): string | null {
    // Pick the covering topic with highest uncertainty (closest to 0.5) that hasn't been asked
    const candidates = coveringTopics.filter((id) => !state.askedTopicIds.includes(id));
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const uncA = Math.abs((topicEstimates[a] ?? 0.5) - 0.5);
      const uncB = Math.abs((topicEstimates[b] ?? 0.5) - 0.5);
      return uncA - uncB; // Most uncertain first
    });

    return candidates[0];
  }

  function propagateResult(
    topicId: string,
    correct: boolean,
    estimates: TopicEstimates,
    prereqMap: Map<string, string[]>,
    dependentMap: Map<string, string[]>
  ): TopicEstimates {
    const updated = { ...estimates };

    if (correct) {
      // Correct answer → credit prerequisites (they're likely known too)
      updated[topicId] = Math.min(1, (updated[topicId] ?? 0.5) + 0.3);
      const prereqs = prereqMap.get(topicId) ?? [];
      for (const pid of prereqs) {
        updated[pid] = Math.min(1, (updated[pid] ?? 0.5) + 0.2);
      }
    } else {
      // Incorrect → penalize dependents (they're likely unknown too)
      updated[topicId] = Math.max(0, (updated[topicId] ?? 0.5) - 0.3);
      const deps = dependentMap.get(topicId) ?? [];
      for (const did of deps) {
        updated[did] = Math.max(0, (updated[did] ?? 0.5) - 0.15);
      }
    }

    return updated;
  }

  function computeEstimatedFrontier(
    estimates: TopicEstimates,
    prereqMap: Map<string, string[]>,
    threshold = 0.6
  ): string[] {
    // Frontier: topics where prerequisites are likely mastered but this topic is not
    const frontier: string[] = [];
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= threshold) continue; // Already likely mastered
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
    let highestMasteredGrade = 0;
    for (const [topicId, prob] of Object.entries(estimates)) {
      if (prob >= 0.6) {
        const topic = topicMap.get(topicId);
        if (topic && topic.gradeLevel > highestMasteredGrade) {
          highestMasteredGrade = topic.gradeLevel;
        }
      }
    }
    if (highestMasteredGrade === 0) return "Kindergarten";
    return `Grade ${highestMasteredGrade}`;
  }

  return {
    async startDiagnostic(params: {
      userId?: string;
      anonymousToken?: string;
      subjectId: string;
      isTaste?: boolean;
    }) {
      const sessionId = crypto.randomUUID();
      const { allTopics, prereqMap } = await loadAllTopicsAndEdges(params.subjectId);
      const isTaste = params.isTaste ?? false;

      const coveringTopics = selectCoveringTopics(allTopics, prereqMap, isTaste);

      const initialEstimates: TopicEstimates = {};
      for (const t of allTopics) {
        initialEstimates[t.id] = 0.5; // Start uncertain
      }

      const firstTopicId = selectNextQuestion(
        { currentTopicId: null, currentQuestionId: null, askedTopicIds: [], askedQuestionIds: [], topicEstimates: initialEstimates },
        coveringTopics,
        initialEstimates
      );
      if (!firstTopicId) {
        return { error: "No topics available for diagnostic" };
      }

      const problems = await getTopicProblems(firstTopicId);
      const problem = problems[0];
      if (!problem) {
        return { error: "No problems available for diagnostic" };
      }

      const state: DiagnosticState = {
        currentTopicId: firstTopicId,
        currentQuestionId: problem.id,
        askedTopicIds: [],
        askedQuestionIds: [],
        topicEstimates: initialEstimates,
      };

      await db.insert(schema.diagnosticSessions).values({
        id: sessionId,
        userId: params.userId ?? null,
        anonymousToken: params.anonymousToken ?? null,
        subjectId: params.subjectId,
        isTaste: isTaste,
        stateJson: JSON.stringify({ ...state, coveringTopics }),
      });

      return {
        sessionId,
        question: {
          topicId: firstTopicId,
          problem,
          questionNumber: 1,
          totalQuestions: coveringTopics.length,
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

      const parsed = JSON.parse(row.stateJson!);
      const state: DiagnosticState & { coveringTopics: string[] } = parsed;
      const isTaste = row.isTaste;

      const { allTopics, prereqMap, dependentMap } = await loadAllTopicsAndEdges(row.subjectId);
      const target = diagnosticTarget(allTopics.length, isTaste);

      // Grade the answer for the current question
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
      state.topicEstimates = propagateResult(
        currentTopicId, isCorrect, state.topicEstimates, prereqMap, dependentMap
      );

      const questionsAsked = state.askedTopicIds.length;
      const questionsCorrect = (row.questionsCorrect ?? 0) + (isCorrect ? 1 : 0);

      // Check if done
      const done = questionsAsked >= target ||
        state.coveringTopics.every((id) => state.askedTopicIds.includes(id));

      if (done) {
        const estimatedFrontier = computeEstimatedFrontier(state.topicEstimates, prereqMap);
        const level = estimateLevel(state.topicEstimates, allTopics);

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
      const nextTopicId = selectNextQuestion(state, state.coveringTopics, state.topicEstimates);
      if (!nextTopicId) {
        // Ran out of covering topics — complete early
        const estimatedFrontier = computeEstimatedFrontier(state.topicEstimates, prereqMap);
        const level = estimateLevel(state.topicEstimates, allTopics);

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

      // Update state with next question info
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
          totalQuestions: state.coveringTopics.length,
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
