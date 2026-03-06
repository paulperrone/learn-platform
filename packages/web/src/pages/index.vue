<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useI18n } from "vue-i18n";

const api = useApi();
const { isAuthenticated } = useAuth();
const { t } = useI18n();
const stats = ref({ mastered: 0, inProgress: 0, dueForReview: 0, total: 0 });
const frontier = ref<any[]>([]);
const loading = ref(true);
const error = ref(false);
const showDiagnosticCta = ref(false);

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const fetches: [Promise<any>, Promise<any>, Promise<any> | null] = [
      api.getProgress(),
      api.getFrontier(),
      null,
    ];
    if (isAuthenticated.value) {
      fetches[2] = api.getOnboarding().catch(() => null);
    }
    const [progressData, frontierData, onboarding] = await Promise.all(fetches);
    return { progressData, frontierData, onboarding };
  }, t("errors.failedToLoad", { resource: "dashboard" }));

  if (result) {
    stats.value = result.progressData;
    frontier.value = result.frontierData.topics.slice(0, 5);
    if (result.onboarding && !result.onboarding.diagnosticSessionId) {
      showDiagnosticCta.value = true;
    }
  } else {
    error.value = true;
  }
  loading.value = false;
});

const progressPercent = () =>
  stats.value.total > 0
    ? Math.round((stats.value.mastered / stats.value.total) * 100)
    : 0;
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">{{ t('dashboard.title') }}</h1>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{{ t('dashboard.loadingDashboard') }}</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">{{ t('dashboard.loadError') }}</p>
      <button @click="$router.go(0)" class="text-blue-600 hover:underline text-sm">{{ t('dashboard.retry') }}</button>
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">{{ t('dashboard.mastered') }}</p>
          <p class="text-3xl font-bold text-green-600">{{ stats.mastered }}</p>
          <p class="text-xs text-gray-400 mt-1">{{ t('dashboard.ofTopics', { total: stats.total }) }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">{{ t('dashboard.inProgress') }}</p>
          <p class="text-3xl font-bold text-blue-600">{{ stats.inProgress }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">{{ t('dashboard.dueForReview') }}</p>
          <p class="text-3xl font-bold text-orange-600">{{ stats.dueForReview }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">{{ t('dashboard.overallProgress') }}</p>
          <p class="text-3xl font-bold text-purple-600">{{ progressPercent() }}%</p>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-8">
        <div class="flex justify-between text-sm text-gray-600 mb-2">
          <span>{{ t('dashboard.mathProgress') }}</span>
          <span>{{ stats.mastered }}/{{ stats.total }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-green-500 h-3 rounded-full transition-all duration-500"
            :style="{ width: progressPercent() + '%' }"
          />
        </div>
      </div>

      <!-- Diagnostic CTA -->
      <div v-if="showDiagnosticCta" class="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-8 flex items-center justify-between">
        <div>
          <p class="font-semibold text-amber-800">{{ t('dashboard.diagnosticTitle') }}</p>
          <p class="text-sm text-amber-700 mt-1">{{ t('dashboard.diagnosticDescription') }}</p>
        </div>
        <RouterLink
          to="/onboarding?diagnostic=1"
          class="shrink-0 bg-amber-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors"
        >
          {{ t('dashboard.takeDiagnostic') }}
        </RouterLink>
      </div>

      <!-- Start Learning -->
      <div class="flex gap-4 mb-8">
        <RouterLink
          to="/learn"
          class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          {{ t('dashboard.startLearning') }}
        </RouterLink>
        <RouterLink
          to="/explore"
          class="inline-block border border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          {{ t('dashboard.exploreGraph') }}
        </RouterLink>
      </div>

      <!-- Ready to Learn -->
      <div v-if="frontier.length > 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 class="font-semibold text-gray-700 mb-3">{{ t('dashboard.readyToLearn') }}</h2>
        <div class="space-y-2">
          <div
            v-for="topic in frontier"
            :key="topic.id"
            class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50"
          >
            <div class="w-2 h-2 rounded-full bg-blue-400" />
            <div>
              <p class="font-medium text-gray-800">{{ topic.name }}</p>
              <p class="text-sm text-gray-500">{{ topic.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state when all topics mastered -->
      <div v-else class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
        <p class="text-gray-500">{{ t('dashboard.allMastered') }}</p>
      </div>
    </template>
  </div>
</template>
