import { authClient } from "./useAuth";
import { useToast } from "./useToast";

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

/** Wrap an async call with toast error reporting */
export async function withErrorToast<T>(fn: () => Promise<T>, context?: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
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
  };
}
