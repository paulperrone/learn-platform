<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useMeta } from "@/composables/useMeta";
import { useI18n } from "vue-i18n";
import type { Discipline, Topic } from "@learn/shared";

const api = useApi();
const { t } = useI18n();
const disciplines = ref<(Discipline & { gradeRange?: string; topicCount?: number })[]>([]);
const selectedDiscipline = ref<string | null>(null);
const topics = ref<Topic[]>([]);
const prerequisites = ref<{ from: string; to: string; strength: number }[]>([]);
const loading = ref(true);
const loadingTopics = ref(false);
const error = ref(false);
const selectedGrade = ref<number | null>(null);

onMounted(async () => {
  useMeta({
    title: "Teach Mode",
    description: "Zero-setup classroom teaching tool. Browse topics, present lessons, and display problems — optimized for projection.",
  });

  const result = await withErrorToast(() => api.getPublicDisciplines(), "Failed to load disciplines");
  if (result) {
    disciplines.value = result.disciplines;
    if (result.disciplines.length === 1) {
      selectDiscipline(result.disciplines[0].id);
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

async function selectDiscipline(disciplineId: string) {
  selectedDiscipline.value = disciplineId;
  loadingTopics.value = true;
  selectedGrade.value = null;

  const result = await withErrorToast(() => api.getPublicGraph(disciplineId), "Failed to load topics");
  if (result) {
    topics.value = result.topics;
    prerequisites.value = result.prerequisites;
  }
  loadingTopics.value = false;
}

const gradeLevels = computed(() => {
  const grades = [...new Set(topics.value.map((t) => t.gradeLevel))].sort((a, b) => a - b);
  return grades;
});

const filteredTopics = computed(() => {
  if (selectedGrade.value === null) return topics.value;
  return topics.value.filter((t) => t.gradeLevel === selectedGrade.value);
});

const topicsByGrade = computed(() => {
  const groups = new Map<number, Topic[]>();
  for (const t of filteredTopics.value) {
    if (!groups.has(t.gradeLevel)) groups.set(t.gradeLevel, []);
    groups.get(t.gradeLevel)!.push(t);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
});

function gradeName(level: number) {
  return level === 0 ? t("progress.kindergarten") : t("progress.grade", { level });
}

function gradeShort(level: number) {
  return level === 0 ? "K" : `${level}`;
}

function getPrereqCount(topicId: string) {
  return prerequisites.value.filter((p) => p.to === topicId).length;
}

function getNextTopics(topicId: string) {
  const nextIds = prerequisites.value.filter((p) => p.from === topicId).map((p) => p.to);
  return topics.value.filter((t) => nextIds.includes(t.id));
}

const currentDiscipline = computed(() =>
  disciplines.value.find((s) => s.id === selectedDiscipline.value),
);
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-1">{{ t('teach.title') }}</h1>
      <p class="text-gray-500">Select a topic to present. No account required.</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">Unable to load disciplines.</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">{{ t('teach.retry') }}</button>
    </div>

    <template v-else>
      <!-- Discipline selector (if multiple) -->
      <div v-if="disciplines.length > 1 && !selectedDiscipline" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="discipline in disciplines"
          :key="discipline.id"
          @click="selectDiscipline(discipline.id)"
          class="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all text-left"
        >
          <h2 class="text-xl font-semibold text-gray-900 mb-1">{{ discipline.name }}</h2>
          <p class="text-sm text-gray-500">{{ discipline.gradeRange }} &middot; {{ discipline.topicCount }} topics</p>
        </button>
      </div>

      <!-- Topic browser -->
      <template v-if="selectedDiscipline">
        <!-- Back button (if multiple disciplines) -->
        <button
          v-if="disciplines.length > 1"
          @click="selectedDiscipline = null; topics = []; prerequisites = []"
          class="text-sm text-gray-500 hover:text-blue-600 mb-4 flex items-center gap-1"
        >
          &larr; {{ currentDiscipline?.name ?? "Back" }}
        </button>

        <!-- Loading topics -->
        <div v-if="loadingTopics" class="flex items-center gap-3 text-gray-400 py-12">
          <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading topics...</span>
        </div>

        <template v-else>
          <!-- Grade filter -->
          <div class="flex flex-wrap gap-2 mb-6">
            <button
              @click="selectedGrade = null"
              class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              :class="selectedGrade === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            >
              All grades
            </button>
            <button
              v-for="grade in gradeLevels"
              :key="grade"
              @click="selectedGrade = selectedGrade === grade ? null : grade"
              class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              :class="selectedGrade === grade ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            >
              {{ gradeName(grade) }}
            </button>
          </div>

          <!-- Topics grouped by grade -->
          <div v-for="[grade, gradeTopics] in topicsByGrade" :key="grade" class="mb-8">
            <h2 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">
                {{ gradeShort(grade) }}
              </span>
              {{ gradeName(grade) }}
              <span class="text-sm font-normal text-gray-400">({{ gradeTopics.length }})</span>
            </h2>

            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RouterLink
                v-for="topic in gradeTopics"
                :key="topic.id"
                :to="`/teach/${selectedDiscipline}/${topic.id}`"
                class="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <h3 class="font-medium text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
                  {{ topic.name }}
                </h3>
                <p class="text-sm text-gray-500 line-clamp-2 mb-2">{{ topic.description }}</p>
                <div class="flex items-center gap-2 text-xs text-gray-400">
                  <span v-if="topic.standardCode" class="font-mono">{{ topic.standardCode }}</span>
                  <span v-if="getPrereqCount(topic.id) > 0" class="text-orange-500">
                    {{ getPrereqCount(topic.id) }} prereq{{ getPrereqCount(topic.id) > 1 ? "s" : "" }}
                  </span>
                </div>
              </RouterLink>
            </div>
          </div>

          <div v-if="filteredTopics.length === 0" class="text-center py-12">
            <p class="text-gray-500">No topics match this filter.</p>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
