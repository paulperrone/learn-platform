import { eq, and, desc, inArray } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createContentService } from "./content.js";
import type { ContentBucket } from "./content-r2.js";
import { gradeProblem } from "./grading.js";
import { PACING_FACTOR_MIN, PACING_FACTOR_MAX } from "./srs.js";
import type {
  AssessmentScope,
  AssessmentSessionConfig,
  AssessmentItem,
  AssessmentResult,
  AssessmentSummary,
  AssessmentStrandScore,
  AssessmentStandardScore,
  StandardClassification,
  Problem,
} from "@learn/shared";

type TopicRow = typeof schema.topics.$inferSelect;

// Stored in questions_json — the pre-determined sequence
type QuestionEntry = {
  topicId: string;
  topicName: string;
  strand: string | null;
  standardCode: string | null;
  disciplineId: string;
  problem: Problem;
};

function classifyStandard(score: number): StandardClassification {
  if (score >= 0.8) return "proficient";
  if (score >= 0.5) return "developing";
  return "needs-support";
}

/** Exponential decay weight for recency: more recently reviewed → higher weight */
function recencyWeight(lastReview: string | null): number {
  if (!lastReview) return 0.5; // never reviewed — moderate weight
  const daysSince = (Date.now() - new Date(lastReview).getTime()) / (1000 * 60 * 60 * 24);
  // Decay: half-life of ~7 days. Recent reviews (0-3 days) get high weight.
  return Math.exp(-daysSince / 7);
}

export function createAssessmentService(db: DB, contentBucket?: ContentBucket) {
  const content = createContentService(db, contentBucket);

  /**
   * Resolve the set of topic IDs in scope, filtered to topics with content available.
   * Returns topics with their metadata for sampling.
   */
  async function resolveScope(userId: string, scope: AssessmentScope): Promise<TopicRow[]> {
    // Get all mastered topics for the user
    const masteredStates = await db
      .select({ topicId: schema.userTopicState.topicId })
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, userId),
        eq(schema.userTopicState.mastered, true),
      ));

    const masteredIds = new Set(masteredStates.map((s) => s.topicId));

    // Also include frontier topics (in-progress learning)
    const frontierStates = await db
      .select({ topicId: schema.userTopicState.topicId })
      .from(schema.userTopicState)
      .where(and(
        eq(schema.userTopicState.userId, userId),
        eq(schema.userTopicState.frontier, true),
      ));

    const eligibleIds = new Set([...masteredIds, ...frontierStates.map((s) => s.topicId)]);

    if (eligibleIds.size === 0) return [];

    // Get topics in scope
    let scopeTopics: TopicRow[];

    if (scope.type === "comprehensive") {
      scopeTopics = await db
        .select()
        .from(schema.topics)
        .where(inArray(schema.topics.id, [...eligibleIds]));
    } else if (scope.type === "grade-band" && scope.gradeLevel != null) {
      scopeTopics = await db
        .select()
        .from(schema.topics)
        .where(and(
          inArray(schema.topics.id, [...eligibleIds]),
          eq(schema.topics.gradeLevel, scope.gradeLevel),
        ));
    } else if (scope.type === "strand" && scope.strandId) {
      scopeTopics = await db
        .select()
        .from(schema.topics)
        .where(and(
          inArray(schema.topics.id, [...eligibleIds]),
          eq(schema.topics.strand, scope.strandId),
        ));
    } else if (scope.type === "collection" && scope.collectionId) {
      const collectionTopicRows = await db
        .select({ topicId: schema.collectionTopics.topicId })
        .from(schema.collectionTopics)
        .where(eq(schema.collectionTopics.collectionId, scope.collectionId));

      const collectionTopicIds = collectionTopicRows
        .map((r) => r.topicId)
        .filter((id) => eligibleIds.has(id));

      if (collectionTopicIds.length === 0) return [];

      scopeTopics = await db
        .select()
        .from(schema.topics)
        .where(inArray(schema.topics.id, collectionTopicIds));
    } else if (scope.type === "custom" && scope.topicIds && scope.topicIds.length > 0) {
      const customIds = scope.topicIds.filter((id) => eligibleIds.has(id));
      if (customIds.length === 0) return [];

      scopeTopics = await db
        .select()
        .from(schema.topics)
        .where(inArray(schema.topics.id, customIds));
    } else {
      return [];
    }

    return scopeTopics;
  }

  /**
   * Sample topics from scope and fetch a problem for each.
   * Returns the pre-determined question sequence.
   */
  async function buildQuestionSequence(
    userId: string,
    scopeTopics: TopicRow[],
    count: number,
    timed: boolean,
  ): Promise<QuestionEntry[]> {
    if (scopeTopics.length === 0) return [];

    // Get last review dates for recency weighting
    const reviewDates = await db
      .select({
        topicId: schema.userTopicState.topicId,
        lastReview: schema.userTopicState.lastReview,
      })
      .from(schema.userTopicState)
      .where(eq(schema.userTopicState.userId, userId));

    const lastReviewByTopic = new Map(reviewDates.map((r) => [r.topicId, r.lastReview]));

    // Compute strands present in scope for coverage tracking
    const strandsInScope = [...new Set(scopeTopics.map((t) => t.strand ?? "unknown"))];
    const strandCount = strandsInScope.length;

    // Assign weights to each topic
    const weighted = scopeTopics.map((topic) => {
      const recency = recencyWeight(lastReviewByTopic.get(topic.id) ?? null);
      // Strand coverage bonus: all strands should be represented
      const strandBonus = strandCount > 1 ? 0.3 : 0;
      // Depth mixing: weight inversely by depth to mix easy and hard
      const depthFactor = 1 / (1 + topic.depth * 0.1);
      const weight = recency * (1 + strandBonus) * depthFactor;
      return { topic, weight };
    });

    // Sort by ascending prerequisite depth for timed mode (easier first)
    if (timed) {
      weighted.sort((a, b) => a.topic.depth - b.topic.depth);
    }

    // Weighted sampling without replacement, ensuring strand diversity
    const selected: TopicRow[] = [];
    const remaining = [...weighted];
    const strandQuota = new Map<string, number>();

    // If we have strands, ensure each strand gets at least 1 slot (up to count)
    if (strandCount > 1) {
      const basePerStrand = Math.max(1, Math.floor(count / strandCount));
      for (const strand of strandsInScope) {
        strandQuota.set(strand, basePerStrand);
      }
    }

    while (selected.length < count && remaining.length > 0) {
      const lastTopicId = selected.length > 0 ? selected[selected.length - 1].id : null;
      const lastStrand = selected.length > 0 ? selected[selected.length - 1].strand : null;

      // Filter: no consecutive same topic
      const candidates = remaining.filter((w) => w.topic.id !== lastTopicId);
      if (candidates.length === 0) break;

      // Prefer under-represented strands
      let pool = candidates;
      if (strandCount > 1 && lastStrand != null) {
        const underRepresented = candidates.filter((w) => {
          const strand = w.topic.strand ?? "unknown";
          return strand !== lastStrand && (strandQuota.get(strand) ?? 0) > 0;
        });
        if (underRepresented.length > 0) pool = underRepresented;
      }

      // Weighted random selection
      const totalWeight = pool.reduce((sum, w) => sum + w.weight, 0);
      let r = Math.random() * totalWeight;
      let picked = pool[pool.length - 1];
      for (const item of pool) {
        r -= item.weight;
        if (r <= 0) {
          picked = item;
          break;
        }
      }

      selected.push(picked.topic);
      const pickedStrand = picked.topic.strand ?? "unknown";
      if (strandQuota.has(pickedStrand)) {
        strandQuota.set(pickedStrand, Math.max(0, (strandQuota.get(pickedStrand) ?? 0) - 1));
      }

      // Remove from remaining
      const idx = remaining.indexOf(picked);
      if (idx !== -1) remaining.splice(idx, 1);
    }

    // Fetch one problem per selected topic
    const questions: QuestionEntry[] = [];
    for (const topic of selected) {
      const problems = await content.getTopicProblems({
        topicId: topic.id,
        discipline: topic.disciplineId,
        contentDepth: "survey",
        presentation: "standard",
      });

      if (problems.length === 0) continue;

      // Pick a random problem from the topic
      const problem = problems[Math.floor(Math.random() * problems.length)];
      questions.push({
        topicId: topic.id,
        topicName: topic.name,
        strand: topic.strand,
        standardCode: topic.standardCode,
        disciplineId: topic.disciplineId,
        problem,
      });
    }

    return questions;
  }

  /** Compute final scores from responses */
  function computeScores(
    questions: QuestionEntry[],
    responses: Map<number, boolean>, // questionNumber (1-based) → correct
  ): {
    totalCorrect: number;
    rawScore: number;
    strandScores: Record<string, AssessmentStrandScore>;
    standardScores: Record<string, AssessmentStandardScore>;
  } {
    const total = questions.length;
    let totalCorrect = 0;
    const strandData: Record<string, { correct: number; total: number }> = {};
    const standardData: Record<string, { correct: number; total: number }> = {};

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const correct = responses.get(i + 1) ?? false;
      if (correct) totalCorrect++;

      const strand = q.strand ?? "other";
      if (!strandData[strand]) strandData[strand] = { correct: 0, total: 0 };
      strandData[strand].total++;
      if (correct) strandData[strand].correct++;

      if (q.standardCode) {
        const code = q.standardCode;
        if (!standardData[code]) standardData[code] = { correct: 0, total: 0 };
        standardData[code].total++;
        if (correct) standardData[code].correct++;
      }
    }

    const rawScore = total > 0 ? totalCorrect / total : 0;

    const strandScores: Record<string, AssessmentStrandScore> = {};
    for (const [strand, data] of Object.entries(strandData)) {
      strandScores[strand] = {
        correct: data.correct,
        total: data.total,
        score: data.total > 0 ? data.correct / data.total : 0,
      };
    }

    const standardScores: Record<string, AssessmentStandardScore> = {};
    for (const [code, data] of Object.entries(standardData)) {
      const score = data.total > 0 ? data.correct / data.total : 0;
      standardScores[code] = {
        standard: code,
        correct: data.correct,
        total: data.total,
        classification: classifyStandard(score),
      };
    }

    return { totalCorrect, rawScore, strandScores, standardScores };
  }

  /** Check if a timed session has expired. Returns true if expired. */
  function isExpired(session: { timeLimitMinutes: number | null; startedAt: string }): boolean {
    if (!session.timeLimitMinutes) return false;
    const expiresAt = new Date(session.startedAt).getTime() + session.timeLimitMinutes * 60 * 1000;
    return Date.now() > expiresAt;
  }

  /** Auto-complete an expired session: score answered questions, mark rest unanswered. */
  async function autoCompleteExpired(sessionId: string): Promise<AssessmentResult> {
    const session = await db.query.assessmentSessions.findFirst({
      where: eq(schema.assessmentSessions.id, sessionId),
    });
    if (!session) throw new Error("Assessment session not found");

    const questions: QuestionEntry[] = JSON.parse(session.questionsJson);
    const existingResponses = await db
      .select()
      .from(schema.assessmentResponses)
      .where(eq(schema.assessmentResponses.assessmentSessionId, sessionId));

    const responseMap = new Map(existingResponses.map((r) => [r.questionNumber, r.correct]));

    const { totalCorrect, rawScore, strandScores, standardScores } = computeScores(questions, responseMap);
    const completedAt = new Date().toISOString();

    await db.update(schema.assessmentSessions)
      .set({
        status: "timed-out",
        questionsAsked: existingResponses.length,
        questionsCorrect: totalCorrect,
        rawScore,
        strandScoresJson: JSON.stringify(strandScores),
        standardScoresJson: JSON.stringify(standardScores),
        completedAt,
      })
      .where(eq(schema.assessmentSessions.id, sessionId));

    const scope: AssessmentScope = JSON.parse(session.scopeJson);
    return {
      sessionId: session.id,
      userId: session.userId,
      scope,
      startedAt: session.startedAt,
      completedAt,
      status: "timed-out",
      totalQuestions: questions.length,
      totalCorrect,
      rawScore,
      strandScores,
      standardScores,
    };
  }

  function buildAssessmentItem(
    session: { startedAt: string; timeLimitMinutes: number | null },
    questionEntry: QuestionEntry,
    questionNumber: number,
    totalQuestions: number,
  ): AssessmentItem {
    let timeRemainingMs: number | undefined;
    if (session.timeLimitMinutes) {
      const expiresAt = new Date(session.startedAt).getTime() + session.timeLimitMinutes * 60 * 1000;
      timeRemainingMs = Math.max(0, expiresAt - Date.now());
    }

    return {
      questionNumber,
      totalQuestions,
      topicId: questionEntry.topicId,
      topicName: questionEntry.topicName,
      problem: questionEntry.problem,
      timeRemainingMs,
    };
  }

  // ===== Public API =====

  async function startAssessment(
    userId: string,
    config: AssessmentSessionConfig,
  ): Promise<{ sessionId: string; firstItem: AssessmentItem | null; totalQuestions: number }> {
    const scopeTopics = await resolveScope(userId, config.scope);

    if (scopeTopics.length === 0) {
      throw new Error("No eligible topics found in scope");
    }

    const questions = await buildQuestionSequence(
      userId,
      scopeTopics,
      config.questionCount,
      !!config.timeLimitMinutes,
    );

    if (questions.length === 0) {
      throw new Error("No content available for topics in scope");
    }

    const sessionId = crypto.randomUUID();
    await db.insert(schema.assessmentSessions).values({
      id: sessionId,
      userId,
      scopeJson: JSON.stringify(config.scope),
      configJson: JSON.stringify(config),
      questionsJson: JSON.stringify(questions),
      timeLimitMinutes: config.timeLimitMinutes ?? null,
      startedAt: new Date().toISOString(),
    });

    const session = await db.query.assessmentSessions.findFirst({
      where: eq(schema.assessmentSessions.id, sessionId),
    });
    if (!session) throw new Error("Failed to create assessment session");

    const firstItem = buildAssessmentItem(session, questions[0], 1, questions.length);
    return { sessionId, firstItem, totalQuestions: questions.length };
  }

  async function respondToAssessment(
    sessionId: string,
    response: { answer: string; responseMs?: number },
  ): Promise<{ correct: boolean; nextItem?: AssessmentItem; result?: AssessmentResult }> {
    const session = await db.query.assessmentSessions.findFirst({
      where: eq(schema.assessmentSessions.id, sessionId),
    });
    if (!session) throw new Error("Assessment session not found");
    if (session.status !== "active") throw new Error("Assessment session is not active");

    // Check timed expiry
    if (isExpired(session)) {
      const result = await autoCompleteExpired(sessionId);
      return { correct: false, result };
    }

    const questions: QuestionEntry[] = JSON.parse(session.questionsJson);
    const nextQuestionNumber = session.questionsAsked + 1;

    if (nextQuestionNumber > questions.length) {
      throw new Error("All questions already answered");
    }

    const questionEntry = questions[nextQuestionNumber - 1];
    const gradeResult = gradeProblem(questionEntry.problem, response.answer);
    const correct = gradeResult.correct;

    // Persist response
    await db.insert(schema.assessmentResponses).values({
      assessmentSessionId: sessionId,
      questionNumber: nextQuestionNumber,
      topicId: questionEntry.topicId,
      problemId: questionEntry.problem.id,
      answer: response.answer,
      correct,
      responseMs: response.responseMs ?? null,
      createdAt: new Date().toISOString(),
    });

    const newQuestionsAsked = session.questionsAsked + 1;
    const newQuestionsCorrect = session.questionsCorrect + (correct ? 1 : 0);
    const isLast = newQuestionsAsked >= questions.length;

    if (isLast) {
      // Build response map for scoring
      const existingResponses = await db
        .select()
        .from(schema.assessmentResponses)
        .where(eq(schema.assessmentResponses.assessmentSessionId, sessionId));

      const responseMap = new Map(existingResponses.map((r) => [r.questionNumber, r.correct]));
      const { totalCorrect, rawScore, strandScores, standardScores } = computeScores(questions, responseMap);
      const completedAt = new Date().toISOString();
      const scope: AssessmentScope = JSON.parse(session.scopeJson);

      await db.update(schema.assessmentSessions)
        .set({
          status: "completed",
          questionsAsked: questions.length,
          questionsCorrect: totalCorrect,
          rawScore,
          strandScoresJson: JSON.stringify(strandScores),
          standardScoresJson: JSON.stringify(standardScores),
          completedAt,
        })
        .where(eq(schema.assessmentSessions.id, sessionId));

      const result: AssessmentResult = {
        sessionId: session.id,
        userId: session.userId,
        scope,
        startedAt: session.startedAt,
        completedAt,
        status: "completed",
        totalQuestions: questions.length,
        totalCorrect,
        rawScore,
        strandScores,
        standardScores,
      };

      return { correct, result };
    }

    // Update progress count
    await db.update(schema.assessmentSessions)
      .set({ questionsAsked: newQuestionsAsked, questionsCorrect: newQuestionsCorrect })
      .where(eq(schema.assessmentSessions.id, sessionId));

    const nextEntry = questions[newQuestionsAsked];
    const nextItem = buildAssessmentItem(session, nextEntry, newQuestionsAsked + 1, questions.length);

    return { correct, nextItem };
  }

  async function getAssessmentResult(sessionId: string): Promise<AssessmentResult> {
    const session = await db.query.assessmentSessions.findFirst({
      where: eq(schema.assessmentSessions.id, sessionId),
    });
    if (!session) throw new Error("Assessment session not found");

    // Check timed expiry
    if (session.status === "active" && isExpired(session)) {
      return autoCompleteExpired(sessionId);
    }

    if (session.status === "active") {
      throw new Error("Assessment session is still in progress");
    }

    const scope: AssessmentScope = JSON.parse(session.scopeJson);
    const questions: QuestionEntry[] = JSON.parse(session.questionsJson);

    return {
      sessionId: session.id,
      userId: session.userId,
      scope,
      startedAt: session.startedAt,
      completedAt: session.completedAt!,
      status: session.status as "completed" | "timed-out",
      totalQuestions: questions.length,
      totalCorrect: session.questionsCorrect,
      rawScore: session.rawScore ?? 0,
      strandScores: session.strandScoresJson ? JSON.parse(session.strandScoresJson) : {},
      standardScores: session.standardScoresJson ? JSON.parse(session.standardScoresJson) : {},
    };
  }

  async function listAssessmentHistory(userId: string): Promise<AssessmentSummary[]> {
    // Lazily expire stale active sessions
    const activeSessions = await db
      .select()
      .from(schema.assessmentSessions)
      .where(and(
        eq(schema.assessmentSessions.userId, userId),
        eq(schema.assessmentSessions.status, "active"),
      ));

    for (const s of activeSessions) {
      if (isExpired(s)) {
        await autoCompleteExpired(s.id);
      }
    }

    const sessions = await db
      .select()
      .from(schema.assessmentSessions)
      .where(eq(schema.assessmentSessions.userId, userId))
      .orderBy(desc(schema.assessmentSessions.startedAt));

    return sessions.map((s) => {
      const questions: QuestionEntry[] = JSON.parse(s.questionsJson);
      return {
        sessionId: s.id,
        scope: JSON.parse(s.scopeJson) as AssessmentScope,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        status: s.status as "active" | "completed" | "timed-out",
        totalQuestions: questions.length,
        totalCorrect: s.questionsCorrect,
        rawScore: s.rawScore,
      };
    });
  }

  /**
   * Clear the assessment gate and apply pacing factor feedback.
   * Called when an assessment completes (last question answered).
   * Score ≥ 0.80 → increase pacing (learn faster)
   * Score 0.60–0.80 → no change
   * Score < 0.60 → decrease pacing (consolidate more)
   */
  async function finishAssessmentGate(userId: string, assessmentSessionId: string, rawScore: number): Promise<void> {
    const existing = await db.query.userLearningState.findFirst({
      where: eq(schema.userLearningState.userId, userId),
    });
    if (!existing) return;

    let newPacing = existing.pacingFactor;
    if (rawScore >= 0.80) {
      newPacing = Math.min(newPacing * 1.15, PACING_FACTOR_MAX);
    } else if (rawScore < 0.60) {
      newPacing = Math.max(newPacing * 0.80, PACING_FACTOR_MIN);
    }

    await db.update(schema.userLearningState)
      .set({
        pendingAssessmentId: null,
        pacingFactor: newPacing,
        lastAssessmentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.userLearningState.userId, userId));
  }

  return {
    startAssessment,
    respondToAssessment,
    getAssessmentResult,
    listAssessmentHistory,
    finishAssessmentGate,
  };
}
