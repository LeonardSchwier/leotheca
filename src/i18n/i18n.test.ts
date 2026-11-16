/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeLocale,
  catalogs,
  interpolate,
  languagePreference,
  LANGUAGE_PREFERENCES,
  resolveLocale,
  t,
} from "./index";
import { en } from "./en";
import { de } from "./de";

function setSystemLanguages(languages: string[]) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  window.dispatchEvent(new Event("languagechange"));
}

afterEach(() => {
  languagePreference.value = "system";
  vi.restoreAllMocks();
  window.dispatchEvent(new Event("languagechange"));
});

describe("interpolate", () => {
  it("replaces named placeholders and leaves a template without any alone", () => {
    expect(interpolate("Hello {name}!", { name: "Ada" })).toBe("Hello Ada!");
    expect(interpolate("No placeholders")).toBe("No placeholders");
    expect(interpolate("Count: {n}", { n: 3 })).toBe("Count: 3");
  });

  it("replaces in a single pass, so a value that looks like a placeholder is not expanded", () => {
    expect(interpolate("{a} and {b}", { a: "{b}", b: "x" })).toBe("{b} and x");
  });

  it("keeps a placeholder with no matching parameter as written", () => {
    expect(interpolate("Hi {who}", {})).toBe("Hi {who}");
    expect(interpolate("Hi {toString}", {})).toBe("Hi {toString}");
  });
});

describe("resolveLocale", () => {
  it("honours an explicit language regardless of the device", () => {
    expect(resolveLocale("en", ["de-DE"])).toBe("en");
    expect(resolveLocale("de", ["en-US"])).toBe("de");
  });

  it("follows the first supported device language by primary subtag", () => {
    expect(resolveLocale("system", ["de"])).toBe("de");
    expect(resolveLocale("system", ["de-AT"])).toBe("de");
    expect(resolveLocale("system", ["DE_ch"])).toBe("de");
    expect(resolveLocale("system", ["fr-FR", "de-DE", "en-US"])).toBe("de");
    expect(resolveLocale("system", ["fr-FR", "en-US", "de-DE"])).toBe("en");
  });

  it("falls back to English when nothing is supported or nothing is known", () => {
    expect(resolveLocale("system", ["fr-FR", "ja"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
    expect(resolveLocale("system", [""])).toBe("en");
    // Object prototype names are not languages.
    expect(resolveLocale("system", ["constructor", "toString"])).toBe("en");
  });
});

describe("t", () => {
  it("returns English text when the device language is English", () => {
    setSystemLanguages(["en-US"]);
    expect(t("welcome.title")).toBe("Welcome to Leotheca");
  });

  it("returns German text when German is chosen, and follows the device for system", () => {
    setSystemLanguages(["en-US"]);
    languagePreference.value = "de";
    expect(activeLocale.value).toBe("de");
    expect(t("welcome.title")).toBe("Willkommen bei Leotheca");

    languagePreference.value = "system";
    setSystemLanguages(["de-DE"]);
    expect(activeLocale.value).toBe("de");
    setSystemLanguages(["en-GB"]);
    expect(activeLocale.value).toBe("en");
  });

  it("interpolates parameters", () => {
    languagePreference.value = "en";
    expect(t("welcome.failedTitle", { name: "Personal" })).toBe(
      'Couldn\'t open "Personal"',
    );
  });

  it("falls back to English for a key missing from the active catalog, and never throws", () => {
    languagePreference.value = "de";
    const german = catalogs.de as Record<string, string>;
    const original = german["welcome.title"];
    delete german["welcome.title"];
    try {
      expect(t("welcome.title")).toBe("Welcome to Leotheca");
    } finally {
      german["welcome.title"] = original;
    }
    // A key unknown to every catalog returns the key itself.
    expect(t("no.such.key" as never)).toBe("no.such.key");
  });
});

describe("catalogs", () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("have exactly the same keys in every language", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it("use the same placeholders in every language", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("have no empty text, and German really differs from English", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), `en ${key}`).not.toBe("");
      expect(de[key].trim(), `de ${key}`).not.toBe("");
    }
    expect(de["welcome.title"]).not.toBe(en["welcome.title"]);
  });

  it("list system plus every catalog language as preferences", () => {
    expect([...LANGUAGE_PREFERENCES].sort()).toEqual(
      ["system", ...Object.keys(catalogs)].sort(),
    );
  });
});
