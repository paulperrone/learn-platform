<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import ProblemView from "@/components/ProblemView.vue";
import type { DiagnosticResult } from "@learn/shared";
import { useI18n } from "vue-i18n";

const api = useApi();
const { isAuthenticated } = useAuth();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const subjectId = computed(() => route.params.subjectId as string);

type Phase = "intro" | "running" | "complete";
const phase = ref<Phase>("intro");
const loading = ref(false);
const subjectName = ref("");
const diagnosticSessionId = ref<string | null>(null);
const currentQuestion = ref<any>(null);
const questionNumber = ref(0);
const diagnosticResult = ref<DiagnosticResult | null>(null);

const storageKey = computed(() => `diagnostic-session-${subjectId.value}`);

onMounted(async () => {
  // Load subject name for display
  const subjects = await withErrorToast(() => api.getPublicSubjects());
  const subject = subjects?.subjects?.find((s: any) => s.id === subjectId.value);
  subjectName.value = subject?.name ?? subjectId.value;

  // Try to resume an active session
  const savedSessionId = sessionStorage.getItem(storageKey.value);
  if (savedSessionId) {
    loading.value = true;
    phase.value = "running";

    const userId = isAuthenticated.value
      ? await api.getUserId().catch(() => undefined)
      : undefined;

    const resumed = await api.resumeDiagnostic({
      userId,
      subjectId: subjectId.value,
    }).catch(() => null);

    if (resumed?.sessionId && resumed?.question) {
      diagnosticSessionId.value = resumed.sessionId;
      currentQuestion.value = resumed.question;
      questionNumber.value = resumed.question.questionNumber;
      loading.value = false;
      return;
    }

    // Stale session — clear storage
    sessionStorage.removeItem(storageKey.value);
    phase.value = "intro";
    loading.value = false;
  }
});

async function startDiagnostic() {
  phase.value = "running";
  loading.value = true;

  const userId = isAuthenticated.value
    ? await api.getUserId().catch(() => undefined)
    : undefined;

  const data = await withErrorToast(
    () => api.startDiagnostic({ userId, subjectId: subjectId.value, isTaste: false }),
    t("errors.failedToStart", { action: "diagnostic" })
  );

  if (data) {
    diagnosticSessionId.value = data.sessionId;
    sessionStorage.setItem(storageKey.value, data.sessionId);
    currentQuestion.value = data.question;
    questionNumber.value = data.question.questionNumber;
  } else {
    phase.value = "intro";
  }
  loading.value = false;
}

async function handleAnswer(data: { answer: string; correct: boolean; responseMs: number }) {
  if (!diagnosticSessionId.value) return;
  loading.value = true;

  const resp = await withErrorToast(
    () => api.respondDiagnostic(diagnosticSessionId.value!, data.answer),
    t("errors.failedToSubmit", { action: "answer" })
  );

  if (resp) {
    if (resp.done && resp.result) {
      diagnosticResult.value = resp.result;
      sessionStorage.removeItem(storageKey.value);
      phase.value = "complete";
    } else if (resp.question) {
      currentQuestion.value = resp.question;
      questionNumber.value = resp.question.questionNumber;
    }
  }
  loading.value = false;
}

function goToDashboard() {
  router.push("/");
}

function retake() {
  diagnosticResult.value = null;
  diagnosticSessionId.value = null;
  sessionStorage.removeItem(storageKey.value);
  currentQuestion.value = null;
  questionNumber.value = 0;
  startDiagnostic();
}
</script>

<template>
  <div class="max-w-2xl mx-auto py-8">
    <!-- Intro -->
    <div v-if="phase === 'intro'" class="text-center">
      <h1 class="text-3xl font-bold mb-4">{{ t('diagnostic.title') }}</h1>
      <p class="text-lg text-gray-600 mb-2">{{ subjectName }}</p>
      <p class="text-gray-500 mb-8">{{ t('diagnostic.description') }}</p>

      <div class="bg-blue-50 rounded-xl p-6 mb-8 text-left">
        <h3 class="font-semibold text-blue-900 mb-3">{{ t('diagnostic.howItWorks') }}</h3>
        <ul class="space-y-2 text-blue-800 text-sm">
          <li>{{ t('diagnostic.howStep1') }}</li>
          <li>{{ t('diagnostic.howStep2') }}</li>
          <li>{{ t('diagnostic.howStep3') }}</li>
        </ul>
      </div>

      <button
        @click="startDiagnostic"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
      >
        {{ t('diagnostic.start') }}
      </button>

      <button
        @click="goToDashboard"
        class="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        {{ t('diagnostic.backToDashboard') }}
      </button>
    </div>

    <!-- Running -->
    <div v-else-if="phase === 'running'">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">{{ t('diagnostic.placementTest') }}</h1>
          <span class="text-sm text-gray-500">{{ t('diagnostic.questionN', { n: questionNumber }) }}</span>
        </div>
        <p class="text-xs text-gray-500">{{ t('diagnostic.hint') }}</p>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-8">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{{ t('common.loading') }}</span>
      </div>

      <ProblemView
        v-else-if="currentQuestion?.problem"
        :problem="currentQuestion.problem"
        :topic-name="''"
        :show-hints="false"
        :ask-confidence="false"
        phase="diagnostic"
        :message="t('diagnostic.answerPrompt')"
        :key="currentQuestion.problem.id"
        @submit="handleAnswer"
      />
    </div>

    <!-- Complete -->
    <div v-else-if="phase === 'complete'" class="text-center">
      <h1 class="text-3xl font-bold mb-4">{{ t('diagnostic.resultsTitle') }}</h1>

      <div v-if="diagnosticResult" class="bg-white border border-gray-200 rounded-xl p-8 mb-8">
        <div class="grid grid-cols-2 gap-6 text-center">
          <div>
            <div class="text-2xl font-bold text-blue-600">{{ diagnosticResult.estimatedLevel }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('diagnostic.estimatedLevel') }}</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600">
              {{ diagnosticResult.questionsCorrect }}/{{ diagnosticResult.questionsAsked }}
            </div>
            <div class="text-sm text-gray-500 mt-1">{{ t('diagnostic.correctAnswers') }}</div>
          </div>
        </div>
        <p v-if="diagnosticResult.estimatedFrontier.length > 0" class="mt-4 text-gray-600 text-sm">
          {{ t('diagnostic.topicsIdentified', { count: diagnosticResult.estimatedFrontier.length }) }}
        </p>
      </div>

      <div class="flex gap-4 justify-center">
        <button
          @click="goToDashboard"
          class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          {{ t('diagnostic.startLearning') }}
        </button>
        <button
          @click="retake"
          class="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          {{ t('diagnostic.retake') }}
        </button>
      </div>
    </div>
  </div>
</template>
