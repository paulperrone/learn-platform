<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useApi, withErrorToast, ApiError } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useAnonymous } from "@/composables/useAnonymous";
import { useSpeech } from "@/composables/useSpeech";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import ProblemView from "@/components/ProblemView.vue";
import WorkedExample from "@/components/WorkedExample.vue";
import MasteryCelebration from "@/components/MasteryCelebration.vue";
import { useI18n } from "vue-i18n";

const api = useApi();
const auth = useAuth();
const anon = useAnonymous();
const speech = useSpeech();
const speechPrefs = useSpeechPrefs();
const { t } = useI18n();

speechPrefs.load();

const sessionId = ref<string | null>(null);
const currentItem = ref<any>(null);
const loading = ref(false);
const sessionActive = ref(false);
const recovering = ref(true);
const isAnonymous = ref(false);
const masteryEvent = ref<{ topicId: string; topicName: string; unlockedTopics: { id: string; name: string }[] } | null>(null);
const goalProgress = ref<{
  problemsCompleted: number;
  minutesActive: number;
  topicsMastered: number;
  goalMet: boolean;
  goalJustCompleted: boolean;
  goalType: "minutes" | "problems";
  goalTarget: number;
  progress: number;
} | null>(null);

// Auto-read problem when it appears and ttsAutoRead is enabled
watch(
  () => currentItem.value?.problem?.question,
  (question) => {
    if (question && speechPrefs.ttsAutoRead.value && speech.supported.value) {
      speech.speak(question);
    }
  },
);

onMounted(async () => {
  // Wait for auth to resolve
  await new Promise<void>((resolve) => {
    if (!auth.isPending.value) return resolve();
    const stop = watch(() => auth.isPending.value, (v) => {
      if (!v) { stop(); resolve(); }
    });
  });

  if (auth.isAuthenticated.value) {
    // Authenticated user — check for active session
    const result = await withErrorToast(
      () => api.getActiveSession(),
      t("errors.failedToLoad", { resource: "session" })
    );
    if (result?.active) {
      sessionId.value = result.sessionId;
      currentItem.value = result.currentItem;
      sessionActive.value = true;
    }
  } else {
    // Anonymous user — check for active anonymous session
    isAnonymous.value = true;
    const result = await withErrorToast(
      () => api.getActiveAnonymousSession(anon.token.value),
      t("errors.failedToLoad", { resource: "session" })
    );
    if (result?.active) {
      sessionId.value = result.sessionId;
      currentItem.value = result.currentItem;
      sessionActive.value = true;
    }
  }
  recovering.value = false;
});

async function startSession() {
  loading.value = true;
  let result;
  if (isAnonymous.value) {
    result = await withErrorToast(
      () => api.startAnonymousSession(anon.token.value),
      t("errors.failedToStart", { action: "session" })
    );
  } else {
    result = await withErrorToast(
      () => api.startSession(),
      t("errors.failedToStart", { action: "session" })
    );
  }
  if (result) {
    sessionId.value = result.sessionId;
    currentItem.value = result.firstItem;
    sessionActive.value = result.firstItem.type !== "complete";
  }
  loading.value = false;
}

async function handleProblemSubmit(data: {
  answer: string;
  correct: boolean;
  confidence?: number;
  responseMs: number;
}) {
  if (!sessionId.value) return;
  loading.value = true;
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, data),
    t("errors.failedToSubmit", { action: "response" })
  );
  if (result) {
    // Show mastery celebration if topic was just mastered
    if (result.masteryEvent) {
      masteryEvent.value = result.masteryEvent;
    }
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
    // Track anonymous progress client-side
    if (isAnonymous.value && data.answer) {
      anon.recordAttempt(currentItem.value?.topicId ?? "", data.correct);
    }
    // Update goal progress from server response
    if (result.goalProgress) {
      goalProgress.value = result.goalProgress;
    }
  }
  loading.value = false;
}

async function handleExampleDone() {
  if (!sessionId.value) return;
  loading.value = true;
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, {
      correct: true,
      responseMs: 0,
      selfExplanation: "completed",
    }),
    t("errors.failedToSubmit", { action: "response" })
  );
  if (result) {
    if (result.masteryEvent) {
      masteryEvent.value = result.masteryEvent;
    }
    if (result.goalProgress) {
      goalProgress.value = result.goalProgress;
    }
    currentItem.value = result;
    if (result.type === "complete") {
      sessionActive.value = false;
    }
  }
  loading.value = false;
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">{{ t('learn.title') }}</h1>

    <!-- Anonymous banner -->
    <div v-if="isAnonymous && !recovering" class="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <p class="text-amber-800 text-sm">
        {{ t('learn.guestBanner') }}
        <RouterLink to="/signup" class="font-semibold underline hover:text-amber-900">{{ t('learn.createAccount') }}</RouterLink>
        {{ t('learn.guestBannerSuffix') }}
      </p>
    </div>

    <!-- Loading (checking for active session) -->
    <div v-if="recovering" class="flex items-center justify-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{{ t('learn.checkingSession') }}</span>
    </div>

    <!-- Not started -->
    <div v-else-if="!sessionId" class="text-center py-12">
      <p class="text-gray-600 mb-6">
        {{ isAnonymous ? t('learn.anonPrompt') : t('learn.authPrompt') }}
      </p>
      <button
        @click="startSession"
        :disabled="loading"
        class="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? t('learn.starting') : t('learn.beginSession') }}
      </button>
    </div>

    <!-- Session complete -->
    <div v-else-if="!sessionActive" class="text-center py-12">
      <div class="bg-green-50 rounded-xl p-8 mb-6">
        <h2 class="text-2xl font-bold text-green-800 mb-2">{{ t('learn.sessionComplete') }}</h2>
        <p class="text-green-700">{{ currentItem?.message }}</p>
      </div>
      <div class="flex gap-4 justify-center">
        <button
          @click="sessionId = null; currentItem = null"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ t('learn.newSession') }}
        </button>
        <RouterLink
          v-if="!isAnonymous"
          to="/progress"
          class="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          {{ t('learn.viewProgress') }}
        </RouterLink>
        <RouterLink
          v-if="isAnonymous"
          to="/signup"
          class="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          {{ t('learn.saveProgress') }}
        </RouterLink>
      </div>
    </div>

    <!-- Active session -->
    <div v-else>
      <!-- Goal progress indicator -->
      <div v-if="goalProgress && !isAnonymous" class="mb-4 flex items-center gap-3 text-sm text-gray-600">
        <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="goalProgress.goalMet ? 'bg-green-500' : 'bg-blue-500'"
            :style="{ width: `${Math.min(goalProgress.progress * 100, 100)}%` }"
          />
        </div>
        <span class="whitespace-nowrap">
          <template v-if="goalProgress.goalType === 'problems'">
            {{ goalProgress.problemsCompleted }}/{{ goalProgress.goalTarget }} {{ t('learn.problems') }}
          </template>
          <template v-else>
            {{ goalProgress.minutesActive }}/{{ goalProgress.goalTarget }} {{ t('learn.minutes') }}
          </template>
          <span v-if="goalProgress.goalMet" class="text-green-600 font-medium ml-1">{{ t('learn.goalMet') }}</span>
        </span>
      </div>

      <!-- Topic header -->
      <div v-if="currentItem?.topicName" class="mb-4">
        <h2 class="text-xl font-semibold text-gray-800">{{ currentItem.topicName }}</h2>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-8">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{{ t('learn.loading') }}</span>
      </div>

      <!-- Problem -->
      <ProblemView
        v-else-if="currentItem?.type === 'problem' || currentItem?.type === 'remediation'"
        :problem="currentItem.problem"
        :topic-name="currentItem.topicName"
        :available-hints="currentItem.availableHints ?? []"
        :show-solution="currentItem.showSolution ?? false"
        :hints-revealed="currentItem.hintsRevealed ?? 0"
        :ask-confidence="currentItem.askConfidence ?? false"
        :presentation-level="currentItem.presentationLevel"
        :phase="currentItem.phase"
        :message="currentItem.message"
        :key="currentItem.problem.id + currentItem.phase"
        @submit="handleProblemSubmit"
      />

      <!-- Worked Example -->
      <WorkedExample
        v-else-if="currentItem?.type === 'instruction'"
        :example="currentItem.example"
        :topic-name="currentItem.topicName"
        :topic-id="currentItem.topicId"
        :key="currentItem.example.id"
        @done="handleExampleDone"
      />
    </div>

    <!-- Mastery Celebration Overlay -->
    <MasteryCelebration
      v-if="masteryEvent"
      :topic-name="masteryEvent.topicName"
      :unlocked-topics="masteryEvent.unlockedTopics"
      @dismiss="masteryEvent = null"
    />
  </div>
</template>
