<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useApi } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useI18n } from "vue-i18n";

const router = useRouter();
const api = useApi();
const { user } = useAuth();
const { t } = useI18n();

const loading = ref(true);
const sessions = ref<any[]>([]);
const showCreateModal = ref(false);
const creating = ref(false);
const joinCode = ref("");
const joining = ref(false);
const joinError = ref("");

const activeSessions = computed(() => sessions.value.filter((s) => s.status === "active"));
const pastSessions = computed(() => sessions.value.filter((s) => s.status === "completed"));

async function loadSessions() {
  loading.value = true;
  try {
    const data = await api.listGroupSessions();
    sessions.value = data.sessions;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function createSession(type: "family" | "classroom" | "peer-pair") {
  creating.value = true;
  try {
    const result = await api.createGroupSession({ type });
    showCreateModal.value = false;
    router.push(`/group/${result.sessionId}`);
  } catch {
    // ignore
  } finally {
    creating.value = false;
  }
}

async function joinSession() {
  if (!joinCode.value.trim()) return;
  joining.value = true;
  joinError.value = "";
  try {
    const result = await api.joinGroupSession(joinCode.value.trim().toUpperCase());
    router.push(`/group/${result.sessionId}`);
  } catch (e: any) {
    joinError.value = e.message ?? "Could not join session";
  } finally {
    joining.value = false;
  }
}

onMounted(loadSessions);
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Group Learning</h1>

    <!-- Join by code -->
    <div class="mb-8 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Join a Session</h2>
      <form class="flex gap-3" @submit.prevent="joinSession">
        <input
          v-model="joinCode"
          type="text"
          placeholder="Enter join code (e.g. ABC123)"
          class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-center font-mono text-lg uppercase tracking-widest dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          maxlength="6"
        />
        <button
          type="submit"
          :disabled="joining || !joinCode.trim()"
          class="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {{ joining ? "Joining..." : "Join" }}
        </button>
      </form>
      <p v-if="joinError" class="mt-2 text-sm text-red-500">{{ joinError }}</p>
    </div>

    <!-- Create new session -->
    <div class="mb-8">
      <h2 class="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Start a Group Session</h2>
      <div class="grid gap-4 sm:grid-cols-3">
        <button
          class="rounded-xl border-2 border-gray-200 p-6 text-left transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:hover:border-blue-500"
          @click="createSession('family')"
          :disabled="creating"
        >
          <div class="mb-2 text-2xl">&#x1F3E0;</div>
          <h3 class="font-semibold text-gray-900 dark:text-white">Family Co-Learning</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Learn together with your children. Each child gets problems at their level.
          </p>
        </button>

        <button
          class="rounded-xl border-2 border-gray-200 p-6 text-left transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:hover:border-blue-500"
          @click="createSession('classroom')"
          :disabled="creating"
        >
          <div class="mb-2 text-2xl">&#x1F3EB;</div>
          <h3 class="font-semibold text-gray-900 dark:text-white">Connected Classroom</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Project lessons while students practice on their devices. Real-time progress dashboard.
          </p>
        </button>

        <button
          class="rounded-xl border-2 border-gray-200 p-6 text-left transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:hover:border-blue-500"
          @click="createSession('peer-pair')"
          :disabled="creating"
        >
          <div class="mb-2 text-2xl">&#x1F91D;</div>
          <h3 class="font-semibold text-gray-900 dark:text-white">Peer Pair</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Two students alternate steps on problems, explaining as they go.
          </p>
        </button>
      </div>
    </div>

    <!-- Active sessions -->
    <div v-if="activeSessions.length > 0" class="mb-8">
      <h2 class="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Active Sessions</h2>
      <div class="space-y-3">
        <router-link
          v-for="s in activeSessions"
          :key="s.id"
          :to="`/group/${s.id}`"
          class="block rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-750"
        >
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ s.type === "family" ? "Family" : s.type === "classroom" ? "Classroom" : "Peer Pair" }}
              </span>
              <span v-if="s.joinCode" class="ml-3 rounded bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {{ s.joinCode }}
              </span>
            </div>
            <span class="text-sm text-gray-500">{{ new Date(s.startedAt).toLocaleString() }}</span>
          </div>
        </router-link>
      </div>
    </div>

    <!-- Past sessions -->
    <div v-if="pastSessions.length > 0">
      <h2 class="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">Past Sessions</h2>
      <div class="space-y-2">
        <div
          v-for="s in pastSessions"
          :key="s.id"
          class="rounded-lg border border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          {{ s.type === "family" ? "Family" : s.type === "classroom" ? "Classroom" : "Peer Pair" }}
          &mdash; {{ new Date(s.startedAt).toLocaleDateString() }}
        </div>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center text-gray-400">Loading...</div>
    <div v-else-if="sessions.length === 0 && !loading" class="py-12 text-center text-gray-400">
      No group sessions yet. Start one above or join with a code.
    </div>
  </div>
</template>
