<script setup lang="ts">
import { useSpeech } from "../composables/useSpeech";

const props = defineProps<{
  text: string;
  convertMath?: boolean;
  size?: "sm" | "md";
}>();

const { state, supported, toggle, stop } = useSpeech();

function handleClick() {
  toggle(props.text, { convertMath: props.convertMath ?? true });
}
</script>

<template>
  <button
    v-if="supported"
    @click="handleClick"
    :title="state === 'idle' ? 'Read aloud' : state === 'speaking' ? 'Pause' : 'Resume'"
    class="inline-flex items-center justify-center rounded-lg border transition-colors"
    :class="[
      state !== 'idle'
        ? 'border-blue-300 bg-blue-50 text-blue-600'
        : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700',
      size === 'sm' ? 'p-1.5' : 'p-2',
    ]"
  >
    <!-- Speaker icon (idle) -->
    <svg v-if="state === 'idle'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" :class="size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
    <!-- Pause icon (speaking) -->
    <svg v-else-if="state === 'speaking'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" :class="size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
    <!-- Play icon (paused) -->
    <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" :class="size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
    </svg>
  </button>
</template>
