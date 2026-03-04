const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
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

export function useApi() {
  // Hard-coded user ID for MVP (will use auth in production)
  const userId = "test-user";

  return {
    userId,

    // Graph
    getSubjects: () => request<{ subjects: any[] }>("/graph/subjects"),
    getTopics: (subjectId: string) =>
      request<{ topics: any[] }>(`/graph/subjects/${subjectId}/topics`),
    getTopic: (topicId: string) => request<{ topic: any }>(`/graph/topics/${topicId}`),
    getFrontier: () => request<any>(`/graph/frontier/${userId}`),

    // Sessions
    startSession: () =>
      request<any>("/learn/sessions", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    respondToSession: (sessionId: string, response: any) =>
      request<any>(`/learn/sessions/${sessionId}/respond`, {
        method: "POST",
        body: JSON.stringify(response),
      }),

    // Review
    getSessionMix: () => request<any>(`/review/mix/${userId}?count=10`),
    submitReview: (data: any) =>
      request<any>("/review/submit", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      }),

    // Progress
    getProgress: () => request<any>(`/progress/${userId}`),
    getTopicStates: () => request<any>(`/progress/${userId}/topics`),

    // LLM
    requestTutor: (data: any) =>
      request<any>("/llm/tutor", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      }),
    gradeAnswer: (data: any) =>
      request<any>("/llm/grade", {
        method: "POST",
        body: JSON.stringify({ userId, ...data }),
      }),
  };
}
