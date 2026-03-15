<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type { AssessmentItem, MultiStepProperties, MatchingProperties, MultiSelectProperties, NumericalInputProperties } from "@learn/shared";
import NumericalInput from "./NumericalInput.vue";
import MultiStepInput from "./MultiStepInput.vue";
import MatchingInput from "./MatchingInput.vue";
import MultiSelectInput from "./MultiSelectInput.vue";
import VisualAid from "./visuals/VisualAid.vue";

const props = defineProps<{
  item: AssessmentItem;
}>();

const emit = defineEmits<{
  submit: [data: { answer: string; responseMs: number }];
}>();

const answer = ref("");
const startTime = ref(Date.now());
const submitted = ref(false);

// Refs for components with checkAnswer() exposed
const numericalInputRef = ref<InstanceType<typeof NumericalInput> | null>(null);
const matchingInputRef = ref<InstanceType<typeof MatchingInput> | null>(null);
const multiSelectInputRef = ref<InstanceType<typeof MultiSelectInput> | null>(null);

// Reset when item changes
watch(() => props.item.questionNumber, () => {
  answer.value = "";
  submitted.value = false;
  startTime.value = Date.now();
});

onMounted(() => {
  startTime.value = Date.now();
  window.addEventListener("keydown", handleEnter);
});
onUnmounted(() => {
  window.removeEventListener("keydown", handleEnter);
  if (timerInterval.value) clearInterval(timerInterval.value);
});

function handleEnter(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !submitted.value) {
    const type = problemType.value;
    if (type === "text-qa" || type === "numerical-input") {
      handleSubmit();
    }
  }
}

const problemType = computed(() => props.item.problem.type ?? "text-qa");

// Timer countdown
const timeRemainingMs = ref(props.item.timeRemainingMs ?? null);
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null);

watch(() => props.item.timeRemainingMs, (newMs) => {
  timeRemainingMs.value = newMs ?? null;
});

onMounted(() => {
  if (timeRemainingMs.value != null) {
    timerInterval.value = setInterval(() => {
      if (timeRemainingMs.value != null) {
        timeRemainingMs.value = Math.max(0, timeRemainingMs.value - 1000);
      }
    }, 1000);
  }
});

const timerMinutes = computed(() => {
  if (timeRemainingMs.value == null) return null;
  return Math.floor(timeRemainingMs.value / 60000);
});
const timerSeconds = computed(() => {
  if (timeRemainingMs.value == null) return null;
  return Math.floor((timeRemainingMs.value % 60000) / 1000);
});
const timerDisplay = computed(() => {
  if (timerMinutes.value == null || timerSeconds.value == null) return null;
  return `${timerMinutes.value}:${String(timerSeconds.value).padStart(2, "0")}`;
});
const timerUrgent = computed(() =>
  timeRemainingMs.value != null && timeRemainingMs.value < 60000
);
const timerWarning = computed(() =>
  timeRemainingMs.value != null && timeRemainingMs.value < 300000 && !timerUrgent.value
);

const progressPercent = computed(() =>
  Math.round((props.item.questionNumber / props.item.totalQuestions) * 100)
);

function handleSubmit() {
  if (submitted.value) return;

  let ans = answer.value.trim();

  if (problemType.value === "numerical-input" && numericalInputRef.value) {
    const result = numericalInputRef.value.checkAnswer();
    ans = result.display;
  } else if (problemType.value === "matching" && matchingInputRef.value) {
    const result = matchingInputRef.value.checkAnswer();
    ans = result.display;
  } else if (problemType.value === "multi-select" && multiSelectInputRef.value) {
    const result = multiSelectInputRef.value.checkAnswer();
    ans = result.display;
  }

  if (!ans) return;
  submitted.value = true;
  const responseMs = Date.now() - startTime.value;
  emit("submit", { answer: ans, responseMs });
}

function handleMultiStepDone(result: { correct: boolean; answer: string; stepsCorrect: number; stepsTotal: number }) {
  if (submitted.value) return;
  submitted.value = true;
  const responseMs = Date.now() - startTime.value;
  emit("submit", { answer: result.answer, responseMs });
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Progress bar -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-gray-500">
          Question {{ item.questionNumber }} of {{ item.totalQuestions }}
        </span>
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500">{{ item.topicName }}</span>
          <!-- Timer -->
          <span
            v-if="timerDisplay"
            class="text-sm font-mono font-medium px-2 py-0.5 rounded"
            :class="{
              'text-red-700 bg-red-50': timerUrgent,
              'text-yellow-700 bg-yellow-50': timerWarning,
              'text-gray-600 bg-gray-100': !timerUrgent && !timerWarning,
            }"
          >
            {{ timerDisplay }}
          </span>
        </div>
      </div>
      <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 rounded-full transition-all duration-300"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>

    <!-- Problem -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <!-- Visual -->
      <div v-if="item.problem.visuals?.length" class="mb-4">
        <VisualAid :visuals="item.problem.visuals" />
      </div>

      <!-- Question -->
      <p class="text-lg text-gray-900 mb-6 leading-relaxed">{{ item.problem.question }}</p>

      <!-- Multi-step -->
      <template v-if="problemType === 'multi-step'">
        <MultiStepInput
          :type-properties="(item.problem.typeProperties as MultiStepProperties)"
          @done="handleMultiStepDone"
        />
      </template>

      <!-- Matching -->
      <template v-else-if="problemType === 'matching'">
        <MatchingInput
          ref="matchingInputRef"
          :type-properties="(item.problem.typeProperties as MatchingProperties)"
        />
        <button
          v-if="!submitted"
          class="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          @click="handleSubmit"
        >
          Submit Answer
        </button>
      </template>

      <!-- Multi-select -->
      <template v-else-if="problemType === 'multi-select'">
        <MultiSelectInput
          ref="multiSelectInputRef"
          :type-properties="(item.problem.typeProperties as MultiSelectProperties)"
        />
        <button
          v-if="!submitted"
          class="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          @click="handleSubmit"
        >
          Submit Answer
        </button>
      </template>

      <!-- Numerical input -->
      <template v-else-if="problemType === 'numerical-input'">
        <NumericalInput
          ref="numericalInputRef"
          :answer="item.problem.answer"
          :type-properties="(item.problem.typeProperties as NumericalInputProperties)"
          @keyup.enter="handleSubmit"
        />
        <button
          v-if="!submitted"
          class="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          @click="handleSubmit"
        >
          Submit Answer
        </button>
      </template>

      <!-- Default text-qa -->
      <template v-else>
        <input
          v-model="answer"
          type="text"
          placeholder="Your answer..."
          class="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          :disabled="submitted"
          @keydown.enter.prevent="handleSubmit"
        />
        <button
          v-if="!submitted"
          class="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          :disabled="!answer.trim()"
          @click="handleSubmit"
        >
          Submit Answer
        </button>
      </template>

      <p v-if="submitted" class="mt-3 text-sm text-gray-400 text-center">Moving to next question...</p>
    </div>
  </div>
</template>
