<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useAnonymous } from "../composables/useAnonymous";
import { useApi, withErrorToast } from "../composables/useApi";

const router = useRouter();
const { signUp } = useAuth();
const anon = useAnonymous();
const api = useApi();

const name = ref("");
const email = ref("");
const password = ref("");
const birthYear = ref<number | undefined>(undefined);
const error = ref("");
const loading = ref(false);

const currentYear = new Date().getFullYear();

async function handleSubmit() {
  error.value = "";
  loading.value = true;

  const result = await signUp(email.value, password.value, name.value, birthYear.value);

  if (result.error) {
    error.value = result.error.message ?? "Sign up failed";
    loading.value = false;
    return;
  }

  // Merge anonymous data if any
  if (anon.hasProgress.value) {
    await withErrorToast(
      () => api.mergeAnonymousData(anon.token.value),
      "Failed to merge guest progress"
    );
    anon.clearOnMerge();
  }

  // Route to onboarding for new users
  router.push("/onboarding");
}
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-900">Create Account</h1>
        <p class="mt-1 text-sm text-gray-500">Start your learning journey</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {{ error }}
        </div>

        <div>
          <label for="name" class="block text-sm font-medium text-gray-700">Name</label>
          <input
            id="name"
            v-model="name"
            type="text"
            required
            autocomplete="name"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p class="mt-1 text-xs text-gray-400">At least 8 characters</p>
        </div>

        <div>
          <label for="birthYear" class="block text-sm font-medium text-gray-700">Birth Year <span class="text-gray-400">(optional)</span></label>
          <input
            id="birthYear"
            v-model.number="birthYear"
            type="number"
            :min="currentYear - 120"
            :max="currentYear"
            placeholder="e.g. 2015"
            autocomplete="off"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {{ loading ? "Creating account..." : "Create Account" }}
        </button>
      </form>

      <p class="text-center text-sm text-gray-500">
        Already have an account?
        <RouterLink to="/login" class="font-medium text-blue-600 hover:text-blue-500">Sign in</RouterLink>
      </p>
    </div>
  </div>
</template>
