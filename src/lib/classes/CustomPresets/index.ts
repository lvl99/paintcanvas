import type { BrushPreset } from "../../brushes/types";
import { isOwnAuthor } from "../../brushes/authors";
import {
  BRUSH_PRESET_TYPE,
  UNTITLED_PRESET_NAME,
  isValidBrushPreset,
} from "../../presets";
import {
  UNKNOWN_AUTHOR,
  upgradeAsset,
  type AssetAuthor,
} from "../../assets/schema";
import type { AssetStoreLike } from "../../storage";

/** Whether a value is a plain object */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Keep only valid brush presets from an untrusted value (e.g. stored or imported), upgrading ones of version 1 (see
 * `upgradeAsset`).
 *
 * @param author - the author of presets of version 1 with none
 * @example
 * sanitiseBrushPresets(await store.list(), app.author);
 */
export const sanitiseBrushPresets = (
  input: readonly unknown[],
  author: AssetAuthor = UNKNOWN_AUTHOR,
): BrushPreset[] =>
  input
    .map((preset) =>
      upgradeAsset(preset, BRUSH_PRESET_TYPE, {
        name: UNTITLED_PRESET_NAME,
        author,
      }),
    )
    .filter(
      (preset): preset is BrushPreset => isValidBrushPreset(preset).valid,
    );

/**
 * The user's own and imported brush presets, shared by the brush and eraser. They are kept in a store when one is
 * used (otherwise only until the page closes).
 *
 * Dispatches a `change` event when presets are loaded, saved or removed.
 *
 * @example
 * const custom = new CustomPresets(new IndexedDbAssetStore("brushes"));
 * await custom.load();
 * await custom.save({ "@type": BRUSH_PRESET_TYPE, id: crypto.randomUUID(), name: "My brush",
 *   author: { name: "Ada", handle }, content: { width: 10 } });
 */
export default class CustomPresets extends EventTarget {
  /** Presets, in the order they were added */
  presets: BrushPreset[] = [];

  private store?: AssetStoreLike<BrushPreset>;

  /** Gives the author of presets of version 1 with none (the user, asked each time they're loaded) */
  private readonly author: () => AssetAuthor;

  /**
   * @param store - where the presets are kept
   * @param author - gives the author of presets of version 1 with none (default `UNKNOWN_AUTHOR`)
   */
  constructor(
    store?: AssetStoreLike<BrushPreset>,
    author: () => AssetAuthor = () => UNKNOWN_AUTHOR,
  ) {
    super();
    this.store = store;
    this.author = author;
  }

  /**
   * Keep the presets in another store (or in memory only, without one), loading the presets saved there in place of
   * the current ones.
   *
   * @example
   * await custom.useStore(new IndexedDbAssetStore("brushes", "my-app"));
   */
  async useStore(
    store: AssetStoreLike<BrushPreset> | undefined,
  ): Promise<void> {
    this.store = store;
    this.presets = [];
    this.notify();
    await this.load();
  }

  /**
   * Load the user's presets from the store, upgrading ones of version 1 (and saving them again) and leaving out invalid
   * ones.
   */
  async load(): Promise<void> {
    const store = this.store;
    if (!store) return;
    const saved = await store.list();
    // The store changed while loading
    if (store !== this.store) return;
    this.presets = sanitiseBrushPresets(saved, this.author());
    this.notify();
    // Presets of version 1 are saved again, upgraded, so they're only upgraded once
    if (saved.some((preset) => isRecord(preset) && !("content" in preset)))
      for (const preset of this.presets) await store.put(preset);
  }

  /**
   * A preset by ID.
   */
  get(id: string): BrushPreset | undefined {
    return this.presets.find((preset) => preset.id === id);
  }

  /**
   * One of the user's own presets with a name (ignoring case), to ask before replacing it.
   *
   * @param handle - the user's handle (empty if they have none)
   * @param unknownName - the author name of presets made by a user without a handle (see `isOwnAuthor`)
   */
  findOwn(
    name: string,
    handle: string,
    unknownName?: string,
  ): BrushPreset | undefined {
    const wanted = name.trim().toLowerCase();
    return this.presets.find(
      (preset) =>
        isOwnAuthor(preset.author, handle, unknownName) &&
        preset.name.trim().toLowerCase() === wanted,
    );
  }

  /**
   * Add presets, replacing any with the same ID, and keep them.
   */
  async save(...presets: BrushPreset[]): Promise<void> {
    for (const preset of presets) await this.store?.put(preset);
    const kept = this.presets.map(
      (existing) =>
        presets.find((preset) => preset.id === existing.id) ?? existing,
    );
    const added = presets.filter(
      (preset) => !this.presets.some((existing) => existing.id === preset.id),
    );
    this.presets = [...kept, ...added];
    if (presets.length > 0) this.notify();
  }

  /**
   * Delete a preset.
   */
  async remove(id: string): Promise<void> {
    await this.store?.remove(id);
    this.presets = this.presets.filter((preset) => preset.id !== id);
    this.notify();
  }

  /** Dispatch a `change` event */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
