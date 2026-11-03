import enUS from "../../../locales/en-US.json";

/** Translated text, by key */
export type Strings = Record<string, string>;

/** Loads a locale's strings (e.g. a dynamic `import()` of its JSON file, so it's only downloaded when used) */
export type LocaleLoader = () => Promise<Strings | { default: Strings }>;

/** The locale used when no other matches, and whose strings fill in any missing from other locales */
export const FALLBACK_LOCALE = "en-US";

/** Locales whose files come with PaintCanvas (in `locales/`, named by their IETF BCP 47 tag) */
export const BUILT_IN_LOCALES: Record<string, LocaleLoader> = {
  "en-US": async () => enUS,
  "en-GB": () => import("../../../locales/en-GB.json"),
  fr: () => import("../../../locales/fr.json"),
  ja: () => import("../../../locales/ja.json"),
  ko: () => import("../../../locales/ko.json"),
  "zh-Hans": () => import("../../../locales/zh-Hans.json"),
  "zh-Hant": () => import("../../../locales/zh-Hant.json"),
};

/** Regions whose English is closer to British than American English */
const BRITISH_ENGLISH_REGIONS = new Set([
  "GB",
  "AU",
  "NZ",
  "IE",
  "IN",
  "ZA",
  "SG",
  "HK",
  "MY",
  "PK",
  "NG",
  "KE",
]);

/**
 * The language, script and region of a locale tag, with the likely script and region filled in where known (e.g. `zh-TW`
 * is written in Traditional Chinese, `zh-CN` in Simplified).
 */
const describe = (tag: string) => {
  try {
    const locale = new Intl.Locale(tag);
    const likely = locale.maximize();
    return {
      language: locale.language,
      script: likely.script,
      region: locale.region,
    };
  } catch {
    return undefined;
  }
};

/**
 * The best available locale for the requested ones (e.g. the device's `navigator.languages`, most preferred first):
 * the same tag, then the same language and script (`zh-TW` → `zh-Hant`), then the same language (British regions
 * prefer `en-GB`, other English `en-US`), otherwise `fallback`.
 *
 * @example
 * matchLocale(["zh-TW", "en"], ["en-US", "zh-Hans", "zh-Hant"]); // "zh-Hant"
 * matchLocale(["en-AU"], ["en-US", "en-GB"]); // "en-GB"
 * matchLocale(["fr-FR"], ["en-US", "ja"]); // "en-US"
 */
export const matchLocale = (
  requested: readonly string[],
  available: readonly string[],
  fallback: string = FALLBACK_LOCALE,
): string => {
  const lower = (tag: string) => tag.toLowerCase();
  for (const tag of requested) {
    const exact = available.find((each) => lower(each) === lower(tag));
    if (exact) return exact;
    const wanted = describe(tag);
    if (!wanted) continue;
    const sameLanguage = available.filter(
      (each) => describe(each)?.language === wanted.language,
    );
    if (sameLanguage.length === 0) continue;
    const sameScript = sameLanguage.filter(
      (each) => describe(each)?.script === wanted.script,
    );
    const candidates = sameScript.length > 0 ? sameScript : sameLanguage;
    if (wanted.language === "en") {
      const preferred =
        wanted.region && BRITISH_ENGLISH_REGIONS.has(wanted.region)
          ? "en-GB"
          : "en-US";
      const regional = candidates.find(
        (each) => lower(each) === lower(preferred),
      );
      if (regional) return regional;
    }
    return candidates[0] as string;
  }
  return available.includes(fallback) ? fallback : (available[0] ?? fallback);
};

/**
 * Put values into a string's `{name}` placeholders. Placeholders without a value are left as they are.
 *
 * @example
 * interpolate("Delete \"{name}\"?", { name: "Sketch" }); // 'Delete "Sketch"?'
 */
export const interpolate = (
  text: string,
  values: Record<string, string | number> = {},
): string =>
  text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );

/** Options for translations */
export interface TranslationsOptions {
  /** Locales that can be used, and how to load each (default: all the locales that come with PaintCanvas) */
  locales?: Record<string, LocaleLoader>;
  /** Locale used when no other matches (default `FALLBACK_LOCALE`) */
  fallback?: string;
  /** The fallback locale's strings, available straight away (default: PaintCanvas's US English) */
  fallbackStrings?: Strings;
}

/**
 * The text the UI shows, in the chosen language. Starts in the fallback locale; `useDeviceLocale` switches to the best
 * match for the device, and `setLocale` to any available locale. Locale files load when first used, without reloading
 * the page. Strings missing from a locale come from the fallback locale, then the key itself.
 *
 * Dispatches a `change` event when the locale or its strings change, so the UI can show the new text.
 *
 * @example
 * const translations = new Translations({ locales: { "en-US": ..., ja: () => import("./ja.json") } });
 * await translations.useDeviceLocale();
 * translations.t("layers.delete", { name: "Sketch" });
 */
export default class Translations extends EventTarget {
  private readonly loaders: Record<string, LocaleLoader>;

  private readonly fallback: string;

  /** Strings of each locale loaded so far, plus any added */
  private readonly loaded = new Map<string, Strings>();

  private current: string;

  /** The locale most recently asked for, so a slow load can't override a later choice */
  private requested?: string;

  constructor(options: TranslationsOptions = {}) {
    super();
    this.loaders = options.locales ?? BUILT_IN_LOCALES;
    this.fallback = options.fallback ?? FALLBACK_LOCALE;
    this.loaded.set(this.fallback, options.fallbackStrings ?? enUS);
    this.current = this.fallback;
  }

  /** The locale in use (an IETF BCP 47 tag, e.g. `ja`) */
  get locale(): string {
    return this.current;
  }

  /** Locales that can be used */
  get locales(): string[] {
    return [...new Set([this.fallback, ...Object.keys(this.loaders)])];
  }

  /**
   * Switch to the best available locale for the device's languages (`navigator.languages`).
   */
  useDeviceLocale(
    languages: readonly string[] = typeof navigator === "undefined"
      ? []
      : navigator.languages,
  ): Promise<void> {
    return this.setLocale(matchLocale(languages, this.locales, this.fallback));
  }

  /**
   * Switch to a locale (the best available match for the tag), loading its strings if needed. Dispatches `change` once
   * its strings are ready. If loading fails, the current locale stays and this rejects.
   *
   * @example
   * await translations.setLocale("zh-TW"); // uses zh-Hant
   */
  async setLocale(tag: string): Promise<void> {
    const locale = matchLocale([tag], this.locales, this.fallback);
    this.requested = locale;
    if (!this.loaded.has(locale)) {
      const module = await (this.loaders[locale] as LocaleLoader)();
      this.loaded.set(
        locale,
        "default" in module && typeof module.default === "object"
          ? (module.default as Strings)
          : (module as Strings),
      );
    }
    // A later call chose another locale while this one loaded
    if (this.requested !== locale) return;
    this.current = locale;
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Add or replace strings for a locale (e.g. the implementer's own wording or extra keys). Dispatches `change` if it's
   * the locale in use or the fallback.
   *
   * @example
   * translations.addStrings("en-US", { "toolbar.brush": "Paintbrush" });
   */
  addStrings(locale: string, strings: Strings): void {
    this.loaded.set(locale, { ...this.loaded.get(locale), ...strings });
    if (locale === this.current || locale === this.fallback)
      this.dispatchEvent(new Event("change"));
  }

  /**
   * Translate a key, putting values into its `{name}` placeholders. With a numeric `count`, the key's plural form for
   * the locale is used when there is one (e.g. `presets.imported.one` and `presets.imported.other`). Falls back to the
   * fallback locale, then the key.
   *
   * @example
   * translations.t("presets.imported", { count: 3 }); // "Imported 3 brush presets"
   */
  t(key: string, values?: Record<string, string | number>): string {
    const count = values?.count;
    const keys =
      typeof count === "number"
        ? [
            `${key}.${new Intl.PluralRules(this.current).select(count)}`,
            `${key}.other`,
            key,
          ]
        : [key];
    for (const locale of [this.current, this.fallback]) {
      const strings = this.loaded.get(locale);
      const found = keys.find(
        (each) => strings && Object.hasOwn(strings, each),
      );
      if (found)
        return interpolate((strings as Strings)[found] as string, values);
    }
    return interpolate(key, values);
  }
}

/** The translations PaintCanvas's UI uses, unless an element is given others */
export const translations = new Translations();
