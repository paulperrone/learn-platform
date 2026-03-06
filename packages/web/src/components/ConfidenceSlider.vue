<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  modelValue: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const { t } = useI18n();

const labels = ["Very unsure", "Unsure", "Somewhat sure", "Sure", "Very sure"];
</script>

<template>
  <div class="space-y-2">
    <label class="block text-sm font-medium text-gray-700">
      How confident are you?
    </label>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-400 w-16">{{ t('confidence.guessing') }}</span>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        :value="modelValue"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
        class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <span class="text-xs text-gray-400 w-16 text-right">{{ t('confidence.certain') }}</span>
    </div>
    <p class="text-center text-sm text-gray-500">{{ labels[modelValue - 1] }}</p>
  </div>
</template>
