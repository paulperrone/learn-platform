import { ref } from "vue";
import { useApi, withErrorToast } from "./useApi";
import type { SpeechSettings } from "@learn/shared";

const DEFAULTS: SpeechSettings = {
  ttsEnabled: true,
  ttsRate: 0.9,
  ttsVoiceName: null,
  ttsAutoRead: false,
  sttEnabled: true,
};

// Module-level singleton state
const ttsEnabled = ref(DEFAULTS.ttsEnabled);
const ttsRate = ref(DEFAULTS.ttsRate);
const ttsVoiceName = ref<string | null>(DEFAULTS.ttsVoiceName);
const ttsAutoRead = ref(DEFAULTS.ttsAutoRead);
const sttEnabled = ref(DEFAULTS.sttEnabled);
const loaded = ref(false);
const loading = ref(false);

export function useSpeechPrefs() {
  const api = useApi();

  async function load() {
    if (loaded.value || loading.value) return;
    loading.value = true;

    const settings = await withErrorToast(
      () => api.getSettings(),
      "Loading speech settings",
    );

    if (settings) {
      ttsEnabled.value = settings.ttsEnabled;
      ttsRate.value = settings.ttsRate;
      ttsVoiceName.value = settings.ttsVoiceName;
      ttsAutoRead.value = settings.ttsAutoRead;
      sttEnabled.value = settings.sttEnabled;
    }

    loaded.value = true;
    loading.value = false;
  }

  async function save(updates: Partial<SpeechSettings>) {
    // Apply locally immediately
    if (updates.ttsEnabled !== undefined) ttsEnabled.value = updates.ttsEnabled;
    if (updates.ttsRate !== undefined) ttsRate.value = updates.ttsRate;
    if (updates.ttsVoiceName !== undefined) ttsVoiceName.value = updates.ttsVoiceName;
    if (updates.ttsAutoRead !== undefined) ttsAutoRead.value = updates.ttsAutoRead;
    if (updates.sttEnabled !== undefined) sttEnabled.value = updates.sttEnabled;

    await withErrorToast(
      () => api.updateSettings(updates),
      "Saving speech settings",
    );
  }

  return {
    ttsEnabled,
    ttsRate,
    ttsVoiceName,
    ttsAutoRead,
    sttEnabled,
    loaded,
    load,
    save,
  };
}
