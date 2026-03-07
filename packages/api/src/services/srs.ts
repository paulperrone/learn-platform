import { eq, and, lte, sql, inArray, count as drizzleCount } from "drizzle-orm";
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade, type FSRSParameters, Rating, State } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";

const defaultParams = generatorParameters({ enable_fuzz: true });
const defaultFsrs = fsrs(defaultParams);

const MIN_REVIEWS_FOR_OPTIMIZATION = 50;
const OPTIMIZATION_STALENESS_DAYS = 7;

type UserTopicRow = typeof schema.userTopicState.$inferSelect;

export type MixItem = {
  topicId: string;
  type: "review" | "new";
  blendRole: "warmup" | "main" | "stretch";
  due?: string;
  depth?: number;
};

function cardFromRow(row: UserTopicRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview ? new Date(row.lastReview) : undefined,
  };
}

/** Compute FSRS retrievability (probability of recall) for a topic state. */
function computeRetrievability(row: UserTopicRow): number {
  if (row.reps === 0 || row.stability <= 0) return 0;
  const now = Date.now();
  const due = new Date(row.due).getTime();
  const lastReview = row.lastReview ? new Date(row.lastReview).getTime() : now;
  const elapsedDays = (now - lastReview) / (1000 * 60 * 60 * 24);
  // FSRS power-law forgetting: R = (1 + t/9s)^-1
  return Math.pow(1 + elapsedDays / (9 * row.stability), -1);
}

/**
 * Reorder items so no two consecutive items share the same strand.
 * Uses greedy selection: pick the highest-priority item that doesn't
 * conflict with the previous item's strand. Falls back to same-strand
 * placement when unavoidable.
 */
export function interleaveByStrand(
  items: MixItem[],
  strandMap: Map<string, string>
): MixItem[] {
  if (items.length <= 1) return items;

  const remaining = [...items];
  const result: MixItem[] = [];

  while (remaining.length > 0) {
    const lastStrand = result.length > 0
      ? strandMap.get(result[result.length - 1].topicId)
      : null;

    // Find first item from a different strand
    const idx = remaining.findIndex(
      (item) => strandMap.get(item.topicId) !== lastStrand
    );

    if (idx >= 0) {
      result.push(remaining.splice(idx, 1)[0]);
    } else {
      // All remaining items share the same strand — take the first one
      result.push(remaining.shift()!);
    }
  }

  return result;
}

export function createSRSService(db: DB) {
  const graph = createGraphService(db);

  async function getUserFsrs(userId: string) {
    const row = await db.query.userFsrsParams.findFirst({
      where: eq(schema.userFsrsParams.userId, userId),
    });
    if (!row) return defaultFsrs;

    const overrides: Partial<FSRSParameters> = {
      enable_fuzz: true,
      request_retention: row.requestRetention,
    };
    if (row.wJson) {
      try {
        overrides.w = JSON.parse(row.wJson);
      } catch { /* use defaults */ }
    }
    return fsrs(generatorParameters(overrides));
  }

  return {
    /**
     * Get or create user topic state.
     */
    async getOrCreateState(userId: string, topicId: string): Promise<UserTopicRow> {
      const [existing] = await db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.topicId, topicId)
          )
        );

      if (existing) return existing;

      const emptyCard = createEmptyCard();
      const [inserted] = await db
        .insert(schema.userTopicState)
        .values({
          userId,
          topicId,
          stability: emptyCard.stability,
          difficulty: emptyCard.difficulty,
          due: emptyCard.due.toISOString(),
          state: emptyCard.state,
          reps: 0,
          lapses: 0,
          mastered: false,
          frontier: false,
          consecutiveCorrectReviews: 0,
        })
        .returning();

      return inserted;
    },

    /**
     * Process a review and update FSRS state.
     */
    async scheduleReview(
      userId: string,
      topicId: string,
      rating: Grade,
      responseMs: number,
      phase: string,
      confidence?: number,
      hintsUsed?: number,
      assessmentContentId?: string
    ) {
      const state = await this.getOrCreateState(userId, topicId);
      const card = cardFromRow(state);
      const now = new Date();

      const userFsrs = await getUserFsrs(userId);
      const scheduling = userFsrs.repeat(card, now);
      const result = scheduling[rating];
      const newCard = result.card;

      // Track consecutive correct reviews at Review state (state=2)
      const isCorrectReview = rating >= Rating.Good;
      let newConsecutiveCorrect = state.consecutiveCorrectReviews;
      if (isCorrectReview && newCard.state === State.Review) {
        newConsecutiveCorrect = state.consecutiveCorrectReviews + 1;
      } else if (!isCorrectReview) {
        newConsecutiveCorrect = 0; // Lapse resets counter
      }

      // Confidence-based scheduling adjustments
      // High confidence (4-5) + wrong = critical misconception
      // Low confidence (1-2) + correct = fragile knowledge, schedule sooner
      let isMisconception = false;
      if (confidence != null && !isCorrectReview && confidence >= 4) {
        isMisconception = true;
      }

      // Re-schedule with adjusted rating if confidence changes the picture
      let adjustedRating = rating;
      let adjustedCard = newCard;
      let adjustedLog = result.log;
      if (confidence != null && isCorrectReview && confidence <= 2) {
        // Fragile knowledge: cap at Good (no Easy), ensures shorter interval
        adjustedRating = Math.min(rating, Rating.Good) as Grade;
        if (adjustedRating !== rating) {
          const reResult = scheduling[adjustedRating];
          adjustedCard = reResult.card;
          adjustedLog = reResult.log;
        }
      }

      // Mastery: 3+ consecutive correct reviews at Review state with stability > 14 days
      const shouldMaster =
        newConsecutiveCorrect >= 3 &&
        adjustedCard.state === State.Review &&
        adjustedCard.stability >= 14;

      // Update confidence tracking (exponential moving average)
      let newConfidenceAccuracy = state.confidenceAccuracy;
      if (confidence != null) {
        const confidenceNorm = confidence / 5; // normalize 1-5 to 0.2-1.0
        const calibrationError = Math.abs(confidenceNorm - (isCorrectReview ? 1 : 0));
        const alpha = 0.3;
        newConfidenceAccuracy =
          state.confidenceAccuracy != null
            ? state.confidenceAccuracy * (1 - alpha) + (1 - calibrationError) * alpha
            : 1 - calibrationError;
      }

      // Misconceptions reset consecutive correct and prevent mastery
      if (isMisconception) {
        newConsecutiveCorrect = 0;
      }

      const shouldMasterFinal = !isMisconception && (shouldMaster || state.mastered);

      await db
        .update(schema.userTopicState)
        .set({
          stability: adjustedCard.stability,
          difficulty: adjustedCard.difficulty,
          due: adjustedCard.due.toISOString(),
          state: adjustedCard.state,
          reps: adjustedCard.reps,
          lapses: adjustedCard.lapses,
          mastered: shouldMasterFinal,
          consecutiveCorrectReviews: newConsecutiveCorrect,
          lastReview: now.toISOString(),
          confidenceAccuracy: newConfidenceAccuracy,
        })
        .where(eq(schema.userTopicState.id, state.id));

      // Log the review
      const reviewId = crypto.randomUUID();
      await db.insert(schema.reviewLog).values({
        id: reviewId,
        userId,
        topicId,
        assessmentContentId: assessmentContentId ?? null,
        rating: adjustedRating,
        confidence: confidence ?? null,
        correct: isCorrectReview,
        responseMs,
        phase,
        hintsUsed: hintsUsed ?? null,
        misconception: isMisconception,
      });

      return {
        card: adjustedCard,
        mastered: shouldMasterFinal,
        justMastered: shouldMasterFinal && !state.mastered,
        misconception: isMisconception,
        log: adjustedLog,
      };
    },

    /**
     * Get topics due for review.
     */
    async getDueTopics(userId: string) {
      const now = new Date().toISOString();
      return db
        .select()
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            lte(schema.userTopicState.due, now),
            eq(schema.userTopicState.mastered, false)
          )
        )
        .orderBy(schema.userTopicState.due);
    },

    /**
     * Apply FIRe (Fractional Implicit Repetition) credit with multi-hop traversal.
     * When a user practices a parent topic, encompassed child topics
     * get fractional credit toward their next review. Credit flows
     * through 2-3 hops with diminishing weight.
     *
     * Early repetition discount: credit is scaled by (1 - retrievability)
     * so that fresh topics get less credit.
     */
    async applyFIReCredit(userId: string, topicId: string, rating: Grade) {
      if (rating < Rating.Good) return [];

      // Multi-hop BFS: collect all reachable children with cumulative weights
      const visited = new Map<string, number>(); // topicId → cumulative weight
      const queue: { topicId: string; cumulativeWeight: number; depth: number }[] = [];
      const maxHops = 3;

      const directChildren = await graph.getEncompassedTopics(topicId);
      for (const enc of directChildren) {
        queue.push({ topicId: enc.childTopicId, cumulativeWeight: enc.weight, depth: 1 });
      }

      while (queue.length > 0) {
        const { topicId: childId, cumulativeWeight, depth } = queue.shift()!;

        // Keep the highest weight path to each child
        const existing = visited.get(childId);
        if (existing != null && existing >= cumulativeWeight) continue;
        visited.set(childId, cumulativeWeight);

        // Continue BFS if within hop limit
        if (depth < maxHops) {
          const grandchildren = await graph.getEncompassedTopics(childId);
          for (const gc of grandchildren) {
            const newWeight = cumulativeWeight * gc.weight;
            if (newWeight > 0.05) { // Skip negligible credit
              queue.push({ topicId: gc.childTopicId, cumulativeWeight: newWeight, depth: depth + 1 });
            }
          }
        }
      }

      if (visited.size === 0) return [];

      const credits: { topicId: string; weight: number }[] = [];
      const now = new Date();

      for (const [childTopicId, weight] of visited) {
        const childState = await this.getOrCreateState(userId, childTopicId);
        if (childState.mastered) continue;
        if (childState.reps === 0) continue;

        const dueDate = new Date(childState.due);
        const remainingMs = dueDate.getTime() - now.getTime();
        if (remainingMs <= 0) continue;

        // Early repetition discount: scale credit by (1 - retrievability)
        const retrievability = computeRetrievability(childState);
        const discountedWeight = weight * (1 - retrievability);
        if (discountedWeight < 0.01) continue;

        const creditMs = remainingMs * discountedWeight;
        const newDue = new Date(dueDate.getTime() - creditMs);

        await db
          .update(schema.userTopicState)
          .set({ due: newDue.toISOString() })
          .where(eq(schema.userTopicState.id, childState.id));

        credits.push({ topicId: childTopicId, weight: discountedWeight });
      }

      return credits;
    },

    /**
     * Apply upward penalty: when a child topic fails, penalize parent
     * topics that encompass it. Failure on a simpler skill should
     * reduce stability on more advanced skills that depend on it.
     */
    async applyUpwardPenalty(userId: string, topicId: string, rating: Grade) {
      if (rating >= Rating.Good) return [];

      const parents = await graph.getEncompassingTopics(topicId);
      if (parents.length === 0) return [];

      const penaltyFactor = 0.5; // Penalties are less aggressive than credit
      const penalties: { topicId: string; weight: number }[] = [];
      const now = new Date();

      for (const enc of parents) {
        const parentState = await this.getOrCreateState(userId, enc.parentTopicId);
        if (parentState.reps === 0) continue;
        if (parentState.mastered) continue;

        // Move parent's due date closer to now (make it due sooner)
        const dueDate = new Date(parentState.due);
        const remainingMs = dueDate.getTime() - now.getTime();
        if (remainingMs <= 0) continue; // Already due

        const penaltyWeight = enc.weight * penaltyFactor;
        const penaltyMs = remainingMs * penaltyWeight;
        const newDue = new Date(dueDate.getTime() - penaltyMs);

        await db
          .update(schema.userTopicState)
          .set({ due: newDue.toISOString() })
          .where(eq(schema.userTopicState.id, parentState.id));

        penalties.push({ topicId: enc.parentTopicId, weight: penaltyWeight });
      }

      return penalties;
    },

    /**
     * Compute FIRe coverage for review compression.
     * For each candidate topic, find which other due topics it would
     * implicitly refresh via encompassing edges (multi-hop BFS).
     * Returns a map of topicId → set of covered due topic IDs.
     */
    async computeFIReCoverage(dueTopicIds: Set<string>): Promise<Map<string, Set<string>>> {
      const coverageMap = new Map<string, Set<string>>();
      const maxHops = 3;

      for (const topicId of dueTopicIds) {
        const reachable = new Set<string>();
        const visited = new Set<string>();
        const queue: { topicId: string; depth: number; weight: number }[] = [];

        const children = await graph.getEncompassedTopics(topicId);
        for (const c of children) {
          if (c.weight > 0.05) {
            queue.push({ topicId: c.childTopicId, depth: 1, weight: c.weight });
          }
        }

        while (queue.length > 0) {
          const { topicId: childId, depth, weight } = queue.shift()!;
          if (visited.has(childId)) continue;
          visited.add(childId);

          if (dueTopicIds.has(childId) && childId !== topicId) {
            reachable.add(childId);
          }

          if (depth < maxHops) {
            const grandchildren = await graph.getEncompassedTopics(childId);
            for (const gc of grandchildren) {
              const newWeight = weight * gc.weight;
              if (newWeight > 0.05 && !visited.has(gc.childTopicId)) {
                queue.push({ topicId: gc.childTopicId, depth: depth + 1, weight: newWeight });
              }
            }
          }
        }

        if (reachable.size > 0) {
          coverageMap.set(topicId, reachable);
        }
      }

      return coverageMap;
    },

    /**
     * Select reviews using greedy set-cover compression.
     * Picks topics that maximize implicit FIRe coverage of other due topics,
     * reducing the total number of explicit reviews needed.
     * Falls back to most-overdue ordering when encompassing density is too low.
     */
    async compressReviews(
      dueTopics: UserTopicRow[],
      budget: number,
      excludeIds: Set<string>
    ): Promise<{ selected: UserTopicRow[]; coveredCount: number }> {
      const candidates = dueTopics.filter((t) => !excludeIds.has(t.topicId));
      if (candidates.length === 0 || budget <= 0) {
        return { selected: [], coveredCount: 0 };
      }

      const dueSet = new Set(candidates.map((t) => t.topicId));
      const coverageMap = await this.computeFIReCoverage(dueSet);

      // Check if compression is meaningful (any topic covers at least one other)
      const totalCoverage = [...coverageMap.values()].reduce((sum, s) => sum + s.size, 0);
      if (totalCoverage === 0) {
        // No encompassing density — fall back to most-overdue
        return { selected: candidates.slice(0, budget), coveredCount: 0 };
      }

      // Greedy set cover
      const selected: UserTopicRow[] = [];
      const covered = new Set<string>();
      const remaining = new Set(dueSet);

      while (selected.length < budget && remaining.size > 0) {
        let bestTopic: UserTopicRow | null = null;
        let bestScore = -1;
        let bestOverdue = -Infinity;

        for (const topic of candidates) {
          if (!remaining.has(topic.topicId)) continue;

          const coverage = coverageMap.get(topic.topicId);
          const uncoveredCount = coverage
            ? [...coverage].filter((id) => remaining.has(id) && !covered.has(id)).length
            : 0;
          const score = uncoveredCount + 1; // +1 for the topic itself

          const overdueMs = Date.now() - new Date(topic.due).getTime();

          if (score > bestScore || (score === bestScore && overdueMs > bestOverdue)) {
            bestTopic = topic;
            bestScore = score;
            bestOverdue = overdueMs;
          }
        }

        if (!bestTopic) break;
        selected.push(bestTopic);
        remaining.delete(bestTopic.topicId);
        covered.add(bestTopic.topicId);

        const coverage = coverageMap.get(bestTopic.topicId);
        if (coverage) {
          for (const id of coverage) {
            covered.add(id);
          }
        }
      }

      return { selected, coveredCount: covered.size };
    },

    /**
     * Build the session mix: warmup → main (review+new interleaved) → stretch.
     *
     * - Warmup: mastered topics for survey-depth recall (builds confidence, activates prior knowledge)
     * - Main: ~60% review + ~40% new frontier topics (existing interleave logic)
     * - Stretch: context-layered frontier topics at next depth (productive failure / priming)
     *
     * Reviews use FIRe compression: selects reviews that maximize implicit
     * repetition of other due topics through encompassing edges.
     */
    async getSessionMix(userId: string, count: number = 10) {
      const dueTopics = await this.getDueTopics(userId);
      const frontier = await graph.computeFrontier(userId);

      // --- Warmup: mastered topics for quick recall ---
      const masteredRows = await db
        .select({ topicId: schema.userTopicState.topicId })
        .from(schema.userTopicState)
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.mastered, true)
          )
        );
      const warmupPool = masteredRows.sort(() => Math.random() - 0.5);
      // Scale warmup slots: leave at least 4 slots for main
      const maxWarmup = Math.max(0, count - 4);
      const warmupCount = Math.min(warmupPool.length, 3, maxWarmup);
      const warmupItems: MixItem[] = warmupPool.slice(0, warmupCount).map((t) => ({
        topicId: t.topicId,
        type: "review" as const,
        blendRole: "warmup" as const,
      }));
      const warmupTopicIds = new Set(warmupItems.map((w) => w.topicId));

      // --- Stretch: context-layered disciplines only ---
      let stretchItems: MixItem[] = [];
      const subjectIds = [...new Set(frontier.topics.map((t) => t.subjectId))];
      if (subjectIds.length > 0) {
        const subjects = await db
          .select()
          .from(schema.subjects)
          .where(inArray(schema.subjects.id, subjectIds));
        const discIds = [...new Set(subjects.map((s) => s.disciplineId))];
        if (discIds.length > 0) {
          const discs = await db
            .select()
            .from(schema.disciplines)
            .where(inArray(schema.disciplines.id, discIds));
          const contextLayeredDiscIds = new Set(
            discs.filter((d) => d.progressionModel === "context-layered").map((d) => d.id)
          );
          const contextLayeredSubjectIds = new Set(
            subjects.filter((s) => contextLayeredDiscIds.has(s.disciplineId)).map((s) => s.id)
          );

          if (contextLayeredSubjectIds.size > 0) {
            const stretchCandidates = frontier.topics.filter((t) =>
              contextLayeredSubjectIds.has(t.subjectId)
            );
            // Leave at least 3 slots for main after warmup + stretch
            const maxStretch = Math.max(0, count - warmupCount - 3);
            const stretchCount = Math.min(stretchCandidates.length, 2, maxStretch);
            stretchItems = stretchCandidates.slice(0, stretchCount).map((t) => ({
              topicId: t.id,
              type: "review" as const, // single question, no full learning loop
              blendRole: "stretch" as const,
            }));
          }
        }
      }
      const stretchTopicIds = new Set(stretchItems.map((s) => s.topicId));

      // --- Main: review + new interleaved ---
      const mainSlots = count - warmupCount - stretchItems.length;
      const mainReviewCount = Math.ceil(mainSlots * 0.6);
      const mainNewCount = mainSlots - mainReviewCount;

      // Use FIRe compression to select reviews that maximize implicit coverage
      const { selected: compressedReviews, coveredCount } = await this.compressReviews(
        dueTopics,
        mainReviewCount,
        warmupTopicIds
      );

      const reviewTopics: MixItem[] = compressedReviews.map((t) => ({
        topicId: t.topicId,
        due: t.due,
        type: "review" as const,
        blendRole: "main" as const,
      }));

      const newTopics: MixItem[] = frontier.topics
        .filter((t) => !stretchTopicIds.has(t.id))
        .sort((a, b) => a.depth - b.depth)
        .slice(0, mainNewCount)
        .map((t) => ({
          topicId: t.id,
          depth: t.depth,
          type: "new" as const,
          blendRole: "main" as const,
        }));

      // Interleave main items: review, new, review, review, new pattern
      const rawMainItems: MixItem[] = [];
      let ri = 0;
      let ni = 0;
      let reviewStreak = 0;

      while (ri < reviewTopics.length || ni < newTopics.length) {
        if (ri < reviewTopics.length && (reviewStreak < 2 || ni >= newTopics.length)) {
          rawMainItems.push(reviewTopics[ri++]);
          reviewStreak++;
        } else if (ni < newTopics.length) {
          rawMainItems.push(newTopics[ni++]);
          reviewStreak = 0;
        }
      }

      // Non-interference interleaving: avoid consecutive items from same strand
      const allMainTopicIds = rawMainItems.map((item) => item.topicId);
      const strandMap = await graph.getTopicStrands(allMainTopicIds);
      const mainItems = interleaveByStrand(rawMainItems, strandMap);

      // Order: warmup → main → stretch
      const items: MixItem[] = [...warmupItems, ...mainItems, ...stretchItems];

      // Compression stats: explicit reviews vs total due topics covered
      const explicitReviews = reviewTopics.length;
      const totalDueCovered = coveredCount;
      const compressionRatio = explicitReviews > 0 && totalDueCovered > 0
        ? totalDueCovered / explicitReviews
        : 1;

      return {
        items,
        reviewCount: reviewTopics.length + warmupItems.length,
        newCount: newTopics.length,
        compressionStats: {
          explicitReviews,
          totalDueCovered,
          ratio: Math.round(compressionRatio * 100) / 100,
        },
      };
    },

    /**
     * Graduate a topic to permanent mastery.
     */
    async graduateTopic(userId: string, topicId: string) {
      await db
        .update(schema.userTopicState)
        .set({ mastered: true })
        .where(
          and(
            eq(schema.userTopicState.userId, userId),
            eq(schema.userTopicState.topicId, topicId)
          )
        );
    },

    /**
     * Get summary stats for a user.
     */
    async getUserStats(userId: string) {
      const allStates = await db
        .select()
        .from(schema.userTopicState)
        .where(eq(schema.userTopicState.userId, userId));

      const mastered = allStates.filter((s) => s.mastered).length;
      const inProgress = allStates.filter((s) => !s.mastered && s.reps > 0).length;
      const dueNow = allStates.filter(
        (s) => !s.mastered && new Date(s.due) <= new Date()
      ).length;

      const allTopics = await db.select({ id: schema.topics.id }).from(schema.topics);

      return {
        mastered,
        inProgress,
        dueForReview: dueNow,
        total: allTopics.length,
      };
    },

    /**
     * Compute and store per-user FSRS parameters based on review history.
     * Uses observed retention rate to adjust request_retention.
     * Returns null if insufficient data (< 50 reviews).
     */
    async optimizeUserParams(userId: string): Promise<{ requestRetention: number; reviewCount: number } | null> {
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(schema.reviewLog)
        .where(eq(schema.reviewLog.userId, userId));

      if (total < MIN_REVIEWS_FOR_OPTIMIZATION) return null;

      // Check staleness: skip if recently computed
      const existing = await db.query.userFsrsParams.findFirst({
        where: eq(schema.userFsrsParams.userId, userId),
      });
      if (existing?.computedAt) {
        const daysSince = (Date.now() - new Date(existing.computedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < OPTIMIZATION_STALENESS_DAYS && existing.reviewCount === total) return null;
      }

      // Compute observed retention from review-state reviews (state=2 / Review)
      // Only count reviews at Review state for meaningful retention signal
      const [{ reviewStateTotal }] = await db
        .select({ reviewStateTotal: sql<number>`count(*)` })
        .from(schema.reviewLog)
        .where(
          and(
            eq(schema.reviewLog.userId, userId),
            eq(schema.reviewLog.phase, "review"),
          )
        );

      const [{ reviewStateCorrect }] = await db
        .select({ reviewStateCorrect: sql<number>`count(*)` })
        .from(schema.reviewLog)
        .where(
          and(
            eq(schema.reviewLog.userId, userId),
            eq(schema.reviewLog.phase, "review"),
            eq(schema.reviewLog.correct, true),
          )
        );

      // Fall back to overall stats if not enough review-phase data
      let observedRetention: number;
      if (reviewStateTotal >= 20) {
        observedRetention = reviewStateCorrect / reviewStateTotal;
      } else {
        const [{ allCorrect }] = await db
          .select({ allCorrect: sql<number>`count(*)` })
          .from(schema.reviewLog)
          .where(
            and(
              eq(schema.reviewLog.userId, userId),
              eq(schema.reviewLog.correct, true),
            )
          );
        observedRetention = allCorrect / total;
      }

      // Adjust request_retention toward observed retention (clamped 0.7-0.97)
      // If user retains well (>0.9), target slightly higher; if struggling, lower the bar
      const targetRetention = Math.min(0.97, Math.max(0.7, observedRetention));
      const now = new Date().toISOString();

      if (existing) {
        await db
          .update(schema.userFsrsParams)
          .set({
            requestRetention: targetRetention,
            reviewCount: total,
            computedAt: now,
            updatedAt: now,
          })
          .where(eq(schema.userFsrsParams.userId, userId));
      } else {
        await db
          .insert(schema.userFsrsParams)
          .values({
            userId,
            requestRetention: targetRetention,
            reviewCount: total,
            computedAt: now,
            createdAt: now,
            updatedAt: now,
          });
      }

      return { requestRetention: targetRetention, reviewCount: total };
    },

    /**
     * Get the user's current FSRS parameters (or defaults).
     */
    async getUserFsrsParams(userId: string) {
      const row = await db.query.userFsrsParams.findFirst({
        where: eq(schema.userFsrsParams.userId, userId),
      });
      return row
        ? { requestRetention: row.requestRetention, reviewCount: row.reviewCount, computedAt: row.computedAt }
        : { requestRetention: 0.9, reviewCount: 0, computedAt: null };
    },
  };
}
