<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
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
import { useI18n } from "vue-i18n";

const props = defineProps<{
  problem: Problem;
  topicName?: string;
  availableHints: string[];
  showSolution: boolean;
  hintsRevealed: number;
  askConfidence: boolean;
  phase: string;
  message: string;
}>();

const emit = defineEmits<{
  submit: [data: { answer: string; correct: boolean; confidence?: number; responseMs: number; hintsUsed: number }];
}>();

const api = useApi();
const { llmAvailable, check: checkLLM } = useLLMStatus();
const { t } = useI18n();
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  checkLLM();
  nextTick(() => inputRef.value?.focus());
  window.addEventListener("keydown", handleGlobalEnter);
});
onUnmounted(() => window.removeEventListener("keydown", handleGlobalEnter));

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

// Progressive hint state — initialized from server-provided hints
const hintLevel = ref(props.hintsRevealed);
const revealedHints = ref<{ level: number; text: string; source: "static" | "llm" }[]>(
  props.availableHints.map((text, i) => ({ level: i + 1, text, source: "static" as const }))
);
const hintLoading = ref(false);
const hintMaxReached = ref(props.showSolution);

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

function handleGlobalEnter(e: KeyboardEvent) {
  if (e.key !== "Enter") return;
  if (submitted.value) {
    e.preventDefault();
    submitAndContinue();
  }
}

function checkAnswer() {
  if (problemType.value === "text-qa" && !answer.value.trim()) return;
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

// Tutor state
const tutorLoading = ref(false);
const tutorResponse = ref("");
const tutorHistory = ref<{ role: "system" | "user" | "assistant"; content: string }[]>([]);
const showTutor = ref(false);

// LLM grading state
const llmGrading = ref(false);
const llmGradeResult = ref<{ correct: boolean; feedback: string } | null>(null);

const canUseTutor = computed(
  () => llmAvailable.value && ["guided", "independent"].includes(props.phase) && !submitted.value
);

async function requestTutor() {
  if (tutorLoading.value) return;
  showTutor.value = true;
  tutorLoading.value = true;

  const result = await withErrorToast(
    () =>
      api.requestTutor({
        topicName: props.topicName ?? "Math",
        problemQuestion: props.problem.question,
        studentResponse: answer.value || "I'm stuck",
        conversationHistory: tutorHistory.value,
      }),
    "Tutor"
  );
  tutorLoading.value = false;

  if (result?.response) {
    tutorResponse.value = result.response;
    tutorHistory.value.push(
      { role: "user", content: answer.value || "I'm stuck" },
      { role: "assistant", content: result.response }
    );
  }
}

async function requestLLMGrade() {
  if (llmGrading.value || !answer.value.trim()) return;
  llmGrading.value = true;

  const result = await withErrorToast(
    () =>
      api.gradeAnswer({
        topicName: props.topicName ?? "Math",
        question: props.problem.question,
        correctAnswer: props.problem.answer,
        studentAnswer: answer.value,
      }),
    "Grading"
  );
  llmGrading.value = false;

  if (result) {
    llmGradeResult.value = result;
    if (result.correct) {
      isCorrect.value = true;
    }
  }
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
        <p class="text-lg text-gray-800 whitespace-pre-wrap flex-1 math-ltr">{{ problem.question }}</p>
        <SpeakButton :text="problem.question" :convert-math="true" />
      </div>
      <VisualAid v-if="problem.visuals?.length" :visuals="problem.visuals" />
    </div>

    <div v-if="!submitted" class="space-y-4">
      <!-- Text QA (default) -->
      <template v-if="problemType === 'text-qa' || problemType === 'equation-builder'">
        <div class="flex items-center gap-2">
          <input
            ref="inputRef"
            v-model="answer"
            type="text"
            class="flex-1 border border-gray-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent math-ltr"
            :placeholder="t('problem.placeholder')"
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
          {{ t('problem.submit') }}
        </button>

        <button
          v-if="!hintMaxReached && !isMultiStep"
          @click="requestHint"
          :disabled="hintLoading || llmHintsDisabled"
          class="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          :title="llmHintsDisabled ? t('problem.hintUnavailable') : ''"
        >
          <span v-if="hintLoading">{{ t('problem.hintLoading') }}</span>
          <span v-else-if="llmHintsDisabled">{{ t('problem.hintUnavailable') }}</span>
          <span v-else-if="hintLevel === 0">{{ t('problem.needHint') }}</span>
          <span v-else>{{ t('problem.anotherHint', { current: hintLevel }) }}</span>
        </button>

        <button
          v-if="canUseTutor"
          @click="requestTutor"
          :disabled="tutorLoading"
          class="px-4 py-2.5 border border-purple-300 text-purple-700 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50"
        >
          <span v-if="tutorLoading">{{ t('problem.tutorLoading') }}</span>
          <span v-else>{{ t('problem.askTutor') }}</span>
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
      <!-- Tutor response -->
      <div v-if="showTutor && tutorResponse" class="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <p class="text-xs font-medium text-purple-600 mb-1">{{ t('problem.tutorSays') }}</p>
        <p class="text-sm text-purple-900">{{ tutorResponse }}</p>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div :class="isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'" class="rounded-lg p-4 border">
        <p :class="isCorrect ? 'text-green-800' : 'text-red-800'" class="font-medium">
          {{ isCorrect ? t('problem.correct') : t('problem.incorrect') }}
        </p>
        <p v-if="!isCorrect" class="text-sm text-gray-600 mt-1">
          {{ t('problem.answerIs', { answer: displayAnswer }) }}
        </p>
        <p v-if="hintLevel > 0" class="text-xs text-gray-500 mt-1">
          {{ t('problem.hintsUsed', { count: hintLevel }) }}
        </p>
      </div>

      <div class="bg-gray-50 rounded-lg p-4">
        <p class="text-sm font-medium text-gray-700 mb-1">{{ t('problem.solution') }}</p>
        <p class="text-sm text-gray-600">{{ problem.solution }}</p>
      </div>

      <button
        @click="submitAndContinue"
        class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
      >
        {{ t('problem.continue') }}
      </button>
    </div>
  </div>
</template>
