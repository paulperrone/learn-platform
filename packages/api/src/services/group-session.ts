import { eq, and, isNull, inArray } from "drizzle-orm";
import type { DB } from "../db/index.js";
import * as schema from "../db/schema.js";
import { createGraphService } from "./graph.js";
import { createSRSService } from "./srs.js";
import type { Problem, SessionPhase } from "@learn/shared";

export function createGroupSessionService(db: DB) {
  const graph = createGraphService(db);
  const srs = createSRSService(db);

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
      hints: JSON.parse(r.hintsJson) as string[],
      solution: r.solution,
      type: r.type as Problem["type"],
      typeProperties: r.typeProperties ? JSON.parse(r.typeProperties) : undefined,
    }));
  }

  function generateJoinCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  return {
    /**
     * Create a group session.
     * Family: auto-adds linked children as participants.
     * Classroom: generates join code for students.
     * Peer-pair: requires exactly 2 student IDs.
     */
    async createSession(
      facilitatorId: string,
      type: "family" | "classroom" | "peer-pair",
      options: { topicId?: string; studentIds?: string[] } = {}
    ) {
      const sessionId = crypto.randomUUID();
      const joinCode = type === "classroom" ? generateJoinCode() : null;

      await db.insert(schema.groupSessions).values({
        id: sessionId,
        facilitatorId,
        type,
        topicId: options.topicId ?? null,
        joinCode,
        status: "active",
      });

      // Add facilitator as participant
      await db.insert(schema.groupSessionParticipants).values({
        id: crypto.randomUUID(),
        groupSessionId: sessionId,
        userId: facilitatorId,
        role: "facilitator",
      });

      // Auto-add students based on type
      if (type === "family") {
        // Get linked children via account_links
        const links = await db
          .select({ toUserId: schema.accountLinks.toUserId })
          .from(schema.accountLinks)
          .where(
            and(
              eq(schema.accountLinks.fromUserId, facilitatorId),
              eq(schema.accountLinks.type, "parent"),
              eq(schema.accountLinks.status, "active")
            )
          );
        for (const link of links) {
          await db.insert(schema.groupSessionParticipants).values({
            id: crypto.randomUUID(),
            groupSessionId: sessionId,
            userId: link.toUserId,
            role: "student",
          });
        }
      } else if (type === "peer-pair" && options.studentIds?.length === 2) {
        for (const studentId of options.studentIds) {
          await db.insert(schema.groupSessionParticipants).values({
            id: crypto.randomUUID(),
            groupSessionId: sessionId,
            userId: studentId,
            role: "student",
          });
        }
      }

      return { sessionId, joinCode };
    },

    /**
     * Join a classroom session via code (authenticated or anonymous).
     */
    async joinByCode(
      joinCode: string,
      identity: { userId?: string; anonymousToken?: string; displayName?: string }
    ) {
      const [session] = await db
        .select()
        .from(schema.groupSessions)
        .where(
          and(
            eq(schema.groupSessions.joinCode, joinCode),
            eq(schema.groupSessions.status, "active")
          )
        );
      if (!session) return { error: "Session not found or ended." };

      const participantId = crypto.randomUUID();
      await db.insert(schema.groupSessionParticipants).values({
        id: participantId,
        groupSessionId: session.id,
        userId: identity.userId ?? null,
        anonymousToken: identity.anonymousToken ?? null,
        displayName: identity.displayName ?? null,
        role: "student",
      });

      return { sessionId: session.id, participantId };
    },

    /**
     * Get session dashboard with all participants and progress.
     */
    async getDashboard(sessionId: string) {
      const [session] = await db
        .select()
        .from(schema.groupSessions)
        .where(eq(schema.groupSessions.id, sessionId));
      if (!session) return null;

      const participants = await db
        .select()
        .from(schema.groupSessionParticipants)
        .where(eq(schema.groupSessionParticipants.groupSessionId, sessionId));

      // Resolve topic names for participants
      const topicIds = [...new Set(participants.map((p) => p.currentTopicId).filter(Boolean))] as string[];
      const topicMap = new Map<string, string>();
      if (topicIds.length > 0) {
        const topics = await db
          .select({ id: schema.topics.id, name: schema.topics.name })
          .from(schema.topics)
          .where(inArray(schema.topics.id, topicIds));
        for (const t of topics) topicMap.set(t.id, t.name);
      }

      // Resolve display names from users table
      const userIds = participants.map((p) => p.userId).filter(Boolean) as string[];
      const userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const users = await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds));
        for (const u of users) userMap.set(u.id, u.name);
      }

      const enrichedParticipants = participants.map((p) => ({
        ...p,
        topicName: p.currentTopicId ? topicMap.get(p.currentTopicId) : undefined,
        displayName: p.displayName ?? (p.userId ? userMap.get(p.userId) : null) ?? "Anonymous",
      }));

      return { session, participants: enrichedParticipants };
    },

    /**
     * Suggest topics near the frontier intersection for a group of students.
     * For family co-learning: find topics accessible to all children.
     */
    async suggestTopics(studentUserIds: string[]) {
      if (studentUserIds.length === 0) return [];

      // Get each student's frontier
      const frontiers = await Promise.all(
        studentUserIds.map((uid) => graph.computeFrontier(uid))
      );

      // Find intersection: topics on multiple frontiers
      const topicCounts = new Map<string, number>();
      for (const f of frontiers) {
        for (const t of f.topics) {
          topicCounts.set(t.id, (topicCounts.get(t.id) ?? 0) + 1);
        }
      }

      // Rank: shared by most students first, then shallowest depth
      const allTopics = frontiers.flatMap((f) => f.topics);
      const seen = new Set<string>();
      const unique = allTopics.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      return unique
        .sort((a, b) => {
          const countDiff = (topicCounts.get(b.id) ?? 0) - (topicCounts.get(a.id) ?? 0);
          if (countDiff !== 0) return countDiff;
          return a.depth - b.depth;
        })
        .slice(0, 10)
        .map((t) => ({
          id: t.id,
          name: t.name,
          reason:
            (topicCounts.get(t.id) ?? 0) === studentUserIds.length
              ? "On everyone's frontier"
              : `On ${topicCounts.get(t.id)} of ${studentUserIds.length} students' frontiers`,
        }));
    },

    /**
     * Get a problem for a specific participant at their difficulty level.
     */
    async getParticipantProblem(sessionId: string, participantId: string) {
      const [participant] = await db
        .select()
        .from(schema.groupSessionParticipants)
        .where(eq(schema.groupSessionParticipants.id, participantId));
      if (!participant) return null;

      const [session] = await db
        .select()
        .from(schema.groupSessions)
        .where(eq(schema.groupSessions.id, sessionId));
      if (!session?.topicId) return null;

      const topicId = participant.currentTopicId ?? session.topicId;
      const problems = await getTopicProblems(topicId);
      if (problems.length === 0) return null;

      // Select difficulty based on participant's FSRS state
      let difficulty = "medium";
      if (participant.userId) {
        const state = await srs.getOrCreateState(participant.userId, topicId);
        if (state.reps === 0) difficulty = "easy";
        else if (state.stability > 10) difficulty = "hard";
      }

      const byDifficulty = problems.filter((p) => p.difficulty === difficulty);
      const pool = byDifficulty.length > 0 ? byDifficulty : problems;
      const problem = pool[Math.floor(Math.random() * pool.length)];

      return { problem, topicId, difficulty };
    },

    /**
     * Record a participant's response and update their progress.
     */
    async recordResponse(
      participantId: string,
      correct: boolean,
      topicId: string,
      responseMs: number,
      phase: SessionPhase = "independent"
    ) {
      const [participant] = await db
        .select()
        .from(schema.groupSessionParticipants)
        .where(eq(schema.groupSessionParticipants.id, participantId));
      if (!participant) return null;

      // Update participant counters
      await db
        .update(schema.groupSessionParticipants)
        .set({
          totalCorrect: participant.totalCorrect + (correct ? 1 : 0),
          totalAttempts: participant.totalAttempts + 1,
          currentTopicId: topicId,
          currentPhase: phase,
        })
        .where(eq(schema.groupSessionParticipants.id, participantId));

      // Update FSRS state for authenticated participants
      if (participant.userId) {
        const rating = correct ? 3 : 1; // Good or Again
        await srs.scheduleReview(participant.userId, topicId, rating, responseMs, phase);
        await srs.applyFIReCredit(participant.userId, topicId, rating);
      }

      return {
        totalCorrect: participant.totalCorrect + (correct ? 1 : 0),
        totalAttempts: participant.totalAttempts + 1,
      };
    },

    /**
     * Get peer pair state for turn-taking on multi-step problems.
     */
    async getPeerPairState(sessionId: string) {
      const [session] = await db
        .select()
        .from(schema.groupSessions)
        .where(
          and(
            eq(schema.groupSessions.id, sessionId),
            eq(schema.groupSessions.type, "peer-pair")
          )
        );
      if (!session) return null;

      const participants = await db
        .select()
        .from(schema.groupSessionParticipants)
        .where(
          and(
            eq(schema.groupSessionParticipants.groupSessionId, sessionId),
            eq(schema.groupSessionParticipants.role, "student")
          )
        );

      if (participants.length !== 2) return null;

      // Determine whose turn it is based on total attempts parity
      const totalSteps = participants[0].totalAttempts + participants[1].totalAttempts;
      const currentTurnIndex = totalSteps % 2;

      // Get current problem if topic is set
      let problem: Problem | null = null;
      if (session.topicId) {
        const problems = await getTopicProblems(session.topicId);
        const multiStep = problems.filter((p) => p.type === "multi-step");
        const pool = multiStep.length > 0 ? multiStep : problems;
        if (pool.length > 0) {
          problem = pool[Math.floor(Math.random() * pool.length)];
        }
      }

      return {
        studentA: participants[0].userId ?? participants[0].anonymousToken ?? "",
        studentB: participants[1].userId ?? participants[1].anonymousToken ?? "",
        currentStep: totalSteps,
        currentTurn: participants[currentTurnIndex].userId ?? participants[currentTurnIndex].anonymousToken ?? "",
        problem,
      };
    },

    /**
     * End a group session.
     */
    async endSession(sessionId: string) {
      const now = new Date().toISOString();
      await db
        .update(schema.groupSessions)
        .set({ status: "completed", endedAt: now })
        .where(eq(schema.groupSessions.id, sessionId));

      // Mark all participants as left
      await db
        .update(schema.groupSessionParticipants)
        .set({ leftAt: now })
        .where(
          and(
            eq(schema.groupSessionParticipants.groupSessionId, sessionId),
            isNull(schema.groupSessionParticipants.leftAt)
          )
        );

      return { ended: true };
    },

    /**
     * List active sessions for a facilitator.
     */
    async listSessions(facilitatorId: string) {
      return db
        .select()
        .from(schema.groupSessions)
        .where(eq(schema.groupSessions.facilitatorId, facilitatorId));
    },
  };
}
