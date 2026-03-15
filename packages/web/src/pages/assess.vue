<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "vue-chartjs";
import { useApi, withErrorToast } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";
import AssessmentQuestion from "@/components/AssessmentQuestion.vue";
import AssessmentResults from "@/components/AssessmentResults.vue";
import type {
  AssessmentSessionConfig,
  AssessmentScope,
  AssessmentItem,
  AssessmentResult,
  AssessmentSummary,
} from "@learn/shared";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

const api = useApi();
const { isAuthenticated } = useAuth();

// ===== State =====

type View = "start" | "session" | "result";
const view = ref<View>("start");

// Config form
const scopeType = ref<AssessmentScope["type"]>("comprehensive");
const gradeLevel = ref<number>(3);
const strandId = ref<string>("");
const collectionId = ref<string>("");
const questionCount = ref<number>(20);
const timeLimitMinutes = ref<number | null>(null);

// Session state
const sessionId = ref<string | null>(null);
const currentItem = ref<AssessmentItem | null>(null);
const totalQuestions = ref<number>(0);
const result = ref<AssessmentResult | null>(null);

// History
const history = ref<AssessmentSummary[]>([]);
const historyLoading = ref(false);
const selectedHistoryResult = ref<AssessmentResult | null>(null);

// Loading
const starting = ref(false);
const submitting = ref(false);
const startError = ref<string | null>(null);

const gradeLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const timeLimitOptions = [
  { label: "Untimed", value: null },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "60 minutes", value: 60 },
];

const questionCountOptions = [10, 20, 30, 50];

// ===== History chart =====

const historyByScope = computed(() => {
  const completed = history.value.filter((h) => h.status === "completed" || h.status === "timed-out");
  return completed;
});

const chartData = computed(() => {
  const recent = historyByScope.value.slice(-10);
  return {
    labels: recent.map((h, i) => {
      const d = new Date(h.startedAt);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }),
    datasets: [
      {
        label: "Score %",
        data: recent.map((h) => Math.round((h.rawScore ?? 0) * 100)),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { min: 0, max: 100, ticks: { callback: (v: string | number) => `${v}%` } },
  },
};

// ===== Actions =====

onMounted(async () => {
  if (isAuthenticated.value) {
    await loadHistory();
  }
});

async function loadHistory() {
  historyLoading.value = true;
  const res = await withErrorToast(() => api.getAssessmentHistory(), "Failed to load history");
  if (res) {
    history.value = res.assessments;
  }
  historyLoading.value = false;
}

async function startAssessment() {
  starting.value = true;
  startError.value = null;

  const scope: AssessmentScope = { type: scopeType.value };
  if (scopeType.value === "grade-band") scope.gradeLevel = gradeLevel.value;
  if (scopeType.value === "strand") scope.strandId = strandId.value;
  if (scopeType.value === "collection") scope.collectionId = collectionId.value;

  const config: AssessmentSessionConfig = {
    scope,
    questionCount: questionCount.value,
    timeLimitMinutes: timeLimitMinutes.value ?? undefined,
  };

  const res = await withErrorToast(() => api.startAssessment(config), "Failed to start assessment");
  starting.value = false;

  if (!res || !res.firstItem) {
    startError.value = res === undefined
      ? "No topics available in the selected scope. Try a different scope or complete more learning first."
      : "No questions available for the selected topics. Please try again.";
    return;
  }

  sessionId.value = res.sessionId;
  currentItem.value = res.firstItem;
  totalQuestions.value = res.totalQuestions;
  view.value = "session";
}

async function handleSubmit(data: { answer: string; responseMs: number }) {
  if (!sessionId.value || submitting.value) return;
  submitting.value = true;

  const res = await withErrorToast(
    () => api.respondToAssessment(sessionId.value!, { answer: data.answer, responseMs: data.responseMs }),
    "Failed to submit answer",
  );
  submitting.value = false;

  if (!res) return;

  if (res.result) {
    result.value = res.result;
    view.value = "result";
    await loadHistory();
  } else if (res.nextItem) {
    currentItem.value = res.nextItem;
  }
}

function handleRetake() {
  sessionId.value = null;
  currentItem.value = null;
  result.value = null;
  startError.value = null;
  view.value = "start";
}

async function viewHistoryResult(sessionIdToView: string) {
  const res = await withErrorToast(() => api.getAssessmentResult(sessionIdToView), "Failed to load result");
  if (res) {
    selectedHistoryResult.value = res;
  }
}

function formatScopeLabel(scope: AssessmentScope): string {
  if (scope.type === "comprehensive") return "All Topics";
  if (scope.type === "grade-band") return `Grade ${scope.gradeLevel}`;
  if (scope.type === "strand") return `Strand: ${scope.strandId}`;
  if (scope.type === "collection") return `Collection`;
  return "Custom";
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4">
    <div class="max-w-2xl mx-auto">

      <!-- Start view -->
      <template v-if="view === 'start'">
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 mb-1">Assessment</h1>
          <p class="text-gray-500 text-sm">Test your knowledge across topics. No hints, no scaffolding — just what you know.</p>
        </div>

        <!-- Config card -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Configure Test</h2>

          <!-- Scope -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Scope</label>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="opt in [
                  { value: 'comprehensive', label: 'Everything' },
                  { value: 'grade-band', label: 'Grade Level' },
                  { value: 'strand', label: 'Strand' },
                ]"
                :key="opt.value"
                class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                :class="scopeType === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                @click="scopeType = opt.value as AssessmentScope['type']"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Grade level picker -->
          <div v-if="scopeType === 'grade-band'" class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Grade Level</label>
            <select
              v-model="gradeLevel"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
            >
              <option v-for="g in gradeLevels" :key="g" :value="g">
                {{ g === 0 ? "Kindergarten" : `Grade ${g}` }}
              </option>
            </select>
          </div>

          <!-- Strand input -->
          <div v-if="scopeType === 'strand'" class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Strand ID</label>
            <input
              v-model="strandId"
              type="text"
              placeholder="e.g. counting-cardinality"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
            />
          </div>

          <!-- Question count -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Questions</label>
            <div class="flex gap-2">
              <button
                v-for="n in questionCountOptions"
                :key="n"
                class="flex-1 rounded-lg border py-2 text-sm font-medium transition-colors"
                :class="questionCount === n
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                @click="questionCount = n"
              >
                {{ n }}
              </button>
            </div>
          </div>

          <!-- Time limit -->
          <div class="mb-5">
            <label class="block text-sm font-medium text-gray-700 mb-2">Time Limit</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="opt in timeLimitOptions"
                :key="String(opt.value)"
                class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                :class="timeLimitMinutes === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                @click="timeLimitMinutes = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <p v-if="startError" class="text-sm text-red-600 mb-3">{{ startError }}</p>

          <button
            class="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            :disabled="starting || (scopeType === 'strand' && !strandId)"
            @click="startAssessment"
          >
            {{ starting ? "Setting up test..." : "Start Assessment" }}
          </button>
        </div>

        <!-- History -->
        <div v-if="history.length > 0" class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Past Assessments</h2>

          <!-- Trend chart (3+ assessments) -->
          <div v-if="historyByScope.length >= 3" class="mb-5 h-32">
            <Line :data="chartData" :options="chartOptions" />
          </div>

          <div class="divide-y divide-gray-100">
            <div
              v-for="item in history.slice(0, 10)"
              :key="item.sessionId"
              class="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
              @click="viewHistoryResult(item.sessionId)"
            >
              <div>
                <div class="text-sm font-medium text-gray-900">{{ formatScopeLabel(item.scope) }}</div>
                <div class="text-xs text-gray-500">{{ formatDate(item.startedAt) }} · {{ item.totalQuestions }}Q</div>
              </div>
              <div class="text-right">
                <div
                  v-if="item.rawScore != null"
                  class="text-sm font-semibold"
                  :class="item.rawScore >= 0.8 ? 'text-green-600' : item.rawScore >= 0.5 ? 'text-yellow-600' : 'text-red-600'"
                >
                  {{ Math.round(item.rawScore * 100) }}%
                </div>
                <div v-else class="text-sm text-gray-400">In progress</div>
                <div v-if="item.status === 'timed-out'" class="text-xs text-orange-500">Timed out</div>
              </div>
            </div>
          </div>
        </div>

        <!-- History result modal -->
        <div
          v-if="selectedHistoryResult"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          @click.self="selectedHistoryResult = null"
        >
          <div class="bg-gray-50 rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-semibold text-gray-900">Assessment Result</h2>
              <button class="text-gray-400 hover:text-gray-600" @click="selectedHistoryResult = null">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AssessmentResults
              :result="selectedHistoryResult"
              @retake="selectedHistoryResult = null; startAssessment()"
            />
          </div>
        </div>
      </template>

      <!-- Session view -->
      <template v-else-if="view === 'session' && currentItem">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-lg font-semibold text-gray-900">Assessment</h1>
          <button
            class="text-sm text-gray-400 hover:text-gray-600"
            @click="handleRetake"
          >
            Exit
          </button>
        </div>
        <AssessmentQuestion
          :item="currentItem"
          @submit="handleSubmit"
        />
      </template>

      <!-- Result view -->
      <template v-else-if="view === 'result' && result">
        <div class="mb-6">
          <h1 class="text-xl font-bold text-gray-900">Results</h1>
        </div>
        <AssessmentResults
          :result="result"
          @retake="handleRetake"
        />
      </template>

    </div>
  </div>
</template>
