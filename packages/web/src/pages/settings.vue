<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useSpeechPrefs } from "@/composables/useSpeechPrefs";
import { useSpeech } from "@/composables/useSpeech";
import { useChildMode } from "@/composables/useChildMode";
import { useToast } from "@/composables/useToast";
import { useLocale } from "@/composables/useLocale";
import { useI18n } from "vue-i18n";

const toast = useToast();
const prefs = useSpeechPrefs();
const childMode = useChildMode();
const { supported: ttsSupported, voices } = useSpeech();
const { currentLocale, setLocale, supportedLocales } = useLocale();
const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);

// Local form state
const ttsEnabled = ref(true);
const ttsRate = ref(0.9);
const ttsVoiceName = ref<string | null>(null);
const ttsAutoRead = ref(false);
const sttEnabled = ref(true);

const filteredVoices = computed(() =>
  voices.value.filter((v) => v.lang.startsWith(currentLocale.value))
);

// Fallback to English voices if none available for current locale
const displayVoices = computed(() =>
  filteredVoices.value.length > 0
    ? filteredVoices.value
    : voices.value.filter((v) => v.lang.startsWith("en"))
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
  toast.success(t("settings.saved"));
}
</script>

<template>
  <div class="max-w-xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">{{ t('settings.title') }}</h1>

    <div v-if="loading" class="flex items-center justify-center gap-3 text-gray-400 py-12">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{{ t('settings.loadingSettings') }}</span>
    </div>

    <form v-else @submit.prevent="handleSave" class="space-y-8">
      <!-- Language -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">{{ t('settings.language') }}</legend>
        <div class="mt-2">
          <label for="locale" class="block text-sm font-medium text-gray-700 mb-1">{{ t('settings.selectLanguage') }}</label>
          <select
            id="locale"
            :value="currentLocale"
            @change="setLocale(($event.target as HTMLSelectElement).value as any)"
            class="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option v-for="loc in supportedLocales" :key="loc.code" :value="loc.code">
              {{ loc.name }}
            </option>
          </select>
        </div>
      </fieldset>

      <!-- Text-to-Speech -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">{{ t('settings.tts') }}</legend>

        <div class="space-y-5 mt-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="ttsEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">{{ t('settings.enableReadAloud') }}</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="ttsAutoRead"
              :disabled="!ttsEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span class="text-sm text-gray-700" :class="{ 'opacity-50': !ttsEnabled }">
              {{ t('settings.autoRead') }}
            </span>
          </label>

          <div>
            <label for="voice" class="block text-sm font-medium text-gray-700 mb-1">{{ t('settings.voice') }}</label>
            <select
              id="voice"
              v-model="ttsVoiceName"
              :disabled="!ttsEnabled"
              class="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              <option :value="null">{{ t('settings.voiceAuto') }}</option>
              <option v-for="v in displayVoices" :key="v.name" :value="v.name">
                {{ v.name }}
              </option>
            </select>
          </div>

          <div>
            <label for="rate" class="block text-sm font-medium text-gray-700 mb-1">
              {{ t('settings.speed', { rate: ttsRate.toFixed(1) }) }}
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
              <span>{{ t('settings.slower') }}</span>
              <span>{{ t('settings.faster') }}</span>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- Speech-to-Text -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">{{ t('settings.stt') }}</legend>

        <div class="mt-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              v-model="sttEnabled"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">{{ t('settings.enableVoiceInput') }}</span>
          </label>
        </div>
      </fieldset>

      <!-- Young Child Mode -->
      <fieldset class="bg-white rounded-lg border border-gray-200 p-6">
        <legend class="text-lg font-semibold text-gray-800 px-2">{{ t('settings.simplifiedMode') }}</legend>

        <div class="space-y-3 mt-2">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              :checked="childMode.enabled.value"
              @change="childMode.toggle()"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700">{{ t('settings.enableChildMode') }}</span>
          </label>
          <p class="text-xs text-gray-500 ml-7">
            {{ t('settings.childModeHint') }}
          </p>
        </div>
      </fieldset>

      <button
        type="submit"
        :disabled="saving"
        class="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {{ saving ? t('settings.saving') : t('settings.save') }}
      </button>
    </form>
  </div>
</template>
