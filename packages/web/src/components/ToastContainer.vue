<script setup lang="ts">
import { useToast } from "@/composables/useToast";

const { toasts, dismiss } = useToast();

function typeClasses(type: string) {
  switch (type) {
    case "error": return "bg-red-600 text-white";
    case "success": return "bg-green-600 text-white";
    default: return "bg-gray-800 text-white";
  }
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="typeClasses(toast.type)"
        class="px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3"
      >
        <span class="flex-1">{{ toast.message }}</span>
        <button @click="dismiss(toast.id)" class="opacity-70 hover:opacity-100 shrink-0">&times;</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(1rem);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
</style>
