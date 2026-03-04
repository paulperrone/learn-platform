import { authClient } from "./useAuth";

const API_BASE = "/api";

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
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function getUserId(): Promise<string> {
  const session = await authClient.getSession();
  if (!session.data?.user?.id) {
    throw new Error("Not authenticated");
  }
  return session.data.user.id;
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

    // LLM
    requestTutor: async (data: any) => {
      const userId = await getUserId();
      return request<any>("/llm/tutor", {
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
  };
}
