<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import { useMeta } from "@/composables/useMeta";
import type { Topic, Problem, WorkedExample } from "@learn/shared";

const route = useRoute();
const api = useApi();
const auth = useAuth();
const subjectId = route.params.subjectId as string;
const topicId = route.params.topicId as string;

const topic = ref<(Topic & { problems: Problem[]; examples: WorkedExample[] }) | null>(null);
const prereqTopics = ref<Topic[]>([]);
const loading = ref(true);
const error = ref(false);
const activeTab = ref<"problems" | "examples">("problems");
const expandedProblem = ref<string | null>(null);
const expandedExample = ref<string | null>(null);
const userTopicStatus = ref<"not-started" | "in-progress" | "mastered" | "frontier">("not-started");
const prereqStatusMap = ref<Map<string, string>>(new Map());

onMounted(async () => {
  const [topicResult, graphResult] = await Promise.all([
    withErrorToast(() => api.getPublicTopic(topicId), "Failed to load topic"),
    withErrorToast(() => api.getPublicGraph(subjectId), "Failed to load graph"),
  ]);

  if (topicResult) {
    topic.value = topicResult.topic;

    useMeta({
      title: `${topicResult.topic.name} — Explore`,
      description: `${topicResult.topic.name}: ${topicResult.topic.description}. ${topicResult.topic.problems.length} practice problems and ${topicResult.topic.examples.length} worked examples.`,
    });
  } else {
    error.value = true;
  }

  if (graphResult) {
    const prereqIds = graphResult.prerequisites
      .filter((p) => p.to === topicId)
      .map((p) => p.from);
    prereqTopics.value = graphResult.topics.filter((t) => prereqIds.includes(t.id));
  }

  // Load user state for this topic if authenticated
  if (auth.isAuthenticated.value) {
    const userState = await api.getUserGraphState(subjectId).catch(() => null);
    if (userState) {
      const thisTopicState = userState.topics.find((t) => t.id === topicId);
      if (thisTopicState) {
        userTopicStatus.value = thisTopicState.status;
      }
      for (const t of userState.topics) {
        prereqStatusMap.value.set(t.id, t.status);
      }
    }
  }

  loading.value = false;
});

function gradeName(level: number) {
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

function difficultyColor(d: string) {
  if (d === "easy") return "bg-green-100 text-green-700";
  if (d === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

const problemsByDifficulty = computed(() => {
  if (!topic.value) return [];
  const order = ["easy", "medium", "hard"];
  return [...topic.value.problems].sort(
    (a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty)
  );
});

function toggleProblem(id: string) {
  expandedProblem.value = expandedProblem.value === id ? null : id;
}

function toggleExample(id: string) {
  expandedExample.value = expandedExample.value === id ? null : id;
}
</script>

<template>
  <div>
    <!-- Breadcrumb -->
    <nav class="mb-4 text-sm text-gray-500">
      <RouterLink to="/explore" class="hover:text-blue-600">Explore</RouterLink>
      <span class="mx-2">/</span>
      <RouterLink :to="`/explore/${subjectId}`" class="hover:text-blue-600">{{ topic?.subjectId ?? subjectId }}</RouterLink>
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
      <RouterLink :to="`/explore/${subjectId}`" class="text-blue-600 hover:underline text-sm">&larr; Back to subject</RouterLink>
    </div>

    <template v-else-if="topic">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">{{ topic.name }}</h1>
        <p class="text-gray-600 text-lg">{{ topic.description }}</p>

        <div class="flex flex-wrap items-center gap-4 mt-4">
          <span class="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            {{ gradeName(topic.gradeLevel) }}
          </span>
          <span v-if="topic.standardCode" class="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-mono">
            {{ topic.standardCode }}
          </span>
          <span class="text-sm text-gray-500">
            Depth {{ topic.depth }}
          </span>
          <span class="text-sm text-gray-500">
            {{ topic.problems.length }} problems
          </span>
          <span class="text-sm text-gray-500">
            {{ topic.examples.length }} worked examples
          </span>
        </div>
      </div>

      <!-- User mastery state (authenticated only) -->
      <div v-if="auth.isAuthenticated.value && userTopicStatus !== 'not-started'" class="mb-6 rounded-lg border p-4"
        :class="{
          'bg-green-50 border-green-200': userTopicStatus === 'mastered',
          'bg-blue-50 border-blue-200': userTopicStatus === 'in-progress',
          'bg-amber-50 border-amber-200': userTopicStatus === 'frontier',
        }"
      >
        <div class="flex items-center gap-2">
          <span v-if="userTopicStatus === 'mastered'" class="text-green-700 font-medium text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
            You've mastered this topic
          </span>
          <span v-else-if="userTopicStatus === 'in-progress'" class="text-blue-700 font-medium text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" /></svg>
            In progress — keep practicing
          </span>
          <span v-else-if="userTopicStatus === 'frontier'" class="text-amber-700 font-medium text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7" /></svg>
            Ready to learn — start a session to begin
          </span>
        </div>
      </div>

      <!-- Prerequisites -->
      <div v-if="prereqTopics.length > 0" class="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
        <h2 class="text-sm font-semibold text-orange-800 mb-2">
          Prerequisites ({{ prereqTopics.length }})
        </h2>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            v-for="prereq in prereqTopics"
            :key="prereq.id"
            :to="`/explore/${subjectId}/${prereq.id}`"
            class="text-sm border px-3 py-1 rounded-full hover:opacity-80 transition-colors flex items-center gap-1"
            :class="prereqStatusMap.get(prereq.id) === 'mastered'
              ? 'bg-green-50 border-green-300 text-green-700'
              : prereqStatusMap.get(prereq.id) === 'in-progress'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-orange-200 text-orange-700'"
          >
            <svg v-if="prereqStatusMap.get(prereq.id) === 'mastered'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
            {{ prereq.name }}
          </RouterLink>
        </div>
      </div>

      <!-- Tab switcher -->
      <div class="border-b border-gray-200 mb-6">
        <div class="flex gap-6">
          <button
            @click="activeTab = 'problems'"
            class="pb-3 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'problems' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
          >
            Problems ({{ topic.problems.length }})
          </button>
          <button
            @click="activeTab = 'examples'"
            class="pb-3 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'examples' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
          >
            Worked Examples ({{ topic.examples.length }})
          </button>
        </div>
      </div>

      <!-- Problems tab -->
      <div v-if="activeTab === 'problems'">
        <div v-if="topic.problems.length === 0" class="text-center py-8 text-gray-500">
          No problems available for this topic yet.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(problem, i) in problemsByDifficulty"
            :key="problem.id"
            class="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            <button
              @click="toggleProblem(problem.id)"
              class="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <span class="text-sm font-medium text-gray-400 w-6">{{ i + 1 }}</span>
              <span class="flex-1 text-gray-900">{{ problem.question }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="difficultyColor(problem.difficulty)">
                {{ problem.difficulty }}
              </span>
              <svg
                class="w-4 h-4 text-gray-400 transition-transform"
                :class="{ 'rotate-180': expandedProblem === problem.id }"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-if="expandedProblem === problem.id" class="border-t border-gray-100 p-4 bg-gray-50">
              <div class="space-y-3">
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Answer</h4>
                  <p class="text-gray-900 font-medium">{{ problem.answer }}</p>
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Solution</h4>
                  <p class="text-gray-700 text-sm whitespace-pre-wrap">{{ problem.solution }}</p>
                </div>
                <div v-if="problem.hints.length > 0">
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Hints ({{ problem.hints.length }})</h4>
                  <ol class="list-decimal list-inside space-y-1">
                    <li v-for="(hint, hi) in problem.hints" :key="hi" class="text-sm text-gray-600">
                      {{ hint }}
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Examples tab -->
      <div v-if="activeTab === 'examples'">
        <div v-if="topic.examples.length === 0" class="text-center py-8 text-gray-500">
          No worked examples available for this topic yet.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="example in topic.examples"
            :key="example.id"
            class="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            <button
              @click="toggleExample(example.id)"
              class="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <span class="flex-1 text-gray-900 font-medium">{{ example.title }}</span>
              <span class="text-xs text-gray-400">{{ example.steps.length }} steps</span>
              <svg
                class="w-4 h-4 text-gray-400 transition-transform"
                :class="{ 'rotate-180': expandedExample === example.id }"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-if="expandedExample === example.id" class="border-t border-gray-100">
              <div
                v-for="(step, si) in example.steps"
                :key="si"
                class="p-4 border-b border-gray-100 last:border-b-0"
                :class="si % 2 === 0 ? 'bg-gray-50' : 'bg-white'"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {{ si + 1 }}
                  </span>
                  <span class="text-sm font-semibold text-blue-800">{{ step.subgoalLabel }}</span>
                </div>
                <p class="text-sm text-gray-600 mb-1">{{ step.instruction }}</p>
                <div class="bg-white border border-gray-200 rounded px-3 py-2 mb-1">
                  <p class="text-sm font-mono text-gray-900">{{ step.work }}</p>
                </div>
                <p class="text-xs text-gray-500 italic">{{ step.explanation }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-10 bg-blue-50 border border-blue-200 rounded-lg p-5 text-center">
        <p class="text-blue-900 font-medium mb-2">Want to practice these problems with AI tutoring?</p>
        <p class="text-sm text-blue-700 mb-4">Get personalized hints, spaced repetition scheduling, and adaptive difficulty.</p>
        <RouterLink to="/signup" class="inline-block rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
          Sign up free
        </RouterLink>
      </div>
    </template>
  </div>
</template>
