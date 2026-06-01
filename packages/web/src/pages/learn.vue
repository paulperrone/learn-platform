<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useApi, withErrorToast, ApiError } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useAnonymous } from "@/composables/useAnonymous";
import { useSpeech } from "@/composables/useSpeech";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import ProblemView from "@/components/ProblemView.vue";
import WorkedExample from "@/components/WorkedExample.vue";
import LessonView from "@/components/LessonView.vue";
import MasteryCelebration from "@/components/MasteryCelebration.vue";
import { useI18n } from "vue-i18n";

import { useRoute } from "vue-router";

const api = useApi();
const route = useRoute();
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
const scaffolding = ref<"none" | "lesson-referenced" | "llm-assisted" | "lesson-and-llm">("none");
const lessonPanelOpen = ref(false);
const showLessonWarning = ref(false);
const sessionStatus = ref<{
  assessmentPending: boolean;
  assessmentSessionId?: string;
  reviewsDue: number;
  newTopicsAvailable: number;
  pacingFactor: number;
} | null>(null);
const goalProgress = ref<{
  problemsCompleted: number;
  minutesActive: number;
  topicsMastered: number;
  dailyXp: number;
  goalMet: boolean;
  goalJustCompleted: boolean;
  dailyXpGoal: number;
  progress: number;
} | null>(null);
const lastXpEarned = ref<number | null>(null);
const sessionXp = ref(0);

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
    // Fetch session status (assessment gate, review count, etc.)
    const status = await withErrorToast(
      () => api.getSessionStatus(),
      t("errors.failedToLoad", { resource: "status" })
    );
    if (status) sessionStatus.value = status;

    // Authenticated user — check for active session
    const result = await withErrorToast(
      () => api.getActiveSession(),
      t("errors.failedToLoad", { resource: "session" })
    );
    if (result?.active) {
      sessionId.value = result.sessionId;
      currentItem.value = result.currentItem;
      sessionActive.value = true;
    } else {
      // No active session — auto-start with topicId from query param if present
      const topicIdParam = route.query.topicId as string | undefined;
      const disciplineIdParam = route.query.disciplineId as string | undefined;
      if (topicIdParam) {
        await startSessionForTopic(topicIdParam, disciplineIdParam);
      }
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

async function startSessionForTopic(topicId?: string, disciplineId?: string) {
  return _startSession(topicId, disciplineId);
}

async function startSession() {
  const disciplineIdParam = route.query.disciplineId as string | undefined;
  return _startSession(undefined, disciplineIdParam);
}

async function _startSession(topicId?: string, disciplineId?: string) {
  loading.value = true;
  let result;
  if (isAnonymous.value) {
    result = await withErrorToast(
      () => api.startAnonymousSession(anon.token.value),
      t("errors.failedToStart", { action: "session" })
    );
  } else {
    result = await withErrorToast(
      () => api.startSession({ topicId, disciplineId }),
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
  hintsUsed: number;
  problemId: string;
}) {
  if (!sessionId.value) return;
  loading.value = true;
  const submitData = {
    ...data,
    topicId: currentItem.value?.topicId,
    scaffolding: scaffolding.value,
  };
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, submitData),
    t("errors.failedToSubmit", { action: "response" })
  );
  if (result) {
    // Show mastery celebration if topic was just mastered
    if (result.masteryEvent) {
      masteryEvent.value = result.masteryEvent;
    }
    scaffolding.value = "none";
    lessonPanelOpen.value = false;
    // Track anonymous progress client-side
    if (isAnonymous.value && data.answer) {
      anon.recordAttempt(currentItem.value?.topicId ?? "", data.correct);
    }
    // Update goal progress and XP from server response
    if (result.goalProgress) {
      goalProgress.value = result.goalProgress;
    }
    if (result.xpEarned != null) {
      lastXpEarned.value = result.xpEarned;
      sessionXp.value = result.sessionXp ?? sessionXp.value;
      // Clear XP toast after 2s
      setTimeout(() => { lastXpEarned.value = null; }, 2000);
    }
    if (result.type === "complete") {
      // Pull-based model: auto-start next unit when current topic completes.
      // A "session" is now one atomic unit (one topic). The frontend loops by
      // calling startSession() again immediately to get the next item.
      await startSession();
    } else {
      currentItem.value = result;
    }
  }
  loading.value = false;
}

async function handleLessonDone() {
  if (!sessionId.value) return;
  loading.value = true;
  const result = await withErrorToast(
    () => api.respondToSession(sessionId.value!, {
      correct: true,
      responseMs: 0,
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
    if (result.type === "complete") {
      await startSession();
    } else {
      currentItem.value = result;
    }
  }
  loading.value = false;
}

function openLessonPanel() {
  showLessonWarning.value = true;
}

function confirmLessonPanel() {
  showLessonWarning.value = false;
  lessonPanelOpen.value = true;
  scaffolding.value = scaffolding.value === "llm-assisted" ? "lesson-and-llm" : "lesson-referenced";
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
    if (result.type === "complete") {
      await startSession();
    } else {
      currentItem.value = result;
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

    <!-- Assessment milestone card -->
    <div v-else-if="!sessionId && sessionStatus?.assessmentPending" class="py-12">
      <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-8 text-center mb-6">
        <div class="text-4xl mb-3">&#x1F3AF;</div>
        <h2 class="text-2xl font-bold text-indigo-900 mb-2">{{ t('learn.checkpointReady') }}</h2>
        <p class="text-indigo-700 mb-6">{{ t('learn.checkpointDescription') }}</p>
        <div class="flex gap-4 justify-center">
          <RouterLink
            :to="`/assess/${sessionStatus.assessmentSessionId}`"
            class="px-8 py-3 bg-indigo-600 text-white rounded-lg text-lg font-semibold hover:bg-indigo-700"
          >
            {{ t('learn.startCheckpoint') }}
          </RouterLink>
          <button
            @click="startSession"
            :disabled="loading"
            class="px-6 py-3 border border-indigo-300 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100"
          >
            {{ t('learn.reviewFirst') }}
          </button>
        </div>
      </div>
      <p class="text-center text-sm text-gray-500">
        {{ t('learn.checkpointHint', { reviews: sessionStatus.reviewsDue }) }}
      </p>
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
      <!-- XP progress indicator -->
      <div v-if="goalProgress && !isAnonymous" class="mb-4 flex items-center gap-3 text-sm text-gray-600">
        <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="goalProgress.goalMet ? 'bg-green-500' : 'bg-blue-500'"
            :style="{ width: `${Math.min(goalProgress.progress * 100, 100)}%` }"
          />
        </div>
        <span class="whitespace-nowrap">
          {{ goalProgress.dailyXp }}/{{ goalProgress.dailyXpGoal }} XP
          <span v-if="goalProgress.goalMet" class="text-green-600 font-medium ml-1">{{ t('learn.goalMet') }}</span>
        </span>
        <!-- Per-problem XP toast -->
        <transition name="fade">
          <span v-if="lastXpEarned != null && lastXpEarned > 0" class="text-emerald-600 font-semibold animate-bounce">
            +{{ lastXpEarned }} XP
          </span>
        </transition>
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

      <!-- Lesson -->
      <LessonView
        v-else-if="currentItem?.type === 'lesson'"
        :lesson="currentItem.lesson"
        :practice-problems="currentItem.practiceProblems ?? []"
        :topic-name="currentItem.topicName"
        :topic-id="currentItem.topicId"
        :key="currentItem.lesson.id"
        @done="handleLessonDone"
      />

      <!-- Problem (review or legacy phase) -->
      <div v-else-if="currentItem?.type === 'problem' || currentItem?.type === 'remediation'" class="relative">
        <!-- Lesson reference panel (collapsible, review only) -->
        <div v-if="lessonPanelOpen && currentItem?.phase === 'review'" class="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-amber-800">Lesson Reference</span>
            <button @click="lessonPanelOpen = false" class="text-amber-600 hover:text-amber-800 text-sm">Close</button>
          </div>
          <p class="text-sm text-amber-700">Lesson content is available as reference. This problem counts as guided practice.</p>
        </div>

        <!-- Show lesson button for review -->
        <div v-if="currentItem?.phase === 'review' && !lessonPanelOpen" class="mb-3 flex justify-end">
          <button
            @click="openLessonPanel"
            class="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Show Lesson
          </button>
        </div>

        <!-- Guided mode badge -->
        <div v-if="scaffolding !== 'none'" class="mb-3">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            Guided
          </span>
        </div>

        <ProblemView
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
      </div>

      <!-- Worked Example (legacy instruction fallback) -->
      <WorkedExample
        v-else-if="currentItem?.type === 'instruction'"
        :example="currentItem.example"
        :topic-name="currentItem.topicName"
        :topic-id="currentItem.topicId"
        :key="currentItem.example.id"
        @done="handleExampleDone"
      />

      <!-- Lesson warning modal -->
      <div v-if="showLessonWarning" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Open Lesson?</h3>
          <p class="text-gray-600 mb-4">Opening the lesson will change this to guided practice. You'll need additional pure reviews to earn full credit.</p>
          <div class="flex gap-3 justify-end">
            <button
              @click="showLessonWarning = false"
              class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              @click="confirmLessonPanel"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Open Lesson
            </button>
          </div>
        </div>
      </div>
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
