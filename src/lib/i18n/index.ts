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

/**
 * A locale's language name, written in that language (so people can find their own), with its first letter in
 * capitals. Gives the tag itself if the browser can't name it.
 *
 * @example
 * languageName("ja"); // "日本語"
 * languageName("fr"); // "Français"
 * languageName("en-GB"); // "English (United Kingdom)"
 */
export const languageName = (locale: string): string => {
  try {
    const name = new Intl.DisplayNames([locale], {
      type: "language",
      languageDisplay: "standard",
      fallback: "none",
    }).of(locale);
    return name
      ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
      : locale;
  } catch {
    return locale;
  }
};

/** A locale loader's strings, whether given directly or as a module's default export */
const unwrap = (module: Strings | { default: Strings }): Strings =>
  "default" in module && typeof module.default === "object"
    ? module.default
    : (module as Strings);

/**
 * One set of strings for some locales (e.g. PaintCanvas's, or an app's), each loaded once, when first needed.
 */
class LocaleSource {
  /** Strings of each locale loaded so far */
  readonly strings = new Map<string, Strings>();

  /** Loads started, so a locale loading for two callers loads once */
  private readonly loading = new Map<string, Promise<void>>();

  constructor(readonly loaders: Record<string, LocaleLoader> = {}) {}

  /**
   * Load a locale's strings, if this has a loader for it and they aren't loaded yet. A failed load rejects, and can be
   * tried again.
   */
  load(locale: string): Promise<void> {
    const loader = this.loaders[locale];
    if (!loader || this.strings.has(locale)) return Promise.resolve();
    let loading = this.loading.get(locale);
    if (!loading) {
      loading = loader().then(
        (module) => {
          this.strings.set(locale, unwrap(module));
        },
        (error: unknown) => {
          this.loading.delete(locale);
          throw error;
        },
      );
      this.loading.set(locale, loading);
    }
    return loading;
  }
}

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
 * Other projects can add their own strings and locales with `addLocales` and `addStrings`. A locale's strings from
 * every set load together and are merged in the order the sets were added (PaintCanvas's first), so a key in a later
 * set replaces the same key in an earlier one. Keys are prefixed by project by convention: `paintCanvas.` for
 * PaintCanvas's, and e.g. `liveCanvas.` for an app's.
 *
 * Dispatches a `change` event when the locale or its strings change, so the UI can show the new text.
 *
 * @example
 * const translations = new Translations({ locales: { "en-US": ..., ja: () => import("./ja.json") } });
 * await translations.useDeviceLocale();
 * translations.t("paintCanvas.layers.delete", { name: "Sketch" });
 */
export default class Translations extends EventTarget {
  private readonly fallback: string;

  /** Sets of strings, in the order they were added */
  private readonly sources: LocaleSource[];

  /** Each locale's strings from every set loaded so far, merged in order */
  private readonly merged = new Map<string, Strings>();

  private current: string;

  /** The locale most recently asked for, so a slow load can't override a later choice */
  private requested?: string;

  constructor(options: TranslationsOptions = {}) {
    super();
    this.fallback = options.fallback ?? FALLBACK_LOCALE;
    const builtIn = new LocaleSource(options.locales ?? BUILT_IN_LOCALES);
    builtIn.strings.set(this.fallback, options.fallbackStrings ?? enUS);
    this.sources = [builtIn];
    this.merge(this.fallback);
    this.current = this.fallback;
  }

  /** The locale in use (an IETF BCP 47 tag, e.g. `ja`) */
  get locale(): string {
    return this.current;
  }

  /** Locales that can be used: the fallback, and every locale a set of strings can load */
  get locales(): string[] {
    return [
      ...new Set([
        this.fallback,
        ...this.sources.flatMap((source) => Object.keys(source.loaders)),
      ]),
    ];
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
   * Switch to a locale (the best available match for the tag), loading its strings from every set if needed.
   * Dispatches `change` once they're ready. If loading fails, the current locale stays and this rejects.
   *
   * @example
   * await translations.setLocale("zh-TW"); // uses zh-Hant
   */
  async setLocale(tag: string): Promise<void> {
    const locale = matchLocale([tag], this.locales, this.fallback);
    this.requested = locale;
    await this.load(locale);
    // A later call chose another locale while this one loaded
    if (this.requested !== locale) return;
    this.current = locale;
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Add a set of strings for some locales, loaded when first used, after the sets already added (so its keys replace
   * theirs). Its locales become available. The locale in use and the fallback load straight away, then `change` is
   * dispatched if the set has strings for either.
   *
   * @example
   * await translations.addLocales({
   *   "en-US": () => import("./locales/en-US.json"),
   *   fr: () => import("./locales/fr.json"),
   * });
   * translations.t("liveCanvas.share");
   */
  async addLocales(loaders: Record<string, LocaleLoader>): Promise<void> {
    this.sources.push(new LocaleSource(loaders));
    const locales = [...new Set([this.current, this.fallback])];
    await Promise.all(locales.map((locale) => this.load(locale)));
    if (locales.some((locale) => Object.hasOwn(loaders, locale)))
      this.dispatchEvent(new Event("change"));
  }

  /**
   * Add or replace strings for a locale (e.g. the implementer's own wording or extra keys), after the sets already
   * added. Dispatches `change` if it's the locale in use or the fallback.
   *
   * @example
   * translations.addStrings("en-US", { "paintCanvas.tool.brush": "Paintbrush" });
   */
  addStrings(locale: string, strings: Strings): void {
    const source = new LocaleSource();
    source.strings.set(locale, strings);
    this.sources.push(source);
    this.merge(locale);
    if (locale === this.current || locale === this.fallback)
      this.dispatchEvent(new Event("change"));
  }

  /**
   * Load a locale's strings from every set, including sets added while loading, then merge them.
   */
  private async load(locale: string): Promise<void> {
    let count: number;
    do {
      count = this.sources.length;
      await Promise.all(this.sources.map((source) => source.load(locale)));
    } while (count !== this.sources.length);
    this.merge(locale);
  }

  /**
   * Merge a locale's strings loaded so far from every set, in the order the sets were added.
   */
  private merge(locale: string): void {
    this.merged.set(
      locale,
      Object.assign(
        {},
        ...this.sources.map((source) => source.strings.get(locale)),
      ) as Strings,
    );
  }

  /**
   * Translate a key, putting values into its `{name}` placeholders. With a numeric `count`, the key's plural form for
   * the locale is used when there is one (e.g. `paintCanvas.presets.imported.one` and
   * `paintCanvas.presets.imported.other`). Falls back to the fallback locale, then the key.
   *
   * @example
   * translations.t("paintCanvas.presets.imported", { count: 3 }); // "Imported 3 brush presets"
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
      const strings = this.merged.get(locale);
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
