<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  topicName: string;
  unlockedTopics: { id: string; name: string }[];
}>();

const emit = defineEmits<{ dismiss: [] }>();
const { t } = useI18n();

const visible = ref(false);

onMounted(() => {
  // Trigger enter animation on next frame
  requestAnimationFrame(() => {
    visible.value = true;
  });
  // Auto-dismiss after 6 seconds
  setTimeout(() => emit("dismiss"), 6000);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @click="emit('dismiss')"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/30 transition-opacity duration-300"
        :class="visible ? 'opacity-100' : 'opacity-0'"
      />

      <!-- Card -->
      <div
        class="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center transition-all duration-500"
        :class="visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'"
        @click.stop
      >
        <!-- Mastery icon -->
        <div class="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 class="text-2xl font-bold text-gray-900 mb-2">
          {{ t('mastery.congratulations') }}
        </h2>
        <p class="text-lg text-green-700 font-medium mb-4">
          {{ t('mastery.topicMastered', { topic: topicName }) }}
        </p>

        <!-- Unlocked topics -->
        <div v-if="unlockedTopics.length > 0" class="mt-4 bg-blue-50 rounded-lg p-4 text-left">
          <p class="text-sm font-semibold text-blue-800 mb-2">
            {{ t('mastery.unlocked', { count: unlockedTopics.length }) }}
          </p>
          <ul class="space-y-1">
            <li
              v-for="topic in unlockedTopics"
              :key="topic.id"
              class="flex items-center gap-2 text-sm text-blue-700"
            >
              <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              {{ topic.name }}
            </li>
          </ul>
        </div>

        <button
          @click="emit('dismiss')"
          class="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          {{ t('mastery.continue') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
