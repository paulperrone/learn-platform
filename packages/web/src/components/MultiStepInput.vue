<script setup lang="ts">
import { ref, computed } from "vue";
import type { MultiStepProperties } from "@learn/shared";

const props = defineProps<{
  typeProperties: MultiStepProperties;
}>();

const emit = defineEmits<{
  done: [result: { correct: boolean; answer: string; stepsCorrect: number; stepsTotal: number }];
}>();

const currentStep = ref(0);
const stepAnswers = ref<string[]>([]);
const stepResults = ref<{ correct: boolean; answer: string }[]>([]);
const stepInput = ref("");
const stepChecked = ref(false);
const stepCorrect = ref(false);
const allDone = ref(false);

const steps = computed(() => props.typeProperties.steps);
const step = computed(() => steps.value[currentStep.value]);

function checkStep() {
  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const correct = normalized(stepInput.value) === normalized(step.value.answer);
  stepCorrect.value = correct;
  stepChecked.value = true;
  stepAnswers.value.push(stepInput.value);
  stepResults.value.push({ correct, answer: stepInput.value });
}

function nextStep() {
  if (currentStep.value < steps.value.length - 1) {
    currentStep.value++;
    stepInput.value = "";
    stepChecked.value = false;
    stepCorrect.value = false;
  } else {
    allDone.value = true;
    const stepsCorrect = stepResults.value.filter((r) => r.correct).length;
    emit("done", {
      correct: stepsCorrect === steps.value.length,
      answer: JSON.stringify(stepAnswers.value),
      stepsCorrect,
      stepsTotal: steps.value.length,
    });
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Step progress -->
    <div class="flex gap-1.5">
      <div
        v-for="(_, i) in steps"
        :key="i"
        class="h-2 flex-1 rounded-full"
        :class="{
          'bg-green-400': stepResults[i]?.correct,
          'bg-red-300': stepResults[i] && !stepResults[i].correct,
          'bg-blue-400': i === currentStep && !allDone,
          'bg-gray-200': i > currentStep && !stepResults[i],
        }"
      />
    </div>

    <div v-if="!allDone">
      <p class="text-xs text-gray-500 mb-2">
        Step {{ currentStep + 1 }} of {{ steps.length }}
      </p>
      <div class="bg-gray-50 rounded-lg p-4 mb-3">
        <p class="text-gray-800">{{ step.question }}</p>
      </div>

      <div v-if="!stepChecked">
        <input
          v-model="stepInput"
          type="text"
          class="w-full border border-gray-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Your answer for this step..."
          @keyup.enter="checkStep"
        />
        <!-- Step hints -->
        <div v-if="step.hints?.length" class="mt-2">
          <details class="text-sm text-gray-500">
            <summary class="cursor-pointer hover:text-gray-700">Hint for this step</summary>
            <p class="mt-1 pl-4 text-gray-600">{{ step.hints[0] }}</p>
          </details>
        </div>
        <button
          @click="checkStep"
          :disabled="!stepInput.trim()"
          class="mt-3 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Check Step
        </button>
      </div>

      <div v-else>
        <div
          :class="stepCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'"
          class="rounded-lg p-3 border"
        >
          <p :class="stepCorrect ? 'text-green-800' : 'text-red-800'" class="font-medium text-sm">
            {{ stepCorrect ? "Correct!" : "Not quite." }}
          </p>
          <p v-if="!stepCorrect" class="text-sm text-gray-600 mt-1">
            Answer: <strong>{{ step.answer }}</strong>
          </p>
        </div>
        <button
          @click="nextStep"
          class="mt-3 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ currentStep < steps.length - 1 ? "Next Step" : "See Results" }}
        </button>
      </div>
    </div>

    <!-- Final summary -->
    <div v-else class="space-y-2">
      <div
        v-for="(result, i) in stepResults"
        :key="i"
        class="flex items-center gap-2 text-sm"
      >
        <span
          :class="result.correct ? 'text-green-600' : 'text-red-500'"
          class="font-medium"
        >
          {{ result.correct ? "✓" : "✗" }}
        </span>
        <span class="text-gray-600">Step {{ i + 1 }}: {{ result.answer }}</span>
        <span v-if="!result.correct" class="text-gray-400">
          (correct: {{ steps[i].answer }})
        </span>
      </div>
    </div>
  </div>
</template>
