<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useToast } from "@/composables/useToast";
import type { SpeechSettings } from "@learn/shared";

const route = useRoute();
const api = useApi();
const toast = useToast();

const childId = computed(() => route.params.childId as string);
const childName = ref("");
const stats = ref({ mastered: 0, inProgress: 0, dueForReview: 0, total: 0 });
const topicStates = ref<any[]>([]);
const allTopics = ref<any[]>([]);
const loading = ref(true);
const error = ref(false);

// Speech settings for this child
const speechLoading = ref(true);
const speechSaving = ref(false);
const childTtsEnabled = ref(true);
const childTtsRate = ref(0.9);
const childTtsAutoRead = ref(false);
const childSttEnabled = ref(true);

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const [progressData, topicsData, familyData] = await Promise.all([
      api.getChildProgress(childId.value),
      api.getTopics("math-foundations"),
      api.getFamily(),
    ]);
    return { progressData, topicsData, familyData };
  }, "Failed to load child progress");

  if (result) {
    stats.value = result.progressData.stats;
    topicStates.value = result.progressData.topics;
    allTopics.value = result.topicsData.topics;
    const child = result.familyData.members.find((m: any) => m.userId === childId.value);
    childName.value = child?.name ?? "Child";

    // Determine K-2 default for auto-read based on birthYear
    const childUser = result.familyData.members.find((m: any) => m.userId === childId.value);
    const birthYear = childUser?.birthYear as number | undefined;
    const currentYear = new Date().getFullYear();
    const isK2Age = birthYear ? (currentYear - birthYear) <= 8 : false;

    // Load child speech settings
    const speechSettings = await withErrorToast(
      () => api.getChildSettings(childId.value),
      "Loading speech settings",
    );
    if (speechSettings) {
      childTtsEnabled.value = speechSettings.ttsEnabled;
      childTtsRate.value = speechSettings.ttsRate;
      childTtsAutoRead.value = speechSettings.ttsAutoRead;
      childSttEnabled.value = speechSettings.sttEnabled;
    } else if (isK2Age) {
      // Default auto-read ON for K-2 age children
      childTtsAutoRead.value = true;
    }
    speechLoading.value = false;
  } else {
    error.value = true;
  }
  loading.value = false;
});

async function saveSpeechSettings() {
  speechSaving.value = true;
  await withErrorToast(
    () => api.updateChildSettings(childId.value, {
      ttsEnabled: childTtsEnabled.value,
      ttsRate: childTtsRate.value,
      ttsAutoRead: childTtsAutoRead.value,
      sttEnabled: childSttEnabled.value,
    }),
    "Saving speech settings",
  );
  speechSaving.value = false;
  toast.success("Speech settings saved");
}

const stateMap = computed(() => {
  const map = new Map<string, any>();
  for (const t of topicStates.value) {
    map.set(t.topicId, t);
  }
  return map;
});

const topicsByGrade = computed(() => {
  const groups = new Map<number, any[]>();
  for (const t of allTopics.value) {
    const grade = t.gradeLevel;
    if (!groups.has(grade)) groups.set(grade, []);
    groups.get(grade)!.push(t);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
});

function getStatus(topicId: string) {
  const state = stateMap.value.get(topicId);
  if (!state) return "not-started";
  if (state.mastered) return "mastered";
  if (state.reps > 0) return "in-progress";
  return "not-started";
}

function statusColor(status: string) {
  switch (status) {
    case "mastered": return "bg-green-500";
    case "in-progress": return "bg-blue-500";
    default: return "bg-gray-200";
  }
}

function gradeName(level: number) {
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

const progressPercent = computed(() =>
  stats.value.total > 0
    ? Math.round((stats.value.mastered / stats.value.total) * 100)
    : 0
);
</script>

<template>
  <div>
    <!-- Back link -->
    <RouterLink to="/family" class="text-sm text-blue-600 hover:underline mb-4 inline-block">
      &larr; Back to Family
    </RouterLink>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading progress...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">Unable to load progress data.</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">Retry</button>
    </div>

    <template v-else>
      <h1 class="text-3xl font-bold mb-2">{{ childName }}</h1>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p class="text-sm text-gray-500">Mastered</p>
          <p class="text-2xl font-bold text-green-600">{{ stats.mastered }}</p>
          <p class="text-xs text-gray-400">of {{ stats.total }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p class="text-sm text-gray-500">In Progress</p>
          <p class="text-2xl font-bold text-blue-600">{{ stats.inProgress }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p class="text-sm text-gray-500">Due for Review</p>
          <p class="text-2xl font-bold text-orange-600">{{ stats.dueForReview }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p class="text-sm text-gray-500">Overall</p>
          <p class="text-2xl font-bold text-purple-600">{{ progressPercent }}%</p>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
        <div class="flex justify-between text-sm text-gray-600 mb-2">
          <span>Foundational Math Progress</span>
          <span>{{ stats.mastered }}/{{ stats.total }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-green-500 h-3 rounded-full transition-all duration-500"
            :style="{ width: progressPercent + '%' }"
          />
        </div>
      </div>

      <!-- Speech Settings -->
      <div v-if="!speechLoading" class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
        <h3 class="text-base font-semibold text-gray-800 mb-4">Speech Settings</h3>
        <div class="space-y-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="childTtsEnabled" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span class="text-sm text-gray-700">Enable read-aloud</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="childTtsAutoRead" :disabled="!childTtsEnabled" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
            <span class="text-sm text-gray-700" :class="{ 'opacity-50': !childTtsEnabled }">Auto-read problems</span>
          </label>
          <div>
            <label class="block text-sm text-gray-700 mb-1" :class="{ 'opacity-50': !childTtsEnabled }">
              Speed: {{ childTtsRate.toFixed(1) }}x
            </label>
            <input type="range" v-model.number="childTtsRate" min="0.5" max="1.5" step="0.1" :disabled="!childTtsEnabled" class="w-full disabled:opacity-50" />
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="childSttEnabled" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span class="text-sm text-gray-700">Enable voice input</span>
          </label>
          <button
            @click="saveSpeechSettings"
            :disabled="speechSaving"
            class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {{ speechSaving ? "Saving..." : "Save Speech Settings" }}
          </button>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex gap-6 mb-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-green-500" />
          <span class="text-gray-600">Mastered</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-blue-500" />
          <span class="text-gray-600">In Progress</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-gray-200" />
          <span class="text-gray-600">Not Started</span>
        </div>
      </div>

      <!-- Topics by Grade -->
      <div v-if="allTopics.length === 0" class="text-center py-8">
        <p class="text-gray-500">No topics available yet.</p>
      </div>

      <div v-for="[grade, gradeTopics] in topicsByGrade" :key="grade" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{{ gradeName(grade) }}</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div
            v-for="topic in gradeTopics"
            :key="topic.id"
            class="bg-white rounded-lg border border-gray-200 p-3"
          >
            <div class="flex items-start gap-2">
              <div :class="statusColor(getStatus(topic.id))" class="w-2.5 h-2.5 rounded-full mt-1 shrink-0" />
              <div>
                <p class="text-sm font-medium text-gray-800 leading-tight">{{ topic.name }}</p>
                <p v-if="stateMap.get(topic.id)" class="text-xs text-gray-400 mt-1">
                  {{ stateMap.get(topic.id).reps }} reviews
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
