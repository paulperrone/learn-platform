import { ref, computed } from "vue";

const ANON_TOKEN_KEY = "learn-anonymous-token";
const ANON_PROGRESS_KEY = "learn-anonymous-progress";

type AnonymousProgress = {
  topicsAttempted: string[];
  totalCorrect: number;
  totalAttempts: number;
  diagnosticResults?: {
    sessionId: string;
    estimatedLevel: string;
    estimatedFrontier: string[];
  };
};

function getOrCreateToken(): string {
  let token = localStorage.getItem(ANON_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(ANON_TOKEN_KEY, token);
  }
  return token;
}

function getProgress(): AnonymousProgress {
  try {
    const raw = localStorage.getItem(ANON_PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { topicsAttempted: [], totalCorrect: 0, totalAttempts: 0 };
}

function saveProgress(progress: AnonymousProgress) {
  localStorage.setItem(ANON_PROGRESS_KEY, JSON.stringify(progress));
}

export function useAnonymous() {
  const token = ref(getOrCreateToken());
  const progress = ref(getProgress());

  const hasProgress = computed(() => progress.value.totalAttempts > 0);
  const hasDiagnostic = computed(() => !!progress.value.diagnosticResults);

  function recordAttempt(topicId: string, correct: boolean) {
    const p = progress.value;
    if (!p.topicsAttempted.includes(topicId)) {
      p.topicsAttempted.push(topicId);
    }
    p.totalAttempts++;
    if (correct) p.totalCorrect++;
    saveProgress(p);
  }

  function saveDiagnosticResult(result: AnonymousProgress["diagnosticResults"]) {
    progress.value.diagnosticResults = result;
    saveProgress(progress.value);
  }

  function clearOnMerge() {
    localStorage.removeItem(ANON_TOKEN_KEY);
    localStorage.removeItem(ANON_PROGRESS_KEY);
  }

  return {
    token,
    progress,
    hasProgress,
    hasDiagnostic,
    recordAttempt,
    saveDiagnosticResult,
    clearOnMerge,
  };
}
