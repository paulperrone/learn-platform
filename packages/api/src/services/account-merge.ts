import { eq, and, sql } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";

type TopicEstimates = Record<string, number>;

export function createAccountMergeService(db: DB) {
  /**
   * Materialize userTopicState rows from a completed diagnostic session's estimates.
   * This fills the gap where anonymous diagnostics skip materializeMastery().
   */
  async function materializeFromDiagnostic(
    userId: string,
    topicEstimates: TopicEstimates,
    estimatedFrontier: string[]
  ): Promise<number> {
    const frontierSet = new Set(estimatedFrontier);
    const now = new Date().toISOString();
    let created = 0;

    for (const [topicId, prob] of Object.entries(topicEstimates)) {
      const isMastered = prob >= 0.6;
      const isFrontier = frontierSet.has(topicId);

      if (!isMastered && !isFrontier) continue;

      // Skip if user already has state for this topic (from a previous diagnostic or learning)
      const existing = await db.query.userTopicState.findFirst({
        where: and(
          eq(schema.userTopicState.userId, userId),
          eq(schema.userTopicState.topicId, topicId)
        ),
      });
      if (existing) continue;

      await db.insert(schema.userTopicState).values({
        userId,
        topicId,
        mastered: isMastered,
        frontier: isFrontier,
        state: isMastered ? 2 : 0, // Review if mastered, New if frontier
        reps: isMastered ? 1 : 0,
        due: now,
        lastReview: isMastered ? now : null,
      });
      created++;
    }

    return created;
  }

  return {
    /**
     * Merge anonymous data into a real user account.
     * Transfers: learn sessions, diagnostic sessions, assignment responses.
     * Then materializes topic state from completed diagnostics.
     */
    async mergeAnonymousData(userId: string, anonymousToken: string): Promise<{
      mergedSessions: number;
      mergedDiagnostics: number;
      mergedResponses: number;
      mergedTopicStates: number;
    }> {
      // Count before transferring
      const [sessionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.learnSessions)
        .where(eq(schema.learnSessions.anonymousToken, anonymousToken));

      const [diagCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.diagnosticSessions)
        .where(eq(schema.diagnosticSessions.anonymousToken, anonymousToken));

      const [respCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.assignmentResponses)
        .where(eq(schema.assignmentResponses.anonymousToken, anonymousToken));

      // Collect completed diagnostic data BEFORE transferring (need anonymousToken to find them)
      const completedDiagnostics = await db
        .select({
          topicEstimatesJson: schema.diagnosticSessions.topicEstimatesJson,
          estimatedFrontierJson: schema.diagnosticSessions.estimatedFrontierJson,
        })
        .from(schema.diagnosticSessions)
        .where(and(
          eq(schema.diagnosticSessions.anonymousToken, anonymousToken),
          eq(schema.diagnosticSessions.status, "completed")
        ));

      // Transfer learn sessions
      await db
        .update(schema.learnSessions)
        .set({ userId, anonymousToken: null })
        .where(eq(schema.learnSessions.anonymousToken, anonymousToken));

      // Transfer diagnostic sessions
      await db
        .update(schema.diagnosticSessions)
        .set({ userId, anonymousToken: null })
        .where(eq(schema.diagnosticSessions.anonymousToken, anonymousToken));

      // Transfer assignment responses
      await db
        .update(schema.assignmentResponses)
        .set({ userId, anonymousToken: null })
        .where(eq(schema.assignmentResponses.anonymousToken, anonymousToken));

      // Materialize topic state from completed diagnostics
      let mergedTopicStates = 0;
      for (const diag of completedDiagnostics) {
        if (!diag.topicEstimatesJson || !diag.estimatedFrontierJson) continue;

        const estimates: TopicEstimates = JSON.parse(diag.topicEstimatesJson);
        const frontier: string[] = JSON.parse(diag.estimatedFrontierJson);
        mergedTopicStates += await materializeFromDiagnostic(userId, estimates, frontier);
      }

      return {
        mergedSessions: sessionCount?.count ?? 0,
        mergedDiagnostics: diagCount?.count ?? 0,
        mergedResponses: respCount?.count ?? 0,
        mergedTopicStates,
      };
    },
  };
}
