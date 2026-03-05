<script setup lang="ts">
import { ref, computed } from "vue";
import type { MatchingProperties } from "@learn/shared";

const props = defineProps<{
  typeProperties: MatchingProperties;
}>();

// Shuffle the right-side options for display
const shuffledRights = computed(() => {
  const rights = props.typeProperties.pairs.map((p) => p.right);
  // Fisher-Yates shuffle with deterministic seed from first pair
  const arr = [...rights];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
});

const selections = ref<(string | null)[]>(
  new Array(props.typeProperties.pairs.length).fill(null)
);

function selectRight(leftIndex: number, right: string) {
  selections.value[leftIndex] = right;
}

defineExpose({
  checkAnswer(): { correct: boolean; display: string } {
    const pairs = props.typeProperties.pairs;
    let allCorrect = true;
    for (let i = 0; i < pairs.length; i++) {
      if (selections.value[i] !== pairs[i].right) {
        allCorrect = false;
        break;
      }
    }
    return {
      correct: allCorrect,
      display: JSON.stringify(
        pairs.map((p, i) => ({ left: p.left, selected: selections.value[i] }))
      ),
    };
  },
});

const hasAnswer = computed(() => selections.value.every((s) => s !== null));
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-gray-500">Match each item on the left with the correct item on the right.</p>
    <div class="space-y-2">
      <div
        v-for="(pair, i) in typeProperties.pairs"
        :key="i"
        class="flex items-center gap-3"
      >
        <span class="flex-1 text-right font-medium text-gray-800 bg-gray-50 rounded-lg p-3">
          {{ pair.left }}
        </span>
        <span class="text-gray-400">&rarr;</span>
        <select
          :value="selections[i]"
          @change="selectRight(i, ($event.target as HTMLSelectElement).value)"
          class="flex-1 border border-gray-300 rounded-lg p-3 text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option :value="null" disabled selected>Select...</option>
          <option v-for="right in shuffledRights" :key="right" :value="right">
            {{ right }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
