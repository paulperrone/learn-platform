<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { AssessmentResult } from "@learn/shared";

const props = defineProps<{
  result: AssessmentResult;
}>();

const emit = defineEmits<{
  retake: [];
}>();

const router = useRouter();

const scorePercent = computed(() => Math.round(props.result.rawScore * 100));

const scoreColor = computed(() => {
  if (scorePercent.value >= 80) return "text-green-600";
  if (scorePercent.value >= 50) return "text-yellow-600";
  return "text-red-600";
});

const scoreBg = computed(() => {
  if (scorePercent.value >= 80) return "bg-green-50 border-green-200";
  if (scorePercent.value >= 50) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
});

const scoreBadgeLabel = computed(() => {
  if (scorePercent.value >= 80) return "Proficient";
  if (scorePercent.value >= 50) return "Developing";
  return "Needs Support";
});

const strandEntries = computed(() =>
  Object.entries(props.result.strandScores).map(([strand, data]) => ({
    strand,
    ...data,
    percent: Math.round(data.score * 100),
  })).sort((a, b) => b.percent - a.percent)
);

const standardEntries = computed(() =>
  Object.values(props.result.standardScores).map((s) => ({
    ...s,
    percent: Math.round((s.total > 0 ? s.correct / s.total : 0) * 100),
  })).sort((a, b) => a.standard.localeCompare(b.standard))
);

function classificationClass(classification: string) {
  if (classification === "proficient") return "bg-green-100 text-green-700";
  if (classification === "developing") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

const scopeLabel = computed(() => {
  const s = props.result.scope;
  if (s.type === "comprehensive") return "All Mastered Topics";
  if (s.type === "grade-band" && s.gradeLevel != null) return `Grade ${s.gradeLevel} Topics`;
  if (s.type === "strand" && s.strandId) return `${s.strandId} Topics`;
  if (s.type === "collection" && s.collectionId) return `Collection: ${s.collectionId}`;
  if (s.type === "custom") return "Custom Topic Set";
  return "Assessment";
});

const completedDate = computed(() => {
  if (!props.result.completedAt) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(props.result.completedAt));
});
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Overall score -->
    <div :class="['rounded-xl border p-8 text-center mb-6', scoreBg]">
      <div class="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
        {{ scopeLabel }} · {{ completedDate }}
        <span v-if="result.status === 'timed-out'" class="ml-2 text-orange-600">(timed out)</span>
      </div>
      <div :class="['text-6xl font-bold mb-1', scoreColor]">{{ scorePercent }}%</div>
      <div :class="['text-sm font-medium', scoreColor]">{{ scoreBadgeLabel }}</div>
      <div class="mt-3 text-sm text-gray-500">
        {{ result.totalCorrect }} correct out of {{ result.totalQuestions }} questions
      </div>
    </div>

    <!-- Per-strand breakdown -->
    <div v-if="strandEntries.length > 0" class="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Strand Breakdown</h3>
      <div class="space-y-3">
        <div v-for="entry in strandEntries" :key="entry.strand">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-700 capitalize">{{ entry.strand.replace(/-/g, " ") }}</span>
            <span class="text-gray-500">{{ entry.correct }}/{{ entry.total }} · {{ entry.percent }}%</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="entry.percent >= 80 ? 'bg-green-500' : entry.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'"
              :style="{ width: `${entry.percent}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Standards alignment -->
    <div v-if="standardEntries.length > 0" class="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Standards Alignment</h3>
      <div class="divide-y divide-gray-100">
        <div
          v-for="entry in standardEntries"
          :key="entry.standard"
          class="py-2 flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <span class="text-sm font-mono text-gray-600">{{ entry.standard }}</span>
            <span class="text-sm text-gray-500">{{ entry.correct }}/{{ entry.total }}</span>
          </div>
          <span
            class="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
            :class="classificationClass(entry.classification)"
          >
            {{ entry.classification.replace("-", " ") }}
          </span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <button
        class="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        @click="router.push('/progress')"
      >
        View Progress
      </button>
      <button
        class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        @click="emit('retake')"
      >
        Take Another Test
      </button>
    </div>
  </div>
</template>
