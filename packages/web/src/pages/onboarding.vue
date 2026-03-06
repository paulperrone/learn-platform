<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAnonymous } from "@/composables/useAnonymous";
import { useAuth } from "@/composables/useAuth";
import ProblemView from "@/components/ProblemView.vue";
import type { DiagnosticResult } from "@learn/shared";
import { useI18n } from "vue-i18n";

const api = useApi();
const auth = useAuth();
const anon = useAnonymous();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const step = ref(0); // 0=loading, 1=welcome, 2=diagnostic, 3=start learning, 4=done
const loading = ref(true);
const diagnosticSessionId = ref<string | null>(null);
const currentQuestion = ref<any>(null);
const questionNumber = ref(0);
const totalQuestions = ref<number | null>(null);
const diagnosticResult = ref<DiagnosticResult | null>(null);
const mergeResult = ref<{ mergedSessions: number; mergedDiagnostics: number } | null>(null);
const retakingDiagnostic = ref(!!route.query.diagnostic);

onMounted(async () => {
  // Merge anonymous data if present
  if (anon.hasProgress.value) {
    const mr = await withErrorToast(
      () => api.mergeAnonymousData(anon.token.value),
      t("errors.mergeProgress")
    );
    if (mr?.success) {
      mergeResult.value = mr;
      anon.clearOnMerge();
    }
  }

  // Check onboarding state
  const state = await withErrorToast(() => api.getOnboarding(), t("errors.failedToLoad", { resource: "onboarding" }));
  if (state?.completedAt && !retakingDiagnostic.value) {
    router.replace("/");
    return;
  }
  // If retaking diagnostic, start at welcome step regardless of saved state
  step.value = retakingDiagnostic.value ? 1 : (state?.step ?? 1);
  loading.value = false;
});

async function goToStep(newStep: number) {
  step.value = newStep;
  await withErrorToast(() => api.updateOnboarding(newStep, diagnosticSessionId.value ?? undefined));
}

async function startDiagnostic() {
  step.value = 2;
  loading.value = true;

  // Get first subject
  const subjects = await withErrorToast(() => api.getPublicSubjects());
  const subjectId = subjects?.subjects?.[0]?.id;
  if (!subjectId) {
    step.value = 3;
    loading.value = false;
    return;
  }

  const userId = await api.getUserId().catch(() => undefined);
  const data = await withErrorToast(
    () => api.startDiagnostic({ userId, subjectId, isTaste: false }),
    t("errors.failedToStart", { action: "diagnostic" })
  );

  if (data) {
    diagnosticSessionId.value = data.sessionId;
    currentQuestion.value = data.question;
    questionNumber.value = data.question.questionNumber;
    totalQuestions.value = data.question.totalQuestions ?? null;
    await withErrorToast(() => api.updateOnboarding(2, data.sessionId));
  }
  loading.value = false;
}

async function handleDiagnosticAnswer(data: { answer: string; correct: boolean; responseMs: number }) {
  if (!diagnosticSessionId.value) return;
  loading.value = true;

  const resp = await withErrorToast(
    () => api.respondDiagnostic(diagnosticSessionId.value!, data.answer),
    t("errors.failedToSubmit", { action: "answer" })
  );

  if (resp) {
    if (resp.done && resp.result) {
      diagnosticResult.value = resp.result;
      step.value = 3;
      await withErrorToast(() => api.updateOnboarding(3, diagnosticSessionId.value ?? undefined));
    } else if (resp.question) {
      currentQuestion.value = resp.question;
      questionNumber.value = resp.question.questionNumber;
    }
  }
  loading.value = false;
}

async function startLearning() {
  await withErrorToast(() => api.updateOnboarding(4));
  router.push("/learn");
}

const progressPercent = computed(() =>
  totalQuestions.value && totalQuestions.value > 0
    ? Math.round((questionNumber.value / totalQuestions.value) * 100)
    : 0
);
</script>

<template>
  <div class="max-w-2xl mx-auto py-8">
    <!-- Loading -->
    <div v-if="loading && step === 0" class="flex items-center justify-center py-12 text-gray-400">
      <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {{ t('onboarding.settingUp') }}
    </div>

    <!-- Merge notification -->
    <div v-if="mergeResult && (mergeResult.mergedSessions > 0 || mergeResult.mergedDiagnostics > 0)" class="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      <p class="text-green-800 text-sm">
        {{ t('onboarding.mergeSuccess') }}
      </p>
    </div>

    <!-- Step 1: Welcome -->
    <div v-if="step === 1" class="text-center">
      <h1 class="text-3xl font-bold mb-4">{{ t('onboarding.welcomeTitle') }}</h1>
      <p class="text-lg text-gray-600 mb-8">
        {{ t('onboarding.welcomeText') }}
      </p>

      <div class="bg-blue-50 rounded-xl p-6 mb-8 text-left">
        <h3 class="font-semibold text-blue-900 mb-3">{{ t('onboarding.howItWorks') }}</h3>
        <ol class="space-y-2 text-blue-800 text-sm">
          <li><span class="font-bold">1.</span> {{ t('onboarding.step1') }}</li>
          <li><span class="font-bold">2.</span> {{ t('onboarding.step2') }}</li>
          <li><span class="font-bold">3.</span> {{ t('onboarding.step3') }}</li>
        </ol>
      </div>

      <button
        @click="startDiagnostic"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700"
      >
        {{ t('onboarding.startDiagnostic') }}
      </button>

      <button
        @click="goToStep(3)"
        class="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        {{ t('onboarding.skipDiagnostic') }}
      </button>
    </div>

    <!-- Step 2: Diagnostic -->
    <div v-else-if="step === 2">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">{{ t('onboarding.diagnosticTitle') }}</h1>
          <span class="text-sm text-gray-500">
            {{ totalQuestions ? `${questionNumber} / ${totalQuestions}` : t('onboarding.questionCount', { n: questionNumber }) }}
          </span>
        </div>
        <div v-if="totalQuestions" class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('onboarding.diagnosticHint') }}</p>
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
        :message="t('onboarding.answerPrompt')"
        :key="currentQuestion.problem.id"
        @submit="handleDiagnosticAnswer"
      />
    </div>

    <!-- Step 3: Results & Start Learning -->
    <div v-else-if="step === 3" class="text-center">
      <h1 class="text-3xl font-bold mb-4">{{ t('onboarding.allSetTitle') }}</h1>

      <div v-if="diagnosticResult" class="bg-white border border-gray-200 rounded-xl p-8 mb-8">
        <div class="grid grid-cols-2 gap-6 text-center">
          <div>
            <div class="text-2xl font-bold text-blue-600">{{ diagnosticResult.estimatedLevel }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('onboarding.estimatedLevel') }}</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600">
              {{ diagnosticResult.questionsCorrect }}/{{ diagnosticResult.questionsAsked }}
            </div>
            <div class="text-sm text-gray-500 mt-1">{{ t('onboarding.correctAnswers') }}</div>
          </div>
        </div>
        <p v-if="diagnosticResult.estimatedFrontier.length > 0" class="mt-4 text-gray-600 text-sm">
          {{ t('onboarding.topicsFound', { count: diagnosticResult.estimatedFrontier.length }) }}
        </p>
      </div>

      <div v-else class="bg-blue-50 rounded-xl p-6 mb-8">
        <p class="text-blue-800">
          {{ t('onboarding.startFromBeginning') }}
        </p>
      </div>

      <button
        @click="startLearning"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700"
      >
        {{ t('onboarding.startLearning') }}
      </button>
    </div>
  </div>
</template>
