<script setup lang="ts">
import { ref } from "vue";
import { useApi } from "@/composables/useApi";
import ProblemView from "@/components/ProblemView.vue";
import WorkedExample from "@/components/WorkedExample.vue";

const api = useApi();
const sessionId = ref<string | null>(null);
const currentItem = ref<any>(null);
const loading = ref(false);
const sessionActive = ref(false);

async function startSession() {
  loading.value = true;
  try {
    const result = await api.startSession();
    sessionId.value = result.sessionId;
    currentItem.value = result.firstItem;
    sessionActive.value = result.firstItem.type !== "complete";
  } catch (e) {
    console.error("Failed to start session:", e);
  } finally {
    loading.value = false;
  }
}

async function handleProblemSubmit(data: {
  answer: string;
  correct: boolean;
  confidence?: number;
  responseMs: number;
}) {
  if (!sessionId.value) return;
  loading.value = true;
  try {
    const result = await api.respondToSession(sessionId.value, data);
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
  } catch (e) {
    console.error("Failed to submit response:", e);
  } finally {
    loading.value = false;
  }
}

async function handleExampleDone() {
  if (!sessionId.value) return;
  loading.value = true;
  try {
    const result = await api.respondToSession(sessionId.value, {
      correct: true,
      responseMs: 0,
      selfExplanation: "completed",
    });
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
  } catch (e) {
    console.error("Failed to advance session:", e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Learning Session</h1>

    <!-- Not started -->
    <div v-if="!sessionId" class="text-center py-12">
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

      <div v-if="loading" class="text-center py-8 text-gray-500">Loading...</div>

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
