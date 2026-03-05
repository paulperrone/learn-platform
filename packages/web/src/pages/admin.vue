<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useApi, withErrorToast } from "@/composables/useApi";

const api = useApi();

const loading = ref(true);
const error = ref(false);
const activeTab = ref<"overview" | "models" | "usage" | "content" | "patterns">("overview");

// Data
const stats = ref<{
  totalUsers: number;
  totalFamilies: number;
  totalTopics: number;
  totalReviews: number;
  llmCostCentsAllTime: number;
  llmCostCentsThisMonth: number;
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
    const [s, configs, usage, users, content, patterns] = await Promise.all([
      api.getAdminStats(),
      api.getAdminLLMConfig(),
      api.getAdminLLMUsage(),
      api.getAdminTopUsers(),
      api.getContentEffectiveness(),
      api.getLearningPatterns(),
    ]);
    return { s, configs, usage, users, content, patterns };
  }, "Failed to load admin data");

  if (result) {
    stats.value = result.s;
    llmConfigs.value = result.configs.configs;
    llmUsage.value = result.usage;
    topUsers.value = result.users.topUsers;
    contentEffectiveness.value = result.content;
    learningPatterns.value = result.patterns;
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
  { id: "models" as const, label: "Model Config" },
  { id: "usage" as const, label: "LLM Usage" },
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
      <div class="flex gap-1 mb-6 border-b border-gray-200">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
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
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
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
            <div class="text-2xl font-bold">{{ stats.totalReviews }}</div>
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
