<script setup lang="ts">
import { ref, computed } from "vue";
import type { MultiSelectProperties } from "@learn/shared";

const props = defineProps<{
  typeProperties: MultiSelectProperties;
}>();

const selected = ref<Set<number>>(new Set());

function toggle(index: number) {
  const s = new Set(selected.value);
  if (s.has(index)) {
    s.delete(index);
  } else {
    s.add(index);
  }
  selected.value = s;
}

const hasAnswer = computed(() => selected.value.size > 0);

defineExpose({
  checkAnswer(): { correct: boolean; display: string } {
    const correct = props.typeProperties.correctIndices;
    const sel = [...selected.value].sort();
    const exp = [...correct].sort();
    const isCorrect =
      sel.length === exp.length && sel.every((v, i) => v === exp[i]);
    return {
      correct: isCorrect,
      display: JSON.stringify(sel),
    };
  },
});
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-gray-500">Select all correct answers.</p>
    <div class="space-y-2">
      <label
        v-for="(option, i) in typeProperties.options"
        :key="i"
        class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
        :class="{
          'border-blue-400 bg-blue-50': selected.has(i),
          'border-gray-200 hover:border-gray-300 hover:bg-gray-50': !selected.has(i),
        }"
      >
        <input
          type="checkbox"
          :checked="selected.has(i)"
          @change="toggle(i)"
          class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
        <span class="text-gray-800">{{ option }}</span>
      </label>
    </div>
  </div>
</template>
