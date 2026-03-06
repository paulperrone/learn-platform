import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";

export function createAccountMergeService(db: DB) {
  return {
    /**
     * Merge anonymous data into a real user account.
     * Transfers: learn sessions, diagnostic sessions, assignment responses.
     */
    async mergeAnonymousData(userId: string, anonymousToken: string): Promise<{
      mergedSessions: number;
      mergedDiagnostics: number;
      mergedResponses: number;
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

      return {
        mergedSessions: sessionCount?.count ?? 0,
        mergedDiagnostics: diagCount?.count ?? 0,
        mergedResponses: respCount?.count ?? 0,
      };
    },
  };
}
