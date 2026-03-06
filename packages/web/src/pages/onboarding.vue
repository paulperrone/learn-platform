<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAnonymous } from "@/composables/useAnonymous";
import { useAuth } from "@/composables/useAuth";
import ProblemView from "@/components/ProblemView.vue";
import type { DiagnosticResult } from "@learn/shared";

const api = useApi();
const auth = useAuth();
const anon = useAnonymous();
const router = useRouter();

const step = ref(0); // 0=loading, 1=welcome, 2=diagnostic, 3=start learning, 4=done
const loading = ref(true);
const diagnosticSessionId = ref<string | null>(null);
const currentQuestion = ref<any>(null);
const questionNumber = ref(0);
const totalQuestions = ref(0);
const diagnosticResult = ref<DiagnosticResult | null>(null);
const mergeResult = ref<{ mergedSessions: number; mergedDiagnostics: number } | null>(null);

onMounted(async () => {
  // Merge anonymous data if present
  if (anon.hasProgress.value) {
    const mr = await withErrorToast(
      () => api.mergeAnonymousData(anon.token.value),
      "Failed to merge progress"
    );
    if (mr?.success) {
      mergeResult.value = mr;
      anon.clearOnMerge();
    }
  }

  // Check onboarding state
  const state = await withErrorToast(() => api.getOnboarding(), "Failed to load onboarding");
  if (state?.completedAt) {
    router.replace("/");
    return;
  }
  step.value = state?.step ?? 1;
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
    "Failed to start diagnostic"
  );

  if (data) {
    diagnosticSessionId.value = data.sessionId;
    currentQuestion.value = data.question;
    questionNumber.value = data.question.questionNumber;
    totalQuestions.value = data.question.totalQuestions;
    await withErrorToast(() => api.updateOnboarding(2, data.sessionId));
  }
  loading.value = false;
}

async function handleDiagnosticAnswer(data: { answer: string; correct: boolean; responseMs: number }) {
  if (!diagnosticSessionId.value) return;
  loading.value = true;

  const resp = await withErrorToast(
    () => api.respondDiagnostic(diagnosticSessionId.value!, data.answer),
    "Failed to submit answer"
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
  totalQuestions.value > 0 ? Math.round((questionNumber.value / totalQuestions.value) * 100) : 0
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
      Setting up...
    </div>

    <!-- Merge notification -->
    <div v-if="mergeResult && (mergeResult.mergedSessions > 0 || mergeResult.mergedDiagnostics > 0)" class="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      <p class="text-green-800 text-sm">
        Your guest progress has been saved to your account.
      </p>
    </div>

    <!-- Step 1: Welcome -->
    <div v-if="step === 1" class="text-center">
      <h1 class="text-3xl font-bold mb-4">Welcome!</h1>
      <p class="text-lg text-gray-600 mb-8">
        Let's get you set up. This platform uses a knowledge graph to find exactly where you should be learning.
        Every topic builds on prerequisites — you'll never be asked something you're not ready for.
      </p>

      <div class="bg-blue-50 rounded-xl p-6 mb-8 text-left">
        <h3 class="font-semibold text-blue-900 mb-3">How it works:</h3>
        <ol class="space-y-2 text-blue-800 text-sm">
          <li><span class="font-bold">1.</span> We'll run a quick diagnostic to find your starting point</li>
          <li><span class="font-bold">2.</span> You'll begin learning from your personal frontier</li>
          <li><span class="font-bold">3.</span> Spaced repetition ensures you remember what you learn</li>
        </ol>
      </div>

      <button
        @click="startDiagnostic"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700"
      >
        Start Diagnostic
      </button>

      <button
        @click="goToStep(3)"
        class="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        Skip diagnostic, start from the beginning
      </button>
    </div>

    <!-- Step 2: Diagnostic -->
    <div v-else-if="step === 2">
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">Diagnostic Assessment</h1>
          <span class="text-sm text-gray-500">{{ questionNumber }} / {{ totalQuestions }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 mt-1">Don't worry about getting them all right — this helps us find your level.</p>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-8">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading...</span>
      </div>

      <ProblemView
        v-else-if="currentQuestion?.problem"
        :problem="currentQuestion.problem"
        :topic-name="''"
        :show-hints="false"
        :ask-confidence="false"
        phase="diagnostic"
        message="Answer as best you can."
        :key="currentQuestion.problem.id"
        @submit="handleDiagnosticAnswer"
      />
    </div>

    <!-- Step 3: Results & Start Learning -->
    <div v-else-if="step === 3" class="text-center">
      <h1 class="text-3xl font-bold mb-4">You're All Set!</h1>

      <div v-if="diagnosticResult" class="bg-white border border-gray-200 rounded-xl p-8 mb-8">
        <div class="grid grid-cols-2 gap-6 text-center">
          <div>
            <div class="text-2xl font-bold text-blue-600">{{ diagnosticResult.estimatedLevel }}</div>
            <div class="text-sm text-gray-500 mt-1">Estimated Level</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600">
              {{ diagnosticResult.questionsCorrect }}/{{ diagnosticResult.questionsAsked }}
            </div>
            <div class="text-sm text-gray-500 mt-1">Correct Answers</div>
          </div>
        </div>
        <p v-if="diagnosticResult.estimatedFrontier.length > 0" class="mt-4 text-gray-600 text-sm">
          We found {{ diagnosticResult.estimatedFrontier.length }} topics at your level to start with.
        </p>
      </div>

      <div v-else class="bg-blue-50 rounded-xl p-6 mb-8">
        <p class="text-blue-800">
          You'll start from the beginning and work your way up. The system will adapt as you learn.
        </p>
      </div>

      <button
        @click="startLearning"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700"
      >
        Start Learning
      </button>
    </div>
  </div>
</template>
