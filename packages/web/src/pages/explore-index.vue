<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useMeta } from "@/composables/useMeta";
import { useI18n } from "vue-i18n";
import type { Discipline } from "@learn/shared";

const api = useApi();
const auth = useAuth();
const { t } = useI18n();
const subjects = ref<(Discipline & { gradeRange?: string; topicCount?: number })[]>([]);
const loading = ref(true);
const error = ref(false);
const subjectProgress = ref<Map<string, { mastered: number; total: number; progress: number }>>(new Map());

onMounted(async () => {
  useMeta({
    title: "Explore Curriculum",
    description: "Browse our free, open math curriculum. See every topic, problem, and worked example — full transparency into how we teach.",
  });

  const result = await withErrorToast(() => api.getPublicSubjects(), "Failed to load subjects");
  if (result) {
    subjects.value = result.subjects;

    // Load per-subject mastery for authenticated users
    if (auth.isAuthenticated.value) {
      const statePromises = result.subjects.map((s) =>
        api.getUserGraphState(s.id).catch(() => null)
      );
      const states = await Promise.all(statePromises);
      for (let i = 0; i < result.subjects.length; i++) {
        const state = states[i];
        if (state) {
          subjectProgress.value.set(result.subjects[i].id, {
            mastered: state.summary.mastered,
            total: state.summary.total,
            progress: state.summary.progress,
          });
        }
      }
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

function gradeLabel(range: string) {
  return range || "All grades";
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ t('explore.curriculumTitle') }}</h1>
      <p class="text-gray-600 text-lg">
        Every topic, problem, and worked example — completely free and open.
        See exactly what your child will learn.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading subjects...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">Unable to load subjects.</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">{{ t('explore.retry') }}</button>
    </div>

    <!-- Empty -->
    <div v-else-if="subjects.length === 0" class="text-center py-12">
      <p class="text-gray-500">No subjects available yet. Content is being prepared.</p>
    </div>

    <!-- Subject cards -->
    <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="subject in subjects"
        :key="subject.id"
        :to="`/explore/${subject.id}`"
        class="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all group"
      >
        <div class="flex items-start justify-between mb-3">
          <h2 class="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {{ subject.name }}
          </h2>
          <span class="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded-full whitespace-nowrap">
            {{ gradeLabel(subject.gradeRange ?? '') }}
          </span>
        </div>
        <p class="text-gray-600 text-sm mb-4">{{ subject.description }}</p>
        <div class="flex items-center gap-4 text-sm text-gray-500">
          <span class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {{ subject.topicCount }} topics
          </span>
          <span class="text-blue-600 group-hover:underline ml-auto">Browse &rarr;</span>
        </div>
        <!-- User progress (authenticated only) -->
        <div v-if="subjectProgress.get(subject.id)" class="mt-3 pt-3 border-t border-gray-100">
          <div class="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span>{{ subjectProgress.get(subject.id)!.mastered }}/{{ subjectProgress.get(subject.id)!.total }} mastered</span>
          </div>
          <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-green-500 rounded-full transition-all"
              :style="{ width: `${Math.round(subjectProgress.get(subject.id)!.progress * 100)}%` }"
            />
          </div>
        </div>
      </RouterLink>
    </div>

    <!-- Info callout -->
    <div class="mt-10 bg-blue-50 border border-blue-200 rounded-lg p-5">
      <h3 class="font-semibold text-blue-900 mb-1">{{ t('explore.openByDesign') }}</h3>
      <p class="text-sm text-blue-800">
        All curriculum content is free to browse, audit, and
        <RouterLink to="/license" class="underline hover:text-blue-600">download</RouterLink>.
        We believe transparency builds trust.
        <RouterLink to="/how-we-teach" class="underline hover:text-blue-600">Learn about our teaching approach &rarr;</RouterLink>
      </p>
    </div>
  </div>
</template>
