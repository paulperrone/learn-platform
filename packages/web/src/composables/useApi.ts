import { authClient } from "./useAuth";
import { useToast } from "./useToast";
import type { SpeechSettings, Subject, Topic, Problem, WorkedExample, DiagnosticResult, TodayProgress, WeeklySummary, DailyGoalConfig, DailyActivityDay, StreakInfo, CompletionEstimate } from "@learn/shared";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {
      // use default message
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function getUserId(): Promise<string> {
  const session = await authClient.getSession();
  if (!session.data?.user?.id) {
    throw new ApiError(401, "Not authenticated");
  }
  return session.data.user.id;
}

/** Wrap an async call with toast error reporting.
 *  Silently returns undefined for expected LLM unavailability (503). */
export async function withErrorToast<T>(fn: () => Promise<T>, context?: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      // Expected unavailability (e.g. LLM not configured) — no toast
      return undefined;
    }
    const toast = useToast();
    const message = e instanceof ApiError ? e.message : "Something went wrong";
    toast.error(context ? `${context}: ${message}` : message);
    return undefined;
  }
}

export function useApi() {
  return {
    getUserId,

    // Graph
    getSubjects: () => request<{ subjects: any[] }>("/graph/subjects"),
    getTopics: (subjectId: string) =>
      request<{ topics: any[] }>(`/graph/subjects/${subjectId}/topics`),
    getTopic: (topicId: string) => request<{ topic: any }>(`/graph/topics/${topicId}`),
    getFrontier: async () => {
      const userId = await getUserId();
      return request<any>(`/graph/frontier/${userId}`);
    },
    getUserGraphState: async (subjectId: string) => {
      const userId = await getUserId();
      return request<{
        topics: (Topic & { status: "not-started" | "in-progress" | "mastered" | "frontier"; repetitions: number; stability: number | null; lastReviewedAt: string | null })[];
        summary: { total: number; mastered: number; inProgress: number; frontier: number; progress: number };
      }>(`/graph/${subjectId}/user-state/${userId}`);
    },

    // Sessions
    getActiveSession: async () => {
      const userId = await getUserId();
      return request<any>(`/learn/sessions/active?userId=${userId}`);
    },
    startSession: async () => {
      const userId = await getUserId();
      return request<any>("/learn/sessions", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    },
    respondToSession: (sessionId: string, response: any) =>
      request<any>(`/learn/sessions/${sessionId}/respond`, {
        method: "POST",
        body: JSON.stringify(response),
      }),

    // Anonymous Sessions (no auth required)
    getActiveAnonymousSession: (anonymousToken: string) =>
      request<any>(`/learn/sessions/active?anonymousToken=${anonymousToken}`),
    startAnonymousSession: (anonymousToken: string, subjectId?: string) =>
      request<any>("/learn/sessions", {
        method: "POST",
        body: JSON.stringify({ anonymousToken, subjectId }),
      }),

    // Diagnostic (no auth required)
    startDiagnostic: (params: { userId?: string; anonymousToken?: string; subjectId: string; isTaste?: boolean }) =>
      request<{ sessionId: string; question: any }>("/learn/diagnostic/start", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    resumeDiagnostic: (params: { userId?: string; anonymousToken?: string; subjectId: string }) =>
      request<{ sessionId: string; question: any } | null>("/learn/diagnostic/resume", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    respondDiagnostic: (sessionId: string, answer: string) =>
      request<{ done: boolean; correct: boolean; question?: any; result?: DiagnosticResult }>("/learn/diagnostic/respond", {
        method: "POST",
        body: JSON.stringify({ sessionId, answer }),
      }),
    getDiagnosticResult: (sessionId: string) =>
      request<DiagnosticResult>(`/learn/diagnostic/result/${sessionId}`),

    // Onboarding (auth required)
    getOnboarding: () => request<{ step: number; completedAt: string | null }>("/onboarding"),
    updateOnboarding: (step: number, diagnosticSessionId?: string) =>
      request<{ success: boolean; step: number }>("/onboarding", {
        method: "PUT",
        body: JSON.stringify({ step, diagnosticSessionId }),
      }),
    mergeAnonymousData: (anonymousToken: string) =>
      request<{ success: boolean; mergedSessions: number; mergedDiagnostics: number; mergedResponses: number; mergedTopicStates: number }>("/onboarding/merge", {
        method: "POST",
        body: JSON.stringify({ anonymousToken }),
      }),

    // Review
    getSessionMix: async () => {
      const userId = await getUserId();
      return request<any>(`/review/mix/${userId}?count=10`);
    },
    submitReview: async (data: any) => {
      const userId = await getUserId();
      return request<any>("/review/submit", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      });
    },

    // Progress
    getProgress: async () => {
      const userId = await getUserId();
      return request<any>(`/progress/${userId}`);
    },
    getTopicStates: async () => {
      const userId = await getUserId();
      return request<any>(`/progress/${userId}/topics`);
    },
    getPresentationDistributions: async () => {
      const userId = await getUserId();
      return request<{
        distributions: {
          subjectId: string;
          subjectName: string;
          centerLevel: string;
          weights: { primary: number; intermediate: number; standard: number; advanced: number };
          label: string;
          lastAdjustedAt: string | null;
        }[];
      }>(`/progress/${userId}/presentation`);
    },
    getCalibration: async () => {
      const userId = await getUserId();
      return request<{
        overallAccuracy: number | null;
        totalRatedReviews: number;
        misconceptionCount: number;
        trend: { accuracy: number; window: number }[];
      }>(`/progress/${userId}/calibration`);
    },
    getCompletionEstimates: async () => {
      const userId = await getUserId();
      return request<{ estimates: CompletionEstimate[] }>(`/progress/${userId}/completion`);
    },

    // LLM
    getLLMStatus: () =>
      request<{ available: boolean; tiers?: { tier: string; modelId: string }[] }>("/llm/status"),
    requestTutor: async (data: any) => {
      const userId = await getUserId();
      return request<any>("/llm/tutor", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      });
    },
    requestTutorStream: async (data: any): Promise<Response> => {
      const userId = await getUserId();
      return fetch(`${API_BASE}/llm/tutor-stream`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...data }),
      });
    },
    requestHint: async (data: {
      topicName: string;
      problemQuestion: string;
      problemSolution: string;
      staticHints: string[];
      currentHintLevel: number;
      studentResponse?: string;
    }) => {
      const userId = await getUserId();
      return request<{
        level: number;
        hint: string;
        source: "static" | "llm";
        isMaxLevel: boolean;
      }>("/llm/hint", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      });
    },
    evaluateExplanation: async (data: {
      topicName: string;
      topicId?: string;
      stepDescription: string;
      studentExplanation: string;
    }) => {
      const userId = await getUserId();
      return request<{
        quality: "strong" | "partial" | "weak" | "misconception";
        feedback: string;
        missingConcepts: string[];
        misconceptionFlag: string | null;
      }>("/llm/evaluate", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      });
    },
    gradeAnswer: async (data: any) => {
      const userId = await getUserId();
      return request<any>("/llm/grade", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      });
    },

    // Family
    createFamily: (name: string) =>
      request<{ family: any }>("/family", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    getFamily: () => request<{ family: any; members: any[]; currentUserRole: string }>("/family"),
    updateFamily: (name: string) =>
      request<{ success: boolean }>("/family", {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    addChild: (data: { name: string; email: string; password: string; birthYear?: number }) =>
      request<{ child: any }>("/family/children", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getChildren: () => request<{ children: any[] }>("/family/children"),
    getChildProgress: (childId: string) =>
      request<{ childId: string; stats: any; topics: any[] }>(`/family/children/${childId}/progress`),
    getFamilyProgress: () =>
      request<{ children: { childId: string; name: string; stats: any }[] }>("/family/progress"),
    getFamilyUsage: () =>
      request<{
        children: { childId: string; name: string; costCents: number; calls: number }[];
        totalCostCents: number;
        monthlyBudgetCents: number | null;
      }>("/family/usage"),
    setFamilyBudget: (monthlyBudgetCents: number | null) =>
      request<{ success: boolean; monthlyBudgetCents: number | null }>("/family/budget", {
        method: "PUT",
        body: JSON.stringify({ monthlyBudgetCents }),
      }),
    // Settings
    getSettings: () => request<SpeechSettings>("/settings"),
    updateSettings: (data: Partial<SpeechSettings>) =>
      request<{ success: boolean }>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getChildSettings: (childId: string) => request<SpeechSettings>(`/settings/${childId}`),
    updateChildSettings: (childId: string, data: Partial<SpeechSettings>) =>
      request<{ success: boolean }>(`/settings/${childId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    // Admin
    getAdminStats: () =>
      request<{
        totalUsers: number;
        totalFamilies: number;
        totalTopics: number;
        totalReviews: number;
        totalInstructionalContent: number;
        totalAssessmentContent: number;
        llmCostCentsAllTime: number;
        llmCostCentsThisMonth: number;
        contentByLocale: { locale: string; instructional: number; assessment: number }[];
        contentByFlavor: { flavor: string; instructional: number; assessment: number }[];
      }>("/admin/stats"),
    getAdminSystemStats: () =>
      request<{
        activeUsers7d: number;
        activeUsers30d: number;
        contentVolume: { type: string; count: number }[];
        llmSummary: { totalCalls: number; totalCostCents: number; totalInputTokens: number; totalOutputTokens: number; uniqueModels: number };
        contentVelocity: { week: string; instructional: number; assessment: number }[];
      }>("/admin/system-stats"),
    getAdminLLMConfig: () =>
      request<{ configs: { tier: string; modelId: string; costInputPerM: number; costOutputPerM: number; updatedAt: string }[] }>("/admin/llm/config"),
    updateAdminLLMConfig: (tier: string, data: { modelId: string; costInputPerM: number; costOutputPerM: number }) =>
      request<{ success: boolean }>(`/admin/llm/config/${tier}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getAdminLLMUsage: () =>
      request<{
        byPurpose: { purpose: string; calls: number; totalCostCents: number; totalInputTokens: number; totalOutputTokens: number }[];
        byModel: { model: string; calls: number; totalCostCents: number }[];
        monthStart: string;
      }>("/admin/llm/usage"),
    getAdminTopUsers: () =>
      request<{ topUsers: { userId: string; userName: string; calls: number; totalCostCents: number }[] }>("/admin/llm/usage/top-users"),

    // Public content (no auth required)
    getPublicSubjects: () =>
      request<{ subjects: Subject[] }>("/public/subjects"),
    getPublicTopics: (subjectId: string) =>
      request<{ subjectId: string; topics: (Topic & { problemCount?: number; exampleCount?: number })[] }>(`/public/subjects/${subjectId}/topics`),
    getPublicTopic: (topicId: string) =>
      request<{ topic: Topic & { problems: Problem[]; examples: WorkedExample[] } }>(`/public/topics/${topicId}`),
    getPublicGraph: (subjectId: string) =>
      request<{
        subject: Subject;
        topics: Topic[];
        prerequisites: { from: string; to: string; strength: number }[];
        encompassings: { parent: string; child: string; weight: number }[];
      }>(`/public/graph/${subjectId}`),

    getContentQuality: () =>
      request<{
        topicQuality: { topicId: string; topicName: string; gradeLevel: number; totalAttempts: number; correctAttempts: number; accuracy: number; avgHintsUsed: number; avgResponseMs: number; uniqueLearners: number }[];
        problemQuality: { assessmentContentId: string; topicId: string; question: string; difficulty: string; type: string; attempts: number; correct: number; accuracy: number; avgHints: number }[];
      }>("/admin/analytics/content-quality"),
    getDifficultySpikes: () =>
      request<{
        spikes: { prereqTopicId: string; prereqTopicName: string; prereqAccuracy: number; prereqAttempts: number; dependentTopicId: string; dependentTopicName: string; dependentAccuracy: number; dependentAttempts: number; accuracyDrop: number }[];
      }>("/admin/analytics/difficulty-spikes"),
    getContentVersions: () =>
      request<{
        versionComparison: { topicId: string; topicName: string; version: number; contentUpdatedAt: string; attemptsBefore: number; accuracyBefore: number; attemptsAfter: number; accuracyAfter: number }[];
      }>("/admin/analytics/content-versions"),

    getContentEffectiveness: () =>
      request<{
        topicLLMUsage: { purpose: string; calls: number }[];
        topicReviewStats: any[];
        topicMasteryStats: any[];
        strugglingTopics: { topicId: string; topicName: string; totalAttempts: number; accuracy: number; hintsPerAttempt: number; masteryRate: number; avgReps: number; uniqueLearners: number }[];
      }>("/admin/analytics/content-effectiveness"),
    getLearningPatterns: () =>
      request<{
        hintPatterns: { hintsUsed: number; count: number; avgCorrect: number }[];
        responseByPhase: { phase: string; avgResponseMs: number; count: number; accuracy: number }[];
        dailyActivity: { date: string; reviews: number; uniqueUsers: number }[];
      }>("/admin/analytics/learning-patterns"),

    getContentMatrix: () =>
      request<{
        subjects: { id: string; name: string; gradeRange: string }[];
        matrix: {
          topicId: string;
          topicName: string;
          gradeLevel: number;
          subjectId: string;
          subjectName: string;
          totalInstructional: number;
          totalAssessment: number;
          hasAssets: boolean;
          instructional: { flavor: string; locale: string; presentation: string; count: number; maxVersion: number; hasAssets: boolean }[];
          assessment: { flavor: string; locale: string; poolSize: number; easy: number; medium: number; hard: number }[];
          questionTypes: Record<string, number>;
          quality: { accuracy: number; attempts: number } | null;
          gaps: { icMissing: number; acMissing: number; poolBelowTarget: boolean; missingDifficulties: boolean };
        }[];
        dimensions: { flavors: string[]; locales: string[]; targetPoolSize: number };
        gapSummary: {
          totalTopics: number;
          totalMatrixCells: number;
          filledCells: number;
          fillPercentage: number;
          topicsWithPoolBelowTarget: number;
          topicsWithMissingDifficulties: number;
          topicsWithNoAssets: number;
          topicsWithLowQuality: number;
        };
      }>("/admin/content-matrix"),

    // Activity
    getTodayProgress: async (date?: string) => {
      const userId = await getUserId();
      const qs = date ? `?date=${date}` : "";
      return request<TodayProgress>(`/activity/today${qs}`);
    },
    getWeeklySummary: async (date?: string) => {
      const qs = date ? `?date=${date}` : "";
      return request<WeeklySummary>(`/activity/weekly${qs}`);
    },
    getActivityHistory: async (days = 84) =>
      request<{ days: DailyActivityDay[] }>(`/activity/history?days=${days}`),
    getStreakInfo: async (date?: string) => {
      const qs = date ? `?date=${date}` : "";
      return request<StreakInfo>(`/activity/streak${qs}`);
    },
    getDailyGoal: () => request<DailyGoalConfig>("/activity/goal"),
    updateDailyGoal: (data: Partial<DailyGoalConfig>) =>
      request<DailyGoalConfig>("/activity/goal", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    recordActivity: (data: { date: string; minutes?: number; problems?: number; topicsMastered?: number }) =>
      request<{ goalMet: boolean; goalJustCompleted: boolean }>("/activity/record", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getChildWeeklySummary: (childId: string, date?: string) => {
      const qs = date ? `?date=${date}` : "";
      return request<WeeklySummary>(`/activity/${childId}/weekly${qs}`);
    },

    // Group Sessions
    createGroupSession: (data: { type: "family" | "classroom" | "peer-pair"; topicId?: string; studentIds?: string[] }) =>
      request<{ sessionId: string; joinCode: string | null }>("/group-sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    joinGroupSession: (joinCode: string, displayName?: string, anonymousToken?: string) =>
      request<{ sessionId: string; participantId: string }>("/group-sessions/join", {
        method: "POST",
        body: JSON.stringify({ joinCode, displayName, anonymousToken }),
      }),
    listGroupSessions: () =>
      request<{ sessions: any[] }>("/group-sessions"),
    getGroupDashboard: (sessionId: string) =>
      request<{ session: any; participants: any[] }>(`/group-sessions/${sessionId}/dashboard`),
    suggestGroupTopics: (sessionId: string) =>
      request<{ suggestions: { id: string; name: string; reason: string }[] }>(`/group-sessions/${sessionId}/suggest-topics`),
    setGroupTopic: (sessionId: string, topicId: string) =>
      request<{ topicId: string; topicName: string }>(`/group-sessions/${sessionId}/set-topic`, {
        method: "POST",
        body: JSON.stringify({ topicId }),
      }),
    getGroupProblem: (sessionId: string, participantId: string) =>
      request<{ problem: any; topicId: string; difficulty: string }>(`/group-sessions/${sessionId}/problem/${participantId}`),
    respondGroupProblem: (sessionId: string, participantId: string, data: { correct: boolean; topicId: string; responseMs: number }) =>
      request<{ totalCorrect: number; totalAttempts: number }>(`/group-sessions/${sessionId}/respond/${participantId}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getGroupPeerPair: (sessionId: string) =>
      request<{ studentA: string; studentB: string; currentStep: number; currentTurn: string; problem: any }>(`/group-sessions/${sessionId}/peer-pair`),
    endGroupSession: (sessionId: string) =>
      request<{ ended: boolean }>(`/group-sessions/${sessionId}/end`, {
        method: "POST",
      }),
  };
}
