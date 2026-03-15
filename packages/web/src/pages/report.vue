<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useApi, withErrorToast } from "@/composables/useApi";
import type { ProgressReport, DomainScore } from "@learn/shared";

const api = useApi();
const route = useRoute();

const disciplineId = route.params.disciplineId as string;
const report = ref<ProgressReport | null>(null);
const loading = ref(true);
const expandedDomains = ref<Set<string>>(new Set());

onMounted(async () => {
  const res = await withErrorToast(() => api.getProgressReport(disciplineId), "Failed to load report");
  if (res) report.value = res;
  loading.value = false;
});

function toggleDomain(domain: string) {
  if (expandedDomains.value.has(domain)) {
    expandedDomains.value.delete(domain);
  } else {
    expandedDomains.value.add(domain);
  }
}

function classColor(cls: string) {
  if (cls === "proficient") return "text-green-700 bg-green-50 border-green-200";
  if (cls === "developing") return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function classLabel(cls: string) {
  if (cls === "proficient") return "Proficient";
  if (cls === "developing") return "Developing";
  return "Needs Support";
}

function barColor(cls: string) {
  if (cls === "proficient") return "bg-green-500";
  if (cls === "developing") return "bg-yellow-400";
  return "bg-red-400";
}

const overallPercent = computed(() =>
  report.value ? Math.round(report.value.overallMastery * 100) : 0
);

const overallColor = computed(() => {
  if (!report.value) return "text-gray-900";
  if (overallPercent.value >= 80) return "text-green-600";
  if (overallPercent.value >= 50) return "text-yellow-600";
  return "text-red-600";
});

type StandardDetailItem = NonNullable<typeof report.value>["standardDetails"][number];

function printReport() {
  window.print();
}

const standardsByDomain = computed(() => {
  if (!report.value) return new Map<string, StandardDetailItem[]>();
  const map = new Map<string, StandardDetailItem[]>();
  for (const s of report.value.standardDetails) {
    if (!map.has(s.domain)) map.set(s.domain, []);
    map.get(s.domain)!.push(s);
  }
  return map;
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-4">
    <div class="max-w-2xl mx-auto">

      <!-- Header -->
      <div class="mb-8 print:mb-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 capitalize">{{ disciplineId }} Progress Report</h1>
            <p v-if="report" class="text-sm text-gray-500 mt-1">
              Generated {{ new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(report.generatedAt)) }}
            </p>
          </div>
          <button
            class="text-sm text-gray-500 hover:text-gray-700 print:hidden"
            @click="printReport"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center gap-3 text-gray-400 py-12">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading report...</span>
      </div>

      <template v-else-if="report">

        <!-- Overall score card -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Overall Mastery</p>
              <p class="text-4xl font-bold" :class="overallColor">{{ overallPercent }}%</p>
              <p class="text-sm text-gray-500 mt-1">
                {{ report.domainScores.filter(d => d.classification === 'proficient').length }} of {{ report.domainScores.length }} domains proficient
              </p>
            </div>
            <div class="text-right">
              <div class="text-sm text-gray-500 mb-1">Standards coverage</div>
              <div class="text-lg font-semibold text-gray-900">
                {{ report.standardDetails.filter(s => s.classification === 'proficient').length }} / {{ report.standardDetails.length }}
              </div>
              <div class="text-xs text-gray-400">proficient</div>
            </div>
          </div>
        </div>

        <!-- Domain breakdown -->
        <div v-if="report.domainScores.length > 0" class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">By Domain</h2>

          <div class="space-y-4">
            <div v-for="domain in report.domainScores" :key="domain.domain">
              <!-- Domain header (clickable to expand) -->
              <button
                class="w-full text-left"
                @click="toggleDomain(domain.domain)"
              >
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-800">{{ domain.domainName }}</span>
                    <span class="text-xs text-gray-400">{{ domain.domain }}</span>
                    <svg
                      class="w-3.5 h-3.5 text-gray-400 transition-transform print:hidden"
                      :class="{ 'rotate-180': expandedDomains.has(domain.domain) }"
                      viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs border rounded px-1.5 py-0.5 font-medium" :class="classColor(domain.classification)">
                      {{ classLabel(domain.classification) }}
                    </span>
                    <span class="text-sm font-semibold text-gray-700">{{ Math.round(domain.percentage * 100) }}%</span>
                  </div>
                </div>
                <!-- Bar -->
                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="barColor(domain.classification)"
                    :style="{ width: `${Math.round(domain.percentage * 100)}%` }"
                  />
                </div>
                <div class="text-xs text-gray-400 mt-0.5 text-right">
                  {{ domain.masteredCount }} of {{ domain.standardCount }} standards proficient
                </div>
              </button>

              <!-- Expanded: per-standard detail -->
              <div
                v-if="expandedDomains.has(domain.domain)"
                class="mt-2 ml-4 space-y-2 border-l-2 border-gray-100 pl-4 print:block"
              >
                <div
                  v-for="std in standardsByDomain.get(domain.domain) ?? []"
                  :key="std.standard"
                  class="flex items-center justify-between text-sm"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-gray-500 w-16 shrink-0">{{ std.standard }}</span>
                    <div class="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full"
                        :class="barColor(std.classification)"
                        :style="{ width: `${Math.round(std.percentage * 100)}%` }"
                      />
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">{{ std.masteredCount }}/{{ std.topicCount }} topics</span>
                    <span class="text-xs border rounded px-1.5 py-0.5 font-medium" :class="classColor(std.classification)">
                      {{ classLabel(std.classification) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Topics to focus -->
        <div v-if="report.topicsToFocus.length > 0" class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Topics to Focus On</h2>
          <div class="space-y-2">
            <div
              v-for="topic in report.topicsToFocus"
              :key="topic.topicId"
              class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <span class="text-sm text-gray-800">{{ topic.topicName }}</span>
              <span v-if="topic.standardCode" class="text-xs font-mono text-gray-400">{{ topic.standardCode }}</span>
            </div>
          </div>
        </div>

        <!-- Empty state: no standards coverage -->
        <div v-if="report.standardDetails.length === 0" class="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
          No standards data yet. Complete more topics to see your progress against Common Core standards.
        </div>

      </template>

      <!-- No data state -->
      <div v-else class="text-center py-12 text-gray-500 text-sm">
        Failed to load report. Please try again.
      </div>

    </div>
  </div>
</template>

<style>
@media print {
  nav { display: none !important; }
  .print\:hidden { display: none !important; }
  .print\:block { display: block !important; }
}
</style>
