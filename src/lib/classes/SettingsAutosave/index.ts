import type PaintCanvas from "../PaintCanvas";
import type { SettingsStoreLike } from "../../storage";
import {
  applySettings,
  collectSettings,
  isValidSettings,
} from "../../settings";

/** How long to wait after settings change before saving, so quick changes (e.g. dragging a colour slider) are saved together (milliseconds) */
export const SETTINGS_SAVE_DELAY_MS = 500;

/** Event dispatched when loading or saving settings fails (detail: the error) */
export const SETTINGS_AUTOSAVE_ERROR_EVENT = "error";

/** Options for `SettingsAutosave` */
export interface SettingsAutosaveOptions {
  /** How long to wait after settings change before saving (default `SETTINGS_SAVE_DELAY_MS`) */
  delayMs?: number;
}

/**
 * Keeps a canvas's app settings (input settings, keyboard shortcuts, colour palette, colours, profile graphs, theme and language) in a
 * store: the saved settings are restored when it starts (invalid ones are ignored), then changes are saved soon after
 * they happen.
 *
 * Dispatches an `error` event (with the error as `detail`) when loading or saving fails.
 *
 * @example
 * const autosave = new SettingsAutosave(canvas, new IndexedDbSettingsStore());
 * await autosave.ready;
 * autosave.stop(); // saves any pending change
 */
export default class SettingsAutosave extends EventTarget {
  /** Where the settings are kept */
  readonly store: SettingsStoreLike;

  /** Resolves once the saved settings are restored (or there were none) */
  readonly ready: Promise<void>;

  private readonly app: PaintCanvas;

  private readonly delayMs: number;

  private timer?: ReturnType<typeof setTimeout>;

  /** The settings last saved or restored, as JSON, to skip saving unchanged settings */
  private saved?: string;

  private stopped = false;

  // Settings changes, and the canvas's own changes (which include its colours)
  private readonly onChange = () => this.schedule();

  constructor(
    app: PaintCanvas,
    store: SettingsStoreLike,
    options: SettingsAutosaveOptions = {},
  ) {
    super();
    this.app = app;
    this.store = store;
    this.delayMs = options.delayMs ?? SETTINGS_SAVE_DELAY_MS;
    this.ready = this.start();
  }

  /** The canvas parts whose changes are saved */
  private get sources(): EventTarget[] {
    const { app } = this;
    return [app, app.input, app.shortcuts, app.palette, app.profiles, app.ui];
  }

  /**
   * Stop saving changes, saving any that are waiting.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const source of this.sources)
      source.removeEventListener("change", this.onChange);
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    void this.save();
  }

  /**
   * Save the settings now if they changed since they were last saved.
   */
  async save(): Promise<void> {
    this.timer = undefined;
    const settings = collectSettings(this.app);
    const json = JSON.stringify(settings);
    if (json === this.saved) return;
    this.saved = json;
    try {
      await this.store.save(settings);
    } catch (error) {
      this.saved = undefined;
      this.fail(error);
    }
  }

  /** Restore the saved settings, then listen for changes */
  private async start(): Promise<void> {
    try {
      const result = isValidSettings(await this.store.load());
      if (result.valid && !this.stopped) applySettings(this.app, result.value);
    } catch (error) {
      this.fail(error);
    }
    if (this.stopped) return;
    this.saved = JSON.stringify(collectSettings(this.app));
    for (const source of this.sources)
      source.addEventListener("change", this.onChange);
  }

  /** Save soon, after changes stop for a moment */
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), this.delayMs);
  }

  /** Tell listeners loading or saving failed */
  private fail(error: unknown): void {
    this.dispatchEvent(
      new CustomEvent(SETTINGS_AUTOSAVE_ERROR_EVENT, { detail: error }),
    );
  }
}
