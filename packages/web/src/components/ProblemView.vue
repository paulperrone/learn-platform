<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Problem, AssessmentType, MultiStepProperties, MatchingProperties, MultiSelectProperties, NumericalInputProperties } from "@learn/shared";
import ConfidenceSlider from "./ConfidenceSlider.vue";
import SpeakButton from "./SpeakButton.vue";
import VoiceMicButton from "./VoiceMicButton.vue";
import NumericalInput from "./NumericalInput.vue";
import MultiStepInput from "./MultiStepInput.vue";
import MatchingInput from "./MatchingInput.vue";
import MultiSelectInput from "./MultiSelectInput.vue";
import VisualAid from "./visuals/VisualAid.vue";
import { useApi, withErrorToast } from "../composables/useApi";
import { useLLMStatus } from "../composables/useLLMStatus";

const props = defineProps<{
  problem: Problem;
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
const { llmAvailable, check: checkLLM } = useLLMStatus();
onMounted(checkLLM);

const problemType = computed<AssessmentType>(() => props.problem.type ?? "text-qa");
const isMultiStep = computed(() => problemType.value === "multi-step");

const answer = ref("");
const confidence = ref(3);
const submitted = ref(false);
const isCorrect = ref(false);
const startTime = Date.now();

// Refs for sub-components
const numericalInputRef = ref<InstanceType<typeof NumericalInput> | null>(null);
const matchingInputRef = ref<InstanceType<typeof MatchingInput> | null>(null);
const multiSelectInputRef = ref<InstanceType<typeof MultiSelectInput> | null>(null);

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
  let result: { correct: boolean; display: string };

  switch (problemType.value) {
    case "numerical-input":
      result = numericalInputRef.value!.checkAnswer();
      break;
    case "matching":
      result = matchingInputRef.value!.checkAnswer();
      break;
    case "multi-select":
      result = multiSelectInputRef.value!.checkAnswer();
      break;
    default: {
      // text-qa
      const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const correct = normalized(answer.value) === normalized(props.problem.answer);
      result = { correct, display: answer.value };
      break;
    }
  }

  answer.value = result.display;
  isCorrect.value = result.correct;
  submitted.value = true;
}

// Multi-step completes on its own
function handleMultiStepDone(result: { correct: boolean; answer: string; stepsCorrect: number; stepsTotal: number }) {
  answer.value = result.answer;
  isCorrect.value = result.correct;
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

// LLM hints (level 3+) require LLM availability; static hints always work
const llmHintsDisabled = computed(() => {
  const nextLevel = hintLevel.value + 1;
  const hasStaticHint = nextLevel <= 2 && props.problem.hints.length >= nextLevel;
  return !hasStaticHint && llmAvailable.value === false;
});

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

// Display answer for feedback section
const displayAnswer = computed(() => {
  if (problemType.value === "matching") {
    const pairs = (props.problem.typeProperties as MatchingProperties)?.pairs;
    return pairs?.map((p) => `${p.left} → ${p.right}`).join(", ") ?? props.problem.answer;
  }
  if (problemType.value === "multi-select") {
    const tp = props.problem.typeProperties as MultiSelectProperties;
    return tp?.correctIndices.map((i) => tp.options[i]).join(", ") ?? props.problem.answer;
  }
  if (problemType.value === "multi-step") {
    const tp = props.problem.typeProperties as MultiStepProperties;
    return tp?.steps.map((s, i) => `Step ${i + 1}: ${s.answer}`).join(", ") ?? props.problem.answer;
  }
  return props.problem.answer;
});
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
      <div class="flex items-start justify-between gap-3">
        <p class="text-lg text-gray-800 whitespace-pre-wrap flex-1">{{ problem.question }}</p>
        <SpeakButton :text="problem.question" :convert-math="true" />
      </div>
      <VisualAid v-if="problem.visuals?.length" :visuals="problem.visuals" />
    </div>

    <div v-if="!submitted" class="space-y-4">
      <!-- Text QA (default) -->
      <template v-if="problemType === 'text-qa' || problemType === 'equation-builder'">
        <div class="flex items-center gap-2">
          <input
            v-model="answer"
            type="text"
            class="flex-1 border border-gray-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Type or speak your answer..."
            @keyup.enter="checkAnswer"
          />
          <VoiceMicButton @transcription="(text) => answer = answer ? `${answer} ${text}` : text" />
        </div>
      </template>

      <!-- Numerical Input -->
      <template v-else-if="problemType === 'numerical-input'">
        <NumericalInput
          ref="numericalInputRef"
          :answer="problem.answer"
          :type-properties="problem.typeProperties as NumericalInputProperties"
          @keyup.enter="checkAnswer"
        />
      </template>

      <!-- Multi-Step -->
      <template v-else-if="problemType === 'multi-step'">
        <MultiStepInput
          :type-properties="(problem.typeProperties as MultiStepProperties)"
          @done="handleMultiStepDone"
        />
      </template>

      <!-- Matching -->
      <template v-else-if="problemType === 'matching'">
        <MatchingInput
          ref="matchingInputRef"
          :type-properties="(problem.typeProperties as MatchingProperties)"
        />
      </template>

      <!-- Multi-Select -->
      <template v-else-if="problemType === 'multi-select'">
        <MultiSelectInput
          ref="multiSelectInputRef"
          :type-properties="(problem.typeProperties as MultiSelectProperties)"
        />
      </template>

      <div v-if="askConfidence" class="pt-2">
        <ConfidenceSlider v-model="confidence" />
      </div>

      <div class="flex items-center gap-3">
        <!-- Multi-step handles its own submit flow -->
        <button
          v-if="!isMultiStep"
          @click="checkAnswer"
          :disabled="!answer.trim() && problemType === 'text-qa'"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit
        </button>

        <button
          v-if="showHints && !hintMaxReached && !isMultiStep"
          @click="requestHint"
          :disabled="hintLoading || llmHintsDisabled"
          class="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          :title="llmHintsDisabled ? 'AI hints are not available' : ''"
        >
          <span v-if="hintLoading">Loading...</span>
          <span v-else-if="llmHintsDisabled">AI hints not available</span>
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
          The answer is: <strong>{{ displayAnswer }}</strong>
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
