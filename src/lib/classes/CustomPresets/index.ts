import type { BrushConfig } from "../../brushes/types";
import { isOwnAuthor } from "../../brushes/authors";

/** Where custom presets are kept (see `PresetStore`) */
export interface PresetStoreLike {
  /** The owner's presets, in the order they were saved */
  list(ownerId: string): Promise<BrushConfig[]>;
  /** Save one of the owner's presets (replacing one with the same ID) */
  put(ownerId: string, preset: BrushConfig): Promise<void>;
  /** Delete one of the owner's presets */
  remove(ownerId: string, id: string): Promise<void>;
}

/**
 * The user's own and imported brush presets, shared by the brush and eraser. They are kept in a store when one is
 * given (otherwise only until the page closes).
 *
 * Dispatches a `change` event when presets are loaded, saved or removed.
 *
 * @example
 * const custom = new CustomPresets("user-1", myPresetStore);
 * await custom.load();
 * await custom.save({ id: crypto.randomUUID(), name: "My brush", author: { name: "Ada", handle } });
 */
export default class CustomPresets extends EventTarget {
  /** Presets, in the order they were added */
  presets: BrushConfig[] = [];

  private readonly ownerId: string;

  private readonly store?: PresetStoreLike;

  constructor(ownerId: string, store?: PresetStoreLike) {
    super();
    this.ownerId = ownerId;
    this.store = store;
  }

  /**
   * Load the user's presets from the store.
   */
  async load(): Promise<void> {
    if (!this.store) return;
    this.presets = await this.store.list(this.ownerId);
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
    for (const preset of presets) await this.store?.put(this.ownerId, preset);
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
    await this.store?.remove(this.ownerId, id);
    this.presets = this.presets.filter((preset) => preset.id !== id);
    this.notify();
  }

  /** Dispatch a `change` event */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
