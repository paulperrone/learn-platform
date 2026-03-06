<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useI18n } from "vue-i18n";

const router = useRouter();
const { signIn } = useAuth();
const { t } = useI18n();

const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function handleSubmit() {
  error.value = "";
  loading.value = true;

  const result = await signIn(email.value, password.value);

  if (result.error) {
    error.value = result.error.message ?? t("auth.signInFailed");
    loading.value = false;
    return;
  }

  router.push("/");
}
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-900">{{ t('auth.signInTitle') }}</h1>
        <p class="mt-1 text-sm text-gray-500">{{ t('auth.signInWelcome') }}</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {{ error }}
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-gray-700">{{ t('auth.email') }}</label>
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
          <label for="password" class="block text-sm font-medium text-gray-700">{{ t('auth.password') }}</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {{ loading ? t('auth.signingIn') : t('auth.signInTitle') }}
        </button>
      </form>

      <p class="text-center text-sm text-gray-500">
        {{ t('auth.noAccount') }}
        <RouterLink to="/signup" class="font-medium text-blue-600 hover:text-blue-500">{{ t('nav.signUp') }}</RouterLink>
      </p>
    </div>
  </div>
</template>
