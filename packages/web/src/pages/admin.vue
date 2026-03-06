<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";

const api = useApi();

const loading = ref(true);
const error = ref(false);
const activeTab = ref<"overview" | "models" | "usage" | "content" | "quality" | "patterns" | "system">("overview");

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
const selectedQualityTopic = ref<string | null>(null);
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
    const [s, sys, configs, usage, users, content, patterns, quality, spikes, versions] = await Promise.all([
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
    ]);
    return { s, sys, configs, usage, users, content, patterns, quality, spikes, versions };
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

const tabs = [
  { id: "overview" as const, label: "Overview" },
  { id: "system" as const, label: "System Stats" },
  { id: "models" as const, label: "Model Config" },
  { id: "usage" as const, label: "LLM Usage" },
  { id: "quality" as const, label: "Content Quality" },
  { id: "content" as const, label: "Content Effectiveness" },
  { id: "patterns" as const, label: "Learning Patterns" },
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
    </template>
  </div>
</template>
