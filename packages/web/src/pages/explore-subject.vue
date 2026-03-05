<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useMeta } from "@/composables/useMeta";
import type { Topic, Subject } from "@learn/shared";

const route = useRoute();
const api = useApi();
const subjectId = route.params.subjectId as string;

const subject = ref<Subject | null>(null);
const topics = ref<Topic[]>([]);
const prerequisites = ref<{ from: string; to: string; strength: number }[]>([]);
const loading = ref(true);
const error = ref(false);
const selectedGrade = ref<number | null>(null);

onMounted(async () => {
  const [graphResult, topicsResult] = await Promise.all([
    withErrorToast(() => api.getPublicGraph(subjectId), "Failed to load graph"),
    withErrorToast(() => api.getPublicTopics(subjectId), "Failed to load topics"),
  ]);

  if (graphResult) {
    subject.value = graphResult.subject;
    topics.value = graphResult.topics;
    prerequisites.value = graphResult.prerequisites;

    useMeta({
      title: `${graphResult.subject.name} — Explore`,
      description: `Browse ${graphResult.topics.length} topics in ${graphResult.subject.name}. See prerequisites, grade levels, and how topics connect.`,
    });
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
  return [...groups.entries()].sort(([a], [b]) => a - b);
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
</script>

<template>
  <div>
    <!-- Breadcrumb -->
    <nav class="mb-4 text-sm text-gray-500">
      <RouterLink to="/explore" class="hover:text-blue-600">Explore</RouterLink>
      <span class="mx-2">/</span>
      <span class="text-gray-900">{{ subject?.name ?? "..." }}</span>
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
      <p class="text-gray-500 mb-4">Subject not found or unavailable.</p>
      <RouterLink to="/explore" class="text-blue-600 hover:underline text-sm">&larr; Back to subjects</RouterLink>
    </div>

    <template v-else-if="subject">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ subject.name }}</h1>
        <p class="text-gray-600">{{ subject.description }}</p>
        <div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
          <span>{{ topics.length }} topics</span>
          <span>{{ subject.gradeRange }}</span>
          <span>{{ prerequisites.length }} prerequisite connections</span>
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
            :to="`/explore/${subjectId}/${topic.id}`"
            class="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
          >
            <div class="flex items-start justify-between mb-2">
              <h3 class="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                {{ topic.name }}
              </h3>
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
