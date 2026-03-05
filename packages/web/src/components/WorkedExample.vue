<script setup lang="ts">
import { ref, computed } from "vue";
import type { VisualAsset } from "@learn/shared";
import SpeakButton from "./SpeakButton.vue";
import VisualAid from "./visuals/VisualAid.vue";

const props = defineProps<{
  example: {
    title: string;
    steps: {
      subgoalLabel: string;
      instruction: string;
      work: string;
      explanation: string;
    }[];
    visuals?: VisualAsset[];
  };
}>();

const emit = defineEmits<{
  done: [];
}>();

const currentStep = ref(0);
const showExplanation = ref(false);
const selfExplanation = ref("");

const stepSpeechText = computed(() => {
  const step = props.example.steps[currentStep.value];
  return `${step.instruction}. ${step.work}`;
});

function nextStep() {
  showExplanation.value = false;
  selfExplanation.value = "";
  if (currentStep.value < props.example.steps.length - 1) {
    currentStep.value++;
  } else {
    emit("done");
  }
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold">{{ example.title }}</h3>
      <SpeakButton :text="stepSpeechText" :convert-math="true" />
    </div>

    <VisualAid v-if="example.visuals?.length" :visuals="example.visuals" />

    <div class="flex gap-2 mb-4">
      <div
        v-for="(step, i) in example.steps"
        :key="i"
        class="h-2 flex-1 rounded-full transition-colors"
        :class="i <= currentStep ? 'bg-blue-500' : 'bg-gray-200'"
      />
    </div>

    <div class="space-y-4">
      <div class="bg-blue-50 rounded-lg p-4">
        <span class="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded mb-2">
          {{ example.steps[currentStep].subgoalLabel }}
        </span>
        <p class="text-gray-700">{{ example.steps[currentStep].instruction }}</p>
      </div>

      <div class="bg-gray-50 rounded-lg p-4 font-mono text-lg text-center">
        {{ example.steps[currentStep].work }}
      </div>

      <div v-if="!showExplanation" class="space-y-3">
        <p class="text-sm text-gray-600">Explain in your own words: why does this step work?</p>
        <textarea
          v-model="selfExplanation"
          rows="2"
          class="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Type your explanation..."
        />
        <button
          @click="showExplanation = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Check Explanation
        </button>
      </div>

      <div v-else class="space-y-3">
        <div class="bg-green-50 rounded-lg p-4">
          <p class="text-sm font-medium text-green-800 mb-1">Here's why:</p>
          <p class="text-gray-700">{{ example.steps[currentStep].explanation }}</p>
        </div>
        <button
          @click="nextStep"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          {{ currentStep < example.steps.length - 1 ? "Next Step" : "Continue" }}
        </button>
      </div>
    </div>
  </div>
</template>
