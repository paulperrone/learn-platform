<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAnonymous } from "@/composables/useAnonymous";
import { useAuth } from "@/composables/useAuth";
import ProblemView from "@/components/ProblemView.vue";
import type { DiagnosticResult } from "@learn/shared";
import { useI18n } from "vue-i18n";

const api = useApi();
const anon = useAnonymous();
const auth = useAuth();
const router = useRouter();
const { t } = useI18n();

const phase = ref<"intro" | "diagnostic" | "result">("intro");
const diagnosticSessionId = ref<string | null>(null);
const currentQuestion = ref<any>(null);
const questionNumber = ref(0);
const totalQuestions = ref(0);
const result = ref<DiagnosticResult | null>(null);
const loading = ref(false);
const disciplines = ref<{ id: string; name: string }[]>([]);
const selectedDiscipline = ref<string | null>(null);

const progressPercent = computed(() =>
  totalQuestions.value > 0 ? Math.round((questionNumber.value / totalQuestions.value) * 100) : 0
);

onMounted(async () => {
  const data = await withErrorToast(() => api.getPublicDisciplines(), t("errors.failedToLoad", { resource: "disciplines" }));
  if (data?.disciplines) {
    disciplines.value = data.disciplines;
    if (data.disciplines.length === 1) {
      selectedDiscipline.value = data.disciplines[0].id;
    }
  }
});

async function startDiagnostic() {
  if (!selectedDiscipline.value) return;
  loading.value = true;
  phase.value = "diagnostic";

  const userId = auth.isAuthenticated.value ? await api.getUserId().catch(() => undefined) : undefined;

  const data = await withErrorToast(
    () => api.startDiagnostic({
      userId,
      anonymousToken: userId ? undefined : anon.token.value,
      disciplineId: selectedDiscipline.value!,
      isTaste: true,
    }),
    t("errors.failedToStart", { action: "diagnostic" })
  );

  if (data) {
    diagnosticSessionId.value = data.sessionId;
    currentQuestion.value = data.question;
    questionNumber.value = data.question.questionNumber;
    totalQuestions.value = data.question.totalQuestions;
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
      result.value = resp.result;
      phase.value = "result";
      anon.saveDiagnosticResult({
        sessionId: resp.result.sessionId,
        estimatedLevel: resp.result.estimatedLevel,
        estimatedFrontier: resp.result.estimatedFrontier,
      });
    } else if (resp.question) {
      currentQuestion.value = resp.question;
      questionNumber.value = resp.question.questionNumber;
    }
  }
  loading.value = false;
}

function goToLearn() {
  router.push("/learn");
}

function goToSignup() {
  router.push("/signup");
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Intro -->
    <div v-if="phase === 'intro'" class="text-center py-12">
      <h1 class="text-4xl font-bold mb-4">{{ t('tryPage.title') }}</h1>
      <p class="text-lg text-gray-600 mb-8">
        {{ t('tryPage.subtitle') }}
      </p>

      <div v-if="disciplines.length > 1" class="mb-8">
        <label class="block text-sm font-medium text-gray-700 mb-2">{{ t('tryPage.chooseSubject') }}</label>
        <select
          v-model="selectedDiscipline"
          class="block w-64 mx-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option v-for="s in disciplines" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <button
        @click="startDiagnostic"
        :disabled="!selectedDiscipline || loading"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {{ loading ? t('common.loading') : t('tryPage.startAssessment') }}
      </button>

      <p class="mt-4 text-sm text-gray-500">{{ t('tryPage.duration') }}</p>
    </div>

    <!-- Diagnostic Questions -->
    <div v-else-if="phase === 'diagnostic'">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">{{ t('tryPage.assessmentTitle') }}</h1>
          <span class="text-sm text-gray-500">{{ questionNumber }} / {{ totalQuestions }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-8">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{{ t('tryPage.loadingNext') }}</span>
      </div>

      <ProblemView
        v-else-if="currentQuestion?.problem"
        :problem="currentQuestion.problem"
        :topic-name="''"
        :available-hints="[]"
        :show-solution="false"
        :hints-revealed="0"
        :ask-confidence="false"
        phase="diagnostic"
        :message="t('tryPage.answerPrompt')"
        :key="currentQuestion.problem.id"
        @submit="handleAnswer"
      />
    </div>

    <!-- Results -->
    <div v-else-if="phase === 'result' && result" class="py-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold mb-2">{{ t('tryPage.resultsTitle') }}</h1>
        <p class="text-gray-600">{{ t('tryPage.basedOn', { count: result.questionsAsked }) }}</p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-8 mb-8">
        <div class="grid grid-cols-3 gap-6 text-center mb-8">
          <div>
            <div class="text-3xl font-bold text-blue-600">{{ result.estimatedLevel }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('tryPage.estimatedLevel') }}</div>
          </div>
          <div>
            <div class="text-3xl font-bold text-green-600">{{ result.questionsCorrect }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('tryPage.correct') }}</div>
          </div>
          <div>
            <div class="text-3xl font-bold text-gray-700">{{ result.questionsAsked }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('tryPage.questions') }}</div>
          </div>
        </div>

        <div v-if="result.estimatedFrontier.length > 0" class="border-t pt-6">
          <h3 class="font-semibold text-gray-800 mb-2">{{ t('tryPage.recommendedTopics') }}</h3>
          <p class="text-sm text-gray-600">
            {{ t('tryPage.topicsReady', { count: result.estimatedFrontier.length }) }}
          </p>
        </div>
      </div>

      <div class="flex gap-4 justify-center">
        <button
          @click="goToLearn"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ t('tryPage.startLearning') }}
        </button>
        <button
          v-if="!auth.isAuthenticated.value"
          @click="goToSignup"
          class="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          {{ t('tryPage.createAccount') }}
        </button>
      </div>
    </div>
  </div>
</template>
