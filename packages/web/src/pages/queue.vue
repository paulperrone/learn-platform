<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useI18n } from "vue-i18n";

const api = useApi();
const router = useRouter();
const { t } = useI18n();

const disciplines = ref<any[]>([]);
const selectedDiscipline = ref("");
const queue = ref<{
  assessment?: { sessionId: string };
  reviews: { topicId: string; topicName: string; due: string; overdueDays: number; estimatedXp: number }[];
  newTopics: { topicId: string; topicName: string; description: string; gradeLevel: number; depth: number; estimatedXp: number }[];
  completed: boolean;
} | null>(null);
const loading = ref(true);
const starting = ref<string | null>(null);
const error = ref(false);

async function loadQueue(disciplineId?: string) {
  const result = await withErrorToast(
    () => api.getQueue(disciplineId),
    t("errors.failedToLoad", { resource: "queue" })
  );
  if (result) {
    queue.value = result;
  }
}

onMounted(async () => {
  const [discResult, estResult] = await Promise.all([
    withErrorToast(() => api.getDisciplines(), t("errors.failedToLoad", { resource: "disciplines" })),
    withErrorToast(() => api.getCompletionEstimates(), t("errors.failedToLoad", { resource: "estimates" })),
  ]);

  if (discResult && estResult) {
    // Filter to disciplines with content
    const activeDisciplineIds = new Set(
      estResult.estimates.filter((e) => e.total > 0).map((e) => e.disciplineId)
    );
    disciplines.value = discResult.disciplines.filter((d: any) => activeDisciplineIds.has(d.id));

    if (disciplines.value.length > 0) {
      selectedDiscipline.value = disciplines.value[0].id;
      await loadQueue(disciplines.value[0].id);
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

watch(selectedDiscipline, async (id) => {
  if (id) {
    queue.value = null;
    await loadQueue(id);
  }
});

async function startTopic(topicId: string) {
  starting.value = topicId;
  const result = await withErrorToast(
    () => api.startSession({ topicId }),
    t("errors.failedToStart", { action: "session" })
  );
  if (result) {
    router.push("/learn");
  }
  starting.value = null;
}

const sortedNewTopics = computed(() => {
  if (!queue.value) return [];
  return [...queue.value.newTopics].sort((a, b) => a.depth - b.depth || a.gradeLevel - b.gradeLevel);
});

function gradeName(level: number) {
  return level === 0 ? "K" : `Grade ${level}`;
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">{{ t('queue.title', 'Study Queue') }}</h1>

    <!-- Discipline Tabs -->
    <div v-if="disciplines.length > 1" class="flex gap-2 mb-6">
      <button
        v-for="d in disciplines"
        :key="d.id"
        @click="selectedDiscipline = d.id"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="selectedDiscipline === d.id
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
      >
        {{ d.name }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading || !queue" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{{ t('queue.loading', 'Loading your queue...') }}</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">{{ t('queue.error', 'Unable to load your study queue.') }}</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">{{ t('queue.retry', 'Retry') }}</button>
    </div>

    <template v-else>
      <!-- Assessment Banner -->
      <div v-if="queue.assessment" class="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-indigo-900">{{ t('queue.assessmentTitle', 'Assessment Checkpoint') }}</h2>
            <p class="text-sm text-indigo-700 mt-1">{{ t('queue.assessmentDescription', 'Complete this checkpoint to unlock more topics.') }}</p>
          </div>
          <RouterLink
            :to="`/assess/${queue.assessment.sessionId}`"
            class="shrink-0 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            {{ t('queue.startAssessment', 'Start') }}
          </RouterLink>
        </div>
      </div>

      <!-- Reviews Due -->
      <div v-if="queue.reviews.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">
          {{ t('queue.reviewsDue', 'Reviews Due') }}
          <span class="text-sm font-normal text-gray-500 ml-2">{{ queue.reviews.length }}</span>
        </h2>
        <div class="space-y-2">
          <button
            v-for="review in queue.reviews"
            :key="review.topicId"
            @click="startTopic(review.topicId)"
            :disabled="starting !== null"
            class="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />
                <span class="font-medium text-gray-800">{{ review.topicName }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-emerald-600 font-medium">+{{ review.estimatedXp }} XP</span>
                <span v-if="review.overdueDays > 0" class="text-xs text-orange-600 font-medium">
                  {{ review.overdueDays }}d overdue
                </span>
                <svg v-if="starting === review.topicId" class="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <svg v-else class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- New Topics -->
      <div v-if="sortedNewTopics.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">
          {{ t('queue.newTopics', 'New Topics') }}
          <span class="text-sm font-normal text-gray-500 ml-2">{{ sortedNewTopics.length }}</span>
        </h2>
        <div class="space-y-2">
          <button
            v-for="topic in sortedNewTopics"
            :key="topic.topicId"
            @click="startTopic(topic.topicId)"
            :disabled="starting !== null"
            class="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-3">
                  <div class="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                  <span class="font-medium text-gray-800">{{ topic.topicName }}</span>
                  <span class="text-xs text-gray-400">{{ gradeName(topic.gradeLevel) }}</span>
                </div>
                <p v-if="topic.description" class="text-sm text-gray-500 mt-1 ml-5 truncate">{{ topic.description }}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0 ml-3">
                <span class="text-xs text-emerald-600 font-medium">+{{ topic.estimatedXp }} XP</span>
              </div>
              <div class="shrink-0 ml-1">
                <svg v-if="starting === topic.topicId" class="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <svg v-else class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- All Caught Up -->
      <div v-if="queue.completed && !queue.assessment" class="text-center py-16">
        <div class="text-5xl mb-4">&#x2705;</div>
        <h2 class="text-2xl font-bold text-gray-800 mb-2">{{ t('queue.allCaughtUp', 'All caught up!') }}</h2>
        <p class="text-gray-500">{{ t('queue.nothingToDo', 'No reviews due and no new topics available right now.') }}</p>
        <RouterLink to="/" class="inline-block mt-6 text-blue-600 hover:underline text-sm">{{ t('queue.backToDashboard', 'Back to Dashboard') }}</RouterLink>
      </div>
    </template>
  </div>
</template>
