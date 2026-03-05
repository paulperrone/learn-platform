<script setup lang="ts">
import { RouterView, RouterLink, useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";
import ToastContainer from "./components/ToastContainer.vue";

const router = useRouter();
const { isAuthenticated, isChild, user, signOut } = useAuth();

async function handleLogout() {
  await signOut();
  router.push("/login");
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white border-b border-gray-200 px-6 py-3">
      <div class="max-w-7xl mx-auto flex items-center gap-6">
        <RouterLink to="/" class="text-xl font-bold text-blue-600">Learn</RouterLink>
        <template v-if="isAuthenticated">
          <RouterLink to="/learn" class="text-gray-600 hover:text-gray-900">Study</RouterLink>
          <RouterLink to="/progress" class="text-gray-600 hover:text-gray-900">Progress</RouterLink>
          <RouterLink to="/explore" class="text-gray-600 hover:text-gray-900">Explore</RouterLink>
          <RouterLink to="/graph" class="text-gray-600 hover:text-gray-900">Graph</RouterLink>
          <RouterLink v-if="!isChild" to="/family" class="text-gray-600 hover:text-gray-900">Family</RouterLink>
          <RouterLink v-if="(user as any)?.role === 'admin'" to="/admin" class="text-gray-600 hover:text-gray-900">Admin</RouterLink>
          <div class="ml-auto flex items-center gap-4">
            <RouterLink to="/settings" class="text-gray-400 hover:text-gray-600" title="Settings" aria-label="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </RouterLink>
            <span class="text-sm text-gray-500">{{ user?.name }}</span>
            <button
              @click="handleLogout"
              class="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </template>
        <template v-else>
          <RouterLink to="/explore" class="text-gray-600 hover:text-gray-900">Explore</RouterLink>
          <RouterLink to="/how-we-teach" class="text-gray-600 hover:text-gray-900">How We Teach</RouterLink>
          <RouterLink to="/docs" class="text-gray-600 hover:text-gray-900">Research</RouterLink>
          <div class="ml-auto flex items-center gap-4">
            <RouterLink to="/login" class="text-sm text-gray-600 hover:text-gray-900">Sign in</RouterLink>
            <RouterLink to="/signup" class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Sign up</RouterLink>
          </div>
        </template>
      </div>
    </nav>
    <main class="max-w-7xl mx-auto px-6 py-8">
      <RouterView />
    </main>
    <ToastContainer />
  </div>
</template>
