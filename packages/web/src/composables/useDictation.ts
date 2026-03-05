import { ref, onUnmounted } from "vue";

export type DictationState = "idle" | "recording" | "processing";

const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13",
  fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20",
};

const TENS: Record<string, string> = {
  twenty: "20", thirty: "30", forty: "40", fifty: "50",
  sixty: "60", seventy: "70", eighty: "80", ninety: "90",
};

const MATH_WORDS: Record<string, string> = {
  plus: "+", minus: "-", times: "×", "divided by": "÷",
  equals: "=", "is equal to": "=",
};

/**
 * Convert spoken math text to symbols and digits.
 * "twenty three plus five equals twenty eight" → "23 + 5 = 28"
 */
export function spokenToMath(text: string): string {
  let result = text.toLowerCase().trim();

  // Replace multi-word math terms first
  for (const [word, symbol] of Object.entries(MATH_WORDS)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, "gi"), ` ${symbol} `);
  }

  // Replace compound numbers like "twenty three" → "23"
  for (const [tens, val] of Object.entries(TENS)) {
    const tensNum = parseInt(val);
    // Match "twenty one", "thirty five", etc.
    result = result.replace(
      new RegExp(`\\b${tens}[- ]?(one|two|three|four|five|six|seven|eight|nine)\\b`, "gi"),
      (_, ones) => String(tensNum + parseInt(WORD_TO_DIGIT[ones.toLowerCase()] || "0"))
    );
  }

  // Replace standalone number words
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, "gi"), digit);
  }

  // Also handle "hundred" patterns: "three hundred" → "300"
  result = result.replace(/(\d)\s*hundred\s*(?:and\s*)?(\d+)/gi, (_, h, rest) =>
    String(parseInt(h) * 100 + parseInt(rest))
  );
  result = result.replace(/(\d)\s*hundred/gi, (_, h) => String(parseInt(h) * 100));

  // Clean up whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

export function useDictation() {
  const state = ref<DictationState>("idle");
  const error = ref<string | null>(null);
  const supported = ref(
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    "mediaDevices" in navigator
  );

  let mediaRecorder: MediaRecorder | null = null;
  let activeStream: MediaStream | null = null;
  let chunks: Blob[] = [];

  async function start() {
    if (!supported.value || state.value !== "idle") return;

    error.value = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.start();
      mediaRecorder = recorder;
      state.value = "recording";
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        error.value = "Microphone permission denied";
      } else {
        error.value = "Could not start recording";
      }
      cleanup();
    }
  }

  async function stop(): Promise<string | null> {
    if (!mediaRecorder || state.value !== "recording") return null;

    return new Promise((resolve) => {
      mediaRecorder!.onstop = async () => {
        cleanup();
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        state.value = "processing";

        try {
          const text = await transcribe(audioBlob);
          state.value = "idle";
          resolve(text);
        } catch (err) {
          error.value = err instanceof Error ? err.message : "Transcription failed";
          state.value = "idle";
          resolve(null);
        }
      };

      mediaRecorder!.stop();
    });
  }

  function cancel() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    cleanup();
    state.value = "idle";
  }

  function cleanup() {
    activeStream?.getTracks().forEach((t) => t.stop());
    activeStream = null;
    mediaRecorder = null;
  }

  async function transcribe(audioBlob: Blob): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");

    const res = await fetch("/api/speech/transcribe", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 503) throw new Error("Speech-to-text unavailable");
      throw new Error("Failed to transcribe audio");
    }

    const data = await res.json() as { success: boolean; text?: string; error?: string };
    if (!data.success) throw new Error(data.error || "Transcription failed");

    return data.text ? spokenToMath(data.text) : null;
  }

  /** Check if the STT backend is available */
  async function checkAvailable(): Promise<boolean> {
    try {
      const res = await fetch("/api/speech/status", { credentials: "include" });
      const data = await res.json() as { available: boolean };
      return data.available;
    } catch {
      return false;
    }
  }

  onUnmounted(cancel);

  return {
    state,
    error,
    supported,
    start,
    stop,
    cancel,
    checkAvailable,
  };
}
