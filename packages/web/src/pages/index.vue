<script setup lang="ts">
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-4">Dashboard</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-gray-700">Topics Mastered</h2>
        <p class="text-4xl font-bold text-green-600 mt-2">0</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-gray-700">Due for Review</h2>
        <p class="text-4xl font-bold text-orange-600 mt-2">0</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-gray-700">Streak</h2>
        <p class="text-4xl font-bold text-blue-600 mt-2">0 days</p>
      </div>
    </div>
    <div class="mt-8">
      <RouterLink
        to="/learn"
        class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700"
      >
        Start Learning
      </RouterLink>
    </div>
  </div>
</template>
