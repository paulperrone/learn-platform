<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useI18n } from "vue-i18n";

const api = useApi();
const { t } = useI18n();
const disciplines = ref<any[]>([]);
const selectedDiscipline = ref("");
const topics = ref<any[]>([]);
const allTopics = ref<any[]>([]);
const distributions = ref<any[]>([]);
const calibration = ref<{
  overallAccuracy: number | null;
  totalRatedReviews: number;
  misconceptionCount: number;
  trend: { accuracy: number; window: number }[];
} | null>(null);
const loading = ref(true);
const error = ref(false);

async function loadDisciplineData(disciplineId: string) {
  const topicsData = await api.getTopics(disciplineId);
  allTopics.value = topicsData.topics;
}

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const [discData, statesData, presData, calData] = await Promise.all([
      api.getDisciplines(),
      api.getTopicStates(),
      api.getPresentationDistributions(),
      api.getCalibration(),
    ]);
    return { discData, statesData, presData, calData };
  }, t("errors.failedToLoad", { resource: "progress" }));

  if (result) {
    disciplines.value = result.discData.disciplines;
    topics.value = result.statesData.topics;
    distributions.value = result.presData?.distributions ?? [];
    calibration.value = result.calData;
    // Default to first discipline with topics
    const first = disciplines.value[0];
    if (first) {
      selectedDiscipline.value = first.id;
      await loadDisciplineData(first.id);
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

watch(selectedDiscipline, async (id) => {
  if (id) await loadDisciplineData(id);
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
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold">{{ t('progress.title') }}</h1>
      <div class="flex gap-2">
        <RouterLink
          :to="`/report/${selectedDiscipline}`"
          class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
        >
          View Report
        </RouterLink>
        <RouterLink
          to="/assess"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Take a Test
        </RouterLink>
      </div>
    </div>

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
      <RouterLink to="/queue" class="text-blue-600 hover:underline text-sm">{{ t('progress.startLearning') }}</RouterLink>
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
            :key="dist.disciplineId"
            class="bg-white rounded-lg border border-gray-200 p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-800">{{ dist.disciplineName }}</span>
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

      <!-- Confidence Calibration -->
      <div v-if="calibration && calibration.overallAccuracy != null" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">{{ t('progress.calibration.title') }}</h2>
        <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-2xl font-bold text-gray-900">
                {{ Math.round(calibration.overallAccuracy * 100) }}%
              </p>
              <p class="text-sm text-gray-500">{{ t('progress.calibration.accuracy') }}</p>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-600">
                {{ t('progress.calibration.totalReviews', { count: calibration.totalRatedReviews }) }}
              </p>
              <p v-if="calibration.misconceptionCount > 0" class="text-sm text-red-500 font-medium">
                {{ t('progress.calibration.misconceptions', { count: calibration.misconceptionCount }) }}
              </p>
            </div>
          </div>

          <!-- Calibration trend bars -->
          <div v-if="calibration.trend.length > 1" class="space-y-1.5">
            <p class="text-xs text-gray-400 font-medium">{{ t('progress.calibration.trend') }}</p>
            <div class="flex items-end gap-1 h-12">
              <div
                v-for="point in calibration.trend"
                :key="point.window"
                class="flex-1 rounded-t transition-all"
                :class="point.accuracy >= 0.7 ? 'bg-green-400' : point.accuracy >= 0.5 ? 'bg-amber-400' : 'bg-red-400'"
                :style="{ height: Math.max(4, point.accuracy * 48) + 'px' }"
                :title="Math.round(point.accuracy * 100) + '%'"
              />
            </div>
            <div class="flex justify-between text-[10px] text-gray-400">
              <span>{{ t('progress.calibration.earlier') }}</span>
              <span>{{ t('progress.calibration.recent') }}</span>
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
