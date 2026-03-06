import { ref, watch, onUnmounted } from "vue";
import { useSpeechPrefs } from "./useSpeechPrefs";
import { i18n } from "../i18n";

/**
 * Convert math notation to speakable text for young learners.
 * Handles common K-5 math symbols and number words.
 */
export function mathToSpeech(text: string): string {
  let result = text;

  // Replace math operators with words
  result = result.replace(/\s*\+\s*/g, " plus ");
  result = result.replace(/\s*-\s*/g, " minus ");
  result = result.replace(/\s*[×x]\s*/gi, " times ");
  result = result.replace(/\s*÷\s*/g, " divided by ");
  result = result.replace(/\s*=\s*/g, " equals ");
  result = result.replace(/\s*>\s*/g, " is greater than ");
  result = result.replace(/\s*<\s*/g, " is less than ");
  result = result.replace(/\s*≥\s*/g, " is greater than or equal to ");
  result = result.replace(/\s*≤\s*/g, " is less than or equal to ");
  result = result.replace(/\s*≠\s*/g, " is not equal to ");

  // Replace "?" at end of expression with "what"
  result = result.replace(/\?\s*$/, "what?");
  // Replace standalone "?" or "_" placeholders
  result = result.replace(/\b_+\b/g, "what");

  // Fractions like 1/2, 3/4
  result = result.replace(/(\d+)\s*\/\s*(\d+)/g, "$1 over $2");

  // Clean up extra whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

export type SpeechState = "idle" | "speaking" | "paused";

export function useSpeech() {
  const prefs = useSpeechPrefs();
  const state = ref<SpeechState>("idle");
  const supported = ref(typeof window !== "undefined" && "speechSynthesis" in window);
  const voices = ref<SpeechSynthesisVoice[]>([]);
  const selectedVoice = ref<SpeechSynthesisVoice | null>(null);
  const rate = ref(prefs.ttsRate.value);

  let currentUtterance: SpeechSynthesisUtterance | null = null;

  // Sync rate from preferences
  watch(() => prefs.ttsRate.value, (v) => { rate.value = v; });

  function loadVoices() {
    if (!supported.value) return;
    const available = speechSynthesis.getVoices();
    if (available.length > 0) {
      voices.value = available;
      pickDefaultVoice();
    }
  }

  function pickDefaultVoice() {
    // If user has a saved voice preference, try to match it
    if (prefs.ttsVoiceName.value) {
      const saved = voices.value.find((v) => v.name === prefs.ttsVoiceName.value);
      if (saved) {
        selectedVoice.value = saved;
        return;
      }
    }

    if (selectedVoice.value) return;

    const lang = i18n.global.locale.value || "en";
    const localeVoices = voices.value.filter((v) => v.lang.startsWith(lang));

    // Prefer high-quality voices for the current locale
    const preferred = localeVoices.find(
      (v) =>
        v.name.includes("Google") ||
        v.name.includes("Samantha") ||
        v.name.includes("Karen") ||
        v.name.includes("Daniel")
    );

    selectedVoice.value = preferred ?? localeVoices[0] ?? voices.value[0] ?? null;
  }

  // Re-pick voice when preferences load
  watch(() => prefs.ttsVoiceName.value, () => {
    if (voices.value.length > 0) pickDefaultVoice();
  });

  if (supported.value) {
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }

  function speak(text: string, { convertMath = true }: { convertMath?: boolean } = {}) {
    if (!supported.value || !prefs.ttsEnabled.value) return;

    stop();

    const speakableText = convertMath ? mathToSpeech(text) : text;
    const utterance = new SpeechSynthesisUtterance(speakableText);

    if (selectedVoice.value) utterance.voice = selectedVoice.value;
    utterance.rate = rate.value;
    utterance.pitch = 1;

    utterance.onstart = () => {
      state.value = "speaking";
    };
    utterance.onend = () => {
      state.value = "idle";
      currentUtterance = null;
    };
    utterance.onerror = (e) => {
      if (e.error !== "canceled") {
        console.warn("[useSpeech] error:", e.error);
      }
      state.value = "idle";
      currentUtterance = null;
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }

  function pause() {
    if (!supported.value || state.value !== "speaking") return;
    speechSynthesis.pause();
    state.value = "paused";
  }

  function resume() {
    if (!supported.value || state.value !== "paused") return;
    speechSynthesis.resume();
    state.value = "speaking";
  }

  function stop() {
    if (!supported.value) return;
    speechSynthesis.cancel();
    state.value = "idle";
    currentUtterance = null;
  }

  function toggle(text: string, options?: { convertMath?: boolean }) {
    if (state.value === "speaking") {
      pause();
    } else if (state.value === "paused") {
      resume();
    } else {
      speak(text, options);
    }
  }

  onUnmounted(() => {
    stop();
    if (supported.value) {
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    }
  });

  return {
    state,
    supported,
    ttsEnabled: prefs.ttsEnabled,
    ttsAutoRead: prefs.ttsAutoRead,
    voices,
    selectedVoice,
    rate,
    speak,
    pause,
    resume,
    stop,
    toggle,
  };
}
