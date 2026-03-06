import { ref, computed, watchEffect } from "vue";

const CHILD_MODE_KEY = "learn-child-mode";

const enabled = ref(false);

// Load from localStorage
if (typeof window !== "undefined") {
  enabled.value = localStorage.getItem(CHILD_MODE_KEY) === "true";
}

export function useChildMode() {
  function toggle() {
    enabled.value = !enabled.value;
    localStorage.setItem(CHILD_MODE_KEY, String(enabled.value));
  }

  function enable() {
    enabled.value = true;
    localStorage.setItem(CHILD_MODE_KEY, "true");
  }

  function disable() {
    enabled.value = false;
    localStorage.setItem(CHILD_MODE_KEY, "false");
  }

  return {
    enabled,
    toggle,
    enable,
    disable,
  };
}
