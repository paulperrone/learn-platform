<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";

const api = useApi();

const loading = ref(true);
const error = ref(false);
const activeTab = ref<"overview" | "models" | "usage" | "content" | "quality" | "patterns" | "system" | "matrix" | "llm-effectiveness">("overview");

// Data
const stats = ref<{
  totalUsers: number;
  totalFamilies: number;
  totalTopics: number;
  totalReviews: number;
  totalInstructionalContent: number;
  totalAssessmentContent: number;
  llmCostCentsAllTime: number;
  llmCostCentsThisMonth: number;
  contentByLocale: { locale: string; instructional: number; assessment: number }[];
  contentByFlavor: { flavor: string; instructional: number; assessment: number }[];
} | null>(null);

const systemStats = ref<{
  activeUsers7d: number;
  activeUsers30d: number;
  contentVolume: { type: string; count: number }[];
  llmSummary: { totalCalls: number; totalCostCents: number; totalInputTokens: number; totalOutputTokens: number; uniqueModels: number };
  contentVelocity: { week: string; instructional: number; assessment: number }[];
} | null>(null);

const llmConfigs = ref<{ tier: string; modelId: string; costInputPerM: number; costOutputPerM: number; updatedAt: string }[]>([]);
const llmUsage = ref<{
  byPurpose: { purpose: string; calls: number; totalCostCents: number; totalInputTokens: number; totalOutputTokens: number }[];
  byModel: { model: string; calls: number; totalCostCents: number }[];
} | null>(null);
const topUsers = ref<{ userId: string; userName: string; calls: number; totalCostCents: number }[]>([]);
const contentEffectiveness = ref<{
  strugglingTopics: { topicId: string; topicName: string; totalAttempts: number; accuracy: number; hintsPerAttempt: number; masteryRate: number; avgReps: number; uniqueLearners: number }[];
} | null>(null);
const contentQuality = ref<{
  topicQuality: { topicId: string; topicName: string; gradeLevel: number; totalAttempts: number; correctAttempts: number; accuracy: number; avgHintsUsed: number; avgResponseMs: number; uniqueLearners: number }[];
  problemQuality: { assessmentContentId: string; topicId: string; question: string; difficulty: string; type: string; attempts: number; correct: number; accuracy: number; avgHints: number }[];
} | null>(null);
const difficultySpikes = ref<{
  spikes: { prereqTopicId: string; prereqTopicName: string; prereqAccuracy: number; prereqAttempts: number; dependentTopicId: string; dependentTopicName: string; dependentAccuracy: number; dependentAttempts: number; accuracyDrop: number }[];
} | null>(null);
const contentVersions = ref<{
  versionComparison: { topicId: string; topicName: string; version: number; contentUpdatedAt: string; attemptsBefore: number; accuracyBefore: number; attemptsAfter: number; accuracyAfter: number }[];
} | null>(null);
const contentMatrix = ref<{
  disciplines: { id: string; name: string; gradeRange: string }[];
  matrix: {
    topicId: string;
    topicName: string;
    gradeLevel: number;
    disciplineId: string;
    disciplineName: string;
    totalInstructional: number;
    totalAssessment: number;
    hasAssets: boolean;
    instructional: { flavor: string; locale: string; presentation: string; count: number; maxVersion: number; hasAssets: boolean }[];
    assessment: { flavor: string; locale: string; poolSize: number; easy: number; medium: number; hard: number }[];
    questionTypes: Record<string, number>;
    quality: { accuracy: number; attempts: number } | null;
    gaps: { icMissing: number; acMissing: number; poolBelowTarget: boolean; missingDifficulties: boolean };
  }[];
  dimensions: { flavors: string[]; locales: string[]; targetPoolSize: number };
  gapSummary: {
    totalTopics: number;
    totalMatrixCells: number;
    filledCells: number;
    fillPercentage: number;
    topicsWithPoolBelowTarget: number;
    topicsWithMissingDifficulties: number;
    topicsWithNoAssets: number;
    topicsWithLowQuality: number;
  };
} | null>(null);
const matrixFilter = ref<{ discipline: string | null; grade: number | null; flavor: string | null; locale: string | null; gapsOnly: boolean }>({
  discipline: null,
  grade: null,
  flavor: null,
  locale: null,
  gapsOnly: false,
});
const matrixSort = ref<"name" | "grade" | "gaps" | "quality" | "pool">("grade");
const selectedMatrixTopic = ref<string | null>(null);

// Grade level display frameworks
type GradeFramework = "us" | "uk" | "generic";
const gradeFramework = ref<GradeFramework>("us");

const gradeLabels: Record<GradeFramework, (level: number) => string> = {
  us: (level) => {
    if (level === 0) return "Kindergarten";
    if (level <= 12) return `Grade ${level}`;
    return `Level ${level}`;
  },
  uk: (level) => {
    if (level === 0) return "Reception";
    if (level <= 2) return `KS1 (Year ${level})`;
    if (level <= 6) return `KS2 (Year ${level})`;
    if (level <= 9) return `KS3 (Year ${level})`;
    if (level <= 11) return `KS4 (Year ${level})`;
    return `KS5 (Year ${level})`;
  },
  generic: (level) => `Level ${level}`,
};

function gradeLabel(level: number): string {
  return gradeLabels[gradeFramework.value](level);
}
const selectedQualityTopic = ref<string | null>(null);

// LLM Effectiveness data
const llmEffectiveness = ref<{
  overall: { llmAccuracy: number | null; baselineAccuracy: number | null; llmAttempts: number; baselineAttempts: number };
  topics: { topicId: string; llmAccuracy: number; baselineAccuracy: number; delta: number; llmAttempts: number; baselineAttempts: number }[];
} | null>(null);
const llmHintOutcomes = ref<{
  hintOutcomes: { hintSource: string; nextAttemptAccuracy: number | null; sampleSize: number }[];
} | null>(null);
const llmMasteryImpact = ref<{
  llmAssisted: { avgRepsToMastery: number | null; avgLapses: number | null; topicCount: number };
  baseline: { avgRepsToMastery: number | null; avgLapses: number | null; topicCount: number };
} | null>(null);
const llmCohorts = ref<{
  cohorts: { cohort: string; userCount: number; avgAccuracy: number | null; totalAttempts: number; masteredTopics: number; avgRepsToMastery: number | null; avgLapseRate: number | null }[];
} | null>(null);
const learningPatterns = ref<{
  hintPatterns: { hintsUsed: number; count: number; avgCorrect: number }[];
  responseByPhase: { phase: string; avgResponseMs: number; count: number; accuracy: number }[];
  dailyActivity: { date: string; reviews: number; uniqueUsers: number }[];
} | null>(null);

// Edit state for model config
const editingTier = ref<string | null>(null);
const editForm = ref({ modelId: "", costInputPerM: 0, costOutputPerM: 0 });
const saving = ref(false);

onMounted(async () => {
  const result = await withErrorToast(async () => {
    const [s, sys, configs, usage, users, content, patterns, quality, spikes, versions, matrix, llmEff, llmHints, llmMastery, llmCohort] = await Promise.all([
      api.getAdminStats(),
      api.getAdminSystemStats(),
      api.getAdminLLMConfig(),
      api.getAdminLLMUsage(),
      api.getAdminTopUsers(),
      api.getContentEffectiveness(),
      api.getLearningPatterns(),
      api.getContentQuality(),
      api.getDifficultySpikes(),
      api.getContentVersions(),
      api.getContentMatrix(),
      api.getLLMEffectiveness(),
      api.getLLMHintOutcomes(),
      api.getLLMMasteryImpact(),
      api.getLLMCohortComparison(),
    ]);
    return { s, sys, configs, usage, users, content, patterns, quality, spikes, versions, matrix, llmEff, llmHints, llmMastery, llmCohort };
  }, "Failed to load admin data");

  if (result) {
    stats.value = result.s;
    systemStats.value = result.sys;
    llmConfigs.value = result.configs.configs;
    llmUsage.value = result.usage;
    topUsers.value = result.users.topUsers;
    contentEffectiveness.value = result.content;
    learningPatterns.value = result.patterns;
    contentQuality.value = result.quality;
    difficultySpikes.value = result.spikes;
    contentVersions.value = result.versions;
    contentMatrix.value = result.matrix;
    llmEffectiveness.value = result.llmEff;
    llmHintOutcomes.value = result.llmHints;
    llmMasteryImpact.value = result.llmMastery;
    llmCohorts.value = result.llmCohort;
  } else {
    error.value = true;
  }
  loading.value = false;
});

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function startEdit(config: { tier: string; modelId: string; costInputPerM: number; costOutputPerM: number }) {
  editingTier.value = config.tier;
  editForm.value = {
    modelId: config.modelId,
    costInputPerM: config.costInputPerM,
    costOutputPerM: config.costOutputPerM,
  };
}

function cancelEdit() {
  editingTier.value = null;
}

function healthColor(accuracy: number): string {
  if (accuracy >= 0.85) return "text-green-600";
  if (accuracy >= 0.80) return "text-yellow-600";
  return "text-red-600";
}

function healthBg(accuracy: number): string {
  if (accuracy >= 0.85) return "bg-green-50";
  if (accuracy >= 0.80) return "bg-yellow-50";
  return "bg-red-50";
}

async function saveConfig() {
  if (!editingTier.value) return;
  saving.value = true;
  const result = await withErrorToast(
    () => api.updateAdminLLMConfig(editingTier.value!, editForm.value),
    "Failed to save config",
  );
  if (result) {
    const idx = llmConfigs.value.findIndex((c) => c.tier === editingTier.value);
    if (idx >= 0) {
      llmConfigs.value[idx] = {
        ...llmConfigs.value[idx],
        ...editForm.value,
        updatedAt: new Date().toISOString(),
      };
    }
    editingTier.value = null;
  }
  saving.value = false;
}

const filteredMatrix = computed(() => {
  if (!contentMatrix.value) return [];
  let rows = contentMatrix.value.matrix;
  const f = matrixFilter.value;

  if (f.discipline) rows = rows.filter((r) => r.disciplineId === f.discipline);
  if (f.grade !== null) rows = rows.filter((r) => r.gradeLevel === f.grade);
  if (f.flavor) rows = rows.filter((r) =>
    r.instructional.some((i) => i.flavor === f.flavor) || r.assessment.some((a) => a.flavor === f.flavor)
  );
  if (f.locale) rows = rows.filter((r) =>
    r.instructional.some((i) => i.locale === f.locale) || r.assessment.some((a) => a.locale === f.locale)
  );
  if (f.gapsOnly) rows = rows.filter((r) =>
    r.gaps.icMissing > 0 || r.gaps.acMissing > 0 || r.gaps.poolBelowTarget || r.gaps.missingDifficulties
  );

  const s = matrixSort.value;
  return [...rows].sort((a, b) => {
    if (s === "name") return a.topicName.localeCompare(b.topicName);
    if (s === "grade") return a.gradeLevel - b.gradeLevel || a.topicName.localeCompare(b.topicName);
    if (s === "gaps") return (b.gaps.icMissing + b.gaps.acMissing) - (a.gaps.icMissing + a.gaps.acMissing);
    if (s === "quality") return (a.quality?.accuracy ?? 1) - (b.quality?.accuracy ?? 1);
    if (s === "pool") return a.totalAssessment - b.totalAssessment;
    return 0;
  });
});

const uniqueGrades = computed(() => {
  if (!contentMatrix.value) return [];
  let rows = contentMatrix.value.matrix;
  if (matrixFilter.value.discipline) rows = rows.filter((r) => r.disciplineId === matrixFilter.value.discipline);
  return [...new Set(rows.map((m) => m.gradeLevel))].sort((a, b) => a - b);
});

function matrixCellColor(topic: typeof filteredMatrix.value[0]): string {
  if (topic.quality && topic.quality.accuracy < 0.8) return "bg-red-50 border-red-200";
  if (topic.gaps.poolBelowTarget || topic.gaps.missingDifficulties) return "bg-yellow-50 border-yellow-200";
  if (topic.hasAssets) return "bg-blue-50 border-blue-200";
  if (topic.totalInstructional > 0 && topic.totalAssessment > 0) return "bg-green-50 border-green-200";
  return "bg-gray-50 border-gray-200";
}

const tabs = [
  { id: "overview" as const, label: "Overview" },
  { id: "system" as const, label: "System Stats" },
  { id: "models" as const, label: "Model Config" },
  { id: "usage" as const, label: "LLM Usage" },
  { id: "quality" as const, label: "Content Quality" },
  { id: "content" as const, label: "Content Effectiveness" },
  { id: "patterns" as const, label: "Learning Patterns" },
  { id: "matrix" as const, label: "Content Matrix" },
  { id: "llm-effectiveness" as const, label: "LLM Effectiveness" },
];
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Admin Dashboard</h1>

    <div v-if="loading" class="text-gray-500">Loading...</div>
    <div v-else-if="error" class="text-red-600">Failed to load admin data.</div>

    <template v-else>
      <!-- Tab navigation -->
      <div class="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
            activeTab === tab.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview' && stats" class="space-y-6">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Total Users</div>
            <div class="text-2xl font-bold">{{ stats.totalUsers }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Families</div>
            <div class="text-2xl font-bold">{{ stats.totalFamilies }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Topics</div>
            <div class="text-2xl font-bold">{{ stats.totalTopics }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Total Reviews</div>
            <div class="text-2xl font-bold">{{ stats.totalReviews.toLocaleString() }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Instructional Content</div>
            <div class="text-2xl font-bold">{{ stats.totalInstructionalContent }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Assessment Content</div>
            <div class="text-2xl font-bold">{{ stats.totalAssessmentContent }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">LLM Cost (This Month)</div>
            <div class="text-2xl font-bold">{{ formatCents(stats.llmCostCentsThisMonth) }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">LLM Cost (All Time)</div>
            <div class="text-2xl font-bold">{{ formatCents(stats.llmCostCentsAllTime) }}</div>
          </div>
        </div>

        <!-- Content by Locale -->
        <div v-if="stats.contentByLocale.length > 0">
          <h2 class="text-lg font-semibold mb-3">Content by Locale</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Locale</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Instructional</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Assessment</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in stats.contentByLocale" :key="row.locale" class="border-t border-gray-100">
                  <td class="px-4 py-2 font-mono text-xs uppercase">{{ row.locale }}</td>
                  <td class="px-4 py-2 text-right">{{ row.instructional }}</td>
                  <td class="px-4 py-2 text-right">{{ row.assessment }}</td>
                  <td class="px-4 py-2 text-right font-medium">{{ row.instructional + row.assessment }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Content by Flavor -->
        <div v-if="stats.contentByFlavor.length > 0">
          <h2 class="text-lg font-semibold mb-3">Content by Flavor</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Flavor</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Instructional</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Assessment</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in stats.contentByFlavor" :key="row.flavor" class="border-t border-gray-100">
                  <td class="px-4 py-2 capitalize">{{ row.flavor }}</td>
                  <td class="px-4 py-2 text-right">{{ row.instructional }}</td>
                  <td class="px-4 py-2 text-right">{{ row.assessment }}</td>
                  <td class="px-4 py-2 text-right font-medium">{{ row.instructional + row.assessment }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- System Stats Tab -->
      <div v-if="activeTab === 'system' && systemStats" class="space-y-6">
        <!-- Active users -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Active Users (7d)</div>
            <div class="text-2xl font-bold">{{ systemStats.activeUsers7d }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">Active Users (30d)</div>
            <div class="text-2xl font-bold">{{ systemStats.activeUsers30d }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">LLM Calls (Month)</div>
            <div class="text-2xl font-bold">{{ systemStats.llmSummary.totalCalls.toLocaleString() }}</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="text-sm text-gray-500">LLM Cost (Month)</div>
            <div class="text-2xl font-bold">{{ formatCents(systemStats.llmSummary.totalCostCents) }}</div>
          </div>
        </div>

        <!-- LLM Summary -->
        <div>
          <h2 class="text-lg font-semibold mb-3">LLM Usage Summary (This Month)</h2>
          <div class="bg-white rounded-lg border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-gray-500">Input Tokens</div>
              <div class="font-medium">{{ systemStats.llmSummary.totalInputTokens.toLocaleString() }}</div>
            </div>
            <div>
              <div class="text-gray-500">Output Tokens</div>
              <div class="font-medium">{{ systemStats.llmSummary.totalOutputTokens.toLocaleString() }}</div>
            </div>
            <div>
              <div class="text-gray-500">Unique Models</div>
              <div class="font-medium">{{ systemStats.llmSummary.uniqueModels }}</div>
            </div>
            <div>
              <div class="text-gray-500">Total Cost</div>
              <div class="font-medium">{{ formatCents(systemStats.llmSummary.totalCostCents) }}</div>
            </div>
          </div>
        </div>

        <!-- Content Volume -->
        <div v-if="systemStats.contentVolume.length > 0">
          <h2 class="text-lg font-semibold mb-3">Content Volume by Type</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in systemStats.contentVolume" :key="row.type" class="border-t border-gray-100">
                  <td class="px-4 py-2 capitalize">{{ row.type }}</td>
                  <td class="px-4 py-2 text-right">{{ row.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Content Velocity -->
        <div v-if="systemStats.contentVelocity.length > 0">
          <h2 class="text-lg font-semibold mb-3">Content Creation Velocity (Last 8 Weeks)</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Week</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Instructional</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Assessment</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in systemStats.contentVelocity" :key="row.week" class="border-t border-gray-100">
                  <td class="px-4 py-2 font-mono text-xs">{{ row.week }}</td>
                  <td class="px-4 py-2 text-right">{{ row.instructional }}</td>
                  <td class="px-4 py-2 text-right">{{ row.assessment }}</td>
                  <td class="px-4 py-2 text-right font-medium">{{ row.instructional + row.assessment }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Model Config Tab -->
      <div v-if="activeTab === 'models'" class="space-y-4">
        <h2 class="text-lg font-semibold">LLM Model Configuration</h2>
        <p class="text-sm text-gray-500">Configure which models serve each tier. Changes take effect immediately.</p>

        <div v-if="llmConfigs.length === 0" class="text-gray-500 text-sm">
          No model configuration found. Models are using hardcoded defaults.
        </div>

        <div class="space-y-3">
          <div
            v-for="config in llmConfigs"
            :key="config.tier"
            class="bg-white rounded-lg border border-gray-200 p-4"
          >
            <template v-if="editingTier === config.tier">
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium uppercase px-2 py-0.5 rounded"
                    :class="config.tier === 'cheap' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'">
                    {{ config.tier }}
                  </span>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Model ID</label>
                  <input v-model="editForm.modelId" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-gray-600 mb-1">Input cost (cents/M tokens)</label>
                    <input v-model.number="editForm.costInputPerM" type="number" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label class="block text-sm text-gray-600 mb-1">Output cost (cents/M tokens)</label>
                    <input v-model.number="editForm.costOutputPerM" type="number" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div class="flex gap-2">
                  <button @click="saveConfig" :disabled="saving"
                    class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                    {{ saving ? "Saving..." : "Save" }}
                  </button>
                  <button @click="cancelEdit" class="text-gray-500 px-3 py-1.5 rounded text-sm hover:text-gray-700">
                    Cancel
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium uppercase px-2 py-0.5 rounded"
                      :class="config.tier === 'cheap' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'">
                      {{ config.tier }}
                    </span>
                    <span class="text-sm font-mono text-gray-700">{{ config.modelId }}</span>
                  </div>
                  <div class="text-xs text-gray-400">
                    Input: {{ config.costInputPerM }} &centerdot; Output: {{ config.costOutputPerM }} cents/M tokens
                    &centerdot; Updated: {{ new Date(config.updatedAt).toLocaleDateString() }}
                  </div>
                </div>
                <button @click="startEdit(config)" class="text-blue-600 text-sm hover:text-blue-800">Edit</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- LLM Usage Tab -->
      <div v-if="activeTab === 'usage' && llmUsage" class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold mb-3">Usage by Purpose (This Month)</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Purpose</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Calls</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Input Tokens</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Output Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in llmUsage.byPurpose" :key="row.purpose" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ row.purpose }}</td>
                  <td class="px-4 py-2 text-right">{{ row.calls.toLocaleString() }}</td>
                  <td class="px-4 py-2 text-right">{{ formatCents(row.totalCostCents) }}</td>
                  <td class="px-4 py-2 text-right">{{ row.totalInputTokens.toLocaleString() }}</td>
                  <td class="px-4 py-2 text-right">{{ row.totalOutputTokens.toLocaleString() }}</td>
                </tr>
                <tr v-if="llmUsage.byPurpose.length === 0">
                  <td colspan="5" class="px-4 py-4 text-center text-gray-400">No usage this month</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Usage by Model (This Month)</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Model</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Calls</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in llmUsage.byModel" :key="row.model" class="border-t border-gray-100">
                  <td class="px-4 py-2 font-mono text-xs">{{ row.model }}</td>
                  <td class="px-4 py-2 text-right">{{ row.calls.toLocaleString() }}</td>
                  <td class="px-4 py-2 text-right">{{ formatCents(row.totalCostCents) }}</td>
                </tr>
                <tr v-if="llmUsage.byModel.length === 0">
                  <td colspan="3" class="px-4 py-4 text-center text-gray-400">No usage this month</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Top Users by Cost (This Month)</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">User</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Calls</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in topUsers" :key="row.userId" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ row.userName }}</td>
                  <td class="px-4 py-2 text-right">{{ row.calls.toLocaleString() }}</td>
                  <td class="px-4 py-2 text-right">{{ formatCents(row.totalCostCents) }}</td>
                </tr>
                <tr v-if="topUsers.length === 0">
                  <td colspan="3" class="px-4 py-4 text-center text-gray-400">No usage this month</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Content Quality Tab -->
      <div v-if="activeTab === 'quality' && contentQuality" class="space-y-6">
        <!-- Topic Health Overview -->
        <div>
          <h2 class="text-lg font-semibold mb-2">Topic Health</h2>
          <p class="text-sm text-gray-500 mb-3">Color-coded: <span class="text-green-600 font-medium">&gt;85%</span> healthy, <span class="text-yellow-600 font-medium">80-85%</span> watch, <span class="text-red-600 font-medium">&lt;80%</span> needs work. Click a topic for per-problem breakdown.</p>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Grade</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Attempts</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Hints</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Time</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Learners</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="topic in contentQuality.topicQuality"
                  :key="topic.topicId"
                  :class="[healthBg(topic.accuracy), 'border-t border-gray-100 cursor-pointer hover:bg-gray-50']"
                  @click="selectedQualityTopic = selectedQualityTopic === topic.topicId ? null : topic.topicId"
                >
                  <td class="px-4 py-2">{{ topic.topicName }}</td>
                  <td class="px-4 py-2 text-right">K{{ topic.gradeLevel }}</td>
                  <td class="px-4 py-2 text-right">{{ topic.totalAttempts }}</td>
                  <td class="px-4 py-2 text-right font-medium" :class="healthColor(topic.accuracy)">{{ formatPct(topic.accuracy) }}</td>
                  <td class="px-4 py-2 text-right" :class="topic.avgHintsUsed > 2 ? 'text-orange-600 font-medium' : ''">{{ topic.avgHintsUsed.toFixed(1) }}</td>
                  <td class="px-4 py-2 text-right">{{ (topic.avgResponseMs / 1000).toFixed(1) }}s</td>
                  <td class="px-4 py-2 text-right">{{ topic.uniqueLearners }}</td>
                </tr>
                <tr v-if="contentQuality.topicQuality.length === 0">
                  <td colspan="7" class="px-4 py-4 text-center text-gray-400">No review data yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Per-Problem Breakdown (when a topic is selected) -->
        <div v-if="selectedQualityTopic && contentQuality.problemQuality.filter(p => p.topicId === selectedQualityTopic).length > 0">
          <h2 class="text-lg font-semibold mb-2">Problem Breakdown: {{ contentQuality.topicQuality.find(t => t.topicId === selectedQualityTopic)?.topicName }}</h2>
          <p class="text-sm text-gray-500 mb-3">Per-problem accuracy for reviews that tracked the specific assessment.</p>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Question</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Difficulty</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Attempts</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Hints</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="problem in contentQuality.problemQuality.filter(p => p.topicId === selectedQualityTopic)"
                  :key="problem.assessmentContentId"
                  :class="[healthBg(problem.accuracy), 'border-t border-gray-100']"
                >
                  <td class="px-4 py-2 max-w-xs truncate">{{ problem.question }}</td>
                  <td class="px-4 py-2 text-xs font-mono">{{ problem.type }}</td>
                  <td class="px-4 py-2 capitalize text-xs">{{ problem.difficulty }}</td>
                  <td class="px-4 py-2 text-right">{{ problem.attempts }}</td>
                  <td class="px-4 py-2 text-right font-medium" :class="healthColor(problem.accuracy)">{{ formatPct(problem.accuracy) }}</td>
                  <td class="px-4 py-2 text-right">{{ problem.avgHints.toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else-if="selectedQualityTopic">
          <p class="text-sm text-gray-400 italic">No per-problem data for this topic yet. Problem-level tracking requires assessment_content_id in review logs.</p>
        </div>

        <!-- Difficulty Spikes -->
        <div v-if="difficultySpikes">
          <h2 class="text-lg font-semibold mb-2">Difficulty Spikes</h2>
          <p class="text-sm text-gray-500 mb-3">Prerequisite pairs where accuracy drops &gt;15%. May indicate content gaps or missing intermediate topics.</p>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Prerequisite</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-center px-2 py-2 font-medium text-gray-400">&rarr;</th>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Dependent</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Drop</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="spike in difficultySpikes.spikes" :key="`${spike.prereqTopicId}-${spike.dependentTopicId}`" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ spike.prereqTopicName }}</td>
                  <td class="px-4 py-2 text-right" :class="healthColor(spike.prereqAccuracy)">{{ formatPct(spike.prereqAccuracy) }}</td>
                  <td class="text-center px-2 py-2 text-gray-300">&rarr;</td>
                  <td class="px-4 py-2">{{ spike.dependentTopicName }}</td>
                  <td class="px-4 py-2 text-right" :class="healthColor(spike.dependentAccuracy)">{{ formatPct(spike.dependentAccuracy) }}</td>
                  <td class="px-4 py-2 text-right text-red-600 font-medium">-{{ formatPct(spike.accuracyDrop) }}</td>
                </tr>
                <tr v-if="difficultySpikes.spikes.length === 0">
                  <td colspan="6" class="px-4 py-4 text-center text-gray-400">No difficulty spikes detected (need 5+ attempts per topic in prerequisite pairs)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Content Version Comparison -->
        <div v-if="contentVersions">
          <h2 class="text-lg font-semibold mb-2">Content Version Effectiveness</h2>
          <p class="text-sm text-gray-500 mb-3">Accuracy before vs after content updates. Shows whether iteration improves outcomes.</p>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Version</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Before</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">After</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Change</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in contentVersions.versionComparison" :key="`${v.topicId}-${v.version}`" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ v.topicName }}</td>
                  <td class="px-4 py-2 text-right">v{{ v.version }}</td>
                  <td class="px-4 py-2 text-right text-gray-500">{{ formatPct(v.accuracyBefore) }} <span class="text-xs text-gray-400">({{ v.attemptsBefore }})</span></td>
                  <td class="px-4 py-2 text-right" :class="healthColor(v.accuracyAfter)">{{ formatPct(v.accuracyAfter) }} <span class="text-xs text-gray-400">({{ v.attemptsAfter }})</span></td>
                  <td class="px-4 py-2 text-right font-medium" :class="v.accuracyAfter > v.accuracyBefore ? 'text-green-600' : 'text-red-600'">
                    {{ v.accuracyAfter > v.accuracyBefore ? '+' : '' }}{{ formatPct(v.accuracyAfter - v.accuracyBefore) }}
                  </td>
                </tr>
                <tr v-if="contentVersions.versionComparison.length === 0">
                  <td colspan="5" class="px-4 py-4 text-center text-gray-400">No versioned content with enough data to compare</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Content Effectiveness Tab -->
      <div v-if="activeTab === 'content' && contentEffectiveness" class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold mb-2">Struggling Topics</h2>
          <p class="text-sm text-gray-500 mb-3">Topics with low accuracy or high hint usage may need content improvement.</p>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Attempts</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Hints/Attempt</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Mastery Rate</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Reps</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Learners</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="topic in contentEffectiveness.strugglingTopics" :key="topic.topicId" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ topic.topicName }}</td>
                  <td class="px-4 py-2 text-right">{{ topic.totalAttempts }}</td>
                  <td class="px-4 py-2 text-right" :class="topic.accuracy < 0.5 ? 'text-red-600 font-medium' : ''">
                    {{ formatPct(topic.accuracy) }}
                  </td>
                  <td class="px-4 py-2 text-right" :class="topic.hintsPerAttempt > 1 ? 'text-orange-600 font-medium' : ''">
                    {{ topic.hintsPerAttempt.toFixed(2) }}
                  </td>
                  <td class="px-4 py-2 text-right">{{ formatPct(topic.masteryRate) }}</td>
                  <td class="px-4 py-2 text-right">{{ topic.avgReps.toFixed(1) }}</td>
                  <td class="px-4 py-2 text-right">{{ topic.uniqueLearners }}</td>
                </tr>
                <tr v-if="contentEffectiveness.strugglingTopics.length === 0">
                  <td colspan="7" class="px-4 py-4 text-center text-gray-400">No review data yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Learning Patterns Tab -->
      <div v-if="activeTab === 'patterns' && learningPatterns" class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold mb-3">Hint Escalation Patterns</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Hints Used</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Count</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Correct Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in learningPatterns.hintPatterns" :key="row.hintsUsed" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ row.hintsUsed }}</td>
                  <td class="px-4 py-2 text-right">{{ row.count }}</td>
                  <td class="px-4 py-2 text-right">{{ formatPct(row.avgCorrect) }}</td>
                </tr>
                <tr v-if="learningPatterns.hintPatterns.length === 0">
                  <td colspan="3" class="px-4 py-4 text-center text-gray-400">No hint data yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Performance by Phase</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Phase</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Reviews</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Accuracy</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Avg Response Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in learningPatterns.responseByPhase" :key="row.phase" class="border-t border-gray-100">
                  <td class="px-4 py-2 capitalize">{{ row.phase }}</td>
                  <td class="px-4 py-2 text-right">{{ row.count.toLocaleString() }}</td>
                  <td class="px-4 py-2 text-right">{{ formatPct(row.accuracy) }}</td>
                  <td class="px-4 py-2 text-right">{{ (row.avgResponseMs / 1000).toFixed(1) }}s</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Daily Activity (Last 30 Days)</h2>
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Reviews</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Active Users</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in learningPatterns.dailyActivity" :key="row.date" class="border-t border-gray-100">
                  <td class="px-4 py-2">{{ row.date }}</td>
                  <td class="px-4 py-2 text-right">{{ row.reviews }}</td>
                  <td class="px-4 py-2 text-right">{{ row.uniqueUsers }}</td>
                </tr>
                <tr v-if="learningPatterns.dailyActivity.length === 0">
                  <td colspan="3" class="px-4 py-4 text-center text-gray-400">No activity in last 30 days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Content Matrix Tab -->
      <div v-if="activeTab === 'matrix' && contentMatrix" class="space-y-6">
        <!-- Gap Analysis Summary -->
        <div>
          <h2 class="text-lg font-semibold mb-3">Gap Analysis Summary</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Total Topics</div>
              <div class="text-2xl font-bold">{{ contentMatrix.gapSummary.totalTopics }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Matrix Fill</div>
              <div class="text-2xl font-bold">{{ formatPct(contentMatrix.gapSummary.fillPercentage) }}</div>
              <div class="text-xs text-gray-400">{{ contentMatrix.gapSummary.filledCells }} / {{ contentMatrix.gapSummary.totalMatrixCells }} cells</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Pool Below Target ({{ contentMatrix.dimensions.targetPoolSize }})</div>
              <div class="text-2xl font-bold" :class="contentMatrix.gapSummary.topicsWithPoolBelowTarget > 0 ? 'text-yellow-600' : 'text-green-600'">{{ contentMatrix.gapSummary.topicsWithPoolBelowTarget }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Low Quality (&lt;80%)</div>
              <div class="text-2xl font-bold" :class="contentMatrix.gapSummary.topicsWithLowQuality > 0 ? 'text-red-600' : 'text-green-600'">{{ contentMatrix.gapSummary.topicsWithLowQuality }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Missing Difficulties</div>
              <div class="text-2xl font-bold" :class="contentMatrix.gapSummary.topicsWithMissingDifficulties > 0 ? 'text-yellow-600' : 'text-green-600'">{{ contentMatrix.gapSummary.topicsWithMissingDifficulties }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">No Rich Media</div>
              <div class="text-2xl font-bold text-gray-500">{{ contentMatrix.gapSummary.topicsWithNoAssets }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Flavors</div>
              <div class="text-2xl font-bold">{{ contentMatrix.dimensions.flavors.length }}</div>
              <div class="text-xs text-gray-400">{{ contentMatrix.dimensions.flavors.join(', ') }}</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Locales</div>
              <div class="text-2xl font-bold">{{ contentMatrix.dimensions.locales.length }}</div>
              <div class="text-xs text-gray-400">{{ contentMatrix.dimensions.locales.join(', ') }}</div>
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-4 text-xs">
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-100 border border-green-300"></span> Content exists</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Pool/difficulty gaps</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-100 border border-red-300"></span> Low quality (&lt;80%)</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span> Has rich media</span>
          <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-100 border border-gray-300"></span> No content</span>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 items-center">
          <select v-model="matrixFilter.discipline" class="text-sm border border-gray-300 rounded px-2 py-1 font-medium">
            <option :value="null">All Disciplines</option>
            <option v-for="s in contentMatrix.disciplines" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="matrixFilter.grade" class="text-sm border border-gray-300 rounded px-2 py-1">
            <option :value="null">All Levels</option>
            <option v-for="g in uniqueGrades" :key="g" :value="g">{{ gradeLabel(g) }}</option>
          </select>
          <select v-model="matrixFilter.flavor" class="text-sm border border-gray-300 rounded px-2 py-1">
            <option :value="null">All Flavors</option>
            <option v-for="f in contentMatrix.dimensions.flavors" :key="f" :value="f">{{ f }}</option>
          </select>
          <select v-model="matrixFilter.locale" class="text-sm border border-gray-300 rounded px-2 py-1">
            <option :value="null">All Locales</option>
            <option v-for="l in contentMatrix.dimensions.locales" :key="l" :value="l">{{ l }}</option>
          </select>
          <label class="inline-flex items-center gap-1 text-sm">
            <input type="checkbox" v-model="matrixFilter.gapsOnly" class="rounded" />
            Gaps only
          </label>
          <select v-model="matrixSort" class="text-sm border border-gray-300 rounded px-2 py-1">
            <option value="grade">Sort: Level</option>
            <option value="name">Sort: Name</option>
            <option value="gaps">Sort: Most Gaps</option>
            <option value="quality">Sort: Lowest Quality</option>
            <option value="pool">Sort: Smallest Pool</option>
          </select>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-xs text-gray-400">{{ filteredMatrix.length }} topics</span>
            <select v-model="gradeFramework" class="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
              <option value="us">US (K-12)</option>
              <option value="uk">UK (Key Stages)</option>
              <option value="generic">Generic (Levels)</option>
            </select>
          </div>
        </div>

        <!-- Matrix Grid + Detail Panel (side by side) -->
        <div class="flex gap-4" :class="selectedMatrixTopic ? 'items-start' : ''">
          <!-- Table -->
          <div class="bg-white rounded-lg border border-gray-200 overflow-hidden" :class="selectedMatrixTopic ? 'flex-1 min-w-0' : 'w-full'">
            <div class="max-h-[70vh] overflow-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th class="text-left px-4 py-2 font-medium text-gray-600" title="Knowledge graph topic name">Topic</th>
                    <th class="text-center px-3 py-2 font-medium text-gray-600" title="Grade/difficulty level in the selected framework">Level</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600" title="Instructional content count (worked examples, lessons)">IC</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600" title="Assessment content pool size (practice problems, quizzes)">AC Pool</th>
                    <th class="text-center px-3 py-2 font-medium text-gray-600" title="Assessment difficulty distribution: Easy / Medium / Hard">E/M/H</th>
                    <th class="text-center px-3 py-2 font-medium text-gray-600" title="Number of distinct question types (e.g. text-qa, multiple-choice)">Types</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600" title="Average learner accuracy across all attempts on this topic">Accuracy</th>
                    <th class="text-center px-3 py-2 font-medium text-gray-600" title="Has rich media assets (images, diagrams, audio)">Assets</th>
                    <th class="text-center px-3 py-2 font-medium text-gray-600" title="Content flags: Pool (below target size), Diff (missing difficulty levels), Qual (accuracy < 80%), Gap (missing flavor/locale combos)">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in filteredMatrix"
                    :key="row.topicId"
                    :class="[
                      'border-t border-gray-100 cursor-pointer hover:bg-gray-50',
                      matrixCellColor(row),
                      selectedMatrixTopic === row.topicId ? 'ring-2 ring-blue-400 ring-inset' : ''
                    ]"
                    @click="selectedMatrixTopic = selectedMatrixTopic === row.topicId ? null : row.topicId"
                  >
                    <td class="px-4 py-2 font-medium">{{ row.topicName }}</td>
                    <td class="px-3 py-2 text-center text-xs">{{ gradeLabel(row.gradeLevel) }}</td>
                    <td class="px-3 py-2 text-right">{{ row.totalInstructional }}</td>
                    <td class="px-3 py-2 text-right" :class="row.gaps.poolBelowTarget ? 'text-yellow-600 font-semibold' : ''">{{ row.totalAssessment }}</td>
                    <td class="px-3 py-2 text-center text-xs">
                      <template v-if="row.assessment.length > 0">
                        {{ row.assessment.reduce((s, a) => s + a.easy, 0) }}/{{ row.assessment.reduce((s, a) => s + a.medium, 0) }}/{{ row.assessment.reduce((s, a) => s + a.hard, 0) }}
                      </template>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                    <td class="px-3 py-2 text-center text-xs">
                      <span v-if="Object.keys(row.questionTypes).length > 0">{{ Object.keys(row.questionTypes).length }}</span>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                    <td class="px-3 py-2 text-right" :class="row.quality ? healthColor(row.quality.accuracy) : 'text-gray-300'">
                      {{ row.quality ? formatPct(row.quality.accuracy) : '-' }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      <span v-if="row.hasAssets" class="text-blue-600">Y</span>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                    <td class="px-3 py-2 text-center text-xs space-x-1">
                      <span v-if="row.gaps.poolBelowTarget" class="text-yellow-600" title="Pool below target">Pool</span>
                      <span v-if="row.gaps.missingDifficulties" class="text-yellow-600" title="Missing difficulty levels">Diff</span>
                      <span v-if="row.quality && row.quality.accuracy < 0.8" class="text-red-600" title="Low accuracy">Qual</span>
                      <span v-if="row.gaps.icMissing > 0 || row.gaps.acMissing > 0" class="text-gray-500" title="Missing dimension combos">Gap</span>
                    </td>
                  </tr>
                  <tr v-if="filteredMatrix.length === 0">
                    <td colspan="9" class="px-4 py-4 text-center text-gray-400">No topics match filters</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Detail panel (sticky sidebar) -->
          <div v-if="selectedMatrixTopic && contentMatrix" class="w-96 shrink-0 sticky top-4">
            <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-4 max-h-[70vh] overflow-auto">
              <template v-for="row in filteredMatrix.filter((r) => r.topicId === selectedMatrixTopic)" :key="row.topicId">
                <div class="flex justify-between items-start">
                  <div>
                    <h3 class="text-base font-semibold">{{ row.topicName }}</h3>
                    <p class="text-sm text-gray-500">{{ gradeLabel(row.gradeLevel) }} - {{ row.disciplineName }}</p>
                  </div>
                  <button @click="selectedMatrixTopic = null" class="text-gray-400 hover:text-gray-600 p-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>

                <!-- Instructional breakdown -->
                <div v-if="row.instructional.length > 0">
                  <h4 class="text-sm font-semibold text-gray-700 mb-2">Instructional Content</h4>
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="text-left px-2 py-1 font-medium" title="Content flavor (e.g. classic, story-based)">Flavor</th>
                        <th class="text-left px-2 py-1 font-medium" title="Language locale">Locale</th>
                        <th class="text-left px-2 py-1 font-medium" title="Presentation format (e.g. step-by-step, visual)">Pres.</th>
                        <th class="text-right px-2 py-1 font-medium" title="Number of content items">#</th>
                        <th class="text-right px-2 py-1 font-medium" title="Latest content version">Ver</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(ic, i) in row.instructional" :key="i" class="border-t border-gray-100">
                        <td class="px-2 py-1">{{ ic.flavor }}</td>
                        <td class="px-2 py-1">{{ ic.locale }}</td>
                        <td class="px-2 py-1">{{ ic.presentation }}</td>
                        <td class="px-2 py-1 text-right">{{ ic.count }}</td>
                        <td class="px-2 py-1 text-right">v{{ ic.maxVersion }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="text-sm text-gray-400">No instructional content</div>

                <!-- Assessment breakdown -->
                <div v-if="row.assessment.length > 0">
                  <h4 class="text-sm font-semibold text-gray-700 mb-2">Assessment Pool</h4>
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="text-left px-2 py-1 font-medium" title="Content flavor (e.g. classic, story-based)">Flavor</th>
                        <th class="text-left px-2 py-1 font-medium" title="Language locale">Locale</th>
                        <th class="text-right px-2 py-1 font-medium" title="Total assessment items in pool">Pool</th>
                        <th class="text-right px-2 py-1 font-medium" title="Easy difficulty count">E</th>
                        <th class="text-right px-2 py-1 font-medium" title="Medium difficulty count">M</th>
                        <th class="text-right px-2 py-1 font-medium" title="Hard difficulty count">H</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(ac, i) in row.assessment" :key="i" class="border-t border-gray-100"
                          :class="ac.poolSize < contentMatrix.dimensions.targetPoolSize ? 'bg-yellow-50' : ''">
                        <td class="px-2 py-1">{{ ac.flavor }}</td>
                        <td class="px-2 py-1">{{ ac.locale }}</td>
                        <td class="px-2 py-1 text-right" :class="ac.poolSize < contentMatrix.dimensions.targetPoolSize ? 'text-yellow-600 font-semibold' : ''">{{ ac.poolSize }}</td>
                        <td class="px-2 py-1 text-right" :class="ac.easy === 0 ? 'text-red-500' : ''">{{ ac.easy }}</td>
                        <td class="px-2 py-1 text-right" :class="ac.medium === 0 ? 'text-red-500' : ''">{{ ac.medium }}</td>
                        <td class="px-2 py-1 text-right" :class="ac.hard === 0 ? 'text-red-500' : ''">{{ ac.hard }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="text-sm text-gray-400">No assessment content</div>

                <!-- Question type distribution -->
                <div v-if="Object.keys(row.questionTypes).length > 0">
                  <h4 class="text-sm font-semibold text-gray-700 mb-2">Question Types</h4>
                  <div class="flex flex-wrap gap-2">
                    <span v-for="(count, type) in row.questionTypes" :key="type"
                          class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {{ type }}: {{ count }}
                    </span>
                  </div>
                </div>

                <!-- Quality info -->
                <div v-if="row.quality">
                  <h4 class="text-sm font-semibold text-gray-700 mb-1">Quality</h4>
                  <p class="text-sm">
                    Accuracy: <span :class="healthColor(row.quality.accuracy)" class="font-semibold">{{ formatPct(row.quality.accuracy) }}</span>
                    ({{ row.quality.attempts }} attempts)
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
      <!-- LLM Effectiveness Tab -->
      <div v-if="activeTab === 'llm-effectiveness'" class="space-y-6">
        <!-- No data state -->
        <div v-if="!llmEffectiveness && !llmHintOutcomes && !llmMasteryImpact && !llmCohorts" class="text-center py-12 text-gray-400">
          <p class="text-lg font-medium">No LLM effectiveness data yet</p>
          <p class="text-sm mt-1">Data will appear as students use AI tutoring features.</p>
        </div>

        <template v-else>
          <!-- Summary Cards -->
          <div v-if="llmEffectiveness" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">LLM-Assisted Accuracy</div>
              <div class="text-2xl font-bold" :class="llmEffectiveness.overall.llmAccuracy !== null ? 'text-blue-600' : 'text-gray-300'">
                {{ llmEffectiveness.overall.llmAccuracy !== null ? formatPct(llmEffectiveness.overall.llmAccuracy) : '-' }}
              </div>
              <div class="text-xs text-gray-400">{{ llmEffectiveness.overall.llmAttempts }} attempts</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Baseline Accuracy</div>
              <div class="text-2xl font-bold" :class="llmEffectiveness.overall.baselineAccuracy !== null ? 'text-gray-700' : 'text-gray-300'">
                {{ llmEffectiveness.overall.baselineAccuracy !== null ? formatPct(llmEffectiveness.overall.baselineAccuracy) : '-' }}
              </div>
              <div class="text-xs text-gray-400">{{ llmEffectiveness.overall.baselineAttempts }} attempts</div>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">Delta</div>
              <div class="text-2xl font-bold" :class="llmEffectiveness.overall.llmAccuracy !== null && llmEffectiveness.overall.baselineAccuracy !== null
                ? (llmEffectiveness.overall.llmAccuracy - llmEffectiveness.overall.baselineAccuracy > 0 ? 'text-green-600' : 'text-red-600')
                : 'text-gray-300'">
                {{ llmEffectiveness.overall.llmAccuracy !== null && llmEffectiveness.overall.baselineAccuracy !== null
                  ? (llmEffectiveness.overall.llmAccuracy - llmEffectiveness.overall.baselineAccuracy > 0 ? '+' : '') + formatPct(llmEffectiveness.overall.llmAccuracy - llmEffectiveness.overall.baselineAccuracy)
                  : '-' }}
              </div>
              <div class="text-xs text-gray-400">LLM vs baseline</div>
            </div>
            <div v-if="llmMasteryImpact" class="bg-white rounded-lg border border-gray-200 p-4">
              <div class="text-sm text-gray-500">LLM Mastery Topics</div>
              <div class="text-2xl font-bold text-blue-600">{{ llmMasteryImpact.llmAssisted.topicCount }}</div>
              <div class="text-xs text-gray-400">vs {{ llmMasteryImpact.baseline.topicCount }} baseline</div>
            </div>
          </div>

          <!-- Topic Effectiveness Table -->
          <div v-if="llmEffectiveness && llmEffectiveness.topics.length > 0">
            <h2 class="text-lg font-semibold mb-3">Per-Topic LLM Impact</h2>
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div class="max-h-[50vh] overflow-auto">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 sticky top-0">
                    <tr>
                      <th class="text-left px-4 py-2 font-medium text-gray-600">Topic</th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600">LLM Accuracy</th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600">Baseline</th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600">Delta</th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600">LLM N</th>
                      <th class="text-right px-3 py-2 font-medium text-gray-600">Base N</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in llmEffectiveness.topics" :key="t.topicId" class="border-t border-gray-100">
                      <td class="px-4 py-2 font-medium">{{ t.topicId }}</td>
                      <td class="px-3 py-2 text-right text-blue-600">{{ formatPct(t.llmAccuracy) }}</td>
                      <td class="px-3 py-2 text-right">{{ formatPct(t.baselineAccuracy) }}</td>
                      <td class="px-3 py-2 text-right font-semibold" :class="t.delta > 0 ? 'text-green-600' : 'text-red-600'">
                        {{ t.delta > 0 ? '+' : '' }}{{ formatPct(t.delta) }}
                      </td>
                      <td class="px-3 py-2 text-right text-gray-500">{{ t.llmAttempts }}</td>
                      <td class="px-3 py-2 text-right text-gray-500">{{ t.baselineAttempts }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Hint Outcomes -->
          <div v-if="llmHintOutcomes && llmHintOutcomes.hintOutcomes.length > 0">
            <h2 class="text-lg font-semibold mb-3">Hint Outcome Comparison</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div v-for="h in llmHintOutcomes.hintOutcomes" :key="h.hintSource" class="bg-white rounded-lg border border-gray-200 p-4">
                <div class="text-sm text-gray-500 capitalize">{{ h.hintSource }} Hints</div>
                <div class="text-2xl font-bold" :class="h.nextAttemptAccuracy !== null ? 'text-gray-800' : 'text-gray-300'">
                  {{ h.nextAttemptAccuracy !== null ? formatPct(h.nextAttemptAccuracy) : '-' }}
                </div>
                <div class="text-xs text-gray-400">next-attempt accuracy (n={{ h.sampleSize }})</div>
              </div>
            </div>
          </div>

          <!-- Mastery Impact -->
          <div v-if="llmMasteryImpact && (llmMasteryImpact.llmAssisted.topicCount > 0 || llmMasteryImpact.baseline.topicCount > 0)">
            <h2 class="text-lg font-semibold mb-3">Mastery Impact</h2>
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left px-4 py-2 font-medium text-gray-600">Cohort</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Avg Reps to Mastery</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Avg Lapses</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Topic Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-t border-gray-100">
                    <td class="px-4 py-2 font-medium text-blue-600">LLM-Assisted</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.llmAssisted.avgRepsToMastery?.toFixed(1) ?? '-' }}</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.llmAssisted.avgLapses?.toFixed(1) ?? '-' }}</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.llmAssisted.topicCount }}</td>
                  </tr>
                  <tr class="border-t border-gray-100">
                    <td class="px-4 py-2 font-medium">Baseline</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.baseline.avgRepsToMastery?.toFixed(1) ?? '-' }}</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.baseline.avgLapses?.toFixed(1) ?? '-' }}</td>
                    <td class="px-3 py-2 text-right">{{ llmMasteryImpact.baseline.topicCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Cohort Comparison -->
          <div v-if="llmCohorts && llmCohorts.cohorts.length > 0">
            <h2 class="text-lg font-semibold mb-3">Cohort Comparison (by LLM Tier)</h2>
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left px-4 py-2 font-medium text-gray-600">Tier</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Users</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Accuracy</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Attempts</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Mastered</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Reps/Mastery</th>
                    <th class="text-right px-3 py-2 font-medium text-gray-600">Lapse Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in llmCohorts.cohorts" :key="c.cohort" class="border-t border-gray-100">
                    <td class="px-4 py-2 font-medium capitalize">{{ c.cohort }}</td>
                    <td class="px-3 py-2 text-right">{{ c.userCount }}</td>
                    <td class="px-3 py-2 text-right" :class="c.avgAccuracy !== null ? healthColor(c.avgAccuracy) : 'text-gray-300'">
                      {{ c.avgAccuracy !== null ? formatPct(c.avgAccuracy) : '-' }}
                    </td>
                    <td class="px-3 py-2 text-right">{{ c.totalAttempts }}</td>
                    <td class="px-3 py-2 text-right">{{ c.masteredTopics }}</td>
                    <td class="px-3 py-2 text-right">{{ c.avgRepsToMastery?.toFixed(1) ?? '-' }}</td>
                    <td class="px-3 py-2 text-right">{{ c.avgLapseRate !== null ? formatPct(c.avgLapseRate) : '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
