import Layer, {
  createOffscreenCanvas,
  type CanvasFactory,
  type LayerConfig,
} from "../Layer";
import History, { type HistoryEntry } from "../History";
import type { Rect } from "../Viewport";
import { contentBounds, copyArea } from "../../transform/Transformer";
import { moveItem } from "../../utils/array";

/** Most layers a stack can have unless another limit is given */
export const DEFAULT_MAX_LAYERS = 5;

/**
 * Manages one user's ordered list of layers. Index 0 is the top-most layer.
 *
 * Dispatches a `change` event whenever layers or the active layer change.
 *
 * The user's actions are recorded in `history` so they can be undone: creating, duplicating, deleting and moving layers,
 * changing a layer's blend mode or opacity, and changes to image data (only the changed area).
 *
 * @example
 * const stack = new LayerStack(2000, 2000);
 * stack.create(); // "Layer 2", placed above and selected
 * stack.addEventListener("change", render);
 */
export default class LayerStack extends EventTarget {
  /** Canvas width in pixels */
  readonly width: number;

  /** Canvas height in pixels */
  readonly height: number;

  /** The user's undoable actions on these layers */
  readonly history = new History();

  private items: Layer[] = [];

  private activeId: string;

  private createdCount = 0;

  /** The layer the change being announced is about, when only its pixels changed (see `changedLayerId`) */
  private onlyChanged?: string;

  private readonly createCanvas: CanvasFactory;

  /** Most layers the stack can have */
  readonly maxLayers: number;

  constructor(
    width: number,
    height: number,
    createCanvas: CanvasFactory = createOffscreenCanvas,
    maxLayers: number = DEFAULT_MAX_LAYERS,
  ) {
    super();
    this.width = width;
    this.height = height;
    this.createCanvas = createCanvas;
    this.maxLayers = maxLayers;
    const first = this.newLayer(this.nextDefaultName());
    this.items = [first];
    this.activeId = first.id;
  }

  /** Layers from top to bottom */
  get layers(): readonly Layer[] {
    return this.items;
  }

  /** The selected layer that drawing applies to */
  get active(): Layer {
    return this.get(this.activeId);
  }

  /** Whether another layer can be created */
  get canCreate(): boolean {
    return this.items.length < this.maxLayers;
  }

  /**
   * Get a layer by ID. Throws if not found.
   */
  get(id: string): Layer {
    const layer = this.items.find((l) => l.id === id);
    if (!layer) throw new Error(`Layer ${id} not found`);
    return layer;
  }

  /**
   * Get a layer's index (0 = top). Throws if not found.
   */
  indexOf(id: string): number {
    return this.items.indexOf(this.get(id));
  }

  /**
   * Select a layer.
   */
  select(id: string): void {
    this.activeId = this.get(id).id;
    this.notify();
  }

  /**
   * Create an empty layer above the active layer and select it.
   */
  create(): Layer {
    this.assertCanCreate();
    const layer = this.newLayer(this.nextDefaultName());
    this.insertAboveActive(layer);
    return layer;
  }

  /**
   * Duplicate a layer (settings and image data) above the active layer and select it.
   */
  duplicate(id: string): Layer {
    this.assertCanCreate();
    const source = this.get(id);
    const { name, blendMode, opacity, visible, alphaLock } = source.toConfig();
    const layer = new Layer(
      { name: `${name} copy`, blendMode, opacity, visible, alphaLock },
      this.width,
      this.height,
      this.createCanvas,
    );
    layer.copyImageFrom(source);
    const previousId = this.activeId;
    this.activeId = source.id;
    this.insertAboveActive(layer, previousId);
    return layer;
  }

  /**
   * Replace all layers with new, empty ones (e.g. to restore a saved drawing into), top first, and select the top one.
   * Returns the new layers.
   *
   * @example
   * const [top, bottom] = stack.replace([{ name: "Sketch" }, { name: "Background", opacity: 0.5 }]);
   */
  replace(configs: readonly LayerConfig[]): readonly Layer[] {
    if (configs.length === 0) throw new Error("Cannot have no layers");
    if (configs.length > this.maxLayers)
      throw new Error(`Cannot have more than ${this.maxLayers} layers`);
    this.items = configs.map(
      (config) => new Layer(config, this.width, this.height, this.createCanvas),
    );
    this.activeId = (this.items[0] as Layer).id;
    this.createdCount = this.items.length;
    this.history.clear();
    this.notify();
    return this.items;
  }

  /**
   * While a `change` event is being dispatched: the layer it's about, when only that layer's image data changed (from
   * `markChanged`, e.g. a brush stroke); undefined when anything may have changed.
   */
  get changedLayerId(): string | undefined {
    return this.onlyChanged;
  }

  /**
   * Tell listeners a layer's image data changed (e.g. after a brush stroke), so thumbnails and the map redraw.
   */
  markChanged(id: string): void {
    this.get(id);
    this.onlyChanged = id;
    try {
      this.notify();
    } finally {
      this.onlyChanged = undefined;
    }
  }

  /**
   * Remove all image data from a layer, as one undoable action.
   */
  clear(id: string): void {
    const layer = this.get(id);
    const { data } = layer.context.getImageData(0, 0, this.width, this.height);
    const area = contentBounds(data, this.width, this.height);
    if (area) this.recordImage(id, area);
    layer.clear();
    this.notify();
  }

  /**
   * Record a layer's image data in an area just before it changes, so the change can be undone. Pass `before` when the
   * layer has already changed (a copy of the area's image data from before the change, the size of the area).
   *
   * @example
   * stack.recordImage(layer.id, { x: 10, y: 10, width: 50, height: 20 });
   * layer.context.fillRect(10, 10, 50, 20);
   * stack.markChanged(layer.id);
   */
  recordImage(id: string, area: Rect, before?: OffscreenCanvas): void {
    if (!this.history.recording) return;
    const pixels =
      before ?? copyArea(this.createCanvas, this.get(id).canvas, area);
    this.history.push(this.imageEntry(id, area, pixels));
  }

  /**
   * Change a layer's image data within an area as one undoable action, then tell listeners.
   *
   * @example
   * stack.changeImage(layer.id, area, (ctx) => ctx.clearRect(area.x, area.y, area.width, area.height));
   */
  changeImage(
    id: string,
    area: Rect,
    change: (ctx: OffscreenCanvasRenderingContext2D) => void,
  ): void {
    this.recordImage(id, area);
    change(this.get(id).context);
    this.notify();
  }

  /**
   * Whether a layer can be merged into the layer under it: there is one, and both are visible.
   */
  canMergeDown(id: string): boolean {
    const below = this.items[this.indexOf(id) + 1];
    return below !== undefined && this.get(id).visible && below.visible;
  }

  /**
   * Merge a layer into the layer under it as one undoable action, making the two one layer: its pixels are drawn onto
   * the layer under it as they look (with its opacity and blend mode, whatever the alpha lock), and it is deleted. The
   * merged layer keeps the lower layer's name and settings, and is selected. Does nothing unless `canMergeDown`.
   *
   * @example
   * stack.mergeDown(stack.active.id);
   */
  mergeDown(id: string): void {
    if (!this.canMergeDown(id)) return;
    const layer = this.get(id);
    const index = this.indexOf(id);
    const below = this.items[index + 1] as Layer;
    const { data } = layer.context.getImageData(0, 0, this.width, this.height);
    // Only the area the layer has pixels in changes
    const area = contentBounds(data, this.width, this.height);
    const before = area && copyArea(this.createCanvas, below.canvas, area);
    const merge = () => {
      if (area) {
        const ctx = below.context;
        const { x, y, width, height } = area;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(layer.canvas, x, y, width, height, x, y, width, height);
        ctx.restore();
      }
      this.items = this.items.filter((l) => l !== layer);
      this.activeId = below.id;
      this.notify();
    };
    merge();
    this.history.push({
      undo: () => {
        if (area && before) {
          const ctx = below.context;
          ctx.clearRect(area.x, area.y, area.width, area.height);
          ctx.drawImage(before, area.x, area.y);
        }
        this.insertAt(layer, index);
      },
      redo: merge,
    });
  }

  /**
   * Delete a layer. The last remaining layer cannot be deleted. If the active layer is deleted, the layer below it (or above, if it was the bottom) is selected.
   */
  remove(id: string): void {
    if (this.items.length === 1)
      throw new Error("Cannot delete the only layer");
    const layer = this.get(id);
    const index = this.indexOf(id);
    // The layer itself (with its image data) is kept, so undo can put it back
    this.history.push({
      undo: () => this.insertAt(layer, index),
      redo: () => this.remove(id),
    });
    this.items = this.items.filter((l) => l.id !== id);
    if (this.activeId === id) {
      this.activeId = (
        this.items[Math.min(index, this.items.length - 1)] as Layer
      ).id;
    }
    this.notify();
  }

  /**
   * Move a layer to a new index (0 = top). Layers in between shift to fill the gap.
   */
  move(id: string, toIndex: number): void {
    const fromIndex = this.indexOf(id);
    this.items = moveItem(this.items, fromIndex, toIndex);
    const movedTo = this.indexOf(id);
    if (movedTo !== fromIndex) {
      this.history.push({
        undo: () => this.moveAndSelect(id, fromIndex),
        redo: () => this.moveAndSelect(id, movedTo),
      });
    }
    this.notify();
  }

  /**
   * Move a layer up one place.
   */
  moveUp(id: string): void {
    this.move(id, this.indexOf(id) - 1);
  }

  /**
   * Move a layer down one place.
   */
  moveDown(id: string): void {
    this.move(id, this.indexOf(id) + 1);
  }

  /**
   * Move a layer to the top.
   */
  moveToTop(id: string): void {
    this.move(id, 0);
  }

  /**
   * Move a layer to the bottom.
   */
  moveToBottom(id: string): void {
    this.move(id, this.items.length - 1);
  }

  /**
   * Rename a layer.
   */
  rename(id: string, name: string): void {
    this.get(id).name = name;
    this.notify();
  }

  /**
   * Change a layer's settings (anything except ID and name). Changes to blend mode and opacity can be undone; visibility
   * and alpha lock cannot.
   */
  update(
    id: string,
    changes: Partial<
      Pick<Layer, "blendMode" | "opacity" | "visible" | "alphaLock">
    >,
  ): void {
    const layer = this.get(id);
    const before = { blendMode: layer.blendMode, opacity: layer.opacity };
    Object.assign(layer, changes);
    const after = { blendMode: layer.blendMode, opacity: layer.opacity };
    if (
      before.blendMode !== after.blendMode ||
      before.opacity !== after.opacity
    ) {
      const apply = (settings: typeof before) => {
        Object.assign(this.get(id), settings);
        this.select(id);
      };
      this.history.push({
        undo: () => apply(before),
        redo: () => apply(after),
      });
    }
    this.notify();
  }

  /**
   * Move a layer to an index and select it.
   */
  private moveAndSelect(id: string, index: number): void {
    this.items = moveItem(this.items, this.indexOf(id), index);
    this.select(id);
  }

  /**
   * An undoable change of image data: undo and redo both swap the stored pixels with the layer's, then select the layer.
   */
  private imageEntry(
    id: string,
    area: Rect,
    before: OffscreenCanvas,
  ): HistoryEntry {
    let stored = before;
    const swap = () => {
      const layer = this.get(id);
      const current = copyArea(this.createCanvas, layer.canvas, area);
      const ctx = layer.context;
      ctx.clearRect(area.x, area.y, area.width, area.height);
      ctx.drawImage(stored, area.x, area.y);
      stored = current;
      this.select(id);
    };
    return { undo: swap, redo: swap };
  }

  /**
   * Create a layer with the stack's size and canvas factory.
   */
  private newLayer(name: string): Layer {
    return new Layer({ name }, this.width, this.height, this.createCanvas);
  }

  /**
   * Get the next default layer name, e.g. "Layer 2".
   */
  private nextDefaultName(): string {
    this.createdCount += 1;
    return `Layer ${this.createdCount}`;
  }

  /**
   * Throw if the layer limit has been reached.
   */
  private assertCanCreate(): void {
    if (!this.canCreate)
      throw new Error(`Cannot have more than ${this.maxLayers} layers`);
  }

  /**
   * Insert a layer directly above the active layer and select it, as one undoable action. Undo selects `previousId`.
   */
  private insertAboveActive(layer: Layer, previousId = this.activeId): void {
    const index = this.indexOf(this.activeId);
    this.insertAt(layer, index);
    this.history.push({
      undo: () => {
        this.remove(layer.id);
        this.select(previousId);
      },
      redo: () => this.insertAt(layer, index),
    });
  }

  /**
   * Insert a layer at an index (0 = top) and select it.
   */
  private insertAt(layer: Layer, index: number): void {
    this.items = [
      ...this.items.slice(0, index),
      layer,
      ...this.items.slice(index),
    ];
    this.activeId = layer.id;
    this.notify();
  }

  /**
   * Dispatch a `change` event.
   */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
