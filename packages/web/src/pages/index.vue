<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useI18n } from "vue-i18n";
import type { TodayProgress, WeeklySummary, StreakInfo, DailyActivityDay, CompletionEstimate } from "@learn/shared";

const api = useApi();
const { t } = useI18n();
const stats = ref({ mastered: 0, inProgress: 0, dueForReview: 0, total: 0 });
const frontier = ref<any[]>([]);
const todayProgress = ref<TodayProgress | null>(null);
const weeklySummary = ref<WeeklySummary | null>(null);
const streakInfo = ref<StreakInfo | null>(null);
const activityHistory = ref<DailyActivityDay[]>([]);
const completionEstimates = ref<CompletionEstimate[]>([]);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [progressData, frontierData, todayData, weeklyData, streakData, historyData, completionData] = await Promise.all([
      api.getProgress(),
      api.getFrontier(),
      api.getTodayProgress(today),
      api.getWeeklySummary(today),
      api.getStreakInfo(today),
      api.getActivityHistory(84),
      api.getCompletionEstimates(),
    ]);
    return { progressData, frontierData, todayData, weeklyData, streakData, historyData, completionData };
  }, t("errors.failedToLoad", { resource: "dashboard" }));

  if (result) {
    stats.value = result.progressData;
    frontier.value = result.frontierData.topics.slice(0, 5);
    todayProgress.value = result.todayData;
    weeklySummary.value = result.weeklyData;
    streakInfo.value = result.streakData;
    activityHistory.value = result.historyData.days;
    completionEstimates.value = result.completionData.estimates;
  } else {
    error.value = true;
  }
  loading.value = false;
});

const progressPercent = () =>
  stats.value.total > 0
    ? Math.round((stats.value.mastered / stats.value.total) * 100)
    : 0;

const goalPercent = computed(() =>
  todayProgress.value ? Math.round(todayProgress.value.progress * 100) : 0
);

// SVG ring constants
const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;
const ringOffset = computed(() => RING_C * (1 - (todayProgress.value?.progress ?? 0)));

// Contribution graph: 12 weeks grid
const contributionWeeks = computed(() => {
  const map = new Map<string, DailyActivityDay>();
  for (const day of activityHistory.value) {
    map.set(day.date, day);
  }

  const weeks: { date: string; level: number }[][] = [];
  const today = new Date();
  // Start from 83 days ago (12 weeks = 84 days including today)
  const start = new Date(today);
  start.setDate(start.getDate() - 83);
  // Align to start of week (Sunday)
  start.setDate(start.getDate() - start.getDay());

  let currentWeek: { date: string; level: number }[] = [];
  const d = new Date(start);
  while (d <= today) {
    const dateStr = d.toISOString().slice(0, 10);
    const day = map.get(dateStr);
    let level = 0;
    if (day) {
      if (day.goalMet) level = 3;
      else if (day.minutesActive > 0 || day.problemsCompleted > 0) level = day.minutesActive >= 10 || day.problemsCompleted >= 5 ? 2 : 1;
    }
    currentWeek.push({ date: dateStr, level });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    d.setDate(d.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);
  return weeks;
});

const cellColor = (level: number) => {
  switch (level) {
    case 0: return "bg-gray-100";
    case 1: return "bg-green-200";
    case 2: return "bg-green-400";
    case 3: return "bg-green-600";
    default: return "bg-gray-100";
  }
};

const milestoneMessage = computed(() => {
  if (!streakInfo.value?.milestoneReached) return null;
  const key = `dashboard.streakMilestone${streakInfo.value.milestoneReached}`;
  return t(key);
});

const progressMilestone = computed(() => {
  const est = completionEstimates.value[0];
  if (!est?.milestoneReached) return null;
  return t(`completion.milestone${est.milestoneReached}`);
});
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
      <!-- Daily Goal + Weekly Summary -->
      <div v-if="todayProgress" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <!-- Daily Goal Ring -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center gap-6">
          <div class="relative shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" :r="RING_R" fill="none" stroke="#e5e7eb" stroke-width="8" />
              <circle
                cx="50" cy="50" :r="RING_R" fill="none"
                :stroke="todayProgress.goalMet ? '#22c55e' : '#3b82f6'"
                stroke-width="8" stroke-linecap="round"
                :stroke-dasharray="RING_C"
                :stroke-dashoffset="ringOffset"
                transform="rotate(-90 50 50)"
                class="transition-all duration-700"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-lg font-bold" :class="todayProgress.goalMet ? 'text-green-600' : 'text-blue-600'">{{ goalPercent }}%</span>
            </div>
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-gray-800">{{ t('dashboard.dailyGoal') }}</p>
            <p v-if="todayProgress.goalMet" class="text-green-600 font-medium text-sm mt-1">{{ t('dashboard.goalCelebration') }}</p>
            <p v-else class="text-sm text-gray-500 mt-1">
              {{ t('dashboard.goalProgress', {
                current: todayProgress.current,
                target: todayProgress.goal.target,
                unit: t(todayProgress.goal.type === 'minutes' ? 'dashboard.goalMinutes' : 'dashboard.goalProblems')
              }) }}
            </p>
            <RouterLink to="/settings" class="text-xs text-blue-500 hover:underline mt-2 inline-block">{{ t('dashboard.configureGoal') }}</RouterLink>
          </div>
        </div>

        <!-- Weekly Summary -->
        <div v-if="weeklySummary" class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="font-semibold text-gray-800 mb-3">{{ t('dashboard.weeklySummary') }}</p>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-gray-500">{{ t('dashboard.activeDays', { count: weeklySummary.activeDays }) }}</p>
            </div>
            <div>
              <p class="text-gray-500">{{ t('dashboard.goalMetDays', { count: weeklySummary.goalMetDays }) }}</p>
            </div>
            <div>
              <p class="text-gray-500">{{ t('dashboard.weeklyMinutes', { count: weeklySummary.totalMinutes }) }}</p>
            </div>
            <div>
              <p class="text-gray-500">{{ t('dashboard.weeklyProblems', { count: weeklySummary.totalProblems }) }}</p>
            </div>
          </div>
          <p v-if="weeklySummary.totalTopicsMastered > 0" class="text-sm text-green-600 mt-2 font-medium">
            {{ t('dashboard.weeklyTopics', { count: weeklySummary.totalTopicsMastered }) }}
          </p>
        </div>
      </div>

      <!-- Streak & Contribution Graph -->
      <div v-if="streakInfo" class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 mb-8">
        <!-- Streak Counter -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex flex-col items-center justify-center min-w-[140px]">
          <div class="text-4xl font-bold" :class="streakInfo.currentStreak > 0 ? 'text-orange-500' : 'text-gray-300'">
            {{ streakInfo.currentStreak }}
          </div>
          <p class="text-sm font-medium text-gray-600 mt-1">
            {{ streakInfo.currentStreak > 0 ? t('dashboard.streakCounter', { count: streakInfo.currentStreak }) : t('dashboard.noStreak') }}
          </p>
          <p v-if="streakInfo.longestStreak > streakInfo.currentStreak" class="text-xs text-gray-400 mt-1">
            {{ t('dashboard.longestStreak', { count: streakInfo.longestStreak }) }}
          </p>
        </div>

        <!-- Contribution Graph -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="font-semibold text-gray-800 mb-3">{{ t('dashboard.contributionGraph') }}</p>
          <div class="flex gap-[3px] overflow-x-auto">
            <div v-for="(week, wi) in contributionWeeks" :key="wi" class="flex flex-col gap-[3px]">
              <div
                v-for="(day, di) in week" :key="di"
                :class="[cellColor(day.level), 'w-3 h-3 rounded-sm']"
                :title="`${day.date}: ${day.level === 0 ? 'No activity' : day.level === 3 ? 'Goal met' : 'Active'}`"
              />
            </div>
          </div>
          <div class="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <span>{{ t('dashboard.less') }}</span>
            <div class="w-3 h-3 rounded-sm bg-gray-100" />
            <div class="w-3 h-3 rounded-sm bg-green-200" />
            <div class="w-3 h-3 rounded-sm bg-green-400" />
            <div class="w-3 h-3 rounded-sm bg-green-600" />
            <span>{{ t('dashboard.more') }}</span>
          </div>
        </div>
      </div>

      <!-- Streak Milestone -->
      <div v-if="milestoneMessage" class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-800">
        {{ milestoneMessage }}
      </div>

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

      <!-- Completion Estimate -->
      <div v-if="completionEstimates.length > 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-8">
        <div v-for="est in completionEstimates" :key="est.disciplineId">
          <div class="flex justify-between items-baseline mb-2">
            <span class="font-semibold text-gray-800">{{ est.disciplineName }}</span>
            <span class="text-sm text-gray-500">
              {{ t('completion.progress', { mastered: est.mastered, total: est.total }) }}
            </span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-3">
            <div
              class="h-2.5 rounded-full transition-all duration-700"
              :class="est.percentComplete >= 100 ? 'bg-green-500' : 'bg-blue-500'"
              :style="{ width: est.percentComplete + '%' }"
            />
          </div>
          <div class="flex items-center gap-4 text-sm">
            <span v-if="est.topicsMasteredPerWeek > 0" class="text-gray-500">
              {{ t('completion.pace', { rate: est.topicsMasteredPerWeek }) }}
            </span>
            <span v-if="est.estimatedWeeksRemaining != null" class="text-blue-600 font-medium">
              {{ t('completion.estimate', { weeks: est.estimatedWeeksRemaining }) }}
            </span>
            <span v-else-if="est.percentComplete < 100" class="text-gray-400 text-xs">
              {{ t('completion.noPace') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Progress Milestone -->
      <div v-if="progressMilestone" class="bg-green-50 border border-green-200 rounded-lg p-4 mb-8 text-sm text-green-800 font-medium">
        {{ progressMilestone }}
      </div>

      <!-- Diagnostic CTA -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-8 flex items-center justify-between">
        <div>
          <p class="font-semibold text-blue-800">{{ t('dashboard.diagnosticTitle') }}</p>
          <p class="text-sm text-blue-700 mt-1">{{ t('dashboard.diagnosticDescription') }}</p>
        </div>
        <RouterLink
          to="/diagnostic/math-foundations"
          class="shrink-0 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
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
