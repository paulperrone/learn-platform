<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useApi } from "@/composables/useApi";

const api = useApi();
const topics = ref<any[]>([]);
const loading = ref(true);
const selectedTopic = ref<any>(null);
const prereqs = ref<string[]>([]);

onMounted(async () => {
  try {
    const data = await api.getTopics("math-k5");
    topics.value = data.topics;
  } catch (e) {
    console.error("Failed to load topics:", e);
  } finally {
    loading.value = false;
  }
});

const maxDepth = computed(() =>
  Math.max(...topics.value.map((t) => t.depth), 0)
);

const topicsByDepth = computed(() => {
  const groups = new Map<number, any[]>();
  for (const t of topics.value) {
    if (!groups.has(t.depth)) groups.set(t.depth, []);
    groups.get(t.depth)!.push(t);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
});

async function selectTopic(topic: any) {
  selectedTopic.value = topic;
  try {
    const data = await fetch(`/api/graph/topics/${topic.id}/prerequisites`).then((r) => r.json());
    prereqs.value = data.prerequisites;
  } catch (e) {
    prereqs.value = [];
  }
}

function gradeName(level: number) {
  return level === 0 ? "K" : `${level}`;
}

function depthColor(depth: number) {
  const hue = (depth / Math.max(maxDepth.value, 1)) * 240; // blue to red
  return `hsl(${240 - hue}, 70%, 90%)`;
}
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-2">Knowledge Graph Explorer</h1>
    <p class="text-gray-500 mb-6">{{ topics.length }} topics across {{ maxDepth + 1 }} depth levels</p>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else class="flex gap-6">
      <!-- Graph visualization -->
      <div class="flex-1">
        <div v-for="[depth, depthTopics] in topicsByDepth" :key="depth" class="mb-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-medium text-gray-400 w-16">Depth {{ depth }}</span>
            <div class="h-px flex-1 bg-gray-200" />
          </div>
          <div class="flex flex-wrap gap-2 ml-16">
            <button
              v-for="topic in depthTopics"
              :key="topic.id"
              @click="selectTopic(topic)"
              class="px-3 py-1.5 rounded-lg text-sm border transition-all cursor-pointer"
              :class="[
                selectedTopic?.id === topic.id
                  ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50 font-medium'
                  : prereqs.includes(topic.id)
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              ]"
              :style="{ backgroundColor: selectedTopic?.id !== topic.id && !prereqs.includes(topic.id) ? depthColor(depth) : undefined }"
            >
              <span class="text-gray-500 text-xs mr-1">G{{ gradeName(topic.gradeLevel) }}</span>
              {{ topic.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- Detail panel -->
      <div v-if="selectedTopic" class="w-80 shrink-0">
        <div class="bg-white rounded-lg border border-gray-200 p-5 sticky top-4">
          <h3 class="font-semibold text-lg mb-2">{{ selectedTopic.name }}</h3>
          <p class="text-sm text-gray-600 mb-4">{{ selectedTopic.description }}</p>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">Grade</span>
              <span>{{ gradeName(selectedTopic.gradeLevel) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Depth</span>
              <span>{{ selectedTopic.depth }}</span>
            </div>
            <div v-if="selectedTopic.standardCode" class="flex justify-between">
              <span class="text-gray-500">Standard</span>
              <span class="font-mono text-xs">{{ selectedTopic.standardCode }}</span>
            </div>
          </div>

          <div v-if="prereqs.length > 0" class="mt-4 pt-4 border-t border-gray-200">
            <p class="text-sm font-medium text-gray-700 mb-2">
              Prerequisites ({{ prereqs.length }})
            </p>
            <div class="space-y-1">
              <p v-for="pid in prereqs.slice(0, 10)" :key="pid" class="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
                {{ topics.find((t) => t.id === pid)?.name ?? pid }}
              </p>
              <p v-if="prereqs.length > 10" class="text-xs text-gray-400">
                ... and {{ prereqs.length - 10 }} more
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
