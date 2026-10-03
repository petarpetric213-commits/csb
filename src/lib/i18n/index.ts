import { en, type Dictionary } from "./en";
import { de } from "./de";
import { sr } from "./sr";

export type Locale = "en" | "de" | "sr";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "sr", label: "Srpski" },
];

const dictionaries: Record<Locale, Dictionary> = { en: en as Dictionary, de, sr };

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "de" || v === "sr";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? (en as Dictionary);
}

/** Translate with {param} interpolation. Falls back: locale → en → key. */
export function translate(
  dict: Dictionary,
  fallback: Dictionary,
  key: string,
  params?: Record<string, string | number>
): string {
  let out = dict[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return out;
}

export function localeDateLocale(locale: Locale): string {
  switch (locale) {
    case "de": return "de-DE";
    case "sr": return "sr-RS";
    default: return "en-GB";
  }
}

export { en, de, sr };
export type { Dictionary };
/** Format an ISO date (or Date) in the given locale. */
export function localeDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeDateLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
