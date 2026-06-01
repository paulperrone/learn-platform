<script setup lang="ts">
import { ref, computed } from "vue";
import type { VisualAsset } from "@learn/shared";
import SpeakButton from "./SpeakButton.vue";
import VisualAid from "./visuals/VisualAid.vue";
import VoiceMicButton from "./VoiceMicButton.vue";
import { useApi } from "../composables/useApi";
import { useLLMStatus } from "../composables/useLLMStatus";
import { useI18n } from "vue-i18n";

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
    presentation?: string;
  };
  topicName?: string;
  topicId?: string;
}>();

const emit = defineEmits<{
  done: [];
}>();

const api = useApi();
const { llmAvailable, check: checkLLM } = useLLMStatus();
const { t } = useI18n();
const currentStep = ref(0);
const showExplanation = ref(false);
const selfExplanation = ref("");

// LLM evaluation state
const evaluating = ref(false);
const evaluation = ref<{
  quality: "strong" | "partial" | "weak" | "misconception";
  feedback: string;
  missingConcepts: string[];
  misconceptionFlag: string | null;
} | null>(null);

checkLLM();

const isFallback = computed(() =>
  props.example.steps.length === 1 && (props.example as any).id?.startsWith("fallback-")
);

const stepSpeechText = computed(() => {
  const step = props.example.steps[currentStep.value];
  return `${step.instruction}. ${step.work}`;
});

const currentStepData = computed(() => props.example.steps[currentStep.value]);

const shouldAskSelfExplanation = computed(() => {
  if (props.example.presentation === "primary") return false;

  const step = currentStepData.value;
  const prompt = `${step.instruction} ${step.work}`;
  return prompt.includes("?")
    || prompt.includes("→")
    || prompt.includes("=")
    || /[0-9]\s*[+\-*/]\s*[0-9]/.test(prompt);
});

const explanationVisible = computed(() => showExplanation.value || !shouldAskSelfExplanation.value);

const qualityColor = computed(() => {
  if (!evaluation.value) return "";
  switch (evaluation.value.quality) {
    case "strong": return "bg-green-50 border-green-200 text-green-800";
    case "partial": return "bg-yellow-50 border-yellow-200 text-yellow-800";
    case "weak": return "bg-orange-50 border-orange-200 text-orange-800";
    case "misconception": return "bg-red-50 border-red-200 text-red-800";
    default: return "bg-gray-50 border-gray-200 text-gray-800";
  }
});

const qualityLabel = computed(() => {
  if (!evaluation.value) return "";
  switch (evaluation.value.quality) {
    case "strong": return t("example.qualityStrong");
    case "partial": return t("example.qualityPartial");
    case "weak": return t("example.qualityWeak");
    case "misconception": return t("example.qualityMisconception");
    default: return "";
  }
});

async function checkExplanation() {
  // If LLM available and student typed something, evaluate with LLM
  if (llmAvailable.value && selfExplanation.value.trim()) {
    evaluating.value = true;
    let result = null;
    try {
      result = await api.evaluateExplanation({
        topicName: props.topicName ?? "Math",
        topicId: props.topicId,
        stepDescription: `${currentStepData.value.subgoalLabel}: ${currentStepData.value.instruction} → ${currentStepData.value.work}`,
        studentExplanation: selfExplanation.value,
      });
    } catch {
      result = null;
    }
    evaluating.value = false;
    if (result) {
      evaluation.value = result;
    }
  }
  // Always show the static explanation
  showExplanation.value = true;
}

function nextStep() {
  showExplanation.value = false;
  selfExplanation.value = "";
  evaluation.value = null;
  if (currentStep.value < props.example.steps.length - 1) {
    currentStep.value++;
  } else {
    emit("done");
  }
}
</script>

<template>
  <!-- Fallback intro view (no self-explanation flow) -->
  <div v-if="isFallback" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <h3 class="text-lg font-semibold mb-4">{{ example.title }}</h3>
    <div class="bg-blue-50 rounded-lg p-4 mb-4">
      <p class="text-gray-700">{{ currentStepData.instruction }}</p>
    </div>
    <p class="text-sm text-gray-500 mb-4">{{ currentStepData.work }}</p>
    <button
      @click="emit('done')"
      class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
    >
      {{ t('example.continue') }}
    </button>
  </div>

  <!-- Full worked example with self-explanation -->
  <div v-else class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
          {{ currentStepData.subgoalLabel }}
        </span>
        <p class="text-gray-700">{{ currentStepData.instruction }}</p>
      </div>

      <div class="bg-gray-50 rounded-lg p-4 font-mono text-lg text-center math-ltr">
        {{ currentStepData.work }}
      </div>

      <div v-if="!explanationVisible && shouldAskSelfExplanation" class="space-y-3">
        <p class="text-sm text-gray-600">{{ t('example.explainPrompt') }}</p>
        <div class="flex items-start gap-2">
          <textarea
            v-model="selfExplanation"
            rows="2"
            class="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            :placeholder="t('example.explainPlaceholder')"
          />
          <VoiceMicButton @transcription="(text) => selfExplanation = selfExplanation ? `${selfExplanation} ${text}` : text" />
        </div>
        <button
          @click="checkExplanation"
          :disabled="evaluating"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <span v-if="evaluating">{{ t('example.evaluating') }}</span>
          <span v-else>{{ t('example.checkExplanation') }}</span>
        </button>
      </div>

      <div v-else class="space-y-3">
        <!-- LLM evaluation feedback -->
        <div v-if="evaluation" :class="qualityColor" class="rounded-lg p-4 border">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold uppercase">{{ qualityLabel }}</span>
          </div>
          <p class="text-sm">{{ evaluation.feedback }}</p>
          <p v-if="evaluation.misconceptionFlag" class="text-sm mt-2 font-medium">
            {{ evaluation.misconceptionFlag }}
          </p>
        </div>

        <!-- Static explanation (always shown) -->
        <div class="bg-green-50 rounded-lg p-4">
          <p class="text-sm font-medium text-green-800 mb-1">{{ t('example.heresWhy') }}</p>
          <p class="text-gray-700">{{ currentStepData.explanation }}</p>
        </div>

        <button
          @click="nextStep"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          {{ currentStep < example.steps.length - 1 ? t('example.nextStep') : t('example.continue') }}
        </button>
      </div>
    </div>
  </div>
</template>
