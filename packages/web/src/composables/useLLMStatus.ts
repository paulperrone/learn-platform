import { ref } from "vue";
import { useApi } from "./useApi";

const llmAvailable = ref<boolean | null>(null);
const checked = ref(false);

export function useLLMStatus() {
  async function check() {
    if (checked.value) return;
    try {
      const api = useApi();
      const status = await api.getLLMStatus();
      llmAvailable.value = status.available;
    } catch {
      llmAvailable.value = false;
    }
    checked.value = true;
  }

  return { llmAvailable, check };
}
