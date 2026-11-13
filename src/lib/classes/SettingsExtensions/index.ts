/** Keys of app settings PaintCanvas uses (and those of settings files), which extensions can't use */
export const RESERVED_SETTINGS_KEYS: readonly string[] = [
  "$schema",
  "@type",
  "input",
  "shortcuts",
  "palette",
  "palettes",
  "colours",
  "profiles",
  "brushes",
  "ui",
  "updatedAt",
];

/**
 * Settings a wrapper app adds to PaintCanvas's app settings, under a key of its own (e.g. `livecanvas`). They're kept,
 * exported and imported with the app settings, wherever those are kept.
 *
 * @example
 * const extension: SettingsExtension<{ sound: boolean }> = {
 *   key: "livecanvas",
 *   validate: (value): value is { sound: boolean } => typeof (value as { sound?: unknown })?.sound === "boolean",
 *   collect: () => ({ sound: mySettings.sound }),
 *   apply: (value) => mySettings.update(value),
 *   target: mySettings, // dispatches `change`
 * };
 */
export interface SettingsExtension<T = unknown> {
  /** Key of its settings in the app settings (not one of `RESERVED_SETTINGS_KEYS`) */
  key: string;
  /** Whether a value (read from a store or a file, so untrusted) is valid settings for it */
  validate(value: unknown): value is T;
  /** Its current settings (JSON-friendly) */
  collect(): T;
  /** Use settings read from a store or a file */
  apply(value: T): void;
  /** Dispatches `change` when its settings change, so they're saved */
  target?: EventTarget;
}

/**
 * The settings extensions of a canvas (see `SettingsExtension`). Settings read for an extension that isn't added yet are
 * kept, so they're used when it's added and aren't lost when the settings are saved meanwhile.
 *
 * Dispatches `change` when an extension's settings change, or one is added or removed.
 *
 * @example
 * canvas.settingsExtensions.add(liveCanvasSettings);
 */
export default class SettingsExtensions extends EventTarget {
  private readonly extensions = new Map<string, SettingsExtension>();

  /** Settings read for extensions not added yet, by key */
  private readonly pending = new Map<string, unknown>();

  private readonly onChange = () => this.notify();

  /** The extensions added, in order */
  get items(): readonly SettingsExtension[] {
    return [...this.extensions.values()];
  }

  /**
   * Add an extension, using settings already read for it if they're valid. Throws if its key is PaintCanvas's or
   * another extension's.
   */
  add<T>(extension: SettingsExtension<T>): void {
    const { key } = extension;
    if (RESERVED_SETTINGS_KEYS.includes(key) || this.extensions.has(key))
      throw new Error(`Settings key "${key}" is already used`);
    this.extensions.set(key, extension as SettingsExtension);
    if (this.pending.has(key)) {
      const value = this.pending.get(key);
      this.pending.delete(key);
      if (extension.validate(value)) extension.apply(value);
    }
    extension.target?.addEventListener("change", this.onChange);
    this.notify();
  }

  /**
   * Remove an extension by key. Returns whether it was there.
   */
  remove(key: string): boolean {
    const extension = this.extensions.get(key);
    if (!extension) return false;
    extension.target?.removeEventListener("change", this.onChange);
    this.extensions.delete(key);
    this.notify();
    return true;
  }

  /**
   * Every extension's settings, by key, with settings kept for extensions not added yet.
   *
   * @example
   * canvas.settingsExtensions.collect(); // { livecanvas: { sound: true } }
   */
  collect(): Record<string, unknown> {
    const parts: Record<string, unknown> = Object.fromEntries(this.pending);
    for (const [key, extension] of this.extensions)
      parts[key] = extension.collect();
    return parts;
  }

  /**
   * Use the parts of app settings that aren't PaintCanvas's: each extension's, if valid; ones for extensions not added
   * yet are kept for them.
   */
  apply(settings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (RESERVED_SETTINGS_KEYS.includes(key) || value === undefined) continue;
      const extension = this.extensions.get(key);
      if (!extension) this.pending.set(key, value);
      else if (extension.validate(value)) extension.apply(value);
    }
  }

  /** Tell listeners something changed */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
