import { describe, it, expect, vi } from "vitest";
import Translations, {
  BUILT_IN_LOCALES,
  FALLBACK_LOCALE,
  interpolate,
  languageName,
  matchLocale,
  translations,
  type LocaleLoader,
} from "..";
import enUS from "../../../../locales/en-US.json";
import fr from "../../../../locales/fr.json";
import ja from "../../../../locales/ja.json";

const LOCALE_FILES = ["en-GB", "fr", "ja", "ko", "zh-Hans", "zh-Hant"];

describe("matchLocale", () => {
  const available = ["en-US", "en-GB", "ja", "ko", "zh-Hans", "zh-Hant"];

  it.each([
    [["ja"], "ja"],
    [["JA-jp"], "ja"],
    [["ko-KR"], "ko"],
    [["zh-TW"], "zh-Hant"],
    [["zh-HK"], "zh-Hant"],
    [["zh-Hant-TW"], "zh-Hant"],
    [["zh-CN"], "zh-Hans"],
    [["zh"], "zh-Hans"],
    [["en-AU"], "en-GB"],
    [["en-GB"], "en-GB"],
    [["en"], "en-US"],
    [["en-CA"], "en-US"],
    [["fr-FR", "ja"], "ja"],
    [["fr-FR"], "en-US"],
    [["not a tag!"], "en-US"],
    [[], "en-US"],
  ])("should match %j to %s", (requested, expected) => {
    expect(matchLocale(requested, available)).toBe(expected);
  });

  it("should use another locale of the same language when the preferred English isn't available", () => {
    expect(matchLocale(["en-AU"], ["en-US", "ja"])).toBe("en-US");
    expect(matchLocale(["fr-CA"], Object.keys(BUILT_IN_LOCALES))).toBe("fr");
    expect(matchLocale(["fr-FR", "en"], Object.keys(BUILT_IN_LOCALES))).toBe(
      "fr",
    );
    expect(matchLocale(["zh-TW"], ["zh-Hans"])).toBe("zh-Hans");
  });

  it("should use the first available locale when the fallback isn't available", () => {
    expect(matchLocale(["fr"], ["ja", "ko"], "en-US")).toBe("ja");
    expect(matchLocale(["fr"], [], "en-US")).toBe("en-US");
  });
});

describe("interpolate", () => {
  it("should fill in placeholders and leave unknown ones", () => {
    expect(interpolate("Delete {name}? {other}", { name: "Sketch" })).toBe(
      "Delete Sketch? {other}",
    );
    expect(interpolate("{count} left", { count: 2 })).toBe("2 left");
    expect(interpolate("No values")).toBe("No values");
  });
});

describe("languageName", () => {
  it("should name a locale's language in that language, starting with a capital", () => {
    expect(languageName("ja")).toBe("日本語");
    expect(languageName("fr")).toBe("Français");
    expect(languageName("en-GB")).toBe("English (United Kingdom)");
  });

  it("should give the tag for locales it can't name", () => {
    expect(languageName("qaa")).toBe("qaa");
    expect(languageName("not a tag")).toBe("not a tag");
  });
});

describe("Translations", () => {
  it("should start in US English and translate keys, falling back to the key", () => {
    const t = new Translations();
    expect(t.locale).toBe(FALLBACK_LOCALE);
    expect(t.t("paintCanvas.tool.brush")).toBe("Brush");
    expect(t.t("paintCanvas.presets.deleted", { name: "Soft" })).toBe(
      'Deleted "Soft"',
    );
    expect(t.t("missing.key")).toBe("missing.key");
  });

  it("should use plural forms for counts", () => {
    const t = new Translations();
    expect(t.t("paintCanvas.presets.imported", { count: 1 })).toBe(
      "Imported 1 brush preset",
    );
    expect(t.t("paintCanvas.presets.imported", { count: 3 })).toBe(
      "Imported 3 brush presets",
    );
    t.addStrings("en-US", {
      "only.other.other": "{count} things",
      plain: "{count}",
    });
    expect(t.t("only.other", { count: 1 })).toBe("1 things");
    expect(t.t("plain", { count: 1 })).toBe("1");
  });

  it("should load a locale when first used, tell listeners, and fall back for missing strings", async () => {
    const loader = vi.fn(async () => ({
      default: { "paintCanvas.tool.brush": "Pinceau" },
    }));
    const t = new Translations({
      locales: { "en-US": async () => enUS, fr: loader },
    });
    expect(t.locales).toEqual(["en-US", "fr"]);
    const listener = vi.fn();
    t.addEventListener("change", listener);
    await t.setLocale("fr-CA");
    expect(t.locale).toBe("fr");
    expect(t.t("paintCanvas.tool.brush")).toBe("Pinceau");
    expect(t.t("paintCanvas.tool.eraser")).toBe("Eraser");
    await t.setLocale("en-US");
    await t.setLocale("fr");
    expect(loader).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should accept loaders that give the strings directly", async () => {
    const t = new Translations({
      locales: { de: async () => ({ "paintCanvas.tool.brush": "Pinsel" }) },
    });
    await t.setLocale("de");
    expect(t.t("paintCanvas.tool.brush")).toBe("Pinsel");
  });

  it("should keep the latest choice when an earlier locale loads later", async () => {
    let finish!: () => void;
    const t = new Translations({
      locales: {
        slow: () =>
          new Promise((resolve) => {
            finish = () => resolve({ "paintCanvas.tool.brush": "Slow" });
          }),
        fast: async () => ({ "paintCanvas.tool.brush": "Fast" }),
      },
    });
    const slow = t.setLocale("slow");
    await t.setLocale("fast");
    finish();
    await slow;
    expect(t.locale).toBe("fast");
  });

  it("should keep the current locale when one can't be loaded, and try again next time", async () => {
    const loader = vi
      .fn<LocaleLoader>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ "paintCanvas.tool.brush": "Pinsel" });
    const t = new Translations({ locales: { de: loader } });
    await expect(t.setLocale("de")).rejects.toThrow("Offline");
    expect(t.locale).toBe("en-US");
    await t.setLocale("de");
    expect([t.locale, t.t("paintCanvas.tool.brush")]).toEqual(["de", "Pinsel"]);
  });

  it("should load a locale once when it's asked for again while loading", async () => {
    const loader = vi.fn(async () => ({ "paintCanvas.tool.brush": "Pinsel" }));
    const t = new Translations({ locales: { de: loader } });
    await Promise.all([t.setLocale("de"), t.setLocale("de")]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("should use the device's languages", async () => {
    const t = new Translations();
    await t.useDeviceLocale(["zh-TW"]);
    expect(t.locale).toBe("zh-Hant");
    expect(t.t("paintCanvas.tool.brush")).toBe("筆刷");
    await t.useDeviceLocale();
    expect(t.locale).toBe(matchLocale(navigator.languages, t.locales));
  });

  it("should treat having no navigator as no languages", async () => {
    vi.stubGlobal("navigator", undefined);
    const t = new Translations();
    await t.useDeviceLocale();
    expect(t.locale).toBe("en-US");
    vi.unstubAllGlobals();
  });

  it("should add strings, telling listeners only for the locale in use or the fallback", async () => {
    const t = new Translations();
    const listener = vi.fn();
    t.addEventListener("change", listener);
    t.addStrings("en-US", { "paintCanvas.tool.brush": "Paintbrush" });
    t.addStrings("ja", { "paintCanvas.tool.brush": "筆" });
    expect(t.t("paintCanvas.tool.brush")).toBe("Paintbrush");
    expect(listener).toHaveBeenCalledOnce();
    await t.setLocale("ja");
    expect(t.t("paintCanvas.tool.brush")).toBe("筆");
    // PaintCanvas's own Japanese still loads
    expect(t.t("paintCanvas.tool.eraser")).toBe(ja["paintCanvas.tool.eraser"]);
  });

  it("should add locales from another project, merged after PaintCanvas's so they can replace its text", async () => {
    const t = new Translations();
    const listener = vi.fn();
    t.addEventListener("change", listener);
    const appFrench = vi.fn(async () => ({
      default: {
        "liveCanvas.share": "Partager",
        "paintCanvas.tool.brush": "Pinceau magique",
      },
    }));
    await t.addLocales({
      "en-US": async () => ({ "liveCanvas.share": "Share" }),
      fr: appFrench,
    });
    expect([t.t("liveCanvas.share"), listener.mock.calls.length]).toEqual([
      "Share",
      1,
    ]);
    expect(appFrench).not.toHaveBeenCalled();
    await t.setLocale("fr");
    expect(t.t("liveCanvas.share")).toBe("Partager");
    expect(t.t("paintCanvas.tool.brush")).toBe("Pinceau magique");
    expect(t.t("paintCanvas.tool.eraser")).toBe(fr["paintCanvas.tool.eraser"]);
    expect(t.locales).toEqual(Object.keys(BUILT_IN_LOCALES));
  });

  it("should let later sets of strings replace earlier ones, in the order they were added", async () => {
    const t = new Translations();
    t.addStrings("en-US", { "paintCanvas.tool.brush": "Strings" });
    await t.addLocales({
      "en-US": async () => ({ "paintCanvas.tool.brush": "Locales" }),
    });
    expect(t.t("paintCanvas.tool.brush")).toBe("Locales");
    t.addStrings("en-US", { "paintCanvas.tool.brush": "Strings again" });
    expect(t.t("paintCanvas.tool.brush")).toBe("Strings again");
  });

  it("should make an added project's own locales available, falling back for PaintCanvas's text", async () => {
    const t = new Translations();
    const listener = vi.fn();
    t.addEventListener("change", listener);
    await t.addLocales({ de: async () => ({ "liveCanvas.share": "Teilen" }) });
    expect(listener).not.toHaveBeenCalled();
    expect(t.locales).toContain("de");
    await t.setLocale("de-AT");
    expect([t.locale, t.t("liveCanvas.share")]).toEqual(["de", "Teilen"]);
    expect(t.t("paintCanvas.tool.brush")).toBe("Brush");
  });

  it("should load locales added while switching before using the new locale", async () => {
    const t = new Translations();
    const switching = t.setLocale("fr");
    const adding = t.addLocales({
      fr: async () => ({ "liveCanvas.share": "Partager" }),
    });
    await switching;
    expect([t.locale, t.t("liveCanvas.share")]).toEqual(["fr", "Partager"]);
    await adding;
  });

  it("should reject adding locales when the locale in use can't be loaded", async () => {
    const t = new Translations();
    await expect(
      t.addLocales({ "en-US": () => Promise.reject(new Error("Offline")) }),
    ).rejects.toThrow("Offline");
    expect(t.t("paintCanvas.tool.brush")).toBe("Brush");
  });

  it("should use the given fallback locale and strings", () => {
    const t = new Translations({
      fallback: "ja",
      fallbackStrings: { hi: "こんにちは" },
      locales: {},
    });
    expect([t.locale, t.t("hi"), t.locales]).toEqual([
      "ja",
      "こんにちは",
      ["ja"],
    ]);
  });

  it("should share one set of translations for the UI", async () => {
    expect(translations).toBeInstanceOf(Translations);
    expect(await (BUILT_IN_LOCALES["en-US"] as () => Promise<unknown>)()).toBe(
      enUS,
    );
    expect(Object.keys(BUILT_IN_LOCALES).sort()).toEqual(
      ["en-US", ...LOCALE_FILES].sort(),
    );
  });
});

describe("locale files", () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

  it.each(LOCALE_FILES)(
    "%s should have every key, with the same placeholders",
    async (tag) => {
      const strings = (
        await (
          BUILT_IN_LOCALES[tag] as () => Promise<{
            default: Record<string, string>;
          }>
        )()
      ).default;
      expect(Object.keys(strings).sort()).toEqual(Object.keys(enUS).sort());
      for (const [key, text] of Object.entries(enUS))
        expect([key, placeholders(strings[key] as string)]).toEqual([
          key,
          placeholders(text),
        ]);
    },
  );
});
