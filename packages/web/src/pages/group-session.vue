<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useApi } from "@/composables/useApi";

const route = useRoute();
const router = useRouter();
const api = useApi();

const sessionId = route.params.id as string;

const loading = ref(true);
const session = ref<any>(null);
const participants = ref<any[]>([]);
const suggestions = ref<any[]>([]);
const showTopicPicker = ref(false);
const ending = ref(false);
let pollInterval: ReturnType<typeof setInterval> | null = null;

const students = computed(() => participants.value.filter((p) => p.role === "student"));
const facilitator = computed(() => participants.value.find((p) => p.role === "facilitator"));
const averageAccuracy = computed(() => {
  const withAttempts = students.value.filter((s) => s.totalAttempts > 0);
  if (withAttempts.length === 0) return null;
  const sum = withAttempts.reduce((a, s) => a + s.totalCorrect / s.totalAttempts, 0);
  return Math.round((sum / withAttempts.length) * 100);
});

async function loadDashboard() {
  try {
    const data = await api.getGroupDashboard(sessionId);
    session.value = data.session;
    participants.value = data.participants;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function loadSuggestions() {
  try {
    const data = await api.suggestGroupTopics(sessionId);
    suggestions.value = data.suggestions;
  } catch {
    // ignore
  }
}

async function selectTopic(topicId: string) {
  try {
    await api.setGroupTopic(sessionId, topicId);
    showTopicPicker.value = false;
    await loadDashboard();
  } catch {
    // ignore
  }
}

async function endSession() {
  ending.value = true;
  try {
    await api.endGroupSession(sessionId);
    await loadDashboard();
  } catch {
    // ignore
  } finally {
    ending.value = false;
  }
}

onMounted(async () => {
  await loadDashboard();
  await loadSuggestions();
  // Poll for updates every 3 seconds (real-time sync simulation)
  pollInterval = setInterval(loadDashboard, 3000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8">
    <div v-if="loading" class="py-12 text-center text-gray-400">Loading session...</div>

    <div v-else-if="session">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <router-link to="/group" class="text-sm text-blue-600 hover:underline">&larr; All Sessions</router-link>
          <h1 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ session.type === "family" ? "Family Co-Learning" : session.type === "classroom" ? "Connected Classroom" : "Peer Pair" }}
          </h1>
        </div>
        <div class="flex items-center gap-3">
          <span
            v-if="session.joinCode && session.status === 'active'"
            class="rounded-lg bg-blue-50 px-4 py-2 font-mono text-xl font-bold tracking-widest text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          >
            {{ session.joinCode }}
          </span>
          <span
            :class="session.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'"
            class="rounded-full px-3 py-1 text-sm font-medium"
          >
            {{ session.status === "active" ? "Active" : "Ended" }}
          </span>
        </div>
      </div>

      <!-- Topic selection -->
      <div class="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Current Topic:</span>
            <span class="ml-2 font-medium text-gray-900 dark:text-white">
              {{ session.topicId ? (participants.find(p => p.currentTopicId)?.topicName ?? session.topicId) : "Not set" }}
            </span>
          </div>
          <button
            v-if="session.status === 'active'"
            class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showTopicPicker = !showTopicPicker; loadSuggestions()"
          >
            {{ showTopicPicker ? "Hide" : "Change Topic" }}
          </button>
        </div>

        <!-- Topic suggestions -->
        <div v-if="showTopicPicker && suggestions.length > 0" class="mt-4 space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Suggested based on students' frontiers:</p>
          <button
            v-for="s in suggestions"
            :key="s.id"
            class="block w-full rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
            @click="selectTopic(s.id)"
          >
            <span class="font-medium text-gray-900 dark:text-white">{{ s.name }}</span>
            <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">{{ s.reason }}</span>
          </button>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="mb-6 grid grid-cols-3 gap-4">
        <div class="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/20">
          <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">{{ students.length }}</div>
          <div class="text-sm text-blue-600 dark:text-blue-400">Students</div>
        </div>
        <div class="rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20">
          <div class="text-2xl font-bold text-green-700 dark:text-green-300">
            {{ students.reduce((a, s) => a + s.totalAttempts, 0) }}
          </div>
          <div class="text-sm text-green-600 dark:text-green-400">Total Answers</div>
        </div>
        <div class="rounded-lg bg-purple-50 p-4 text-center dark:bg-purple-900/20">
          <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">
            {{ averageAccuracy !== null ? `${averageAccuracy}%` : "--" }}
          </div>
          <div class="text-sm text-purple-600 dark:text-purple-400">Avg Accuracy</div>
        </div>
      </div>

      <!-- Participant progress table -->
      <div class="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Student</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">Correct</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">Attempts</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-400">Accuracy</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Phase</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-900">
            <tr v-for="s in students" :key="s.id">
              <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {{ s.displayName }}
              </td>
              <td class="px-4 py-3 text-center text-green-600 dark:text-green-400">{{ s.totalCorrect }}</td>
              <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ s.totalAttempts }}</td>
              <td class="px-4 py-3 text-center">
                <span v-if="s.totalAttempts > 0" :class="s.totalCorrect / s.totalAttempts >= 0.7 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
                  {{ Math.round((s.totalCorrect / s.totalAttempts) * 100) }}%
                </span>
                <span v-else class="text-gray-400">--</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {{ s.currentPhase ?? "waiting" }}
              </td>
            </tr>
            <tr v-if="students.length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-gray-400">
                {{ session.joinCode ? `Waiting for students to join with code ${session.joinCode}` : "No students yet" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Actions -->
      <div v-if="session.status === 'active'" class="flex justify-end">
        <button
          class="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
          :disabled="ending"
          @click="endSession"
        >
          {{ ending ? "Ending..." : "End Session" }}
        </button>
      </div>
    </div>
  </div>
</template>
