import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { resources as baseResources } from "./resources";
import { featureDicts } from "./dicts";

// Merge per-feature dictionaries into the base resources. English is the
// fallback for any key a locale hasn't translated yet.
const enFeature = featureDicts.en ?? {};
const resources = Object.fromEntries(
  Object.entries(baseResources).map(([lng, bundle]) => [
    lng,
    {
      translation: {
        ...(bundle as { translation: Record<string, string> }).translation,
        ...enFeature,
        ...(featureDicts[lng] ?? {}),
      },
    },
  ]),
);

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
] as const;

export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "doclocker_lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

// Set <html dir> for RTL languages
const applyDir = (lng: string) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
};
applyDir(i18n.language || DEFAULT_LANGUAGE);
i18n.on("languageChanged", applyDir);

export default i18n;
