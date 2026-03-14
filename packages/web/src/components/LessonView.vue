<script setup lang="ts">
import { ref, computed } from "vue";
import type { VisualAsset, Problem, AssessmentType } from "@learn/shared";
import WorkedExample from "./WorkedExample.vue";
import ProblemView from "./ProblemView.vue";
import { useI18n } from "vue-i18n";

type LessonSection = {
  type: "explanation" | "worked-example" | "diagram" | "video" | "practice";
  title?: string;
  content: string;
  example?: {
    title: string;
    steps: { subgoalLabel: string; instruction: string; work: string; explanation: string }[];
    visuals?: VisualAsset[];
  };
  problems?: Problem[];
  mediaAlt?: string;
  mediaRef?: string;
};

const props = defineProps<{
  lesson: {
    id: string;
    topicId: string;
    title: string;
    sections: LessonSection[];
  };
  practiceProblems: Problem[];
  topicName: string;
  topicId: string;
}>();

const emit = defineEmits<{
  done: [];
  "practice-submit": [data: { answer: string; correct: boolean; responseMs: number }];
}>();

const { t } = useI18n();
const currentSectionIndex = ref(0);
const practiceIndex = ref(0);
const practiceComplete = ref(false);
const workedExampleDone = ref(false);

const totalSections = computed(() => props.lesson.sections.length);
const currentSection = computed(() => props.lesson.sections[currentSectionIndex.value]);
const progress = computed(() => ((currentSectionIndex.value + 1) / totalSections.value) * 100);

const isLastSection = computed(() => currentSectionIndex.value >= totalSections.value - 1);
const hasPractice = computed(() =>
  currentSection.value?.type === "practice" && (currentSection.value.problems?.length ?? 0) > 0
);

function nextSection() {
  if (isLastSection.value) {
    // If there are standalone practice problems from the API, show those
    if (props.practiceProblems.length > 0 && !practiceComplete.value) {
      return; // practice section handles completion
    }
    emit("done");
    return;
  }
  workedExampleDone.value = false;
  currentSectionIndex.value++;
}

function handleWorkedExampleDone() {
  workedExampleDone.value = true;
}

function handlePracticeSubmit(data: { answer: string; correct: boolean; responseMs: number }) {
  emit("practice-submit", data);
  practiceIndex.value++;
  if (practiceIndex.value >= (currentSection.value?.problems?.length ?? 0)) {
    practiceComplete.value = true;
    // If this is the last section, emit done
    if (isLastSection.value) {
      emit("done");
    } else {
      nextSection();
    }
  }
}

function handleStandalonePracticeSubmit(data: { answer: string; correct: boolean; responseMs: number }) {
  emit("practice-submit", data);
  practiceIndex.value++;
  if (practiceIndex.value >= props.practiceProblems.length) {
    practiceComplete.value = true;
    emit("done");
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Lesson header -->
    <div class="bg-blue-50 rounded-xl p-6 border border-blue-100">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xl font-bold text-blue-900">{{ lesson.title }}</h2>
        <span class="text-sm text-blue-600 font-medium">
          {{ currentSectionIndex + 1 }} / {{ totalSections }}
        </span>
      </div>
      <!-- Progress bar -->
      <div class="w-full bg-blue-200 rounded-full h-1.5">
        <div
          class="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>

    <!-- Section content -->
    <div v-if="currentSection" class="min-h-[200px]">
      <!-- Explanation -->
      <div v-if="currentSection.type === 'explanation'" class="prose prose-blue max-w-none">
        <h3 v-if="currentSection.title" class="text-lg font-semibold text-gray-800 mb-3">
          {{ currentSection.title }}
        </h3>
        <div class="text-gray-700 leading-relaxed whitespace-pre-line">{{ currentSection.content }}</div>

        <button
          @click="nextSection"
          class="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ isLastSection ? "Complete Lesson" : "Continue" }}
        </button>
      </div>

      <!-- Worked Example -->
      <div v-else-if="currentSection.type === 'worked-example' && currentSection.example">
        <p v-if="currentSection.content" class="text-gray-600 mb-4">{{ currentSection.content }}</p>
        <WorkedExample
          :example="currentSection.example"
          :topic-name="topicName"
          :topic-id="topicId"
          @done="handleWorkedExampleDone"
        />
        <button
          v-if="workedExampleDone"
          @click="nextSection"
          class="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ isLastSection ? "Complete Lesson" : "Continue" }}
        </button>
      </div>

      <!-- Diagram placeholder -->
      <div v-else-if="currentSection.type === 'diagram'" class="space-y-4">
        <h3 v-if="currentSection.title" class="text-lg font-semibold text-gray-800">
          {{ currentSection.title }}
        </h3>
        <div class="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p class="text-gray-500 text-sm mb-2">[ Diagram ]</p>
          <p class="text-gray-600">{{ currentSection.mediaAlt ?? currentSection.content }}</p>
        </div>
        <button
          @click="nextSection"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ isLastSection ? "Complete Lesson" : "Continue" }}
        </button>
      </div>

      <!-- Video placeholder -->
      <div v-else-if="currentSection.type === 'video'" class="space-y-4">
        <h3 v-if="currentSection.title" class="text-lg font-semibold text-gray-800">
          {{ currentSection.title }}
        </h3>
        <div class="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p class="text-gray-500 text-sm mb-2">[ Video — coming soon ]</p>
          <p class="text-gray-600">{{ currentSection.mediaAlt ?? currentSection.content }}</p>
        </div>
        <button
          @click="nextSection"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          {{ isLastSection ? "Complete Lesson" : "Continue" }}
        </button>
      </div>

      <!-- Practice -->
      <div v-else-if="currentSection.type === 'practice' && currentSection.problems">
        <h3 v-if="currentSection.title" class="text-lg font-semibold text-gray-800 mb-3">
          {{ currentSection.title }}
        </h3>
        <p v-if="currentSection.content" class="text-gray-600 mb-4">{{ currentSection.content }}</p>

        <div v-if="!practiceComplete && currentSection.problems[practiceIndex]">
          <p class="text-sm text-gray-500 mb-2">
            Practice {{ practiceIndex + 1 }} of {{ currentSection.problems.length }}
          </p>
          <ProblemView
            :problem="currentSection.problems[practiceIndex]"
            :topic-name="topicName"
            :available-hints="currentSection.problems[practiceIndex].hints ?? []"
            :show-solution="false"
            :hints-revealed="0"
            :ask-confidence="false"
            phase="lesson"
            message="Practice with the lesson as your guide."
            :key="currentSection.problems[practiceIndex].id"
            @submit="handlePracticeSubmit"
          />
        </div>
      </div>
    </div>

    <!-- Standalone practice problems (from API, after all sections) -->
    <div
      v-if="isLastSection && currentSection?.type !== 'practice' && practiceProblems.length > 0 && !practiceComplete"
      class="mt-6"
    >
      <h3 class="text-lg font-semibold text-gray-800 mb-3">Practice</h3>
      <p class="text-sm text-gray-500 mb-2">
        {{ practiceIndex + 1 }} of {{ practiceProblems.length }}
      </p>
      <ProblemView
        v-if="practiceProblems[practiceIndex]"
        :problem="practiceProblems[practiceIndex]"
        :topic-name="topicName"
        :available-hints="practiceProblems[practiceIndex].hints ?? []"
        :show-solution="false"
        :hints-revealed="0"
        :ask-confidence="false"
        phase="lesson"
        message="Practice what you just learned."
        :key="practiceProblems[practiceIndex].id"
        @submit="handleStandalonePracticeSubmit"
      />
    </div>
  </div>
</template>
