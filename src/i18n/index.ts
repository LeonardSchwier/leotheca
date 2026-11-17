import { computed, signal } from "@preact/signals";
import { de } from "./de";
import { en, type MessageKey } from "./en";
import {
  LANGUAGE_PREFERENCES,
  type LanguagePreference,
  type Locale,
} from "./locales";

export { LANGUAGE_NAMES, LANGUAGE_PREFERENCES } from "./locales";
export type { LanguagePreference, Locale } from "./locales";
export type { MessageKey } from "./en";

export const catalogs: Record<Locale, Record<MessageKey, string>> = { en, de };

/** What the person chose. `initSettings` loads it from the global config and
 * `setLanguage` changes it; nothing else writes it. */
export const languagePreference = signal<LanguagePreference>("system");

function readDeviceLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return [...navigator.languages];
  }
  return navigator.language ? [navigator.language] : [];
}

const deviceLanguages = signal<readonly string[]>(readDeviceLanguages());

if (typeof window !== "undefined") {
  // `system` must follow the device while the app is open.
  window.addEventListener("languagechange", () => {
    deviceLanguages.value = readDeviceLanguages();
  });
}

/** The locale for a preference. `system` takes the first device language whose
 * primary subtag has a catalog (`de`, `de-AT` and `de_CH` all match `de`) and
 * otherwise English. */
export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[],
): Locale {
  if (preference !== "system") return preference;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (primary && Object.prototype.hasOwnProperty.call(catalogs, primary)) {
      return primary as Locale;
    }
  }
  return "en";
}

export const activeLocale = computed<Locale>(() =>
  resolveLocale(languagePreference.value, deviceLanguages.value),
);

/** Replaces `{name}` placeholders in one pass over the template, so a value
 * that itself contains `{other}` (a file or workspace name) is never expanded
 * again. A placeholder with no matching parameter stays as written. */
export function interpolate(
  template: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : whole,
  );
}

/** The text a catalog holds for `key`, never one inherited from `Object`
 * (`constructor`, `__proto__`, `toString`). */
function own(
  catalog: Readonly<Record<string, string>>,
  key: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(catalog, key)
    ? catalog[key]
    : undefined;
}

/** The text for `key` in the active language. A key missing from that catalog
 * falls back to English, and a key unknown to every catalog returns itself, so
 * a gap shows up on screen instead of throwing. Reading `activeLocale` here
 * makes a component that calls `t` re-render when the language changes. */
export function t(
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const text = own(catalogs[activeLocale.value], key) ?? own(en, key) ?? key;
  return interpolate(text, params);
}

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return (
    typeof value === "string" &&
    (LANGUAGE_PREFERENCES as readonly string[]).includes(value)
  );
}
