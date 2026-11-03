import type {
  LayerStoreLike,
  SavedDrawing,
  SavedDrawingWithImages,
} from "../lib/storage";

/**
 * A layer store kept in memory, recording each save. Set `loadError` or `saveError` to make loading or saving fail.
 *
 * @example
 * const store = new MemoryLayerStore("test");
 * canvas.useLayerStore(store, { locks: null });
 */
export class MemoryLayerStore implements LayerStoreLike {
  readonly name: string;

  /** The saved drawing and its layer images, if any */
  saved?: SavedDrawingWithImages;

  /** Each save: the drawing and the images that changed */
  readonly saves: { drawing: SavedDrawing; images: Map<string, Blob> }[] = [];

  /** Thrown by `load` when set */
  loadError?: Error;

  /** Thrown by `save` when set */
  saveError?: Error;

  constructor(name = "test", saved?: SavedDrawingWithImages) {
    this.name = name;
    this.saved = saved;
  }

  async load(): Promise<SavedDrawingWithImages | undefined> {
    if (this.loadError) throw this.loadError;
    return this.saved;
  }

  async save(
    drawing: SavedDrawing,
    images: ReadonlyMap<string, Blob>,
  ): Promise<void> {
    if (this.saveError) throw this.saveError;
    this.saves.push({ drawing, images: new Map(images) });
    const kept = new Map(
      [...(this.saved?.images ?? []), ...images].filter(([id]) =>
        drawing.layers.some((layer) => layer.id === id),
      ),
    );
    this.saved = { drawing, images: kept };
  }

  async clear(): Promise<void> {
    this.saved = undefined;
  }
}
