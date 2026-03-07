<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useI18n } from "vue-i18n";

const api = useApi();
const { t } = useI18n();
const topics = ref<any[]>([]);
const allTopics = ref<any[]>([]);
const distributions = ref<any[]>([]);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const [statesData, topicsData, presData] = await Promise.all([
      api.getTopicStates(),
      api.getTopics("math-foundations"),
      api.getPresentationDistributions(),
    ]);
    return { statesData, topicsData, presData };
  }, t("errors.failedToLoad", { resource: "progress" }));

  if (result) {
    topics.value = result.statesData.topics;
    allTopics.value = result.topicsData.topics;
    distributions.value = result.presData?.distributions ?? [];
  } else {
    error.value = true;
  }
  loading.value = false;
});

const stateMap = computed(() => {
  const map = new Map<string, any>();
  for (const t of topics.value) {
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
  return level === 0 ? t("progress.kindergarten") : t("progress.grade", { level });
}

const levelColors: Record<string, string> = {
  primary: "bg-amber-400",
  intermediate: "bg-sky-400",
  standard: "bg-violet-500",
  advanced: "bg-emerald-500",
};

const LEVELS = ["primary", "intermediate", "standard", "advanced"] as const;
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">{{ t('progress.title') }}</h1>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{{ t('progress.loadingProgress') }}</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">{{ t('progress.loadError') }}</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">{{ t('progress.retry') }}</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="allTopics.length === 0" class="text-center py-12">
      <p class="text-gray-500 mb-4">{{ t('progress.noTopics') }}</p>
      <RouterLink to="/learn" class="text-blue-600 hover:underline text-sm">{{ t('progress.startLearning') }}</RouterLink>
    </div>

    <template v-else>
      <!-- Legend -->
      <div class="flex gap-6 mb-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-green-500" />
          <span class="text-gray-600">{{ t('progress.mastered') }}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-blue-500" />
          <span class="text-gray-600">{{ t('progress.inProgress') }}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-gray-200" />
          <span class="text-gray-600">{{ t('progress.notStarted') }}</span>
        </div>
      </div>

      <!-- Presentation Distribution -->
      <div v-if="distributions.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{{ t('progress.presentationLevel') }}</h2>
        <div class="space-y-3">
          <div
            v-for="dist in distributions"
            :key="dist.subjectId"
            class="bg-white rounded-lg border border-gray-200 p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-800">{{ dist.subjectName }}</span>
              <span class="text-xs text-gray-500">{{ dist.label }}</span>
            </div>
            <div class="flex h-3 rounded-full overflow-hidden bg-gray-100">
              <div
                v-for="level in LEVELS"
                :key="level"
                :class="levelColors[level]"
                :style="{ width: (dist.weights[level] * 100) + '%' }"
                class="transition-all duration-300"
                :title="t('progress.presentationLevels.' + level) + ': ' + Math.round(dist.weights[level] * 100) + '%'"
              />
            </div>
            <div class="flex justify-between mt-1.5 text-[10px] text-gray-400">
              <span v-for="level in LEVELS" :key="level">{{ t('progress.presentationLevels.' + level) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Topics by Grade -->
      <div v-for="[grade, gradeTopics] in topicsByGrade" :key="grade" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{{ gradeName(grade) }}</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div
            v-for="topic in gradeTopics"
            :key="topic.id"
            class="bg-white rounded-lg border border-gray-200 p-3 relative"
          >
            <div class="flex items-start gap-2">
              <div :class="statusColor(getStatus(topic.id))" class="w-2.5 h-2.5 rounded-full mt-1 shrink-0" />
              <div>
                <p class="text-sm font-medium text-gray-800 leading-tight">{{ topic.name }}</p>
                <p v-if="stateMap.get(topic.id)" class="text-xs text-gray-400 mt-1">
                  {{ t('progress.reviews', { count: stateMap.get(topic.id).reps }) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
