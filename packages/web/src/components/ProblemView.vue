<script setup lang="ts">
import { ref, computed } from "vue";
import ConfidenceSlider from "./ConfidenceSlider.vue";

const props = defineProps<{
  problem: {
    question: string;
    answer: string;
    hints: string[];
    solution: string;
  };
  showHints: boolean;
  askConfidence: boolean;
  phase: string;
  message: string;
}>();

const emit = defineEmits<{
  submit: [data: { answer: string; correct: boolean; confidence?: number; responseMs: number }];
}>();

const answer = ref("");
const confidence = ref(3);
const showHint = ref(false);
const hintIndex = ref(0);
const submitted = ref(false);
const isCorrect = ref(false);
const startTime = Date.now();

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
  });
}

function showNextHint() {
  showHint.value = true;
  if (hintIndex.value < props.problem.hints.length - 1) {
    hintIndex.value++;
  }
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
          v-if="showHints && problem.hints.length > 0"
          @click="showNextHint"
          class="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
        >
          Show Hint
        </button>
      </div>

      <div v-if="showHint" class="bg-yellow-50 rounded-lg p-4">
        <p v-for="(hint, i) in problem.hints.slice(0, hintIndex + 1)" :key="i" class="text-sm text-yellow-800">
          {{ hint }}
        </p>
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
