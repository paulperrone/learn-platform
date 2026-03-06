import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import es from "./locales/es.json";
import ja from "./locales/ja.json";
import ar from "./locales/ar.json";

export const SUPPORTED_LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "ja", name: "日本語", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

const LOCALE_STORAGE_KEY = "learn-locale";

function detectLocale(): SupportedLocale {
  // 1. Check localStorage
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) {
    return saved as SupportedLocale;
  }

  // 2. Check browser language
  const browserLang = navigator.language.split("-")[0];
  if (SUPPORTED_LOCALES.some((l) => l.code === browserLang)) {
    return browserLang as SupportedLocale;
  }

  return "en";
}

export function persistLocale(locale: SupportedLocale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function getLocaleDir(locale: string): "ltr" | "rtl" {
  return SUPPORTED_LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}

const initialLocale = detectLocale();

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: "en",
  messages: { en, es, ja, ar },
});

// Apply initial direction
document.documentElement.dir = getLocaleDir(initialLocale);
document.documentElement.lang = initialLocale;
