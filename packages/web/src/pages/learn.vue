<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useApi, withErrorToast, ApiError } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useAnonymous } from "@/composables/useAnonymous";
import { useSpeech } from "@/composables/useSpeech";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import ProblemView from "@/components/ProblemView.vue";
import WorkedExample from "@/components/WorkedExample.vue";

const api = useApi();
const auth = useAuth();
const anon = useAnonymous();
const speech = useSpeech();
const speechPrefs = useSpeechPrefs();

speechPrefs.load();

const sessionId = ref<string | null>(null);
const currentItem = ref<any>(null);
const loading = ref(false);
const sessionActive = ref(false);
const recovering = ref(true);
const isAnonymous = ref(false);

// Auto-read problem when it appears and ttsAutoRead is enabled
watch(
  () => currentItem.value?.problem?.question,
  (question) => {
    if (question && speechPrefs.ttsAutoRead.value && speech.supported.value) {
      speech.speak(question);
    }
  },
);

onMounted(async () => {
  // Wait for auth to resolve
  await new Promise<void>((resolve) => {
    if (!auth.isPending.value) return resolve();
    const stop = watch(() => auth.isPending.value, (v) => {
      if (!v) { stop(); resolve(); }
    });
  });

  if (auth.isAuthenticated.value) {
    // Authenticated user — check for active session
    const result = await withErrorToast(
      () => api.getActiveSession(),
      "Failed to check active session"
    );
    if (result?.active) {
      sessionId.value = result.sessionId;
      currentItem.value = result.currentItem;
      sessionActive.value = true;
    }
  } else {
    // Anonymous user — check for active anonymous session
    isAnonymous.value = true;
    const result = await withErrorToast(
      () => api.getActiveAnonymousSession(anon.token.value),
      "Failed to check active session"
    );
    if (result?.active) {
      sessionId.value = result.sessionId;
      currentItem.value = result.currentItem;
      sessionActive.value = true;
    }
  }
  recovering.value = false;
});

async function startSession() {
  loading.value = true;
  let result;
  if (isAnonymous.value) {
    result = await withErrorToast(
      () => api.startAnonymousSession(anon.token.value),
      "Failed to start session"
    );
  } else {
    result = await withErrorToast(
      () => api.startSession(),
      "Failed to start session"
    );
  }
  if (result) {
    sessionId.value = result.sessionId;
    currentItem.value = result.firstItem;
    sessionActive.value = result.firstItem.type !== "complete";
  }
  loading.value = false;
}

async function handleProblemSubmit(data: {
  answer: string;
  correct: boolean;
  confidence?: number;
  responseMs: number;
}) {
  if (!sessionId.value) return;
  loading.value = true;
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, data),
    "Failed to submit response"
  );
  if (result) {
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
    // Track anonymous progress client-side
    if (isAnonymous.value && data.answer) {
      anon.recordAttempt(currentItem.value?.topicId ?? "", data.correct);
    }
  }
  loading.value = false;
}

async function handleExampleDone() {
  if (!sessionId.value) return;
  loading.value = true;
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, {
      correct: true,
      responseMs: 0,
      selfExplanation: "completed",
    }),
    "Failed to advance session"
  );
  if (result) {
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
  }
  loading.value = false;
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Learning Session</h1>

    <!-- Anonymous banner -->
    <div v-if="isAnonymous && !recovering" class="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <p class="text-amber-800 text-sm">
        You're learning as a guest. Progress won't be saved.
        <RouterLink to="/signup" class="font-semibold underline hover:text-amber-900">Create an account</RouterLink>
        to track your progress and unlock all features.
      </p>
    </div>

    <!-- Loading (checking for active session) -->
    <div v-if="recovering" class="flex items-center justify-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Checking for active session...</span>
    </div>

    <!-- Not started -->
    <div v-else-if="!sessionId" class="text-center py-12">
      <p class="text-gray-600 mb-6">
        {{ isAnonymous
          ? "Try a few topics to see how the platform works."
          : "Your session will include a mix of new topics and review." }}
      </p>
      <button
        @click="startSession"
        :disabled="loading"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? "Starting..." : "Begin Session" }}
      </button>
    </div>

    <!-- Session complete -->
    <div v-else-if="!sessionActive" class="text-center py-12">
      <div class="bg-green-50 rounded-xl p-8 mb-6">
        <h2 class="text-2xl font-bold text-green-800 mb-2">Session Complete!</h2>
        <p class="text-green-700">{{ currentItem?.message }}</p>
      </div>
      <div class="flex gap-4 justify-center">
        <button
          @click="sessionId = null; currentItem = null"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          New Session
        </button>
        <RouterLink
          v-if="!isAnonymous"
          to="/progress"
          class="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          View Progress
        </RouterLink>
        <RouterLink
          v-if="isAnonymous"
          to="/signup"
          class="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          Create Account to Save Progress
        </RouterLink>
      </div>
    </div>

    <!-- Active session -->
    <div v-else>
      <!-- Topic header -->
      <div v-if="currentItem?.topicName" class="mb-4">
        <h2 class="text-xl font-semibold text-gray-800">{{ currentItem.topicName }}</h2>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-8">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading...</span>
      </div>

      <!-- Problem -->
      <ProblemView
        v-else-if="currentItem?.type === 'problem' || currentItem?.type === 'remediation'"
        :problem="currentItem.problem"
        :topic-name="currentItem.topicName"
        :show-hints="currentItem.showHints"
        :ask-confidence="currentItem.askConfidence ?? false"
        :phase="currentItem.phase"
        :message="currentItem.message"
        :key="currentItem.problem.id + currentItem.phase"
        @submit="handleProblemSubmit"
      />

      <!-- Worked Example -->
      <WorkedExample
        v-else-if="currentItem?.type === 'instruction'"
        :example="currentItem.example"
        :key="currentItem.example.id"
        @done="handleExampleDone"
      />
    </div>
  </div>
</template>
