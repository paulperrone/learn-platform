<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useMeta } from "@/composables/useMeta";
import type { Topic, Discipline } from "@learn/shared";

const route = useRoute();
const api = useApi();
const auth = useAuth();
const disciplineId = route.params.disciplineId as string;

const discipline = ref<(Discipline & { gradeRange?: string }) | null>(null);
const topics = ref<Topic[]>([]);
const prerequisites = ref<{ from: string; to: string; strength: number }[]>([]);
const loading = ref(true);
const error = ref(false);
const selectedGrade = ref<number | null>(null);
const topicStatusMap = ref<Map<string, "not-started" | "in-progress" | "mastered" | "frontier">>(new Map());
const masterySummary = ref<{ total: number; mastered: number; inProgress: number; frontier: number; progress: number } | null>(null);

onMounted(async () => {
  const [graphResult, topicsResult] = await Promise.all([
    withErrorToast(() => api.getPublicGraph(disciplineId), "Failed to load graph"),
    withErrorToast(() => api.getPublicTopics(disciplineId), "Failed to load topics"),
  ]);

  if (graphResult) {
    discipline.value = graphResult.discipline;
    topics.value = graphResult.topics;
    prerequisites.value = graphResult.prerequisites;

    useMeta({
      title: `${graphResult.discipline.name} — Explore`,
      description: `Browse ${graphResult.topics.length} topics in ${graphResult.discipline.name}. See prerequisites, grade levels, and how topics connect.`,
    });

    // Load user mastery state if authenticated
    if (auth.isAuthenticated.value) {
      const userState = await api.getUserGraphState(disciplineId).catch(() => null);
      if (userState) {
        masterySummary.value = userState.summary;
        for (const t of userState.topics) {
          topicStatusMap.value.set(t.id, t.status);
        }
      }
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

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
  return [...groups.entries()].sort(([a], [b]) => b - a);
});

function gradeName(level: number) {
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

function gradeShort(level: number) {
  return level === 0 ? "K" : `${level}`;
}

function getPrereqCount(topicId: string) {
  return prerequisites.value.filter((p) => p.to === topicId).length;
}

function getPrereqNames(topicId: string) {
  const prereqIds = prerequisites.value.filter((p) => p.to === topicId).map((p) => p.from);
  return prereqIds
    .map((id) => topics.value.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .slice(0, 5);
}

const maxDepth = computed(() => Math.max(...topics.value.map((t) => t.depth), 0));

function depthBar(depth: number) {
  return Math.round((depth / Math.max(maxDepth.value, 1)) * 100);
}

function topicStatus(topicId: string) {
  return topicStatusMap.value.get(topicId) ?? "not-started";
}

function statusBorderClass(topicId: string) {
  const s = topicStatus(topicId);
  if (s === "mastered") return "border-green-300 bg-green-50/30";
  if (s === "in-progress") return "border-blue-300 bg-blue-50/30";
  if (s === "frontier") return "border-amber-300 bg-amber-50/30";
  return "border-gray-200";
}
</script>

<template>
  <div>
    <!-- Breadcrumb -->
    <nav class="mb-4 text-sm text-gray-500">
      <RouterLink to="/explore" class="hover:text-blue-600">Explore</RouterLink>
      <span class="mx-2">/</span>
      <span class="text-gray-900">{{ discipline?.name ?? "..." }}</span>
    </nav>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading topics...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">Discipline not found or unavailable.</p>
      <RouterLink to="/explore" class="text-blue-600 hover:underline text-sm">&larr; Back to disciplines</RouterLink>
    </div>

    <template v-else-if="discipline">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ discipline.name }}</h1>
        <p class="text-gray-600">{{ discipline.description }}</p>
        <div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
          <span>{{ topics.length }} topics</span>
          <span>{{ discipline.gradeRange }}</span>
          <span>{{ prerequisites.length }} prerequisite connections</span>
        </div>
      </div>

      <!-- Mastery progress bar (authenticated only) -->
      <div v-if="masterySummary" class="mb-6 bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-700">Your Progress</span>
          <span class="text-sm text-gray-500">
            {{ masterySummary.mastered }}/{{ masterySummary.total }} mastered
          </span>
        </div>
        <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            class="h-full bg-green-500 rounded-full transition-all duration-500"
            :style="{ width: `${Math.round(masterySummary.progress * 100)}%` }"
          />
        </div>
        <div class="flex gap-4 mt-2 text-xs text-gray-500">
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-green-500" /> {{ masterySummary.mastered }} mastered
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-blue-500" /> {{ masterySummary.inProgress }} in progress
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-amber-500" /> {{ masterySummary.frontier }} ready to learn
          </span>
        </div>
      </div>

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
          <span class="text-sm font-normal text-gray-400">({{ gradeTopics.length }} topics)</span>
        </h2>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="topic in gradeTopics"
            :key="topic.id"
            :to="`/explore/${disciplineId}/${topic.id}`"
            class="rounded-lg border p-4 hover:shadow-sm transition-all group"
            :class="statusBorderClass(topic.id)"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <!-- Mastery status icon -->
                <span v-if="topicStatus(topic.id) === 'mastered'" class="text-green-600 shrink-0" title="Mastered">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                </span>
                <span v-else-if="topicStatus(topic.id) === 'in-progress'" class="text-blue-500 shrink-0" title="In progress">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" /></svg>
                </span>
                <span v-else-if="topicStatus(topic.id) === 'frontier'" class="text-amber-500 shrink-0" title="Ready to learn">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7" /></svg>
                </span>
                <h3 class="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {{ topic.name }}
                </h3>
              </div>
              <span v-if="topic.standardCode" class="text-xs font-mono text-gray-400 ml-2 shrink-0">
                {{ topic.standardCode }}
              </span>
            </div>
            <p class="text-sm text-gray-500 mb-3 line-clamp-2">{{ topic.description }}</p>
            <div class="flex items-center gap-3 text-xs text-gray-400">
              <!-- Depth indicator -->
              <div class="flex items-center gap-1.5 flex-1">
                <span>Depth {{ topic.depth }}</span>
                <div class="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-300 rounded-full" :style="{ width: depthBar(topic.depth) + '%' }" />
                </div>
              </div>
              <!-- Prereq count -->
              <span v-if="getPrereqCount(topic.id) > 0" class="text-orange-500">
                {{ getPrereqCount(topic.id) }} prereq{{ getPrereqCount(topic.id) > 1 ? "s" : "" }}
              </span>
            </div>
            <!-- Prereq names tooltip -->
            <div v-if="getPrereqCount(topic.id) > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="name in getPrereqNames(topic.id)"
                :key="name"
                class="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded"
              >
                {{ name }}
              </span>
              <span v-if="getPrereqCount(topic.id) > 5" class="text-xs text-gray-400">
                +{{ getPrereqCount(topic.id) - 5 }} more
              </span>
            </div>
          </RouterLink>
        </div>
      </div>

      <!-- Empty filter state -->
      <div v-if="filteredTopics.length === 0" class="text-center py-12">
        <p class="text-gray-500">No topics match this filter.</p>
      </div>
    </template>
  </div>
</template>
