<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useDictation } from "../composables/useDictation";
import { useSpeechPrefs } from "../composables/useSpeechPrefs";

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  transcription: [text: string];
}>();

const { state, error, supported, start, stop, cancel, checkAvailable } = useDictation();
const { sttEnabled } = useSpeechPrefs();
const sttAvailable = ref(false);

onMounted(async () => {
  if (supported.value) {
    sttAvailable.value = await checkAvailable();
  }
});

async function handleClick() {
  if (state.value === "recording") {
    const text = await stop();
    if (text) {
      emit("transcription", text);
    } else if (error.value) {
      // Transcription failed (e.g. AI binding broken) — hide mic to avoid repeated failures
      sttAvailable.value = false;
    }
  } else if (state.value === "idle") {
    await start();
  }
}
</script>

<template>
  <div v-if="supported && sttAvailable && sttEnabled" class="inline-flex flex-col items-center">
    <button
      @click="handleClick"
      :disabled="disabled || state === 'processing'"
      :aria-label="state === 'idle' ? 'Start voice input' : state === 'recording' ? 'Stop recording' : 'Processing speech'"
      :title="state === 'idle' ? 'Speak your answer' : state === 'recording' ? 'Stop recording' : 'Processing...'"
      class="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all"
      :class="{
        'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700': state === 'idle' && !disabled,
        'border-red-400 bg-red-50 text-red-600 animate-pulse': state === 'recording',
        'border-blue-300 bg-blue-50 text-blue-500': state === 'processing',
        'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed': disabled,
      }"
    >
      <!-- Mic icon (idle) -->
      <svg v-if="state === 'idle'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
      </svg>
      <!-- Stop icon (recording) -->
      <svg v-else-if="state === 'recording'" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="w-5 h-5">
        <path fill-rule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clip-rule="evenodd" />
      </svg>
      <!-- Spinner (processing) -->
      <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-5 h-5 animate-spin">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
      </svg>
    </button>

    <span v-if="error" class="text-xs text-red-500 mt-1 max-w-[120px] text-center">{{ error }}</span>
  </div>
</template>
