<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useSpeech } from "@/composables/useSpeech";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import ProblemView from "@/components/ProblemView.vue";
import WorkedExample from "@/components/WorkedExample.vue";

const api = useApi();
const speech = useSpeech();
const speechPrefs = useSpeechPrefs();

// Load speech preferences on mount
speechPrefs.load();

const sessionId = ref<string | null>(null);
const currentItem = ref<any>(null);
const loading = ref(false);
const sessionActive = ref(false);
const recovering = ref(true);

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
  const result = await withErrorToast(
    () => api.getActiveSession(),
    "Failed to check active session"
  );
  if (result?.active) {
    sessionId.value = result.sessionId;
    currentItem.value = result.currentItem;
    sessionActive.value = true;
  }
  recovering.value = false;
});

async function startSession() {
  loading.value = true;
  const result = await withErrorToast(
    () => api.startSession(),
    "Failed to start session"
  );
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
        Your session will include a mix of new topics and review.
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
          to="/progress"
          class="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          View Progress
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
