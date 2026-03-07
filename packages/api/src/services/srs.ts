import { eq, and, lte, sql, inArray } from "drizzle-orm";
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade, Rating, State } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";

const params = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

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

      const scheduling = f.repeat(card, now);
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

      // Mastery: 3+ consecutive correct reviews at Review state with stability > 14 days
      const shouldMaster =
        newConsecutiveCorrect >= 3 &&
        newCard.state === State.Review &&
        newCard.stability >= 14;

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

      await db
        .update(schema.userTopicState)
        .set({
          stability: newCard.stability,
          difficulty: newCard.difficulty,
          due: newCard.due.toISOString(),
          state: newCard.state,
          reps: newCard.reps,
          lapses: newCard.lapses,
          mastered: shouldMaster || state.mastered,
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
        rating,
        confidence: confidence ?? null,
        correct: isCorrectReview,
        responseMs,
        phase,
        hintsUsed: hintsUsed ?? null,
      });

      return {
        card: newCard,
        mastered: shouldMaster || state.mastered,
        log: result.log,
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
     * Build the session mix: warmup → main (review+new interleaved) → stretch.
     *
     * - Warmup: mastered topics for survey-depth recall (builds confidence, activates prior knowledge)
     * - Main: ~60% review + ~40% new frontier topics (existing interleave logic)
     * - Stretch: context-layered frontier topics at next depth (productive failure / priming)
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

      const reviewTopics: MixItem[] = dueTopics
        .filter((t) => !warmupTopicIds.has(t.topicId))
        .slice(0, mainReviewCount)
        .map((t) => ({
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

      return {
        items,
        reviewCount: reviewTopics.length + warmupItems.length,
        newCount: newTopics.length,
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
  };
}
