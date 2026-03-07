<script setup lang="ts">
import { useI18n } from "vue-i18n";

const props = defineProps<{
  modelValue: number;
  binary?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const { t } = useI18n();

const labels = ["Very unsure", "Unsure", "Somewhat sure", "Sure", "Very sure"];

function selectBinary(confident: boolean) {
  emit("update:modelValue", confident ? 4 : 2);
}
</script>

<template>
  <div class="space-y-2">
    <label class="block text-sm font-medium text-gray-700">
      {{ t('confidence.howConfident') }}
    </label>

    <!-- Binary mode for younger students -->
    <div v-if="binary" class="flex gap-3">
      <button
        type="button"
        @click="selectBinary(false)"
        :class="[
          'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border-2 transition-colors',
          modelValue <= 2
            ? 'border-amber-400 bg-amber-50 text-amber-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
        ]"
      >
        {{ t('confidence.notSure') }}
      </button>
      <button
        type="button"
        @click="selectBinary(true)"
        :class="[
          'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border-2 transition-colors',
          modelValue >= 4
            ? 'border-green-400 bg-green-50 text-green-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
        ]"
      >
        {{ t('confidence.gotIt') }}
      </button>
    </div>

    <!-- Slider mode for older students -->
    <template v-else>
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
    </template>
  </div>
</template>
