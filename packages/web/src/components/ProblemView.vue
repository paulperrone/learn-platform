<script setup lang="ts">
import { ref, computed } from "vue";
import ConfidenceSlider from "./ConfidenceSlider.vue";
import { useApi, withErrorToast } from "../composables/useApi";

const props = defineProps<{
  problem: {
    question: string;
    answer: string;
    hints: string[];
    solution: string;
  };
  topicName?: string;
  showHints: boolean;
  askConfidence: boolean;
  phase: string;
  message: string;
}>();

const emit = defineEmits<{
  submit: [data: { answer: string; correct: boolean; confidence?: number; responseMs: number; hintsUsed: number }];
}>();

const api = useApi();
const answer = ref("");
const confidence = ref(3);
const submitted = ref(false);
const isCorrect = ref(false);
const startTime = Date.now();

// Progressive hint state
const hintLevel = ref(0);
const revealedHints = ref<{ level: number; text: string; source: "static" | "llm" }[]>([]);
const hintLoading = ref(false);
const hintMaxReached = ref(false);

const HINT_LEVEL_LABELS = ["", "Nudge", "Guiding Question", "Partial Solution", "Worked Step"] as const;

const phaseColor = computed(() => {
  switch (props.phase) {
    case "pretest": return "bg-purple-100 text-purple-800";
    case "instruction": return "bg-blue-100 text-blue-800";
    case "guided": return "bg-yellow-100 text-yellow-800";
    case "independent": return "bg-green-100 text-green-800";
    case "review": return "bg-orange-100 text-orange-800";
    case "remediation": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
});

function checkAnswer() {
  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  isCorrect.value = normalized(answer.value) === normalized(props.problem.answer);
  submitted.value = true;
}

function submitAndContinue() {
  emit("submit", {
    answer: answer.value,
    correct: isCorrect.value,
    confidence: props.askConfidence ? confidence.value : undefined,
    responseMs: Date.now() - startTime,
    hintsUsed: hintLevel.value,
  });
}

async function requestHint() {
  if (hintLoading.value || hintMaxReached.value) return;

  hintLoading.value = true;
  const result = await withErrorToast(
    () =>
      api.requestHint({
        topicName: props.topicName ?? "Math",
        problemQuestion: props.problem.question,
        problemSolution: props.problem.solution,
        staticHints: props.problem.hints,
        currentHintLevel: hintLevel.value,
        studentResponse: answer.value || undefined,
      }),
    "Hint"
  );
  hintLoading.value = false;

  if (!result) return;

  hintLevel.value = result.level;
  revealedHints.value.push({ level: result.level, text: result.hint, source: result.source });
  hintMaxReached.value = result.isMaxLevel;
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div class="flex items-center gap-3 mb-4">
      <span :class="phaseColor" class="text-xs font-medium px-2 py-1 rounded capitalize">
        {{ phase }}
      </span>
      <p class="text-sm text-gray-500">{{ message }}</p>
    </div>

    <div class="bg-gray-50 rounded-lg p-6 mb-4">
      <p class="text-lg text-gray-800 whitespace-pre-wrap">{{ problem.question }}</p>
    </div>

    <div v-if="!submitted" class="space-y-4">
      <div>
        <input
          v-model="answer"
          type="text"
          class="w-full border border-gray-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Type your answer..."
          @keyup.enter="checkAnswer"
        />
      </div>

      <div v-if="askConfidence" class="pt-2">
        <ConfidenceSlider v-model="confidence" />
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="checkAnswer"
          :disabled="!answer.trim()"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit
        </button>

        <button
          v-if="showHints && !hintMaxReached"
          @click="requestHint"
          :disabled="hintLoading"
          class="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <span v-if="hintLoading">Loading...</span>
          <span v-else-if="hintLevel === 0">Need a hint?</span>
          <span v-else>Another hint ({{ hintLevel }}/4)</span>
        </button>
      </div>

      <!-- Progressive hints -->
      <div v-if="revealedHints.length > 0" class="space-y-2">
        <div
          v-for="(hint, i) in revealedHints"
          :key="i"
          class="rounded-lg p-3 border"
          :class="{
            'bg-yellow-50 border-yellow-200': hint.level <= 2,
            'bg-amber-50 border-amber-200': hint.level === 3,
            'bg-orange-50 border-orange-200': hint.level === 4,
          }"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-medium px-1.5 py-0.5 rounded" :class="{
              'bg-yellow-200 text-yellow-800': hint.level <= 2,
              'bg-amber-200 text-amber-800': hint.level === 3,
              'bg-orange-200 text-orange-800': hint.level === 4,
            }">
              {{ HINT_LEVEL_LABELS[hint.level] }}
            </span>
            <span v-if="hint.source === 'llm'" class="text-xs text-gray-400">AI</span>
          </div>
          <p class="text-sm text-gray-700">{{ hint.text }}</p>
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div :class="isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'" class="rounded-lg p-4 border">
        <p :class="isCorrect ? 'text-green-800' : 'text-red-800'" class="font-medium">
          {{ isCorrect ? "Correct!" : "Not quite." }}
        </p>
        <p v-if="!isCorrect" class="text-sm text-gray-600 mt-1">
          The answer is: <strong>{{ problem.answer }}</strong>
        </p>
        <p v-if="hintLevel > 0" class="text-xs text-gray-500 mt-1">
          Hints used: {{ hintLevel }}
        </p>
      </div>

      <div class="bg-gray-50 rounded-lg p-4">
        <p class="text-sm font-medium text-gray-700 mb-1">Solution:</p>
        <p class="text-sm text-gray-600">{{ problem.solution }}</p>
      </div>

      <button
        @click="submitAndContinue"
        class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        Continue
      </button>
    </div>
  </div>
</template>
