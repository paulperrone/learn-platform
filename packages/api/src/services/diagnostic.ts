import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createContentService, buildDefaultDistribution } from "./content.js";
import type { PresentationDistribution } from "./content.js";
import { gradeProblem } from "./grading.js";
import type { Problem, DiagnosticResult, PresentationLevel } from "@learn/shared";

/** Diagnostic estimate threshold for implicit mastery. Topics with estimate >= this
 *  value are considered mastered without explicit SRS materialization. Raised from
 *  0.6 to 0.75 to require stronger evidence before assuming mastery — with the
 *  reduced credit propagation (+0.12 per correct answer for lower grades, down from
 *  +0.2), a lower-grade topic needs ~3 confirming correct answers at higher grades
 *  to reach implicit mastery (was 1-2 answers at 0.6). */
export const IMPLICIT_MASTERY_THRESHOLD = 0.75;

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
  /** Presentation level served for each question (parallel to askedTopicIds) */
  servedPresentationLevels: PresentationLevel[];
  /** Tracks which questions the student got correct (parallel to askedTopicIds) */
  correctness: boolean[];
};

/** Max questions before forced completion — prevents infinite diagnostics */
const MAX_QUESTIONS = 15;
/** Min questions before we allow early stop based on confidence */
const MIN_QUESTIONS = 8;
/** Confidence threshold: stop when boundary is within this many grade levels */
const BOUNDARY_PRECISION = 0.5;

export function createDiagnosticService(db: DB, r2Bucket?: R2Bucket) {
  const graph = createGraphService(db);
  const content = createContentService(db, r2Bucket);

  /**
   * Fetch problems for a topic during diagnostic using dimension-aware content selection.
   * Uses age-default presentation (no subject distribution yet — we're building it).
   */
  async function getDiagnosticProblems(
    topicId: string,
    birthYear: number | null | undefined,
    disciplineId?: string,
  ): Promise<{ problems: Problem[]; presentation: PresentationLevel }> {
    const defaultDist = buildDefaultDistribution(birthYear);
    // Use deterministic center level for diagnostic (not random sampling)
    // so signal tracking is meaningful — we know exactly what level was served
    const presentation = defaultDist.centerLevel;

    const problems = await content.getTopicProblems({
      topicId,
      discipline: disciplineId,
      contentDepth: "survey", // Diagnostic always uses survey depth
      presentation,
    });

    // If dimension-aware query returns nothing, fall back to any content for topic
    if (problems.length === 0) {
      const fallbackRows = await db
        .select()
        .from(schema.assessmentContent)
        .where(eq(schema.assessmentContent.topicId, topicId));
      const fallbackProblems: Problem[] = fallbackRows.map((r) => ({
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
      return { problems: fallbackProblems, presentation };
    }

    return { problems, presentation };
  }

  async function loadAllTopicsAndEdges(disciplineId: string) {
    const allTopics = await db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.disciplineId, disciplineId));
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
        const available = candidates
          .filter((t) => !state.askedTopicIds.includes(t.id));
        if (available.length > 0) {
          // Randomly pick among available topics for variance across sessions
          return available[Math.floor(Math.random() * available.length)].id;
        }
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
      // Correct: credit this topic and propagate moderate signal to related topics.
      // Lower-grade credit reduced from 0.2→0.12 and same-grade from 0.1→0.06.
      // Combined with 0.75 implicit mastery threshold (up from 0.6), a lower-grade
      // topic needs ~3 confirming correct answers at higher grades to reach implicit
      // mastery (was 1-2 at previous settings).
      updated[topicId] = Math.min(1, (updated[topicId] ?? 0.5) + 0.35);
      for (const t of allTopics) {
        if (t.id === topicId) continue;
        if (t.gradeLevel < topicGrade) {
          updated[t.id] = Math.min(1, (updated[t.id] ?? 0.5) + 0.12);
        } else if (t.gradeLevel === topicGrade) {
          updated[t.id] = Math.min(1, (updated[t.id] ?? 0.5) + 0.06);
        }
      }
      // Direct prereqs get stronger credit (genuinely implied by correct dependents)
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
      // Fix upward placement bias: allow searchLow to decrease when student
      // has 3+ consecutive failures at or below the current floor. Requires
      // streak >= 2 (meaning 2 prior incorrect, this is the 3rd) to avoid
      // noise from stochastic answering at frontier grades.
      if (topicGrade <= state.searchLow && state.streakDirection === "incorrect" && state.streak >= 2) {
        state.searchLow = Math.max(0, topicGrade - 1);
      }
      if (state.streakDirection === "incorrect") {
        state.streak++;
      } else {
        state.streak = 1;
        state.streakDirection = "incorrect";
      }
    }

    // Prevent full lock-in: if bounds collapsed to a single point during search,
    // reopen by decreasing the floor by 1. This happens when a lucky correct answer
    // raised searchLow to the same grade where an incorrect answer lowered searchHigh.
    if (state.searchLow >= state.searchHigh && state.phase === "search") {
      state.searchLow = Math.max(0, state.searchHigh - 1);
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

    // Don't stop if bounds haven't converged — keep asking until within ±1
    const boundaryRange = state.searchHigh - state.searchLow;
    if (boundaryRange > 1) return false;

    // In refine phase, stop when we have enough questions in the boundary zone
    if (state.phase === "refine") {
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
    threshold = IMPLICIT_MASTERY_THRESHOLD
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
      if (prob >= IMPLICIT_MASTERY_THRESHOLD) {
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

  /**
   * Estimate a presentation distribution from diagnostic signals.
   * Starts from age-default, then adjusts based on comprehension patterns.
   *
   * Signals that suggest linguistic mismatch (presentation too high):
   * - Consistent incorrect answers on topics where prerequisites are mastered
   *   (knowledge is there but presentation may be blocking comprehension)
   *
   * Signals that confirm age-default is appropriate:
   * - Correct/incorrect pattern matches mastery boundary (knowledge-driven, not presentation-driven)
   */
  function estimatePresentationDistribution(
    state: DiagnosticState,
    birthYear: number | null | undefined,
    estimates: TopicEstimates,
    prereqMap: Map<string, string[]>
  ): PresentationDistribution {
    const dist = buildDefaultDistribution(birthYear);

    if (state.askedTopicIds.length === 0) return dist;

    // Count questions where student got prerequisites right but failed this topic
    // This suggests possible linguistic/presentation mismatch rather than knowledge gap
    let prereqMasteredButFailed = 0;
    let prereqMasteredTotal = 0;

    for (let i = 0; i < state.askedTopicIds.length; i++) {
      const topicId = state.askedTopicIds[i];
      const correct = state.correctness[i];
      const prereqs = prereqMap.get(topicId) ?? [];

      // Check if all prerequisites are mastered (high estimate)
      const allPrereqsMastered = prereqs.length > 0 &&
        prereqs.every((pId) => (estimates[pId] ?? 0.5) >= IMPLICIT_MASTERY_THRESHOLD);

      if (allPrereqsMastered) {
        prereqMasteredTotal++;
        if (!correct) prereqMasteredButFailed++;
      }
    }

    // If ≥40% of "should-know" questions were wrong, shift presentation down
    if (prereqMasteredTotal >= 3 && prereqMasteredButFailed / prereqMasteredTotal >= 0.4) {
      return shiftDistributionDown(dist);
    }

    // Check for performance significantly above age-expected level — shift UP
    // If searchLow (confirmed grade floor) is 2+ grades above age-expected,
    // the student needs more advanced presentation
    const currentYear = new Date().getFullYear();
    const age = birthYear ? currentYear - birthYear : null;
    if (age !== null) {
      const ageExpectedGrade = Math.max(0, age - 5);
      if (state.searchLow >= ageExpectedGrade + 2) {
        return shiftDistributionUp(dist);
      }
    }

    return dist;
  }

  /** Shift a distribution's center down one level */
  function shiftDistributionDown(dist: PresentationDistribution): PresentationDistribution {
    const levels: PresentationLevel[] = ["primary", "intermediate", "standard", "advanced"];
    const currentIdx = levels.indexOf(dist.centerLevel);
    if (currentIdx <= 0) return dist; // Already at lowest

    const newCenterIdx = currentIdx - 1;
    const weights = [0, 0, 0, 0];
    weights[newCenterIdx] = 0.75;
    if (newCenterIdx > 0) weights[newCenterIdx - 1] = 0.15;
    if (newCenterIdx < 3) weights[newCenterIdx + 1] = 0.10;
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum < 1.0) weights[newCenterIdx] += 1.0 - sum;

    return {
      primary: weights[0],
      intermediate: weights[1],
      standard: weights[2],
      advanced: weights[3],
      centerLevel: levels[newCenterIdx],
      driftSignal: 0,
    };
  }

  /** Shift a distribution's center up one level */
  function shiftDistributionUp(dist: PresentationDistribution): PresentationDistribution {
    const levels: PresentationLevel[] = ["primary", "intermediate", "standard", "advanced"];
    const currentIdx = levels.indexOf(dist.centerLevel);
    if (currentIdx >= levels.length - 1) return dist; // Already at highest

    const newCenterIdx = currentIdx + 1;
    const weights = [0, 0, 0, 0];
    weights[newCenterIdx] = 0.75;
    if (newCenterIdx > 0) weights[newCenterIdx - 1] = 0.10;
    if (newCenterIdx < 3) weights[newCenterIdx + 1] = 0.15;
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum < 1.0) weights[newCenterIdx] += 1.0 - sum;

    return {
      primary: weights[0],
      intermediate: weights[1],
      standard: weights[2],
      advanced: weights[3],
      centerLevel: levels[newCenterIdx],
      driftSignal: 0,
    };
  }

  /** Materialize diagnostic estimates into user_topic_state rows */
  async function materializeMastery(
    userId: string,
    estimates: TopicEstimates,
    frontier: string[],
    allTopics: { id: string; gradeLevel: number }[],
    disciplineId: string,
    state: DiagnosticState,
    prereqMap: Map<string, string[]>
  ): Promise<{ mastered: number; frontierCount: number }> {
    const frontierSet = new Set(frontier);
    const now = new Date().toISOString();
    let mastered = 0;
    let frontierCount = 0;

    // Compute placement grade: highest grade with mastery estimate >= threshold
    let placementGrade = 0;
    for (const topic of allTopics) {
      const prob = estimates[topic.id] ?? 0.5;
      if (prob >= IMPLICIT_MASTERY_THRESHOLD && topic.gradeLevel > placementGrade) {
        placementGrade = topic.gradeLevel;
      }
    }

    for (const topic of allTopics) {
      const prob = estimates[topic.id] ?? 0.5;
      const isMastered = prob >= IMPLICIT_MASTERY_THRESHOLD;
      const isFrontier = frontierSet.has(topic.id);

      if (!isMastered && !isFrontier) continue;

      if (isMastered) mastered++;
      if (isFrontier) frontierCount++;

      // Reduced materialization: only materialize topics at or above the placement
      // grade (and frontier topics). Topics below placement are implicitly mastered —
      // computeFrontier infers mastery from diagnostic estimates.
      // This dramatically reduces user_topic_state rows, keeping:
      //   - Fewer "started" topics → larger frontier for new topic introduction
      //   - Fewer mastered warmup candidates → more session slots for new/review
      //   - Better review/new balance (more frontier exploration)
      if (isMastered && !isFrontier && topic.gradeLevel < placementGrade) {
        continue;
      }

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
            // If mastered, set FSRS state to Review with reasonable defaults
            state: isMastered ? 2 : 0,
            reps: isMastered ? 1 : 0,
            stability: isMastered ? 15 : 0,
            difficulty: isMastered ? 5 : 0,
            consecutiveCorrectReviews: isMastered ? 3 : 0,

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
          stability: isMastered ? 15 : 0,
          difficulty: isMastered ? 5 : 0,
          consecutiveCorrectReviews: isMastered ? 3 : 0,
          due: now,
          lastReview: isMastered ? now : null,
        });
      }
    }

    // Seed presentation distribution from diagnostic signals
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    const estimatedDist = estimatePresentationDistribution(
      state, user?.birthYear, estimates, prereqMap
    );
    await content.upsertDisciplineDistribution(userId, disciplineId, estimatedDist);

    return { mastered, frontierCount };
  }

  return {
    async startDiagnostic(params: {
      userId?: string;
      anonymousToken?: string;
      disciplineId: string;
      isTaste?: boolean;
    }) {
      const sessionId = crypto.randomUUID();
      const { allTopics, prereqMap, dependentMap } = await loadAllTopicsAndEdges(params.disciplineId);
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

      // Look up birth year for presentation selection
      let birthYear: number | null = null;
      if (params.userId) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, params.userId),
        });
        birthYear = user?.birthYear ?? null;
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
        servedPresentationLevels: [],
        correctness: [],
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

      const { problems, presentation: firstPresentation } = await getDiagnosticProblems(firstTopicId, birthYear, params.disciplineId);
      if (problems.length === 0) {
        return { error: "No problems available for diagnostic" };
      }
      const problem = problems[Math.floor(Math.random() * problems.length)];

      state.currentTopicId = firstTopicId;
      state.currentQuestionId = problem.id;

      await db.insert(schema.diagnosticSessions).values({
        id: sessionId,
        userId: params.userId ?? null,
        anonymousToken: params.anonymousToken ?? null,
        disciplineId: params.disciplineId,
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

      const { allTopics, prereqMap, dependentMap } = await loadAllTopicsAndEdges(row.disciplineId);

      // Grade the answer
      const currentTopicId = state.currentTopicId;
      const currentQuestionId = state.currentQuestionId;
      if (!currentTopicId || !currentQuestionId) {
        return { error: "No current question" };
      }

      // Look up birth year for presentation selection
      let birthYear: number | null = null;
      if (row.userId) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, row.userId),
        });
        birthYear = user?.birthYear ?? null;
      }

      const { problems } = await getDiagnosticProblems(currentTopicId, birthYear, row.disciplineId);
      const currentProblem = problems.find((p) => p.id === currentQuestionId) ?? problems[0];
      if (!currentProblem) {
        return { error: "No problem found" };
      }

      const gradeResult = gradeProblem(currentProblem, answer);
      const isCorrect = gradeResult.correct;

      // Update state — track correctness and presentation levels
      state.askedTopicIds.push(currentTopicId);
      state.askedQuestionIds.push(currentProblem.id);
      state.correctness = state.correctness ?? [];
      state.correctness.push(isCorrect);
      // Presentation level for current question was determined at serve time
      // (stored when we selected the problem). For backwards compat with
      // in-progress diagnostics that don't have this field, default to center.
      if (!state.servedPresentationLevels) {
        state.servedPresentationLevels = [];
      }

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

        // Materialize mastery into user_topic_state + seed presentation distribution
        let materializeStats = { mastered: 0, frontierCount: 0 };
        if (row.userId) {
          materializeStats = await materializeMastery(
            row.userId, state.topicEstimates, estimatedFrontier, allTopics,
            row.disciplineId, state, prereqMap
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
            row.userId, state.topicEstimates, estimatedFrontier, allTopics,
            row.disciplineId, state, prereqMap
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

      const { problems: nextProblems, presentation: nextPresentation } = await getDiagnosticProblems(nextTopicId, birthYear, row.disciplineId);
      state.servedPresentationLevels.push(nextPresentation);
      const unseenProblems = nextProblems.filter((p) => !state.askedQuestionIds.includes(p.id));
      const nextProblem = unseenProblems.length > 0
        ? unseenProblems[Math.floor(Math.random() * unseenProblems.length)]
        : nextProblems[Math.floor(Math.random() * nextProblems.length)];

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

    async resume(params: { userId?: string; anonymousToken?: string; disciplineId: string }) {
      const userFilter = params.userId
        ? eq(schema.diagnosticSessions.userId, params.userId)
        : params.anonymousToken
          ? eq(schema.diagnosticSessions.anonymousToken, params.anonymousToken)
          : null;
      if (!userFilter) return null;

      const row = await db.query.diagnosticSessions.findFirst({
        where: and(
          userFilter,
          eq(schema.diagnosticSessions.disciplineId, params.disciplineId),
          eq(schema.diagnosticSessions.status, "active")
        ),
      });
      if (!row || !row.stateJson) return null;

      const state: DiagnosticState = JSON.parse(row.stateJson);
      if (!state.currentTopicId || !state.currentQuestionId) return null;

      let birthYear: number | null = null;
      if (row.userId) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, row.userId),
        });
        birthYear = user?.birthYear ?? null;
      }

      const { problems } = await getDiagnosticProblems(state.currentTopicId, birthYear, row.disciplineId);
      const problem = problems.find((p) => p.id === state.currentQuestionId) ?? problems[0];
      if (!problem) return null;

      return {
        sessionId: row.id,
        question: {
          topicId: state.currentTopicId,
          problem,
          questionNumber: state.askedTopicIds.length + 1,
          totalQuestions: null,
        },
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
        .where(eq(schema.topics.disciplineId, row.disciplineId));
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
