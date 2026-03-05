<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import { useSpeech } from "@/composables/useSpeech";
import { useToast } from "@/composables/useToast";

const toast = useToast();
const prefs = useSpeechPrefs();
const { supported: ttsSupported, voices } = useSpeech();

const loading = ref(true);
const saving = ref(false);

// Local form state
const ttsEnabled = ref(true);
const ttsRate = ref(0.9);
const ttsVoiceName = ref<string | null>(null);
const ttsAutoRead = ref(false);
const sttEnabled = ref(true);

const englishVoices = computed(() =>
  voices.value.filter((v) => v.lang.startsWith("en"))
);

onMounted(async () => {
  await prefs.load();
  ttsEnabled.value = prefs.ttsEnabled.value;
  ttsRate.value = prefs.ttsRate.value;
  ttsVoiceName.value = prefs.ttsVoiceName.value;
  ttsAutoRead.value = prefs.ttsAutoRead.value;
  sttEnabled.value = prefs.sttEnabled.value;
  loading.value = false;
});

async function handleSave() {
  saving.value = true;
  await prefs.save({
    ttsEnabled: ttsEnabled.value,
    ttsRate: ttsRate.value,
    ttsVoiceName: ttsVoiceName.value,
    ttsAutoRead: ttsAutoRead.value,
    sttEnabled: sttEnabled.value,
  });
  saving.value = false;
  toast.success("Settings saved");
}
</script>

<template>
  <div class="max-w-xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Settings</h1>

    <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Loading settings...</span>
    </div>

    <form v-else @submit.prevent="handleSave" class="space-y-8">
      <!-- Text-to-Speech -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">Text-to-Speech</legend>

        <div class="space-y-5 mt-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="ttsEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">Enable read-aloud</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="ttsAutoRead"
              :disabled="!ttsEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span class="text-sm text-gray-700" :class="{ 'opacity-50': !ttsEnabled }">
              Auto-read problems when they appear
            </span>
          </label>

          <div>
            <label for="voice" class="block text-sm font-medium text-gray-700 mb-1">Voice</label>
            <select
              id="voice"
              v-model="ttsVoiceName"
              :disabled="!ttsEnabled"
              class="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              <option :value="null">Auto-select</option>
              <option v-for="v in englishVoices" :key="v.name" :value="v.name">
                {{ v.name }}
              </option>
            </select>
          </div>

          <div>
            <label for="rate" class="block text-sm font-medium text-gray-700 mb-1">
              Speed: {{ ttsRate.toFixed(1) }}x
            </label>
            <input
              id="rate"
              type="range"
              v-model.number="ttsRate"
              min="0.5"
              max="1.5"
              step="0.1"
              :disabled="!ttsEnabled"
              class="w-full disabled:opacity-50"
            />
            <div class="flex justify-between text-xs text-gray-400 mt-1" :class="{ 'opacity-50': !ttsEnabled }">
              <span>Slower</span>
              <span>Faster</span>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- Speech-to-Text -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">Speech-to-Text</legend>

        <div class="mt-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="sttEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">Enable voice input for answers</span>
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        :disabled="saving"
        class="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {{ saving ? "Saving..." : "Save Settings" }}
      </button>
    </form>
  </div>
</template>
