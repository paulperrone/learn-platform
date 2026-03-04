<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useApi } from "@/composables/useApi";

const api = useApi();
const stats = ref({ mastered: 0, inProgress: 0, dueForReview: 0, total: 0 });
const frontier = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const [progressData, frontierData] = await Promise.all([
      api.getProgress(),
      api.getFrontier(),
    ]);
    stats.value = progressData;
    frontier.value = frontierData.topics.slice(0, 5);
  } catch (e) {
    console.error("Failed to load dashboard:", e);
  } finally {
    loading.value = false;
  }
});

const progressPercent = () =>
  stats.value.total > 0
    ? Math.round((stats.value.mastered / stats.value.total) * 100)
    : 0;
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">Mastered</p>
          <p class="text-3xl font-bold text-green-600">{{ stats.mastered }}</p>
          <p class="text-xs text-gray-400 mt-1">of {{ stats.total }} topics</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">In Progress</p>
          <p class="text-3xl font-bold text-blue-600">{{ stats.inProgress }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">Due for Review</p>
          <p class="text-3xl font-bold text-orange-600">{{ stats.dueForReview }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <p class="text-sm text-gray-500">Overall Progress</p>
          <p class="text-3xl font-bold text-purple-600">{{ progressPercent() }}%</p>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-8">
        <div class="flex justify-between text-sm text-gray-600 mb-2">
          <span>Math K-5 Progress</span>
          <span>{{ stats.mastered }}/{{ stats.total }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-green-500 h-3 rounded-full transition-all duration-500"
            :style="{ width: progressPercent() + '%' }"
          />
        </div>
      </div>

      <!-- Start Learning -->
      <div class="flex gap-4 mb-8">
        <RouterLink
          to="/learn"
          class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Start Learning
        </RouterLink>
        <RouterLink
          to="/explore"
          class="inline-block border border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Explore Graph
        </RouterLink>
      </div>

      <!-- Ready to Learn -->
      <div v-if="frontier.length > 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 class="font-semibold text-gray-700 mb-3">Ready to Learn</h2>
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
    </template>
  </div>
</template>
