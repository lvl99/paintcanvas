/** The themes: light, dark, or following the device's (system) */
export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/** Longest locale tag kept in UI settings (characters) */
export const MAX_LOCALE_LENGTH = 35;

/** A locale tag's characters: letters, digits and hyphens (e.g. `zh-Hant`) */
export const LOCALE_PATTERN = "^[A-Za-z0-9-]+$";

/**
 * Whether a value is one of the themes.
 *
 * @example
 * isTheme("dark"); // true
 * isTheme(undefined); // false
 */
export const isTheme = (value: unknown): value is Theme =>
  THEMES.includes(value as Theme);

/**
 * Whether a value can be a locale tag (letters, digits and hyphens, at most `MAX_LOCALE_LENGTH` characters).
 *
 * @example
 * isLocaleTag("zh-Hant"); // true
 * isLocaleTag("<script>"); // false
 */
export const isLocaleTag = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_LOCALE_LENGTH &&
  new RegExp(LOCALE_PATTERN).test(value);

/** The user's interface choices */
export interface UiSettingsData {
  /** The theme (`system` by default) */
  theme: Theme;
  /** The language's locale tag, e.g. `fr`, or undefined to follow the device's languages */
  locale?: string;
}

/** UI settings the UI can show and change: PaintCanvas's `UiSettings`, or anything with the same data and `update` */
export interface UiSettingsLike extends EventTarget {
  readonly data: Readonly<UiSettingsData>;
  update(changes: Partial<UiSettingsData>): void;
}

/**
 * Keep only valid UI settings from an untrusted value (e.g. stored or imported), using `defaults` for anything missing
 * or invalid. Other properties are left out.
 *
 * @example
 * sanitiseUiSettings({ theme: "dark", locale: 42 }, { theme: "system" }); // { theme: "dark" }
 */
export const sanitiseUiSettings = (
  input: unknown,
  defaults: UiSettingsData,
): UiSettingsData => {
  const value = (
    typeof input === "object" && input !== null ? input : {}
  ) as Record<string, unknown>;
  const theme = isTheme(value.theme) ? value.theme : defaults.theme;
  const locale = isLocaleTag(value.locale) ? value.locale : defaults.locale;
  return locale === undefined ? { theme } : { theme, locale };
};

/**
 * The user's interface choices: the theme and the language. Kept in memory; the implementer saves and restores them
 * with the other app settings (see `SettingsAutosave`), and the UI shows and applies them (e.g. `<pc-theme-picker>` and
 * `<pc-input-settings>`).
 *
 * Dispatches a `change` event when a setting changes.
 *
 * @example
 * const ui = new UiSettings();
 * ui.update({ theme: "dark", locale: "fr" });
 * ui.data.theme; // "dark"
 */
export default class UiSettings extends EventTarget {
  private values: UiSettingsData;

  constructor(initial?: unknown) {
    super();
    this.values = sanitiseUiSettings(initial, { theme: "system" });
  }

  /** Current settings (read-only copy) */
  get data(): Readonly<UiSettingsData> {
    return this.values;
  }

  /**
   * Change some settings and dispatch `change` if anything changed. Invalid values and other properties are ignored.
   *
   * @example
   * ui.update({ locale: "ja" });
   */
  update(changes: Partial<UiSettingsData>): void {
    const next = sanitiseUiSettings(
      { ...this.values, ...changes },
      this.values,
    );
    if (next.theme === this.values.theme && next.locale === this.values.locale)
      return;
    this.values = next;
    this.dispatchEvent(new Event("change"));
  }
}
