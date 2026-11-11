import type { BrushConfig } from "../../brushes/types";
import { isOwnAuthor } from "../../brushes/authors";
import { isValidBrushPreset } from "../../presets";
import type { AssetStoreLike } from "../../storage";

/**
 * The user's own and imported brush presets, shared by the brush and eraser. They are kept in a store when one is
 * used (otherwise only until the page closes).
 *
 * Dispatches a `change` event when presets are loaded, saved or removed.
 *
 * @example
 * const custom = new CustomPresets(new IndexedDbAssetStore("brushes"));
 * await custom.load();
 * await custom.save({ id: crypto.randomUUID(), name: "My brush", author: { name: "Ada", handle } });
 */
export default class CustomPresets extends EventTarget {
  /** Presets, in the order they were added */
  presets: BrushConfig[] = [];

  private store?: AssetStoreLike<BrushConfig>;

  constructor(store?: AssetStoreLike<BrushConfig>) {
    super();
    this.store = store;
  }

  /**
   * Keep the presets in another store (or in memory only, without one), loading the presets saved there in place of
   * the current ones.
   *
   * @example
   * await custom.useStore(new IndexedDbAssetStore("brushes", "my-app"));
   */
  async useStore(
    store: AssetStoreLike<BrushConfig> | undefined,
  ): Promise<void> {
    this.store = store;
    this.presets = [];
    this.notify();
    await this.load();
  }

  /**
   * Load the user's presets from the store, leaving out invalid ones.
   */
  async load(): Promise<void> {
    const store = this.store;
    if (!store) return;
    const saved = await store.list();
    // The store changed while loading
    if (store !== this.store) return;
    this.presets = saved.filter(
      (preset): preset is BrushConfig => isValidBrushPreset(preset).valid,
    );
    this.notify();
  }

  /**
   * A preset by ID.
   */
  get(id: string): BrushConfig | undefined {
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
  ): BrushConfig | undefined {
    const wanted = name.trim().toLowerCase();
    return this.presets.find(
      (preset) =>
        isOwnAuthor(preset.author, handle, unknownName) &&
        preset.name?.trim().toLowerCase() === wanted,
    );
  }

  /**
   * Add presets, replacing any with the same ID, and keep them.
   */
  async save(...presets: BrushConfig[]): Promise<void> {
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
