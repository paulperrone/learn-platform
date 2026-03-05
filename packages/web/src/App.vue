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
          <RouterLink v-if="!isChild" to="/family" class="text-gray-600 hover:text-gray-900">Family</RouterLink>
          <RouterLink v-if="(user as any)?.role === 'admin'" to="/admin" class="text-gray-600 hover:text-gray-900">Admin</RouterLink>
          <div class="ml-auto flex items-center gap-4">
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
