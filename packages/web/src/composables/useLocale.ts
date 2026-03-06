import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { SUPPORTED_LOCALES, persistLocale, getLocaleDir } from "../i18n";
import type { SupportedLocale } from "../i18n";

export function useLocale() {
  const { locale } = useI18n();

  const currentLocale = computed(() => locale.value as SupportedLocale);
  const isRTL = computed(() => getLocaleDir(locale.value) === "rtl");

  function setLocale(code: SupportedLocale) {
    locale.value = code;
    persistLocale(code);
    document.documentElement.dir = getLocaleDir(code);
    document.documentElement.lang = code;
  }

  return {
    currentLocale,
    isRTL,
    setLocale,
    supportedLocales: SUPPORTED_LOCALES,
  };
}
