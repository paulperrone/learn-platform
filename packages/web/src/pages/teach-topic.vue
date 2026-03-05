<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useMeta } from "@/composables/useMeta";
import type { Topic, Problem, WorkedExample, VisualAsset } from "@learn/shared";
import VisualAid from "@/components/visuals/VisualAid.vue";

const route = useRoute();
const api = useApi();
const subjectId = route.params.subjectId as string;
const topicId = route.params.topicId as string;

const topic = ref<(Topic & { problems: Problem[]; examples: WorkedExample[] }) | null>(null);
const prerequisites = ref<{ from: string; to: string; strength: number }[]>([]);
const allTopics = ref<Topic[]>([]);
const loading = ref(true);
const error = ref(false);

// View modes
type ViewMode = "overview" | "lesson" | "practice";
const viewMode = ref<ViewMode>("overview");

// Lesson state (step-by-step worked example presentation)
const currentExampleIndex = ref(0);
const currentStep = ref(0);
const stepRevealed = ref(false);

// Practice state
const currentProblemIndex = ref(0);
const showAnswer = ref(false);

// Fullscreen
const isFullscreen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  const [topicResult, graphResult] = await Promise.all([
    withErrorToast(() => api.getPublicTopic(topicId), "Failed to load topic"),
    withErrorToast(() => api.getPublicGraph(subjectId), "Failed to load graph"),
  ]);

  if (topicResult) {
    topic.value = topicResult.topic;
    useMeta({
      title: `Teach: ${topicResult.topic.name}`,
      description: `Teach ${topicResult.topic.name} with step-by-step lessons and practice problems.`,
    });
  } else {
    error.value = true;
  }

  if (graphResult) {
    allTopics.value = graphResult.topics;
    prerequisites.value = graphResult.prerequisites;
  }

  loading.value = false;

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});

// Keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (viewMode.value === "lesson") {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      advanceLesson();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      retreatLesson();
    } else if (e.key === "Escape") {
      viewMode.value = "overview";
      exitFullscreen();
    }
  } else if (viewMode.value === "practice") {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (showAnswer.value) {
        nextProblem();
      } else {
        showAnswer.value = true;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextProblem();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevProblem();
    } else if (e.key === "Escape") {
      viewMode.value = "overview";
      exitFullscreen();
    }
  } else if (e.key === "Escape") {
    exitFullscreen();
  }
}

// Lesson navigation
function advanceLesson() {
  if (!topic.value) return;
  const example = topic.value.examples[currentExampleIndex.value];
  if (!example) return;

  if (!stepRevealed.value) {
    stepRevealed.value = true;
    return;
  }

  if (currentStep.value < example.steps.length - 1) {
    currentStep.value++;
    stepRevealed.value = false;
  } else if (currentExampleIndex.value < topic.value.examples.length - 1) {
    currentExampleIndex.value++;
    currentStep.value = 0;
    stepRevealed.value = false;
  }
}

function retreatLesson() {
  if (stepRevealed.value) {
    stepRevealed.value = false;
    return;
  }

  if (currentStep.value > 0) {
    currentStep.value--;
    stepRevealed.value = true;
  } else if (currentExampleIndex.value > 0) {
    currentExampleIndex.value--;
    const prevExample = topic.value!.examples[currentExampleIndex.value];
    currentStep.value = prevExample.steps.length - 1;
    stepRevealed.value = true;
  }
}

function startLesson(index: number) {
  currentExampleIndex.value = index;
  currentStep.value = 0;
  stepRevealed.value = false;
  viewMode.value = "lesson";
}

// Practice navigation
function startPractice() {
  currentProblemIndex.value = 0;
  showAnswer.value = false;
  viewMode.value = "practice";
}

function nextProblem() {
  if (!topic.value) return;
  if (currentProblemIndex.value < topic.value.problems.length - 1) {
    currentProblemIndex.value++;
  } else {
    currentProblemIndex.value = 0;
  }
  showAnswer.value = false;
}

function prevProblem() {
  if (!topic.value) return;
  if (currentProblemIndex.value > 0) {
    currentProblemIndex.value--;
  } else {
    currentProblemIndex.value = topic.value.problems.length - 1;
  }
  showAnswer.value = false;
}

// Fullscreen
async function toggleFullscreen() {
  if (!containerRef.value) return;
  if (!document.fullscreenElement) {
    await containerRef.value.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

// Prerequisite graph
const prereqTopics = computed(() => {
  const prereqIds = prerequisites.value.filter((p) => p.to === topicId).map((p) => p.from);
  return allTopics.value.filter((t) => prereqIds.includes(t.id));
});

const nextTopics = computed(() => {
  const nextIds = prerequisites.value.filter((p) => p.from === topicId).map((p) => p.to);
  return allTopics.value.filter((t) => nextIds.includes(t.id));
});

// Current items
const currentExample = computed(() => topic.value?.examples[currentExampleIndex.value]);
const currentProblem = computed(() => topic.value?.problems[currentProblemIndex.value]);

function gradeName(level: number) {
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

// Problem type label
function typeLabel(type?: string) {
  const labels: Record<string, string> = {
    "text-qa": "Short Answer",
    "numerical-input": "Numerical",
    "multi-step": "Multi-Step",
    "matching": "Matching",
    "multi-select": "Multi-Select",
    "equation-builder": "Equation",
  };
  return labels[type ?? "text-qa"] ?? type;
}

// Formatted answer display for different question types
function formatAnswer(problem: Problem): string {
  if (problem.type === "matching" && problem.typeProperties) {
    const tp = problem.typeProperties as { pairs: { left: string; right: string }[] };
    return tp.pairs?.map((p) => `${p.left} → ${p.right}`).join(", ") ?? problem.answer;
  }
  if (problem.type === "multi-step" && problem.typeProperties) {
    const tp = problem.typeProperties as { steps: { instruction: string; answer: string }[] };
    return tp.steps?.map((s, i) => `Step ${i + 1}: ${s.answer}`).join("\n") ?? problem.answer;
  }
  if (problem.type === "multi-select" && problem.typeProperties) {
    const tp = problem.typeProperties as { options: string[]; correctIndices: number[] };
    return tp.correctIndices?.map((i) => tp.options[i]).join(", ") ?? problem.answer;
  }
  return problem.answer;
}

function difficultyColor(d: string) {
  if (d === "easy") return "bg-green-100 text-green-700";
  if (d === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

// Print problem set
function printProblems(withAnswers: boolean) {
  if (!topic.value) return;
  const problems = topic.value.problems;
  const title = topic.value.name;

  const html = `<!DOCTYPE html>
<html><head><title>${title} - Problem Set</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-bottom: 2rem; }
  .problem { margin-bottom: 1.5rem; page-break-inside: avoid; }
  .problem-num { font-weight: bold; color: #333; }
  .question { margin: 0.25rem 0 0.5rem 1.5rem; }
  .answer { margin-left: 1.5rem; color: #059669; font-weight: 500; }
  .difficulty { font-size: 0.75rem; color: #888; margin-left: 0.5rem; }
  .solution { margin-left: 1.5rem; color: #555; font-size: 0.9rem; margin-top: 0.25rem; }
  .answer-line { border-bottom: 1px solid #ccc; width: 200px; display: inline-block; margin-left: 1.5rem; height: 1.5rem; }
  @media print { body { margin: 1rem; } }
</style></head><body>
<h1>${title}</h1>
<p class="subtitle">${problems.length} problems</p>
${problems
  .map(
    (p, i) => `<div class="problem">
  <span class="problem-num">${i + 1}.</span><span class="difficulty">[${p.difficulty}]</span>
  <div class="question">${p.question}</div>
  ${withAnswers ? `<div class="answer">Answer: ${formatAnswer(p)}</div><div class="solution">${p.solution}</div>` : '<div class="answer-line"></div>'}
</div>`,
  )
  .join("\n")}
</body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}
</script>

<template>
  <div ref="containerRef" :class="isFullscreen ? 'bg-white p-8 overflow-auto h-screen' : ''">
    <!-- Breadcrumb (not in fullscreen) -->
    <nav v-if="!isFullscreen" class="mb-4 text-sm text-gray-500">
      <RouterLink to="/teach" class="hover:text-blue-600">Teach</RouterLink>
      <span class="mx-2">/</span>
      <span class="text-gray-900">{{ topic?.name ?? "..." }}</span>
    </nav>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading topic...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-12">
      <p class="text-gray-500 mb-4">Topic not found.</p>
      <RouterLink to="/teach" class="text-blue-600 hover:underline text-sm">&larr; Back to topics</RouterLink>
    </div>

    <!-- ========================== OVERVIEW MODE ========================== -->
    <template v-else-if="topic && viewMode === 'overview'">
      <div class="mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ topic.name }}</h1>
            <p class="text-gray-600">{{ topic.description }}</p>
          </div>
          <button
            @click="toggleFullscreen"
            class="shrink-0 ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Toggle fullscreen"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-3 mt-3">
          <span class="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            {{ gradeName(topic.gradeLevel) }}
          </span>
          <span v-if="topic.standardCode" class="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-mono">
            {{ topic.standardCode }}
          </span>
          <span class="text-sm text-gray-500">{{ topic.examples.length }} lessons</span>
          <span class="text-sm text-gray-500">{{ topic.problems.length }} problems</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex flex-wrap gap-3 mb-8">
        <button
          v-if="topic.examples.length > 0"
          @click="startLesson(0)"
          class="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Present Lesson
        </button>
        <button
          v-if="topic.problems.length > 0"
          @click="startPractice"
          class="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          Show Problems
        </button>
        <button
          v-if="topic.problems.length > 0"
          @click="printProblems(false)"
          class="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Print Problems
        </button>
        <button
          v-if="topic.problems.length > 0"
          @click="printProblems(true)"
          class="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Print with Answers
        </button>
      </div>

      <!-- Worked examples list -->
      <div v-if="topic.examples.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Lessons</h2>
        <div class="space-y-2">
          <button
            v-for="(example, i) in topic.examples"
            :key="example.id"
            @click="startLesson(i)"
            class="w-full bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left flex items-center gap-4"
          >
            <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center shrink-0">
              {{ i + 1 }}
            </span>
            <div class="flex-1">
              <h3 class="font-medium text-gray-900">{{ example.title }}</h3>
              <p class="text-sm text-gray-500">{{ example.steps.length }} steps</p>
            </div>
            <span class="text-blue-600 text-sm">Present &rarr;</span>
          </button>
        </div>
      </div>

      <!-- Problems preview -->
      <div v-if="topic.problems.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Problem Pool</h2>
        <div class="grid gap-2 sm:grid-cols-2">
          <div
            v-for="(problem, i) in topic.problems"
            :key="problem.id"
            class="bg-white rounded-lg border border-gray-200 p-3 text-sm"
          >
            <div class="flex items-center gap-2">
              <span class="text-gray-400 font-medium">{{ i + 1 }}</span>
              <span class="flex-1 text-gray-700 truncate">{{ problem.question }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="difficultyColor(problem.difficulty)">
                {{ problem.difficulty }}
              </span>
              <span v-if="problem.type && problem.type !== 'text-qa'" class="text-xs text-gray-400">
                {{ typeLabel(problem.type) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Teach Next (prerequisite graph) -->
      <div v-if="nextTopics.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Teach Next</h2>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            v-for="t in nextTopics"
            :key="t.id"
            :to="`/teach/${subjectId}/${t.id}`"
            class="bg-white border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm hover:bg-green-50 transition-colors"
          >
            {{ t.name }} &rarr;
          </RouterLink>
        </div>
      </div>

      <!-- Prerequisites -->
      <div v-if="prereqTopics.length > 0" class="mb-8">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Prerequisites</h2>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            v-for="t in prereqTopics"
            :key="t.id"
            :to="`/teach/${subjectId}/${t.id}`"
            class="bg-white border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm hover:bg-orange-50 transition-colors"
          >
            &larr; {{ t.name }}
          </RouterLink>
        </div>
      </div>
    </template>

    <!-- ========================== LESSON MODE ========================== -->
    <template v-else-if="topic && viewMode === 'lesson' && currentExample">
      <div class="max-w-4xl mx-auto">
        <!-- Lesson toolbar -->
        <div class="flex items-center justify-between mb-6">
          <button
            @click="viewMode = 'overview'; exitFullscreen()"
            class="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            &larr; Back
          </button>
          <div class="text-sm text-gray-400">
            Lesson {{ currentExampleIndex + 1 }}/{{ topic.examples.length }} &middot;
            Step {{ currentStep + 1 }}/{{ currentExample.steps.length }}
          </div>
          <button
            @click="toggleFullscreen"
            class="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Toggle fullscreen (F11)"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>

        <!-- Example title -->
        <h2 :class="isFullscreen ? 'text-4xl' : 'text-2xl'" class="font-bold text-gray-900 mb-6 text-center">
          {{ currentExample.title }}
        </h2>

        <!-- Visual aids -->
        <div v-if="currentExample.visuals?.length" class="mb-6">
          <VisualAid :visuals="currentExample.visuals" />
        </div>

        <!-- Step progress -->
        <div class="flex gap-1.5 mb-6">
          <div
            v-for="(_, i) in currentExample.steps"
            :key="i"
            class="h-2 flex-1 rounded-full transition-colors"
            :class="i < currentStep ? 'bg-blue-500' : i === currentStep ? 'bg-blue-400' : 'bg-gray-200'"
          />
        </div>

        <!-- Current step -->
        <div class="space-y-6">
          <!-- Subgoal label -->
          <div class="flex items-center gap-3">
            <span :class="isFullscreen ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm'" class="rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
              {{ currentStep + 1 }}
            </span>
            <span :class="isFullscreen ? 'text-xl' : 'text-base'" class="font-semibold text-blue-800">
              {{ currentExample.steps[currentStep].subgoalLabel }}
            </span>
          </div>

          <!-- Instruction -->
          <div class="bg-blue-50 rounded-xl p-6">
            <p :class="isFullscreen ? 'text-2xl' : 'text-lg'" class="text-gray-800">
              {{ currentExample.steps[currentStep].instruction }}
            </p>
          </div>

          <!-- Work (the math) — always visible -->
          <div class="bg-gray-50 rounded-xl p-6 text-center">
            <p :class="isFullscreen ? 'text-4xl' : 'text-2xl'" class="font-mono text-gray-900">
              {{ currentExample.steps[currentStep].work }}
            </p>
          </div>

          <!-- Explanation — revealed on click -->
          <div v-if="stepRevealed" class="bg-green-50 rounded-xl p-6 border border-green-200">
            <p :class="isFullscreen ? 'text-xl' : 'text-base'" class="text-gray-700">
              {{ currentExample.steps[currentStep].explanation }}
            </p>
          </div>
        </div>

        <!-- Navigation hint -->
        <div class="mt-8 text-center text-sm text-gray-400">
          <span v-if="!stepRevealed">Press <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Space</kbd> or <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">&rarr;</kbd> to reveal explanation</span>
          <span v-else>Press <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Space</kbd> or <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">&rarr;</kbd> to advance &middot; <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">&larr;</kbd> to go back &middot; <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> to exit</span>
        </div>

        <!-- Click-to-advance overlay (for touchscreens/clicking) -->
        <div class="flex justify-center gap-4 mt-6">
          <button
            @click="retreatLesson"
            :disabled="currentExampleIndex === 0 && currentStep === 0 && !stepRevealed"
            class="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            &larr; Back
          </button>
          <button
            @click="advanceLesson"
            class="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {{ !stepRevealed ? "Reveal" : currentStep < currentExample.steps.length - 1 || currentExampleIndex < topic.examples.length - 1 ? "Next" : "Done" }}
          </button>
        </div>
      </div>
    </template>

    <!-- ========================== PRACTICE MODE ========================== -->
    <template v-else-if="topic && viewMode === 'practice' && currentProblem">
      <div class="max-w-4xl mx-auto">
        <!-- Practice toolbar -->
        <div class="flex items-center justify-between mb-6">
          <button
            @click="viewMode = 'overview'; exitFullscreen()"
            class="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            &larr; Back
          </button>
          <div class="text-sm text-gray-400">
            Problem {{ currentProblemIndex + 1 }}/{{ topic.problems.length }}
            <span class="mx-2">&middot;</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="difficultyColor(currentProblem.difficulty)">
              {{ currentProblem.difficulty }}
            </span>
            <span v-if="currentProblem.type && currentProblem.type !== 'text-qa'" class="ml-2 text-xs text-gray-400">
              {{ typeLabel(currentProblem.type) }}
            </span>
          </div>
          <button
            @click="toggleFullscreen"
            class="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Toggle fullscreen"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>

        <!-- Question -->
        <div class="bg-gray-50 rounded-xl p-8 mb-6">
          <p :class="isFullscreen ? 'text-3xl' : 'text-xl'" class="text-gray-900 whitespace-pre-wrap text-center">
            {{ currentProblem.question }}
          </p>
          <VisualAid v-if="currentProblem.visuals?.length" :visuals="currentProblem.visuals" />
        </div>

        <!-- Answer reveal -->
        <div v-if="showAnswer" class="space-y-4 mb-6">
          <div class="bg-green-50 rounded-xl p-6 border border-green-200">
            <p class="text-sm font-medium text-green-800 mb-2">Answer</p>
            <p :class="isFullscreen ? 'text-2xl' : 'text-lg'" class="text-green-900 font-medium whitespace-pre-wrap">
              {{ formatAnswer(currentProblem) }}
            </p>
          </div>
          <div class="bg-gray-50 rounded-xl p-6">
            <p class="text-sm font-medium text-gray-500 mb-2">Solution</p>
            <p :class="isFullscreen ? 'text-lg' : 'text-base'" class="text-gray-700 whitespace-pre-wrap">
              {{ currentProblem.solution }}
            </p>
          </div>
          <div v-if="currentProblem.hints.length > 0" class="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
            <p class="text-sm font-medium text-yellow-800 mb-2">Hints</p>
            <ol class="list-decimal list-inside space-y-1">
              <li v-for="(hint, i) in currentProblem.hints" :key="i" :class="isFullscreen ? 'text-base' : 'text-sm'" class="text-yellow-900">
                {{ hint }}
              </li>
            </ol>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex justify-center gap-4">
          <button
            @click="prevProblem"
            class="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            &larr; Previous
          </button>
          <button
            v-if="!showAnswer"
            @click="showAnswer = true"
            class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Show Answer
          </button>
          <button
            @click="nextProblem"
            class="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Next &rarr;
          </button>
        </div>

        <!-- Navigation hint -->
        <div class="mt-6 text-center text-sm text-gray-400">
          <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Space</kbd> show/next &middot;
          <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">&larr;</kbd> <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">&rarr;</kbd> navigate &middot;
          <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> exit
        </div>
      </div>
    </template>
  </div>
</template>
