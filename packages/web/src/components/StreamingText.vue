<script setup lang="ts">
import { ref, onUnmounted } from "vue";

const props = defineProps<{
  fetchStream: () => Promise<Response>;
  fallbackFetch?: () => Promise<{ response: string }>;
}>();

const emit = defineEmits<{
  complete: [text: string];
  error: [error: string];
}>();

const text = ref("");
const isStreaming = ref(false);
const hasError = ref(false);
let abortController: AbortController | null = null;

async function start() {
  text.value = "";
  isStreaming.value = true;
  hasError.value = false;
  abortController = new AbortController();

  try {
    const response = await props.fetchStream();

    // If response is JSON (fallback from server or error), handle it
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      // Handle LLM unavailable (503) or budget exceeded (429)
      if (data.available === false || data.error) {
        text.value = "";
        isStreaming.value = false;
        hasError.value = true;
        emit("error", data.error ?? "AI tutoring is not available");
        return;
      }
      text.value = data.response ?? "";
      isStreaming.value = false;
      emit("complete", text.value);
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      if (abortController?.signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            text.value += parsed.content;
          }
        } catch {
          // skip
        }
      }
    }

    isStreaming.value = false;
    emit("complete", text.value);
  } catch (e) {
    if (abortController?.signal.aborted) return;

    // Try fallback
    if (props.fallbackFetch) {
      try {
        const result = await props.fallbackFetch();
        text.value = result.response;
        isStreaming.value = false;
        emit("complete", text.value);
        return;
      } catch {
        // fallback also failed
      }
    }

    isStreaming.value = false;
    hasError.value = true;
    const message = e instanceof Error ? e.message : "Something went wrong";
    emit("error", message);
  }
}

function cancel() {
  abortController?.abort();
  isStreaming.value = false;
  if (text.value) {
    emit("complete", text.value);
  }
}

onUnmounted(() => {
  abortController?.abort();
});

defineExpose({ start, cancel });
</script>

<template>
  <div class="relative">
    <div v-if="text || isStreaming" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
      {{ text }}<span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
    </div>

    <div v-if="hasError && !text" class="text-sm text-red-600">
      Unable to get a response. Please try again.
    </div>

    <button
      v-if="isStreaming"
      @click="cancel"
      class="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
    >
      Stop
    </button>
  </div>
</template>
