/** The languages the interface has a catalog for. */
export type Locale = "en" | "de";

/** What the person chose: one catalog language, or `system` to follow the
 * device. This is the value stored in the global config. */
export type LanguagePreference = "system" | Locale;

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = [
  "system",
  "en",
  "de",
];

/** Each language is named in itself and never translated, so a person who
 * cannot read the current language can still find their own. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};
