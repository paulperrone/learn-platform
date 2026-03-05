import { eq, and, lte, sql } from "drizzle-orm";
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade, Rating, State } from "ts-fsrs";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";

const params = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

type UserTopicRow = typeof schema.userTopicState.$inferSelect;

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
      hintsUsed?: number
    ) {
      const state = await this.getOrCreateState(userId, topicId);
      const card = cardFromRow(state);
      const now = new Date();

      const scheduling = f.repeat(card, now);
      const result = scheduling[rating];
      const newCard = result.card;

      // Check mastery: graduated if 5+ consecutive correct reviews with stability > 30 days
      const shouldMaster =
        rating >= Rating.Good &&
        newCard.reps >= 5 &&
        newCard.stability >= 30 &&
        newCard.lapses === 0;

      // Update confidence tracking (exponential moving average)
      let newConfidenceAccuracy = state.confidenceAccuracy;
      if (confidence != null) {
        const isCorrect = rating >= Rating.Good;
        const confidenceNorm = confidence / 5; // normalize 1-5 to 0.2-1.0
        const calibrationError = Math.abs(confidenceNorm - (isCorrect ? 1 : 0));
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
        rating,
        confidence: confidence ?? null,
        correct: rating >= Rating.Good,
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
     * Apply FIRe (Fractional Implicit Repetition) credit.
     * When a user practices a parent topic, encompassed child topics
     * get fractional credit toward their next review.
     */
    async applyFIReCredit(userId: string, topicId: string, rating: Grade) {
      const encompassed = await graph.getEncompassedTopics(topicId);
      if (encompassed.length === 0) return [];

      const credits: { topicId: string; weight: number }[] = [];

      for (const enc of encompassed) {
        const childState = await this.getOrCreateState(userId, enc.childTopicId);
        if (childState.mastered) continue;
        if (childState.reps === 0) continue; // Don't credit topics not yet learned

        const card = cardFromRow(childState);

        // Apply fractional credit: adjust the due date closer to now
        // Weight determines how much credit (0.0 = none, 1.0 = full review)
        if (rating >= Rating.Good) {
          const now = new Date();
          const dueDate = new Date(childState.due);
          const remainingMs = dueDate.getTime() - now.getTime();

          if (remainingMs > 0) {
            const creditMs = remainingMs * enc.weight;
            const newDue = new Date(dueDate.getTime() - creditMs);

            await db
              .update(schema.userTopicState)
              .set({ due: newDue.toISOString() })
              .where(eq(schema.userTopicState.id, childState.id));

            credits.push({ topicId: enc.childTopicId, weight: enc.weight });
          }
        }
      }

      return credits;
    },

    /**
     * Build the session mix: ~60% review + ~40% new topics, interleaved.
     */
    async getSessionMix(userId: string, count: number = 10) {
      const dueTopics = await this.getDueTopics(userId);
      const frontier = await graph.computeFrontier(userId);

      const reviewCount = Math.ceil(count * 0.6);
      const newCount = count - reviewCount;

      // Select review topics (most overdue first)
      const reviewTopics = dueTopics.slice(0, reviewCount).map((t) => ({
        topicId: t.topicId,
        due: t.due,
        type: "review" as const,
      }));

      // Select new topics (lowest depth first for progression)
      const newTopics = frontier.topics
        .sort((a, b) => a.depth - b.depth)
        .slice(0, newCount)
        .map((t) => ({
          topicId: t.id,
          depth: t.depth,
          type: "new" as const,
        }));

      // Interleave: review, new, review, review, new pattern
      const mixed: typeof reviewTopics | typeof newTopics = [];
      let ri = 0;
      let ni = 0;
      let reviewStreak = 0;

      while (ri < reviewTopics.length || ni < newTopics.length) {
        if (ri < reviewTopics.length && (reviewStreak < 2 || ni >= newTopics.length)) {
          mixed.push(reviewTopics[ri++] as any);
          reviewStreak++;
        } else if (ni < newTopics.length) {
          mixed.push(newTopics[ni++] as any);
          reviewStreak = 0;
        }
      }

      return {
        items: mixed,
        reviewCount: reviewTopics.length,
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
