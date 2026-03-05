<script setup lang="ts">
import { ref } from "vue";
import type { NumericalInputProperties } from "@learn/shared";

const props = defineProps<{
  answer: string;
  typeProperties?: NumericalInputProperties;
}>();

const emit = defineEmits<{
  "update:value": [value: string];
}>();

const value = ref("");

function handleInput(e: Event) {
  value.value = (e.target as HTMLInputElement).value;
  emit("update:value", value.value);
}

defineExpose({
  checkAnswer(): { correct: boolean; display: string } {
    const studentVal = parseFloat(value.value);
    const correctVal = parseFloat(props.answer);

    if (isNaN(studentVal)) {
      return { correct: false, display: value.value || "(empty)" };
    }

    const tolerance = props.typeProperties?.tolerance ?? 0;
    const correct = Math.abs(studentVal - correctVal) <= tolerance;
    return { correct, display: value.value };
  },
});
</script>

<template>
  <div>
    <div class="flex items-center gap-2">
      <input
        :value="value"
        @input="handleInput"
        type="number"
        step="any"
        inputmode="decimal"
        class="flex-1 border border-gray-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        placeholder="Type your answer..."
      />
      <span v-if="typeProperties?.unit" class="text-gray-500 text-lg font-medium">
        {{ typeProperties.unit }}
      </span>
    </div>
  </div>
</template>
