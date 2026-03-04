<script setup lang="ts">
import { RouterView, RouterLink } from "vue-router";
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white border-b border-gray-200 px-6 py-3">
      <div class="max-w-7xl mx-auto flex items-center gap-6">
        <RouterLink to="/" class="text-xl font-bold text-blue-600">Learn</RouterLink>
        <RouterLink to="/learn" class="text-gray-600 hover:text-gray-900">Study</RouterLink>
        <RouterLink to="/progress" class="text-gray-600 hover:text-gray-900">Progress</RouterLink>
        <RouterLink to="/explore" class="text-gray-600 hover:text-gray-900">Explore</RouterLink>
      </div>
    </nav>
    <main class="max-w-7xl mx-auto px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
